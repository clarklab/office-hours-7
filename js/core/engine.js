/**
 * OFFICE HOURS — runtime shell.
 *
 * `createStage(canvas)` hands back the one object every other module in the show
 * talks to: a scene that is already fogged and lit the way 1997 expected, a
 * fixed 55-degree 16:9 camera, an ordered per-frame update bus, and a render
 * loop that pushes everything through the PS1 pipeline.
 *
 * The camera aspect never changes — the scene is always composed for a 384x216
 * frame. `resize()` only decides how big that frame is drawn on the page.
 *
 * @module core/engine
 */

import * as THREE from 'three';
import { VIRTUAL_W, VIRTUAL_H, createPS1Pipeline, updatePS1Lights } from './ps1.js';

/** Largest integer upscale we will ask the GPU for (6 => 2304x1296). */
const MAX_SCALE = 6;

/** Longest frame we will simulate; anything slower runs in slow motion. */
const MAX_DT = 1 / 20;

/**
 * @typedef {Object} Stage
 * @property {THREE.Scene} scene
 * @property {THREE.PerspectiveCamera} camera
 * @property {THREE.WebGLRenderer} renderer
 * @property {HTMLCanvasElement} canvas
 * @property {number} time seconds of simulated time since the first `start()`
 * @property {(fn: (dt: number, t: number) => void) => (() => void)} onUpdate registers a per-frame callback, returns an unsubscribe
 * @property {() => void} start
 * @property {() => void} stop
 * @property {() => void} dispose
 * @property {(w: number, h: number) => void} resize
 * @property {import('./ps1.js').PS1Pipeline} pipeline additive: the PS1 post chain
 * @property {number} displayWidth additive: CSS width of the letterboxed frame
 * @property {number} displayHeight additive: CSS height of the letterboxed frame
 * @property {boolean} running additive
 */

/**
 * Builds the stage: renderer, PS1 pipeline, fogged scene, camera and rAF loop.
 *
 * Nothing is added to the scene and the loop is not started — call `start()`
 * once the set and cast are in.
 *
 * @param {HTMLCanvasElement} canvas the output canvas
 * @returns {Stage}
 */
export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    stencil: false,
    depth: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.autoClear = true;
  renderer.sortObjects = true;
  renderer.setClearColor(0x101822, 1);

  canvas.style.imageRendering = 'pixelated';
  canvas.style.display = 'block';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x101822);
  scene.fog = new THREE.FogExp2(0x101822, 0.020);

  const camera = new THREE.PerspectiveCamera(55, VIRTUAL_W / VIRTUAL_H, 0.1, 200);
  camera.position.set(0, 1.6, 4);
  scene.add(camera);

  const pipeline = createPS1Pipeline(renderer);

  /** @type {Array<(dt: number, t: number) => void>} */
  const updates = [];
  /** Snapshot buffer so a callback may unsubscribe itself mid-frame. */
  let running = [];

  let rafId = 0;
  let isRunning = false;
  let disposed = false;
  let last = 0;
  let time = 0;
  let displayW = VIRTUAL_W;
  let displayH = VIRTUAL_H;

  /**
   * @param {(dt: number, t: number) => void} fn
   * @returns {() => void}
   */
  function onUpdate(fn) {
    if (typeof fn !== 'function') return () => {};
    updates.push(fn);
    let live = true;
    return () => {
      if (!live) return;
      live = false;
      const i = updates.indexOf(fn);
      if (i !== -1) updates.splice(i, 1);
    };
  }

  function frame(now) {
    if (!isRunning || disposed) return;
    rafId = requestAnimationFrame(frame);

    const dt = Math.min(MAX_DT, Math.max(0, (now - last) / 1000));
    last = now;
    time += dt;

    running = updates.slice();
    for (let i = 0; i < running.length; i++) {
      running[i](dt, time);
    }

    updatePS1Lights(scene);
    pipeline.render(scene, camera);
  }

  function start() {
    if (isRunning || disposed) return;
    isRunning = true;
    last = performance.now();
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    if (!isRunning) return;
    isRunning = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  /**
   * Fits the 16:9 frame inside a `w` x `h` box (letterboxing on whichever axis
   * has room to spare), picks an integer upscale for the drawing buffer, and
   * sets the canvas CSS size. The internal render target stays 384x216.
   *
   * @param {number} w available width in CSS pixels
   * @param {number} h available height in CSS pixels
   */
  function resize(w, h) {
    if (disposed) return;
    const boxW = Math.max(1, Math.floor(w || 1));
    const boxH = Math.max(1, Math.floor(h || 1));
    const aspect = VIRTUAL_W / VIRTUAL_H;

    let cssW = boxW;
    let cssH = Math.round(cssW / aspect);
    if (cssH > boxH) {
      cssH = boxH;
      cssW = Math.round(cssH * aspect);
    }
    displayW = cssW;
    displayH = cssH;

    const scale = Math.max(1, Math.min(MAX_SCALE, Math.round(cssW / VIRTUAL_W)));
    pipeline.setDisplaySize(VIRTUAL_W * scale, VIRTUAL_H * scale);

    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
  }

  /** Frees every GL resource this stage owns. The stage is unusable after. */
  function dispose() {
    if (disposed) return;
    stop();
    disposed = true;

    /** @type {Set<THREE.Texture>} */
    const textures = new Set();
    scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
      for (const m of mats) {
        for (const key of Object.keys(m)) {
          const v = m[key];
          if (v && v.isTexture) textures.add(v);
        }
        if (m.uniforms) {
          for (const key of Object.keys(m.uniforms)) {
            const v = m.uniforms[key] && m.uniforms[key].value;
            if (v && v.isTexture) textures.add(v);
          }
        }
        m.dispose();
      }
    });
    for (const t of textures) t.dispose();

    scene.clear();
    updates.length = 0;
    pipeline.dispose();
    renderer.dispose();
  }

  /** @type {Stage} */
  const stage = {
    scene,
    camera,
    renderer,
    canvas,
    pipeline,
    onUpdate,
    start,
    stop,
    dispose,
    resize,
    get time() { return time; },
    get running() { return isRunning; },
    get displayWidth() { return displayW; },
    get displayHeight() { return displayH; },
  };

  resize(canvas.clientWidth || VIRTUAL_W * 3, canvas.clientHeight || VIRTUAL_H * 3);

  return stage;
}
