/**
 * DEZ VALENTI — Head of Sales.
 *
 * Silhouette hooks:
 *   1. SHOULDER PADS that arrive in the room before he does — the shoulder line
 *      is nearly a metre wide on a 1.78m man, and the pads are parented to the
 *      shoulder joints so they swing with the arms;
 *   2. a slicked ponytail jutting off the back of the skull;
 *   3. black wayfarers — a real open frame with tinted lenses, and they slide
 *      down his nose when he is shocked, which is the only time anyone sees his
 *      eyes clearly — and a watch you could read from the parking lot.
 *
 * @module characters/dez
 */

import * as THREE from 'three';
import { PROFILES, register } from '/js/characters/index.js';
import {
  createRig, buildHuman, prismBox, boxMesh, cylMesh, wedgeMesh,
  attach, faceTexture, addFace, faceBox, headFront, SKINS,
} from '/js/characters/rig.js';
import { makeTexture, ps1Material } from '/js/core/ps1.js';

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
const TIE = 0x2a1c26;
const HAIR = 0x2b2226;
const SHADES = 0x17141a;

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
 * Wayfarers: the heavy-browed, trapezoid-lensed frame, extruded from one flat
 * outline with the two lens holes cut out of it, plus smoked lenses and arms.
 * Local origin is the midpoint between the lenses; +Z faces out.
 * @returns {THREE.Object3D}
 */
function wayfarers() {
  const g = new THREE.Object3D();
  g.name = 'shades';
  const V = (x, y) => new THREE.Vector2(x, y);
  // right half of the outline, mirrored: a thick flat brow, flared outer
  // corners, lenses that taper toward the cheek, a keyhole bridge
  const half = [[0.128, 0.040], [0.126, 0.018], [0.112, -0.020], [0.094, -0.033], [0.036, -0.030], [0.018, -0.010]];
  const outline = [...half.map(([x, y]) => V(x, y)), ...half.slice().reverse().map(([x, y]) => V(-x, y))];
  const shape = new THREE.Shape(outline.reverse());
  const lens = [[0.024, 0.021], [0.103, 0.021], [0.098, -0.012], [0.086, -0.023], [0.040, -0.021], [0.026, -0.006]];
  const holes = [1, -1].map((sg) => lens.map(([x, y]) => V(sg * x, y)));
  for (const h of holes) shape.holes.push(new THREE.Path(h));
  const frameGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: false });
  const frame = new THREE.Mesh(frameGeo, ps1Material({ color: SHADES }));
  g.add(frame);
  for (const h of holes) {
    const glass = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(h)),
      ps1Material({ color: 0x241c2c, transparent: true, opacity: 0.62, emissive: 0x06040a }));
    glass.position.z = 0.005;
    g.add(glass);
  }
  // a glint on the left lens
  const glint = new THREE.Mesh(new THREE.PlaneGeometry(0.018, 0.006),
    ps1Material({ color: 0xb9c6d8, unlit: 1 }));
  glint.position.set(-0.05, 0.012, 0.0065);
  glint.rotation.z = 0.5;
  g.add(glint);
  for (const sg of [-1, 1]) {
    const arm = boxMesh(0.012, 0.016, 0.15, { color: SHADES });
    arm.position.set(sg * 0.132, 0.03, -0.068);
    g.add(arm);
  }
  return g;
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
      // the pads ARE his shoulders
      omit: ['shoulderL', 'shoulderR', 'neck'],
    });
    // put the pinstripe on every suit panel
    for (const key of ['chest', 'abdomen', 'pelvis', 'armL', 'armR', 'foreL', 'foreR', 'thighL', 'thighR', 'shinL', 'shinR']) {
      if (body[key]) body[key].material = api.mat(suitMat);
    }

    /* ---- the pads: one swollen faceted slab each, flaring out past the arm ---- */
    for (const side of ['L', 'R']) {
      const sg = side === 'L' ? -1 : 1;
      attach(parts[`shoulder${side}`], prismBox(0.32, 0.20, 0.40, {
        bevelF: 0.30, bevelB: 0.30, shearX: sg * 0.05,
        rings: [[0, 0.66, 0.82], [0.62, 1.0, 1.0], [1, 0.84, 0.86]],
      }, suitMat), sg * 0.105, 0.045, 0);
    }
    // shirt V, tie, lapel roll, and the two notched lapels
    attach(parts.chest, prismBox(0.17, 0.22, 0.05, { sides: 4, top: 1.5, bottom: 0.2 }, { color: SHIRT }), 0, 0.12, 0.135);
    attach(parts.chest, prismBox(0.06, 0.21, 0.03, { sides: 4, top: 0.8, bottom: 1.3 }, { color: TIE }), 0, 0.08, 0.158);
    attach(parts.chest, prismBox(0.30, 0.10, 0.10, { sides: 6, top: 0.6 }, { color: SUIT_DARK }), 0, 0.245, 0.10);
    for (const sg of [-1, 1]) {
      attach(parts.chest, wedgeMesh(0.09, 0.20, 0.03, { color: SUIT_DARK }), sg * 0.075, 0.13, 0.145,
        [Math.PI, 0, sg * -0.35]);
    }

    /* ---- slicked hair + ponytail ---- */
    // vertical front at a high, slicked hairline, just proud of the face
    const capD = 0.27;
    attach(parts.head, prismBox(0.285, 0.12, capD, {
      bevelF: 0.12, bevelB: 0.34, top: 0.86, topZ: 0.9, anchorFront: true,
    }, { color: HAIR }), 0, 0.30, headFront(0.25) + 0.006 - capD / 2);
    attach(parts.head, prismBox(0.25, 0.24, 0.075, { sides: 6, top: 0.9 }, { color: HAIR }), 0, 0.18, -0.10);
    const tail = attach(parts.head, wedgeMesh(0.09, 0.28, 0.09, { color: HAIR }), 0, 0.165, -0.165,
      [2.5, 0, 0]);
    tail.name = 'ponytail';
    attach(parts.head, boxMesh(0.06, 0.045, 0.06, { color: 0x8c2f55 }), 0, 0.235, -0.138, [1.2, 0, 0]);

    /* ---- face: permanent grin; the eyes are for emergencies only ---- */
    const faceTex = faceTexture({
      skin: '#b78d6d',
      line: '#1d1a1e',
      iris: '#4a3222',
      brow: '#231c20',
      browW: 3,
      mouth: '#4a2b2b',
      smirk: true,
      extra: (ctx, st) => {
        // the five o'clock shadow of a man who flies red-eyes for fun
        ctx.fillStyle = 'rgba(40,30,34,0.20)';
        ctx.fillRect(9, 34, 30, 12);
        // teeth: he is always showing them
        if (!st.open && st.expr !== 'shocked') {
          ctx.fillStyle = '#ece6da';
          ctx.fillRect(20, 38, 8, 2);
        }
      },
    });
    const face = faceBox(d.head);
    addFace(parts.head, faceTex, face);

    /* ---- wayfarers: a real open frame, two tinted lenses, two arms ---- */
    const shades = wayfarers();
    // the painted eyes sit half a pixel under the quad's centre
    const restY = face.y - face.h / 96;
    const restZ = headFront(0.25) + 0.004;
    shades.position.set(0, restY, restZ);
    parts.head.add(shades);
    let drop = 0;

    /* ---- watch, and the brick phone he is always mid-call on ---- */
    attach(parts.handL, boxMesh(0.10, 0.055, 0.115, { color: 0xb2984c }), -0.005, 0.02, 0.005);
    attach(parts.handL, boxMesh(0.065, 0.02, 0.075, { color: 0xd8cfae }), -0.005, 0.05, 0.02);

    const prop = new THREE.Object3D();
    prop.name = 'phone';
    const shell = prismBox(0.07, 0.20, 0.045, { sides: 4, top: 0.9 }, { color: 0x2a2a30 });
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
      animFace: { idle: 'happy', walk: 'happy', point: 'happy+talk', shrug: 'happy+talk', slump: 'shocked' },
      // the shades slide down the nose when he is rattled
      onUpdate: (dt, t, actor) => {
        const want = actor.faceState().expr === 'shocked' ? 1 : 0;
        drop += (want - drop) * Math.min(1, dt * 14);
        shades.position.y = restY - drop * 0.030;
        shades.position.z = restZ + drop * 0.010;
        shades.rotation.x = drop * 0.14;
      },
    };
  }, { dims: DIMS });
}

register('dez', createDez);
