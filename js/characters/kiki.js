/**
 * KIKI PARK — front of house.
 *
 * Silhouette hooks:
 *   1. the shortest person in the building, by 20cm;
 *   2. a HAIR MASS nearly as wide as her own shoulders, built from faceted
 *      prisms so it reads round without ever being smooth — the main mass
 *      swells at the middle and narrows at crown and jaw, and a blunt fringe
 *      overhangs the face;
 *   3. a headset whose mic boom sticks out past her face, and a corded handset
 *      she never puts down — the coiled cord is real geometry.
 *
 * @module characters/kiki
 */

import * as THREE from 'three';
import { PROFILES, register } from '/js/characters/index.js';
import {
  createRig, buildHuman, prismBox, boxMesh,
  attach, faceTexture, addFace, faceBox, headFront, SKINS,
} from '/js/characters/rig.js';
import { ps1Material } from '/js/core/ps1.js';

/** Short, big-headed, 1.58m. @type {Object<string,number>} */
const DIMS = {
  foot: 0.055,
  shin: 0.34,
  thigh: 0.36,
  pelvis: 0.08,
  spine: 0.20,
  chest: 0.21,
  neck: 0.04,
  head: 0.30,
  shoulderX: 0.20,
  shoulderY: 0.17,
  upperArm: 0.26,
  foreArm: 0.23,
  hand: 0.125,
  hipX: 0.10,
};

const HAIR = 0x2a2124;
const HAIR_LIT = 0x3a2e32;
const BLOUSE = 0x6d7a66;
const COLLAR = 0xd8d2c6;
const SKIRT = 0x4a4750;

/**
 * The coiled handset cord: a helix pushed through a 3-sided tube. Cheap, and it
 * is the single most recognisable thing about a reception desk.
 * @param {number} turns
 * @returns {THREE.Mesh}
 */
function coiledCord(turns) {
  const pts = [];
  const steps = 8 * turns;
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const a = u * turns * Math.PI * 2;
    const droop = u * u * 0.10;
    pts.push(new THREE.Vector3(
      Math.cos(a) * 0.048,
      -u * 0.34 - droop,
      Math.sin(a) * 0.048,
    ));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const geo = new THREE.TubeGeometry(curve, 16, 0.011, 3, false);
  return new THREE.Mesh(geo, ps1Material({ color: 0x27262b }));
}

/**
 * Builds KIKI.
 * @returns {import('./rig.js').Actor}
 */
export function createKiki() {
  return createRig(PROFILES.kiki, (parts, api) => {
    const d = api.dims;

    buildHuman(parts, d, {
      skin: SKINS.porcelain,
      top: BLOUSE,
      sleeve: BLOUSE,
      legs: SKIRT,
      shoe: 0x2e2a2e,
      chestW: 0.40,
      chestD: 0.22,
      waistW: 0.30,
      hipW: 0.33,
      armW: 0.098,
      legW: 0.135,
      headW: 0.265,
      headD: 0.25,
      handW: 0.12,
      // the hair swallows her ears
      ears: false,
    });

    /* ---- blouse: a round collar and a skirt with a flare ---- */
    attach(parts.chest, prismBox(0.20, 0.05, 0.16, { sides: 6, top: 0.8 }, { color: COLLAR }), 0, 0.205, 0.02);
    attach(parts.hips, prismBox(0.37, 0.30, 0.26, { bevel: 0.3, top: 0.86, bottom: 1.14 }, { color: SKIRT }), 0, -0.08, 0);

    /* ---- the hair mass: faceted prisms, no curves anywhere ---- */
    const hairMat = { color: HAIR };
    // the main mass swells at the temples and narrows at crown and jaw, so the
    // outline is an octagon from the front AND from above
    attach(parts.head, prismBox(0.52, 0.30, 0.44, {
      bevelF: 0.22, bevelB: 0.34, rings: [[0, 0.88, 0.92], [0.45, 1.0, 1.0], [1, 0.76, 0.82]],
    }, hairMat), 0, 0.34, -0.04);
    // back of the head, falling to the nape
    attach(parts.head, prismBox(0.46, 0.30, 0.20, { sides: 6, top: 1.0, bottom: 0.78 }, hairMat), 0, 0.16, -0.19);
    // blunt fringe, overhanging the brow
    attach(parts.head, prismBox(0.40, 0.12, 0.13, { sides: 6, top: 0.9, anchorFront: true }, { color: HAIR_LIT }),
      0, 0.26, 0.13);
    // the two side curtains that frame the face down to the jaw
    for (const sg of [-1, 1]) {
      attach(parts.head, prismBox(0.14, 0.26, 0.30, { sides: 6, top: 1.0, bottom: 0.7 }, hairMat),
        sg * 0.205, 0.11, -0.04);
    }

    /* ---- headset: band, earpieces, boom, mic ---- */
    const gear = { color: 0x1f2126 };
    attach(parts.head, prismBox(0.50, 0.03, 0.045, { sides: 4, rings: [[0, 1, 1], [1, 0.88, 1]] }, gear), 0, 0.47, 0.01);
    for (const sg of [-1, 1]) {
      attach(parts.head, boxMesh(0.028, 0.22, 0.042, gear), sg * 0.262, 0.36, 0.01, [0, 0, sg * -0.12]);
      attach(parts.head, prismBox(0.058, 0.09, 0.08, { sides: 4, top: 0.8 }, { color: 0x34363d }),
        sg * 0.282, 0.225, 0.01);
    }
    // the boom sweeps from the left earpiece across to the mouth — it is the
    // one bit of Kiki that reads in a straight-on silhouette
    const boom = attach(parts.head, prismBox(0.018, 0.38, 0.018, { sides: 4, top: 0.75 }, gear),
      -0.15, 0.135, 0.14, [2.61, 0, -0.76]);
    boom.name = 'micBoom';
    attach(parts.head, boxMesh(0.04, 0.036, 0.04, { color: 0x44464d }), -0.015, 0.02, 0.205);

    /* ---- face: enormous eyes, absolutely flat delivery ---- */
    const faceTex = faceTexture({
      skin: '#d9bda6',
      line: '#221b1e',
      iris: '#3a2a26',
      brow: '#2a2124',
      mouth: '#7a4a48',
      lip: '#b87a74',
      gaze: 2,
      eyeScale: 1.15,
      eyeY: 1,
      lashes: true,
      extra: (ctx) => {
        // under-eye shadow: PATIENCE 0
        ctx.fillStyle = 'rgba(90,70,80,0.30)';
        ctx.fillRect(7, 32, 13, 2);
        ctx.fillRect(28, 32, 13, 2);
        // fringe shadow across the brow, because the hair overhangs
        ctx.fillStyle = 'rgba(40,30,35,0.38)';
        ctx.fillRect(0, 0, 48, 9);
        ctx.fillStyle = 'rgba(40,30,35,0.18)';
        ctx.fillRect(0, 9, 48, 3);
      },
    });
    // sits a little low: the fringe owns the top of her head
    addFace(parts.head, faceTex, faceBox(d.head, 1.0, -0.031));

    /* ---- prop: the handset, with the cord ---- */
    const prop = new THREE.Object3D();
    prop.name = 'handset';
    const bar = prismBox(0.05, 0.22, 0.045, { sides: 6, top: 1, bottom: 1 }, { color: 0x30303a });
    prop.add(bar);
    for (const y of [0.115, -0.115]) {
      const cup = prismBox(0.075, 0.055, 0.075, { sides: 4, top: 0.8 }, { color: 0x30303a });
      cup.position.set(0, y, 0.01);
      prop.add(cup);
    }
    const cord = coiledCord(6);
    cord.position.set(0, -0.135, 0.0);
    prop.add(cord);
    prop.position.set(0, -0.10, 0.02);
    prop.rotation.set(-0.15, 0, 0.12);
    parts.handL.add(prop);

    return {
      faceTex,
      prop,
      emoteY: 1.80,
      style: { motion: 1.3, armSwing: 1.05, faceRate: 9 },
      // Head cocked toward the handset; shoulders permanently a little up.
      bias: (P) => {
        P.r('head', 0.02, 0.05, 0.10);
        P.p('shoulderL', 0, 0.012, 0);
        P.p('shoulderR', 0, 0.012, 0);
        P.r('armL', -0.22, 0, -0.32);
        P.r('foreL', -0.62, 0, 0.30);
        P.r('armR', 0, 0, 0.06);
      },
      // deadpan: even her cheer is a squint
      animFace: { idle: 'neutral', point: 'squint', slump: 'squint', shrug: 'squint', cheer: 'squint+open' },
    };
  }, { dims: DIMS });
}

register('kiki', createKiki);
