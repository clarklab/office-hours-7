/**
 * OFFICE HOURS VII — the live hero.
 *
 * The landing page ships `/assets/logo.png` as its hero: a frozen frame of the
 * 3D lockup staged in the office. This module replaces that plate with the real
 * thing — the same office, the same lockup, the same `windowWall` shot and the
 * same framing helper the brand shot uses — and then lets the camera breathe so
 * it is obvious the frame is being rendered right now:
 *
 * - DRIFT: a slow, never-quite-repeating handheld float. Layered sines at
 *   non-harmonic rates on position, look target and roll, all driven by stage
 *   time so it is frame-rate independent.
 * - TILT: on a desktop the pointer nudges the camera around the look point; on a
 *   phone the device's orientation does, relative to however it was held when
 *   the first reading arrived. iOS gates orientation behind a permission prompt
 *   that must come from a user gesture, so it is requested on the first tap on
 *   the hero, silently, and a refusal just leaves the drift.
 *
 * `prefers-reduced-motion: reduce` turns both off (the scene still renders, the
 * camera just holds the shot). The loop stops whenever the hero is scrolled
 * away or the tab is hidden.
 *
 * Loaded by `gallery.js` through a dynamic import only, so the landing page's
 * static import graph still never reaches three.js.
 *
 * @module brand/hero3d
 */

import { createStage } from '../core/engine.js';
import { createOffice } from '../sets/office.js';
import { createLogo3D, frameLockup } from './logo3d.js';

/** The brand shot, as `office.shots.windowWall`, in case the set ever lacks it. */
const FALLBACK_SHOT = { pos: [0.0, 1.58, -1.4], look: [0.0, 1.45, -6.9], fov: 56 };

/**
 * Drift terms, world units (metres) and radians. Each channel is a sum of
 * `[amplitude, rate rad/s, phase]` sines. The rates are chosen to share no
 * small common multiple, so the path never visibly loops.
 */
const DRIFT = {
  x: [[0.14, 0.21, 0.0], [0.06, 0.53, 1.7], [0.022, 1.31, 0.4]],
  y: [[0.045, 0.29, 0.9], [0.018, 0.83, 2.3]],
  z: [[0.08, 0.13, 2.1], [0.03, 0.47, 0.0]],
  lookX: [[0.10, 0.17, 0.5], [0.04, 0.71, 2.9]],
  lookY: [[0.05, 0.23, 1.1], [0.02, 0.97, 0.0]],
  roll: [[0.006, 0.19, 0.3], [0.003, 0.67, 1.9]],
};

/** How far a full tilt (pointer at the hero's edge, or ~22 deg of device tilt) swings the camera. */
const TILT = { x: 0.36, y: 0.18, lookX: 0.10, lookY: 0.05 };

/** Degrees of device rotation that count as a full tilt. */
const DEVICE_RANGE = 22;

/** Easing rates, 1/s. Higher is snappier. */
const EASE_TILT = 3.0;
const EASE_MOTION = 1.2;
/** How quickly the device's neutral pose follows a changed grip, 1/s. */
const NEUTRAL_FOLLOW = 0.12;

/** @param {number[][]} terms @param {number} t */
function wave(terms, t) {
  let v = 0;
  for (let i = 0; i < terms.length; i++) v += terms[i][0] * Math.sin(t * terms[i][1] + terms[i][2]);
  return v;
}

/** @param {number} v @returns {number} v clamped to [-1, 1] */
const clamp1 = (v) => Math.max(-1, Math.min(1, v));

/** @returns {boolean} */
export function hasWebGL2() {
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
 * @typedef {Object} LiveHero
 * @property {HTMLCanvasElement} canvas
 * @property {(w:number) => void} resize draw the 16:9 frame `w` CSS px wide
 * @property {() => void} dispose
 */

/**
 * Builds the live hero. Resolves once a real frame has been rendered, so the
 * caller can swap it in for the plate with no blank flash.
 *
 * @param {Object} o
 * @param {HTMLElement} o.gestureHost element whose first tap asks iOS for orientation
 * @param {number} o.width initial CSS width
 * @param {() => void} [o.onLost] called if the GL context is lost after mount
 * @returns {Promise<LiveHero>}
 */
export async function createLiveHero(o) {
  const canvas = document.createElement('canvas');
  canvas.className = 'hero-plate hero-live';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'OFFICE HOURS VII — a MUNCH production');

  const stage = createStage(canvas);
  const { camera } = stage;

  const office = createOffice();
  stage.scene.add(office.group);
  const unOffice = stage.onUpdate((dt, t) => { try { office.update(dt, t); } catch { /* cosmetic */ } });

  const shot = (office.shots && office.shots.windowWall) || FALLBACK_SHOT;
  const base = { pos: shot.pos.slice(), look: shot.look.slice(), fov: shot.fov || 55 };

  camera.fov = base.fov;
  camera.updateProjectionMatrix();
  camera.position.set(base.pos[0], base.pos[1], base.pos[2]);
  camera.lookAt(base.look[0], base.look[1], base.look[2]);
  camera.updateMatrixWorld(true);

  // Framed exactly as the brand plate is, from the resting camera. The lockup
  // then stays put in the world while the camera floats, so it parallaxes
  // against the window wall behind it — which is most of what sells "live".
  const logo = createLogo3D({ scale: 1, overlay: true });
  frameLockup(logo, camera, { dist: 3.2, fill: 0.74, yaw: -5, pitch: 5 });
  stage.scene.add(logo.group);

  /* ------------------------------------------------------------ motion state */

  const reduce = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  /** 1 = full drift and tilt, 0 = held shot. Eased, so toggling the OS setting never snaps. */
  let motion = reduce && reduce.matches ? 0 : 1;
  let motionTarget = motion;
  const onReduce = () => { motionTarget = reduce && reduce.matches ? 0 : 1; };
  if (reduce) {
    if (reduce.addEventListener) reduce.addEventListener('change', onReduce);
    else if (reduce.addListener) reduce.addListener(onReduce);
  }

  /** Tilt target and eased value, each axis in [-1, 1]. +x = right, +y = up. */
  const tiltTarget = { x: 0, y: 0 };
  const tilt = { x: 0, y: 0 };
  let usingDevice = false;

  /* --- pointer (mouse / pen only; a finger dragging is scrolling the page) --- */
  const onPointer = (e) => {
    if (usingDevice || e.pointerType === 'touch') return;
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    tiltTarget.x = clamp1((e.clientX - (r.left + r.width / 2)) / (r.width / 2));
    tiltTarget.y = clamp1(-(e.clientY - (r.top + r.height / 2)) / (r.height / 2));
  };
  const onPointerOut = (e) => {
    if (usingDevice) return;
    if (!e.relatedTarget) { tiltTarget.x = 0; tiltTarget.y = 0; }
  };
  window.addEventListener('pointermove', onPointer, { passive: true });
  document.addEventListener('pointerout', onPointerOut, { passive: true });

  /* --- device orientation ------------------------------------------------ */
  /** Neutral pose in screen-space degrees, taken from the first reading. */
  let neutral = null;
  /** Latest screen-space reading, for the slow neutral follow. */
  const reading = { x: 0, y: 0 };

  /** @returns {number} the screen's rotation, 0 / 90 / 180 / 270 */
  const screenAngle = () => {
    const so = typeof screen !== 'undefined' && screen.orientation;
    if (so && typeof so.angle === 'number') return ((so.angle % 360) + 360) % 360;
    const wo = /** @type {any} */ (window).orientation;
    return typeof wo === 'number' ? ((wo % 360) + 360) % 360 : 0;
  };

  const onOrient = (e) => {
    if (e.beta === null || e.gamma === null || e.beta === undefined || e.gamma === undefined) return;
    // beta: front/back tilt, gamma: left/right tilt, both relative to the
    // device's natural (portrait) axes. Map them onto the screen's axes.
    const a = screenAngle();
    let x = e.gamma;
    let y = e.beta;
    if (a === 90) { x = e.beta; y = -e.gamma; } else if (a === 270) { x = -e.beta; y = e.gamma; } else if (a === 180) { x = -e.gamma; y = -e.beta; }
    reading.x = x;
    reading.y = y;
    if (!neutral) neutral = { x, y };
    usingDevice = true;
    tiltTarget.x = clamp1((x - neutral.x) / DEVICE_RANGE);
    // Tipping the top edge away (beta falling) looks up into the room.
    tiltTarget.y = clamp1(-(y - neutral.y) / DEVICE_RANGE);
  };
  const onScreenTurn = () => { neutral = null; };

  let orientListening = false;
  const listenOrientation = () => {
    if (orientListening) return;
    orientListening = true;
    window.addEventListener('deviceorientation', onOrient, { passive: true });
    window.addEventListener('orientationchange', onScreenTurn);
  };

  /** @type {HTMLElement|null} */
  const host = o.gestureHost || null;
  const DOE = typeof DeviceOrientationEvent !== 'undefined' ? DeviceOrientationEvent : null;
  const needsPermission = !!(DOE && typeof /** @type {any} */ (DOE).requestPermission === 'function');
  const onGesture = () => {
    if (host) {
      host.removeEventListener('touchend', onGesture);
      host.removeEventListener('click', onGesture);
    }
    try {
      // Must be called synchronously inside the gesture. No UI of our own: iOS
      // shows its prompt, and "Don't Allow" (or any failure) leaves the drift.
      /** @type {any} */ (DOE).requestPermission()
        .then((state) => { if (state === 'granted') listenOrientation(); })
        .catch(() => {});
    } catch { /* not in a gesture, or not supported — drift only */ }
  };
  if (DOE) {
    if (needsPermission) {
      if (host) {
        host.addEventListener('touchend', onGesture, { passive: true });
        host.addEventListener('click', onGesture, { passive: true });
      }
    } else {
      listenOrientation();
    }
  }

  /* ------------------------------------------------------------ the camera */

  const unCam = stage.onUpdate((dt, t) => {
    const kM = 1 - Math.exp(-dt * EASE_MOTION);
    motion += (motionTarget - motion) * kM;

    const kT = 1 - Math.exp(-dt * EASE_TILT);
    tilt.x += (tiltTarget.x * motionTarget - tilt.x) * kT;
    tilt.y += (tiltTarget.y * motionTarget - tilt.y) * kT;

    // Let the device's neutral pose creep towards the current grip, so if the
    // phone is set down or held differently the scene recentres by itself.
    if (neutral && usingDevice) {
      const kN = 1 - Math.exp(-dt * NEUTRAL_FOLLOW);
      neutral.x += (reading.x - neutral.x) * kN;
      neutral.y += (reading.y - neutral.y) * kN;
    }

    const m = motion;
    camera.position.set(
      base.pos[0] + m * wave(DRIFT.x, t) + tilt.x * TILT.x,
      base.pos[1] + m * wave(DRIFT.y, t) + tilt.y * TILT.y,
      base.pos[2] + m * wave(DRIFT.z, t),
    );
    camera.lookAt(
      base.look[0] + m * wave(DRIFT.lookX, t) + tilt.x * TILT.lookX,
      base.look[1] + m * wave(DRIFT.lookY, t) + tilt.y * TILT.lookY,
      base.look[2],
    );
    camera.rotateZ(m * wave(DRIFT.roll, t) - tilt.x * 0.01);
  });

  /* ---------------------------------------------------- run only when seen */

  let onScreen = true;
  let disposed = false;
  const sync = () => {
    if (disposed) return;
    if (onScreen && !document.hidden) stage.start();
    else stage.stop();
  };
  const io = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver((entries) => {
      for (const en of entries) onScreen = en.isIntersecting;
      sync();
    })
    : null;
  if (io) io.observe(canvas);
  document.addEventListener('visibilitychange', sync);

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (io) io.disconnect();
    document.removeEventListener('visibilitychange', sync);
    window.removeEventListener('pointermove', onPointer);
    document.removeEventListener('pointerout', onPointerOut);
    window.removeEventListener('deviceorientation', onOrient);
    window.removeEventListener('orientationchange', onScreenTurn);
    if (host) {
      host.removeEventListener('touchend', onGesture);
      host.removeEventListener('click', onGesture);
    }
    if (reduce) {
      if (reduce.removeEventListener) reduce.removeEventListener('change', onReduce);
      else if (reduce.removeListener) reduce.removeListener(onReduce);
    }
    unCam();
    unOffice();
    try { logo.dispose(); } catch { /* ignore */ }
    try { office.dispose(); } catch { /* ignore */ }
    stage.dispose();
  };

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    dispose();
    if (typeof o.onLost === 'function') o.onLost();
  });

  const resize = (w) => {
    if (disposed) return;
    const cw = Math.max(1, Math.round(w));
    stage.resize(cw, Math.round(cw * 9 / 16));
  };
  resize(o.width);

  // Render a couple of frames before handing it over, so the swap from the
  // plate lands on a finished picture rather than a cleared buffer.
  stage.start();
  await new Promise((res) => {
    let n = 0;
    // In a background tab rAF does not tick, so this simply waits (keeping the
    // plate up) until the tab is shown and the first frames have landed.
    const off = stage.onUpdate(() => { if (++n >= 3) { off(); res(); } });
  });
  sync();

  return { canvas, resize, dispose };
}
