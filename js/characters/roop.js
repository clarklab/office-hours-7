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
  createRig, buildHuman, taperedBox, boxMesh, wedgeMesh,
  attach, faceTexture, addFace, SKINS,
} from '/js/characters/rig.js';

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
 * The beige CRT. Boxy, heavy, and permanently in the way.
 * @returns {THREE.Object3D}
 */
function crtMonitor() {
  const crt = new THREE.Object3D();
  crt.name = 'crt';
  const shell = taperedBox(0.34, 0.30, 0.31, { top: 0.94, bottom: 0.96, topZ: 0.9, bottomZ: 0.92 },
    { color: 0xbdb3a0 });
  crt.add(shell);
  const bezel = taperedBox(0.31, 0.26, 0.03, { top: 1, bottom: 1 }, { color: 0xc8beab });
  bezel.position.z = 0.16;
  crt.add(bezel);
  const screen = boxMesh(0.24, 0.19, 0.02, { color: 0x30382f, emissive: 0x101c14 });
  screen.position.z = 0.175;
  crt.add(screen);
  const stand = taperedBox(0.20, 0.05, 0.20, { top: 1.2 }, { color: 0xa79d8c });
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
      chestW: 0.54,
      chestD: 0.30,
      waistW: 0.46,
      hipW: 0.46,
      armW: 0.145,
      legW: 0.165,
      headW: 0.26,
      headD: 0.25,
      handW: 0.145,
      neck: false,
      bareLegs: true,
    });

    /* ---- oversized hoodie: a slab that hangs past the hips ---- */
    attach(parts.spine, taperedBox(0.50, 0.30, 0.34, { top: 1.06, bottom: 0.96 }, { color: HOODIE }), 0, 0.06, 0);
    attach(parts.chest, taperedBox(0.56, 0.14, 0.36, { top: 0.98, bottom: 1.02 }, { color: HOODIE_DARK }), 0, 0.235, 0);
    // kangaroo pocket
    attach(parts.spine, taperedBox(0.34, 0.12, 0.05, { top: 1.05 }, { color: HOODIE_DARK }), 0, -0.01, 0.175);

    /* ---- the hood, up: four chunks around a dark opening ---- */
    const hoodMat = { color: HOODIE };
    attach(parts.head, taperedBox(0.42, 0.16, 0.46, { top: 0.80, shearZ: -0.04 }, hoodMat), 0, 0.335, -0.03);
    attach(parts.head, taperedBox(0.10, 0.34, 0.42, { top: 0.9, bottom: 0.9 }, hoodMat), -0.175, 0.16, -0.03);
    attach(parts.head, taperedBox(0.10, 0.34, 0.42, { top: 0.9, bottom: 0.9 }, hoodMat), 0.175, 0.16, -0.03);
    attach(parts.head, taperedBox(0.40, 0.38, 0.14, { top: 0.88, bottom: 0.94 }, hoodMat), 0, 0.15, -0.20);
    // the peak, and the point at the back that makes the hood read as a hood
    attach(parts.head, taperedBox(0.34, 0.07, 0.16, { top: 0.9, shearZ: 0.03 }, { color: HOODIE_DARK }),
      0, 0.30, 0.10, [0.35, 0, 0]);
    attach(parts.head, wedgeMesh(0.22, 0.30, 0.18, { color: HOODIE }), 0, 0.37, -0.20, [-1.15, 0, 0]);
    // drawstrings
    attach(parts.chest, boxMesh(0.022, 0.16, 0.022, { color: 0xd8d2c4 }), -0.07, 0.19, 0.175, [0.1, 0, 0.1]);
    attach(parts.chest, boxMesh(0.022, 0.13, 0.022, { color: 0xd8d2c4 }), 0.07, 0.175, 0.175, [0.1, 0, -0.1]);

    /* ---- cargo shorts, socks, sandals ---- */
    attach(parts.hips, taperedBox(0.48, 0.34, 0.38, { top: 0.92, bottom: 1.05 }, { color: SHORTS }), 0, -0.10, 0);
    attach(parts.hips, boxMesh(0.10, 0.13, 0.04, { color: 0x605c4f }), -0.20, -0.16, 0.13);
    attach(parts.hips, boxMesh(0.10, 0.13, 0.04, { color: 0x605c4f }), 0.20, -0.16, 0.13);
    for (const side of ['L', 'R']) {
      attach(parts[`shin${side}`], taperedBox(0.155, 0.16, 0.16, { top: 1.0, bottom: 0.9 }, { color: SOCK }),
        0, -d.shin + 0.07, 0.005);
      if (body[`foot${side}`]) body[`foot${side}`].material = api.mat({ color: 0x6b5842 });
      attach(parts[`foot${side}`], boxMesh(0.155, 0.02, 0.10, { color: 0x4a3c2d }), 0, 0.005, 0.04);
    }

    /* ---- face, in hood shadow ---- */
    const faceTex = faceTexture({
      skin: '#8f6a4c',
      shade: '#6a4f39',
      line: '#1a1418',
      brow: '#2a2026',
      mouth: '#4a2f2c',
      gaze: 0,
      extra: (ctx, frame) => {
        // the hood casts a hard band across the top half of the face
        ctx.fillStyle = 'rgba(20,16,26,0.42)';
        ctx.fillRect(0, 0, 32, 13);
        ctx.fillStyle = 'rgba(20,16,26,0.22)';
        ctx.fillRect(0, 13, 32, 5);
        // screen-tired under-eyes
        ctx.fillStyle = 'rgba(60,50,70,0.35)';
        ctx.fillRect(5, 19, 9, 3);
        ctx.fillRect(18, 19, 9, 3);
        if (frame === 'neutral' || frame === 'squint') {
          ctx.fillStyle = '#4a2f2c';
          ctx.fillRect(11, 26, 10, 1);
        }
      },
    });
    addFace(parts.head, faceTex, { w: 0.215, h: 0.195, y: d.head * 0.52, z: 0.127 });

    /* ---- prop: the CRT, carried against the chest ---- */
    const prop = crtMonitor();
    prop.position.set(-0.30, -0.02, 0.24);
    prop.rotation.set(0.10, 0.62, 0.06);
    parts.chest.add(prop);

    return {
      faceTex,
      prop,
      emoteY: 1.88,
      style: { motion: 0.85, armSwing: 0.35, faceRate: 6 },
      // THE HUNCH. Also the left arm folded up under the monitor.
      bias: (P) => {
        P.r('spine', 0.30, 0, 0);
        P.r('chest', 0.14, 0, 0);
        P.r('head', 0.20, 0, 0);
        P.p('head', 0, -0.015, 0.03);
        P.p('shoulderL', 0, -0.01, 0.025);
        P.p('shoulderR', 0, -0.01, 0.025);
        P.r('armL', -0.12, 0, -0.10);
        P.r('foreL', -1.20, 0.45, 0.10);
        P.r('armR', -0.10, 0, 0.10);
        P.r('foreR', -0.35, -0.20, 0);
        P.r('thighL', 0.06, 0, 0);
        P.r('thighR', 0.06, 0, 0);
      },
      animFace: { idle: 'squint', walk: 'squint', point: 'squint', cheer: 'neutral' },
    };
  }, { dims: DIMS });
}

register('roop', createRoop);
