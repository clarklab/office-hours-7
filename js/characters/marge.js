/**
 * MARGUERITE "MARGE" OKONKWO — finance.
 *
 * Silhouette hooks:
 *   1. RAMROD STRAIGHT — a vertical column where everyone else is a slouch. Her
 *      motion scale is a third of the cast's, so she is also the stillest;
 *   2. a tight bun sitting proud on the crown;
 *   3. enormous round glasses, modelled, that overhang the sides of her head;
 *   4. a grey skirt suit — a trapezoid, not two legs — and a red ledger binder
 *      clamped under her left arm.
 *
 * @module characters/marge
 */

import * as THREE from 'three';
import { PROFILES, register } from '/js/characters/index.js';
import {
  createRig, buildHuman, taperedBox, boxMesh, cylMesh,
  attach, faceTexture, addFace, SKINS,
} from '/js/characters/rig.js';

/** @type {Object<string,number>} */
const DIMS = {
  foot: 0.055,
  shin: 0.37,
  thigh: 0.39,
  pelvis: 0.085,
  spine: 0.21,
  chest: 0.235,
  neck: 0.05,
  head: 0.30,
  shoulderX: 0.215,
  shoulderY: 0.185,
  upperArm: 0.29,
  foreArm: 0.25,
  hand: 0.125,
  hipX: 0.10,
};

const SUIT = 0x7b7c84;
const SUIT_DARK = 0x5f606a;
const BLOUSE = 0xcdc6bb;
const HAIR = 0x201a1a;
const LEDGER = 0x8c342d;

/**
 * Builds MARGE.
 * @returns {import('./rig.js').Actor}
 */
export function createMarge() {
  return createRig(PROFILES.marge, (parts, api) => {
    const d = api.dims;

    const body = buildHuman(parts, d, {
      skin: SKINS.deep,
      top: SUIT,
      sleeve: SUIT,
      legs: 0x45424b,
      shoe: 0x241f22,
      chestW: 0.44,
      chestD: 0.23,
      waistW: 0.32,
      hipW: 0.34,
      armW: 0.105,
      legW: 0.125,
      headW: 0.255,
      headD: 0.24,
      handW: 0.115,
    });

    /* ---- skirt suit: one trapezoid, jacket hem, blouse V ---- */
    attach(parts.hips, taperedBox(0.52, 0.40, 0.40, { top: 0.62, bottom: 1.0 }, { color: SUIT_DARK }), 0, -0.185, 0);
    attach(parts.spine, taperedBox(0.34, 0.24, 0.26, { top: 1.14, bottom: 0.96 }, { color: SUIT }), 0, 0.10, 0);
    attach(parts.chest, taperedBox(0.14, 0.19, 0.04, { top: 1.5, bottom: 0.25 }, { color: BLOUSE }), 0, 0.10, 0.122);
    attach(parts.chest, taperedBox(0.26, 0.09, 0.09, { top: 0.7 }, { color: SUIT_DARK }), 0, 0.225, 0.095);
    // square shoulders — finance does not have a soft line
    for (const side of ['L', 'R']) {
      const sg = side === 'L' ? -1 : 1;
      attach(parts[`shoulder${side}`], taperedBox(0.14, 0.09, 0.22, { top: 1, bottom: 0.9 }, { color: SUIT }),
        sg * 0.015, 0.02, 0);
    }

    /* ---- the bun ---- */
    attach(parts.head, taperedBox(0.265, 0.10, 0.255, { top: 0.86 }, { color: HAIR }), 0, 0.27, -0.008);
    attach(parts.head, taperedBox(0.22, 0.24, 0.085, { top: 0.9 }, { color: HAIR }), 0, 0.165, -0.082);
    const bun = attach(parts.head, taperedBox(0.145, 0.19, 0.145, { top: 0.78, bottom: 0.62 }, { color: HAIR }),
      0, 0.41, -0.03);
    bun.name = 'bun';
    attach(parts.head, boxMesh(0.035, 0.10, 0.035, { color: 0x3a2f2a }), 0.055, 0.40, 0.0, [0, 0, 0.7]);

    /* ---- ENORMOUS round glasses, in actual geometry ---- */
    for (const x of [-0.066, 0.066]) {
      const rim = cylMesh(0.066, 0.066, 0.018, 8, { color: 0x27242a });
      rim.rotation.x = Math.PI / 2;
      rim.position.set(x, d.head * 0.56, 0.128);
      parts.head.add(rim);
      const lens = cylMesh(0.055, 0.055, 0.012, 8, { color: 0x9db0be, transparent: true, opacity: 0.55 });
      lens.rotation.x = Math.PI / 2;
      lens.position.set(x, d.head * 0.56, 0.134);
      parts.head.add(lens);
    }
    attach(parts.head, boxMesh(0.05, 0.012, 0.016, { color: 0x27242a }), 0, d.head * 0.56, 0.132);
    attach(parts.head, boxMesh(0.02, 0.012, 0.09, { color: 0x27242a }), -0.125, d.head * 0.56, 0.085);
    attach(parts.head, boxMesh(0.02, 0.012, 0.09, { color: 0x27242a }), 0.125, d.head * 0.56, 0.085);

    /* ---- face: severe, and mostly lens ---- */
    const faceTex = faceTexture({
      skin: '#6f4d38',
      shade: '#563b2b',
      line: '#150f0f',
      brow: '#241a18',
      mouth: '#43231f',
      browTilt: 1,
      extra: (ctx, frame) => {
        if (frame === 'neutral' || frame === 'squint') {
          ctx.fillStyle = '#43231f';
          ctx.fillRect(11, 26, 10, 1);
        }
      },
    });
    addFace(parts.head, faceTex, { w: 0.21, h: 0.195, y: d.head * 0.53, z: 0.123 });

    /* ---- prop: the red ledger, clamped under the left arm ---- */
    const prop = new THREE.Object3D();
    prop.name = 'ledger';
    const cover = taperedBox(0.075, 0.30, 0.24, { top: 1, bottom: 1 }, { color: LEDGER });
    prop.add(cover);
    const pages = boxMesh(0.045, 0.27, 0.215, { color: 0xd9d2c0 });
    pages.position.set(0.018, 0, 0.005);
    prop.add(pages);
    const band = boxMesh(0.08, 0.035, 0.245, { color: 0x3a2320 });
    band.position.y = 0.09;
    prop.add(band);
    prop.position.set(-0.275, 0.02, 0.02);
    prop.rotation.set(0.06, 0, 0.05);
    parts.chest.add(prop);

    return {
      faceTex,
      prop,
      emoteY: 1.98,
      style: { motion: 0.35, armSwing: 0.45, faceRate: 6 },
      // Vertical. The left arm clamps the ledger; nothing else moves much.
      bias: (P) => {
        P.r('spine', -0.035, 0, 0);
        P.r('chest', -0.03, 0, 0);
        P.r('neck', -0.02, 0, 0);
        P.r('armL', 0.04, 0, -0.16);
        P.r('foreL', -1.15, 0.30, 0.10);
        P.r('armR', 0, 0, 0.05);
      },
      animFace: { idle: 'neutral', talk: 'talk', point: 'squint', shrug: 'squint', cheer: 'neutral' },
    };
  }, { dims: DIMS });
}

register('marge', createMarge);
