/**
 * GARY STRAUB — the client. A guest star, not a member of the standing cast
 * (see GUEST_IDS in ./index.js): only episodes that book him build him.
 *
 * He has been in "enterprise solutions" since 1986 and nobody has told him.
 *
 * Silhouette hooks:
 *   1. a MULLET — business at the front, a whole second meeting at the back;
 *   2. a pastel-teal blazer with the sleeves shoved up to the elbow over a
 *      salmon tee, and white slacks and loafers: Miami, via a strip mall;
 *   3. aviators parked on his forehead and a moustache you could hide keys in;
 *   4. finger guns. He has a whole pose for them. He has a whole pose for "HEY!".
 *
 * @module characters/gary
 */

import * as THREE from 'three';
import { PROFILES, register } from '/js/characters/index.js';
import {
  createRig, buildHuman, prismBox, boxMesh, wedgeMesh,
  attach, faceTexture, addFace, faceBox, headFront, SKINS,
} from '/js/characters/rig.js';

/** A big man who stands like he is posing next to a car. @type {Object<string,number>} */
const DIMS = {
  foot: 0.06,
  shin: 0.40,
  thigh: 0.42,
  pelvis: 0.09,
  spine: 0.24,
  chest: 0.25,
  neck: 0.05,
  head: 0.31,
  shoulderX: 0.25,
  shoulderY: 0.21,
  upperArm: 0.31,
  foreArm: 0.27,
  hand: 0.145,
  hipX: 0.12,
};

const BLAZER = 0x7fb8ae;
const BLAZER_DARK = 0x5f958c;
const TEE = 0xe0a090;
const SLACKS = 0xd9d4c6;
const HAIR = 0x7a5536;
const HAIR_DARK = 0x5e4028;
const GOLD = 0xd8b84a;

/** -1 forward, as in the shared pose library. */
const FWD = -1;

/**
 * Builds GARY.
 * @returns {import('./rig.js').Actor}
 */
export function createGary() {
  return createRig(PROFILES.gary, (parts, api) => {
    const d = api.dims;

    buildHuman(parts, d, {
      skin: SKINS.tan,
      top: BLAZER,
      sleeve: BLAZER,
      legs: SLACKS,
      shoe: 0xe8e4da,
      chestW: 0.54,
      chestD: 0.28,
      waistW: 0.42,
      hipW: 0.40,
      armW: 0.12,
      legW: 0.165,
      headW: 0.275,
      headD: 0.255,
      handW: 0.14,
      // sleeves shoved up: the forearms are bare
      bareArms: true,
    });

    /* ---- the blazer: shoulder pads (it IS 1986), lapels, the tee under it ---- */
    for (const side of ['L', 'R']) {
      const sg = side === 'L' ? -1 : 1;
      attach(parts[`shoulder${side}`], prismBox(0.20, 0.10, 0.25, { bevel: 0.3, top: 0.86, shearX: sg * 0.02 },
        { color: BLAZER }), sg * 0.035, 0.02, 0);
      // the shoved-up sleeve, bunched at the elbow
      attach(parts[`fore${side}`], prismBox(0.135, 0.07, 0.135, { sides: 6, top: 0.92, bottom: 1.05 },
        { color: BLAZER_DARK }), 0, -0.02, 0);
    }
    attach(parts.chest, prismBox(0.20, 0.23, 0.05, { sides: 4, top: 1.5, bottom: 0.3 }, { color: TEE }), 0, 0.12, 0.13);
    for (const sg of [-1, 1]) {
      attach(parts.chest, wedgeMesh(0.10, 0.22, 0.03, { color: BLAZER_DARK }), sg * 0.085, 0.13, 0.14,
        [Math.PI, 0, sg * -0.35]);
    }
    // a gold chain lying on the tee
    attach(parts.chest, prismBox(0.13, 0.012, 0.05, { sides: 6, top: 1 }, { color: GOLD, emissive: 0x2a2008 }),
      0, 0.19, 0.145, [0.35, 0, 0]);
    // a belt with a buckle you could land a plane on
    attach(parts.hips, prismBox(0.41, 0.045, 0.27, { sides: 6, top: 1 }, { color: 0x3a2c22 }), 0, 0.075, 0);
    attach(parts.hips, boxMesh(0.07, 0.045, 0.02, { color: GOLD, emissive: 0x2a2008 }), 0, 0.075, 0.14);

    /* ---- THE MULLET ---- */
    // business in front: a short, feathered top with a vertical hairline
    const capD = 0.28;
    attach(parts.head, prismBox(0.29, 0.12, capD, {
      bevelF: 0.14, bevelB: 0.3, top: 0.88, topZ: 0.9, anchorFront: true,
    }, { color: HAIR }), 0, 0.30, headFront(0.255) + 0.006 - capD / 2);
    attach(parts.head, wedgeMesh(0.10, 0.08, 0.10, { color: HAIR }), -0.07, 0.37, 0.05, [0.5, 0, -0.3]);
    attach(parts.head, wedgeMesh(0.10, 0.08, 0.10, { color: HAIR }), 0.07, 0.37, 0.05, [0.5, 0, 0.3]);
    // party in the back: a long curtain down past the collar
    const party = attach(parts.head, prismBox(0.27, 0.36, 0.08, { sides: 6, top: 1.0, bottom: 0.82 }, { color: HAIR_DARK }),
      0, 0.12, -0.13);
    party.name = 'mullet';
    attach(parts.head, prismBox(0.22, 0.10, 0.06, { sides: 4, top: 1.0, bottom: 0.7 }, { color: HAIR_DARK }),
      0, -0.07, -0.14, [0.25, 0, 0]);

    /* ---- aviators, parked on the forehead ---- */
    const avi = new THREE.Object3D();
    avi.name = 'aviators';
    for (const sg of [-1, 1]) {
      const lens = prismBox(0.085, 0.055, 0.012, { sides: 6, top: 1.15, bottom: 0.8 },
        { color: 0x6a7a88, emissive: 0x0c1014 });
      lens.position.x = sg * 0.052;
      avi.add(lens);
    }
    const bridge = boxMesh(0.03, 0.008, 0.01, { color: GOLD });
    bridge.position.y = 0.02;
    avi.add(bridge);
    avi.position.set(0, 0.315, headFront(0.255) + 0.016);
    avi.rotation.x = -0.35;
    parts.head.add(avi);

    /* ---- face: tan, delighted with himself, and the moustache ---- */
    const faceTex = faceTexture({
      skin: '#b78d6d',
      line: '#221814',
      iris: '#4a6a3a',
      brow: '#5e4028',
      browW: 3,
      mouth: '#4a2b2b',
      teeth: '#f4efe4',
      smirk: true,
      extra: (ctx, st) => {
        // the moustache: a thick bar with drooping ends, sitting on the lip
        ctx.fillStyle = '#6a4a2e';
        ctx.fillRect(14, 33, 20, 4);
        ctx.fillRect(12, 35, 4, 4);
        ctx.fillRect(32, 35, 4, 4);
        ctx.fillStyle = '#7e5a3a';
        ctx.fillRect(16, 33, 16, 1);
        // tanning-bed cheeks
        ctx.fillStyle = 'rgba(200,90,70,0.18)';
        ctx.fillRect(6, 28, 9, 5);
        ctx.fillRect(33, 28, 9, 5);
        // crow's feet from forty years of laughing at his own jokes
        if (st.expr === 'happy') {
          ctx.fillStyle = 'rgba(80,50,40,0.5)';
          ctx.fillRect(4, 22, 2, 1); ctx.fillRect(4, 25, 2, 1);
          ctx.fillRect(42, 22, 2, 1); ctx.fillRect(42, 25, 2, 1);
        }
      },
    });
    addFace(parts.head, faceTex, faceBox(d.head));

    /* ---- prop: his car keys, on a Camaro keyring he will tell you about ---- */
    const prop = new THREE.Object3D();
    prop.name = 'keys';
    const ring = prismBox(0.04, 0.008, 0.04, { sides: 6, top: 1 }, { color: 0xb8b8b0 });
    prop.add(ring);
    const fob = boxMesh(0.03, 0.05, 0.012, { color: 0xc03030 });
    fob.position.set(0, -0.035, 0);
    prop.add(fob);
    const key = boxMesh(0.012, 0.05, 0.004, { color: 0xc9b060 });
    key.position.set(0.02, -0.03, 0.006);
    key.rotation.z = 0.4;
    prop.add(key);
    prop.position.set(0, -0.155, 0.02);
    parts.handL.add(prop);

    return {
      faceTex,
      prop,
      emoteY: 2.0,
      style: { motion: 1.2, armSwing: 1.15, faceRate: 9 },
      poses: {
        /** Both hands, finger guns, a little bounce on every "pew". */
        fingerGuns(P, t, c) {
          api.POSES.idle(P, t, c);
          const pew = Math.pow(Math.max(0, Math.sin(t * 5.5)), 4);
          P.r('armL', FWD * (1.25 + 0.12 * pew), 0, -0.25);
          P.r('armR', FWD * (1.25 + 0.12 * pew), 0, 0.25);
          P.r('foreL', FWD * (0.25 - 0.3 * pew), 0, 0);
          P.r('foreR', FWD * (0.25 - 0.3 * pew), 0, 0);
          P.r('handL', FWD * -0.2, 0, 0);
          P.r('handR', FWD * -0.2, 0, 0);
          P.r('chest', -0.05, 0.12 * Math.sin(t * 2.75), 0);
          P.r('head', -0.08, 0.1 * Math.sin(t * 2.75), 0.08);
          P.p('hips', 0, 0.01 * pew, 0);
        },
        /** "HEY!" — thumb up, chin up, the full Fonz. */
        hey(P, t, c) {
          api.POSES.idle(P, t, c);
          const pop = 1 - Math.exp(-t * 12);
          P.r('armR', FWD * 0.9 * pop, 0, 0.35);
          P.r('foreR', FWD * 1.2 * pop, 0, 0);
          P.r('handR', 0, 0, -0.6 * pop);
          P.r('armL', FWD * 0.05, 0, -0.3);
          P.r('chest', -0.10 * pop, 0, 0);
          P.r('head', -0.18 * pop, 0.2 * pop, 0.12 * pop);
          P.r('spine', -0.05 * pop, 0, 0);
        },
      },
      // Hips forward, chest out, weight back: posing next to a car that is not there.
      bias: (P) => {
        P.r('spine', -0.06, 0, 0);
        P.r('chest', -0.05, 0, 0);
        P.r('head', -0.04, 0, 0);
        P.r('armL', 0, 0, -0.14);
        P.r('armR', 0, 0, 0.14);
      },
      animFace: {
        idle: 'happy', walk: 'happy', talk: 'happy+talk', point: 'happy+talk',
        fingerGuns: 'happy+open', hey: 'happy+open', shrug: 'happy', cheer: 'happy+open',
      },
    };
  }, { dims: DIMS });
}

register('gary', createGary);
