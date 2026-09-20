/**
 * TUESDAY — an unauthorised dog.
 *
 * A quadruped on the same procedural rig as everyone else: a different
 * skeleton, a different pose library, the same crossfade, faces and emotes.
 *
 * Silhouette hooks:
 *   1. she is a DOG, in an office, which at 384x216 is unmistakable;
 *   2. ONE FLOPPY EAR AND ONE UP — the single cheapest character read there is;
 *   3. a tail that wags like a metronome: constant amplitude, constant rate.
 *
 * Animations: idle | walk | run | sit | bark | shake | sniff | zoomies.
 * The human vocabulary is aliased onto those so a Director that calls
 * `play('talk')` on the dog gets a bark instead of an error.
 *
 * @module characters/tuesday
 */

import * as THREE from 'three';
import { PROFILES, register } from '/js/characters/index.js';
import {
  createRig, taperedBox, boxMesh, wedgeMesh, attach, FACE_FRAMES,
} from '/js/characters/rig.js';
import { makeTexture } from '/js/core/ps1.js';

const FUR = 0xc0966a;
const FUR_DARK = 0x8d6c49;
const FUR_LIGHT = 0xd9c4a2;
const NOSE = 0x2b2328;

/** Rear legs are longer than the front ones, because they are folded. */
const LEG = { fUp: 0.14, fLo: 0.12, bUp: 0.155, bLo: 0.135, paw: 0.04 };

/** Standing height of the shoulder/hip pivots. @type {number} */
const HIP_Y = 0.30;

/**
 * The quadruped skeleton. Nose points +Z, same as every human in the cast.
 * @returns {import('./rig.js').JointDef[]}
 */
function dogSkeleton() {
  /** @type {import('./rig.js').JointDef[]} */
  const defs = [
    { name: 'root', parent: null, pos: [0, 0, 0] },
    { name: 'hips', parent: 'root', pos: [0, HIP_Y, -0.16] },
    { name: 'spine', parent: 'hips', pos: [0, 0.01, 0.13] },
    { name: 'chest', parent: 'spine', pos: [0, 0.00, 0.16] },
    { name: 'neck', parent: 'chest', pos: [0, 0.08, 0.11] },
    { name: 'head', parent: 'neck', pos: [0, 0.06, 0.05], order: 'YXZ' },
    { name: 'jaw', parent: 'head', pos: [0, -0.035, 0.05] },
    { name: 'earL', parent: 'head', pos: [-0.055, 0.075, -0.015] },
    { name: 'earR', parent: 'head', pos: [0.055, 0.075, -0.015] },
    { name: 'tailA', parent: 'hips', pos: [0, 0.10, -0.12] },
    { name: 'tailB', parent: 'tailA', pos: [0, 0.12, 0] },
  ];
  for (const side of ['L', 'R']) {
    const sg = side === 'L' ? -1 : 1;
    defs.push(
      { name: `thighF${side}`, parent: 'chest', pos: [sg * 0.075, -0.01, 0.02], alias: `legF${side}` },
      { name: `shinF${side}`, parent: `thighF${side}`, pos: [0, -LEG.fUp, 0], alias: `kneeF${side}` },
      { name: `pawF${side}`, parent: `shinF${side}`, pos: [0, -LEG.fLo, 0] },
      { name: `thighB${side}`, parent: 'hips', pos: [sg * 0.075, 0, 0.02], alias: `legB${side}` },
      { name: `shinB${side}`, parent: `thighB${side}`, pos: [0, -LEG.bUp, 0], alias: `kneeB${side}` },
      { name: `pawB${side}`, parent: `shinB${side}`, pos: [0, -LEG.bLo, 0] },
    );
  }
  return defs;
}

/**
 * Tuesday's face atlas: 2x2, same frame layout as the humans, drawn for a
 * muzzle instead of a face. The mouth lives on the jaw geometry, so these
 * frames are all eyes and eyebrow spots.
 * @returns {THREE.Texture}
 */
function dogFaceTexture() {
  const tex = makeTexture(64, 64, (ctx) => {
    /**
     * @param {number} ox @param {number} oy @param {string} frame
     */
    const frame = (ox, oy, kind) => {
      ctx.save();
      ctx.translate(ox, oy);
      ctx.fillStyle = '#c0966a';
      ctx.fillRect(0, 0, 32, 32);
      // lighter muzzle wash, darker mask over the brow
      ctx.fillStyle = '#d9c4a2';
      ctx.fillRect(8, 20, 16, 12);
      ctx.fillStyle = '#8d6c49';
      ctx.fillRect(0, 0, 32, 8);
      ctx.fillRect(0, 8, 5, 8);
      ctx.fillRect(27, 8, 5, 8);

      // eyebrow spots — the thing that makes a dog look like it is thinking
      ctx.fillStyle = '#6f5335';
      ctx.fillRect(5, 9, 7, 3);
      ctx.fillRect(20, 9, 7, 3);

      if (kind === 'squint') {
        ctx.fillStyle = '#20191c';
        ctx.fillRect(5, 15, 8, 2);
        ctx.fillRect(19, 15, 8, 2);
      } else {
        const big = kind === 'shocked';
        const w = big ? 10 : 8;
        const h = big ? 10 : 8;
        ctx.fillStyle = '#20191c';
        ctx.fillRect(4, 13, w, h);
        ctx.fillRect(32 - 4 - w, 13, w, h);
        ctx.fillStyle = '#e8e2d6';
        ctx.fillRect(5, 14, 3, 3);
        ctx.fillRect(32 - 4 - w + 1, 14, 3, 3);
        if (big) {
          ctx.fillStyle = '#e8e2d6';
          ctx.fillRect(4, 13, w, 2);
          ctx.fillRect(32 - 4 - w, 13, w, 2);
        }
      }

      if (kind === 'talk') {
        ctx.fillStyle = '#20191c';
        ctx.fillRect(12, 27, 8, 4);
        ctx.fillStyle = '#c4667a';
        ctx.fillRect(14, 29, 4, 3);
      }
      ctx.restore();
    };
    frame(0, 0, 'neutral');
    frame(32, 0, 'talk');
    frame(0, 32, 'shocked');
    frame(32, 32, 'squint');
  });
  tex.repeat.set(0.5, 0.5);
  tex.offset.set(FACE_FRAMES.neutral[0], FACE_FRAMES.neutral[1]);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/**
 * The default four-legged stance every dog pose starts from: front legs
 * near-vertical, rear legs folded into the dog crouch, tail up and back.
 * @param {import('./rig.js').PoseWriter} P
 */
function stance(P) {
  for (const s of ['L', 'R']) {
    P.r(`thighF${s}`, 0.06, 0, 0);
    P.r(`shinF${s}`, -0.08, 0, 0);
    P.r(`pawF${s}`, 0.02, 0, 0);
    P.r(`thighB${s}`, -0.55, 0, 0);
    P.r(`shinB${s}`, 0.85, 0, 0);
    P.r(`pawB${s}`, -0.30, 0, 0);
  }
  P.r('tailA', -0.55, 0, 0);
  P.r('tailB', -0.20, 0, 0);
}

/**
 * The dog pose library. `t` is seconds since the pose started.
 * @type {Object<string, import('./rig.js').Pose>}
 */
const DOG_POSES = {
  idle(P, t) {
    stance(P);
    const br = Math.sin(t * 2.1);
    P.r('spine', br * 0.012, 0, 0);
    P.r('chest', br * 0.01, 0, 0);
    P.r('neck', -0.05 + br * 0.02, Math.sin(t * 0.5) * 0.10, 0);
    P.r('head', 0.05, Math.sin(t * 0.37) * 0.12, Math.sin(t * 0.7) * 0.06);
    // the metronome: constant amplitude, constant rate, forever
    P.r('tailA', -0.55, Math.sin(t * 3.4) * 0.55, 0);
    P.r('tailB', -0.20, Math.sin(t * 3.4 - 0.6) * 0.35, 0);
    P.r('earR', Math.sin(t * 0.9) * 0.10, 0, 0);
    P.r('earL', Math.sin(t * 1.3 + 1) * 0.08, 0, 0);
    P.p('chest', 0, br * 0.004, 0);
  },

  walk(P, t) {
    stance(P);
    const ph = t * Math.PI * 2 * 1.25;
    const a = Math.sin(ph);
    const b = Math.sin(ph + Math.PI);
    const pairs = [['FL', a], ['FR', b], ['BL', b], ['BR', a]];
    for (const [leg, s] of pairs) {
      const front = leg[0] === 'F';
      if (front) {
        P.r(`thigh${leg}`, 0.06 + 0.42 * s, 0, 0);
        P.r(`shin${leg}`, -0.08 + 0.50 * Math.max(0, -s), 0, 0);
        P.r(`paw${leg}`, 0.02 - 0.25 * Math.max(0, -s), 0, 0);
      } else {
        P.r(`thigh${leg}`, -0.55 + 0.38 * s, 0, 0);
        P.r(`shin${leg}`, 0.85 - 0.30 * Math.max(0, s) + 0.20 * Math.max(0, -s), 0, 0);
        P.r(`paw${leg}`, -0.30 - 0.20 * Math.max(0, -s), 0, 0);
      }
    }
    P.p('hips', 0, 0.008 * (1 + Math.cos(ph * 2)) * 0.5, 0);
    P.r('hips', 0, 0.05 * a, 0);
    P.r('spine', 0.01, -0.05 * a, 0);
    P.r('neck', -0.08, 0.04 * a, 0);
    P.r('head', 0.06, -0.05 * a, 0.04 * a);
    P.r('tailA', -0.60, Math.sin(ph * 2) * 0.55, 0);
    P.r('tailB', -0.20, Math.sin(ph * 2 - 0.6) * 0.35, 0);
  },

  run(P, t) {
    stance(P);
    const ph = t * Math.PI * 2 * 2.2;
    const a = Math.sin(ph);
    const c = Math.sin(ph + 1.0);
    for (const s of ['L', 'R']) {
      const off = s === 'R' ? 0.18 : 0;
      P.r(`thighF${s}`, 0.06 + 0.75 * Math.sin(ph + off), 0, 0);
      P.r(`shinF${s}`, -0.08 + 0.70 * Math.max(0, -Math.sin(ph + off)), 0, 0);
      P.r(`pawF${s}`, 0.02 - 0.30 * Math.max(0, -a), 0, 0);
      P.r(`thighB${s}`, -0.55 + 0.75 * Math.sin(ph + 1.0 + off), 0, 0);
      P.r(`shinB${s}`, 0.85 - 0.45 * Math.max(0, c) + 0.30 * Math.max(0, -c), 0, 0);
      P.r(`pawB${s}`, -0.30 - 0.20 * Math.max(0, -c), 0, 0);
    }
    // bound: the spine flexes and the whole dog leaves the ground
    P.p('hips', 0, 0.035 * Math.max(0, Math.sin(ph + 0.6)), 0);
    P.r('spine', -0.16 * Math.cos(ph), 0, 0);
    P.r('chest', 0.10 * Math.cos(ph), 0, 0);
    P.r('neck', -0.22 + 0.06 * a, 0, 0);
    P.r('head', 0.10, 0, 0);
    P.r('earL', -0.35 - 0.12 * a, 0, 0);
    P.r('earR', -0.20 - 0.10 * a, 0, 0);
    P.r('tailA', -0.85, Math.sin(ph * 1.5) * 0.35, 0);
    P.r('tailB', -0.30, Math.sin(ph * 1.5 - 0.5) * 0.30, 0);
  },

  sit(P, t) {
    stance(P);
    const s = 1 - Math.exp(-t * 6);
    const br = Math.sin(t * 2.0);
    // rear folded flat, back steeply up, front legs vertical and proud
    P.p('hips', 0, -0.14 * s, 0.02 * s);
    P.r('spine', -1.06 * s, 0, 0);
    for (const side of ['L', 'R']) {
      P.r(`thighB${side}`, -0.55 - 0.95 * s, 0, 0.12 * s * (side === 'L' ? -1 : 1));
      P.r(`shinB${side}`, 0.85 + 1.35 * s, 0, 0);
      P.r(`pawB${side}`, -0.30 - 0.40 * s, 0, 0);
      P.r(`thighF${side}`, 0.06 + 1.06 * s, 0, 0);
      P.r(`shinF${side}`, -0.08 - 0.06 * s, 0, 0);
    }
    P.r('chest', 0.10 * s, 0, 0);
    P.r('neck', -0.05 + 0.55 * s + br * 0.02, Math.sin(t * 0.4) * 0.14, 0);
    P.r('head', 0.05 + 0.10 * s, Math.sin(t * 0.33) * 0.12, 0);
    P.r('tailA', -0.30, Math.sin(t * 2.6) * 0.40, 0);
    P.r('tailB', -0.10, Math.sin(t * 2.6 - 0.6) * 0.25, 0);
    P.r('earR', Math.sin(t * 1.1) * 0.08, 0, 0);
  },

  bark(P, t) {
    stance(P);
    const pulse = Math.max(0, Math.sin(t * 6.4));
    const rock = Math.sin(t * 6.4);
    P.r('jaw', 0.55 * pulse, 0, 0);
    P.r('neck', -0.42 - 0.10 * pulse, 0, 0);
    P.r('head', -0.10 - 0.08 * pulse, 0, 0);
    P.r('spine', -0.10 * pulse, 0, 0);
    P.p('hips', 0, 0.012 * pulse, 0);
    for (const side of ['L', 'R']) {
      P.r(`thighF${side}`, 0.06 - 0.30 * pulse, 0, 0);
      P.r(`shinF${side}`, -0.08 + 0.18 * pulse, 0, 0);
    }
    P.r('earL', -0.25 * pulse, 0, 0);
    P.r('earR', -0.15 * pulse, 0, 0);
    P.r('tailA', -0.70, Math.sin(t * 7.2) * 0.60, 0);
    P.r('tailB', -0.25, Math.sin(t * 7.2 - 0.5) * 0.40, 0);
    P.r('chest', 0.03 * rock, 0, 0);
  },

  shake(P, t) {
    stance(P);
    const f = Math.sin(t * 22);
    P.r('hips', 0, 0.22 * f, 0.10 * f);
    P.r('spine', 0, -0.26 * Math.sin(t * 22 - 0.7), 0);
    P.r('chest', 0, 0.24 * Math.sin(t * 22 - 1.4), 0);
    P.r('neck', -0.10, -0.30 * Math.sin(t * 22 - 2.1), 0);
    P.r('head', 0, 0.34 * Math.sin(t * 22 - 2.8), 0.25 * f);
    P.r('earL', 0, 0.5 * f, 0.6 * f);
    P.r('earR', 0, -0.5 * f, -0.5 * f);
    P.r('tailA', -0.5, 0.7 * Math.sin(t * 18), 0);
    P.r('tailB', -0.2, 0.5 * Math.sin(t * 18 - 0.5), 0);
    P.p('hips', 0, 0.006 * Math.abs(f), 0);
  },

  sniff(P, t) {
    stance(P);
    const n = Math.sin(t * 9);
    P.r('neck', 0.62, Math.sin(t * 0.9) * 0.22, 0);
    P.r('head', 0.30 + n * 0.05, Math.sin(t * 1.7) * 0.18, 0);
    P.r('jaw', 0.06 + 0.05 * Math.max(0, n), 0, 0);
    P.p('hips', 0, -0.012, 0);
    P.r('spine', 0.06, 0, 0);
    P.r('earL', 0.15, 0, 0);
    P.r('earR', -0.10 + n * 0.05, 0, 0);
    P.r('tailA', -0.45, Math.sin(t * 2.2) * 0.30, 0);
    P.r('tailB', -0.15, Math.sin(t * 2.2 - 0.5) * 0.20, 0);
    for (const side of ['L', 'R']) {
      P.r(`thighF${side}`, 0.06 + 0.10 * Math.sin(t * 2.2 + (side === 'L' ? 0 : Math.PI)), 0, 0);
    }
  },

  zoomies(P, t) {
    DOG_POSES.run(P, t * 1.35, /** @type {any} */ ({}));
    const w = Math.sin(t * 5.5);
    P.add('spine', 0, 0.34 * w, 0.18 * w);
    P.add('chest', 0, 0.22 * Math.sin(t * 5.5 + 0.8), 0);
    P.add('head', 0, 0.30 * Math.sin(t * 5.5 + 1.6), 0.2 * w);
    P.add('hips', 0, -0.20 * w, 0);
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

/**
 * Builds TUESDAY.
 * @returns {import('./rig.js').Actor}
 */
export function createTuesday() {
  return createRig(PROFILES.tuesday, (parts, api) => {
    const fur = { color: FUR };
    const furDark = { color: FUR_DARK };

    /* ---- body: three slabs with visible seams, like everyone else ---- */
    attach(parts.hips, taperedBox(0.22, 0.22, 0.25, { top: 0.94, bottom: 0.9, topZ: 1, bottomZ: 0.95 }, fur),
      0, 0.02, 0.0);
    attach(parts.spine, taperedBox(0.21, 0.21, 0.22, { top: 0.98, bottom: 0.96 }, fur), 0, 0.02, -0.01);
    attach(parts.chest, taperedBox(0.235, 0.235, 0.26, { top: 0.95, bottom: 0.92 }, fur), 0, 0.02, 0.0);
    attach(parts.chest, taperedBox(0.20, 0.10, 0.22, { top: 1.0, bottom: 0.8 }, { color: FUR_LIGHT }),
      0, -0.09, 0.02);
    // scruff: three tufts along the spine
    attach(parts.spine, wedgeMesh(0.08, 0.07, 0.10, furDark), 0, 0.13, 0.02, [-0.5, 0, 0]);
    attach(parts.chest, wedgeMesh(0.09, 0.08, 0.11, furDark), 0, 0.145, -0.02, [-0.4, 0, 0]);
    attach(parts.hips, wedgeMesh(0.07, 0.06, 0.09, furDark), 0, 0.135, -0.02, [-0.6, 0, 0]);

    /* ---- neck and head ---- */
    attach(parts.neck, taperedBox(0.155, 0.14, 0.17, { top: 0.88 }, fur), 0, 0.02, 0.01, [0.35, 0, 0]);
    attach(parts.head, taperedBox(0.165, 0.145, 0.17, { top: 0.92, bottom: 0.95 }, fur), 0, 0.01, 0.0);
    // muzzle
    attach(parts.head, taperedBox(0.105, 0.085, 0.13, { top: 0.85, topZ: 1.05, bottom: 0.95 }, { color: FUR_LIGHT }),
      0, -0.035, 0.105);
    attach(parts.head, boxMesh(0.05, 0.035, 0.035, { color: NOSE }), 0, -0.018, 0.175);
    // jaw — opens on bark
    attach(parts.jaw, taperedBox(0.085, 0.035, 0.115, { top: 1, bottom: 0.9 }, { color: FUR_LIGHT }),
      0, -0.012, 0.055);

    /* ---- ONE FLOPPY EAR, ONE UP ---- */
    const earUp = attach(parts.earR, wedgeMesh(0.08, 0.20, 0.06, furDark), 0.018, 0.085, -0.01,
      [-0.10, 0, 0.30]);
    earUp.name = 'earUp';
    // the floppy one hangs flat down the side of the skull, which is the whole
    // gag: the dog is permanently half-listening
    const earFlop = attach(parts.earL, taperedBox(0.05, 0.19, 0.085, { top: 1.0, bottom: 0.55 }, furDark),
      -0.035, -0.075, 0.0, [0.12, 0, 0.30]);
    earFlop.name = 'earFloppy';
    attach(parts.earL, taperedBox(0.055, 0.07, 0.075, { top: 0.8 }, furDark), -0.012, 0.015, 0, [0, 0, 0.5]);

    /* ---- tail ---- */
    attach(parts.tailA, taperedBox(0.055, 0.13, 0.055, { top: 0.8 }, fur), 0, 0.06, 0);
    attach(parts.tailB, taperedBox(0.045, 0.13, 0.045, { top: 0.6 }, furDark), 0, 0.06, 0);

    /* ---- legs: tapered boxes, paws are little blocks ---- */
    for (const side of ['L', 'R']) {
      attach(parts[`thighF${side}`], taperedBox(0.085, LEG.fUp, 0.10, { top: 1.0, bottom: 0.82 }, fur),
        0, -LEG.fUp * 0.5, 0);
      attach(parts[`shinF${side}`], taperedBox(0.07, LEG.fLo, 0.075, { top: 1.0, bottom: 0.85 }, fur),
        0, -LEG.fLo * 0.5, 0);
      attach(parts[`pawF${side}`], taperedBox(0.08, LEG.paw, 0.10, { top: 0.9 }, { color: FUR_LIGHT }),
        0, -LEG.paw * 0.5, 0.012);
      attach(parts[`thighB${side}`], taperedBox(0.105, LEG.bUp, 0.125, { top: 0.92, bottom: 0.72 }, fur),
        0, -LEG.bUp * 0.5, -0.01);
      attach(parts[`shinB${side}`], taperedBox(0.068, LEG.bLo, 0.08, { top: 1.0, bottom: 0.85 }, fur),
        0, -LEG.bLo * 0.5, 0);
      attach(parts[`pawB${side}`], taperedBox(0.078, LEG.paw, 0.10, { top: 0.9 }, { color: FUR_LIGHT }),
        0, -LEG.paw * 0.5, 0.012);
    }

    /* ---- face ---- */
    const faceTex = dogFaceTexture();
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(0.155, 0.13, 1, 1),
      api.mat({ map: faceTex, color: 0xffffff }),
    );
    face.position.set(0, 0.022, 0.088);
    face.rotation.x = -0.10;
    parts.head.add(face);

    /* ---- prop: a tennis ball, hidden until an episode wants it ---- */
    const prop = new THREE.Object3D();
    prop.name = 'ball';
    const ball = taperedBox(0.07, 0.07, 0.07, { top: 0.7, bottom: 0.7 }, { color: 0x9aa84a });
    prop.add(ball);
    prop.position.set(0, -0.02, 0.135);
    prop.visible = false;
    parts.jaw.add(prop);

    return {
      faceTex,
      prop,
      emoteY: 0.86,
      style: { motion: 1, armSwing: 1, faceRate: 9 },
      sitPose: DOG_POSES.sit,
      sitJoints: [
        'hips', 'spine', 'chest', 'neck', 'head',
        'thighBL', 'shinBL', 'pawBL', 'thighBR', 'shinBR', 'pawBR',
        'thighFL', 'shinFL', 'pawFL', 'thighFR', 'shinFR', 'pawFR',
        'tailA', 'tailB',
      ],
      animFace: {
        idle: 'neutral', walk: 'neutral', run: 'shocked', sit: 'neutral',
        bark: 'talk', talk: 'talk', cheer: 'talk', shake: 'squint',
        sniff: 'squint', zoomies: 'talk', panic: 'shocked', slump: 'neutral',
      },
    };
  }, { skeleton: dogSkeleton(), poses: DOG_POSES });
}

register('tuesday', createTuesday);
