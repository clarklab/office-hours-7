#!/usr/bin/env node
/**
 * OFFICE HOURS VII — thumbnail generator.
 *
 * Loads `/watch.html?ep=epN&poster=1`, waits for the episode's `poster(ctx)`
 * pose to settle, and writes a crisp 16:9 PNG to `/assets/thumbs/epN.png`.
 *
 * ```
 * node tools/shoot.mjs             # ep1, ep2, ep3
 * node tools/shoot.mjs ep2         # just one
 * node tools/shoot.mjs brand       # /assets/og.png + /assets/logo.png
 * node tools/shoot.mjs cast        # /assets/cast/<id>.png, six real headshots
 * node tools/shoot.mjs --width=1536
 * ```
 *
 * Only the WebGL canvas is captured — never the DOM — so player chrome,
 * dialogue boxes and the PLAY button cannot leak into a thumbnail. The frame
 * is resampled to the 384x216 virtual buffer and then integer-upscaled with
 * smoothing off, so the result is true nearest-neighbour: the PS1 pixel grid
 * survives at poster size.
 *
 * ## The poster contract (as /js/player.js implements it)
 * With `?poster=1` in the URL — and `window.__OH_POSTER === true`, which this
 * tool also sets before any script runs — the player:
 * 1. builds the stage, the office and the cast exactly as for playback,
 * 2. skips the idle screen and the PLAY affordance,
 * 3. calls the episode's `poster(ctx)`, renders ~30 frames and stops the loop
 *    on that frame (the canvas keeps its `preserveDrawingBuffer` contents),
 * 4. sets `window.__OH_POSTER_READY = true`, sets `<html data-oh-poster="ready">`
 *    and dispatches `oh:poster-ready` on `window`.
 *
 * On failure it sets `window.__OH_POSTER_ERROR` to a message and
 * `<html data-oh-poster="error">`; this tool reports that instead of waiting.
 * With no signal at all it still shoots after `--wait` ms and says so.
 *
 * @module tools/shoot
 */

import fsp from 'node:fs/promises';
import path from 'node:path';
import { start, ROOT } from './serve.mjs';
import { launchBrowser, EPISODE_IDS, harnessInit } from './check.mjs';

/** Output width; 1152x648 is 3x the 384x216 virtual buffer. */
const DEFAULT_WIDTH = 1152;
/** Virtual buffer, mirrored from /js/core/ps1.js. */
const VW = 384;
const VH = 216;

/**
 * Grabs the biggest canvas on the page, resamples it to 384x216 and scales it
 * back up with nearest-neighbour. Runs inside the browser.
 * @param {{w:number, h:number}} o
 * @returns {{ok:boolean, reason?:string, data?:string, src?:string}}
 */
function grabCanvas(o) {
  const canvases = Array.from(document.querySelectorAll('canvas'))
    .filter((c) => c.width > 64 && c.height > 32)
    .sort((a, b) => b.width * b.height - a.width * a.height);
  if (!canvases.length) return { ok: false, reason: 'no WebGL canvas on the page' };
  const src = canvases[0];

  const small = document.createElement('canvas');
  small.width = 384;
  small.height = 216;
  const sctx = small.getContext('2d', { willReadFrequently: true });
  sctx.imageSmoothingEnabled = false;
  try {
    sctx.drawImage(src, 0, 0, 384, 216);
  } catch (err) {
    return { ok: false, reason: `could not read the canvas: ${err && err.message}` };
  }

  // Is there anything on it at all?
  const px = sctx.getImageData(0, 0, 384, 216).data;
  let mean = 0;
  let sq = 0;
  const n = 384 * 216;
  for (let i = 0; i < n; i += 7) {
    const l = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
    mean += l;
    sq += l * l;
  }
  const count = Math.ceil(n / 7);
  mean /= count;
  const stdDev = Math.sqrt(Math.max(0, sq / count - mean * mean));

  const big = document.createElement('canvas');
  big.width = o.w;
  big.height = o.h;
  const bctx = big.getContext('2d');
  bctx.imageSmoothingEnabled = false;
  bctx.webkitImageSmoothingEnabled = false;
  bctx.drawImage(small, 0, 0, o.w, o.h);

  return {
    ok: true,
    src: `${src.width}x${src.height}`,
    stdDev: Math.round(stdDev * 100) / 100,
    mean: Math.round(mean * 10) / 10,
    data: big.toDataURL('image/png'),
  };
}

/**
 * Shoots one episode.
 * @param {Object} ctx
 * @param {string} id
 * @returns {Promise<{id:string, ok:boolean, notReady?:boolean, file?:string, note:string}>}
 */
async function shoot(ctx, id) {
  const url = `${ctx.base}/watch.html?ep=${id}&poster=1`;
  const page = await ctx.browser.newPage({ viewport: { width: 1280, height: 720 } });
  /** @type {string[]} */
  const problems = [];

  page.on('pageerror', (e) => problems.push(String((e && e.message) || e)));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) problems.push(`HTTP ${r.status()} ${r.url().replace(ctx.base, '')}`); });

  try {
    await page.addInitScript(harnessInit, { speed: 1, poster: true });
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (res && res.status() === 404) {
      return { id, ok: false, notReady: true, note: '/watch.html does not exist yet (HTTP 404)' };
    }

    let signalled = false;
    try {
      await page.waitForFunction(
        () => window.__OH_POSTER_READY === true
          || typeof window.__OH_POSTER_ERROR === 'string'
          || document.documentElement.getAttribute('data-oh-poster') === 'ready'
          || document.documentElement.getAttribute('data-oh-poster') === 'error',
        null,
        { timeout: ctx.wait },
      );
      signalled = true;
    } catch {
      /* fall through to the fixed settle below */
    }

    const posterError = await page.evaluate(
      () => (typeof window.__OH_POSTER_ERROR === 'string' ? window.__OH_POSTER_ERROR : null),
    ).catch(() => null);
    if (posterError) {
      // "not available yet" is an episode nobody has written; anything else is
      // a real problem in a page that does exist.
      const pending = /not available|not found|has not been (filmed|shot)|404/i.test(posterError);
      return {
        id,
        ok: false,
        notReady: pending,
        note: `the player could not pose ${id}: ${posterError}`,
      };
    }

    // Let the wobble and the fluorescent flicker land on a frame either way.
    await page.waitForTimeout(signalled ? 500 : 800);

    const grab = await page.evaluate(grabCanvas, { w: ctx.width, h: Math.round((ctx.width * VH) / VW) });
    if (!grab || !grab.ok) {
      return {
        id,
        ok: false,
        notReady: /no WebGL canvas/.test((grab && grab.reason) || ''),
        note: `${(grab && grab.reason) || 'nothing to capture'}${problems.length ? ` — first problem: ${problems[0]}` : ''}`,
      };
    }
    if (grab.stdDev < 1.5) {
      return {
        id,
        ok: false,
        note: `the frame is blank (stdDev ${grab.stdDev}) — the poster pose probably has not run${problems.length ? `; first problem: ${problems[0]}` : ''}`,
      };
    }

    const file = path.join(ctx.out, `${id}.png`);
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await fsp.writeFile(file, Buffer.from(grab.data.split(',')[1], 'base64'));
    return {
      id,
      ok: true,
      file,
      note: `${ctx.width}x${Math.round((ctx.width * VH) / VW)} from a ${grab.src} buffer`
        + `${signalled ? '' : ' (no __OH_POSTER_READY signal; shot on a timer)'}`,
    };
  } catch (err) {
    return { id, ok: false, note: `${(err && err.message) || err}` };
  } finally {
    /* the page always closes, shot or not */
    await page.close().catch(() => {});
  }
}

/**
 * Shoots the brand plate: the 3D lockup staged in the office, via the player's
 * `&brand=1` poster mode.
 *
 * This writes the social card from the same geometry and the same framing
 * helper the episode title card uses, so the image someone sees in a link
 * preview cannot drift away from the one the show actually opens with.
 *
 * `/assets/og.png` is 1200x630 (the Open Graph size, a wider aspect than the
 * 16:9 buffer, so the source is scaled to cover and trimmed top and bottom).
 * `/assets/logo.png` keeps the buffer's own 16:9 for the gallery hero.
 *
 * @param {Object} ctx
 * @returns {Promise<{id:string, ok:boolean, note:string}>}
 */
async function shootBrand(ctx) {
  const url = `${ctx.base}/watch.html?ep=ep1&poster=1&brand=1`;
  const page = await ctx.browser.newPage({ viewport: { width: 1280, height: 720 } });
  /** @type {string[]} */
  const problems = [];
  page.on('pageerror', (e) => problems.push(String((e && e.message) || e)));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: ctx.wait });
    await page.waitForFunction(
      () => window.__OH_POSTER_READY === true
        || document.documentElement.getAttribute('data-oh-poster') === 'ready'
        || document.documentElement.getAttribute('data-oh-poster') === 'error',
      { timeout: ctx.wait },
    );
    const state = await page.evaluate(
      () => document.documentElement.getAttribute('data-oh-poster'),
    );
    if (state === 'error') return { id: 'brand', ok: false, note: 'poster reported an error' };

    const shots = await page.evaluate(() => {
      const src = document.getElementById('scene');
      if (!src) return null;
      /** Nearest-neighbour scale-to-cover, so the pixel grid survives. */
      const plate = (w, h) => {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const g = c.getContext('2d');
        g.imageSmoothingEnabled = false;
        const k = Math.max(w / 384, h / 216);
        const dw = Math.round(384 * k);
        const dh = Math.round(216 * k);
        g.drawImage(src, Math.round((w - dw) / 2), Math.round((h - dh) / 2), dw, dh);
        return c.toDataURL('image/png');
      };
      return { og: plate(1200, 630), logo: plate(1152, 648) };
    });
    if (!shots) return { id: 'brand', ok: false, note: 'no canvas' };

    const dir = path.join(ROOT, 'assets');
    await fsp.mkdir(dir, { recursive: true });
    for (const [name, data] of [['og.png', shots.og], ['logo.png', shots.logo]]) {
      await fsp.writeFile(path.join(dir, name), Buffer.from(data.split(',')[1], 'base64'));
    }
    const note = problems.length ? `written, with ${problems.length} console problem(s)` : 'og.png 1200x630, logo.png 1152x648';
    return { id: 'brand', ok: true, note };
  } catch (err) {
    return { id: 'brand', ok: false, note: String((err && err.message) || err) };
  } finally {
    await page.close().catch(() => {});
  }
}

/* ------------------------------------------------------------------ *
 * cast headshots
 * ------------------------------------------------------------------ */

/** The cast, in billing order, and the filenames they are written under. */
const CAST_IDS = ['brad', 'dez', 'kiki', 'roop', 'marge', 'tuesday'];

/** Output edge, in pixels. 256 = CAST_CROP * CAST_SCALE, so the upscale is exact. */
const CAST_PX = 256;

/**
 * Virtual pixels of the 384x216 frame kept. A square crop out of the middle of
 * the PS1 buffer, so the headshot is composed at a true 128x128 and then
 * doubled: every source pixel becomes exactly 2x2 output pixels.
 */
const CAST_CROP = 128;
/** Integer upscale from {@link CAST_CROP} to {@link CAST_PX}. */
const CAST_SCALE = 2;

/** Backdrop, matching the site's ink. The renderer has no alpha channel. */
const CAST_BG = 0x0a0f18;

/**
 * Per-character framing tweaks, merged over the defaults in
 * {@link renderHeadshot}. `fill` is the fraction of the square crop the head's
 * bounding box should span, `lift` raises the camera above the head's centre in
 * metres, and `yaw` turns the character (radians, + = their left toward us).
 *
 * ROOP's hood swallows the top of his head box, so he is framed a shade looser;
 * TUESDAY is a dachshund: straight on she is all snout, so she is turned into
 * a three-quarter view that shows the nose, the grey muzzle and the flipped ear.
 * @type {Object<string, {fill?:number, lift?:number, yaw?:number}>}
 */
const CAST_FRAMING = {
  roop: { fill: 0.80 },
  tuesday: { fill: 0.74, lift: 0.04, yaw: 0.75 },
};

/**
 * The harness page. Served straight out of memory by a Playwright route on the
 * dev origin, so module specifiers resolve against the real site and nothing is
 * ever written into the repo.
 */
const CAST_HARNESS = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>cast headshots</title>
<script type="importmap">{"imports":{"three":"/vendor/three.module.js"}}</script>
<style>html,body{margin:0;background:#05070c}canvas{display:block}</style>
</head><body></body></html>`;

/**
 * The one module the harness loads: it pulls the real engine and the real cast
 * registry in through the import map and parks them on `window` so the plain
 * functions below (which Playwright ships over as source text, and which
 * therefore cannot have imports of their own) can use them.
 */
const CAST_BOOT = `
import * as THREE from 'three';
import { createStage } from '/js/core/engine.js';
import { loadCast, spawn } from '/js/characters/index.js';
window.__ohCast = { THREE, createStage, loadCast, spawn };
window.__ohCastReady = true;
`;

/**
 * Renders one character's head into the harness canvas and hands back a PNG
 * data URL of the square crop. Runs INSIDE the browser.
 *
 * The rig is not self-driving: `actor.update(dt, t)` has to be called every
 * frame from the stage's update bus or the character never leaves its rest pose
 * and the idle animation never settles. The camera is re-aimed on the same bus,
 * after the actor has moved, so the head stays centred while it breathes.
 *
 * @param {Object} o
 * @returns {Promise<{ok:boolean, reason?:string, data?:string, mean?:number, stdDev?:number, frames?:number, dist?:number, head?:string}>}
 */
async function renderHeadshot(o) {
  const api = window.__ohCast;
  if (!api) return { ok: false, reason: 'the harness module never loaded' };
  const { THREE, createStage, loadCast, spawn } = api;

  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);

  /** @type {any} */
  let stage = null;
  try {
    stage = createStage(canvas);
    // No fog and no distance haze: this is a portrait, not a room.
    stage.scene.fog = null;
    stage.scene.background = new THREE.Color(o.bg);
    stage.renderer.setClearColor(o.bg, 1);
    // An exact multiple of the 384x216 buffer, so the crop lands on whole pixels.
    stage.pipeline.setDisplaySize(384 * o.scale, 216 * o.scale);

    await loadCast([o.id]);
    const actor = spawn(o.id);
    const root = actor.group || actor.root || actor;
    if (!root) return { ok: false, reason: `spawn('${o.id}') returned nothing to add` };
    root.rotation.y = o.yaw || 0;
    stage.scene.add(root);

    // Without light every PS1 material renders black.
    stage.scene.add(new THREE.AmbientLight(0xdde6f5, 0.58));
    const key = new THREE.PointLight(0xfff0d6, 1.45, 0);
    const fill = new THREE.PointLight(0x9ab8ff, 0.55, 0);
    stage.scene.add(key);
    stage.scene.add(fill);

    if (typeof actor.lookAt === 'function') actor.lookAt(null);
    if (typeof actor.play === 'function') actor.play('idle');

    let frames = 0;
    stage.onUpdate((dt, t) => { if (typeof actor.update === 'function') actor.update(dt, t); });

    const box = new THREE.Box3();
    const size = new THREE.Vector3();
    const centre = new THREE.Vector3();
    let dist = 1.15;
    let note = 'head';

    // Half-angle of the square crop: the camera's vertical fov, scaled down by
    // the slice of the 216-line frame we keep.
    const tanHalf = (o.crop / 216) * Math.tan((stage.camera.fov * Math.PI) / 360);

    const aim = () => {
      root.updateMatrixWorld(true);
      const head = actor.head || null;
      box.makeEmpty();
      if (head) box.setFromObject(head);
      if (box.isEmpty() || !isFinite(box.min.y)) {
        // No head joint: fall back to the top of the whole rig.
        box.setFromObject(root);
        const top = box.max.y;
        box.min.set(box.min.x, top - 0.40, box.min.z);
        note = 'rig top (no head joint)';
      }
      box.getSize(size);
      box.getCenter(centre);
      const span = Math.max(size.x, size.y);
      dist = (span * 0.5) / o.fill / tanHalf + size.z * 0.5;
      const eye = centre.y + o.lift;
      stage.camera.position.set(centre.x, eye, centre.z + dist);
      stage.camera.lookAt(centre.x, centre.y, centre.z);
      key.position.set(centre.x + dist * 0.8, eye + dist * 0.75, centre.z + dist * 0.9);
      fill.position.set(centre.x - dist * 0.95, eye + dist * 0.1, centre.z + dist * 0.7);
    };
    aim();
    stage.onUpdate(() => { frames++; aim(); });

    await new Promise((resolve) => {
      const t0 = performance.now();
      stage.start();
      const tick = () => {
        if (frames >= o.frames && performance.now() - t0 >= o.settleMs) { resolve(); return; }
        if (performance.now() - t0 > 8000) { resolve(); return; }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    stage.stop();

    // Crop the middle of the frame and blow it up with smoothing off, which at
    // an integer factor is a pure pixel double.
    const side = o.crop * o.scale;
    const out = document.createElement('canvas');
    out.width = o.px;
    out.height = o.px;
    const g = out.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingEnabled = false;
    g.webkitImageSmoothingEnabled = false;
    g.drawImage(
      canvas,
      Math.round((canvas.width - side) / 2), Math.round((canvas.height - side) / 2), side, side,
      0, 0, o.px, o.px,
    );

    const px = g.getImageData(0, 0, o.px, o.px).data;
    let mean = 0;
    let sq = 0;
    const n = o.px * o.px;
    for (let i = 0; i < n; i += 3) {
      const l = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
      mean += l;
      sq += l * l;
    }
    const count = Math.ceil(n / 3);
    mean /= count;

    return {
      ok: true,
      data: out.toDataURL('image/png'),
      mean: Math.round(mean * 10) / 10,
      stdDev: Math.round(Math.sqrt(Math.max(0, sq / count - mean * mean)) * 100) / 100,
      frames,
      dist: Math.round(dist * 1000) / 1000,
      head: note,
    };
  } catch (err) {
    return { ok: false, reason: String((err && err.message) || err) };
  } finally {
    try { if (stage) stage.dispose(); } catch { /* the context is going away anyway */ }
    try { canvas.remove(); } catch { /* ditto */ }
  }
}

/**
 * Shoots the six cast headshots into `assets/cast/<id>.png`.
 *
 * Each one is a REAL render of that character's rig — the same modules the
 * episodes build their cast from — framed on the head, lit with an ambient and
 * a point light, and cropped to a square out of the 384x216 PS1 buffer.
 *
 * ROOP is meant to be half-hidden under his hood and TUESDAY is meant to be a
 * dog; neither is a framing bug.
 *
 * @param {Object} ctx
 * @param {string[]} ids
 * @returns {Promise<Array<{id:string, ok:boolean, file?:string, note:string}>>}
 */
async function shootCast(ctx, ids) {
  const url = `${ctx.base}/__oh-cast-harness__.html`;
  const page = await ctx.browser.newPage({ viewport: { width: 900, height: 600 } });
  /** @type {string[]} */
  const problems = [];
  page.on('pageerror', (e) => problems.push(String((e && e.message) || e)));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });

  /** @type {Array<{id:string, ok:boolean, file?:string, note:string}>} */
  const results = [];
  try {
    // The harness never touches the disk: it is fulfilled from memory on the
    // dev origin, so `/js/...` and the import map still resolve normally.
    await page.route(url, (route) => route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: CAST_HARNESS,
    }));
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: ctx.wait });
    await page.addScriptTag({ type: 'module', content: CAST_BOOT });
    await page.waitForFunction(() => window.__ohCastReady === true, null, { timeout: ctx.wait });

    const dir = ctx.out;
    await fsp.mkdir(dir, { recursive: true });

    for (const id of ids) {
      const before = problems.length;
      const opts = Object.assign({
        id,
        px: CAST_PX,
        crop: CAST_CROP,
        scale: CAST_SCALE,
        bg: CAST_BG,
        fill: 0.86,
        lift: 0.03,
        yaw: 0,
        frames: 40,
        settleMs: 900,
      }, CAST_FRAMING[id] || {});

      const shot = await page.evaluate(renderHeadshot, opts).catch((err) => ({
        ok: false, reason: String((err && err.message) || err),
      }));
      const late = problems.slice(before);

      if (!shot || !shot.ok) {
        results.push({ id, ok: false, note: `${(shot && shot.reason) || 'nothing came back'}${late.length ? ` — ${late[0]}` : ''}` });
        continue;
      }
      if (shot.stdDev < 1.5) {
        results.push({ id, ok: false, note: `the frame is blank (stdDev ${shot.stdDev}, mean ${shot.mean}) — the rig probably never lit` });
        continue;
      }

      const file = path.join(dir, `${id}.png`);
      await fsp.writeFile(file, Buffer.from(shot.data.split(',')[1], 'base64'));
      results.push({
        id,
        ok: true,
        file,
        note: `${CAST_PX}x${CAST_PX} from a ${CAST_CROP}px crop, ${shot.frames} frames, `
          + `camera ${shot.dist}m off the ${shot.head}, stdDev ${shot.stdDev}`
          + `${late.length ? ` (${late.length} console problem(s))` : ''}`,
      });
    }
  } catch (err) {
    results.push({ id: 'cast', ok: false, note: String((err && err.message) || err) });
  } finally {
    await page.close().catch(() => {});
  }
  return results;
}

/**
 * @param {string[]} [argv=process.argv.slice(2)]
 * @returns {Promise<number>} process exit code
 */
export async function main(argv = process.argv.slice(2)) {
  const ids = [];
  const castIds = [];
  let wantBrand = false;
  let wantCast = false;
  let width = DEFAULT_WIDTH;
  let wait = 12000;
  let out = path.join(ROOT, 'assets', 'thumbs');
  let outSet = false;

  for (const a of argv) {
    if (a.startsWith('--width=')) width = Math.max(384, Number(a.slice(8)) || DEFAULT_WIDTH);
    else if (a.startsWith('--wait=')) wait = Math.max(500, Number(a.slice(7)) || 12000);
    else if (a.startsWith('--out=')) { out = path.resolve(a.slice(6)); outSet = true; }
    else if (a === '-h' || a === '--help') {
      console.log('node tools/shoot.mjs [ep1 ep2 ... | brand | cast [brad dez ...]] [--width=1152] [--wait=12000] [--out=DIR]');
      return 0;
    } else if (a === 'brand') wantBrand = true;
    else if (a === 'cast') wantCast = true;
    else if (/^ep\d+$/.test(a)) ids.push(a);
    else if (CAST_IDS.includes(a)) { wantCast = true; castIds.push(a); }
    else console.log(`(ignoring unknown argument ${a})`);
  }

  const episodes = ids.length ? ids : EPISODE_IDS;
  const cast = castIds.length ? castIds : CAST_IDS;
  if (wantCast && !outSet) out = path.join(ROOT, 'assets', 'cast');
  if (wantCast) console.log(`OFFICE HOURS VII — cast headshots -> ${out}`);
  else if (wantBrand) console.log(`OFFICE HOURS VII — brand plate -> ${path.join(ROOT, 'assets')}`);
  else console.log(`OFFICE HOURS VII — thumbnails -> ${out}`);

  const server = await start({ port: 0 });
  let browser;
  try {
    browser = await launchBrowser({});
  } catch (err) {
    console.error(`FATAL: could not launch Chromium: ${err && err.message}`);
    await server.close();
    return 2;
  }

  const ctx = { browser, base: server.url, width, wait, out };
  const results = [];
  try {
    if (wantCast) results.push(...await shootCast(ctx, cast));
    else if (wantBrand) results.push(await shootBrand(ctx));
    else for (const id of episodes) results.push(await shoot(ctx, id));
  } finally {
    await browser.close().catch(() => {});
    await server.close().catch(() => {});
  }

  let written = 0;
  let pending = 0;
  let broken = 0;
  for (const r of results) {
    if (r.ok) {
      written++;
      console.log(`  OK        ${r.file}  (${r.note})`);
    } else if (r.notReady) {
      pending++;
      console.log(`  NOT READY ${r.id}: ${r.note}`);
    } else {
      broken++;
      console.log(`  FAILED    ${r.id}: ${r.note}`);
    }
  }
  console.log(`SHOOT: ${written} written, ${pending} not ready, ${broken} failed`);
  // An episode nobody has written yet is expected while the show is being
  // built; a page that exists and still cannot produce a frame is not.
  return broken ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(`FATAL: ${(err && err.stack) || err}`);
      process.exit(2);
    });
}
