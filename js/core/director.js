/**
 * OFFICE HOURS — the director.
 *
 * This is the layer the episode writers actually type into. A scene should read
 * like a screenplay:
 *
 * ```js
 * d.cut(office.shots.bullpenWide);
 * await d.title({ subtitle: 'EPISODE ONE — "STANDUP"' });
 * await d.walk(cast.brad, office.marks.whiteboard);
 * d.face(cast.brad, stage.camera);
 * await d.say(cast.brad, 'I don\'t believe in meetings.');
 * await d.say(cast.brad, 'That\'s why this is a ......standup.');
 * ```
 *
 * Three rules govern everything in here:
 *
 * 1. **Nothing uses `setTimeout`.** Every clock in the director is driven by
 *    `stage.onUpdate`, so pausing the stage pauses the cutscene, and a slow
 *    frame stretches the whole scene instead of desyncing it.
 * 2. **`cancel()` resolves, never rejects.** Every pending await settles on the
 *    next tick of the microtask queue and every *future* await settles
 *    immediately, so an episode's `run()` unwinds through its own `finally`
 *    blocks instead of throwing into the player.
 * 3. **Nothing here is allowed to explode.** Episodes are written in parallel
 *    with the cast and the set; actors arrive undefined, shots arrive as
 *    strings, the dialogue UI may not implement an optional method yet. Every
 *    one of those is a warning and a no-op, not a broken episode.
 *
 * @module core/director
 */

import * as THREE from 'three';
import { VIRTUAL_W, VIRTUAL_H } from './ps1.js';
import { playSfx, playMusic, stopMusic } from './audio.js';

/** Design-space width the dialogue layer is laid out in. */
const DESIGN_W = VIRTUAL_W;
/** Design-space height the dialogue layer is laid out in. */
const DESIGN_H = VIRTUAL_H;

/** Metres per second for `walk()` when no duration is given. Office pace. */
const WALK_SPEED = 1.4;

/*
 * Box metrics, mirrored from /js/core/dialogue.js so `boxAt()` can predict
 * exactly where a box will land before it exists. If the dialogue layer ever
 * changes these, change them here too — they are only used for placement, so a
 * drift costs a few pixels of framing, never a crash.
 */
/** Character advance of the dialogue font, design px. */
const ADV = 7;
/** Drawn glyph width (the advance includes a 2px gap). */
const GW = 5;
/** Line box height, design px. */
const LINE = 11;
/** Border frame thickness, design px. */
const FRAME = 4;
/** Inner horizontal padding, design px. */
const PAD_X = 5;
/** Inner vertical padding, design px. */
const PAD_Y = 4;
/** Curly quotes the dialogue layer wraps spoken lines in (§10.1). */
const OPEN_Q = '“';
const CLOSE_Q = '”';
/** Gap the dialogue layer leaves between an `at` anchor and the box above it. */
const AT_GAP = 6;
/** §10.6 default `maxWidth` for a say box. */
const DEFAULT_MAX_W = 230;
/** Margin we keep between a dialogue box and the edge of the frame. */
const SCREEN_PAD = 2;

/** Fallback human height when a profile does not declare one. */
const DEFAULT_HEIGHT = 1.75;

/**
 * Generous room-bounds box for the whole office floor plan (§4.7 puts
 * reception near x=-9 and the break/meeting rooms near x=+9). `shotOn()` keeps
 * generated cameras inside this so coverage never ends up in a wall or under
 * the carpet. Override per-director or per-call.
 */
const DEFAULT_BOUNDS = Object.freeze({
  min: Object.freeze({ x: -13.5, y: 0.3, z: -10.5 }),
  max: Object.freeze({ x: 13.5, y: 3.3, z: 11.5 }),
});

/**
 * Easing curves available to `move(shot, ms, ease)`. Pass the key as a string,
 * or hand `move()` your own `(t:number)=>number`.
 *
 * `easeInOut` is the default and is what you want for almost every camera move;
 * `easeOut` is the whip-pan that lands hard; `linear` is for dolly moves that
 * must not look authored.
 *
 * @type {Object<string, (t:number)=>number>}
 */
export const EASES = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => 1 - (1 - t) * (1 - t),
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2),
  smooth: (t) => t * t * (3 - 2 * t),
  /** Very fast out of the gate, long settle. Good for a snap-to-face. */
  whip: (t) => 1 - (1 - t) ** 3,
  /** Slow build, fast arrival. Good for a push-in that lands on a punchline. */
  push: (t) => t * t * t,
};
EASES.in = EASES.easeIn;
EASES.out = EASES.easeOut;
EASES.inOut = EASES.easeInOut;
EASES.ease = EASES.easeInOut;

/* ------------------------------------------------------------------ utils */

/** @param {number} v @param {number} lo @param {number} hi @returns {number} */
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** @param {*} v @param {number} d @returns {number} */
function num(v, d) {
  return typeof v === 'number' && Number.isFinite(v) ? v : d;
}

/** @param {...*} args */
function warn(...args) {
  if (typeof console !== 'undefined' && console.warn) console.warn('[director]', ...args);
}

/**
 * Runs `fn`, swallowing anything it throws. Used for every call out into
 * another agent's module.
 * @param {() => *} fn
 * @returns {*}
 */
function safe(fn) {
  try {
    return fn();
  } catch (err) {
    warn(err);
    return undefined;
  }
}

/* ------------------------------------------------------------- the factory */

/**
 * @typedef {Object} Shot
 * @property {[number,number,number]|THREE.Vector3} pos camera position, world metres
 * @property {[number,number,number]|THREE.Vector3} look point the camera aims at
 * @property {number} [fov] vertical field of view in degrees; omitted keeps the stage default
 */

/**
 * @typedef {Object} DirectorOptions
 * @property {{min:{x:number,y:number,z:number}, max:{x:number,y:number,z:number}}} [bounds]
 *   Room box that `shotOn()` keeps generated cameras inside.
 * @property {Object<string, Shot>} [shots] named shots, so `d.cut('bullpenWide')` works
 * @property {Object<string, THREE.Vector3>} [marks] named floor positions, so `d.walk(a, 'fridge')` works
 * @property {HTMLElement} [host] element the fade overlay is mounted into; defaults to the dialogue host
 */

/**
 * Builds a director bound to one stage and one dialogue UI.
 *
 * The director takes over the camera the first time you `cut()`, `move()` or
 * `shake()` — before that it leaves `stage.camera` alone so the player can run
 * its own idle/title camera.
 *
 * @param {import('./engine.js').Stage} stage the running stage
 * @param {import('./dialogue.js').DialogueUI} ui the dialogue layer
 * @param {DirectorOptions} [options]
 * @returns {Director}
 */
export function createDirector(stage, ui, options = {}) {
  if (!stage) throw new TypeError('createDirector(stage, ui): stage is required');

  const opts = options || {};
  const bounds = normalizeBounds(opts.bounds)
    || { min: { ...DEFAULT_BOUNDS.min }, max: { ...DEFAULT_BOUNDS.max } };

  /** @type {Object<string, Shot>} */
  const shots = Object.assign(Object.create(null), opts.shots || null);
  /** @type {Object<string, THREE.Vector3|[number,number,number]>} */
  const marks = Object.assign(Object.create(null), opts.marks || null);

  /* --------------------------------------------------------- cancellation */

  let isCancelled = false;
  /** @type {() => void} */
  let fireCancel = () => {};
  /** @type {Promise<void>} */
  let cancelSignal = new Promise((res) => { fireCancel = res; });

  /* ---------------------------------------------------------- task clock  */

  /**
   * @typedef {Object} Task
   * @property {(dt:number)=>void} step
   * @property {(aborted:boolean)=>void} finish
   */

  /** @type {Set<Task>} */
  const tasks = new Set();

  /**
   * A promise that advances on stage time.
   *
   * @param {number} ms duration in milliseconds of *stage* time
   * @param {(u:number, dt:number)=>void} [onStep] called with eased-free 0..1 progress
   * @param {(aborted:boolean)=>void} [onDone] `aborted` is true if cancel()/supersede ended it
   * @returns {{promise: Promise<void>, task: Task|null}}
   */
  function makeTween(ms, onStep, onDone) {
    if (isCancelled) {
      safe(() => onDone && onDone(true));
      return { promise: Promise.resolve(), task: null };
    }
    const dur = Math.max(0, num(ms, 0));
    /** @type {Task} */
    let task;
    let settle;
    const promise = new Promise((res) => { settle = res; });

    if (dur <= 0) {
      safe(() => onStep && onStep(1, 0));
      safe(() => onDone && onDone(false));
      settle();
      return { promise, task: null };
    }

    let elapsed = 0;
    task = {
      step(dt) {
        elapsed += dt * 1000;
        const u = elapsed >= dur ? 1 : elapsed / dur;
        safe(() => onStep && onStep(u, dt));
        if (u >= 1) task.finish(false);
      },
      finish(aborted) {
        if (!tasks.delete(task)) return;
        safe(() => onDone && onDone(!!aborted));
        settle();
      },
    };
    tasks.add(task);
    return { promise, task };
  }

  /**
   * @param {number} ms
   * @param {(u:number, dt:number)=>void} [onStep]
   * @param {(aborted:boolean)=>void} [onDone]
   * @returns {Promise<void>}
   */
  function tween(ms, onStep, onDone) {
    return makeTween(ms, onStep, onDone).promise;
  }

  /**
   * Wraps a foreign promise so it can never outlive `cancel()`.
   * @template T
   * @param {Promise<T>|T|undefined} p
   * @param {T} [fallback] value to resolve with when cancelled
   * @returns {Promise<T|undefined>}
   */
  function guard(p, fallback) {
    if (isCancelled) return Promise.resolve(fallback);
    if (!p || typeof p.then !== 'function') return Promise.resolve(fallback);
    return Promise.race([
      Promise.resolve(p).catch((err) => { warn(err); return fallback; }),
      cancelSignal.then(() => fallback),
    ]);
  }

  /**
   * Same as `guard`, but also gives up after `ms` of stage time. The dialogue
   * layer is written by another agent in parallel; if one of its promises ever
   * fails to settle, a 60-second episode must not hang forever on it.
   *
   * @template T
   * @param {Promise<T>|T|undefined} p
   * @param {number} ms
   * @param {T} [fallback]
   * @returns {Promise<T|undefined>}
   */
  function guardWith(p, ms, fallback) {
    if (isCancelled) return Promise.resolve(fallback);
    if (!p || typeof p.then !== 'function') return Promise.resolve(fallback);
    let done = false;
    const bail = makeTween(ms);
    const settled = Promise.resolve(p)
      .catch((err) => { warn(err); return fallback; })
      .then((v) => { done = true; if (bail.task) bail.task.finish(true); return v; });
    return Promise.race([
      settled,
      cancelSignal.then(() => fallback),
      bail.promise.then(() => {
        if (!done && !isCancelled) warn('a UI call did not settle in time; continuing');
        return fallback;
      }),
    ]);
  }

  /**
   * Calls an optional DialogueUI method. Missing methods warn once and no-op —
   * an episode that uses `d.hud()` before the HUD exists still plays.
   * @param {string} name
   * @param {...*} args
   * @returns {*}
   */
  const missingWarned = new Set();
  function callUI(name, ...args) {
    if (!ui || typeof ui[name] !== 'function') {
      if (!missingWarned.has(name)) {
        missingWarned.add(name);
        warn(`dialogue UI has no ${name}() — skipping`);
      }
      return undefined;
    }
    return safe(() => ui[name](...args));
  }

  /* --------------------------------------------------------- resolvers    */

  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const tmpC = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();

  /**
   * @param {*} a
   * @returns {import('../characters/rig.js').Actor|null}
   */
  function asActor(a) {
    if (!a || typeof a !== 'object') return null;
    if (a.group && a.group.isObject3D) return a;
    return null;
  }

  /**
   * @param {*} x actor, Object3D, or anything else
   * @returns {THREE.Object3D|null}
   */
  function toObject3D(x) {
    if (!x) return null;
    if (x.isObject3D) return x;
    const a = asActor(x);
    return a ? a.group : null;
  }

  /**
   * Resolves anything an episode might hand us into a world-space point.
   * Accepts Vector3, `[x,y,z]`, `{x,y,z}`, an Object3D, an Actor, or the name
   * of a registered mark.
   * @param {*} x
   * @param {THREE.Vector3} out
   * @returns {THREE.Vector3|null} `out`, or null if nothing usable
   */
  function toVec3(x, out) {
    if (x == null) return null;
    if (typeof x === 'string') {
      const m = marks[x];
      if (!m) { warn(`unknown mark "${x}"`); return null; }
      return toVec3(m, out);
    }
    if (x.isVector3) return out.copy(x);
    if (Array.isArray(x)) {
      if (x.length < 3) return null;
      return out.set(num(x[0], 0), num(x[1], 0), num(x[2], 0));
    }
    const obj = toObject3D(x);
    if (obj) { obj.updateMatrixWorld(); return obj.getWorldPosition(out); }
    if (typeof x.x === 'number' && typeof x.z === 'number') {
      return out.set(x.x, num(x.y, 0), x.z);
    }
    return null;
  }

  /**
   * World-space point of an actor's head, with a sane fallback for rigs that
   * do not expose `head` yet.
   * @param {import('../characters/rig.js').Actor} a
   * @param {THREE.Vector3} out
   * @returns {THREE.Vector3}
   */
  function headPos(a, out) {
    const h = a && a.head && a.head.isObject3D ? a.head : null;
    if (h) { h.updateMatrixWorld(); return h.getWorldPosition(out); }
    const g = a && a.group;
    const tall = a && a.profile ? num(a.profile.height, DEFAULT_HEIGHT) : DEFAULT_HEIGHT;
    if (g) { g.updateMatrixWorld(); g.getWorldPosition(out); } else out.set(0, 0, 0);
    out.y += tall * 0.88;
    return out;
  }

  /**
   * @param {*} shot Shot or the name of a registered shot
   * @returns {{pos:THREE.Vector3, look:THREE.Vector3, fov:number}|null}
   */
  function resolveShot(shot) {
    let s = shot;
    if (typeof s === 'string') {
      s = shots[s];
      if (!s) { warn(`unknown shot "${shot}"`); return null; }
    }
    if (!s || typeof s !== 'object') { warn('cut/move: not a shot', shot); return null; }
    const pos = toVec3(s.pos, new THREE.Vector3());
    const look = toVec3(s.look, new THREE.Vector3());
    if (!pos || !look) { warn('cut/move: shot is missing pos/look', shot); return null; }
    return { pos, look, fov: num(s.fov, baseFov) };
  }

  /* --------------------------------------------------------- camera state */

  const camera = stage.camera;
  const baseFov = camera ? num(camera.fov, 55) : 55;

  let camActive = false;
  const camPos = new THREE.Vector3(0, 1.6, 4);
  const camLook = new THREE.Vector3(0, 1.4, 0);
  let camFov = baseFov;

  /** @type {Task|null} */
  let moveTask = null;

  const shakeOff = new THREE.Vector3();
  const shakeLook = new THREE.Vector3();
  let shakeRoll = 0;
  let shakeAmp = 0;
  let shakeT = 0;
  let shakeDur = 0;

  /** Captures whatever the camera is doing right now as the director's base. */
  function ensureCamBase() {
    if (camActive || !camera) return;
    camPos.copy(camera.position);
    camera.getWorldDirection(tmpA);
    camLook.copy(camera.position).addScaledVector(tmpA, 3);
    camFov = num(camera.fov, baseFov);
    camActive = true;
  }

  /** Writes the director's base + shake onto the real camera. */
  function applyCamera() {
    if (!camera) return;
    camera.position.copy(camPos).add(shakeOff);
    camera.up.set(0, 1, 0);
    tmpA.copy(camLook).add(shakeLook);
    camera.lookAt(tmpA);
    if (shakeRoll) camera.rotateZ(shakeRoll);
    if (Math.abs(camera.fov - camFov) > 1e-4) {
      camera.fov = camFov;
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld();
  }

  /** @param {number} dt */
  function updateShake(dt) {
    if (shakeDur <= 0) return;
    shakeT += dt;
    const k = 1 - shakeT / shakeDur;
    if (k <= 0) {
      shakeDur = 0;
      shakeAmp = 0;
      shakeOff.set(0, 0, 0);
      shakeLook.set(0, 0, 0);
      shakeRoll = 0;
      return;
    }
    // Quadratic falloff: hits hard, gets out of the way fast.
    const a = shakeAmp * k * k;
    const r = () => (Math.random() * 2 - 1) * a;
    shakeOff.set(r(), r(), r() * 0.6);
    shakeLook.set(r() * 0.7, r() * 0.7, 0);
    shakeRoll = (Math.random() * 2 - 1) * a * 0.10;
  }

  /* --------------------------------------------------------- projection   */

  /**
   * Projects a world point into the 384x216 design space.
   * @param {THREE.Vector3} p
   * @returns {{x:number, y:number, visible:boolean}}
   */
  function project(p) {
    if (!camera) return { x: DESIGN_W / 2, y: DESIGN_H / 2, visible: false };
    camera.updateMatrixWorld();
    tmpC.copy(p).applyMatrix4(camera.matrixWorldInverse);
    const visible = tmpC.z < -0.05;
    tmpC.applyMatrix4(camera.projectionMatrix);
    return {
      x: (tmpC.x * 0.5 + 0.5) * DESIGN_W,
      y: (0.5 - tmpC.y * 0.5) * DESIGN_H,
      visible,
    };
  }

  /* --------------------------------------------------------- fade overlay */

  /** @type {HTMLElement|null} */
  let overlay = null;
  let overlayTried = false;
  let fadeValue = 0;

  /** @returns {HTMLElement|null} */
  function findHost() {
    if (opts.host && opts.host.appendChild) return opts.host;
    const candidates = ['host', 'el', 'root', 'element', 'container', 'node'];
    for (const key of candidates) {
      const v = ui && ui[key];
      if (v && v.nodeType === 1) return v;
    }
    if (typeof document === 'undefined') return null;
    const found = document.querySelector('.oh-dlg-host, [data-dialogue-host], #dialogue-host, .dialogue-host, .oh-dialogue');
    return found || document.body || null;
  }

  /** @returns {HTMLElement|null} */
  function ensureOverlay() {
    if (overlay || overlayTried) return overlay;
    overlayTried = true;
    if (typeof document === 'undefined') return null;
    const host = findHost();
    if (!host) return null;
    const el = document.createElement('div');
    el.className = 'oh-fade';
    el.setAttribute('aria-hidden', 'true');
    const fixed = host === document.body;
    el.style.cssText = [
      `position:${fixed ? 'fixed' : 'absolute'}`,
      'left:0', 'top:0', 'right:0', 'bottom:0',
      'background:#000',
      'opacity:0',
      'pointer-events:none',
      'z-index:900',
      'display:none',
      'image-rendering:pixelated',
    ].join(';');
    safe(() => host.appendChild(el));
    overlay = el;
    return overlay;
  }

  /**
   * @param {number} to target opacity 0..1
   * @param {number} ms
   * @param {string} [color]
   * @returns {Promise<void>}
   */
  function fadeTo(to, ms, color) {
    const el = ensureOverlay();
    if (!el) { fadeValue = to; return tween(ms); }
    if (color) el.style.background = color;
    el.style.display = 'block';
    const from = fadeValue;
    return tween(
      ms,
      (u) => {
        fadeValue = from + (to - from) * u;
        el.style.opacity = fadeValue.toFixed(4);
      },
      (aborted) => {
        if (!aborted) {
          fadeValue = to;
          el.style.opacity = fadeValue.toFixed(4);
        }
        if (fadeValue <= 0.002) el.style.display = 'none';
      },
    );
  }

  /* --------------------------------------------------------- actor helpers */

  /** @type {Map<Object, Task>} */
  const walkTasks = new Map();
  /** @type {Map<Object, Task>} */
  const yawTasks = new Map();

  /**
   * @param {Map<Object, Task>} map
   * @param {Object} key
   */
  function killTask(map, key) {
    const t = map.get(key);
    if (t) { map.delete(key); t.finish(true); }
  }

  /**
   * @param {import('../characters/rig.js').Actor|null} a
   * @param {string} name
   */
  function play(a, name) {
    if (a && typeof a.play === 'function') safe(() => a.play(name));
  }

  /**
   * Eases an actor's root yaw to `targetYaw` along the shortest arc.
   * @param {import('../characters/rig.js').Actor} a
   * @param {number} targetYaw radians
   * @param {number} ms
   */
  function startYaw(a, targetYaw, ms) {
    if (!a || !a.group) return;
    killTask(yawTasks, a);
    const from = a.group.rotation.y;
    let delta = (targetYaw - from) % (Math.PI * 2);
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    if (Math.abs(delta) < 0.004) { a.group.rotation.y = targetYaw; return; }
    const t = makeTween(
      ms,
      (u) => { a.group.rotation.y = from + delta * EASES.easeInOut(u); },
      (aborted) => {
        yawTasks.delete(a);
        if (!aborted) a.group.rotation.y = from + delta;
      },
    );
    if (t.task) yawTasks.set(a, t.task);
  }

  /**
   * World yaw an object is currently facing. Rigs face +Z (three's
   * `Object3D.lookAt` convention for non-cameras).
   * @param {THREE.Object3D|null} obj
   * @returns {number} radians
   */
  function facingYaw(obj) {
    if (!obj) return 0;
    obj.updateMatrixWorld();
    obj.getWorldQuaternion(tmpQ);
    tmpB.set(0, 0, 1).applyQuaternion(tmpQ);
    if (Math.abs(tmpB.x) < 1e-6 && Math.abs(tmpB.z) < 1e-6) return 0;
    return Math.atan2(tmpB.x, tmpB.z);
  }

  /* --------------------------------------------------------- box geometry */

  /** @type {Array<{x:number,y:number,w:number,h:number}>} */
  let keptRects = [];

  /**
   * Word wrap, character-identical to the dialogue layer's.
   * @param {string} text
   * @param {number} max columns
   * @returns {string[]}
   */
  function wrapText(text, max) {
    const out = [];
    for (const para of String(text == null ? '' : text).split('\n')) {
      const words = para.split(' ');
      let line = '';
      for (let w = 0; w < words.length; w++) {
        let word = words[w];
        if (!word && line === '' && words.length > 1) continue;
        while (word.length > max) {
          if (line) { out.push(line); line = ''; }
          out.push(word.slice(0, max));
          word = word.slice(max);
        }
        const next = line ? `${line} ${word}` : word;
        if (next.length > max && line) { out.push(line); line = word; } else { line = next; }
      }
      out.push(line);
    }
    return out.length ? out : [''];
  }

  /**
   * Predicts the pixel size of the box `say()` is about to draw, by running the
   * same layout the dialogue layer runs (§10.1: speaker name on the first line,
   * the spoken line indented and wrapped in curly quotes).
   *
   * @param {string} speaker
   * @param {string} text
   * @param {number} maxWidth
   * @returns {{w:number, h:number}}
   */
  function estimateBox(speaker, text, maxWidth) {
    const maxW = Math.max(90, Math.min(370, num(maxWidth, DEFAULT_MAX_W)));
    const maxChars = Math.max(8, Math.floor((maxW - FRAME * 2 - PAD_X * 2) / ADV));
    /** @type {Array<{len:number, indent:number}>} */
    const lines = [];

    if (speaker) {
      lines.push({ len: String(speaker).length, indent: 0 });
      const wrapped = wrapText(`${OPEN_Q}${text == null ? '' : text}${CLOSE_Q}`, maxChars - 1);
      for (let i = 0; i < wrapped.length; i++) {
        lines.push({ len: wrapped[i].length, indent: i === 0 ? ADV : ADV * 2 });
      }
    } else {
      for (const t of wrapText(text, maxChars)) lines.push({ len: t.length, indent: 0 });
    }

    let content = 0;
    for (const ln of lines) {
      content = Math.max(content, ln.indent + (ln.len ? ln.len * ADV - (ADV - GW) : 0));
    }
    return {
      w: Math.max(90, Math.min(maxW, content + (FRAME + PAD_X) * 2)),
      h: lines.length * LINE + (FRAME + PAD_Y) * 2 + 2,
    };
  }

  /**
   * Where the dialogue layer will actually put a box anchored at `at`: it
   * centres the box horizontally on the point and hangs it above, then clamps
   * the result into the frame.
   * @param {[number,number]} at
   * @param {number} w
   * @param {number} h
   * @returns {{x:number,y:number,w:number,h:number}}
   */
  function rectFor(at, w, h) {
    return {
      x: Math.round(clamp(at[0] - w / 2, SCREEN_PAD, DESIGN_W - SCREEN_PAD - w)),
      y: Math.round(clamp(at[1] - h - AT_GAP, SCREEN_PAD, DESIGN_H - SCREEN_PAD - h)),
      w,
      h,
    };
  }

  /**
   * @param {{x:number,y:number,w:number,h:number}} a
   * @param {{x:number,y:number,w:number,h:number}} b
   * @returns {boolean}
   */
  function overlaps(a, b) {
    return a.x < b.x + b.w + 3 && a.x + a.w + 3 > b.x && a.y < b.y + b.h + 3 && a.y + a.h + 3 > b.y;
  }

  /* ============================================================ PUBLIC API */

  /* ---- time ---- */

  /**
   * Waits `ms` of *stage* time. Pausing the stage pauses the wait.
   * @param {number} ms
   * @returns {Promise<void>}
   */
  function wait(ms) {
    return tween(num(ms, 0));
  }

  /** @returns {boolean} true once `cancel()` has been called */
  function cancelled() {
    return isCancelled;
  }

  /**
   * Aborts the running script. Every pending await resolves (never rejects) and
   * every future await resolves immediately, so an episode unwinds through its
   * own `finally` blocks within a frame.
   *
   * Safe to call from anywhere, including from inside a director callback and
   * while the stage is stopped.
   */
  function cancel() {
    if (isCancelled) return;
    isCancelled = true;

    moveTask = null;
    for (const t of Array.from(tasks)) t.finish(true);
    tasks.clear();
    walkTasks.clear();
    yawTasks.clear();

    targetActor = null;
    lastCursor = null;
    keptRects = [];

    callUI('targetCursor', null);
    callUI('setSkippable', false);

    fireCancel();
  }

  /**
   * Clears the cancelled flag so the same director can run another take.
   * The player calls this on REPLAY instead of rebuilding everything.
   */
  function reset() {
    isCancelled = false;
    keptRects = [];
    cancelSignal = new Promise((res) => { fireCancel = res; });
  }

  /* ---- camera ---- */

  /**
   * Instant camera cut. Kills any camera move in flight.
   * @param {Shot|string} shot a Shot, or the name of a registered shot
   * @returns {void}
   */
  function cut(shot) {
    const s = resolveShot(shot);
    if (!s) return;
    if (moveTask) { const t = moveTask; moveTask = null; t.finish(true); }
    camPos.copy(s.pos);
    camLook.copy(s.look);
    camFov = s.fov;
    camActive = true;
    applyCamera();
  }

  /**
   * Smooth camera move to a shot. Calling it while another move is running
   * wins: the old move stops where it is and its promise resolves.
   * @param {Shot|string} shot
   * @param {number} ms
   * @param {string|((t:number)=>number)} [ease='easeInOut']
   * @returns {Promise<void>}
   */
  function move(shot, ms, ease) {
    const s = resolveShot(shot);
    if (!s) return Promise.resolve();
    ensureCamBase();

    if (moveTask) { const t = moveTask; moveTask = null; t.finish(true); }

    const fn = typeof ease === 'function' ? ease : (EASES[ease] || EASES.easeInOut);
    const fromPos = camPos.clone();
    const fromLook = camLook.clone();
    const fromFov = camFov;
    camActive = true;

    // `handle` is assigned after makeTween returns, but makeTween can call the
    // done callback synchronously (ms<=0, or already cancelled) — so the
    // callback must never close over the tween itself.
    /** @type {Task|null} */
    let handle = null;
    const t = makeTween(
      ms,
      (u) => {
        const e = clamp(num(fn(u), u), -2, 2);
        camPos.lerpVectors(fromPos, s.pos, e);
        camLook.lerpVectors(fromLook, s.look, e);
        camFov = fromFov + (s.fov - fromFov) * e;
      },
      (aborted) => {
        if (moveTask === handle) moveTask = null;
        if (!aborted) {
          camPos.copy(s.pos);
          camLook.copy(s.look);
          camFov = s.fov;
        }
      },
    );
    handle = t.task;
    moveTask = handle;
    return t.promise;
  }

  /**
   * Computes a shot that frames a target — the cheap way to get real coverage.
   *
   * The camera is placed `dist` metres from the target at `height` metres off
   * the floor, orbited `angle` degrees around it, and aimed at the target's
   * upper body. The result is guaranteed to sit above y=0.3 and inside the
   * room-bounds box, so generated coverage never ends up inside a wall.
   *
   * @param {THREE.Object3D|THREE.Vector3|import('../characters/rig.js').Actor|string} target
   * @param {Object} [o]
   * @param {number} [o.dist=3.2] metres from the target, on the XZ plane
   * @param {number} [o.height=1.55] camera height above the target's feet
   * @param {number} [o.angle=22] degrees of orbit; 0 is dead in front of the target's facing
   * @param {number} [o.fov=45] vertical FOV in degrees
   * @param {number} [o.lookHeight] height of the aim point above the target's feet (default: 72% of its height)
   * @param {boolean} [o.absolute=false] measure `angle` from world +Z instead of from the target's facing
   * @param {{min:Object, max:Object}} [o.bounds] override the room box for this shot
   * @returns {Shot}
   */
  function shotOn(target, o = {}) {
    const obj = toObject3D(target);
    const base = new THREE.Vector3();
    if (!toVec3(target, base)) {
      warn('shotOn: could not resolve target, framing the origin');
      base.set(0, 0, 0);
    }

    const prof = target && target.profile ? target.profile : null;
    const tall = prof ? num(prof.height, DEFAULT_HEIGHT) : DEFAULT_HEIGHT;

    const dist = Math.max(0.6, num(o.dist, 3.2));
    const camH = num(o.height, 1.55);
    const fov = clamp(num(o.fov, 45), 12, 100);
    const lookH = num(o.lookHeight, tall * 0.72);
    const box = normalizeBounds(o.bounds) || bounds;

    const look = new THREE.Vector3(base.x, base.y + lookH, base.z);
    const yaw0 = (o.absolute ? 0 : facingYaw(obj)) + (num(o.angle, 22) * Math.PI) / 180;

    const pos = new THREE.Vector3();
    const y = clamp(base.y + camH, Math.max(0.3, box.min.y), box.max.y);

    // Try the requested azimuth, then fan out in 45-degree steps until the
    // camera lands inside the room. Rotating beats sliding: a rotated shot is
    // still a shot of the target, a slid one may be a shot of the target's ear.
    let placed = false;
    for (let i = 0; i < 8; i++) {
      const step = Math.ceil(i / 2) * (Math.PI / 4);
      const a = yaw0 + (i % 2 === 1 ? -step : step);
      pos.set(look.x + Math.sin(a) * dist, y, look.z + Math.cos(a) * dist);
      if (pos.x >= box.min.x && pos.x <= box.max.x && pos.z >= box.min.z && pos.z <= box.max.z) {
        placed = true;
        break;
      }
    }
    if (!placed) {
      pos.set(look.x + Math.sin(yaw0) * dist, y, look.z + Math.cos(yaw0) * dist);
      pos.x = clamp(pos.x, box.min.x, box.max.x);
      pos.z = clamp(pos.z, box.min.z, box.max.z);
    }
    pos.y = clamp(Math.max(0.3, pos.y), Math.max(0.3, box.min.y), box.max.y);

    // A clamp can shove the camera into the subject's face. Back it off along
    // whichever axis still has room.
    let dx = pos.x - look.x;
    let dz = pos.z - look.z;
    let flat = Math.hypot(dx, dz);
    if (flat < 0.7) {
      if (flat < 1e-4) { dx = 0; dz = 1; flat = 1; }
      const ux = dx / flat;
      const uz = dz / flat;
      const roomPos = Math.min(
        ux > 0 ? (box.max.x - look.x) / ux : Infinity,
        ux < 0 ? (box.min.x - look.x) / ux : Infinity,
        uz > 0 ? (box.max.z - look.z) / uz : Infinity,
        uz < 0 ? (box.min.z - look.z) / uz : Infinity,
      );
      const back = Math.min(dist, Math.max(0.7, Number.isFinite(roomPos) ? roomPos - 0.1 : dist));
      pos.x = look.x + ux * back;
      pos.z = look.z + uz * back;
    }

    return { pos, look, fov };
  }

  /**
   * Additive camera noise that decays to nothing. Re-shaking while a shake is
   * live takes the larger amplitude and restarts the decay.
   * @param {number} [amount=0.16] peak offset in metres
   * @param {number} [ms=380] time to decay to zero
   * @returns {void}
   */
  function shake(amount = 0.16, ms = 380) {
    ensureCamBase();
    const amp = Math.max(0, num(amount, 0.16));
    const dur = Math.max(0.016, num(ms, 380) / 1000);
    const live = shakeDur > 0 ? shakeAmp * Math.max(0, 1 - shakeT / shakeDur) : 0;
    shakeAmp = Math.max(amp, live);
    shakeDur = dur;
    shakeT = 0;
  }

  /**
   * Fades a full-screen overlay in over the scene.
   * @param {number} [ms=600]
   * @param {string} [color='#000']
   * @returns {Promise<void>}
   */
  function fadeOut(ms = 600, color = '#000') {
    return fadeTo(1, num(ms, 600), color);
  }

  /**
   * Fades the overlay back out, revealing the scene.
   * @param {number} [ms=600]
   * @returns {Promise<void>}
   */
  function fadeIn(ms = 600) {
    return fadeTo(0, num(ms, 600));
  }

  /**
   * Snaps the overlay to full and fades it away. A one-frame punctuation mark —
   * lightning, a camera flash, a fluorescent tube giving up.
   * @param {string} [color='#ffffff']
   * @param {number} [ms=200]
   * @returns {Promise<void>}
   */
  function flash(color = '#ffffff', ms = 200) {
    const el = ensureOverlay();
    if (el) {
      el.style.background = color;
      el.style.display = 'block';
      el.style.opacity = '1';
    }
    fadeValue = 1;
    return fadeTo(0, num(ms, 200));
  }

  /* ---- actors ---- */

  /**
   * Walks an actor across the floor at a constant speed, facing the direction
   * of travel and returning to `idle` on arrival.
   * @param {import('../characters/rig.js').Actor} actor
   * @param {THREE.Vector3|[number,number,number]|THREE.Object3D|string} to destination (y is ignored)
   * @param {number} [ms] duration; omitted derives it from distance at ~1.4 m/s
   * @returns {Promise<void>}
   */
  function walk(actor, to, ms) {
    const a = asActor(actor);
    if (!a) { warn('walk: no actor'); return Promise.resolve(); }
    const dest = toVec3(to, tmpA);
    if (!dest) { warn('walk: no destination'); return Promise.resolve(); }

    const from = a.group.position.clone();
    const dx = dest.x - from.x;
    const dz = dest.z - from.z;
    const dist = Math.hypot(dx, dz);

    killTask(walkTasks, a);

    if (dist < 0.03) {
      play(a, 'idle');
      return Promise.resolve();
    }

    const dur = num(ms, 0) > 0 ? num(ms, 0) : Math.max(260, (dist / WALK_SPEED) * 1000);
    play(a, 'walk');
    startYaw(a, Math.atan2(dx, dz), Math.min(260, dur * 0.35));

    const t = makeTween(
      dur,
      (u) => {
        a.group.position.x = from.x + dx * u;
        a.group.position.z = from.z + dz * u;
      },
      (aborted) => {
        walkTasks.delete(a);
        if (!aborted) {
          a.group.position.x = from.x + dx;
          a.group.position.z = from.z + dz;
        }
        play(a, 'idle');
      },
    );
    if (t.task) walkTasks.set(a, t.task);
    return t.promise;
  }

  /**
   * Turns an actor to face a target over ~300ms and points their head at it.
   * `target` of `null` releases the head.
   * @param {import('../characters/rig.js').Actor} actor
   * @param {THREE.Object3D|THREE.Vector3|import('../characters/rig.js').Actor|string|null} target
   * @param {number} [ms=300]
   * @returns {void}
   */
  function face(actor, target, ms = 300) {
    const a = asActor(actor);
    if (!a) return;
    if (target == null) {
      if (typeof a.lookAt === 'function') safe(() => a.lookAt(null));
      return;
    }
    const p = toVec3(target, tmpA);
    if (!p) return;

    if (typeof a.lookAt === 'function') {
      const arg = target && (target.isObject3D || target.isVector3)
        ? target
        : (toObject3D(target) || p.clone());
      safe(() => a.lookAt(arg));
    }

    a.group.updateMatrixWorld();
    const self = a.group.getWorldPosition(tmpB);
    const dx = p.x - self.x;
    const dz = p.z - self.z;
    if (Math.hypot(dx, dz) < 1e-4) return;
    startYaw(a, Math.atan2(dx, dz), Math.max(0, num(ms, 300)));
  }

  /**
   * Drops an actor onto a mark instantly. Use in setup, never mid-shot.
   * @param {import('../characters/rig.js').Actor} actor
   * @param {THREE.Vector3|[number,number,number]|string} at
   * @param {THREE.Object3D|THREE.Vector3|import('../characters/rig.js').Actor|string|number} [facing]
   *   something to face, or a yaw in degrees
   * @returns {void}
   */
  function place(actor, at, facing) {
    const a = asActor(actor);
    if (!a) { warn('place: no actor'); return; }
    const p = toVec3(at, tmpA);
    if (p) a.group.position.set(p.x, p.y, p.z);
    if (facing == null) return;
    if (typeof facing === 'number') {
      a.group.rotation.y = (facing * Math.PI) / 180;
      return;
    }
    const q = toVec3(facing, tmpB);
    if (!q) return;
    a.group.rotation.y = Math.atan2(q.x - a.group.position.x, q.z - a.group.position.z);
  }

  /**
   * Sets an actor's animation state. See the rig for the vocabulary:
   * `idle|walk|talk|panic|point|type|shrug|cheer|slump|sit`.
   * @param {import('../characters/rig.js').Actor} actor
   * @param {string} name
   * @returns {void}
   */
  function anim(actor, name) {
    play(asActor(actor), name);
  }

  /**
   * Seats or unseats an actor.
   * @param {import('../characters/rig.js').Actor} actor
   * @param {boolean} [on=true]
   * @returns {void}
   */
  function sit(actor, on = true) {
    const a = asActor(actor);
    if (a && typeof a.setSitting === 'function') safe(() => a.setSitting(!!on));
  }

  /**
   * Pops an emote bubble over an actor's head (`sweat|anger|question|exclaim|heart|money|zzz`).
   * @param {import('../characters/rig.js').Actor} actor
   * @param {string} name
   * @returns {Promise<void>}
   */
  function emote(actor, name) {
    const a = asActor(actor);
    if (!a || typeof a.emote !== 'function') return Promise.resolve();
    return guardWith(safe(() => a.emote(name)), 2500).then(() => {});
  }

  /* ---- dialogue ---- */

  /**
   * Speaks a line. Pulls the speaker name, voice and accent colour out of
   * `actor.profile`, plays the talk animation for the duration, points the head
   * at the camera, and anchors the box next to the actor on screen.
   *
   * `say(null, text)` is narration: no name line, narrator voice, bottom-centre.
   *
   * @param {import('../characters/rig.js').Actor|null} actor
   * @param {string} text
   * @param {Object} [o] any SayOpts — `cps`, `hold`, `keep`, `anchor`, `at`, `maxWidth`, `pos`, `auto`
   * @returns {Promise<void>}
   */
  async function say(actor, text, o = {}) {
    if (isCancelled) return;
    const a = asActor(actor);
    const prof = a && a.profile ? a.profile : null;
    const src = o || {};
    const line = String(text == null ? '' : text);
    const opts = Object.assign({}, src, { text: line });

    if (prof) {
      if (opts.speaker === undefined) opts.speaker = prof.name || prof.fullName || '';
      if (opts.voice === undefined) opts.voice = prof.voice || prof.id || 'narrator';
      if (opts.color === undefined) opts.color = prof.color || '#dfe6ff';
    } else if (opts.voice === undefined) {
      opts.voice = 'narrator';
    }
    if (opts.maxWidth === undefined) opts.maxWidth = DEFAULT_MAX_W;

    const size = estimateBox(opts.speaker, line, opts.maxWidth);
    if (!('at' in src) && !('anchor' in src)) {
      if (a) opts.at = boxAt(a, size);
      else opts.anchor = 'bm';
    }
    // Only boxes held with `keep:true` stay on screen, so only those need to be
    // dodged by the next one. They are forgotten on closeBoxes()/cancel().
    if (opts.keep && Array.isArray(opts.at)) {
      keptRects.push(rectFor(opts.at, size.w, size.h));
      if (keptRects.length > 6) keptRects.shift();
    }

    let prevAnim = 'idle';
    if (a) {
      if (typeof a.current === 'function') prevAnim = safe(() => a.current()) || 'idle';
      play(a, 'talk');
      if (typeof a.lookAt === 'function' && camera) safe(() => a.lookAt(camera));
    }

    const cps = Math.max(4, num(opts.cps, 34));
    const hold = num(opts.hold, 750);
    const estimate = (line.length / cps) * 1000 + hold;
    const budget = opts.auto === false ? 0 : estimate * 2 + 4000;

    try {
      const p = callUI('say', opts);
      if (budget > 0) await guardWith(p, budget);
      else await guard(p);
    } finally {
      if (a) {
        play(a, prevAnim && prevAnim !== 'talk' ? prevAnim : 'idle');
        if (typeof a.lookAt === 'function') safe(() => a.lookAt(null));
      }
    }
  }

  /**
   * Screen-space anchor for a dialogue box belonging to `actor`, in the
   * 384x216 design space — feed it straight to `say({ at })`.
   *
   * The dialogue layer centres a box on this point and hangs it *above*, so the
   * returned `[x,y]` is a point just over the actor's head. When there is no
   * room above (the actor is high in frame) the anchor is pushed down so the
   * box lands under them instead, and it is nudged clear of any box currently
   * held on screen with `keep:true` — that is the two-boxes-at-once shot from
   * ref 04.
   *
   * @param {import('../characters/rig.js').Actor|null} actor
   * @param {{w?:number, h?:number, gap?:number}} [size] expected box metrics; defaults to a typical 3-line box
   * @returns {[number, number]}
   */
  function boxAt(actor, size) {
    const w = Math.round(num(size && size.w, 150));
    const h = Math.round(num(size && size.h, 40));
    const gap = num(size && size.gap, 4);

    // Anchor range that keeps the whole box inside the frame once the dialogue
    // layer has subtracted the box height.
    const minY = h + AT_GAP + SCREEN_PAD;
    const maxY = DESIGN_H - SCREEN_PAD;
    const minX = w / 2 + 4;
    const maxX = DESIGN_W - 4 - w / 2;

    const a = asActor(actor);
    // Default for a speaker we cannot see: centred and low, the way ordinary
    // FF7 field dialogue sits. Better than shoving a box against the bezel
    // pointing at someone who is not in the shot.
    let x = DESIGN_W / 2;
    let y = maxY;

    if (a) {
      const s = project(headPos(a, tmpA));
      const onFrame = s.visible && s.x > 4 && s.x < DESIGN_W - 4 && s.y > -24 && s.y < DESIGN_H + 24;
      if (onFrame) {
        x = s.x;
        y = s.y - gap;
        // No headroom: drop the box under the actor's head instead.
        if (y < minY) y = s.y + 16 + h + AT_GAP;
      }
    }

    x = clamp(x, Math.min(minX, DESIGN_W / 2), Math.max(maxX, DESIGN_W / 2));
    y = clamp(y, minY, Math.max(minY, maxY));

    // Slide clear of anything being kept on screen.
    for (let i = 0; i < 6; i++) {
      const hit = keptRects.find((r) => overlaps(rectFor([x, y], w, h), r));
      if (!hit) break;
      const below = hit.y + hit.h + 4 + h + AT_GAP;
      const above = hit.y - 4;
      if (above >= minY) y = above;
      else if (below <= maxY) y = below;
      else break;
    }

    return [Math.round(x), Math.round(clamp(y, minY, Math.max(minY, maxY)))];
  }

  /**
   * Closes kept dialogue boxes. `null` closes all of them.
   * @param {string[]|null} [ids=null]
   * @returns {void}
   */
  function closeBoxes(ids = null) {
    keptRects = [];
    callUI('closeBoxes', ids);
  }

  /**
   * FF7 menu. Resolves with the chosen index; if the script is cancelled mid
   * menu it resolves with `pick` (default 0) so the episode keeps its shape.
   * @param {Object} o MenuOpts: `{prompt, options, auto, pick, style}`
   * @returns {Promise<number>}
   */
  function menu(o = {}) {
    const pick = num(o.pick, 0);
    if (isCancelled) return Promise.resolve(pick);
    const auto = num(o.auto, 0);
    const p = callUI('menu', o);
    if (auto > 0) {
      const rows = Array.isArray(o.options) ? o.options.length : 1;
      return guardWith(p, auto + rows * 400 + 5000, pick).then((v) => num(v, pick));
    }
    return guard(p, pick).then((v) => num(v, pick));
  }

  /**
   * Title card. With no `title` string this draws the OFFICE HOURS VII logo
   * lockup (§11), which is what every episode opens on.
   * @param {Object} [o] TitleOpts: `{title, subtitle, ms, logo}`
   * @returns {Promise<void>}
   */
  function title(o = {}) {
    const opts = Object.assign({}, o);
    if (opts.title === undefined && opts.logo === undefined) opts.logo = true;
    if (opts.title === undefined) opts.title = '';
    return guardWith(callUI('title', opts), num(opts.ms, 2600) + 4000).then(() => {});
  }

  /**
   * Character intro placard, built from the actor's profile.
   * @param {import('../characters/rig.js').Actor|Object} actor an Actor, or a bare CharProfile
   * @param {Object} [o] overrides passed through to the UI (`ms`, `color`, ...)
   * @returns {Promise<void>}
   */
  function nameCard(actor, o = {}) {
    const a = asActor(actor);
    const prof = (a && a.profile) || (actor && actor.id && actor.name ? actor : null);
    if (!prof) { warn('nameCard: no profile'); return Promise.resolve(); }
    const card = Object.assign({
      name: prof.fullName || prof.name || '',
      role: prof.role || '',
      color: prof.color || '#dfe6ff',
      stats: Array.isArray(prof.stats) ? prof.stats : [],
    }, o);
    return guardWith(callUI('nameCard', card), num(card.ms, 2200) + 4000).then(() => {});
  }

  /**
   * Small top-of-screen banner.
   * @param {string} text
   * @param {number} [ms]
   * @returns {Promise<void>}
   */
  function toast(text, ms) {
    return guardWith(callUI('toast', String(text), ms), num(ms, 1600) + 4000).then(() => {});
  }

  /**
   * Persistent bottom-left caption. `''` clears it.
   * @param {string} text
   * @returns {void}
   */
  function subtitle(text) {
    callUI('setSubtitle', String(text == null ? '' : text));
  }

  /* ---- battle furniture (§10.2 / §10.3) ---- */

  /** @type {import('../characters/rig.js').Actor|null} */
  let targetActor = null;
  /** @type {string|null} */
  let lastCursor = null;

  /**
   * Parks the amber target triangle over an actor and keeps it there as the
   * camera moves. `null` hides it.
   * @param {import('../characters/rig.js').Actor|null} actor
   * @returns {void}
   */
  function targetOn(actor) {
    const a = asActor(actor);
    targetActor = a;
    if (!a) {
      targetActor = null;
      lastCursor = null;
      callUI('targetCursor', null);
      return;
    }
    updateTargetCursor();
  }

  /** Re-projects the target cursor. Runs every frame while a target is set. */
  function updateTargetCursor() {
    if (!targetActor) return;
    const p = headPos(targetActor, tmpA);
    p.y += 0.42;
    const s = project(p);
    if (!s.visible) {
      if (lastCursor !== null) { lastCursor = null; callUI('targetCursor', null); }
      return;
    }
    const x = Math.round(clamp(s.x, 8, DESIGN_W - 8));
    const y = Math.round(clamp(s.y, 8, DESIGN_H - 24));
    const key = `${x},${y}`;
    if (key === lastCursor) return;
    lastCursor = key;
    callUI('targetCursor', [x, y]);
  }

  /**
   * Pops a damage number (or `MISS`) over an actor.
   * @param {import('../characters/rig.js').Actor|THREE.Object3D|THREE.Vector3} actor
   * @param {string|number} text
   * @param {{at?:[number,number], color?:string, big?:boolean}} [o]
   * @returns {Promise<void>}
   */
  function damageOn(actor, text, o = {}) {
    const dmg = Object.assign({}, o);
    if (!Array.isArray(dmg.at)) {
      const a = asActor(actor);
      const p = a ? headPos(a, tmpA) : toVec3(actor, tmpA);
      if (p) {
        const s = project(p);
        if (s.visible) {
          dmg.at = [
            Math.round(clamp(s.x, 16, DESIGN_W - 16)),
            Math.round(clamp(s.y + 4, 24, DESIGN_H - 40)),
          ];
        }
      }
    }
    return guardWith(callUI('damage', String(text), dmg), 3000).then(() => {});
  }

  /**
   * Shows or hides the FF7 battle HUD.
   * @param {Array<{name:string,hp:number,maxHp:number,mp?:number|string,limit?:number,time?:number}>|null} rows
   * @returns {void}
   */
  function hud(rows) {
    callUI('battleHud', rows == null ? null : rows);
  }

  /**
   * Patches HUD rows in place, keyed by row name.
   * @param {Object<string, Object>} patch
   * @returns {void}
   */
  function updateHud(patch) {
    callUI('updateHud', patch || {});
  }

  /**
   * The `! TUESDAY APPEARED` slab.
   * @param {string} text
   * @param {{ms?:number}} [o]
   * @returns {Promise<void>}
   */
  function encounter(text, o = {}) {
    return guardWith(callUI('encounter', String(text), o), num(o.ms, 1500) + 4000).then(() => {});
  }

  /* ---- audio ---- */

  /**
   * One-shot sound effect.
   * @param {string} id see audio.js for the vocabulary
   * @param {Object} [o]
   * @returns {void}
   */
  function sfx(id, o = {}) {
    safe(() => playSfx(id, o));
  }

  /**
   * Starts a music bed, or stops it with `null`.
   * @param {'lobby'|'tense'|'chase'|'victory'|null} id
   * @returns {void}
   */
  function music(id) {
    if (id == null) safe(() => stopMusic());
    else safe(() => playMusic(id));
  }

  /* ---- conveniences ---- */

  /**
   * A comedy beat. The pause before the punchline.
   * @param {number} [ms=400]
   * @returns {Promise<void>}
   */
  function beat(ms = 400) {
    return wait(num(ms, 400));
  }

  /**
   * Waits for several director promises at once — two people walking, a line
   * over a camera move.
   * @param {...(Promise<*>|Array<Promise<*>>)} ps
   * @returns {Promise<void>}
   */
  function all(...ps) {
    const flat = [];
    for (const p of ps) {
      if (Array.isArray(p)) flat.push(...p);
      else flat.push(p);
    }
    const promises = flat.map((p) => (p && typeof p.then === 'function' ? p.catch((e) => { warn(e); }) : Promise.resolve(p)));
    return guard(Promise.all(promises)).then(() => {});
  }

  /**
   * Registers named shots (usually `office.shots`) so `d.cut('bullpenWide')` works.
   * @param {Object<string, Shot>} map
   * @returns {void}
   */
  function registerShots(map) {
    if (map) Object.assign(shots, map);
  }

  /**
   * Registers named floor marks (usually `office.marks`) so `d.walk(a, 'fridge')` works.
   * @param {Object<string, THREE.Vector3>} map
   * @returns {void}
   */
  function registerMarks(map) {
    if (map) Object.assign(marks, map);
  }

  /**
   * Convenience: registers an OfficeSet's shots and marks in one call.
   * Episodes should open with `d.use(ctx.office)`.
   * @param {{shots?:Object, marks?:Object}} office
   * @returns {void}
   */
  function use(office) {
    if (!office) return;
    registerShots(office.shots);
    registerMarks(office.marks);
  }

  /**
   * Cancels the script and releases the fade overlay and the frame hook.
   * @returns {void}
   */
  function dispose() {
    cancel();
    safe(() => unsubscribe());
    if (overlay && overlay.parentNode) safe(() => overlay.parentNode.removeChild(overlay));
    overlay = null;
  }

  /* --------------------------------------------------------- frame driver */

  /** @param {number} dt seconds */
  function tick(dt) {
    const step = clamp(num(dt, 0), 0, 0.25);
    if (tasks.size) {
      for (const t of Array.from(tasks)) {
        if (!tasks.has(t)) continue;
        try {
          t.step(step);
        } catch (err) {
          warn(err);
          t.finish(true);
        }
      }
    }
    updateShake(step);
    if (camActive) applyCamera();
    if (targetActor) updateTargetCursor();
  }

  let unsubscribe = () => {};
  if (typeof stage.onUpdate === 'function') {
    unsubscribe = stage.onUpdate(tick) || (() => {});
  } else {
    // A stage without an update bus should not silently hang every await.
    warn('stage.onUpdate is missing — falling back to a private rAF clock');
    let raf = 0;
    let prev = typeof performance !== 'undefined' ? performance.now() : 0;
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const dt = (now - prev) / 1000;
      prev = now;
      tick(dt);
    };
    if (typeof requestAnimationFrame === 'function') {
      raf = requestAnimationFrame(loop);
      unsubscribe = () => cancelAnimationFrame(raf);
    }
  }

  /**
   * @typedef {Object} Director
   * @property {(ms:number)=>Promise<void>} wait
   * @property {()=>boolean} cancelled
   * @property {()=>void} cancel
   * @property {()=>void} reset
   * @property {(shot:Shot|string)=>void} cut
   * @property {(shot:Shot|string, ms:number, ease?:string|((t:number)=>number))=>Promise<void>} move
   * @property {(target:*, o?:Object)=>Shot} shotOn
   * @property {(amount?:number, ms?:number)=>void} shake
   * @property {(ms?:number, color?:string)=>Promise<void>} fadeOut
   * @property {(ms?:number)=>Promise<void>} fadeIn
   * @property {(color?:string, ms?:number)=>Promise<void>} flash
   * @property {(actor:*, to:*, ms?:number)=>Promise<void>} walk
   * @property {(actor:*, target:*, ms?:number)=>void} face
   * @property {(actor:*, at:*, facing?:*)=>void} place
   * @property {(actor:*, anim:string)=>void} anim
   * @property {(actor:*, on?:boolean)=>void} sit
   * @property {(actor:*, emote:string)=>Promise<void>} emote
   * @property {(actor:*, text:string, o?:Object)=>Promise<void>} say
   * @property {(actor:*, size?:Object)=>[number,number]} boxAt
   * @property {(ids?:string[]|null)=>void} closeBoxes
   * @property {(o:Object)=>Promise<number>} menu
   * @property {(o?:Object)=>Promise<void>} title
   * @property {(actor:*, o?:Object)=>Promise<void>} nameCard
   * @property {(text:string, ms?:number)=>Promise<void>} toast
   * @property {(text:string)=>void} subtitle
   * @property {(actor:*|null)=>void} targetOn
   * @property {(actor:*, text:string|number, o?:Object)=>Promise<void>} damageOn
   * @property {(rows:Array|null)=>void} hud
   * @property {(patch:Object)=>void} updateHud
   * @property {(text:string, o?:Object)=>Promise<void>} encounter
   * @property {(id:string, o?:Object)=>void} sfx
   * @property {(id:string|null)=>void} music
   * @property {(ms?:number)=>Promise<void>} beat
   * @property {(...ps:*)=>Promise<void>} all
   * @property {(map:Object)=>void} registerShots
   * @property {(map:Object)=>void} registerMarks
   * @property {(office:Object)=>void} use
   * @property {()=>void} dispose
   * @property {Object<string,(t:number)=>number>} eases
   * @property {Object} shots
   * @property {Object} marks
   * @property {import('./engine.js').Stage} stage
   * @property {Object} ui
   */

  /** @type {Director} */
  const director = {
    wait,
    cancelled,
    cancel,
    reset,

    cut,
    move,
    shotOn,
    shake,
    fadeOut,
    fadeIn,
    flash,

    walk,
    face,
    place,
    anim,
    sit,
    emote,

    say,
    boxAt,
    closeBoxes,
    menu,
    title,
    nameCard,
    toast,
    subtitle,

    targetOn,
    damageOn,
    hud,
    updateHud,
    encounter,

    sfx,
    music,

    beat,
    all,
    registerShots,
    registerMarks,
    use,
    dispose,

    eases: EASES,
    shots,
    marks,
    stage,
    ui,
  };

  return director;
}

/**
 * @param {*} b
 * @returns {{min:{x:number,y:number,z:number}, max:{x:number,y:number,z:number}}|null}
 */
function normalizeBounds(b) {
  if (!b) return null;
  const min = b.min || DEFAULT_BOUNDS.min;
  const max = b.max || DEFAULT_BOUNDS.max;
  return {
    min: { x: num(min.x, DEFAULT_BOUNDS.min.x), y: num(min.y, DEFAULT_BOUNDS.min.y), z: num(min.z, DEFAULT_BOUNDS.min.z) },
    max: { x: num(max.x, DEFAULT_BOUNDS.max.x), y: num(max.y, DEFAULT_BOUNDS.max.y), z: num(max.z, DEFAULT_BOUNDS.max.z) },
  };
}
