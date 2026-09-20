#!/usr/bin/env node
/**
 * OFFICE HOURS VII — browser smoke test.
 *
 * Serves the repo, drives a real headless Chromium over it, plays every
 * episode end to end and shouts about anything that is broken. It is written
 * to be run constantly while the rest of the show is still being built, so a
 * file that does not exist yet is reported as **not ready** and never crashes
 * the run.
 *
 * ```
 * node tools/check.mjs                 # everything
 * node tools/check.mjs --ep=ep1        # one episode
 * node tools/check.mjs --ep=ep1,ep3    # several
 * node tools/check.mjs --page=gallery  # the landing page only
 * node tools/check.mjs --fast          # play at 3x (see the speed contract below)
 * node tools/check.mjs --speed=2       # explicit multiplier
 * node tools/check.mjs --strict        # treat "not ready" as failure
 * node tools/check.mjs --headed        # watch it happen
 * ```
 *
 * ## The fast-forward contract
 * Before any page script runs, the harness sets:
 * - `window.__OH_TEST = true` — you are inside the smoke test
 * - `window.__OH_SPEED = <number>` — requested playback rate (1 unless `--fast`)
 *
 * `/js/player.js` may honour `__OH_SPEED` itself (scaling the stage clock,
 * dialogue `cps`, holds, whatever it likes). If it does, it must set
 * `window.__OH_SPEED_HANDLED = true` before the episode starts.
 *
 * If that flag is absent when PLAY is pressed, the harness applies its own
 * fast-forward, which needs no cooperation at all: it dilates the timestamp
 * handed to every `requestAnimationFrame` callback. Since the engine and the
 * director both derive their clocks from rAF, the whole show speeds up while
 * real wall-clock measurement stays honest. The engine clamps `dt` to 1/20s,
 * so the useful ceiling is ~3x; anything higher is silently capped by that
 * clamp and the reported duration is corrected for it.
 *
 * ## The completion contract
 * The harness considers an episode finished when any of these happens
 * (first one wins):
 * 1. `window.__OH_STATE === 'done'` (or `'ended'` / `'error'`)
 * 2. `window.__OH_DONE === true`
 * 3. an `oh-episode-end` event is dispatched on `window`
 * 4. a visible element matching `[data-oh-end]`, `#oh-end`, `.oh-endcard`,
 *    `[data-oh-state="done"]` appears
 *
 * `/js/player.js` should do (1) and (3); the rest are fallbacks.
 *
 * ## The PLAY contract
 * The harness clicks the first of `[data-oh-play]`, `#oh-play`, `#play`,
 * `.oh-play`, `button[data-play]`, or a visible button whose text contains
 * PLAY / ▶ / WATCH. Failing all of that it presses Enter, then Space.
 *
 * @module tools/check
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { start, ROOT } from './serve.mjs';

/** The episodes the show ships with. */
export const EPISODE_IDS = ['ep1', 'ep2', 'ep3'];

/** Where screenshots go. Deliberately NOT in the repo. */
const DEFAULT_OUT = '/tmp/oh7-check';

/** Playback speed used by `--fast`. The engine's dt clamp makes >3 pointless. */
const FAST_SPEED = 3;

/** Episodes are specced at 55-70s of wall clock at normal speed. */
const TARGET_MIN_S = 55;
const TARGET_MAX_S = 70;

/** Frame-time thresholds, milliseconds. Past these the show is not watchable. */
const FPS_P50_LIMIT = 40;
const FPS_P95_LIMIT = 120;

/* ------------------------------------------------------------------ chrome */

/**
 * Finds the preinstalled Chromium. Globs `/opt/pw-browsers/chromium-*` (the
 * version directory changes) and falls back to the known-good literal path.
 * @returns {string|null} absolute path to the binary, or null if none exists
 */
export function findChromium() {
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers'];
  /** @type {Array<{dir:string, n:number}>} */
  const found = [];
  for (const root of roots) {
    let entries = [];
    try {
      entries = fs.readdirSync(root);
    } catch {
      continue;
    }
    for (const e of entries) {
      const m = /^chromium-(\d+)$/.exec(e);
      if (!m) continue;
      const bin = path.join(root, e, 'chrome-linux', 'chrome');
      if (fs.existsSync(bin)) found.push({ dir: bin, n: Number(m[1]) });
    }
  }
  found.sort((a, b) => b.n - a.n);
  if (found.length) return found[0].dir;
  const literal = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  return fs.existsSync(literal) ? literal : null;
}

/**
 * Launches Chromium.
 *
 * playwright-core 1.49 still passes `--headless=old`, which modern Chromium
 * refuses to start with — so headless is requested by hand instead.
 *
 * @param {Object} [o]
 * @param {boolean} [o.headed=false]
 * @returns {Promise<import('playwright-core').Browser>}
 */
export async function launchBrowser(o = {}) {
  const { chromium } = await import('playwright-core');
  const executablePath = findChromium();
  if (!executablePath) {
    throw new Error(
      'no Chromium found under /opt/pw-browsers — expected '
      + '/opt/pw-browsers/chromium-*/chrome-linux/chrome (do NOT run `playwright install`)',
    );
  }
  const args = [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu-sandbox',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--mute-audio',
    '--autoplay-policy=no-user-gesture-required',
    '--force-device-scale-factor=1',
    '--hide-scrollbars',
  ];
  if (!o.headed) args.push('--headless=new');
  return chromium.launch({ executablePath, headless: false, args });
}

/* ------------------------------------------------------- page instrumentation */

/**
 * Injected before any page script. Installs the rAF time dilation, the frame
 * sampler, WebGL context-loss watchers and an in-page error mirror.
 *
 * Runs inside the browser — keep it self-contained.
 *
 * @param {{speed:number, poster:boolean}} cfg
 * @returns {void}
 */
export function harnessInit(cfg) {
  const W = window;
  if (W.__ohHarness) return;

  const rawRaf = W.requestAnimationFrame.bind(W);
  const H = {
    speed: 1,
    requested: cfg.speed,
    errors: [],
    glLost: 0,
    glRestored: 0,
    glContexts: 0,
    frames: [],
    ended: null,
    endedBy: null,
    /** @param {number} n */
    setSpeed(n) { H.speed = Math.max(0.05, Math.min(16, Number(n) || 1)); },
    getSpeed() { return H.speed; },
  };
  W.__ohHarness = H;
  W.__OH_TEST = true;
  W.__OH_SPEED = cfg.speed;
  if (cfg.poster) W.__OH_POSTER = true;

  /* --- rAF time dilation: every callback sees a virtual clock --- */
  let lastReal = -1;
  let virt = 0;
  W.requestAnimationFrame = function (cb) {
    return rawRaf(function (t) {
      if (t !== lastReal) {
        virt = lastReal < 0 ? t : virt + (t - lastReal) * H.speed;
        lastReal = t;
      }
      try {
        cb(virt);
      } catch (err) {
        H.errors.push({ kind: 'raf', message: String((err && err.stack) || err) });
        throw err;
      }
    });
  };

  /* --- real-time frame sampler (never dilated) --- */
  let prev = 0;
  const sample = (t) => {
    rawRaf(sample);
    if (prev) {
      const d = t - prev;
      if (d > 0 && d < 5000) {
        H.frames.push(d);
        if (H.frames.length > 4000) H.frames.splice(0, 1000);
      }
    }
    prev = t;
  };
  rawRaf(sample);

  /* --- WebGL context loss --- */
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const ctx = getContext.call(this, type, ...rest);
    if (ctx && /webgl/i.test(String(type)) && !this.__ohWatched) {
      this.__ohWatched = true;
      H.glContexts++;
      this.addEventListener('webglcontextlost', (e) => {
        H.glLost++;
        H.errors.push({ kind: 'webgl', message: `WebGL context LOST (${e.statusMessage || 'no reason given'})` });
      });
      this.addEventListener('webglcontextrestored', () => { H.glRestored++; });
    }
    return ctx;
  };

  /* --- error mirror (belt and braces; Playwright watches too) --- */
  W.addEventListener('error', (e) => {
    H.errors.push({
      kind: 'error',
      message: String((e.error && e.error.stack) || e.message || e),
      source: e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : '',
    });
  });
  W.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    H.errors.push({ kind: 'unhandledrejection', message: String((r && r.stack) || r) });
  });

  /* --- completion signals --- */
  const markEnd = (by) => {
    if (H.ended == null) {
      H.ended = performance.now();
      H.endedBy = by;
    }
  };
  W.addEventListener('oh-episode-end', () => markEnd('oh-episode-end event'));
  W.addEventListener('oh-ep-end', () => markEnd('oh-ep-end event'));
  W.__ohMarkEnd = markEnd;
}

/**
 * Reads the frame + GL + error state back out of a page.
 * Runs inside the browser.
 * @returns {Object}
 */
function readHarness() {
  const H = window.__ohHarness;
  if (!H) return null;
  const f = H.frames.slice().sort((a, b) => a - b);
  const at = (q) => (f.length ? f[Math.min(f.length - 1, Math.floor(f.length * q))] : 0);
  return {
    speed: H.speed,
    requested: H.requested,
    speedHandled: window.__OH_SPEED_HANDLED === true,
    errors: H.errors.slice(0, 40),
    glLost: H.glLost,
    glRestored: H.glRestored,
    glContexts: H.glContexts,
    frameCount: f.length,
    p50: Math.round(at(0.5) * 100) / 100,
    p95: Math.round(at(0.95) * 100) / 100,
    worst: Math.round((f[f.length - 1] || 0) * 100) / 100,
    ended: H.ended,
    endedBy: H.endedBy,
    state: window.__OH_STATE === undefined ? null : String(window.__OH_STATE),
    done: window.__OH_DONE === true,
  };
}

/**
 * Samples the biggest canvas on the page and reports whether it is a flat
 * frame. Runs inside the browser.
 *
 * Needs `preserveDrawingBuffer: true` on the WebGL context (engine.js sets it)
 * or the read-back is blank even when the scene is fine.
 * @returns {Object}
 */
function samplePixels() {
  const canvases = Array.from(document.querySelectorAll('canvas'))
    .filter((c) => c.width > 8 && c.height > 8)
    .sort((a, b) => b.width * b.height - a.width * a.height);
  if (!canvases.length) return { ok: false, reason: 'no canvas on the page' };
  const src = canvases[0];
  const w = 64;
  const h = 36;
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const ctx = off.getContext('2d', { willReadFrequently: true });
  let data;
  try {
    ctx.drawImage(src, 0, 0, w, h);
    data = ctx.getImageData(0, 0, w, h).data;
  } catch (err) {
    return { ok: false, reason: `could not read the canvas: ${err && err.message}` };
  }
  let sum = 0;
  let sumSq = 0;
  const seen = new Set();
  const n = w * h;
  for (let i = 0; i < n; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    sum += lum;
    sumSq += lum * lum;
    seen.add(((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3));
  }
  const mean = sum / n;
  const variance = Math.max(0, sumSq / n - mean * mean);
  return {
    ok: true,
    canvas: `${src.width}x${src.height}`,
    mean: Math.round(mean * 10) / 10,
    stdDev: Math.round(Math.sqrt(variance) * 100) / 100,
    colors: seen.size,
  };
}

/* ------------------------------------------------------------------ report */

/**
 * One page's worth of findings.
 * @typedef {Object} PageReport
 * @property {string} label
 * @property {string} url
 * @property {'pass'|'fail'|'not-ready'|'skip'} status
 * @property {string[]} failures
 * @property {string[]} notReady
 * @property {string[]} warnings
 * @property {string[]} notes
 * @property {string[]} shots
 */

/**
 * @param {string} label
 * @param {string} url
 * @returns {PageReport}
 */
function makeReport(label, url) {
  return { label, url, status: 'pass', failures: [], notReady: [], warnings: [], notes: [], shots: [] };
}

/** Local 404s that are expected while the show is being built. */
const SOFT_404 = [/\/assets\/thumbs\//, /favicon/i, /apple-touch-icon/i];

/** Console noise that is not a real failure. */
const IGNORE_CONSOLE = [
  /Download the React DevTools/i,
  /\[Violation\]/i,
  /WebGL: INVALID_OPERATION: useProgram: program not valid/i, // swiftshader warm-up
  /Automatic fallback to software WebGL/i,
  /GroupMarkerNotSet/i,
];

/**
 * Attaches every listener we need to a page and returns the collector.
 * @param {import('playwright-core').Page} page
 * @param {PageReport} rep
 * @returns {{missing:Set<string>, console:Array<Object>, errors:Array<Object>}}
 */
function watchPage(page, rep) {
  const missing = new Set();
  const consoleMsgs = [];
  const errors = [];

  page.on('console', (msg) => {
    const type = msg.type();
    if (type !== 'error' && type !== 'warning') return;
    const loc = msg.location() || {};
    consoleMsgs.push({
      type,
      text: msg.text(),
      where: loc.url ? `${loc.url}:${loc.lineNumber || 0}:${loc.columnNumber || 0}` : '',
    });
  });

  page.on('pageerror', (err) => {
    errors.push({ kind: 'pageerror', text: String((err && err.stack) || err) });
  });

  page.on('crash', () => {
    errors.push({ kind: 'crash', text: 'the page process crashed' });
  });

  page.on('requestfailed', (req) => {
    const url = req.url();
    const why = (req.failure() && req.failure().errorText) || 'failed';
    if (url.startsWith('http')) missing.add(`${url} (${why})`);
    else rep.warnings.push(`request failed: ${url} (${why})`);
  });

  page.on('response', (res) => {
    const s = res.status();
    if (s >= 400) missing.add(`${res.url()} (HTTP ${s})`);
  });

  return { missing, console: consoleMsgs, errors };
}

/**
 * Sorts collected noise into failures / not-ready / warnings.
 * @param {PageReport} rep
 * @param {{missing:Set<string>, console:Array<Object>, errors:Array<Object>}} w
 * @param {string} base server origin, so local URLs can be shortened
 * @returns {void}
 */
function classify(rep, w, base) {
  const shorten = (u) => String(u).replace(base, '');
  /** @type {string[]} */
  const missingPaths = [];

  for (const m of w.missing) {
    const short = shorten(m);
    if (SOFT_404.some((re) => re.test(short))) {
      rep.warnings.push(`missing (harmless for now): ${short}`);
    } else {
      missingPaths.push(short);
      rep.notReady.push(`missing file: ${short}`);
    }
  }

  const looksMissing = (text) => {
    if (/Failed to (load|fetch) (module script|dynamically imported module)/i.test(text)) return true;
    if (/Failed to resolve module specifier/i.test(text)) return true;
    if (/the server responded with a status of 404/i.test(text)) return true;
    if (/ERR_ABORTED|ERR_FAILED/.test(text) && /404/.test(text)) return true;
    return missingPaths.some((p) => p && text.includes(p.split(' ')[0]));
  };

  for (const c of w.console) {
    const line = c.where ? `${c.text}\n      at ${shorten(c.where)}` : c.text;
    if (IGNORE_CONSOLE.some((re) => re.test(c.text))) continue;
    if (c.type === 'warning') {
      rep.warnings.push(`console.warn: ${line}`);
      continue;
    }
    if (looksMissing(c.text)) rep.notReady.push(`console error from a missing file: ${line}`);
    else rep.failures.push(`console.error: ${line}`);
  }

  for (const e of w.errors) {
    if (looksMissing(e.text)) rep.notReady.push(`${e.kind} from a missing file: ${e.text.split('\n')[0]}`);
    else rep.failures.push(`${e.kind}: ${e.text}`);
  }
}

/**
 * Pulls the in-page harness errors (WebGL loss, rAF throws) into the report.
 * @param {PageReport} rep
 * @param {Object|null} h
 * @returns {void}
 */
function foldHarnessErrors(rep, h) {
  if (!h) return;
  for (const e of h.errors || []) {
    const text = `${e.kind}: ${e.message}${e.source ? ` (${e.source})` : ''}`;
    if (/Failed to (load|fetch)/i.test(e.message)) rep.notReady.push(text);
    else if (!rep.failures.includes(text)) rep.failures.push(text);
  }
}

/* --------------------------------------------------------------- utilities */

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

/**
 * Tries hard to press PLAY.
 * @param {import('playwright-core').Page} page
 * @returns {Promise<string|null>} description of what got clicked, or null
 */
async function pressPlay(page) {
  const selectors = [
    '[data-oh-play]',
    '#oh-play',
    '#play',
    '.oh-play',
    'button[data-play]',
    'button:has-text("PLAY")',
    'a:has-text("PLAY")',
    '[role="button"]:has-text("PLAY")',
    'button:has-text("▶")',
    'button:has-text("WATCH")',
  ];
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.count() === 0) continue;
      if (!(await el.isVisible())) continue;
      await el.click({ timeout: 3000 });
      return sel;
    } catch {
      /* try the next one */
    }
  }
  // No control found: give the page a real gesture anyway (it needs one for
  // WebAudio) and try the documented keyboard affordances.
  try {
    await page.mouse.click(640, 400);
    await page.keyboard.press('Enter');
    await sleep(250);
    await page.keyboard.press('Space');
    return 'click + Enter/Space fallback';
  } catch {
    return null;
  }
}

/**
 * @param {import('playwright-core').Page} page
 * @returns {Promise<boolean>} whether an end-card-ish element is visible
 */
async function endCardVisible(page) {
  try {
    return await page.evaluate(() => {
      const sels = ['[data-oh-end]', '#oh-end', '.oh-endcard', '.oh-end', '[data-oh-state="done"]'];
      for (const s of sels) {
        const el = document.querySelector(s);
        if (el && el.getClientRects().length) return true;
      }
      return false;
    });
  } catch {
    return false;
  }
}

/**
 * @param {string} p
 * @returns {Promise<void>}
 */
async function ensureDir(p) {
  await fsp.mkdir(p, { recursive: true });
}

/* --------------------------------------------------------------- the pages */

/**
 * Loads a page, waits for it to settle, and collects everything.
 * @param {Object} ctx
 * @param {string} label
 * @param {string} url
 * @param {(page: import('playwright-core').Page, rep: PageReport) => Promise<void>} [body]
 * @returns {Promise<PageReport>}
 */
async function visit(ctx, label, url, body) {
  const rep = makeReport(label, url);
  const page = await ctx.browser.newPage({ viewport: { width: 1280, height: 720 } });
  const w = watchPage(page, rep);

  try {
    await page.addInitScript(harnessInit, { speed: ctx.speed, poster: false });
  } catch (err) {
    rep.warnings.push(`could not inject the harness: ${err && err.message}`);
  }

  let response = null;
  try {
    response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (err) {
    rep.status = 'not-ready';
    rep.notReady.push(`could not load ${url}: ${err && err.message}`);
    await page.close().catch(() => {});
    return rep;
  }

  if (response && response.status() === 404) {
    rep.status = 'not-ready';
    rep.notReady.push(`${url.replace(ctx.base, '')} does not exist yet (HTTP 404)`);
    await page.close().catch(() => {});
    return rep;
  }
  if (response && response.status() >= 400) {
    rep.status = 'fail';
    rep.failures.push(`${url} returned HTTP ${response.status()}`);
  }

  try {
    await page.waitForLoadState('networkidle', { timeout: 8000 });
  } catch {
    rep.notes.push('network never went idle (an animation loop is fine)');
  }

  try {
    if (body) await body(page, rep);
  } catch (err) {
    rep.failures.push(`harness error while driving the page: ${(err && err.stack) || err}`);
  }

  const h = await page.evaluate(readHarness).catch(() => null);
  foldHarnessErrors(rep, h);
  if (h) {
    rep.notes.push(`frames: ${h.frameCount} sampled, p50 ${h.p50}ms, p95 ${h.p95}ms, worst ${h.worst}ms`);
    if (h.glContexts === 0) rep.notReady.push('no WebGL context was ever created on this page');
    if (h.glLost > 0) rep.failures.push(`WebGL context was LOST ${h.glLost}x (restored ${h.glRestored}x)`);
  }

  classify(rep, w, ctx.base);
  await page.close().catch(() => {});

  if (rep.failures.length) rep.status = 'fail';
  else if (rep.status !== 'not-ready' && rep.notReady.length) rep.status = 'not-ready';
  return rep;
}

/**
 * The landing page.
 * @param {Object} ctx
 * @returns {Promise<PageReport>}
 */
async function checkGallery(ctx) {
  return visit(ctx, 'gallery (/)', `${ctx.base}/`, async (page, rep) => {
    const shot = path.join(ctx.out, 'gallery.png');
    await page.screenshot({ path: shot }).catch(() => {});
    rep.shots.push(shot);

    const info = await page.evaluate(() => ({
      title: document.title,
      cards: document.querySelectorAll('a[href*="watch.html"]').length,
      canvases: document.querySelectorAll('canvas').length,
      text: (document.body && document.body.innerText ? document.body.innerText : '').trim().length,
    })).catch(() => null);

    if (!info) return;
    rep.notes.push(`title "${info.title}", ${info.cards} watch links, ${info.canvases} canvas, ${info.text} chars of copy`);
    if (info.text < 40 && info.cards === 0) {
      rep.notReady.push('the landing page is essentially empty — the SITE agent has not filled it in yet');
    } else if (info.cards < EPISODE_IDS.length) {
      rep.warnings.push(`only ${info.cards} episode links found; expected ${EPISODE_IDS.length}`);
    }
  });
}

/**
 * One episode, played to the end.
 * @param {Object} ctx
 * @param {string} id
 * @returns {Promise<PageReport>}
 */
async function checkEpisode(ctx, id) {
  const url = `${ctx.base}${ctx.watch}?ep=${id}`;
  const outDir = path.join(ctx.out, id);
  await ensureDir(outDir);

  return visit(ctx, `episode ${id}`, url, async (page, rep) => {
    /* ---- negotiate the fast-forward ---- */
    const pre = await page.evaluate(() => ({
      handled: window.__OH_SPEED_HANDLED === true,
      state: window.__OH_STATE === undefined ? null : String(window.__OH_STATE),
    })).catch(() => ({ handled: false, state: null }));

    let effectiveSpeed = 1;
    if (ctx.speed > 1) {
      if (pre.handled) {
        effectiveSpeed = ctx.speed;
        rep.notes.push(`player.js honours __OH_SPEED itself (${ctx.speed}x)`);
      } else {
        await page.evaluate((s) => window.__ohHarness.setSpeed(s), ctx.speed).catch(() => {});
        effectiveSpeed = ctx.speed;
        rep.notes.push(`player.js did not claim __OH_SPEED; harness is dilating rAF time ${ctx.speed}x`);
      }
    }

    await page.screenshot({ path: path.join(outDir, '00-idle.png') }).catch(() => {});
    rep.shots.push(path.join(outDir, '00-idle.png'));

    /* ---- press PLAY ---- */
    const clicked = await pressPlay(page);
    if (!clicked) {
      rep.notReady.push('no PLAY control found and the keyboard fallback failed');
      return;
    }
    rep.notes.push(`play triggered via ${clicked}`);
    const t0 = Date.now();

    /* ---- watch it ---- */
    // 70s of episode + a generous 40s of slack, divided by the speed-up.
    const budgetMs = ((TARGET_MAX_S + 40) * 1000) / Math.max(1, effectiveSpeed);
    const shotCount = 6;
    const shotEvery = ((TARGET_MAX_S * 1000) / Math.max(1, effectiveSpeed)) / shotCount;
    /** @type {Array<{mean:number, stdDev:number, colors:number}>} */
    const samples = [];
    let shotIndex = 0;
    let nextShot = shotEvery * 0.5;
    let finished = false;
    let finishedBy = '';
    let sawPlaying = false;

    while (Date.now() - t0 < budgetMs) {
      await sleep(200);
      const elapsed = Date.now() - t0;

      const s = await page.evaluate(() => {
        const H = window.__ohHarness || {};
        return {
          state: window.__OH_STATE === undefined ? null : String(window.__OH_STATE),
          done: window.__OH_DONE === true,
          ended: H.ended != null,
          endedBy: H.endedBy || null,
        };
      }).catch(() => null);

      if (!s) break;
      if (s.state === 'playing' || s.state === 'running') sawPlaying = true;

      if (elapsed >= nextShot && shotIndex < shotCount) {
        shotIndex++;
        nextShot += shotEvery;
        const p = path.join(outDir, `${String(shotIndex).padStart(2, '0')}-t${Math.round(elapsed / 1000)}s.png`);
        await page.screenshot({ path: p }).catch(() => {});
        rep.shots.push(p);
        const px = await page.evaluate(samplePixels).catch(() => null);
        if (px && px.ok) samples.push(px);
        else if (px) rep.warnings.push(`pixel sample failed: ${px.reason}`);
      }

      if (s.done || s.ended || s.state === 'done' || s.state === 'ended' || s.state === 'error') {
        finished = true;
        finishedBy = s.endedBy || `__OH_STATE="${s.state}"` || '__OH_DONE';
        if (s.state === 'error') rep.failures.push('the player reported __OH_STATE="error"');
        break;
      }
      if (await endCardVisible(page)) {
        finished = true;
        finishedBy = 'end-card element became visible';
        break;
      }
    }

    const wallMs = Date.now() - t0;
    const realSeconds = wallMs / 1000;
    const normalised = realSeconds * Math.max(1, effectiveSpeed);

    const tail = path.join(outDir, '99-end.png');
    await page.screenshot({ path: tail }).catch(() => {});
    rep.shots.push(tail);
    const lastPx = await page.evaluate(samplePixels).catch(() => null);
    if (lastPx && lastPx.ok) samples.push(lastPx);

    /* ---- verdicts ---- */
    if (!finished) {
      if (!sawPlaying && samples.every((p) => p.colors <= 2)) {
        rep.notReady.push(
          `nothing ever rendered or finished in ${realSeconds.toFixed(1)}s — the episode module is probably not wired up yet`,
        );
      } else {
        rep.failures.push(
          `STALL: episode ${id} did not finish within ${(budgetMs / 1000).toFixed(0)}s `
          + `(speed ${effectiveSpeed}x). No completion signal — see the completion contract at the top of check.mjs.`,
        );
      }
    } else {
      rep.notes.push(`finished after ${realSeconds.toFixed(1)}s wall clock via ${finishedBy}`);
      rep.notes.push(
        effectiveSpeed > 1
          ? `≈${normalised.toFixed(1)}s at normal speed (measured at ${effectiveSpeed}x)`
          : `${normalised.toFixed(1)}s at normal speed`,
      );
      if (normalised < TARGET_MIN_S || normalised > TARGET_MAX_S) {
        rep.warnings.push(
          `runtime ${normalised.toFixed(1)}s is outside the ${TARGET_MIN_S}-${TARGET_MAX_S}s target`,
        );
      } else {
        rep.notes.push(`runtime is inside the ${TARGET_MIN_S}-${TARGET_MAX_S}s target`);
      }
    }

    /* ---- did anything actually get drawn ---- */
    if (!samples.length) {
      rep.notReady.push('never managed to sample the canvas (no canvas, or nothing rendered)');
    } else {
      const best = samples.reduce((a, b) => (b.stdDev > a.stdDev ? b : a));
      rep.notes.push(
        `canvas ${best.canvas}: best frame stdDev ${best.stdDev}, ${best.colors} distinct colours, mean luma ${best.mean}`,
      );
      if (best.stdDev < 2 || best.colors < 6) {
        rep.failures.push(
          `BLANK FRAME: every sampled frame is near-uniform (best stdDev ${best.stdDev}, `
          + `${best.colors} colours). Either nothing is being drawn or the camera is inside geometry.`,
        );
      }
      const dark = samples.filter((p) => p.mean < 3).length;
      if (dark === samples.length) rep.warnings.push('every sampled frame is almost black');
    }

    /* ---- frame rate ---- */
    const h = await page.evaluate(readHarness).catch(() => null);
    if (h && h.frameCount > 30) {
      if (h.p50 > FPS_P50_LIMIT) {
        rep.failures.push(
          `FRAME RATE COLLAPSE: median frame time ${h.p50}ms (${(1000 / h.p50).toFixed(1)} fps), limit ${FPS_P50_LIMIT}ms`,
        );
      } else if (h.p95 > FPS_P95_LIMIT) {
        rep.warnings.push(`long frames: p95 ${h.p95}ms, worst ${h.worst}ms`);
      }
    }

    await contactSheet(page, rep.shots, path.join(ctx.out, `${id}-grid.png`)).then((p) => {
      if (p) rep.shots.push(p);
    }).catch(() => {});
  });
}

/**
 * Composites the stills into one contact sheet, because six paths in a
 * terminal are harder to read than one picture.
 * @param {import('playwright-core').Page} page a page to borrow for rendering
 * @param {string[]} shots
 * @param {string} outFile
 * @returns {Promise<string|null>}
 */
async function contactSheet(page, shots, outFile) {
  const usable = [];
  for (const s of shots) {
    try {
      const buf = await fsp.readFile(s);
      if (buf.length < 8_000_000) usable.push({ name: path.basename(s), uri: `data:image/png;base64,${buf.toString('base64')}` });
    } catch {
      /* the screenshot never landed; skip it */
    }
  }
  if (usable.length < 2) return null;
  const cols = 3;
  const cellW = 480;
  const cellH = 270 + 18;
  const rows = Math.ceil(usable.length / cols);
  const html = `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#07090f;font:11px/1.4 ui-monospace,monospace;color:#8fa;}
    .g{display:grid;grid-template-columns:repeat(${cols},${cellW}px);gap:8px;padding:8px;}
    figure{margin:0}img{width:${cellW}px;display:block;image-rendering:pixelated;background:#000}
    figcaption{padding:2px 0}
  </style><div class="g">${usable.map((u) => `<figure><img src="${u.uri}"><figcaption>${u.name}</figcaption></figure>`).join('')}</div>`;
  const sheet = await page.context().newPage();
  try {
    await sheet.setViewportSize({ width: cols * cellW + 8 * (cols + 1), height: rows * cellH + 8 * (rows + 1) });
    await sheet.setContent(html, { waitUntil: 'load' });
    await sheet.screenshot({ path: outFile, fullPage: true });
    return outFile;
  } finally {
    await sheet.close().catch(() => {});
  }
}

/* ------------------------------------------------------------ player probe */

/**
 * Reads `/js/player.js` off disk and reports which harness hooks it
 * implements. Purely informational — the harness works either way.
 * @returns {{exists:boolean, hooks:string[], note:string}}
 */
export function probePlayerHooks() {
  const file = path.join(ROOT, 'js', 'player.js');
  let src = '';
  try {
    src = fs.readFileSync(file, 'utf8');
  } catch {
    return { exists: false, hooks: [], note: '/js/player.js does not exist yet — using the harness-side rAF fast-forward' };
  }
  const hooks = [];
  const probes = [
    ['__OH_SPEED', /__OH_SPEED\b/],
    ['__OH_SPEED_HANDLED', /__OH_SPEED_HANDLED/],
    ['__OH_TEST', /__OH_TEST\b/],
    ['__OH_STATE', /__OH_STATE\b/],
    ['__OH_DONE', /__OH_DONE\b/],
    ['oh-episode-end', /oh-episode-end/],
    ['__OH_POSTER', /__OH_POSTER\b/],
    ['poster=1', /poster/],
    ['data-oh-play', /data-oh-play/],
  ];
  for (const [name, re] of probes) if (re.test(src)) hooks.push(name);
  return {
    exists: true,
    hooks,
    note: hooks.includes('__OH_SPEED_HANDLED')
      ? 'player.js handles __OH_SPEED itself'
      : 'player.js does not set __OH_SPEED_HANDLED — the harness dilates rAF time instead',
  };
}

/* -------------------------------------------------------------------- main */

/**
 * @param {string[]} argv
 * @returns {Object}
 */
function parseArgs(argv) {
  const o = {
    eps: null,
    page: 'all',
    speed: 1,
    strict: false,
    headed: false,
    out: DEFAULT_OUT,
    port: 0,
    watch: '/watch.html',
  };
  for (const a of argv) {
    if (a === '--fast') o.speed = FAST_SPEED;
    else if (a.startsWith('--speed=')) o.speed = Math.max(1, Number(a.slice(8)) || 1);
    else if (a.startsWith('--ep=')) o.eps = a.slice(5).split(',').map((s) => s.trim()).filter(Boolean);
    else if (a.startsWith('--page=')) o.page = a.slice(7);
    else if (a.startsWith('--out=')) o.out = a.slice(6);
    else if (a.startsWith('--port=')) o.port = Number(a.slice(7)) || 0;
    else if (a.startsWith('--watch=')) o.watch = a.slice(8);
    else if (a === '--strict') o.strict = true;
    else if (a === '--headed') o.headed = true;
    else if (a === '-h' || a === '--help') o.help = true;
    else console.log(`(ignoring unknown argument ${a})`);
  }
  return o;
}

/** @returns {void} */
function usage() {
  console.log(`
OFFICE HOURS VII — smoke test

  node tools/check.mjs [options]

  --ep=ep1[,ep2]   only these episodes
  --page=gallery   only the landing page (also: watch, all)
  --fast           play at ${FAST_SPEED}x
  --speed=N        play at Nx
  --strict         "not ready" counts as failure
  --headed         run with a visible browser
  --out=DIR        screenshot directory (default ${DEFAULT_OUT})
  --watch=PATH     player page to drive (default /watch.html)
  --port=N         serve on this port instead of an auto-picked free one
`);
}

/**
 * @param {PageReport} rep
 * @returns {void}
 */
function printReport(rep) {
  const badge = {
    pass: 'PASS     ',
    fail: 'FAIL     ',
    'not-ready': 'NOT READY',
    skip: 'SKIP     ',
  }[rep.status];
  console.log(`\n${badge} ${rep.label}   ${rep.url}`);
  for (const n of rep.notes) console.log(`   · ${n}`);
  for (const f of rep.failures) console.log(`   ✗ ${f}`);
  for (const n of rep.notReady) console.log(`   ? ${n}`);
  for (const w of rep.warnings) console.log(`   ! ${w}`);
  if (rep.shots.length) {
    console.log(`   screenshots:`);
    for (const s of rep.shots) console.log(`     ${s}`);
  }
}

/**
 * Runs the whole check.
 * @param {string[]} [argv=process.argv.slice(2)]
 * @returns {Promise<number>} the process exit code
 */
export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    usage();
    return 0;
  }

  console.log('OFFICE HOURS VII — check');
  console.log(`  root   ${ROOT}`);
  console.log(`  speed  ${args.speed}x${args.speed > 1 ? ' (fast-forward)' : ''}`);

  const probe = probePlayerHooks();
  console.log(`  player /js/player.js ${probe.exists ? `present; hooks: ${probe.hooks.join(', ') || 'none found'}` : 'NOT PRESENT'}`);
  console.log(`         ${probe.note}`);

  const out = args.out;
  await ensureDir(out);

  let server = null;
  let browser = null;
  /** @type {PageReport[]} */
  const reports = [];

  try {
    server = await start({ port: args.port });
    console.log(`  serve  ${server.url}`);
  } catch (err) {
    console.error(`\nFATAL: could not start the dev server: ${err && err.message}`);
    return 2;
  }

  try {
    browser = await launchBrowser({ headed: args.headed });
    console.log(`  chrome ${browser.version()} (${findChromium()})`);
  } catch (err) {
    console.error(`\nFATAL: could not launch Chromium: ${err && err.message}`);
    await server.close();
    return 2;
  }

  const ctx = { browser, base: server.url, speed: args.speed, out, watch: args.watch };

  try {
    const explicitPage = args.page !== 'all';
    const wantGallery = args.page === 'gallery' || args.page === 'index'
      || (args.page === 'all' && !args.eps);
    const wantWatch = args.page === 'watch' || args.page === 'episodes'
      || (args.page === 'all' && (!explicitPage || !!args.eps));

    if (wantGallery) {
      reports.push(await checkGallery(ctx));
    }
    if (wantWatch) {
      const ids = args.eps || EPISODE_IDS;
      for (const id of ids) {
        if (!/^ep\d+$/.test(id)) {
          console.log(`(skipping "${id}" — episode ids look like ep1)`);
          continue;
        }
        reports.push(await checkEpisode(ctx, id));
      }
    }
  } catch (err) {
    console.error(`\nFATAL: the harness itself fell over: ${(err && err.stack) || err}`);
    reports.push(Object.assign(makeReport('harness', '-'), {
      status: 'fail',
      failures: [`harness crash: ${(err && err.message) || err}`],
    }));
  } finally {
    await browser.close().catch(() => {});
    await server.close().catch(() => {});
  }

  for (const rep of reports) printReport(rep);

  const failed = reports.filter((r) => r.status === 'fail');
  const notReady = reports.filter((r) => r.status === 'not-ready');
  const passed = reports.filter((r) => r.status === 'pass');

  console.log('\n────────────────────────────────────────────────────────');
  for (const r of reports) {
    console.log(`RESULT ${r.status.toUpperCase().padEnd(9)} ${r.label}`);
  }
  console.log(
    `CHECK: ${passed.length} passed, ${failed.length} failed, ${notReady.length} not ready`
    + ` — screenshots in ${out}`,
  );
  if (failed.length) {
    console.log('CHECK: FAILED');
    for (const r of failed) for (const f of r.failures) console.log(`  FAIL ${r.label}: ${f.split('\n')[0]}`);
  } else if (notReady.length) {
    console.log(`CHECK: OK so far — ${notReady.length} thing(s) are still being written`);
    for (const r of notReady) for (const n of r.notReady) console.log(`  PENDING ${r.label}: ${n}`);
  } else {
    console.log('CHECK: ALL GREEN');
  }
  console.log('────────────────────────────────────────────────────────');

  if (failed.length) return 1;
  if (args.strict && notReady.length) return 1;
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(`FATAL: ${(err && err.stack) || err}`);
      process.exit(2);
    });
}
