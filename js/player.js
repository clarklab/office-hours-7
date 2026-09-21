/**
 * OFFICE HOURS VII — the player.
 *
 * Reads `?ep=epN`, shows a title card with a PLAY button, and on the click (which is
 * what lets WebAudio start at all) builds the stage, the office, the cast, the FF7
 * dialogue layer and the director, then hands the episode its context and runs it.
 *
 * Two contracts other agents depend on:
 *
 *   1. POSTER   `/watch.html?ep=epN&poster=1`
 *      Builds the scene, calls `ep.poster(ctx)`, lets it settle, stops the render loop
 *      on that frame and sets `window.__OH_POSTER_READY = true`. A screenshotter waits
 *      on that flag (or the `oh:poster-ready` event, or `<html data-oh-poster="ready">`).
 *      On failure `window.__OH_POSTER_ERROR` is set to a message string instead.
 *
 *   2. FAST-FORWARD   `window.__OH_FAST_FORWARD = 8`
 *      Set on `window` BEFORE play. A positive multiplier (1 = real time, capped at 64)
 *      read once when playback starts. `window.__OH_SPEED` is accepted as an alias.
 *      It scales the stage delta the director, set and cast are ticked with, and scales
 *      dialogue typing speed and holds to match. The player then sets
 *      `window.__OH_SPEED_HANDLED = true` before the episode starts, so a harness that
 *      would otherwise dilate rAF itself knows not to apply the speed-up twice.
 *
 * Also for the harness: `window.__OH_POSTER === true` selects poster mode without the
 * query string, `window.__OH_STATE` mirrors the player state, and `window.__OH_DONE`
 * goes true when an episode finishes.
 *
 * The heavy 3D modules are imported lazily so the title screen paints immediately and
 * an episode that has not been written yet never downloads three.js.
 *
 * @module player
 */

import {
  EPISODES,
  DEFAULT_EPISODE_ID,
  getEpisode,
  isViewerEpisodeId,
  nextEpisode,
  loadEpisode,
  runtimeSeconds,
} from '/js/episodes/index.js';
import { drawMark } from '/js/brand/logo.js';
import { paintPlate } from '/js/gallery.js';
import { initAudio, setMuted, isMuted } from '/js/core/audio.js';

/** The design space the dialogue layer is laid out in. Mirrors ps1.js. */
const VIRTUAL_W = 384;
const VIRTUAL_H = 216;

/** Player states. @enum {string} */
const S = {
  IDLE: 'idle',
  LOADING: 'loading',
  PLAYING: 'playing',
  ENDED: 'ended',
  ERROR: 'error',
  POSTER: 'poster',
};

/** ms of stillness before the on-stage controls fade out. */
const CHROME_HIDE_MS = 2600;

/* ------------------------------------------------------------------ *
 * small helpers
 * ------------------------------------------------------------------ */

/** @param {string} id @returns {HTMLElement|null} */
const $ = (id) => document.getElementById(id);

/** @param {number} s seconds @returns {string} `m:ss` */
function clock(s) {
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

/** Logs without ever throwing. @param {string} what @param {*} err */
function warn(what, err) {
  try { console.warn(`[player] ${what}`, err); } catch { /* ignore */ }
}

/** Runs `fn`, swallowing anything it throws. @param {Function} fn */
function attempt(fn) {
  try { return fn(); } catch (err) { warn('cleanup', err); return undefined; }
}

/** @returns {boolean} true when this browser can actually give us a WebGL2 context */
function hasWebGL2() {
  try {
    if (typeof WebGL2RenderingContext === 'undefined') return false;
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2');
    if (!gl) return false;
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    return true;
  } catch {
    return false;
  }
}

/**
 * The fast-forward multiplier the test harness may have set on `window`.
 * @returns {number} >= 1 in practice; 1 when unset or nonsense
 */
function fastForward() {
  const raw = typeof window.__OH_FAST_FORWARD !== 'undefined'
    ? window.__OH_FAST_FORWARD
    : window.__OH_SPEED;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(64, n);
}

/**
 * A stage view whose update bus runs `k` times faster. Everything the director, the
 * set and the cast tick through gets the scaled delta; the renderer is untouched.
 *
 * @param {import('/js/core/engine.js').Stage} stage
 * @param {number} k
 * @returns {import('/js/core/engine.js').Stage}
 */
function scaleStage(stage, getK) {
  const view = Object.create(stage);
  view.onUpdate = (fn) => {
    // Stage time is accumulated per subscriber rather than scaling the stage's
    // own clock, because the rate can change mid-episode: multiplying the
    // running total by the new rate would make `t` jump backwards or forwards
    // the moment somebody touches the speed control.
    let st = 0;
    return stage.onUpdate((dt, _t) => {
      const sdt = dt * getK();
      st += sdt;
      fn(sdt, st);
    });
  };
  return view;
}

/**
 * A dialogue view that types `k` times faster and holds `k` times shorter, so the
 * DOM layer (which runs on real time, not stage time) keeps up with a scaled stage.
 *
 * @param {Object} ui
 * @param {number} k
 * @returns {Object}
 */
function scaleUi(ui, getK) {
  if (!ui) return ui;
  /** @param {*} v @param {number} fallback */
  const ms = (v, fallback) => Math.max(1, Math.round((Number.isFinite(v) ? v : fallback) / getK()));
  const view = Object.create(ui);

  // `say` forwards the rate rather than rewriting cps/hold itself: dialogue.js
  // derives the hold from the line's length, and a fixed value substituted here
  // would flatten every line back to one duration.
  view.say = (o = {}) => ui.say(Object.assign({}, o, { speed: getK() }));
  view.title = (o = {}) => ui.title(Object.assign({}, o, { ms: ms(o.ms, 2200) }));
  view.nameCard = (o = {}) => ui.nameCard(Object.assign({}, o, { ms: ms(o.ms, 2000) }));
  view.toast = (text, t) => ui.toast(text, ms(t, 1600));
  view.encounter = (text, o = {}) => ui.encounter(text, Object.assign({}, o, { ms: ms(o.ms, 1400) }));
  view.menu = (o = {}) => ui.menu(Object.assign({}, o, {
    auto: Number.isFinite(o.auto) && o.auto > 0 ? ms(o.auto, o.auto) : o.auto,
  }));
  return view;
}

/**
 * Adapts the office set's flat `BOUNDS` into the `{min:{x,y,z}, max:{x,y,z}}` box the
 * director keeps generated camera positions inside. Returns undefined for anything it
 * does not recognise, which just leaves the director on its own defaults.
 *
 * @param {Object|undefined} b
 * @returns {{min:{x:number,y:number,z:number}, max:{x:number,y:number,z:number}}|undefined}
 */
function toDirectorBounds(b) {
  if (!b || typeof b !== 'object') return undefined;
  if (b.min && b.max) return /** @type {*} */ (b);
  if (typeof b.minX !== 'number' || typeof b.maxX !== 'number') return undefined;
  return {
    min: { x: b.minX, y: typeof b.floor === 'number' ? b.floor : 0.25, z: b.minZ },
    max: { x: b.maxX, y: typeof b.ceil === 'number' ? b.ceil : 2.75, z: b.maxZ },
  };
}

/**
 * Draws the logo mark into the watch-page header lockup and the favicon.
 * Never the wordmark: on this page the mark alone carries the brand.
 */
function installBrand() {
  const slot = $('marklink');
  if (slot && !slot.firstElementChild) {
    const w = 66;
    const h = 50;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const c = document.createElement('canvas');
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    c.style.width = `${w}px`;
    c.style.height = `${h}px`;
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
      drawMark(ctx, w, h, { seed: 7 });
      slot.appendChild(c);
    }
  }

  try {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#05070c';
    ctx.fillRect(0, 0, 64, 64);
    ctx.translate(0, 4);
    drawMark(ctx, 64, 56, { seed: 7 });
    const link = document.querySelector('link[rel="icon"]') || document.createElement('link');
    link.setAttribute('rel', 'icon');
    link.setAttribute('type', 'image/png');
    link.setAttribute('href', c.toDataURL('image/png'));
    if (!link.parentNode) document.head.appendChild(link);
  } catch {
    /* the static /assets/mark.png stays in place */
  }
}

/* ------------------------------------------------------------------ *
 * the player
 * ------------------------------------------------------------------ */

/**
 * Boots the player into the current page. Idempotent per page load.
 * @returns {{ teardown: () => void }}
 */
export function initPlayer() {
  const params = new URLSearchParams(location.search);
  const rawId = (params.get('ep') || '').trim();
  const brandMode = params.get('brand') === '1';
  const posterMode = params.get('poster') === '1'
    || params.get('poster') === 'true'
    || window.__OH_POSTER === true;
  const viewerId = isViewerEpisodeId(rawId) ? rawId : null;
  /**
   * A viewer episode's real title lives in Blobs and has to be fetched, but
   * everything downstream reads `meta` synchronously during init. So a viewer
   * id gets a placeholder immediately and the fetched spec fills in the blanks
   * before playback — rather than making the whole player async for the sake of
   * one label.
   */
  const meta = viewerId
    ? {
      id: viewerId,
      number: null,
      ordinal: 'BY A VIEWER',
      numeral: '\u2605',
      title: 'Loading\u2026',
      logline: 'An episode somebody asked for.',
      runtime: '2:00',
      accent: '#8aa0d8',
      starring: [],
      viewer: true,
    }
    : getEpisode(rawId || DEFAULT_EPISODE_ID);

  const frame = $('frame');
  const stageEl = $('stage');
  const canvas = /** @type {HTMLCanvasElement} */ ($('scene'));
  const uiHost = $('ui');
  const chrome = $('chrome');
  const barFill = $('bar-fill');
  const timeEl = $('c-time');
  const statusEl = $('status');
  const plateEl = /** @type {HTMLCanvasElement|null} */ ($('idle-plate'));

  const ovl = {
    idle: $('ovl-idle'),
    load: $('ovl-load'),
    error: $('ovl-error'),
    end: $('ovl-end'),
  };

  /* --------------------------------------------------------- runtime state */

  /** @type {string} */
  let state = S.IDLE;

  /**
   * Screen Wake Lock, held only while an episode is actually playing.
   *
   * Declared HERE, above `setState`, and not further down with the rest of the
   * wake-lock code: `setState(S.IDLE)` runs during module evaluation a few lines
   * below and calls `syncWakeLock()`, which reads these. A `let` declared later
   * in the same scope would still be in its temporal dead zone at that point and
   * would throw. That exact mistake already shipped once here, on the speed
   * control, and made the control silently inert.
   *
   * @type {{release:() => Promise<void>}|null}
   */
  let wakeLock = null;
  /** Guards against two overlapping requests producing two locks. */
  let wakeLockPending = false;

  /** Sets the player state and mirrors it onto `window.__OH_STATE` for the harness. */
  const setState = (next) => {
    state = next;
    window.__OH_STATE = next;
    syncWakeLock();
  };
  setState(S.IDLE);
  /** @type {import('/js/core/engine.js').Stage|null} */
  let stage = null;
  /** @type {Object|null} */
  let ui = null;
  /** @type {Object|null} */
  let director = null;
  /** @type {Array<() => void>} */
  let unsubs = [];
  /** Guards async continuations against a teardown that happened meanwhile. */
  let token = 0;
  let speed = 1;
  /**
   * User-chosen reading rate, live. Combined with the harness speed-up below.
   * Seeded from storage at wiring time rather than here — `SPEEDS` and
   * `loadSpeed()` are declared further down this same scope, so reading them
   * during this initialiser hits the temporal dead zone and throws.
   */
  let userSpeed = 1;
  /** The rate everything scales by, read live so the control takes effect mid-line. */
  const rate = () => speed * userSpeed;
  let hideTimer = 0;
  /** Double-tap bookkeeping for the frame: when and where the last tap landed. */
  let lastTapAt = 0;
  let lastTapX = 0;
  let lastTapY = 0;
  let progressRaf = 0;
  let elapsedMs = 0;
  let finished = false;

  /* ------------------------------------------------------------ chrome/UI */

  /** @param {string} text */
  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  /** @param {'idle'|'load'|'error'|'end'|null} which */
  function showOverlay(which) {
    for (const key of Object.keys(ovl)) {
      const node = ovl[key];
      if (node) node.hidden = key !== which;
    }
    // The poster sits behind the title and end cards, never behind the live scene.
    const wantPlate = which === 'idle' || which === 'end';
    frame?.setAttribute('data-card', wantPlate ? 'on' : 'off');
    if (wantPlate) paintIdlePlate();
  }

  /** Redraws the title-card poster at the frame's current size. */
  function paintIdlePlate() {
    if (!plateEl || !meta || !frame) return;
    const w = frame.clientWidth;
    const h = frame.clientHeight;
    if (w < 8 || h < 8) return;
    try { paintPlate(plateEl, meta, { width: w, height: h }); } catch (err) { warn('plate', err); }
  }

  /** @param {string} text */
  function note(text) {
    const n = $('load-note');
    if (n) n.textContent = text;
  }

  /** @param {string} title @param {string} body */
  function fail(title, body) {
    setState(S.ERROR);
    const t = $('err-title');
    const b = $('err-body');
    if (t) t.textContent = title;
    if (b) b.textContent = body;
    showOverlay('error');
    if (chrome) chrome.hidden = true;
    frame?.classList.remove('playing');
    setStatus(`${title}. ${body}`);
  }

  function showChrome() {
    if (!frame || state !== S.PLAYING) return;
    frame.setAttribute('data-chrome', 'shown');
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      if (state !== S.PLAYING) return;
      // Never yank the controls out from under a pointer or the keyboard focus.
      if (chrome && (chrome.matches(':hover') || chrome.contains(document.activeElement))) {
        showChrome();
        return;
      }
      frame.setAttribute('data-chrome', 'hidden');
    }, CHROME_HIDE_MS);
  }

  /* ----------------------------------------------------------- the layout */

  /**
   * Fits a 16:9 frame into the stage area, then puts the canvas and the 384x216
   * dialogue layer on exactly the same rectangle so UI pixels land on scene pixels.
   */
  function layout() {
    if (!frame || !stageEl) return;

    // clientWidth includes padding, so take it off: the frame must fit the content box.
    const cs = getComputedStyle(stageEl);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const availW = Math.max(160, stageEl.clientWidth - padX);
    const availH = Math.max(90, stageEl.clientHeight - padY);

    let w = Math.floor(availW);
    let h = Math.round((w * VIRTUAL_H) / VIRTUAL_W);
    if (h > availH) {
      h = Math.floor(availH);
      w = Math.round((h * VIRTUAL_W) / VIRTUAL_H);
    }
    frame.style.width = `${w}px`;
    frame.style.height = `${h}px`;
    const sizeClass = h < 260 ? 'xs' : h < 380 ? 'sm' : 'md';
    frame.setAttribute('data-size', sizeClass);
    document.body.setAttribute('data-frame', sizeClass);
    if (frame.getAttribute('data-card') === 'on') paintIdlePlate();

    // The canvas and the UI layer live inside the frame's border, so centre them on
    // the frame's content box rather than its outer box.
    const innerW = frame.clientWidth || w;
    const innerH = frame.clientHeight || h;

    if (!stage) {
      if (uiHost) uiHost.style.transform = `scale(${innerW / VIRTUAL_W})`;
      return;
    }

    stage.resize(innerW, innerH);
    const dw = stage.displayWidth || innerW;
    const dh = stage.displayHeight || innerH;
    const left = Math.round((innerW - dw) / 2);
    const top = Math.round((innerH - dh) / 2);

    canvas.style.left = `${left}px`;
    canvas.style.top = `${top}px`;

    if (uiHost) {
      uiHost.style.left = `${left}px`;
      uiHost.style.top = `${top}px`;
      uiHost.style.transform = `scale(${dw / VIRTUAL_W})`;
    }
  }

  /* --------------------------------------------------------- the progress */

  function startProgress() {
    const total = runtimeSeconds(meta ? meta.runtime : '1:00') * 1000;
    elapsedMs = 0;
    let last = performance.now();

    const tick = (now) => {
      progressRaf = requestAnimationFrame(tick);
      const dt = Math.min(250, now - last);
      last = now;
      if (!finished) elapsedMs += dt * rate();
      const u = finished ? 1 : Math.min(0.985, elapsedMs / total);
      if (barFill) barFill.style.width = `${(u * 100).toFixed(2)}%`;
      if (timeEl) timeEl.textContent = `${clock((u * total) / 1000)} / ${clock(total / 1000)}`;
    };
    progressRaf = requestAnimationFrame(tick);
  }

  function stopProgress() {
    if (progressRaf) cancelAnimationFrame(progressRaf);
    progressRaf = 0;
  }

  /* ------------------------------------------------------------- teardown */

  /**
   * Cancels the running script and frees every GL resource. Safe to call at any time,
   * from any state, as many times as you like.
   */
  function teardown() {
    token++;
    finished = false;
    releaseWakeLock();
    stopProgress();
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = 0;

    if (director) attempt(() => director.cancel());
    if (director && typeof director.dispose === 'function') attempt(() => director.dispose());
    director = null;

    if (ui) attempt(() => ui.dispose());
    ui = null;

    for (const un of unsubs) attempt(un);
    unsubs = [];

    if (stage) {
      attempt(() => stage.stop());
      attempt(() => stage.dispose());
    }
    stage = null;

    if (uiHost) uiHost.textContent = '';
    frame?.classList.remove('playing');
    frame?.removeAttribute('data-chrome');
  }

  /* ---------------------------------------------------------- scene build */

  /**
   * Creates the stage, builds the office, spawns the cast, mounts the dialogue layer
   * and the director, and returns the episode context.
   *
   * The set and the cast are optional: if those modules are not in the repo yet the
   * build carries on with whatever is there, so a half-finished show still runs.
   *
   * @param {number} mine this call's teardown token
   * @returns {Promise<Object|null>} the episode ctx, or null if we were torn down
   */
  async function buildScene(mine) {
    note('Warming up the renderer');
    const [engine, THREE] = await Promise.all([
      import('/js/core/engine.js'),
      import('three'),
    ]);
    if (mine !== token) return null;

    stage = engine.createStage(canvas);
    layout();
    stage.start();

    const view = scaleStage(stage, rate);

    note('Building the office');
    /** @type {Object|null} */
    let office = null;
    /** @type {Object|undefined} */
    let bounds;
    try {
      const mod = await import('/js/sets/office.js');
      office = mod.createOffice();
      bounds = toDirectorBounds(mod.BOUNDS);
      if (office && office.group) stage.scene.add(office.group);
      if (office && typeof office.update === 'function') {
        unsubs.push(view.onUpdate((dt, t) => {
          try { office.update(dt, t); } catch (err) { warn('office.update', err); }
        }));
      }
    } catch (err) {
      warn('the office is not built yet', err);
    }
    if (mine !== token) return null;

    note('Hiring the cast');
    /** @type {Object<string, Object>} */
    let cast = {};
    try {
      const mod = await import('/js/characters/index.js');

      // The character builders live behind a dynamic import so the gallery can read
      // PROFILES without three. spawnAll() loads them and builds the whole cast.
      if (typeof mod.spawnAll === 'function') {
        cast = await mod.spawnAll();
      } else {
        if (typeof mod.loadCast === 'function') await mod.loadCast();
        for (const id of Object.keys(mod.CAST || mod.PROFILES || {})) {
          try {
            const actor = mod.spawn(id);
            if (actor) cast[id] = actor;
          } catch (err) {
            warn(`could not spawn ${id}`, err);
          }
        }
      }
      if (mine !== token) return null;

      for (const id of Object.keys(cast)) {
        const actor = cast[id];
        if (actor && actor.group) stage.scene.add(actor.group);
      }

      // Nothing in the rig is self-driving, so the player owns the tick.
      const tickCast = typeof mod.updateCast === 'function'
        ? (dt, t) => mod.updateCast(cast, dt, t)
        : (dt, t) => {
          for (const id of Object.keys(cast)) {
            const actor = cast[id];
            if (actor && typeof actor.update === 'function') actor.update(dt, t);
          }
        };
      unsubs.push(view.onUpdate((dt, t) => {
        try { tickCast(dt, t); } catch (err) { warn('cast.update', err); }
      }));
    } catch (err) {
      warn('the cast has not been hired yet', err);
    }
    if (mine !== token) return null;

    note('Cueing the dialogue');
    const dlg = await import('/js/core/dialogue.js');
    if (mine !== token) return null;
    ui = dlg.createDialogue(uiHost);
    const uiView = scaleUi(ui, rate);

    const dir = await import('/js/core/director.js');
    if (mine !== token) return null;
    director = dir.createDirector(view, uiView, {
      shots: office ? office.shots : undefined,
      marks: office ? office.marks : undefined,
      bounds,
      host: uiHost,
    });

    layout();
    return { stage: view, ui: uiView, d: director, office, cast, THREE };
  }

  /* -------------------------------------------------------------- playing */

  /**
   * The play gesture. `initAudio()` is called synchronously here, before any await,
   * because that is the only moment the browser will let an AudioContext start.
   */
  async function play() {
    if (state === S.LOADING || state === S.PLAYING) return;
    attempt(initAudio);
    syncMuteButton();

    teardown();
    const mine = token;

    speed = fastForward();
    // Claim the speed-up so a harness does not also dilate rAF and double it.
    window.__OH_SPEED_HANDLED = true;
    setState(S.LOADING);
    showOverlay('load');
    note('Loading episode');
    setStatus('Loading the episode.');

    if (!hasWebGL2()) {
      fail(
        'This browser cannot run the show',
        'The episodes are a live 3D scene and need WebGL2, which this browser or machine '
        + 'is not providing. Hardware acceleration being switched off is the usual cause.',
      );
      return;
    }

    /** @type {Object} */
    let ep;
    try {
      ep = await loadAnyEpisode();
    } catch (err) {
      warn('loadEpisode', err);
      if (meta.viewer) {
        // A viewer episode that will not load is missing or broken, not
        // unfilmed — and the placeholder title is still "Loading…" at this
        // point, so quoting it would produce a nonsense sentence.
        fail(
          'Episode not found',
          `${(err && err.message) || 'That episode could not be loaded.'} `
          + 'The three numbered episodes are always on the home page.',
        );
      } else {
        fail(
          'Not shot yet',
          `Episode ${meta.number}, ${meta.title} has not been filmed. `
          + 'The other episodes may already be up — try the gallery.',
        );
      }
      return;
    }
    if (mine !== token) return;

    /** @type {Object|null} */
    let ctx = null;
    try {
      ctx = await buildScene(mine);
    } catch (err) {
      warn('buildScene', err);
      teardown();
      fail(
        'The set fell over',
        'Something went wrong building the scene. Reloading the page usually fixes it. '
        + `(${String(err && err.message ? err.message : err)})`,
      );
      return;
    }
    if (!ctx || mine !== token) return;

    setState(S.PLAYING);
    finished = false;
    showOverlay(null);
    if (chrome) chrome.hidden = false;
    frame?.classList.add('playing');
    showChrome();
    startProgress();
    setStatus(meta.viewer ? `Playing ${meta.title}.` : `Playing episode ${meta.number}, ${meta.title}.`);

    try {
      await ep.run(ctx);
    } catch (err) {
      warn('episode run', err);
      if (mine !== token) return;
      teardown();
      fail(
        'The episode stopped',
        'The scene threw partway through. '
        + `(${String(err && err.message ? err.message : err)})`,
      );
      return;
    }
    if (mine !== token) return;

    finished = true;
    if (barFill) barFill.style.width = '100%';
    endCard();
  }

  function endCard() {
    setState(S.ENDED);
    stopProgress();
    if (hideTimer) clearTimeout(hideTimer);
    frame?.classList.remove('playing');
    frame?.setAttribute('data-chrome', 'shown');
    if (chrome) chrome.hidden = true;
    showOverlay('end');

    // nextEpisode() only indexes the numbered run, so this is null for a
    // viewer episode and the button falls back to the gallery.
    const next = nextEpisode(meta.id);
    const nextBtn = /** @type {HTMLAnchorElement|null} */ ($('end-next'));
    if (nextBtn) {
      if (next && next.id !== meta.id) {
        nextBtn.href = `/watch.html?ep=${encodeURIComponent(next.id)}`;
        nextBtn.textContent = `Next — ${next.title}`;
      } else {
        nextBtn.href = '/';
        nextBtn.textContent = 'All episodes';
      }
    }
    setStatus(meta.viewer ? `End of ${meta.title}.` : `End of episode ${meta.number}, ${meta.title}.`);
    window.__OH_DONE = true;
    try {
      window.dispatchEvent(new CustomEvent('oh:episode-ended', { detail: { ep: meta.id } }));
    } catch { /* ignore */ }
  }

  function replay() {
    window.__OH_DONE = false;
    teardown();
    setState(S.IDLE);
    showOverlay(null);
    play();
  }

  /* --------------------------------------------------------------- speed  */

  /**
   * Reading rates, slowest first. 1 is the authored pace; the faster steps are
   * for people who read quicker than the boxes type, the slower ones for anyone
   * who would rather not be hurried.
   */
  const SPEEDS = [0.6, 0.8, 1, 1.25, 1.5, 2];
  const SPEED_KEY = 'oh7:speed';

  /**
   * The saved rate, or 1. Storage can throw outright in a private window, and a
   * value written by a future build might not be on the list any more, so this
   * falls back rather than trusting what it reads.
   *
   * @returns {number}
   */
  function loadSpeed() {
    const raw = attempt(() => localStorage.getItem(SPEED_KEY));
    const n = Number(raw);
    return SPEEDS.includes(n) ? n : 1;
  }

  /** @param {number} v */
  function storeSpeed(v) {
    attempt(() => localStorage.setItem(SPEED_KEY, String(v)));
  }

  /**
   * Steps the rate `dir` places along SPEEDS and applies it. Nothing needs
   * restarting: `rate()` is read live by the stage, the dialogue layer and the
   * progress clock, so a change lands on the line currently being typed.
   *
   * @param {number} dir -1 slower, +1 faster
   */
  function nudgeSpeed(dir) {
    const i = SPEEDS.indexOf(userSpeed);
    const next = SPEEDS[Math.min(SPEEDS.length - 1, Math.max(0, (i < 0 ? SPEEDS.indexOf(1) : i) + dir))];
    if (next === userSpeed) return;
    userSpeed = next;
    storeSpeed(next);
    syncSpeed();
    setStatus(`Speed ${fmtSpeed(next)}.`);
  }

  /** @param {number} v @returns {string} */
  function fmtSpeed(v) {
    return `${String(v).replace(/\.0+$/, '')}\u00d7`;
  }

  /** Reflects the current rate into the control: readout, disabled ends, a11y. */
  function syncSpeed() {
    const out = $('c-speed');
    if (out) out.textContent = fmtSpeed(userSpeed);
    const i = SPEEDS.indexOf(userSpeed);
    const slower = /** @type {HTMLButtonElement|null} */ ($('c-slower'));
    const faster = /** @type {HTMLButtonElement|null} */ ($('c-faster'));
    if (slower) slower.disabled = i <= 0;
    if (faster) faster.disabled = i >= SPEEDS.length - 1;
    const group = $('speedbar');
    if (group) group.setAttribute('aria-valuetext', fmtSpeed(userSpeed));
  }

  /* ----------------------------------------------------------- wake lock  */

  /**
   * An episode is a two-minute cutscene that nobody touches while it plays, so
   * a phone will happily dim and lock the screen in the middle of it. The Screen
   * Wake Lock API is the fix, held for exactly as long as playback lasts and no
   * longer — a lock left on after the episode ends would sit there draining the
   * battery on a page that is no longer doing anything.
   *
   * @returns {boolean}
   */
  function wakeLockSupported() {
    return typeof navigator !== 'undefined'
      && !!navigator.wakeLock
      && typeof navigator.wakeLock.request === 'function';
  }

  /**
   * Takes the lock, if playback is running and the page is actually on screen.
   *
   * The request rejects freely and legitimately — a background tab, a
   * Permissions-Policy that forbids it, or a device low enough on battery that
   * the OS declines. None of those are errors worth interrupting playback for,
   * so they are logged and shrugged off.
   *
   * @returns {Promise<void>}
   */
  async function acquireWakeLock() {
    if (!wakeLockSupported() || wakeLock || wakeLockPending) return;
    if (state !== S.PLAYING) return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;

    wakeLockPending = true;
    try {
      const lock = await navigator.wakeLock.request('screen');
      // Awaiting means the world may have moved on: the viewer can have hit
      // Back, or tabbed away, while the request was in flight. Do not keep a
      // lock for an episode that is no longer playing.
      if (state !== S.PLAYING || document.visibilityState !== 'visible') {
        attempt(() => lock.release());
        return;
      }
      wakeLock = lock;
      // The OS drops the lock on its own when the page is hidden; this keeps our
      // handle honest so the visibility handler knows to ask for a new one.
      attempt(() => lock.addEventListener('release', () => {
        if (wakeLock === lock) wakeLock = null;
      }));
    } catch (err) {
      warn('wakeLock', err);
    } finally {
      wakeLockPending = false;
    }
  }

  /** Drops the lock if we hold one. Safe to call when we do not. */
  function releaseWakeLock() {
    const lock = wakeLock;
    wakeLock = null;
    if (lock) attempt(() => lock.release());
  }

  /** Holds the lock exactly while the state is PLAYING. Called from setState. */
  function syncWakeLock() {
    if (state === S.PLAYING) acquireWakeLock();
    else releaseWakeLock();
  }

  /* ---------------------------------------------------------------- mute  */

  function syncMuteButton() {
    const btn = $('c-mute');
    if (!btn) return;
    const m = attempt(isMuted) === true;
    btn.textContent = m ? 'Unmute' : 'Mute';
    btn.setAttribute('aria-pressed', m ? 'true' : 'false');
  }

  function toggleMute() {
    const m = attempt(isMuted) === true;
    attempt(() => setMuted(!m));
    syncMuteButton();
    setStatus(!m ? 'Muted.' : 'Unmuted.');
  }

  /* ----------------------------------------------------------- fullscreen */

  /** ms inside which a second tap on the frame counts as a double-tap. */
  const DOUBLE_TAP_MS = 350;
  /** px a second tap may drift and still be the same double-tap. */
  const DOUBLE_TAP_SLOP = 48;

  /** The frame goes fullscreen, not the page, so the letterbox fills the screen. */
  const fsTarget = () => frame || document.documentElement;

  /**
   * Whether this browser will put an *element* fullscreen at all. iPhone Safari
   * exposes the document-side API but has no element request, so there is nothing
   * to offer and the button is hidden rather than left there doing nothing.
   *
   * @returns {boolean}
   */
  function canFullscreen() {
    const el = fsTarget();
    if (!el) return false;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (typeof req !== 'function') return false;
    const enabled = typeof document.fullscreenEnabled === 'boolean'
      ? document.fullscreenEnabled
      : document.webkitFullscreenEnabled;
    return enabled !== false;
  }

  /** @returns {boolean} true while anything on this page is fullscreen */
  function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }

  /** Asks for fullscreen. The API rejects freely (no gesture, iframe policy, ...). */
  function enterFullscreen() {
    const el = fsTarget();
    if (!el) return;
    attempt(() => {
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (typeof req !== 'function') return;
      const p = req.call(el);
      if (p && typeof p.catch === 'function') p.catch((err) => warn('fullscreen', err));
    });
  }

  function leaveFullscreen() {
    attempt(() => {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (typeof exit !== 'function') return;
      const p = exit.call(document);
      if (p && typeof p.catch === 'function') p.catch((err) => warn('exit fullscreen', err));
    });
  }

  function toggleFullscreen() {
    if (!canFullscreen()) return;
    const on = isFullscreen();
    if (on) leaveFullscreen();
    else enterFullscreen();
    // Nothing is announced or relabelled here: the request can be refused, and
    // onFullscreenChange is what actually knows, Esc and all.
  }

  /**
   * Every fullscreen toggle on the page. There are two: the one in the chrome bar,
   * and the one on the title card, because the chrome bar is hidden until an
   * episode is actually running.
   *
   * @returns {HTMLElement[]}
   */
  const fsButtons = () => Array.from(document.querySelectorAll('[data-oh-fullscreen]'));

  function syncFullscreenButton() {
    const supported = canFullscreen();
    const on = isFullscreen();
    for (const btn of fsButtons()) {
      if (!supported) {
        btn.hidden = true;
        continue;
      }
      btn.hidden = false;
      btn.textContent = on ? 'Exit full' : 'Fullscreen';
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  /**
   * Fullscreen changes the frame's box without a window resize (and Esc can leave
   * it with nobody touching our button), so re-fit the canvas and re-label here.
   */
  function onFullscreenChange() {
    syncFullscreenButton();
    layout();
    showChrome();
    setStatus(isFullscreen() ? 'Fullscreen.' : 'Left fullscreen.');
  }

  /**
   * Two taps on the frame inside DOUBLE_TAP_MS toggle fullscreen. This runs on
   * `pointerup` and never calls preventDefault, so the dialogue layer's own
   * pointerdown catcher still advances the line on a single tap; taps that start
   * on a button or a link (Play, the chrome, the end card) are left alone.
   *
   * @param {PointerEvent} e
   */
  function onFramePointerUp(e) {
    const t = /** @type {Element|null} */ (e.target);
    if (t && typeof t.closest === 'function' && t.closest('button, a')) {
      lastTapAt = 0;
      return;
    }
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    const now = performance.now();
    const near = Math.abs(e.clientX - lastTapX) < DOUBLE_TAP_SLOP
      && Math.abs(e.clientY - lastTapY) < DOUBLE_TAP_SLOP;
    if (lastTapAt && now - lastTapAt <= DOUBLE_TAP_MS && near) {
      lastTapAt = 0;
      toggleFullscreen();
      return;
    }
    lastTapAt = now;
    lastTapX = e.clientX;
    lastTapY = e.clientY;
  }

  /**
   * Loads whichever kind of episode this is.
   *
   * An official episode is a module. A viewer episode is a validated JSON spec
   * served from Blobs and interpreted by episodes/runtime.js — never a module,
   * because generated JavaScript executed on a public site is arbitrary code
   * from whoever typed into the form.
   *
   * @returns {Promise<Object>}
   */
  async function loadAnyEpisode() {
    if (!meta.viewer) return loadEpisode(meta.id);

    const res = await fetch(`/api/episode?id=${encodeURIComponent(meta.id)}`);
    if (!res.ok) {
      const e = new Error(res.status === 404
        ? 'That episode is not here. It may have been removed.'
        : 'That episode could not be loaded.');
      e.code = 'EPISODE_MISSING';
      throw e;
    }
    const spec = await res.json();

    // Fill in what the placeholder could not know.
    meta.title = spec.title || meta.title;
    meta.logline = spec.logline || meta.logline;
    meta.starring = Array.isArray(spec.starring) ? spec.starring : [];
    if (spec.seconds > 0) {
      const m = Math.floor(spec.seconds / 60);
      const sec = Math.round(spec.seconds % 60);
      meta.runtime = `${m}:${String(sec).padStart(2, '0')}`;
    }
    set('w-title', meta.title);
    set('w-run', meta.runtime);
    set('idle-title', meta.title);
    set('idle-log', meta.logline);
    set('end-title', meta.title);
    paintLogline();

    const rt = await import('/js/episodes/runtime.js');
    return rt.episodeFromSpec(spec);
  }

  /* --------------------------------------------------------- poster mode  */

  /**
   * `&brand=1`: the lockup staged in the office, for the social card. It is the
   * same geometry and the same framing helper the episode title card uses, so
   * the shared image cannot drift away from what a viewer actually sees.
   *
   * @param {Object} ctx
   * @returns {Promise<void>}
   */
  async function posterBrand(ctx) {
    const shots = (ctx.office && ctx.office.shots) || {};
    const shot = shots.windowWall || shots.bullpenWide || shots.establish;
    if (shot) ctx.d.cut(shot);

    const mod = await import('/js/brand/logo3d.js');
    const built = mod.createLogo3D({ scale: 1, overlay: true });
    mod.frameLockup(built, stage.camera, { dist: 3.2, fill: 0.74, yaw: -5, pitch: 5 });
    stage.scene.add(built.group);
  }

  /** @param {*} err */
  function posterFailed(err) {
    const msg = String(err && err.message ? err.message : err);
    window.__OH_POSTER_ERROR = msg;
    document.documentElement.setAttribute('data-oh-poster', 'error');
    warn('poster', err);
    try {
      window.dispatchEvent(new CustomEvent('oh:poster-error', { detail: { ep: meta && meta.id, message: msg } }));
    } catch { /* ignore */ }
  }

  /** Waits `n` animation frames, so procedural poses and camera moves settle. */
  function frames(n) {
    return new Promise((res) => {
      let left = Math.max(1, n);
      const step = () => (--left <= 0 ? res() : requestAnimationFrame(step));
      requestAnimationFrame(step);
    });
  }

  /**
   * `/watch.html?ep=epN&poster=1`: pose the scene for a thumbnail, freeze on that
   * frame, and raise the flag a screenshotter waits on.
   */
  async function runPoster() {
    setState(S.POSTER);
    document.body.classList.add('poster');
    showOverlay(null);
    if (chrome) chrome.hidden = true;

    if (!hasWebGL2()) {
      posterFailed(new Error('WebGL2 is unavailable'));
      return;
    }

    const mine = token;
    try {
      const ep = await loadAnyEpisode();
      const ctx = await buildScene(mine);
      if (!ctx) throw new Error('scene build was cancelled');

      if (brandMode) {
        await posterBrand(ctx);
      } else if (typeof ep.poster === 'function') {
        await ep.poster(ctx);
      } else if (ctx.office && ctx.office.shots && ctx.office.shots.bullpenWide) {
        ctx.d.cut(ctx.office.shots.bullpenWide);
      }

      await frames(30);
      if (mine !== token) return;

      stage.stop();
      window.__OH_POSTER_READY = true;
      document.documentElement.setAttribute('data-oh-poster', 'ready');
      try {
        window.dispatchEvent(new CustomEvent('oh:poster-ready', { detail: { ep: meta.id } }));
      } catch { /* ignore */ }
    } catch (err) {
      posterFailed(err);
    }
  }

  /* --------------------------------------------------------------- wiring */

  installBrand();

  // Unknown ?ep=: say so plainly and offer the real running order. Never a crash.
  if (!meta) {
    document.documentElement.style.setProperty('--accent', 'var(--oh-silver)');
    const epEl = $('w-ep');
    if (epEl) epEl.textContent = 'Not found';
    const titleEl = $('w-title');
    if (titleEl) titleEl.textContent = '404';
    document.title = 'Not found — OFFICE HOURS VII';
    fail(
      'No such episode',
      `There is no episode called "${rawId}". The running order is `
      + `${EPISODES.map((e) => `${e.id} (${e.title})`).join(', ')}.`,
    );
    return { teardown };
  }

  document.documentElement.style.setProperty('--accent', meta.accent);
  document.title = `${meta.title} — Episode ${meta.number} — OFFICE HOURS VII`;

  // A declaration, not a const arrow: loadAnyEpisode() is defined above this
  // point and calls it, and this file has twice shipped a bug where a helper
  // was used before its `let`/`const` had initialised. A hoisted function
  // cannot be reached too early.
  function set(id, text) { const n = $(id); if (n) n.textContent = text; }
  set('w-ep', meta.viewer ? meta.ordinal : `Episode ${meta.ordinal}`);
  set('w-title', meta.title);
  set('w-run', meta.runtime);
  set('idle-kicker', `Office Hours 7 — Episode ${meta.ordinal}`);
  set('idle-title', meta.title);
  set('idle-log', meta.logline);
  set('end-title', meta.title);
  set('end-kicker', `End of episode ${meta.ordinal}`);

  // Under the stage: the starring line always, and the logline only when the frame is
  // too short to carry it on the title card itself. Never both at once.
  const logEl = $('w-log');
  /**
   * A viewer episode's cast is not known until its spec arrives, so this is a
   * function rather than a one-shot: called at init for the numbered episodes
   * and again once a fetched spec has filled `meta` in. Without the second
   * call the line renders as a bare "Starring" with nothing after it.
   */
  function paintLogline() {
    if (!logEl) return;
    logEl.textContent = '';
    const line = document.createElement('span');
    line.className = 'line';
    line.textContent = meta.logline;
    logEl.append(line);
    if (meta.starring && meta.starring.length) {
      const cast = document.createElement('b');
      cast.textContent = `Starring ${meta.starring.map((c) => c.toUpperCase()).join(' \u00b7 ')}`;
      logEl.append(cast);
    }
  }
  paintLogline();

  layout();
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => layout()).observe(stageEl);
  }
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', layout);

  $('play')?.addEventListener('click', () => { play(); });
  $('end-replay')?.addEventListener('click', () => { replay(); });
  $('c-replay')?.addEventListener('click', () => { replay(); });
  $('c-mute')?.addEventListener('click', () => { toggleMute(); });
  $('c-slower')?.addEventListener('click', () => { nudgeSpeed(-1); });
  $('c-faster')?.addEventListener('click', () => { nudgeSpeed(1); });
  for (const btn of fsButtons()) btn.addEventListener('click', () => { toggleFullscreen(); });
  syncMuteButton();
  syncFullscreenButton();
  userSpeed = loadSpeed();
  syncSpeed();

  for (const evt of ['mousemove', 'pointerdown', 'touchstart']) {
    frame?.addEventListener(evt, showChrome, { passive: true });
  }
  chrome?.addEventListener('focusin', showChrome);
  frame?.addEventListener('pointerup', onFramePointerUp);
  for (const evt of ['fullscreenchange', 'webkitfullscreenchange']) {
    document.addEventListener(evt, onFullscreenChange);
  }

  window.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    showChrome();

    const tag = (e.target && /** @type {HTMLElement} */ (e.target).tagName) || '';
    const onControl = tag === 'BUTTON' || tag === 'A';

    if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') {
      // A focused button or link must keep its native activation. While the episode
      // is playing, dialogue.js owns Space/Enter as "advance".
      if (onControl) return;
      if (state === S.IDLE) { e.preventDefault(); play(); }
      else if (state === S.ENDED) { e.preventDefault(); $('end-next')?.click(); }
    } else if (e.key === 'm' || e.key === 'M') {
      e.preventDefault();
      toggleMute();
    } else if (e.key === '[' || e.key === ',' || e.key === '-') {
      e.preventDefault();
      nudgeSpeed(-1);
    } else if (e.key === ']' || e.key === '.' || e.key === '+' || e.key === '=') {
      e.preventDefault();
      nudgeSpeed(1);
    } else if (e.key === 'r' || e.key === 'R') {
      if (state === S.PLAYING || state === S.ENDED) { e.preventDefault(); replay(); }
    } else if (e.key === 'f' || e.key === 'F') {
      if (!canFullscreen()) return;
      e.preventDefault();
      toggleFullscreen();
    } else if (e.key === 'Escape') {
      // In fullscreen, Escape is the browser's own way out. Leave the frame, and
      // do not also walk the viewer out of the player.
      if (isFullscreen()) { e.preventDefault(); leaveFullscreen(); return; }
      e.preventDefault();
      teardown();
      location.href = '/';
    }
  });

  // Navigating away must not leak a GL context or leave a script running.
  // The OS releases a wake lock whenever the document is hidden, and does not
  // hand it back on return — so an episode left running in a background tab
  // would come back without one. Re-take it when the page is visible again.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncWakeLock();
  });

  window.addEventListener('pagehide', teardown);
  window.addEventListener('beforeunload', teardown);

  /** Minimal surface for `tools/check.mjs` and friends. */
  window.__OH_PLAYER = {
    get state() { return state; },
    episode: meta.id,
    play,
    replay,
    teardown,
  };
  window.__OH_DONE = false;

  if (posterMode) runPoster();
  else showOverlay('idle');

  return { teardown };
}

// Page entry point. watch.html loads this module directly, so it boots itself rather
// than needing an inline <script> a strict CSP would have to whitelist.
if (typeof document !== 'undefined' && document.getElementById('scene')) {
  initPlayer();
}
