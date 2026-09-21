/**
 * RUPERT "ROOP" NG — IT.
 *
 * Silhouette hooks:
 *   1. HOOD UP, always — a faceted cowl that swallows the neck entirely, so his
 *      head and shoulders are one continuous pointed mass;
 *   2. a permanent forward hunch baked in as a posture bias, which shortens him
 *      by about 8cm and reads instantly even at 384x216;
 *   3. oversized hoodie over cargo shorts, bare shins, socks with sandals;
 *   4. a beige CRT monitor he is carrying somewhere. Always.
 *
 * @module characters/roop
 */

import * as THREE from 'three';
import { PROFILES, register } from '/js/characters/index.js';
import {
  createRig, buildHuman, prismBox, boxMesh, wedgeMesh,
  attach, faceTexture, addFace, faceBox, headFront, SKINS,
} from '/js/characters/rig.js';
import { makeTexture } from '/js/core/ps1.js';

/** @type {Object<string,number>} */
const DIMS = {
  foot: 0.06,
  shin: 0.39,
  thigh: 0.41,
  pelvis: 0.09,
  spine: 0.22,
  chest: 0.24,
  neck: 0.04,
  head: 0.30,
  shoulderX: 0.245,
  shoulderY: 0.19,
  upperArm: 0.30,
  foreArm: 0.27,
  hand: 0.14,
  hipX: 0.115,
};

const HOODIE = 0x574f66;
const HOODIE_DARK = 0x3f394c;
const SHORTS = 0x6e6a5b;
const SOCK = 0xc9c3b4;

/**
 * A terminal that has been scrolling the same log since 1998.
 * @returns {THREE.Texture}
 */
function screenTexture() {
  return makeTexture(16, 16, (ctx, w, h) => {
    ctx.fillStyle = '#1c2a1e';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#5fbf6a';
    const rows = [9, 5, 12, 7, 10, 3, 8];
    rows.forEach((n, i) => ctx.fillRect(2, 2 + i * 2, n, 1));
    ctx.fillStyle = '#9ff0a6';
    ctx.fillRect(2, 2 + rows.length * 2, 2, 1);
  });
}

/**
 * The hoodie's chest print: a terminal prompt, green on charcoal.
 * @returns {THREE.Texture}
 */
function printTexture() {
  return makeTexture(16, 8, (ctx, w, h) => {
    ctx.fillStyle = '#2a2632';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#7fd08a';
    // ">" and "_"
    ctx.fillRect(3, 2, 1, 1); ctx.fillRect(4, 3, 1, 1); ctx.fillRect(5, 4, 1, 1);
    ctx.fillRect(4, 5, 1, 1); ctx.fillRect(3, 6, 1, 1);
    ctx.fillRect(8, 6, 4, 1);
  });
}

/**
 * The beige CRT. Boxy, heavy, and permanently in the way.
 * @returns {THREE.Object3D}
 */
function crtMonitor() {
  const crt = new THREE.Object3D();
  crt.name = 'crt';
  // the tube housing narrows toward the back, like the real thing
  const shell = prismBox(0.34, 0.30, 0.31, {
    bevelF: 0.08, bevelB: 0.2, anchorFront: true, top: 0.94, bottom: 0.96, topZ: 0.78, bottomZ: 0.8,
  }, { color: 0xbdb3a0 });
  crt.add(shell);
  const bezel = prismBox(0.31, 0.26, 0.03, { sides: 4, top: 1, bottom: 1 }, { color: 0xc8beab });
  bezel.position.z = 0.16;
  crt.add(bezel);
  const screen = boxMesh(0.24, 0.19, 0.02, { color: 0xffffff, map: screenTexture(), emissive: 0x101c14 });
  screen.position.set(0, 0.01, 0.175);
  crt.add(screen);
  const button = boxMesh(0.03, 0.015, 0.01, { color: 0x6a8f5a, emissive: 0x1a3014 });
  button.position.set(0.11, -0.112, 0.178);
  crt.add(button);
  const stand = prismBox(0.20, 0.05, 0.20, { sides: 6, top: 1.2 }, { color: 0xa79d8c });
  stand.position.y = -0.17;
  crt.add(stand);
  return crt;
}

/**
 * Builds ROOP.
 * @returns {import('./rig.js').Actor}
 */
export function createRoop() {
  return createRig(PROFILES.roop, (parts, api) => {
    const d = api.dims;

    const body = buildHuman(parts, d, {
      skin: SKINS.warm,
      top: HOODIE,
      sleeve: HOODIE,
      legs: SHORTS,
      shoe: 0x5c4a3a,
      chestW: 0.50,
      chestD: 0.28,
      waistW: 0.42,
      hipW: 0.42,
      armW: 0.13,
      legW: 0.165,
      headW: 0.26,
      headD: 0.25,
      handW: 0.135,
      neck: false,
      ears: false,
      bareLegs: true,
      // the hoodie hangs over the belly and the shorts swallow the pelvis
      omit: ['abdomen', 'pelvis'],
    });

    /* ---- the hoodie: a slab that hangs past the hips, ribbed hem, pocket ---- */
    attach(parts.spine, prismBox(0.45, 0.30, 0.31, { bevel: 0.26, top: 1.06, bottom: 0.98 }, { color: HOODIE }),
      0, 0.06, 0);
    attach(parts.spine, prismBox(0.44, 0.05, 0.305, { sides: 6, top: 1 }, { color: HOODIE_DARK }), 0, -0.105, 0);
    attach(parts.chest, prismBox(0.53, 0.12, 0.32, { bevel: 0.28, top: 0.96, bottom: 1.02 }, { color: HOODIE }),
      0, 0.225, 0);
    // kangaroo pocket
    attach(parts.spine, prismBox(0.30, 0.11, 0.04, { sides: 4, top: 1.12 }, { color: HOODIE_DARK }), 0, -0.01, 0.16);
    // chest print: a prompt, because of course
    const print = boxMesh(0.11, 0.055, 0.006, { color: 0xffffff, map: printTexture() });
    print.position.set(0.06, 0.13, 0.142);
    parts.chest.add(print);

    /* ---- the hood, up: snug round the skull, a dark rim framing the face ---- */
    const hoodMat = { color: HOODIE };
    const front = headFront(0.25) + 0.022;
    // crown
    attach(parts.head, prismBox(0.33, 0.14, 0.36, {
      bevelF: 0.18, bevelB: 0.36, top: 0.80, topZ: 0.86, anchorFront: true,
    }, hoodMat), 0, 0.33, front - 0.18);
    // cheeks, hugging the head and running down into the collar
    for (const sg of [-1, 1]) {
      attach(parts.head, prismBox(0.05, 0.32, 0.34, { sides: 6, top: 0.95, bottom: 1.0, anchorFront: true }, hoodMat),
        sg * 0.155, 0.14, front - 0.17);
    }
    // back of the hood, and the soft point it sags into
    attach(parts.head, prismBox(0.30, 0.34, 0.12, { bevel: 0.3, top: 0.86, bottom: 0.96 }, hoodMat), 0, 0.15, -0.17);
    attach(parts.head, wedgeMesh(0.16, 0.20, 0.14, hoodMat), 0, 0.34, -0.17, [-1.2, 0, 0]);
    // the rim: the hem of the hood opening, the thing that says HOOD
    const rim = { color: HOODIE_DARK };
    attach(parts.head, prismBox(0.30, 0.04, 0.035, { sides: 6, top: 0.9 }, rim), 0, 0.275, front + 0.004);
    for (const sg of [-1, 1]) {
      attach(parts.head, prismBox(0.035, 0.27, 0.035, { sides: 6, top: 1, bottom: 0.9 }, rim),
        sg * 0.137, 0.135, front + 0.004, [0, 0, sg * 0.06]);
    }
    // drawstrings
    for (const [x, len, tilt] of [[-0.06, 0.16, 0.1], [0.06, 0.13, -0.1]]) {
      attach(parts.chest, boxMesh(0.02, len, 0.02, { color: 0xd8d2c4 }), x, 0.27 - len / 2, 0.16, [0.1, 0, tilt]);
    }

    /* ---- cargo shorts, socks, sandals ---- */
    attach(parts.hips, prismBox(0.44, 0.34, 0.34, { bevel: 0.24, top: 0.92, bottom: 1.05 }, { color: SHORTS }),
      0, -0.10, 0);
    for (const sg of [-1, 1]) {
      attach(parts.hips, prismBox(0.09, 0.12, 0.045, { sides: 4, top: 0.94 }, { color: 0x605c4f }), sg * 0.21, -0.16, 0.09,
        [0, sg * 0.5, 0]);
    }
    for (const side of ['L', 'R']) {
      attach(parts[`shin${side}`], prismBox(0.145, 0.16, 0.15, { sides: 6, top: 1.0, bottom: 0.9 }, { color: SOCK }),
        0, -d.shin + 0.07, 0.005);
      if (body[`foot${side}`]) body[`foot${side}`].material = api.mat({ color: 0x6b5842 });
      attach(parts[`foot${side}`], boxMesh(0.145, 0.02, 0.10, { color: 0x4a3c2d }), 0, 0.005, 0.04);
    }

    /* ---- face, in hood shadow ---- */
    const faceTex = faceTexture({
      skin: '#8f6a4c',
      shade: '#6a4f39',
      line: '#1a1418',
      iris: '#2a1c16',
      brow: '#2a2026',
      mouth: '#4a2f2c',
      gaze: 0,
      extra: (ctx) => {
        // the hood casts a hard band across the top half of the face
        ctx.fillStyle = 'rgba(20,16,26,0.45)';
        ctx.fillRect(0, 0, 48, 12);
        ctx.fillStyle = 'rgba(20,16,26,0.22)';
        ctx.fillRect(0, 12, 48, 7);
        // monitor glow on the lower face: he has not seen the sun since Q2
        ctx.fillStyle = 'rgba(120,200,140,0.10)';
        ctx.fillRect(8, 30, 32, 16);
        // screen-tired under-eyes
        ctx.fillStyle = 'rgba(60,50,70,0.40)';
        ctx.fillRect(7, 29, 13, 3);
        ctx.fillRect(28, 29, 13, 3);
        // a sad little goatee
        ctx.fillStyle = 'rgba(30,22,20,0.55)';
        ctx.fillRect(21, 44, 6, 3);
      },
    });
    addFace(parts.head, faceTex, faceBox(d.head));

    /* ---- prop: the CRT, carried against the chest ---- */
    const prop = crtMonitor();
    prop.position.set(-0.30, -0.02, 0.24);
    prop.rotation.set(0.10, 0.62, 0.06);
    parts.chest.add(prop);

    /**
     * Whatever the rest of him is doing, the left arm keeps the CRT. The
     * posture bias supplies the actual carry angles; this just gets the pose
     * out of their way.
     * @param {import('./rig.js').PoseWriter} P
     */
    const carry = (P) => {
      P.r('armL', 0.02, 0, -0.06);
      P.r('foreL', 0.04, 0, 0);
      P.r('handL', 0, 0, 0);
      P.p('shoulderL', 0, 0, 0.02);
    };

    return {
      faceTex,
      prop,
      poses: {
        /** @type {import('./rig.js').Pose} */
        cheer: (P, t, c) => { api.POSES.cheer(P, t, c); carry(P); },
        /** @type {import('./rig.js').Pose} */
        panic: (P, t, c) => { api.POSES.panic(P, t, c); carry(P); },
        /** @type {import('./rig.js').Pose} */
        shrug: (P, t, c) => { api.POSES.shrug(P, t, c); carry(P); },
      },
      emoteY: 1.88,
      style: { motion: 0.85, armSwing: 0.35, faceRate: 6 },
      // THE HUNCH. Also the left arm folded up under the monitor.
      bias: (P) => {
        P.r('spine', 0.26, 0, 0);
        P.r('chest', 0.12, 0, 0);
        P.r('neck', 0.16, 0, 0);
        P.r('head', -0.16, 0, 0);
        P.p('head', 0, -0.01, 0.035);
        P.p('shoulderL', 0, -0.01, 0.025);
        P.p('shoulderR', 0, -0.01, 0.025);
        P.r('armL', -0.12, 0, -0.10);
        P.r('foreL', -1.20, 0.45, 0.10);
        P.r('armR', -0.10, 0, 0.10);
        P.r('foreR', -0.35, -0.20, 0);
        P.r('thighL', 0.06, 0, 0);
        P.r('thighR', 0.06, 0, 0);
      },
      animFace: { idle: 'squint', walk: 'squint', point: 'squint', type: 'neutral', cheer: 'happy+open', talk: 'squint+talk' },
    };
  }, { dims: DIMS });
}

register('roop', createRoop);
