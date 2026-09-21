/**
 * BRAD HOLLOWAY — founder and CEO of MUNCH, Inc.
 *
 * Silhouette hooks, in order of how far away they read:
 *   1. he is the tallest thing in the office by a clear head;
 *   2. a PUFFY VEST that doubles the width of his torso and leaves his
 *      dress-shirt arms looking like pipe cleaners — now built from two
 *      swollen, quilted prisms that bulge at the middle like a real puffer;
 *   3. one gelled hair spike raked forward off the front of his skull, with a
 *      pair of lieutenant spikes and a shaved-looking back and sides.
 *
 * @module characters/brad
 */

import * as THREE from 'three';
import { PROFILES, register } from '/js/characters/index.js';
import {
  createRig, buildHuman, prismBox, boxMesh, cylMesh, wedgeMesh,
  attach, faceTexture, addFace, faceBox, headFront, SKINS,
} from '/js/characters/rig.js';
import { makeTexture } from '/js/core/ps1.js';

/** Founder proportions: long legs, long arms, 1.86m. @type {Object<string,number>} */
const DIMS = {
  foot: 0.06,
  shin: 0.42,
  thigh: 0.44,
  pelvis: 0.09,
  spine: 0.24,
  chest: 0.25,
  neck: 0.05,
  head: 0.32,
  shoulderX: 0.25,
  shoulderY: 0.21,
  upperArm: 0.32,
  foreArm: 0.28,
  hand: 0.145,
  hipX: 0.12,
};

const SHIRT = 0xa9b7c4;
const CUFF = 0xc3ced8;
const VEST = 0x3f6b66;
const VEST_DARK = 0x2f524f;
const KHAKI = 0xa8926e;
const BELT = 0x4a3a2c;
const HAIR = 0x6b4b30;
const HAIR_DARK = 0x553a24;

/**
 * Quilting for the vest: dark stitch, a lit puff, a shaded underside, tiled.
 * @returns {THREE.Texture}
 */
function vestTexture() {
  const tex = makeTexture(16, 16, (ctx, w, h) => {
    for (let y = 0; y < h; y += 4) {
      ctx.fillStyle = '#e8e8e8'; ctx.fillRect(0, y, w, 1);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, y + 1, w, 1);
      ctx.fillStyle = '#d0d0d0'; ctx.fillRect(0, y + 2, w, 1);
      ctx.fillStyle = '#9a9a9a'; ctx.fillRect(0, y + 3, w, 1);
    }
  });
  tex.repeat.set(1, 1.5);
  return tex;
}

/**
 * Builds BRAD.
 * @returns {import('./rig.js').Actor}
 */
export function createBrad() {
  return createRig(PROFILES.brad, (parts, api) => {
    const d = api.dims;

    buildHuman(parts, d, {
      skin: SKINS.fair,
      top: SHIRT,
      sleeve: SHIRT,
      legs: KHAKI,
      shoe: 0x4a3a2c,
      chestW: 0.50,
      chestD: 0.26,
      waistW: 0.36,
      hipW: 0.38,
      armW: 0.110,
      legW: 0.160,
      headW: 0.275,
      headD: 0.255,
      handW: 0.140,
      // the vest swallows the whole torso
      omit: ['chest', 'abdomen'],
    });

    /* ---- the puffy vest: two swollen quilted prisms over shirt and belly ---- */
    const quilt = vestTexture();
    const vestMat = { color: VEST, map: quilt };

    attach(parts.chest, prismBox(0.58, 0.27, 0.36, {
      bevelF: 0.24, bevelB: 0.32, rings: [[0, 1.0, 1.0], [0.5, 1.05, 1.07], [1, 0.90, 0.86]],
    }, vestMat), 0, 0.075, 0.005);
    attach(parts.spine, prismBox(0.56, 0.27, 0.36, { bevel: 0.30, bottom: 0.88, bottomZ: 0.92, top: 1.03, topZ: 1.03 },
      vestMat), 0, 0.125, 0.005);
    // collar roll — the bit that makes it read as a vest and not a barrel
    attach(parts.chest, prismBox(0.27, 0.10, 0.25, { sides: 6, top: 0.86 }, { color: VEST_DARK }), 0, 0.25, 0.005);
    // the dress-shirt collar points poking out of it
    for (const sg of [-1, 1]) {
      attach(parts.chest, wedgeMesh(0.06, 0.07, 0.03, { color: CUFF }), sg * 0.035, 0.245, 0.125,
        [Math.PI - 0.3, 0, sg * 0.5]);
    }
    // zip and pull tab
    attach(parts.chest, boxMesh(0.022, 0.25, 0.02, { color: VEST_DARK }), 0, 0.075, 0.19);
    attach(parts.chest, boxMesh(0.03, 0.045, 0.012, { color: 0xb8b8b0 }), 0.012, 0.19, 0.2);

    /* ---- khakis: a belt peeking under the vest hem ---- */
    attach(parts.hips, prismBox(0.37, 0.05, 0.25, { sides: 6, top: 1 }, { color: BELT }), 0, 0.075, 0);

    /* ---- gelled hair: a faceted cap, a back plate, the spike and its crew ---- */
    // The cap's front is a vertical plane just proud of the face, starting at
    // the hairline, so it can never slice through the forehead.
    const capD = 0.275;
    attach(parts.head, prismBox(0.29, 0.115, capD, {
      bevelF: 0.14, bevelB: 0.34, top: 0.86, topZ: 0.9, anchorFront: true,
    }, { color: HAIR }), 0, 0.305, headFront(0.255) + 0.006 - capD / 2);
    attach(parts.head, prismBox(0.28, 0.21, 0.10, { sides: 6, top: 0.86 }, { color: HAIR_DARK }), 0, 0.205, -0.095);
    const spike = attach(parts.head, wedgeMesh(0.17, 0.35, 0.14, { color: HAIR }), 0.02, 0.35, 0.055,
      [1.0, 0.12, 0.12]);
    spike.name = 'spike';
    attach(parts.head, wedgeMesh(0.11, 0.22, 0.10, { color: HAIR }), -0.085, 0.335, 0.03, [0.75, -0.3, -0.42]);
    attach(parts.head, wedgeMesh(0.10, 0.19, 0.09, { color: HAIR }), 0.10, 0.325, 0.005, [0.6, 0.3, 0.5]);
    attach(parts.head, wedgeMesh(0.09, 0.15, 0.08, { color: HAIR_DARK }), -0.03, 0.34, -0.07, [-0.2, 0, -0.2]);
    attach(parts.head, wedgeMesh(0.08, 0.13, 0.08, { color: HAIR_DARK }), 0.07, 0.33, -0.08, [-0.3, 0, 0.35]);

    /* ---- face: awake, certain, mildly caffeinated ---- */
    const faceTex = faceTexture({
      skin: '#c9a689',
      line: '#2a1f1c',
      iris: '#3f5a6a',
      brow: '#5c4030',
      browW: 3,
      browTilt: -1,
      smirk: true,
      extra: (ctx, st) => {
        // sideburns and a stubble wash on the jaw
        ctx.fillStyle = '#6b4b30';
        ctx.fillRect(0, 10, 3, 16);
        ctx.fillRect(45, 10, 3, 16);
        ctx.fillStyle = 'rgba(70,50,40,0.16)';
        ctx.fillRect(8, 35, 32, 11);
        ctx.fillRect(4, 28, 5, 12);
        ctx.fillRect(39, 28, 5, 12);
        // the forehead crease of a man who has said "disrupt" today
        if (st.expr === 'shocked') {
          ctx.fillStyle = 'rgba(90,60,45,0.55)';
          ctx.fillRect(14, 5, 20, 1);
          ctx.fillRect(17, 8, 14, 1);
        }
      },
    });
    addFace(parts.head, faceTex, faceBox(d.head));

    /* ---- prop: a travel mug the size of a fire extinguisher ---- */
    const prop = new THREE.Object3D();
    prop.name = 'mug';
    const mug = cylMesh(0.062, 0.050, 0.15, 6, { color: 0x4e5a5e });
    prop.add(mug);
    const lid = cylMesh(0.060, 0.067, 0.04, 6, { color: 0x2d3437 });
    lid.position.y = 0.095;
    prop.add(lid);
    const sip = boxMesh(0.03, 0.012, 0.02, { color: 0x1b2022 });
    sip.position.set(0, 0.118, 0.035);
    prop.add(sip);
    prop.position.set(0.0, -0.105, 0.045);
    prop.rotation.x = -0.35;
    parts.handL.add(prop);

    return {
      faceTex,
      prop,
      emoteY: 2.05,
      style: { motion: 1, armSwing: 1, faceRate: 7 },
      // Chest out, chin up, arms held clear of the vest.
      bias: (P) => {
        P.r('chest', -0.05, 0, 0);
        P.r('neck', -0.02, 0, 0);
        P.r('head', -0.03, 0, 0);
        P.r('armL', 0, 0, -0.21);
        P.r('armR', 0, 0, 0.21);
      },
      // he points and cheers like he is closing a round
      animFace: { point: 'happy+talk', cheer: 'happy+open', shrug: 'squint', idle: 'neutral' },
    };
  }, { dims: DIMS });
}

register('brad', createBrad);
