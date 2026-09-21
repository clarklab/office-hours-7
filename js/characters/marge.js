/**
 * MARGUERITE "MARGE" OKONKWO — finance.
 *
 * Silhouette hooks:
 *   1. RAMROD STRAIGHT — a vertical column where everyone else is a slouch. Her
 *      motion scale is a third of the cast's, so she is also the stillest;
 *   2. a tight bun sitting proud on the crown, with a pencil through it;
 *   3. enormous round glasses, modelled, that overhang the sides of her head;
 *   4. a grey skirt suit — a trapezoid, not two legs — and a red ledger binder
 *      clamped under her left arm.
 *
 * @module characters/marge
 */

import * as THREE from 'three';
import { PROFILES, register } from '/js/characters/index.js';
import {
  createRig, buildHuman, prismBox, boxMesh, cylMesh, wedgeMesh,
  attach, faceTexture, addFace, faceBox, headFront, SKINS,
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
const HAIR_LIT = 0x2e2626;
const LEDGER = 0x8c342d;
const FRAME = 0x27242a;

/**
 * Builds MARGE.
 * @returns {import('./rig.js').Actor}
 */
export function createMarge() {
  return createRig(PROFILES.marge, (parts, api) => {
    const d = api.dims;

    buildHuman(parts, d, {
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
      // the skirt swallows the pelvis; the square shoulders replace the round ones
      omit: ['pelvis', 'abdomen', 'shoulderL', 'shoulderR'],
    });

    /* ---- skirt suit: a trapezoid skirt, jacket hem, blouse V, lapels ---- */
    attach(parts.hips, prismBox(0.52, 0.40, 0.40, { bevel: 0.22, top: 0.62, bottom: 1.0 }, { color: SUIT_DARK }),
      0, -0.185, 0);
    attach(parts.spine, prismBox(0.34, 0.24, 0.26, { bevel: 0.26, top: 1.14, bottom: 0.96 }, { color: SUIT }), 0, 0.10, 0);
    attach(parts.chest, prismBox(0.14, 0.19, 0.04, { sides: 4, top: 1.5, bottom: 0.25 }, { color: BLOUSE }), 0, 0.10, 0.122);
    attach(parts.chest, prismBox(0.26, 0.09, 0.09, { sides: 6, top: 0.7 }, { color: SUIT_DARK }), 0, 0.225, 0.095);
    for (const sg of [-1, 1]) {
      attach(parts.chest, wedgeMesh(0.075, 0.17, 0.025, { color: SUIT_DARK }), sg * 0.06, 0.12, 0.128,
        [Math.PI, 0, sg * -0.3]);
    }
    // buttons, all done up
    for (const y of [0.02, -0.06]) {
      attach(parts.spine, boxMesh(0.022, 0.022, 0.01, { color: 0x2c2c32 }), 0, 0.10 + y, 0.142);
    }
    // square shoulders — finance does not have a soft line
    for (const side of ['L', 'R']) {
      const sg = side === 'L' ? -1 : 1;
      attach(parts[`shoulder${side}`], prismBox(0.15, 0.10, 0.22, { sides: 6, top: 0.96, bottom: 0.9 }, { color: SUIT }),
        sg * 0.015, 0.015, 0);
    }

    /* ---- the bun ---- */
    // scraped back hard: a vertical hairline just proud of the face
    const capD = 0.26;
    attach(parts.head, prismBox(0.27, 0.10, capD, { bevelF: 0.14, bevelB: 0.34, top: 0.84, anchorFront: true },
      { color: HAIR }), 0, 0.29, headFront(0.24) + 0.006 - capD / 2);
    attach(parts.head, prismBox(0.23, 0.25, 0.09, { sides: 6, top: 0.9 }, { color: HAIR }), 0, 0.165, -0.082);
    const bun = attach(parts.head, prismBox(0.15, 0.17, 0.15, {
      bevel: 0.3, rings: [[0, 0.7, 0.7], [0.45, 1.0, 1.0], [1, 0.62, 0.62]],
    }, { color: HAIR_LIT }), 0, 0.40, -0.03);
    bun.name = 'bun';
    // the pencil, and its eraser
    attach(parts.head, boxMesh(0.02, 0.26, 0.02, { color: 0xc9a640 }), 0.02, 0.41, -0.01, [0, 0, 1.05]);
    attach(parts.head, boxMesh(0.024, 0.03, 0.024, { color: 0xc47a80 }), -0.106, 0.482, -0.01, [0, 0, 1.05]);

    /* ---- ENORMOUS round glasses, in actual geometry ---- */
    // centred on the painted eyes (see faceBox)
    const face = faceBox(d.head, 1.0, -0.004);
    const gy = face.y - 0.004;
    for (const x of [-0.064, 0.064]) {
      const rim = cylMesh(0.068, 0.068, 0.018, 8, { color: FRAME });
      rim.rotation.x = Math.PI / 2;
      rim.position.set(x, gy, 0.128);
      parts.head.add(rim);
      // the lens only ever shows its face, so it is a flat octagon
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.057, 8),
        api.mat({ color: 0x9db0be, transparent: true, opacity: 0.45 }));
      lens.position.set(x, gy, 0.1375);
      parts.head.add(lens);
    }
    attach(parts.head, boxMesh(0.045, 0.012, 0.016, { color: FRAME }), 0, gy + 0.008, 0.132);
    attach(parts.head, boxMesh(0.02, 0.012, 0.10, { color: FRAME }), -0.13, gy, 0.08);
    attach(parts.head, boxMesh(0.02, 0.012, 0.10, { color: FRAME }), 0.13, gy, 0.08);

    /* ---- face: severe, and mostly lens ---- */
    const faceTex = faceTexture({
      skin: '#6f4d38',
      shade: '#563b2b',
      line: '#150f0f',
      iris: '#2a1812',
      brow: '#1c1414',
      browW: 2,
      mouth: '#43231f',
      lip: '#7a4038',
      browTilt: 1,
      eyeScale: 1.1,
      lashes: true,
      extra: (ctx, st) => {
        // the pursed line: her neutral is a verdict
        if (!st.open && (st.expr === 'neutral' || st.expr === 'squint')) {
          ctx.fillStyle = '#43231f';
          ctx.fillRect(16, 39, 16, 1);
        }
        // reading-glasses crease on the bridge of the nose
        ctx.fillStyle = 'rgba(40,24,18,0.35)';
        ctx.fillRect(22, 22, 4, 1);
      },
    });
    addFace(parts.head, faceTex, face);

    /* ---- prop: the red ledger, clamped under the left arm ---- */
    const prop = new THREE.Object3D();
    prop.name = 'ledger';
    const cover = prismBox(0.075, 0.30, 0.24, { sides: 4, top: 1, bottom: 1 }, { color: LEDGER });
    prop.add(cover);
    const spine = prismBox(0.08, 0.30, 0.03, { sides: 6, top: 1, bottom: 1 }, { color: 0x6e2822 });
    spine.position.z = -0.12;
    prop.add(spine);
    const pages = boxMesh(0.045, 0.27, 0.215, { color: 0xd9d2c0 });
    pages.position.set(0.018, 0, 0.005);
    prop.add(pages);
    const band = boxMesh(0.08, 0.035, 0.245, { color: 0x3a2320 });
    band.position.y = 0.09;
    prop.add(band);
    const tab = boxMesh(0.01, 0.03, 0.03, { color: 0xe8b84a });
    tab.position.set(0.02, -0.06, 0.125);
    prop.add(tab);
    prop.position.set(-0.285, -0.055, 0.03);
    prop.rotation.set(0.06, 0, 0.05);
    parts.chest.add(prop);

    /**
     * The ledger never leaves her left arm, whatever the right one is up to.
     * @param {import('./rig.js').PoseWriter} P
     */
    const clamp = (P) => {
      P.r('armL', 0.04, 0, -0.03);
      P.r('foreL', 0.02, 0, 0);
      P.r('handL', 0, 0, 0);
      P.p('shoulderL', 0, 0, 0);
    };

    return {
      faceTex,
      prop,
      poses: {
        /** @type {import('./rig.js').Pose} */
        cheer: (P, t, c) => { api.POSES.cheer(P, t, c); clamp(P); },
        /** @type {import('./rig.js').Pose} */
        panic: (P, t, c) => { api.POSES.panic(P, t, c); clamp(P); },
        /** @type {import('./rig.js').Pose} */
        shrug: (P, t, c) => { api.POSES.shrug(P, t, c); clamp(P); },
      },
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
      // a cheer from Marge is a closed-mouth smile, and that is plenty
      animFace: { idle: 'neutral', talk: 'neutral+talk', point: 'squint', shrug: 'squint', cheer: 'happy' },
    };
  }, { dims: DIMS });
}

register('marge', createMarge);
