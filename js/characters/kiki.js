/**
 * KIKI PARK — front of house.
 *
 * Silhouette hooks:
 *   1. the shortest person in the building, by 20cm;
 *   2. a HAIR MASS nearly as wide as her own shoulders, built from five faceted
 *      chunks so it reads round without ever being smooth;
 *   3. a headset whose mic boom sticks out past her face, and a corded handset
 *      she never puts down — the coiled cord is real geometry.
 *
 * @module characters/kiki
 */

import * as THREE from 'three';
import { PROFILES, register } from '/js/characters/index.js';
import {
  createRig, buildHuman, taperedBox, boxMesh, cylMesh,
  attach, faceTexture, addFace, SKINS,
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
const BLOUSE = 0x6d7a66;
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
  const geo = new THREE.TubeGeometry(curve, 26, 0.011, 3, false);
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
    });

    /* ---- the hair mass: five chunks, no curves anywhere ---- */
    const hairMat = { color: HAIR };
    attach(parts.head, taperedBox(0.50, 0.30, 0.46, { top: 0.72, bottom: 0.94 }, hairMat), 0, 0.31, -0.02);
    attach(parts.head, taperedBox(0.40, 0.15, 0.14, { top: 0.86, shearZ: 0.025 }, hairMat), 0, 0.255, 0.125);
    attach(parts.head, taperedBox(0.17, 0.32, 0.38, { top: 0.88, bottom: 0.78 }, hairMat), -0.225, 0.16, -0.02);
    attach(parts.head, taperedBox(0.17, 0.32, 0.38, { top: 0.88, bottom: 0.78 }, hairMat), 0.225, 0.16, -0.02);
    attach(parts.head, taperedBox(0.42, 0.32, 0.18, { top: 0.9, bottom: 0.85 }, hairMat), 0, 0.14, -0.195);

    /* ---- headset: band, earpiece, boom, mic ---- */
    const gear = { color: 0x1f2126 };
    attach(parts.head, boxMesh(0.50, 0.026, 0.042, gear), 0, 0.478, 0.0);
    attach(parts.head, boxMesh(0.028, 0.19, 0.042, gear), -0.246, 0.385, 0.0);
    attach(parts.head, boxMesh(0.028, 0.19, 0.042, gear), 0.246, 0.385, 0.0);
    attach(parts.head, boxMesh(0.055, 0.085, 0.07, { color: 0x34363d }), -0.258, 0.285, 0.01);
    attach(parts.head, boxMesh(0.055, 0.085, 0.07, { color: 0x34363d }), 0.258, 0.285, 0.01);
    // the boom sweeps from the left earpiece across to the mouth — it is the
    // one bit of Kiki that reads in a straight-on silhouette
    const boom = attach(parts.head, taperedBox(0.018, 0.36, 0.018, { top: 0.75 }, gear),
      -0.132, 0.16, 0.135, [2.61, 0, -0.735]);
    boom.name = 'micBoom';
    attach(parts.head, boxMesh(0.036, 0.036, 0.036, { color: 0x44464d }), -0.015, 0.04, 0.21);

    /* ---- face: enormous eyes, absolutely flat delivery ---- */
    const faceTex = faceTexture({
      skin: '#d9bda6',
      line: '#221b1e',
      brow: '#3a2b2c',
      mouth: '#7a4a48',
      gaze: 2,
      extra: (ctx, frame) => {
        // under-eye shadow: PATIENCE 0
        ctx.fillStyle = 'rgba(90,70,80,0.30)';
        ctx.fillRect(5, 19, 9, 2);
        ctx.fillRect(18, 19, 9, 2);
        // fringe shadow across the brow, because the hair overhangs
        ctx.fillStyle = 'rgba(40,30,35,0.35)';
        ctx.fillRect(0, 0, 32, 7);
        if (frame === 'neutral') {
          ctx.fillStyle = '#7a4a48';
          ctx.fillRect(12, 25, 8, 1);
        }
      },
    });
    addFace(parts.head, faceTex, { w: 0.22, h: 0.20, y: d.head * 0.53, z: 0.127 });

    /* ---- prop: the handset, with the cord ---- */
    const prop = new THREE.Object3D();
    prop.name = 'handset';
    const bar = taperedBox(0.05, 0.22, 0.045, { top: 1, bottom: 1 }, { color: 0x30303a });
    prop.add(bar);
    for (const y of [0.115, -0.115]) {
      const cup = taperedBox(0.075, 0.055, 0.075, { top: 0.8 }, { color: 0x30303a });
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
      animFace: { talk: 'talk', idle: 'neutral', point: 'squint', slump: 'squint', shrug: 'squint' },
    };
  }, { dims: DIMS });
}

register('kiki', createKiki);
