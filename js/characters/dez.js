/**
 * DEZ VALENTI — Head of Sales.
 *
 * Silhouette hooks:
 *   1. SHOULDER PADS that arrive in the room before he does — the shoulder line
 *      is nearly a metre wide on a 1.78m man, and the pads are parented to the
 *      shoulder joints so they swing with the arms;
 *   2. a slicked ponytail jutting off the back of the skull;
 *   3. a wraparound visor, and a watch you could read from the parking lot.
 *
 * @module characters/dez
 */

import * as THREE from 'three';
import { PROFILES, register } from '/js/characters/index.js';
import {
  createRig, buildHuman, taperedBox, boxMesh, cylMesh, wedgeMesh,
  attach, faceTexture, addFace, SKINS,
} from '/js/characters/rig.js';
import { makeTexture } from '/js/core/ps1.js';

/** @type {Object<string,number>} */
const DIMS = {
  foot: 0.06,
  shin: 0.40,
  thigh: 0.42,
  pelvis: 0.09,
  spine: 0.23,
  chest: 0.24,
  neck: 0.04,
  head: 0.31,
  shoulderX: 0.255,
  shoulderY: 0.20,
  upperArm: 0.30,
  foreArm: 0.27,
  hand: 0.14,
  hipX: 0.12,
};

const SUIT = 0x6d3050;
const SUIT_DARK = 0x4e2239;
const SHIRT = 0xd6cbbe;
const HAIR = 0x2b2226;

/**
 * Magenta pinstripe. Three pixels of suit, one of chalk — at 384x216 with
 * affine warping this shimmers beautifully and reads as "too much suit".
 * @returns {THREE.Texture}
 */
function pinstripeTexture() {
  const tex = makeTexture(16, 16, (ctx, w, h) => {
    ctx.fillStyle = '#d6d0d4';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#b39aa8';
    for (let x = 0; x < w; x += 4) ctx.fillRect(x, 0, 1, h);
  });
  tex.repeat.set(3, 2);
  return tex;
}

/**
 * Builds DEZ.
 * @returns {import('./rig.js').Actor}
 */
export function createDez() {
  return createRig(PROFILES.dez, (parts, api) => {
    const d = api.dims;
    const stripe = pinstripeTexture();
    const suitMat = { color: SUIT, map: stripe };

    const body = buildHuman(parts, d, {
      skin: SKINS.tan,
      top: SUIT,
      sleeve: SUIT,
      legs: SUIT,
      shoe: 0x241f22,
      chestW: 0.54,
      chestD: 0.27,
      waistW: 0.40,
      hipW: 0.42,
      armW: 0.125,
      legW: 0.175,
      headW: 0.27,
      headD: 0.25,
      handW: 0.135,
    });
    // put the pinstripe on every suit panel
    for (const key of ['chest', 'abdomen', 'pelvis', 'armL', 'armR', 'foreL', 'foreR', 'thighL', 'thighR', 'shinL', 'shinR']) {
      if (body[key]) body[key].material = api.mat(suitMat);
    }

    /* ---- the pads ---- */
    for (const side of ['L', 'R']) {
      const sg = side === 'L' ? -1 : 1;
      attach(parts[`shoulder${side}`],
        taperedBox(0.32, 0.17, 0.40, { top: 1.0, bottom: 0.66, topZ: 0.98, bottomZ: 0.82, shearX: sg * 0.05 }, suitMat),
        sg * 0.105, 0.03, 0);
      // a second, flatter chunk on top so the pad reads faceted, not domed
      attach(parts[`shoulder${side}`],
        taperedBox(0.30, 0.07, 0.34, { top: 0.82, shearX: sg * 0.02 }, { color: SUIT_DARK }), sg * 0.115, 0.115, 0);
    }
    // lapels + shirt V
    attach(parts.chest, taperedBox(0.17, 0.22, 0.05, { top: 1.5, bottom: 0.2 }, { color: SHIRT }), 0, 0.12, 0.135);
    attach(parts.chest, taperedBox(0.07, 0.20, 0.03, { top: 1.2, bottom: 0.6 }, { color: 0x3a2b33 }), 0, 0.08, 0.155);
    attach(parts.chest, taperedBox(0.30, 0.10, 0.10, { top: 0.6 }, { color: SUIT_DARK }), 0, 0.245, 0.10);

    /* ---- slicked hair + ponytail ---- */
    attach(parts.head, taperedBox(0.285, 0.13, 0.265, { top: 0.86, shearZ: -0.012 }, { color: HAIR }), 0, 0.27, -0.005);
    attach(parts.head, taperedBox(0.24, 0.24, 0.07, { top: 0.9 }, { color: HAIR }), 0, 0.18, -0.10);
    const tail = attach(parts.head, wedgeMesh(0.085, 0.26, 0.085, { color: HAIR }), 0, 0.17, -0.155,
      [2.5, 0, 0]);
    tail.name = 'ponytail';
    attach(parts.head, boxMesh(0.055, 0.045, 0.055, { color: 0x1b1518 }), 0, 0.235, -0.135);

    /* ---- face: wraparound shades, permanent grin ---- */
    const faceTex = faceTexture({
      skin: '#b78d6d',
      line: '#1d1a1e',
      mouth: '#4a2b2b',
      smirk: true,
      extra: (ctx, frame) => {
        // wraparound shades: one dark band, one glint, wrapping past the temples
        ctx.fillStyle = '#17141a';
        ctx.fillRect(2, 11, 28, 8);
        ctx.fillRect(1, 12, 30, 5);
        ctx.fillStyle = '#3a3340';
        ctx.fillRect(2, 11, 28, 1);
        ctx.fillStyle = '#b9c6d8';
        ctx.fillRect(6, 13, 4, 2);
        ctx.fillRect(21, 13, 2, 2);
        if (frame === 'shocked') {
          ctx.fillStyle = '#17141a';
          ctx.fillRect(2, 8, 28, 2);
        }
        // teeth
        if (frame === 'talk' || frame === 'neutral') {
          ctx.fillStyle = '#e8e2d6';
          ctx.fillRect(13, frame === 'talk' ? 24 : 25, 6, 2);
        }
      },
    });
    addFace(parts.head, faceTex, { w: 0.23, h: 0.21, y: d.head * 0.55, z: 0.127 });

    /* ---- watch, and the brick phone he is always mid-call on ---- */
    attach(parts.handL, boxMesh(0.10, 0.055, 0.115, { color: 0xb2984c }), -0.005, 0.02, 0.005);
    attach(parts.handL, boxMesh(0.065, 0.02, 0.075, { color: 0xd8cfae }), -0.005, 0.05, 0.02);

    const prop = new THREE.Object3D();
    prop.name = 'phone';
    const shell = taperedBox(0.07, 0.20, 0.045, { top: 0.9 }, { color: 0x2a2a30 });
    prop.add(shell);
    const screen = boxMesh(0.045, 0.05, 0.012, { color: 0x6f8a6a, emissive: 0x1a2a18 });
    screen.position.set(0, 0.055, 0.028);
    prop.add(screen);
    const ant = cylMesh(0.006, 0.010, 0.11, 4, { color: 0x1b1b20 });
    ant.position.set(0.022, 0.15, -0.01);
    prop.add(ant);
    prop.position.set(0, -0.12, 0.03);
    prop.rotation.set(-0.2, 0, -0.1);
    parts.handR.add(prop);

    return {
      faceTex,
      prop,
      emoteY: 2.0,
      style: { motion: 1.15, armSwing: 0.9, faceRate: 8 },
      // Pads force the arms out; the swagger is a permanent half-lean.
      bias: (P) => {
        P.r('armL', 0, 0, -0.20);
        P.r('armR', 0, 0, 0.20);
        P.r('chest', -0.04, 0, 0);
        P.r('hips', 0, 0, 0);
        P.r('head', -0.02, 0, 0);
      },
      animFace: { point: 'talk', shrug: 'talk', slump: 'shocked' },
    };
  }, { dims: DIMS });
}

register('dez', createDez);
