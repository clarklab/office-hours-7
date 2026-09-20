/**
 * BRAD HOLLOWAY — founder and CEO of MULCH, Inc.
 *
 * Silhouette hooks, in order of how far away they read:
 *   1. he is the tallest thing in the office by a clear head;
 *   2. a PUFFY VEST that doubles the width of his torso and leaves his
 *      dress-shirt arms looking like pipe cleaners;
 *   3. one gelled hair spike raked forward off the front of his skull.
 *
 * @module characters/brad
 */

import * as THREE from 'three';
import { PROFILES, register } from '/js/characters/index.js';
import {
  createRig, buildHuman, taperedBox, boxMesh, cylMesh, wedgeMesh,
  attach, faceTexture, addFace, SKINS,
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
const VEST = 0x3f6b66;
const VEST_DARK = 0x2f524f;
const KHAKI = 0xa8926e;
const HAIR = 0x6b4b30;

/**
 * Horizontal quilting for the vest — four dark seams, tiled around the box.
 * @returns {THREE.Texture}
 */
function vestTexture() {
  const tex = makeTexture(16, 16, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#b4b4b4';
    for (let y = 3; y < h; y += 4) ctx.fillRect(0, y, w, 1);
    ctx.fillStyle = '#d2d2d2';
    for (let y = 4; y < h; y += 4) ctx.fillRect(0, y, w, 1);
  });
  return tex;
}

/**
 * Builds BRAD.
 * @returns {import('./rig.js').Actor}
 */
export function createBrad() {
  return createRig(PROFILES.brad, (parts, api) => {
    const d = api.dims;

    const body = buildHuman(parts, d, {
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
    });

    /* ---- the puffy vest: two fat quilted chunks over shirt and belly ---- */
    const quilt = vestTexture();
    const vestMat = { color: VEST, map: quilt };

    attach(parts.chest, taperedBox(0.68, 0.31, 0.40, { top: 0.94, bottom: 1.0 }, vestMat), 0, 0.135, 0.005);
    attach(parts.spine, taperedBox(0.64, 0.26, 0.38, { top: 1.02, bottom: 0.86 }, vestMat), 0, 0.125, 0.005);
    // collar roll — the bit that makes it read as a vest and not a barrel
    attach(parts.chest, taperedBox(0.30, 0.09, 0.26, { top: 0.88 }, { color: VEST_DARK }), 0, 0.275, 0.01);
    // zip
    attach(parts.chest, boxMesh(0.025, 0.28, 0.02, { color: VEST_DARK }), 0, 0.13, 0.195);

    /* ---- gelled hair: one base chunk, three forward-raked spikes ---- */
    attach(parts.head, taperedBox(0.285, 0.12, 0.27, { top: 0.9, shearZ: -0.01 }, { color: HAIR }), 0, 0.275, -0.005);
    attach(parts.head, taperedBox(0.29, 0.20, 0.10, { top: 0.8 }, { color: HAIR }), 0, 0.20, -0.095);
    const spike = attach(parts.head, wedgeMesh(0.17, 0.34, 0.14, { color: HAIR }), 0.02, 0.345, 0.055,
      [1.0, 0.12, 0.12]);
    spike.name = 'spike';
    attach(parts.head, wedgeMesh(0.11, 0.22, 0.10, { color: HAIR }), -0.085, 0.335, 0.03, [0.75, -0.3, -0.42]);
    attach(parts.head, wedgeMesh(0.10, 0.19, 0.09, { color: HAIR }), 0.10, 0.325, 0.005, [0.6, 0.3, 0.5]);

    /* ---- face: awake, certain, mildly caffeinated ---- */
    const faceTex = faceTexture({
      skin: '#c9a689',
      line: '#2a1f1c',
      brow: '#5c4030',
      browTilt: -1,
      smirk: true,
      extra: (ctx, frame) => {
        // a little stubble wash on the jaw
        ctx.fillStyle = 'rgba(70,50,40,0.18)';
        ctx.fillRect(6, 24, 20, 6);
        if (frame === 'shocked') {
          ctx.fillStyle = '#2a1f1c';
          ctx.fillRect(5, 5, 9, 1);
          ctx.fillRect(18, 5, 9, 1);
        }
      },
    });
    addFace(parts.head, faceTex, { w: 0.225, h: 0.21, y: d.head * 0.55, z: 0.130 });

    /* ---- prop: a travel mug the size of a fire extinguisher ---- */
    const prop = new THREE.Object3D();
    prop.name = 'mug';
    const mug = cylMesh(0.062, 0.050, 0.15, 6, { color: 0x4e5a5e });
    prop.add(mug);
    const lid = cylMesh(0.066, 0.066, 0.04, 6, { color: 0x2d3437 });
    lid.position.y = 0.09;
    prop.add(lid);
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
      animFace: { point: 'talk', cheer: 'talk', shrug: 'squint' },
    };
  }, { dims: DIMS });
}

register('brad', createBrad);
