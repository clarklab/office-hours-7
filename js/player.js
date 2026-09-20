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
 *      dialogue typing speed and holds to match.
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
function scaleStage(stage, k) {
  if (k === 1) return stage;
  const view = Object.create(stage);
  view.onUpdate = (fn) => stage.onUpdate((dt, t) => fn(dt * k, t * k));
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
function scaleUi(ui, k) {
  if (k === 1 || !ui) return ui;
  /** @param {*} v @param {number} fallback */
  const ms = (v, fallback) => Math.max(1, Math.round((Number.isFinite(v) ? v : fallback) / k));
  const view = Object.create(ui);

  view.say = (o = {}) => ui.say(Object.assign({}, o, {
    cps: (Number.isFinite(o.cps) ? o.cps : 34) * k,
    hold: ms(o.hold, 750),
  }));
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
  const posterMode = params.get('poster') === '1' || params.get('poster') === 'true';
  const meta = getEpisode(rawId || DEFAULT_EPISODE_ID);

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
  let hideTimer = 0;
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
    state = S.ERROR;
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
      if (!finished) elapsedMs += dt * speed;
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

    const view = scaleStage(stage, speed);

    note('Building the office');
    /** @type {Object|null} */
    let office = null;
    try {
      const mod = await import('/js/sets/office.js');
      office = mod.createOffice();
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
    const cast = {};
    try {
      const mod = await import('/js/characters/index.js');
      const ids = Object.keys(mod.CAST || mod.PROFILES || {});
      for (const id of ids) {
        try {
          const actor = mod.spawn(id);
          if (!actor) continue;
          cast[id] = actor;
          if (actor.group) stage.scene.add(actor.group);
          if (typeof actor.update === 'function') {
            unsubs.push(view.onUpdate((dt, t) => {
              try { actor.update(dt, t); } catch (err) { warn(`${id}.update`, err); }
            }));
          }
        } catch (err) {
          warn(`could not spawn ${id}`, err);
        }
      }
    } catch (err) {
      warn('the cast has not been hired yet', err);
    }
    if (mine !== token) return null;

    note('Cueing the dialogue');
    const dlg = await import('/js/core/dialogue.js');
    if (mine !== token) return null;
    ui = dlg.createDialogue(uiHost);
    const uiView = scaleUi(ui, speed);

    const dir = await import('/js/core/director.js');
    if (mine !== token) return null;
    director = dir.createDirector(view, uiView, {
      shots: office ? office.shots : undefined,
      marks: office ? office.marks : undefined,
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
    state = S.LOADING;
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
      ep = await loadEpisode(meta.id);
    } catch (err) {
      warn('loadEpisode', err);
      fail(
        'Not shot yet',
        `Episode ${meta.number}, ${meta.title}, has not been filmed. `
        + 'The other episodes may already be up — try the gallery.',
      );
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

    state = S.PLAYING;
    finished = false;
    showOverlay(null);
    if (chrome) chrome.hidden = false;
    frame?.classList.add('playing');
    showChrome();
    startProgress();
    setStatus(`Playing episode ${meta.number}, ${meta.title}.`);

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
    state = S.ENDED;
    stopProgress();
    if (hideTimer) clearTimeout(hideTimer);
    frame?.classList.remove('playing');
    frame?.setAttribute('data-chrome', 'shown');
    if (chrome) chrome.hidden = true;
    showOverlay('end');

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
    setStatus(`End of episode ${meta.number}, ${meta.title}.`);
    window.__OH_DONE = true;
    try {
      window.dispatchEvent(new CustomEvent('oh:episode-ended', { detail: { ep: meta.id } }));
    } catch { /* ignore */ }
  }

  function replay() {
    window.__OH_DONE = false;
    teardown();
    state = S.IDLE;
    showOverlay(null);
    play();
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

  /* --------------------------------------------------------- poster mode  */

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
    state = S.POSTER;
    document.body.classList.add('poster');
    showOverlay(null);
    if (chrome) chrome.hidden = true;

    if (!hasWebGL2()) {
      posterFailed(new Error('WebGL2 is unavailable'));
      return;
    }

    const mine = token;
    try {
      const ep = await loadEpisode(meta.id);
      const ctx = await buildScene(mine);
      if (!ctx) throw new Error('scene build was cancelled');

      if (typeof ep.poster === 'function') {
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

  const set = (id, text) => { const n = $(id); if (n) n.textContent = text; };
  set('w-ep', `Episode ${meta.ordinal}`);
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
  if (logEl) {
    logEl.textContent = '';
    const line = document.createElement('span');
    line.className = 'line';
    line.textContent = meta.logline;
    const cast = document.createElement('b');
    cast.textContent = `Starring ${meta.starring.map((c) => c.toUpperCase()).join(' \u00b7 ')}`;
    logEl.append(line, cast);
  }

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
  syncMuteButton();

  for (const evt of ['mousemove', 'pointerdown', 'touchstart']) {
    frame?.addEventListener(evt, showChrome, { passive: true });
  }
  chrome?.addEventListener('focusin', showChrome);

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
    } else if (e.key === 'r' || e.key === 'R') {
      if (state === S.PLAYING || state === S.ENDED) { e.preventDefault(); replay(); }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      teardown();
      location.href = '/';
    }
  });

  // Navigating away must not leak a GL context or leave a script running.
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
