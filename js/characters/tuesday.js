/**
 * TUESDAY — an unauthorised dog.
 *
 * A quadruped on the same procedural rig as everyone else: a different
 * skeleton, a different pose library, the same crossfade, faces and emotes.
 *
 * Silhouette hooks:
 *   1. she is a DACHSHUND — a long, low, dappled sausage on stubby legs, which
 *      at 384x216 is unmistakable;
 *   2. she is a TRIPOD: one front leg, planted under the middle of her chest,
 *      and a stump that still paddles away when she gets excited;
 *   3. she is OLD — grey muzzle, grey brows, a little cloud in the eyes — and
 *      absolutely does not know it: the tail goes like a helicopter, she bounces
 *      on the spot, and one long ear lives permanently flipped inside-out.
 *
 * Animations: idle | walk | run | sit | bark | shake | sniff | zoomies | bite.
 * The human vocabulary is aliased onto those so a Director that calls
 * `play('talk')` on the dog gets a bark instead of an error.
 *
 * @module characters/tuesday
 */

import * as THREE from 'three';
import { PROFILES, register } from '/js/characters/index.js';
import {
  createRig, prismBox, boxMesh, attach, faceAtlas,
} from '/js/characters/rig.js';
import { makeTexture } from '/js/core/ps1.js';

const TAN = 0xa8733f;
const MUZZLE = 0xb9b1a6;
const DARK = 0x3b2a24;
const NOSE = 0x1e1718;
const PINK = 0xc98a8c;

/** Stubby. The rear legs are longer because they fold. */
const LEG = { fUp: 0.06, fLo: 0.055, bUp: 0.075, bLo: 0.065, paw: 0.03 };

/** Standing height of the shoulder/hip pivots — about a shin. @type {number} */
const HIP_Y = 0.17;

/**
 * The quadruped skeleton: long in the back, short in the leg. The left front
 * leg's joints are kept (every pose and the seated layer still address them)
 * but only a stump hangs off them.
 * @returns {import('./rig.js').JointDef[]}
 */
function dogSkeleton() {
  /** @type {import('./rig.js').JointDef[]} */
  const defs = [
    { name: 'root', parent: null, pos: [0, 0, 0] },
    { name: 'hips', parent: 'root', pos: [0, HIP_Y, -0.24] },
    { name: 'spine', parent: 'hips', pos: [0, 0.005, 0.18] },
    { name: 'chest', parent: 'spine', pos: [0, 0.0, 0.18] },
    { name: 'neck', parent: 'chest', pos: [0, 0.06, 0.10] },
    { name: 'head', parent: 'neck', pos: [0, 0.09, 0.035], order: 'YXZ' },
    { name: 'jaw', parent: 'head', pos: [0, -0.042, 0.06] },
    { name: 'earL', parent: 'head', pos: [-0.058, 0.03, -0.01] },
    { name: 'earR', parent: 'head', pos: [0.058, 0.03, -0.01] },
    { name: 'tailA', parent: 'hips', pos: [0, 0.05, -0.10] },
    { name: 'tailB', parent: 'tailA', pos: [0, 0.12, 0] },
  ];
  for (const side of ['L', 'R']) {
    const sg = side === 'L' ? -1 : 1;
    // the one front leg sits nearly under the middle of the chest, for balance
    const fx = side === 'L' ? -0.06 : 0.022;
    defs.push(
      { name: `thighF${side}`, parent: 'chest', pos: [fx, -0.03, 0.04], alias: `legF${side}` },
      { name: `shinF${side}`, parent: `thighF${side}`, pos: [0, -LEG.fUp, 0], alias: `kneeF${side}` },
      { name: `pawF${side}`, parent: `shinF${side}`, pos: [0, -LEG.fLo, 0] },
      { name: `thighB${side}`, parent: 'hips', pos: [sg * 0.058, -0.01, 0.0], alias: `legB${side}` },
      { name: `shinB${side}`, parent: `thighB${side}`, pos: [0, -LEG.bUp, 0], alias: `kneeB${side}` },
      { name: `pawB${side}`, parent: `shinB${side}`, pos: [0, -LEG.bLo, 0] },
    );
  }
  return defs;
}

/**
 * A tiny seeded PRNG, so the dapple is the same dog every time.
 * @param {number} seed
 * @returns {() => number}
 */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Dapple: a black-and-tan coat broken up by silver-grey splotches.
 * @param {number} seed
 * @returns {THREE.Texture}
 */
function dappleTexture(seed) {
  const tex = makeTexture(32, 32, (ctx, w, h) => {
    const r = rng(seed);
    ctx.fillStyle = '#3b2a24';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = r() < 0.65 ? '#8e8781' : '#6f6560';
      const x = Math.floor(r() * w);
      const y = Math.floor(r() * h);
      const s = 2 + Math.floor(r() * 4);
      ctx.fillRect(x, y + 1, s, s - 1);
      ctx.fillRect(x + 1, y, s - 1, s + 1);
    }
    // a few grey hairs, because she is fourteen
    ctx.fillStyle = '#b0aaa4';
    for (let i = 0; i < 10; i++) ctx.fillRect(Math.floor(r() * w), Math.floor(r() * h), 1, 1);
  });
  return tex;
}

/**
 * Tuesday's face atlas: the same 48px cells and layout as the humans (four
 * expressions; mouth closed / open / blink), drawn for an old dachshund. The
 * mouth lives on the jaw geometry, so these are brows, eyes and a grey muzzle.
 * @returns {THREE.Texture}
 */
function dogFaceTexture() {
  return faceAtlas((ctx, st) => {
    const { expr, blink } = st;
    ctx.fillStyle = '#3b2a24';
    ctx.fillRect(0, 0, 48, 48);
    // one silver dapple on the forehead, grey creeping in from below
    ctx.fillStyle = '#8e8781';
    ctx.fillRect(29, 2, 7, 5);
    ctx.fillRect(30, 1, 5, 7);
    ctx.fillStyle = '#6a5a52';
    ctx.fillRect(0, 34, 48, 14);
    ctx.fillStyle = '#b9b1a6';
    ctx.fillRect(10, 38, 28, 10);
    ctx.fillRect(15, 34, 18, 4);

    // tan-gone-grey brow dots — the thing that makes a dog look like it is thinking
    const lift = { neutral: 0, happy: -2, shocked: -5, squint: 2 }[expr] || 0;
    ctx.fillStyle = '#c2a07a';
    ctx.fillRect(8, 12 + lift, 9, 5);
    ctx.fillRect(31, 12 + lift, 9, 5);
    ctx.fillStyle = '#d8ccbc';
    ctx.fillRect(9, 12 + lift, 3, 2);
    ctx.fillRect(36, 12 + lift, 3, 2);
    if (expr === 'squint') {
      ctx.fillStyle = '#c2a07a';
      ctx.fillRect(15, 15 + lift, 3, 2);
      ctx.fillRect(30, 15 + lift, 3, 2);
    }

    for (const ex of [6, 30]) {
      ctx.fillStyle = '#120c0c';
      if (blink) {
        ctx.fillRect(ex, 24, 12, 2);
        ctx.fillRect(ex + 2, 26, 8, 1);
      } else if (expr === 'happy') {
        // the squinty, blissed-out old-dog smile
        ctx.fillRect(ex + 1, 23, 10, 3);
        ctx.fillRect(ex, 24, 2, 3);
        ctx.fillRect(ex + 10, 24, 2, 3);
      } else if (expr === 'squint') {
        ctx.fillRect(ex, 23, 12, 4);
        ctx.fillStyle = '#7f8a92';
        ctx.fillRect(ex + 3, 24, 3, 1);
      } else {
        const big = expr === 'shocked';
        const w = big ? 14 : 12;
        const x = big ? ex - 1 : ex;
        const y = big ? 17 : 19;
        ctx.fillRect(x, y + 1, w, w - 2);
        ctx.fillRect(x + 1, y, w - 2, w);
        if (big) {
          ctx.fillStyle = '#e8e2d6';
          ctx.fillRect(x + 1, y, w - 2, 2);
        }
        // a little cloud in the eye: she is old, not slow
        ctx.fillStyle = '#4c4a52';
        ctx.fillRect(x + 3, y + 3, w - 6, w - 6);
        ctx.fillStyle = '#1a1416';
        ctx.fillRect(x + 5, y + 5, w - 10, w - 10);
        ctx.fillStyle = '#f0ebe0';
        ctx.fillRect(x + 2, y + 2, 3, 3);
        ctx.fillRect(x + w - 4, y + w - 5, 1, 1);
      }
    }
  });
}

/**
 * The default stance every dog pose starts from: the one front leg planted
 * straight down, rear legs folded, the tail up like a flag, the stump tucked.
 * @param {import('./rig.js').PoseWriter} P
 */
function stance(P) {
  P.r('thighFR', 0.02, 0, 0);
  P.r('shinFR', -0.02, 0, 0);
  P.r('pawFR', 0.0, 0, 0);
  for (const s of ['L', 'R']) {
    P.r(`thighB${s}`, -0.55, 0, 0);
    P.r(`shinB${s}`, 0.85, 0, 0);
    P.r(`pawB${s}`, -0.30, 0, 0);
  }
  P.r('tailA', -0.85, 0, 0);
  P.r('tailB', -0.30, 0, 0);
}

/**
 * The dog pose library. `t` is seconds since the pose started.
 * @type {Object<string, import('./rig.js').Pose>}
 */
const DOG_POSES = {
  idle(P, t) {
    stance(P);
    const br = Math.sin(t * 2.4);
    // she cannot keep still: a little hop on the front leg every so often
    const hop = Math.pow(Math.max(0, Math.sin(t * 3.1)), 6);
    P.p('chest', 0, br * 0.003 + hop * 0.014, 0);
    P.r('chest', -hop * 0.10, 0, 0);
    P.r('spine', br * 0.012, 0, 0);
    P.r('neck', -0.12 + br * 0.02, Math.sin(t * 0.7) * 0.14, 0);
    // the head tilt of a dog who heard the word "walk" in another room
    P.r('head', 0.02, Math.sin(t * 0.45) * 0.14, Math.sin(t * 0.9) * 0.20);
    // the helicopter: fast, wide, forever
    P.r('tailA', -0.85, Math.sin(t * 9.0) * 0.70, 0);
    P.r('tailB', -0.30, Math.sin(t * 9.0 - 0.7) * 0.45, 0);
    P.r('earL', Math.sin(t * 1.3 + 1) * 0.10, 0, 0);
    P.r('earR', Math.sin(t * 0.9) * 0.08, 0, 0);
  },

  walk(P, t) {
    stance(P);
    const ph = t * Math.PI * 2 * 1.5;
    const a = Math.sin(ph);
    const b = Math.sin(ph + Math.PI);
    // the rear legs alternate like any dog's...
    for (const [leg, s] of [['BL', b], ['BR', a]]) {
      P.r(`thigh${leg}`, -0.55 + 0.42 * s, 0, 0);
      P.r(`shin${leg}`, 0.85 - 0.30 * Math.max(0, s) + 0.22 * Math.max(0, -s), 0, 0);
      P.r(`paw${leg}`, -0.30 - 0.20 * Math.max(0, -s), 0, 0);
    }
    // ...and the one front leg does double time: hop, hop, hop
    const f = Math.sin(ph * 2);
    P.r('thighFR', 0.02 + 0.45 * f, 0, 0);
    P.r('shinFR', -0.02 + 0.55 * Math.max(0, -f), 0, 0);
    P.r('pawFR', -0.35 * Math.max(0, -f), 0, 0);
    P.p('chest', 0, 0.012 * Math.max(0, Math.sin(ph * 2 + 0.8)), 0);
    P.r('chest', 0.05 * Math.cos(ph * 2), 0, 0.03);
    P.p('hips', 0, 0.006 * (1 + Math.cos(ph * 2)) * 0.5, 0);
    P.r('hips', 0, 0.06 * a, 0);
    P.r('spine', 0.01, -0.06 * a, 0);
    P.r('neck', -0.14, 0.04 * a, 0);
    P.r('head', 0.08, -0.05 * a, 0.05 * a);
    P.r('earL', 0.15 * Math.max(0, f), 0, 0);
    P.r('earR', 0.10 * Math.max(0, f), 0, 0);
    P.r('tailA', -0.90, Math.sin(ph * 2) * 0.60, 0);
    P.r('tailB', -0.30, Math.sin(ph * 2 - 0.6) * 0.40, 0);
  },

  run(P, t) {
    stance(P);
    const ph = t * Math.PI * 2 * 2.4;
    const a = Math.sin(ph);
    const c = Math.sin(ph + 1.0);
    P.r('thighFR', 0.02 + 0.80 * a, 0, 0);
    P.r('shinFR', -0.02 + 0.70 * Math.max(0, -a), 0, 0);
    P.r('pawFR', -0.30 * Math.max(0, -a), 0, 0);
    for (const s of ['L', 'R']) {
      const off = s === 'R' ? 0.18 : 0;
      P.r(`thighB${s}`, -0.55 + 0.75 * Math.sin(ph + 1.0 + off), 0, 0);
      P.r(`shinB${s}`, 0.85 - 0.45 * Math.max(0, c) + 0.30 * Math.max(0, -c), 0, 0);
      P.r(`pawB${s}`, -0.30 - 0.20 * Math.max(0, -c), 0, 0);
    }
    // the sausage bound: the long back flexes and the whole dog leaves the floor
    P.p('hips', 0, 0.02 + 0.03 * Math.max(0, Math.sin(ph + 0.6)), 0);
    P.r('spine', -0.14 * Math.cos(ph), 0, 0);
    P.r('chest', 0.10 * Math.cos(ph), 0, 0);
    P.r('neck', -0.30 + 0.06 * a, 0, 0);
    P.r('head', 0.12, 0, 0);
    P.r('earL', -0.55 - 0.20 * a, 0, 0);
    P.r('earR', -0.30 - 0.15 * a, 0, 0);
    P.r('tailA', -1.10, Math.sin(ph * 1.5) * 0.35, 0);
    P.r('tailB', -0.30, Math.sin(ph * 1.5 - 0.5) * 0.30, 0);
  },

  sit(P, t) {
    stance(P);
    const s = 1 - Math.exp(-t * 6);
    const br = Math.sin(t * 2.4);
    // rear folded flat, the long back propped up on one front leg
    P.p('hips', 0, -0.09 * s, 0.03 * s);
    P.r('spine', -0.62 * s, 0, 0);
    P.r('chest', -0.20 * s, 0, 0);
    for (const side of ['L', 'R']) {
      P.r(`thighB${side}`, -0.55 - 0.95 * s, 0, 0.12 * s * (side === 'L' ? -1 : 1));
      P.r(`shinB${side}`, 0.85 + 1.35 * s, 0, 0);
      P.r(`pawB${side}`, -0.30 - 0.40 * s, 0, 0);
    }
    P.r('thighFR', 0.02 + 0.80 * s, 0, 0);
    P.r('shinFR', -0.02 - 0.04 * s, 0, 0);
    P.r('neck', -0.12 + 0.45 * s + br * 0.02, Math.sin(t * 0.5) * 0.14, 0);
    P.r('head', 0.05 + 0.10 * s, Math.sin(t * 0.4) * 0.12, Math.sin(t * 0.8) * 0.16);
    // sitting is not the same as calm
    P.r('tailA', -0.20, Math.sin(t * 8.0) * 0.55, 0);
    P.r('tailB', -0.10, Math.sin(t * 8.0 - 0.6) * 0.35, 0);
    P.r('earR', Math.sin(t * 1.1) * 0.08, 0, 0);
  },

  bark(P, t) {
    stance(P);
    const pulse = Math.max(0, Math.sin(t * 7.2));
    P.r('jaw', 0.55 * pulse, 0, 0);
    P.r('neck', -0.45 - 0.10 * pulse, 0, 0);
    P.r('head', -0.10 - 0.08 * pulse, 0, 0);
    // every bark lifts the whole front end off the floor
    P.r('chest', -0.16 * pulse, 0, 0);
    P.p('chest', 0, 0.018 * pulse, 0);
    P.r('thighFR', 0.02 - 0.35 * pulse, 0, 0);
    P.r('shinFR', -0.02 + 0.25 * pulse, 0, 0);
    P.r('earL', -0.35 * pulse, 0, 0);
    P.r('earR', -0.20 * pulse, 0, 0);
    P.r('tailA', -0.90, Math.sin(t * 10) * 0.70, 0);
    P.r('tailB', -0.30, Math.sin(t * 10 - 0.5) * 0.45, 0);
  },

  shake(P, t) {
    stance(P);
    const f = Math.sin(t * 22);
    P.r('hips', 0, 0.22 * f, 0.10 * f);
    P.r('spine', 0, -0.26 * Math.sin(t * 22 - 0.7), 0);
    P.r('chest', 0, 0.24 * Math.sin(t * 22 - 1.4), 0);
    P.r('neck', -0.12, -0.30 * Math.sin(t * 22 - 2.1), 0);
    P.r('head', 0, 0.34 * Math.sin(t * 22 - 2.8), 0.25 * f);
    P.r('earL', 0, 0.5 * f, 0.9 * f);
    P.r('earR', 0, -0.5 * f, -0.7 * f);
    P.r('tailA', -0.8, 0.7 * Math.sin(t * 18), 0);
    P.r('tailB', -0.3, 0.5 * Math.sin(t * 18 - 0.5), 0);
    P.p('hips', 0, 0.006 * Math.abs(f), 0);
  },

  sniff(P, t) {
    stance(P);
    const n = Math.sin(t * 11);
    P.r('neck', 0.70, Math.sin(t * 1.1) * 0.25, 0);
    P.r('head', 0.30 + n * 0.05, Math.sin(t * 2.0) * 0.18, 0);
    P.r('jaw', 0.06 + 0.05 * Math.max(0, n), 0, 0);
    P.r('spine', 0.05, 0, 0);
    P.r('earL', 0.20, 0, 0);
    P.r('earR', -0.10 + n * 0.05, 0, 0);
    P.r('tailA', -0.80, Math.sin(t * 6) * 0.50, 0);
    P.r('tailB', -0.25, Math.sin(t * 6 - 0.5) * 0.30, 0);
    P.r('thighFR', 0.02 + 0.10 * Math.sin(t * 2.6), 0, 0);
  },

  /**
   * The bite: a lunge, a wide-open jaw, then she clamps on and TUGS. Aim her
   * at an ankle; she does the rest.
   */
  bite(P, t) {
    stance(P);
    const lunge = Math.min(1, t / 0.16);
    const tug = t < 0.22 ? 0 : Math.sin((t - 0.22) * 17);
    P.p('chest', 0, 0.01 * (1 - lunge), 0.05 * lunge);
    P.r('chest', 0.10 * lunge, 0, 0);
    P.p('hips', 0, -0.012, -0.03 * lunge);
    P.r('neck', 0.40 * lunge, 0.22 * tug, 0);
    P.r('head', 0.20 * lunge, 0.32 * tug, 0.22 * tug);
    P.r('jaw', t < 0.16 ? 0.75 * lunge : 0.06, 0, 0);
    // back legs dug in, front leg braced forward
    for (const s of ['L', 'R']) {
      P.r(`thighB${s}`, -0.32, 0, 0);
      P.r(`shinB${s}`, 0.62, 0, 0);
    }
    P.r('thighFR', -0.30 * lunge, 0, 0);
    P.r('earL', -0.4, 0.3 * tug, 0.3 * tug);
    P.r('earR', -0.2, 0, 0);
    P.r('tailA', -0.95, Math.sin(t * 11) * 0.65, 0);
    P.r('tailB', -0.30, Math.sin(t * 11 - 0.5) * 0.4, 0);
  },

  zoomies(P, t) {
    DOG_POSES.run(P, t * 1.35, /** @type {any} */ ({}));
    const w = Math.sin(t * 5.5);
    P.add('spine', 0, 0.34 * w, 0.18 * w);
    P.add('chest', 0, 0.22 * Math.sin(t * 5.5 + 0.8), 0);
    P.add('head', 0, 0.30 * Math.sin(t * 5.5 + 1.6), 0.2 * w);
    P.add('hips', 0, -0.20 * w, 0);
    P.p('hips', 0, 0.04, 0);
    P.add('tailA', 0, 0.5 * Math.sin(t * 12), 0);
  },
};

// The human vocabulary, aliased onto dog behaviour so nothing can throw.
DOG_POSES.talk = DOG_POSES.bark;
DOG_POSES.cheer = DOG_POSES.bark;
DOG_POSES.panic = DOG_POSES.zoomies;
DOG_POSES.point = DOG_POSES.sniff;
DOG_POSES.type = DOG_POSES.sniff;
DOG_POSES.shrug = DOG_POSES.shake;
DOG_POSES.slump = DOG_POSES.sit;

// The stump: tucked when she is calm, paddling the air when she is not.
const PADDLE = { walk: 10, run: 16, zoomies: 18, bark: 12, cheer: 12, talk: 12, panic: 18, bite: 20 };
for (const name of Object.keys(DOG_POSES)) {
  const pose = DOG_POSES[name];
  const rate = PADDLE[name] || 0;
  DOG_POSES[name] = (P, t, c) => {
    pose(P, t, c);
    P.r('thighFL', 0.45 + (rate ? 0.35 * Math.sin(t * rate) : 0), 0, -0.2);
  };
}

/**
 * Builds TUESDAY.
 * @returns {import('./rig.js').Actor}
 */
export function createTuesday() {
  return createRig(PROFILES.tuesday, (parts, api) => {
    const coat = { color: 0xffffff, map: dappleTexture(7) };
    const coatB = { color: 0xffffff, map: dappleTexture(19) };
    const tan = { color: TAN };
    const dark = { color: DARK };

    /* ---- the sausage: three long barrel prisms, laid along the spine ---- */
    // Built along Y then laid down, so the octagon is the dog's cross-section.
    attach(parts.hips, prismBox(0.15, 0.20, 0.15, { bevel: 0.3, bottom: 0.84, top: 1.0 }, coatB),
      0, 0.015, -0.03, [Math.PI / 2, 0, 0]);
    attach(parts.spine, prismBox(0.14, 0.20, 0.145, { bevel: 0.3, top: 1.04, bottom: 1.0 }, coat),
      0, 0.01, 0.0, [Math.PI / 2, 0, 0]);
    attach(parts.chest, prismBox(0.16, 0.19, 0.17, { bevel: 0.3, bottom: 1.0, top: 0.9 }, coatB),
      0, 0.0, 0.0, [Math.PI / 2, 0, 0]);
    // the keel: a deep tan chest that nearly scrapes the carpet
    attach(parts.chest, prismBox(0.12, 0.07, 0.16, { sides: 6, top: 1.0, bottom: 0.7 }, tan), 0, -0.075, 0.02);

    /* ---- neck, collar, head ---- */
    attach(parts.neck, prismBox(0.10, 0.13, 0.11, { sides: 6, top: 0.9 }, coat), 0, 0.03, 0.01, [0.45, 0, 0]);
    attach(parts.neck, prismBox(0.115, 0.03, 0.125, { sides: 6, top: 1 }, { color: 0xa8423a }), 0, -0.005, 0.0,
      [0.45, 0, 0]);
    const tag = attach(parts.neck, boxMesh(0.028, 0.032, 0.008, { color: 0xd8c070, emissive: 0x201808 }),
      0, -0.035, 0.065, [0.3, 0, 0]);
    tag.name = 'tag';
    attach(parts.head, prismBox(0.12, 0.10, 0.13, {
      bevelF: 0.14, bevelB: 0.34, anchorFront: true, rings: [[0, 0.9, 0.95], [0.5, 1.0, 1.0], [1, 0.84, 0.88]],
    }, dark), 0, 0.0, 0.0);
    // the long dachshund snout, gone grey
    attach(parts.head, prismBox(0.07, 0.06, 0.15, { bevel: 0.28, top: 0.78, topZ: 1.0, bottom: 1.0 }, { color: MUZZLE }),
      0, -0.025, 0.14);
    attach(parts.head, prismBox(0.036, 0.026, 0.026, { sides: 6, top: 0.9 }, { color: NOSE }), 0, -0.006, 0.217);
    // jaw — opens on bark, and with the mouth
    attach(parts.jaw, prismBox(0.055, 0.022, 0.13, { sides: 6, top: 1, bottom: 0.9 }, { color: MUZZLE }), 0, -0.006, 0.07);
    const tongue = attach(parts.jaw, boxMesh(0.036, 0.008, 0.10, { color: 0xc4667a }), 0, 0.006, 0.07);
    tongue.name = 'tongue';

    /* ---- the ears: long and flat; the right one lives inside-out ---- */
    const ear = (joint, sg, flipped) => {
      const g = new THREE.Object3D();
      const flap = prismBox(0.018, 0.17, 0.085, { sides: 6, top: 0.8, bottom: 1.05 }, coat);
      flap.position.y = -0.075;
      g.add(flap);
      const lining = boxMesh(0.004, 0.15, 0.065, { color: PINK });
      lining.position.set(-sg * 0.011, -0.07, 0);
      g.add(lining);
      // flipped: thrown up and back over the crown, pink side to the sky
      g.rotation.set(flipped ? -0.35 : 0, 0, flipped ? sg * 4.1 : sg * 0.22);
      joint.add(g);
      return g;
    };
    ear(parts.earL, -1, false).name = 'earFloppy';
    ear(parts.earR, 1, true).name = 'earFlipped';

    /* ---- tail: long, thin, carried high ---- */
    attach(parts.tailA, prismBox(0.035, 0.13, 0.035, { sides: 6, top: 0.8 }, coat), 0, 0.06, 0);
    attach(parts.tailB, prismBox(0.028, 0.12, 0.028, { sides: 6, top: 0.5 }, coatB), 0, 0.055, 0);

    /* ---- legs: stubby, tan, with big paws ---- */
    // the one front leg, a little bowed like every dachshund's
    attach(parts.thighFR, prismBox(0.055, LEG.fUp, 0.06, { sides: 6, top: 1.1, bottom: 0.85 }, coat),
      0, -LEG.fUp * 0.5, 0);
    attach(parts.shinFR, prismBox(0.045, LEG.fLo, 0.05, { sides: 4, top: 1.0, bottom: 0.9 }, tan),
      0, -LEG.fLo * 0.5, 0);
    attach(parts.pawFR, prismBox(0.06, LEG.paw, 0.075, { bevelF: 0.4, bevelB: 0, top: 0.9 }, tan),
      0.004, -LEG.paw * 0.5, 0.012);
    // and where the other one was
    const stump = attach(parts.thighFL, prismBox(0.05, 0.045, 0.055, { sides: 6, top: 1.0, bottom: 0.7 }, coat),
      0, -0.02, 0);
    stump.name = 'stump';
    for (const side of ['L', 'R']) {
      attach(parts[`thighB${side}`], prismBox(0.07, LEG.bUp, 0.09, { sides: 6, top: 0.95, bottom: 0.72 }, coatB),
        0, -LEG.bUp * 0.5, -0.005);
      attach(parts[`shinB${side}`], prismBox(0.042, LEG.bLo, 0.05, { sides: 4, top: 1.0, bottom: 0.85 }, tan),
        0, -LEG.bLo * 0.5, 0);
      attach(parts[`pawB${side}`], prismBox(0.055, LEG.paw, 0.07, { bevelF: 0.4, bevelB: 0, top: 0.9 }, tan),
        0, -LEG.paw * 0.5, 0.01);
    }

    /* ---- face ---- */
    const faceTex = dogFaceTexture();
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(0.115, 0.088, 1, 1),
      api.mat({ map: faceTex, color: 0xffffff }),
    );
    face.name = 'face';
    face.position.set(0, 0.012, 0.0685);
    parts.head.add(face);

    /* ---- prop: a tennis ball, hidden until an episode wants it ---- */
    const prop = new THREE.Object3D();
    prop.name = 'ball';
    const ball = prismBox(0.065, 0.065, 0.065, { sides: 6, top: 0.7, bottom: 0.7 }, { color: 0x9aa84a });
    prop.add(ball);
    prop.position.set(0, -0.02, 0.15);
    prop.visible = false;
    parts.jaw.add(prop);

    return {
      faceTex,
      prop,
      emoteY: 0.62,
      style: { motion: 1, armSwing: 1, faceRate: 10 },
      mouth: { joint: 'jaw', angle: 0.42 },
      sitPose: DOG_POSES.sit,
      sitJoints: [
        'hips', 'spine', 'chest', 'neck', 'head',
        'thighBL', 'shinBL', 'pawBL', 'thighBR', 'shinBR', 'pawBR',
        'thighFL', 'thighFR', 'shinFR', 'pawFR',
        'tailA', 'tailB',
      ],
      // a hair of lean onto the good leg
      bias: (P) => { P.r('chest', 0, 0, 0.04); },
      // the bark pose drives the jaw itself, so bark/talk only set the eyes
      animFace: {
        idle: 'happy+open', walk: 'happy', run: 'happy+open', sit: 'happy+open',
        bark: 'happy', talk: 'happy', cheer: 'happy', shake: 'squint',
        sniff: 'squint', zoomies: 'happy+open', panic: 'shocked+open', slump: 'neutral',
        bite: 'squint',
      },
    };
  }, { skeleton: dogSkeleton(), poses: DOG_POSES });
}

register('tuesday', createTuesday);
