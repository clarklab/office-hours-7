/**
 * OFFICE HOURS — the character rig.
 *
 * Every member of the cast is built the same way the FF7 field models were:
 * a tree of bare `Object3D` joints, with chunky untextured boxes hung off each
 * one. Joints never deform their meshes — they rotate, the seam opens, and the
 * gap is part of the look (see `/docs/ref/03-field-models.webp`).
 *
 * The rules this module enforces for the whole cast:
 *
 *   - hands are MITTENS — a faceted block and a thumb, never fingers;
 *   - limbs and torsos are chamfered prisms ({@link prismBox}) with a visible
 *     seam at every joint: still hard-edged, just no longer bricks;
 *   - hair is a handful of big faceted wedges;
 *   - faces are FLAT PAINTED TEXTURES on a front-flat head prism — a 4x4 atlas
 *     of 48px cells: four expressions (neutral / happy / shocked / squint), each
 *     with the mouth closed, open and mid-blink, swapped by moving `map.offset`;
 *   - heads are roughly 1/5.5 of total height, torsos are slabs, shoulders are
 *     wide relative to hips;
 *   - everything is animated procedurally from sin/cos on joint rotations, with
 *     a 0.15s crossfade between poses. There is no keyframe data anywhere.
 *
 * @module characters/rig
 */

import * as THREE from 'three';
import { ps1Material, makeTexture } from '/js/core/ps1.js';

/* ------------------------------------------------------------------------- *
 * Constants
 * ------------------------------------------------------------------------- */

/**
 * Desaturated, slightly muddy PS1 skin tones. Nothing in the cast uses a
 * saturated colour — the saturated accents live in the UI.
 * @type {Object<string, number>}
 */
export const SKINS = {
  porcelain: 0xd9bda6,
  fair: 0xc9a689,
  tan: 0xb78d6d,
  olive: 0x9c8058,
  warm: 0x8f6a4c,
  deep: 0x6f4d38,
};

/**
 * Default human proportions in metres. Summed head-to-toe this is 1.75m, and
 * the head box is 0.31m — a hair under 1/5.5 of total height, as mandated.
 * @type {Object<string, number>}
 */
export const HUMAN_DIMS = {
  foot: 0.06,
  shin: 0.38,
  thigh: 0.40,
  pelvis: 0.09,
  spine: 0.22,
  chest: 0.24,
  neck: 0.05,
  head: 0.31,
  shoulderX: 0.235,
  shoulderY: 0.20,
  upperArm: 0.30,
  foreArm: 0.26,
  hand: 0.14,
  hipX: 0.115,
};

/** Crossfade between two poses, in seconds. @type {number} */
const FADE = 0.15;

/**
 * Sign convention: a limb hangs down (-Y), so rotating it about +X by a
 * NEGATIVE angle swings its tip toward +Z, which is the direction the rig
 * faces. Every "forward" in the pose library is multiplied by this.
 * @type {number}
 */
const FWD = -1;

/** The four expressions every face atlas carries, in column order. @type {string[]} */
export const FACE_EXPRESSIONS = ['neutral', 'happy', 'shocked', 'squint'];

/** Pixels per face cell: the old 32px face, times 1.5. @type {number} */
export const FACE_CELL = 48;

/** Cells per side of the atlas (4x4: rows are closed / open / blink / spare). */
const FACE_GRID = 4;

/**
 * The old frame vocabulary, still accepted by `setFace`: each name is an
 * expression plus a mouth state. @type {Object<string, [string, boolean|null]>}
 */
export const FACE_FRAMES = {
  neutral: ['neutral', null],
  talk: [null, true],
  shocked: ['shocked', null],
  squint: ['squint', null],
  happy: ['happy', null],
};

/**
 * Default face per animation: an expression, optionally `+talk` (the mouth
 * flaps like speech) or `+open` (held open — a scream, a cheer).
 * @type {Object<string, string>}
 */
const ANIM_FACE = {
  idle: 'neutral',
  walk: 'neutral',
  talk: 'neutral+talk',
  panic: 'shocked+open',
  point: 'neutral',
  type: 'squint',
  shrug: 'neutral',
  cheer: 'happy+open',
  slump: 'squint',
  sit: 'neutral',
  run: 'shocked',
  bark: 'happy+talk',
  shake: 'squint',
  sniff: 'squint',
  zoomies: 'happy+open',
  hop: 'shocked+open',
  bite: 'squint',
};

/** Emote aliases so `'?'` and `'!'` and `'$'` work too. @type {Object<string,string>} */
const EMOTE_ALIAS = {
  '?': 'question',
  '!': 'exclaim',
  $: 'money',
  sweatdrop: 'sweat',
  angry: 'anger',
  love: 'heart',
  sleep: 'zzz',
};

/* scratch — reused every frame, allocates nothing */
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();

/* ------------------------------------------------------------------------- *
 * Geometry helpers
 * ------------------------------------------------------------------------- */

/**
 * A plain box with a PS1 material. 12 triangles unless you ask for segments.
 * @param {number} w width (x)
 * @param {number} h height (y)
 * @param {number} d depth (z)
 * @param {Object} [matOpts] forwarded to {@link ps1Material}
 * @param {number|{x?:number,y?:number,z?:number}} [segs] subdivision, for vertex lighting
 * @returns {THREE.Mesh}
 */
export function boxMesh(w, h, d, matOpts = {}, segs) {
  const s = typeof segs === 'number' ? { x: segs, y: segs, z: segs } : (segs || {});
  const geo = new THREE.BoxGeometry(w, h, d, s.x || 1, s.y || 1, s.z || 1);
  const mesh = new THREE.Mesh(geo, ps1Material(matOpts));
  mesh.matrixAutoUpdate = true;
  return mesh;
}

/**
 * A tapered box — the shape every limb, torso and head in the show is made of.
 * The box is built at `w x h x d` and then its top ring of vertices is scaled,
 * so the taper costs nothing extra: still 12 triangles.
 *
 * @param {number} w width at the bottom
 * @param {number} h height
 * @param {number} d depth at the bottom
 * @param {Object} [o]
 * @param {number} [o.top=0.8] x-scale of the top face
 * @param {number} [o.topZ] z-scale of the top face (defaults to `o.top`)
 * @param {number} [o.bottom=1] x-scale of the bottom face
 * @param {number} [o.bottomZ] z-scale of the bottom face (defaults to `o.bottom`)
 * @param {number} [o.shearZ=0] metres the top face is pushed toward +Z
 * @param {number} [o.shearX=0] metres the top face is pushed toward +X
 * @param {Object} [matOpts] forwarded to {@link ps1Material}
 * @returns {THREE.Mesh}
 */
export function taperedBox(w, h, d, o = {}, matOpts = {}) {
  const top = o.top === undefined ? 0.8 : o.top;
  const topZ = o.topZ === undefined ? top : o.topZ;
  const bottom = o.bottom === undefined ? 1 : o.bottom;
  const bottomZ = o.bottomZ === undefined ? bottom : o.bottomZ;
  const shearZ = o.shearZ || 0;
  const shearX = o.shearX || 0;

  const geo = new THREE.BoxGeometry(w, h, d, 1, 1, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const u = (y / h) + 0.5; // 0 at the bottom, 1 at the top
    const sx = bottom + (top - bottom) * u;
    const sz = bottomZ + (topZ - bottomZ) * u;
    pos.setX(i, pos.getX(i) * sx + shearX * u);
    pos.setZ(i, pos.getZ(i) * sz + shearZ * u);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, ps1Material(matOpts));
}

/**
 * A faceted prism — the upgraded unit of the cast. It is a tapered box whose
 * vertical edges are chamfered (8 sides), or a hexagon pointed at the sides
 * (6), or a plain box (4), optionally stacked from several rings so a head
 * can narrow to a jaw and a crown, or a chest can swell and slope into the
 * shoulders. Still hard-edged, still cheap: `4n - 4` triangles per segment
 * pair, so an octagon is 28 and a two-segment octagon 44.
 *
 * @param {number} w width (x) at scale 1
 * @param {number} h height (y)
 * @param {number} d depth (z) at scale 1
 * @param {Object} [o]
 * @param {4|6|8} [o.sides=8]
 * @param {number} [o.bevel=0.22] chamfer on every vertical edge, as a fraction of min(w, d) (8 sides only)
 * @param {number} [o.bevelF] front (+Z) edges, overrides `bevel`
 * @param {number} [o.bevelB] back (-Z) edges, overrides `bevel`
 * @param {Array<number[]>} [o.rings] `[u, sx, sz]` bottom (u=0) to top (u=1); default from top/bottom
 * @param {number} [o.top=0.8] @param {number} [o.topZ] @param {number} [o.bottom=1] @param {number} [o.bottomZ]
 * @param {number} [o.shearZ=0] @param {number} [o.shearX=0]
 * @param {boolean} [o.anchorFront=false] scale z toward the front plane, so it stays flat for a painted face
 * @param {boolean} [o.smooth=false] rounded side normals instead of flat facets
 * @param {Object} [matOpts] forwarded to {@link ps1Material}
 * @returns {THREE.Mesh}
 */
export function prismBox(w, h, d, o = {}, matOpts = {}) {
  const sides = o.sides || 8;
  const hw = w / 2;
  const hd = d / 2;
  const m = Math.min(w, d);
  const bev = o.bevel === undefined ? 0.22 : o.bevel;
  const cF = Math.min(m * (o.bevelF === undefined ? bev : o.bevelF), m * 0.49);
  const cB = Math.min(m * (o.bevelB === undefined ? bev : o.bevelB), m * 0.49);

  // Footprint, wound so every side quad faces outward (see the cross product
  // in the side loop: edge x up must point away from the centre).
  /** @type {number[][]} */
  let pts;
  if (sides === 4) {
    pts = [[hw, -hd], [-hw, -hd], [-hw, hd], [hw, hd]];
  } else if (sides === 6) {
    pts = [[hw * 0.5, -hd], [-hw * 0.5, -hd], [-hw, 0], [-hw * 0.5, hd], [hw * 0.5, hd], [hw, 0]];
  } else {
    pts = [
      [hw - cB, -hd], [-hw + cB, -hd],
      [-hw, -hd + cB], [-hw, hd - cF],
      [-hw + cF, hd], [hw - cF, hd],
      [hw, hd - cF], [hw, -hd + cB],
    ];
    pts = pts.filter((p, i) => {
      const q = pts[(i + 1) % pts.length];
      return Math.abs(p[0] - q[0]) > 1e-6 || Math.abs(p[1] - q[1]) > 1e-6;
    });
  }
  const n = pts.length;

  const top = o.top === undefined ? 0.8 : o.top;
  const topZ = o.topZ === undefined ? top : o.topZ;
  const bottom = o.bottom === undefined ? 1 : o.bottom;
  const bottomZ = o.bottomZ === undefined ? bottom : o.bottomZ;
  const rings = o.rings || [[0, bottom, bottomZ], [1, top, topZ]];
  const shearZ = o.shearZ || 0;
  const shearX = o.shearX || 0;

  /** ring r, point i -> [x, y, z] */
  const at = (r, i) => {
    const [u, sx, sz] = rings[r];
    const [px, pz] = pts[i];
    const z = o.anchorFront ? hd - (hd - pz) * sz : pz * sz;
    return [px * sx + shearX * u, -h / 2 + u * h, z + shearZ * u];
  };

  // perimeter, for side UVs
  const edge = [];
  let per = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    edge.push(per);
    per += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  edge.push(per);

  const P = [];
  const N = [];
  const U = [];
  const smoothN = (i) => {
    const [px, pz] = pts[i];
    const l = Math.hypot(px / hw, pz / hd) || 1;
    return [px / hw / l, 0, pz / hd / l];
  };
  const tri = (a, b, c, ua, ub, uc, na, nb, nc) => {
    P.push(...a, ...b, ...c);
    U.push(...ua, ...ub, ...uc);
    N.push(...(na || [0, 0, 0]), ...(nb || [0, 0, 0]), ...(nc || [0, 0, 0]));
  };

  for (let r = 0; r + 1 < rings.length; r++) {
    const v0 = rings[r][0];
    const v1 = rings[r + 1][0];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a0 = at(r, i); const b0 = at(r, j); const a1 = at(r + 1, i); const b1 = at(r + 1, j);
      const ua = edge[i] / per; const ub = edge[i + 1] / per;
      const ns = o.smooth ? [smoothN(i), smoothN(j)] : null;
      tri(a0, b0, b1, [ua, v0], [ub, v0], [ub, v1], ns && ns[0], ns && ns[1], ns && ns[1]);
      tri(a0, b1, a1, [ua, v0], [ub, v1], [ua, v1], ns && ns[0], ns && ns[1], ns && ns[0]);
    }
  }
  const last = rings.length - 1;
  const capUV = (p) => [p[0] / w + 0.5, p[2] / d + 0.5];
  for (let i = 1; i + 1 < n; i++) {
    const t0 = at(last, 0); const t1 = at(last, i); const t2 = at(last, i + 1);
    tri(t0, t1, t2, capUV(t0), capUV(t1), capUV(t2), [0, 1, 0], [0, 1, 0], [0, 1, 0]);
    const b0 = at(0, 0); const b1 = at(0, i + 1); const b2 = at(0, i);
    tri(b0, b1, b2, capUV(b0), capUV(b1), capUV(b2), [0, -1, 0], [0, -1, 0], [0, -1, 0]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  if (!o.smooth) {
    geo.computeVertexNormals();
  } else {
    // smooth sides already carry radial normals; tilt them by the taper so a
    // narrowing limb still catches the key light on its upper face
    const tmp = geo.clone();
    tmp.computeVertexNormals();
    const fn = tmp.attributes.normal;
    const nn = geo.attributes.normal;
    for (let i = 0; i < nn.count; i++) {
      if (Math.abs(nn.getY(i)) > 0.99) continue;
      const x = nn.getX(i); const z = nn.getZ(i);
      const y = fn.getY(i);
      const l = Math.hypot(x, y, z) || 1;
      nn.setXYZ(i, x / l, y / l, z / l);
    }
    tmp.dispose();
  }
  const mesh = new THREE.Mesh(geo, ps1Material(matOpts));
  mesh.userData.prism = { w, h, d, rings, cF, anchorFront: !!o.anchorFront };
  return mesh;
}

/**
 * A low-segment cylinder. Keep `seg` at 5-8: this is a PlayStation.
 * @param {number} rt top radius
 * @param {number} rb bottom radius
 * @param {number} h height
 * @param {number} [seg=6] radial segments
 * @param {Object} [matOpts] forwarded to {@link ps1Material}
 * @returns {THREE.Mesh}
 */
export function cylMesh(rt, rb, h, seg = 6, matOpts = {}) {
  const geo = new THREE.CylinderGeometry(rt, rb, h, Math.max(3, seg | 0), 1, false);
  return new THREE.Mesh(geo, ps1Material(matOpts));
}

/**
 * A faceted wedge — a four-sided pyramid, apex at +Y. This is the unit of hair
 * in this show: a spike, a ponytail, a fringe chunk, a dog ear.
 * @param {number} w base width
 * @param {number} h height to the apex
 * @param {number} d base depth
 * @param {Object} [matOpts] forwarded to {@link ps1Material}
 * @returns {THREE.Mesh}
 */
export function wedgeMesh(w, h, d, matOpts = {}) {
  // A true pyramid: 4 faces and a 2-triangle base. (A 4-segment cone is the
  // same shape but spends half its triangles on degenerate slivers at the tip.)
  const x = w / 2; const z = d / 2; const y0 = -h / 2; const y1 = h / 2;
  const A = [0, y1, 0];
  const b = [[-x, y0, -z], [x, y0, -z], [x, y0, z], [-x, y0, z]];
  const P = [];
  const U = [];
  for (let i = 0; i < 4; i++) {
    const p = b[i]; const q = b[(i + 1) % 4];
    P.push(...q, ...p, ...A);
    U.push(1, 0, 0, 0, 0.5, 1);
  }
  P.push(...b[0], ...b[1], ...b[2], ...b[0], ...b[2], ...b[3]);
  U.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, ps1Material(matOpts));
}

/**
 * Positions a mesh and parents it to a joint. Meshes are ALWAYS children of a
 * joint and offset so the joint itself is the pivot.
 * @param {THREE.Object3D} joint
 * @param {THREE.Mesh} mesh
 * @param {number} [x=0] @param {number} [y=0] @param {number} [z=0]
 * @param {number[]} [rot] euler xyz in radians
 * @returns {THREE.Mesh} the mesh, for chaining
 */
export function attach(joint, mesh, x = 0, y = 0, z = 0, rot) {
  mesh.position.set(x, y, z);
  if (rot) mesh.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
  joint.add(mesh);
  return mesh;
}

/* ------------------------------------------------------------------------- *
 * Faces
 * ------------------------------------------------------------------------- */

/**
 * Rounds a rect the PS1 way: there are no curves, we just clip the corners.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x @param {number} y @param {number} w @param {number} h
 */
function blob(ctx, x, y, w, h) {
  ctx.fillRect(x, y + 1, w, h - 2);
  ctx.fillRect(x + 1, y, w - 2, h);
}

/**
 * A pixel-stepped stroke from `x0` to `x1`, one column at a time, whose top
 * edge follows `yAt(t)` for t in 0..1. Brows, lids and smiles are all this.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x0 @param {number} x1 @param {(t:number)=>number} yAt @param {number} th
 */
function stroke(ctx, x0, x1, yAt, th) {
  const n = Math.max(1, x1 - x0);
  for (let x = x0; x < x1; x++) ctx.fillRect(x, Math.round(yAt((x - x0) / (n - 1 || 1))), 1, th);
}

/**
 * Brow shape per expression: `[base, inner, outer, arch]` in pixels, +y down.
 * @type {Object<string, number[]>}
 */
const BROWS = {
  neutral: [0, 0, 0, 1],
  happy: [-1, -1, 0, 2],
  shocked: [-4, -1, 0, 2],
  squint: [1, 3, -1, 0],
};

/**
 * Paints one 48x48 face cell in cell-local pixels. The layout is the old 32px
 * face scaled by 1.5, with the extra pixels spent on form: a two-step side
 * shade, a lit nose ridge, irises with pupils and a catch-light, lids, lips and
 * teeth. Four expressions, each with the mouth shut, open and mid-blink.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{expr:string, open:boolean, blink:boolean}} st
 * @param {Object} o resolved options from {@link faceTexture}
 */
function drawFaceCell(ctx, st, o) {
  const S = FACE_CELL;
  const { expr, open, blink } = st;
  const eyeY = 20 + o.eyeY;
  const my = 38 + o.mouthY;

  // skin, a two-step shade down each side, a jaw shadow
  ctx.fillStyle = o.skin;
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = o.shade;
  ctx.fillRect(0, 0, 5, S);
  ctx.fillRect(S - 5, 0, 5, S);
  ctx.fillStyle = o.shadeMid;
  ctx.fillRect(5, 0, 2, S);
  ctx.fillRect(S - 7, 0, 2, S);
  ctx.fillRect(9, S - 3, S - 18, 3);
  ctx.fillStyle = o.lit;
  ctx.fillRect(12, 2, S - 24, 5);

  if (expr === 'happy' || o.blush) {
    ctx.fillStyle = o.blushColor;
    ctx.fillRect(7, 31, 8, 4);
    ctx.fillRect(S - 15, 31, 8, 4);
  }

  // nose: a shaded plane, a lit ridge, a nostril line
  ctx.fillStyle = o.nose;
  ctx.beginPath();
  ctx.moveTo(24, 24);
  ctx.lineTo(28 + o.noseW, 33);
  ctx.lineTo(20 - o.noseW, 33);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = o.lit;
  ctx.fillRect(22, 26, 1, 5);
  ctx.fillStyle = o.nostril;
  ctx.fillRect(21 - o.noseW, 33, 6 + o.noseW * 2, 1);

  // brows
  const [base, inner, outer, arch] = BROWS[expr] || BROWS.neutral;
  const by = eyeY - 7 + base;
  ctx.fillStyle = o.brow;
  for (const side of [-1, 1]) {
    const raise = side * o.browTilt * 1.5;
    const x0 = side < 0 ? 7 : 29;
    // t runs outer -> inner on the left, inner -> outer on the right
    stroke(ctx, x0, x0 + 12, (t) => {
      const u = side < 0 ? t : 1 - t; // 0 at the outer end, 1 at the inner end
      return by + raise + outer * (1 - u) + inner * u - arch * Math.sin(Math.PI * u * 0.9 + 0.1);
    }, o.browW);
  }

  // eyes
  const ew = Math.round(12 * o.eyeScale);
  const eh = Math.round(9 * o.eyeScale);
  for (const side of [-1, 1]) {
    const ecx = side < 0 ? 13 : 35;
    const ex = Math.round(ecx - ew / 2);
    const outerX = side < 0 ? ex - 2 : ex + ew + 1;
    if (blink) {
      ctx.fillStyle = o.line;
      const up = expr === 'happy';
      stroke(ctx, ex, ex + ew, (t) => eyeY + 5 + (up ? -1 : 1) * Math.round(Math.sin(Math.PI * t) * 1.6), 2);
      ctx.fillRect(outerX, eyeY + 5, 1, 1);
      continue;
    }
    if (expr === 'squint') {
      ctx.fillStyle = o.line;
      ctx.fillRect(ex - 1, eyeY + 3, ew + 2, 2);
      ctx.fillStyle = o.sclera;
      ctx.fillRect(ex + 1, eyeY + 5, ew - 2, 2);
      ctx.fillStyle = o.iris;
      ctx.fillRect(ecx - 2 + o.gaze, eyeY + 5, 4, 2);
      ctx.fillStyle = o.shadeMid;
      ctx.fillRect(ex, eyeY + 7, ew, 1);
      continue;
    }
    const big = expr === 'shocked';
    const w = big ? ew + 2 : ew;
    const h = big ? eh + 3 : eh;
    const x = big ? ex - 1 : ex;
    const y = big ? eyeY - 2 : eyeY;
    ctx.fillStyle = o.sclera;
    blob(ctx, x, y, w, h);
    const iw = big ? 4 : Math.round(w * 0.5);
    const ih = big ? 5 : h - 1;
    const ix = Math.round(ecx - iw / 2) + o.gaze;
    const iy = big ? y + Math.round((h - ih) / 2) : y + 1;
    ctx.fillStyle = o.iris;
    ctx.fillRect(ix, iy, iw, ih);
    ctx.fillStyle = o.pupil;
    ctx.fillRect(ix + Math.round(iw / 2) - 1, iy + Math.round(ih / 2) - 1, 2, big ? 2 : 3);
    ctx.fillStyle = o.glint;
    ctx.fillRect(ix + 1, iy + 1, big ? 1 : 2, big ? 1 : 2);
    // lids: the upper one is the line that makes it an eye at 384x216
    ctx.fillStyle = o.line;
    ctx.fillRect(x - 1, y - 1, w + 2, big ? 1 : 2);
    ctx.fillRect(outerX + (big ? side : 0), y, 1, o.lashes ? 2 : 1);
    if (o.lashes) ctx.fillRect(outerX + side, y - 1, 1, 1);
    if (expr === 'happy') {
      // cheeks push the lower lid up into an arc
      ctx.fillStyle = o.skin;
      ctx.fillRect(x, y + h - 3, w, 3);
      ctx.fillRect(x + 2, y + h - 4, w - 4, 1);
      ctx.fillStyle = o.shadeMid;
      ctx.fillRect(x + 1, y + h - 3, 2, 1);
      ctx.fillRect(x + w - 3, y + h - 3, 2, 1);
      ctx.fillRect(x + 3, y + h - 4, w - 6, 1);
    } else {
      ctx.fillStyle = o.shadeMid;
      ctx.fillRect(x + 1, y + h, w - 2, 1);
    }
  }

  // mouth
  const cx = 24 + o.mouthX;
  if (!open) {
    if (expr === 'happy') {
      ctx.fillStyle = o.mouth;
      ctx.fillRect(cx - 4, my + 1, 8, 2);
      ctx.fillRect(cx - 7, my - 1, 2, 2);
      ctx.fillRect(cx - 5, my, 2, 2);
      ctx.fillRect(cx + 3, my, 2, 2);
      ctx.fillRect(cx + 5, my - 1, 2, 2);
      ctx.fillStyle = o.lip;
      ctx.fillRect(cx - 3, my + 3, 6, 1);
    } else if (expr === 'shocked') {
      ctx.fillStyle = o.mouth;
      blob(ctx, cx - 3, my - 1, 6, 5);
      ctx.fillStyle = o.lip;
      ctx.fillRect(cx - 2, my + 4, 4, 1);
    } else {
      ctx.fillStyle = o.mouth;
      ctx.fillRect(cx - 5, my, 10, 2);
      if (expr === 'squint') ctx.fillRect(cx - 7, my + 1, 2, 2);
      else if (o.smirk) ctx.fillRect(cx + 5, my - 1, 2, 2);
      ctx.fillStyle = o.lip;
      ctx.fillRect(cx - 4, my + 2, 8, 1);
    }
  } else if (expr === 'happy') {
    ctx.fillStyle = o.mouth;
    ctx.fillRect(cx - 8, my - 2, 16, 3);
    ctx.fillRect(cx - 7, my + 1, 14, 2);
    ctx.fillRect(cx - 5, my + 3, 10, 2);
    ctx.fillRect(cx - 3, my + 5, 6, 1);
    ctx.fillStyle = o.teeth;
    ctx.fillRect(cx - 7, my - 2, 14, 2);
    ctx.fillStyle = o.tongue;
    ctx.fillRect(cx - 4, my + 3, 8, 2);
  } else if (expr === 'shocked') {
    ctx.fillStyle = o.mouth;
    blob(ctx, cx - 5, my - 4, 10, 11);
    ctx.fillStyle = o.teeth;
    ctx.fillRect(cx - 3, my - 4, 6, 1);
    ctx.fillStyle = o.tongue;
    blob(ctx, cx - 3, my + 3, 6, 3);
  } else if (expr === 'squint') {
    ctx.fillStyle = o.mouth;
    blob(ctx, cx - 8, my - 2, 16, 6);
    ctx.fillStyle = o.teeth;
    ctx.fillRect(cx - 7, my - 1, 14, 4);
    ctx.fillStyle = o.mouth;
    ctx.fillRect(cx - 7, my + 1, 14, 1);
    for (let x = cx - 5; x < cx + 7; x += 3) ctx.fillRect(x, my - 1, 1, 4);
  } else {
    ctx.fillStyle = o.mouth;
    blob(ctx, cx - 6, my - 2, 12, 7);
    ctx.fillStyle = o.teeth;
    ctx.fillRect(cx - 4, my - 2, 8, 2);
    ctx.fillStyle = o.tongue;
    ctx.fillRect(cx - 3, my + 3, 6, 2);
    ctx.fillStyle = o.lip;
    ctx.fillRect(cx - 4, my + 5, 8, 1);
  }

  if (typeof o.extra === 'function') o.extra(ctx, st, S);
}

/**
 * Builds a face atlas: one 48px cell per expression (columns) per mouth state
 * (rows: closed, open, blink). `draw` paints a cell in cell-local pixels and is
 * handed `{expr, open, blink}`. Tuesday draws her own; humans use
 * {@link faceTexture}.
 *
 * @param {(ctx:CanvasRenderingContext2D, st:{expr:string, open:boolean, blink:boolean}, size:number)=>void} draw
 * @param {string[]} [exprs=FACE_EXPRESSIONS] up to four
 * @returns {THREE.Texture}
 */
export function faceAtlas(draw, exprs = FACE_EXPRESSIONS) {
  const S = FACE_CELL;
  const list = exprs.slice(0, FACE_GRID);
  const tex = makeTexture(S * FACE_GRID, S * FACE_GRID, (ctx) => {
    list.forEach((expr, col) => {
      for (const [row, st] of [[0, { open: false, blink: false }], [1, { open: true, blink: false }],
        [2, { open: false, blink: true }]]) {
        ctx.save();
        ctx.translate(col * S, row * S);
        ctx.beginPath();
        ctx.rect(0, 0, S, S);
        ctx.clip();
        draw(ctx, { expr, ...st }, S);
        ctx.restore();
      }
    });
  });
  tex.repeat.set(1 / FACE_GRID, 1 / FACE_GRID);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.userData.faceExprs = list;
  setFaceCell(tex, list[0], 0);
  return tex;
}

/**
 * Points a face atlas at one cell.
 * @param {THREE.Texture} tex
 * @param {string} expr
 * @param {number} row 0 closed, 1 open, 2 blink
 */
export function setFaceCell(tex, expr, row) {
  const list = tex.userData.faceExprs || FACE_EXPRESSIONS;
  const col = Math.max(0, list.indexOf(expr));
  tex.offset.set(col / FACE_GRID, 1 - (row + 1) / FACE_GRID);
}

/**
 * Builds a human face atlas (see {@link faceAtlas}) from a handful of knobs.
 *
 * @param {Object} [o]
 * @param {string} [o.skin='#c9a689'] base fill
 * @param {string} [o.shade] side-plane shade (defaults to a darker skin)
 * @param {string} [o.line='#241a18'] lids / lash line
 * @param {string} [o.iris] iris colour (defaults to a warm dark brown)
 * @param {string} [o.brow] brow colour
 * @param {number} [o.browW=2] brow thickness in px
 * @param {string} [o.mouth] mouth interior / closed line
 * @param {string} [o.lip] lip tone under the mouth
 * @param {string} [o.sclera='#e6e2dc'] eye white
 * @param {string} [o.nose] nose plane colour
 * @param {number} [o.noseW=0] extra nose width in px
 * @param {number} [o.browTilt=0] +1 raises the right brow, -1 the left (the skeptic / the charmer)
 * @param {number} [o.gaze=1] iris offset in px
 * @param {number} [o.eyeScale=1] @param {number} [o.eyeY=0] @param {number} [o.mouthY=0] @param {number} [o.mouthX=0]
 * @param {boolean} [o.smirk=false] @param {boolean} [o.lashes=false] @param {boolean} [o.blush=false]
 * @param {(ctx:CanvasRenderingContext2D, st:{expr:string, open:boolean, blink:boolean}, size:number)=>void} [o.extra]
 *   painted last, in cell-local pixels — shades, stubble, freckles, hood shadow
 * @returns {THREE.Texture}
 */
export function faceTexture(o = {}) {
  const skin = o.skin || '#c9a689';
  const line = o.line || '#241a18';
  const cfg = {
    skin,
    shade: o.shade || shadeOf(skin, 0.80),
    shadeMid: shadeOf(o.shade || shadeOf(skin, 0.80), 1.10),
    lit: shadeOf(skin, 1.07),
    line,
    iris: o.iris || '#3a2519',
    pupil: o.pupil || '#120c0c',
    glint: o.glint || '#f4f0ea',
    brow: o.brow || line,
    browW: o.browW || 2,
    mouth: o.mouth || '#5c3a33',
    lip: o.lip || mix(skin, '#a0504a', 0.35),
    teeth: o.teeth || '#e8e2d6',
    tongue: o.tongue || '#b0606a',
    sclera: o.sclera || '#e6e2dc',
    nose: o.nose || shadeOf(skin, 0.86),
    nostril: shadeOf(skin, 0.70),
    noseW: o.noseW || 0,
    blushColor: o.blushColor || 'rgba(196,84,84,0.22)',
    browTilt: o.browTilt || 0,
    gaze: o.gaze === undefined ? 1 : o.gaze,
    eyeScale: o.eyeScale || 1,
    eyeY: o.eyeY || 0,
    mouthY: o.mouthY || 0,
    mouthX: o.mouthX || 0,
    smirk: !!o.smirk,
    lashes: !!o.lashes,
    blush: !!o.blush,
    extra: o.extra,
  };
  return faceAtlas((ctx, st) => drawFaceCell(ctx, st, cfg));
}

/**
 * Multiplies a `#rrggbb` string toward black (k < 1) or white-ish (k > 1).
 * @param {string} hex @param {number} k
 * @returns {string}
 */
function shadeOf(hex, k) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  c.r = Math.min(1, c.r); c.g = Math.min(1, c.g); c.b = Math.min(1, c.b);
  return `#${c.getHexString()}`;
}

/**
 * @param {string} a @param {string} b @param {number} t
 * @returns {string}
 */
function mix(a, b, t) {
  return `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`;
}

/**
 * Where a human face goes on a head of height `H`: a square quad 0.84H on a
 * side, centred at 0.52H — eyes land at about half height, the mouth at a
 * quarter, and the top of the forehead tucks under the hairline.
 * @param {number} H head height
 * @param {number} [k=1] scale, for a bigger or smaller face
 * @param {number} [dy=0] nudge up/down in metres
 * @returns {{w:number, h:number, y:number}}
 */
export function faceBox(H, k = 1, dy = 0) {
  return { w: H * 0.84 * k, h: H * 0.84 * k, y: H * 0.52 + dy };
}

/**
 * The z of a head's front plane (where the face sits) for a {@link buildHuman}
 * head of depth `headD`. Hair that crosses the face must stay in front of this
 * with a vertical front (`anchorFront`), or it will slice through the face.
 * @param {number} headD
 * @returns {number}
 */
export function headFront(headD) {
  return headD / 2 + 0.003;
}

/**
 * Hangs the painted face on the front of a head joint. Affine warping is on
 * (the ps1 default), which is what makes it swim as the head turns.
 *
 * If the head was built by {@link buildHuman} (a front-anchored
 * {@link prismBox}), the quad is cut into two rows and each row is pinched to
 * the head's width at that height, so the face follows the jaw instead of
 * hanging off it like a plate.
 *
 * @param {THREE.Object3D} head the head joint
 * @param {THREE.Texture} tex from {@link faceTexture}
 * @param {Object} o
 * @param {number} o.w quad width
 * @param {number} o.h quad height
 * @param {number} o.y local y of the quad centre
 * @param {number} [o.z] local z of the quad plane (defaults to just proud of the head front)
 * @returns {THREE.Mesh}
 */
export function addFace(head, tex, o) {
  const geo = new THREE.PlaneGeometry(o.w, o.h, 1, 2);
  let z = o.z;
  const shell = head.children.find((c) => c.userData && c.userData.prism && c.userData.prism.anchorFront);
  if (shell) {
    const p = shell.userData.prism;
    const y0 = shell.position.y - p.h / 2;
    const ringAt = (u) => {
      const r = p.rings;
      for (let i = 0; i + 1 < r.length; i++) {
        if (u <= r[i + 1][0] || i + 2 === r.length) {
          const k = Math.min(1, Math.max(0, (u - r[i][0]) / ((r[i + 1][0] - r[i][0]) || 1)));
          return r[i][1] + (r[i + 1][1] - r[i][1]) * k;
        }
      }
      return 1;
    };
    // Pinch each row to the head's width there, and CROP the texture to match
    // rather than squashing it: the features keep their size and only the
    // painted side-shading falls off the edge.
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const y = o.y + pos.getY(i);
      const u = Math.min(1, Math.max(0, (y - y0) / p.h));
      const half = (p.w / 2 - p.cF) * ringAt(u) - 0.003;
      const k = Math.min(1, half / (o.w / 2));
      pos.setX(i, pos.getX(i) * k);
      uv.setX(i, 0.5 + (uv.getX(i) - 0.5) * k);
    }
    pos.needsUpdate = true;
    uv.needsUpdate = true;
    if (z === undefined) z = shell.position.z + p.d / 2 + 0.003;
  }
  const mesh = new THREE.Mesh(geo, ps1Material({ map: tex, color: 0xffffff, affine: true }));
  mesh.position.set(0, o.y, z === undefined ? 0.13 : z);
  mesh.name = 'face';
  head.add(mesh);
  return mesh;
}

/* ------------------------------------------------------------------------- *
 * Emotes
 * ------------------------------------------------------------------------- */

/** @type {Map<string, THREE.Texture>} */
const emoteTextures = new Map();

/**
 * Draws the little 24x24 emote glyphs. Deliberately crude — they are read for
 * half a second at 384x216.
 * @param {string} name
 * @returns {THREE.Texture}
 */
function emoteTexture(name) {
  const hit = emoteTextures.get(name);
  if (hit) return hit;

  const tex = makeTexture(24, 24, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const glyph = (txt, fill) => {
      ctx.font = 'bold 22px ui-monospace, "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#100c14';
      ctx.strokeText(txt, 12, 13);
      ctx.fillStyle = fill;
      ctx.fillText(txt, 12, 13);
    };
    if (name === 'sweat') {
      ctx.fillStyle = '#101018';
      ctx.beginPath();
      ctx.moveTo(12, 2); ctx.lineTo(20, 18); ctx.lineTo(4, 18); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#7fc8e8';
      ctx.beginPath();
      ctx.moveTo(12, 5); ctx.lineTo(18, 17); ctx.lineTo(6, 17); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#dff2ff';
      ctx.fillRect(9, 12, 2, 3);
    } else if (name === 'anger') {
      ctx.fillStyle = '#100c14';
      ctx.fillRect(2, 2, 20, 20);
      ctx.fillStyle = '#d24a4a';
      for (let i = 0; i < 2; i++) {
        const o = i * 6;
        ctx.fillRect(5 + o, 4, 3, 7);
        ctx.fillRect(4, 5 + o, 7, 3);
        ctx.fillRect(13, 13 - o, 7, 3);
        ctx.fillRect(16 - o, 12, 3, 7);
      }
      ctx.clearRect(0, 0, 24, 2);
    } else if (name === 'heart') {
      ctx.fillStyle = '#100c14';
      ctx.fillRect(3, 4, 18, 9);
      ctx.beginPath(); ctx.moveTo(3, 12); ctx.lineTo(21, 12); ctx.lineTo(12, 22); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#e06a8c';
      ctx.fillRect(5, 6, 14, 7);
      ctx.beginPath(); ctx.moveTo(5, 12); ctx.lineTo(19, 12); ctx.lineTo(12, 20); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#f2b6c8';
      ctx.fillRect(7, 7, 3, 3);
    } else if (name === 'zzz') {
      ctx.font = 'bold 10px ui-monospace, "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const zs = [[7, 18, 8], [12, 12, 10], [17, 5, 12]];
      for (const [x, y, size] of zs) {
        ctx.font = `bold ${size}px ui-monospace, "Courier New", monospace`;
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#100c14';
        ctx.strokeText('z', x, y);
        ctx.fillStyle = '#dfe6ff';
        ctx.fillText('z', x, y);
      }
    } else if (name === 'money') {
      glyph('$', '#8fd07a');
    } else if (name === 'exclaim') {
      glyph('!', '#ffe27a');
    } else {
      glyph('?', '#dfe6ff');
    }
  });
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  emoteTextures.set(name, tex);
  return tex;
}

/* ------------------------------------------------------------------------- *
 * Pose buffers
 * ------------------------------------------------------------------------- */

/**
 * A pose writes joint rotations (and optional position offsets) into a buffer.
 * @typedef {(P: PoseWriter, t: number, ctx: PoseCtx) => void} Pose
 */

/**
 * @typedef {Object} PoseWriter
 * @property {(name:string, rx?:number, ry?:number, rz?:number)=>void} r set rotation
 * @property {(name:string, px?:number, py?:number, pz?:number)=>void} p set position offset
 * @property {(name:string, rx?:number, ry?:number, rz?:number)=>void} add add to rotation
 */

/**
 * @typedef {Object} PoseCtx
 * @property {Object<string, number>} dims
 * @property {Object<string, number>} style per-character motion knobs
 * @property {import('./rig.js').Actor} actor
 */

/**
 * @param {string[]} names
 * @returns {Object<string, Float64Array>}
 */
function makeBuffer(names) {
  /** @type {Object<string, Float64Array>} */
  const b = {};
  for (const n of names) b[n] = new Float64Array(6);
  return b;
}

/**
 * @param {Object<string, Float64Array>} buf
 * @returns {PoseWriter}
 */
function makeWriter(buf) {
  return {
    r(name, rx, ry, rz) {
      const a = buf[name];
      if (!a) return;
      a[0] = rx || 0; a[1] = ry || 0; a[2] = rz || 0;
    },
    p(name, px, py, pz) {
      const a = buf[name];
      if (!a) return;
      a[3] = px || 0; a[4] = py || 0; a[5] = pz || 0;
    },
    add(name, rx, ry, rz) {
      const a = buf[name];
      if (!a) return;
      a[0] += rx || 0; a[1] += ry || 0; a[2] += rz || 0;
    },
  };
}

/* ------------------------------------------------------------------------- *
 * Skeletons
 * ------------------------------------------------------------------------- */

/**
 * @typedef {Object} JointDef
 * @property {string} name
 * @property {string|null} parent
 * @property {number[]} pos local rest position
 * @property {string|string[]} [alias] extra keys this joint answers to in `parts`
 * @property {string} [order] euler order, default 'XYZ' ('YXZ' on heads)
 */

/**
 * The standard humanoid skeleton:
 * `root > hips > spine > chest > (neck > head, shoulderL/R > armL/R > foreL/R > handL/R)`
 * plus `hips > thighL/R > shinL/R > footL/R`. Feet land on y=0.
 * @param {Object<string, number>} [d=HUMAN_DIMS]
 * @returns {JointDef[]}
 */
export function humanSkeleton(d = HUMAN_DIMS) {
  const hipY = d.foot + d.shin + d.thigh;
  /** @type {JointDef[]} */
  const defs = [
    { name: 'root', parent: null, pos: [0, 0, 0] },
    { name: 'hips', parent: 'root', pos: [0, hipY, 0] },
    { name: 'spine', parent: 'hips', pos: [0, d.pelvis, 0] },
    { name: 'chest', parent: 'spine', pos: [0, d.spine, 0] },
    { name: 'neck', parent: 'chest', pos: [0, d.chest, 0] },
    { name: 'head', parent: 'neck', pos: [0, d.neck, 0], order: 'YXZ' },
  ];
  for (const s of [-1, 1]) {
    const S = s < 0 ? 'L' : 'R';
    defs.push(
      { name: `shoulder${S}`, parent: 'chest', pos: [s * d.shoulderX, d.shoulderY, 0] },
      { name: `arm${S}`, parent: `shoulder${S}`, pos: [0, 0, 0], alias: `upperArm${S}` },
      { name: `fore${S}`, parent: `arm${S}`, pos: [0, -d.upperArm, 0], alias: `elbow${S}` },
      { name: `hand${S}`, parent: `fore${S}`, pos: [0, -d.foreArm, 0], alias: [`mitten${S}`, `wrist${S}`] },
      { name: `thigh${S}`, parent: 'hips', pos: [s * d.hipX, 0, 0], alias: `hip${S}` },
      { name: `shin${S}`, parent: `thigh${S}`, pos: [0, -d.thigh, 0], alias: `knee${S}` },
      { name: `foot${S}`, parent: `shin${S}`, pos: [0, -d.shin, 0], alias: `ankle${S}` },
    );
  }
  return defs;
}

/* ------------------------------------------------------------------------- *
 * The shared human pose library
 * ------------------------------------------------------------------------- */

/** @param {number} v @param {number} lo @param {number} hi @returns {number} */
function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

/**
 * How far a leg reaches below the hips when its thigh sits at `T` radians from
 * vertical and its shin at `T + S`. The rig solves the hip height from this
 * every frame, which is why no character's feet ever sink through the floor —
 * not while walking, not while slumping, and not mid-way through sitting down.
 * @param {number} T @param {number} S @param {Object<string,number>} d
 * @returns {number} metres
 */
function legReach(T, S, d) {
  return d.thigh * Math.cos(T) + d.shin * Math.cos(T + S);
}

/**
 * The ten mandated human animations, as procedural poses. Characters may
 * override any of them via `spec.poses`.
 * @type {Object<string, Pose>}
 */
export const HUMAN_POSES = {
  idle(P, t, c) {
    const m = c.style.motion;
    const br = Math.sin(t * 1.55);
    P.r('spine', 0.015 + br * 0.012 * m, Math.sin(t * 0.47) * 0.03 * m, 0);
    P.r('chest', -0.012 - br * 0.008 * m, 0, 0);
    P.r('neck', 0.02, 0, 0);
    P.r('head', Math.sin(t * 1.21 + 0.6) * 0.035 * m, Math.sin(t * 0.41) * 0.11 * m, 0);
    const sway = Math.sin(t * 1.55) * 0.05 * m;
    P.r('armL', FWD * (0.02 + sway), 0, -0.11);
    P.r('armR', FWD * (0.02 - sway), 0, 0.11);
    P.r('foreL', FWD * (0.20 + sway * 0.5), 0, 0);
    P.r('foreR', FWD * (0.20 - sway * 0.5), 0, 0);
    P.r('handL', FWD * 0.10, 0, 0);
    P.r('handR', FWD * 0.10, 0, 0);
    P.p('hips', 0, (br * 0.5 + 0.5) * 0.006 * m, 0);
  },

  walk(P, t, c) {
    const d = c.dims;
    const ph = t * Math.PI * 2 * 0.95;
    const s = Math.sin(ph);
    const sw = 0.40;
    const asw = c.style.armSwing;

    const TL = FWD * sw * s;
    const TR = FWD * sw * -s;
    const SL = 0.10 + 0.80 * Math.max(0, Math.sin(ph + 2.2));
    const SR = 0.10 + 0.80 * Math.max(0, Math.sin(ph + 2.2 + Math.PI));

    P.r('thighL', TL, 0, 0.02);
    P.r('thighR', TR, 0, -0.02);
    P.r('shinL', SL, 0, 0);
    P.r('shinR', SR, 0, 0);
    // The toe is never allowed to pitch far down: a 21cm shoe would scuff
    // through the carpet on the forward swing.
    P.r('footL', clamp(-(TL + SL) * 0.55 + 0.04, -0.5, 0.06), 0, 0);
    P.r('footR', clamp(-(TR + SR) * 0.55 + 0.04, -0.5, 0.06), 0, 0);

    // The rig solves the hip height from the leg angles (see `groundLegs`), so
    // this is only the extra bob on top of a planted stride.
    P.p('hips', 0, 0.006 * (1 + Math.cos(ph * 2)) * 0.5, 0);
    P.r('hips', 0, 0.10 * s, 0);
    P.r('spine', 0.06, -0.06 * s, 0);
    P.r('chest', 0.01, -0.10 * s, 0);
    P.r('head', 0.01, 0.05 * s, 0);

    P.r('armL', FWD * -0.44 * s * asw, 0, -0.10);
    P.r('armR', FWD * 0.44 * s * asw, 0, 0.10);
    P.r('foreL', FWD * (0.30 + 0.22 * Math.max(0, -s)) * asw, 0, 0);
    P.r('foreR', FWD * (0.30 + 0.22 * Math.max(0, s)) * asw, 0, 0);
  },

  talk(P, t, c) {
    const m = c.style.motion;
    HUMAN_POSES.idle(P, t * 0.8, c);
    const g = Math.sin(t * 3.1);
    P.r('head', Math.sin(t * 3.0) * 0.06 * m, Math.sin(t * 1.9) * 0.14 * m, Math.sin(t * 2.3) * 0.03 * m);
    P.r('spine', 0.015, Math.sin(t * 1.5) * 0.05 * m, 0);
    P.r('armR', FWD * (0.30 + 0.20 * g), 0, 0.20);
    P.r('foreR', FWD * (0.80 + 0.35 * Math.sin(t * 3.1 + 1.0)), 0, 0);
    P.r('handR', FWD * 0.25, 0, 0.2 * g);
    P.r('armL', FWD * (0.10 - 0.08 * g), 0, -0.14);
    P.r('foreL', FWD * (0.42 + 0.12 * g), 0, 0);
  },

  panic(P, t) {
    const f = Math.sin(t * 19);
    P.r('armL', FWD * 0.25, 0, -2.45 + 0.16 * f);
    P.r('armR', FWD * 0.25, 0, 2.45 - 0.16 * f);
    P.r('foreL', FWD * 0.55, 0, -0.3);
    P.r('foreR', FWD * 0.55, 0, 0.3);
    P.r('handL', 0, 0, -0.3 * f);
    P.r('handR', 0, 0, 0.3 * f);
    P.r('spine', -0.05, 0.05 * Math.sin(t * 9), 0);
    P.r('chest', -0.04, 0, 0.03 * f);
    P.r('head', -0.10, 0.12 * Math.sin(t * 8.5), 0.06 * f);
    P.r('thighL', FWD * 0.10, 0, 0.04);
    P.r('thighR', FWD * 0.10, 0, -0.04);
    P.r('shinL', 0.18, 0, 0);
    P.r('shinR', 0.18, 0, 0);
    P.p('hips', 0.008 * f, 0.012 * Math.abs(Math.sin(t * 9.5)), 0);
  },

  point(P, t, c) {
    const m = c.style.motion;
    const pop = 1 - Math.exp(-t * 9);
    const bob = Math.sin(t * 2.2) * 0.03 * m;
    P.r('armR', FWD * (1.45 + bob) * pop, 0, 0.16);
    P.r('foreR', FWD * (0.12 + bob), 0, 0);
    P.r('handR', FWD * -0.18, 0, 0);
    P.r('armL', FWD * 0.04, 0, -0.13);
    P.r('foreL', FWD * 0.30, 0, 0);
    P.r('chest', 0.02, -0.14 * pop, 0);
    P.r('spine', 0.03, -0.06 * pop, 0);
    P.r('head', 0.02 + bob * 0.4, -0.05 * pop, 0);
  },

  type(P, t, c) {
    const m = c.style.motion;
    P.r('armL', FWD * 0.92, 0, -0.16);
    P.r('armR', FWD * 0.92, 0, 0.16);
    P.r('foreL', FWD * 0.58, 0, 0.10);
    P.r('foreR', FWD * 0.58, 0, -0.10);
    P.r('handL', FWD * (0.10 + 0.30 * Math.max(0, Math.sin(t * 11))), 0, 0);
    P.r('handR', FWD * (0.10 + 0.30 * Math.max(0, Math.sin(t * 11 + 1.7))), 0, 0);
    P.r('spine', 0.13, 0, 0);
    P.r('chest', 0.05, 0, 0);
    P.r('head', 0.20 + Math.sin(t * 1.7) * 0.02 * m, Math.sin(t * 0.9) * 0.05 * m, 0);
  },

  shrug(P, t) {
    const pop = 1 - Math.exp(-t * 11);
    const settle = Math.sin(t * 2.4) * 0.012 * Math.exp(-t * 0.8);
    P.p('shoulderL', 0, (0.045 + settle) * pop, 0);
    P.p('shoulderR', 0, (0.045 + settle) * pop, 0);
    P.r('armL', FWD * 0.10, 0, (-0.58 - settle) * pop);
    P.r('armR', FWD * 0.10, 0, (0.58 + settle) * pop);
    P.r('foreL', FWD * 1.15 * pop, 0.25, -0.15);
    P.r('foreR', FWD * 1.15 * pop, -0.25, 0.15);
    P.r('handL', FWD * -0.35, 0, 0);
    P.r('handR', FWD * -0.35, 0, 0);
    P.r('head', 0.06 * pop, 0, 0.05 * pop);
    P.r('spine', 0.04 * pop, 0, 0);
  },

  cheer(P, t, c) {
    const d = c.dims;
    const hop = Math.max(0, Math.sin(t * 5.2));
    const bend = 0.22 * (1 - hop);
    P.r('armL', FWD * 0.20, 0, -2.55 + 0.12 * Math.sin(t * 5.2));
    P.r('armR', FWD * 0.20, 0, 2.55 - 0.12 * Math.sin(t * 5.2));
    P.r('foreL', FWD * 0.30, 0, -0.2);
    P.r('foreR', FWD * 0.30, 0, 0.2);
    P.r('head', -0.14 + hop * 0.05, 0, 0);
    P.r('chest', -0.06, 0, 0);
    P.r('spine', -0.04, 0, 0);
    P.r('thighL', FWD * bend, 0, 0.03);
    P.r('thighR', FWD * bend, 0, -0.03);
    P.r('shinL', bend * 2, 0, 0);
    P.r('shinR', bend * 2, 0, 0);
    P.r('footL', -bend, 0, 0);
    P.r('footR', -bend, 0, 0);
    P.p('hips', 0, hop * 0.085, 0);
  },

  slump(P, t, c) {
    const d = c.dims;
    const m = c.style.motion;
    const sigh = Math.sin(t * 0.9);
    const T = FWD * 0.16;
    const S = 0.34;
    P.r('spine', 0.24 + sigh * 0.02 * m, 0, 0);
    P.r('chest', 0.16, 0, 0);
    P.r('neck', 0.10, 0, 0);
    P.r('head', 0.30 + sigh * 0.03 * m, Math.sin(t * 0.5) * 0.06 * m, 0);
    P.p('shoulderL', 0, -0.028, 0.01);
    P.p('shoulderR', 0, -0.028, 0.01);
    P.r('armL', FWD * -0.12, 0, -0.05);
    P.r('armR', FWD * -0.12, 0, 0.05);
    P.r('foreL', FWD * 0.22, 0, 0);
    P.r('foreR', FWD * 0.22, 0, 0);
    P.r('thighL', T, 0, 0.03);
    P.r('thighR', T, 0, -0.03);
    P.r('shinL', S, 0, 0);
    P.r('shinR', S, 0, 0);
    P.r('footL', -(T + S), 0, 0);
    P.r('footR', -(T + S), 0, 0);
    P.p('hips', 0, -0.006, 0);
  },

  sit(P, t, c) {
    HUMAN_POSES.idle(P, t, c);
  },

  /** Just been bitten: hopping on one foot, clutching the other ankle, one arm flailing. */
  hop(P, t) {
    const h = Math.abs(Math.sin(t * 7.5));
    P.r('thighL', FWD * 0.95, 0, 0.05);
    P.r('shinL', 1.55, 0, 0);
    P.r('footL', 0.3, 0, 0);
    P.r('thighR', FWD * 0.05, 0, -0.03);
    P.r('shinR', 0.14 * (1 - h), 0, 0);
    P.r('footR', -0.07 * (1 - h), 0, 0);
    P.r('spine', 0.26, 0, 0.07 * Math.sin(t * 7.5));
    P.r('chest', 0.12, 0, 0);
    P.r('head', -0.12, 0.15 * Math.sin(t * 3.7), 0.05 * Math.sin(t * 7.5));
    P.r('armL', FWD * 0.85, 0, 0.12);
    P.r('foreL', FWD * 0.95, 0, 0);
    P.r('armR', FWD * 0.2, 0, 1.25 + 0.25 * Math.sin(t * 15));
    P.r('foreR', FWD * 0.45, 0, 0.2 * Math.sin(t * 15));
    P.p('hips', 0, h * 0.07, 0);
  },
};

/**
 * The seated override. Applied on top of whatever the upper body is doing, so
 * a character can sit and talk, sit and type, or sit and panic.
 * @type {Pose}
 */
export const HUMAN_SIT = (P) => {
  const T = -1.35;
  const S = 1.35;
  P.r('thighL', T, 0, 0.06);
  P.r('thighR', T, 0, -0.06);
  P.r('shinL', S, 0, 0);
  P.r('shinR', S, 0, 0);
  P.r('footL', 0.06, 0, 0);
  P.r('footR', 0.06, 0, 0);
  P.p('hips', 0, 0, -0.26);
  P.add('spine', 0.03, 0, 0);
};

/** Joints the seated override takes command of. @type {string[]} */
export const HUMAN_SIT_JOINTS = ['hips', 'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR', 'spine'];

/* ------------------------------------------------------------------------- *
 * The rig
 * ------------------------------------------------------------------------- */

/**
 * @typedef {Object} CharProfile
 * @property {string} id
 * @property {string} name
 * @property {string} fullName
 * @property {string} role
 * @property {string} color
 * @property {string} voice
 * @property {string[]} stats
 * @property {number} height
 */

/**
 * @typedef {Object} Actor
 * @property {THREE.Group} group root; place it with `group.position`
 * @property {CharProfile} profile
 * @property {THREE.Object3D} head
 * @property {THREE.Object3D} body
 * @property {Object<string, THREE.Object3D>} parts named joints
 * @property {(name:string)=>void} play
 * @property {()=>string} current
 * @property {(dt:number, t:number)=>void} update
 * @property {(target:THREE.Object3D|THREE.Vector3|null)=>void} lookAt
 * @property {(name:string)=>Promise<void>} emote
 * @property {(v:boolean)=>void} setSitting
 * @property {THREE.Object3D|null} prop signature hand prop
 * @property {(frame:string|null)=>void} setFace additive: force a face frame (legacy names: neutral/talk/shocked/squint/happy)
 * @property {(expr:string|null)=>void} setExpression additive: hold 'neutral'|'happy'|'shocked'|'squint'; null returns to the animation's own
 * @property {(open:boolean|null)=>void} setMouth additive: hold the mouth open/closed; null returns to automatic (flaps while talking)
 * @property {()=>string[]} expressions additive: the expressions this face atlas carries
 * @property {()=>{expr:string, open:boolean, blink:boolean}} faceState additive: what the face is showing right now
 * @property {()=>string[]} anims additive: the animation vocabulary
 * @property {()=>number} triangles additive: poly count, for budget checks
 * @property {()=>void} dispose additive
 */

/**
 * @typedef {Object} RigSpec what a character's `build` callback returns
 * @property {Object<string, Pose>} [poses] extra or overriding animations
 * @property {Pose} [bias] a static pose added to every frame (hunch, posture)
 * @property {Pose} [sitPose] override for the seated layer
 * @property {string[]} [sitJoints] joints the seated layer owns
 * @property {THREE.Object3D} [prop] the signature hand prop
 * @property {THREE.Texture} [faceTex] face atlas, so the rig can drive frames
 * @property {Object<string,string>} [animFace] anim -> 'expr', 'expr+talk' or 'expr+open' overrides
 * @property {{joint:string, angle:number}} [mouth] a jaw joint to swing open with the mouth (Tuesday)
 * @property {Object<string,number>} [style] `motion`, `armSwing`, `faceRate` (syllables/s while talking)
 * @property {boolean} [groundLegs] false disables the hip-height solver
 * @property {number} [emoteY] height of the emote bubble in metres
 * @property {string} [defaultAnim]
 * @property {(dt:number, t:number, actor:Actor)=>void} [onUpdate]
 */

/**
 * Builds an {@link Actor}: joint tree, meshes, the procedural animation state
 * machine with its 0.15s crossfade, head aiming, the seated layer, face-frame
 * swapping and the emote bubbles.
 *
 * `build(parts, api)` is where a character hangs its boxes. It is called once,
 * with the joint map and a toolkit, and returns a {@link RigSpec}.
 *
 * @param {CharProfile} profile
 * @param {(parts: Object<string, THREE.Object3D>, api: Object) => RigSpec} build
 * @param {Object} [opts]
 * @param {Object<string, number>} [opts.dims] overrides merged over {@link HUMAN_DIMS}
 * @param {JointDef[]} [opts.skeleton] a non-humanoid skeleton (Tuesday uses one)
 * @param {Object<string, Pose>} [opts.poses] base pose library, default {@link HUMAN_POSES}
 * @returns {Actor}
 */
export function createRig(profile, build, opts = {}) {
  const dims = Object.assign({}, HUMAN_DIMS, opts.dims || {});
  const defs = opts.skeleton || humanSkeleton(dims);

  const group = new THREE.Group();
  group.name = profile.id || 'actor';

  /** @type {Object<string, THREE.Object3D>} */
  const parts = {};
  /** @type {string[]} */
  const jointNames = [];
  /** @type {Object<string, THREE.Vector3>} */
  const rest = {};

  for (const def of defs) {
    const joint = new THREE.Object3D();
    joint.name = def.name;
    joint.position.set(def.pos[0] || 0, def.pos[1] || 0, def.pos[2] || 0);
    if (def.order) joint.rotation.order = def.order;
    rest[def.name] = joint.position.clone();
    parts[def.name] = joint;
    jointNames.push(def.name);
    const parent = def.parent ? parts[def.parent] : null;
    (parent || group).add(joint);
    if (def.alias) {
      const aliases = Array.isArray(def.alias) ? def.alias : [def.alias];
      for (const a of aliases) parts[a] = joint;
    }
  }

  const api = {
    THREE,
    dims,
    profile,
    mat: ps1Material,
    ps1Material,
    makeTexture,
    boxMesh,
    taperedBox,
    cylMesh,
    wedgeMesh,
    attach,
    faceTexture,
    faceAtlas,
    prismBox,
    addFace,
    SKINS,
    POSES: opts.poses || HUMAN_POSES,
  };

  /** @type {RigSpec} */
  const spec = build(parts, api) || {};

  const poses = Object.assign({}, opts.poses || HUMAN_POSES, spec.poses || {});
  const style = Object.assign({ motion: 1, armSwing: 1, faceRate: 7 }, spec.style || {});
  const sitPose = spec.sitPose || (opts.skeleton ? null : HUMAN_SIT);
  const sitJoints = spec.sitJoints || HUMAN_SIT_JOINTS;
  const animFace = Object.assign({}, ANIM_FACE, spec.animFace || {});
  const faceTex = spec.faceTex || null;
  const emoteY = spec.emoteY === undefined ? (profile.height || 1.75) + 0.22 : spec.emoteY;
  // Humanoid rigs keep their feet on the floor by solving the hip height each
  // frame. Quadrupeds and anything exotic opt out with `spec.groundLegs=false`.
  const groundLegs = spec.groundLegs === false
    ? false
    : !!(parts.thighL && parts.shinL && parts.thighR && parts.shinR && parts.hips && !opts.skeleton);

  const bufA = makeBuffer(jointNames);
  const bufB = makeBuffer(jointNames);
  const bufOut = makeBuffer(jointNames);
  const bufSit = makeBuffer(jointNames);
  const bufBias = makeBuffer(jointNames);
  const wA = makeWriter(bufA);
  const wB = makeWriter(bufB);
  const wSit = makeWriter(bufSit);

  /** @type {PoseCtx} */
  const ctx = { dims, style, actor: /** @type {any} */ (null) };

  if (typeof spec.bias === 'function') spec.bias(makeWriter(bufBias), 0, ctx);
  const hasBias = typeof spec.bias === 'function';

  let animName = spec.defaultAnim || 'idle';
  let prevName = animName;
  let animT = 0;
  let prevT = 0;
  let fade = 1;
  let clock = 0;
  let sitting = false;
  let sitBlend = 0;

  /** @type {THREE.Object3D|THREE.Vector3|null} */
  let lookTarget = null;
  let lookYaw = 0;
  let lookPitch = 0;

  /** @type {string|null} */
  let exprOverride = null;
  /** @type {boolean|null} */
  let mouthOverride = null;
  let lastCell = '';
  const exprs = faceTex ? (faceTex.userData.faceExprs || FACE_EXPRESSIONS) : FACE_EXPRESSIONS;
  const face = { expr: exprs[0], open: false, blink: false };
  let blinkLeft = 0;
  let nextBlink = 1 + Math.random() * 3;
  let jawOpen = 0;

  /** @type {Array<{mesh:THREE.Mesh, mat:THREE.ShaderMaterial, t:number, done:boolean, resolve:Function, timer:number}>} */
  const emotes = [];

  /**
   * @param {string} name
   * @returns {string} a name that exists in the pose library
   */
  function resolveAnim(name) {
    const n = String(name || '').trim();
    if (poses[n]) return n;
    if (n === 'stand') return 'idle';
    return 'idle';
  }

  /**
   * Starts an animation, crossfading from whatever is playing over 0.15s.
   * @param {string} name
   * @returns {void}
   */
  function play(name) {
    const raw = String(name || 'idle');
    if (raw === 'sit') setSitting(true);
    else if (raw === 'walk' || raw === 'run' || raw === 'zoomies' || raw === 'stand') setSitting(false);
    const next = resolveAnim(raw === 'sit' ? 'sit' : raw);
    if (next === animName) return;
    prevName = animName;
    prevT = animT;
    animName = next;
    animT = 0;
    fade = 0;
  }

  /**
   * @returns {string} the animation the rig believes it is playing
   */
  function current() {
    if (sitting && (animName === 'idle' || animName === 'sit')) return 'sit';
    return animName;
  }

  /**
   * @param {boolean} v
   * @returns {void}
   */
  function setSitting(v) {
    sitting = !!v;
  }

  /**
   * Points the head (and a little of the chest) at something. `null` releases.
   * @param {THREE.Object3D|THREE.Vector3|null} target
   * @returns {void}
   */
  function lookAtTarget(target) {
    if (!target) { lookTarget = null; return; }
    if (target.isObject3D || target.isVector3) lookTarget = target;
    else if (typeof target.x === 'number') lookTarget = new THREE.Vector3(target.x, target.y || 0, target.z || 0);
    else lookTarget = null;
  }

  /**
   * Forces a face frame until cleared with `null`.
   * @param {string|null} frame
   * @returns {void}
   */
  function setFace(frame) {
    const f = frame ? FACE_FRAMES[frame] : null;
    if (!f) { exprOverride = null; mouthOverride = null; return; }
    if (f[0]) exprOverride = f[0];
    mouthOverride = f[1];
  }

  /**
   * Holds an expression until cleared with `null`.
   * @param {string|null} expr
   * @returns {void}
   */
  function setExpression(expr) {
    exprOverride = expr && exprs.includes(expr) ? expr : null;
  }

  /**
   * Holds the mouth open (`true`) or shut (`false`); `null` hands it back to
   * the animation, which flaps it while talking.
   * @param {boolean|null} open
   * @returns {void}
   */
  function setMouth(open) {
    mouthOverride = open === null || open === undefined ? null : !!open;
  }

  /**
   * Syllable rhythm for a flapping mouth: a hashed coin per syllable, weighted
   * open, so talk never settles into a metronome.
   * @param {number} t
   * @returns {boolean}
   */
  function flap(t) {
    const seg = Math.floor(t * style.faceRate);
    const r = Math.abs(Math.sin(seg * 12.9898 + 4.1) * 43758.5453) % 1;
    return seg % 2 === 0 ? r > 0.12 : r > 0.72;
  }

  /**
   * Works out the face for this frame — expression, mouth, blink — and moves
   * the atlas if it changed.
   * @param {number} d
   * @returns {void}
   */
  function stepFace(d) {
    const active = fade < 0.5 ? prevName : animName;
    const spec0 = String(animFace[active] || 'neutral');
    const [e0, mode0] = spec0 === 'talk' ? ['neutral', 'talk'] : spec0.split('+');
    face.expr = exprOverride || (exprs.includes(e0) ? e0 : exprs[0]);
    if (mouthOverride !== null) face.open = mouthOverride;
    else if (mode0 === 'open') face.open = true;
    else if (mode0 === 'talk') face.open = flap(clock);
    else face.open = false;

    // blinks: every 2-5s, 0.12s long, sometimes a double; never mid-word
    if (blinkLeft > 0) blinkLeft -= d;
    else if ((nextBlink -= d) <= 0) {
      blinkLeft = 0.12;
      nextBlink = Math.random() < 0.2 ? 0.22 : 2 + Math.random() * 3;
    }
    face.blink = blinkLeft > 0 && !face.open && face.expr !== 'squint';

    if (faceTex) {
      const row = face.open ? 1 : (face.blink ? 2 : 0);
      const key = `${face.expr}${row}`;
      if (key !== lastCell) { setFaceCell(faceTex, face.expr, row); lastCell = key; }
    }
  }

  /**
   * Pops a bubble above the head: it scales in, rises ~0.35m and fades over
   * 900ms. Resolves when it is gone.
   * @param {string} name 'sweat'|'anger'|'question'|'exclaim'|'heart'|'money'|'zzz'
   * @returns {Promise<void>}
   */
  function emote(name) {
    const key = EMOTE_ALIAS[name] || String(name || 'question');
    const tex = emoteTexture(key);
    const mat = ps1Material({
      map: tex,
      color: 0xffffff,
      unlit: 1,
      jitter: 0,
      affine: false,
      transparent: true,
      alphaTest: 0.05,
      depthWrite: false,
      cache: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.26), mat);
    mesh.position.set(0, emoteY, 0);
    mesh.renderOrder = 12;
    mesh.onBeforeRender = (renderer, scene, camera) => {
      if (!mesh.parent) return;
      camera.getWorldQuaternion(_q1);
      mesh.parent.getWorldQuaternion(_q2).invert();
      mesh.quaternion.copy(_q2.multiply(_q1));
      mesh.updateMatrix();
      mesh.matrixWorld.multiplyMatrices(mesh.parent.matrixWorld, mesh.matrix);
    };
    group.add(mesh);

    return new Promise((resolve) => {
      const entry = {
        mesh,
        mat,
        t: 0,
        done: false,
        resolve,
        // Belt and braces: if nobody is driving update(), still resolve and clean up.
        timer: setTimeout(() => finishEmote(entry), 1400),
      };
      emotes.push(entry);
    });
  }

  /**
   * @param {{mesh:THREE.Mesh, mat:THREE.ShaderMaterial, done:boolean, resolve:Function, timer:number}} e
   * @returns {void}
   */
  function finishEmote(e) {
    if (e.done) return;
    e.done = true;
    clearTimeout(e.timer);
    const i = emotes.indexOf(/** @type {any} */ (e));
    if (i !== -1) emotes.splice(i, 1);
    if (e.mesh.parent) e.mesh.parent.remove(e.mesh);
    e.mesh.geometry.dispose();
    e.mat.dispose();
    e.resolve();
  }

  /**
   * @param {number} dt
   * @returns {void}
   */
  function stepEmotes(dt) {
    for (let i = emotes.length - 1; i >= 0; i--) {
      const e = emotes[i];
      e.t += dt;
      const u = e.t / 0.9;
      if (u >= 1) { finishEmote(e); continue; }
      const pop = u < 0.16 ? (u / 0.16) : 1;
      const overshoot = u < 0.16 ? 1 + 0.35 * Math.sin((u / 0.16) * Math.PI) : 1;
      e.mesh.scale.setScalar(pop * overshoot);
      e.mesh.position.y = emoteY + u * 0.34 + (1 - pop) * -0.06;
      e.mat.uniforms.uOpacity.value = u > 0.66 ? Math.max(0, 1 - (u - 0.66) / 0.34) : 1;
    }
  }

  /**
   * Blends the pose stack into the joints. Order: current anim, crossfaded with
   * the outgoing anim, plus the character's static posture bias, plus the
   * seated layer on the joints it owns.
   * @param {number} dt
   * @returns {void}
   */
  function applyPose(dt) {
    const poseA = poses[prevName] || poses.idle;
    const poseB = poses[animName] || poses.idle;

    for (const n of jointNames) bufB[n].fill(0);
    poseB(wB, animT, ctx);

    let src = bufB;
    if (fade < 1) {
      for (const n of jointNames) bufA[n].fill(0);
      poseA(wA, prevT, ctx);
      for (const n of jointNames) {
        const a = bufA[n];
        const b = bufB[n];
        const o = bufOut[n];
        for (let i = 0; i < 6; i++) o[i] = a[i] + (b[i] - a[i]) * fade;
      }
      src = bufOut;
    }

    if (sitBlend > 0 && sitPose) {
      for (const n of sitJoints) if (bufSit[n]) bufSit[n].fill(0);
      sitPose(wSit, clock, ctx);
      for (const n of sitJoints) {
        const s = bufSit[n];
        const o = src[n];
        if (!s || !o) continue;
        for (let i = 0; i < 6; i++) o[i] = o[i] + (s[i] - o[i]) * sitBlend;
      }
    }

    for (const n of jointNames) {
      const joint = parts[n];
      const v = src[n];
      const b = hasBias ? bufBias[n] : null;
      const r = rest[n];
      if (b) {
        joint.rotation.set(v[0] + b[0], v[1] + b[1], v[2] + b[2]);
        joint.position.set(r.x + v[3] + b[3], r.y + v[4] + b[4], r.z + v[5] + b[5]);
      } else {
        joint.rotation.set(v[0], v[1], v[2]);
        joint.position.set(r.x + v[3], r.y + v[4], r.z + v[5]);
      }
    }

    // Solve the hip height from whatever the legs ended up doing, so the
    // longer leg's sole lands exactly on y=0. Poses only author the extra
    // offset (a walk's bob, a cheer's hop), never the drop.
    if (groundLegs) {
      const reach = Math.max(
        legReach(parts.thighL.rotation.x, parts.shinL.rotation.x, dims),
        legReach(parts.thighR.rotation.x, parts.shinR.rotation.x, dims),
      );
      const extra = src.hips[4] + (hasBias ? bufBias.hips[4] : 0);
      parts.hips.position.y = dims.foot + reach + extra;
    }
  }

  /**
   * Aims the head at `lookTarget`, easing in and clamped to a neck's range.
   * @param {number} dt
   * @returns {void}
   */
  function applyLook(dt) {
    const head = parts.head;
    if (!head) return;

    let wantYaw = 0;
    let wantPitch = 0;
    if (lookTarget) {
      group.updateMatrixWorld(true);
      if (lookTarget.isObject3D) lookTarget.getWorldPosition(_v1);
      else _v1.copy(/** @type {THREE.Vector3} */ (lookTarget));
      head.getWorldPosition(_v2);
      _v1.sub(_v2);
      if (_v1.lengthSq() > 1e-6) {
        const parent = head.parent || group;
        parent.getWorldQuaternion(_q1).invert();
        _v1.applyQuaternion(_q1).normalize();
        wantYaw = clamp(Math.atan2(_v1.x, _v1.z), -1.05, 1.05);
        wantPitch = clamp(-Math.atan2(_v1.y, Math.hypot(_v1.x, _v1.z)), -0.5, 0.5);
      }
    }
    const k = Math.min(1, dt * 7);
    lookYaw += (wantYaw - lookYaw) * k;
    lookPitch += (wantPitch - lookPitch) * k;
    if (Math.abs(lookYaw) > 1e-4 || Math.abs(lookPitch) > 1e-4) {
      head.rotation.y += lookYaw;
      head.rotation.x += lookPitch;
    }
  }

  /**
   * One frame of animation. The player (or whoever owns the loop) must call
   * this every frame — nothing in the rig is self-driving.
   * @param {number} dt seconds
   * @param {number} [t] stage time, unused; the rig keeps its own clocks
   * @returns {void}
   */
  function update(dt, t) {
    const d = Math.min(0.1, Math.max(0, dt || 0));
    clock += d;
    animT += d;
    prevT += d;
    if (fade < 1) fade = Math.min(1, fade + d / FADE);
    const sitWant = sitting ? 1 : 0;
    if (sitBlend !== sitWant) {
      const step = d / 0.22;
      sitBlend = sitWant > sitBlend ? Math.min(1, sitBlend + step) : Math.max(0, sitBlend - step);
    }

    applyPose(d);
    applyLook(d);

    stepFace(d);
    if (spec.mouth && parts[spec.mouth.joint]) {
      jawOpen += ((face.open ? 1 : 0) - jawOpen) * Math.min(1, d * 28);
      parts[spec.mouth.joint].rotation.x += jawOpen * spec.mouth.angle;
    }

    stepEmotes(d);
    if (typeof spec.onUpdate === 'function') spec.onUpdate(d, clock, actor);
  }

  /**
   * @returns {number} triangles in this actor, for the 300-900 budget
   */
  function triangles() {
    let n = 0;
    group.traverse((o) => {
      const g = o.geometry;
      if (!g) return;
      n += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    });
    return n;
  }

  /** @returns {void} */
  function dispose() {
    for (let i = emotes.length - 1; i >= 0; i--) finishEmote(emotes[i]);
    group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    if (faceTex) faceTex.dispose();
  }

  /** @type {Actor} */
  const actor = {
    group,
    profile,
    head: parts.head,
    body: parts.chest || parts.spine || parts.hips,
    parts,
    play,
    current,
    update,
    lookAt: lookAtTarget,
    emote,
    setSitting,
    setFace,
    setExpression,
    setMouth,
    expressions: () => exprs.slice(),
    faceState: () => ({ ...face }),
    prop: spec.prop || null,
    anims: () => Object.keys(poses),
    triangles,
    dispose,
  };
  ctx.actor = actor;
  group.userData.actor = actor;

  // Settle into the rest pose so the very first rendered frame is already posed.
  applyPose(0);
  stepFace(0);

  return actor;
}

/* ------------------------------------------------------------------------- *
 * Shared body construction
 * ------------------------------------------------------------------------- */

/**
 * Hangs the standard human chunk set on a joint tree: pelvis, abdomen and chest
 * prisms, a front-flat head that narrows to jaw and crown, ears, hexagonal
 * upper/lower arms and legs, MITTEN hands with a thumb, and shoes with a
 * chamfered toe. About 500 triangles; characters `omit` whatever their outfit
 * covers and spend the difference on their silhouette hook.
 *
 * Every piece is returned so characters can recolour, resize or hide it.
 *
 * @param {Object<string, THREE.Object3D>} parts
 * @param {Object<string, number>} d dims
 * @param {Object} [s] style
 * @param {number} [s.skin=SKINS.fair]
 * @param {number} [s.top=0x8d93a6] shirt / jacket colour
 * @param {number} [s.sleeve] defaults to `top`
 * @param {number} [s.legs=0x6b6555] trousers colour
 * @param {number} [s.shoe=0x3a3129]
 * @param {number} [s.chestW=0.50] shoulder-line width
 * @param {number} [s.chestD=0.25]
 * @param {number} [s.waistW=0.36]
 * @param {number} [s.hipW=0.38]
 * @param {number} [s.armW=0.115]
 * @param {number} [s.legW=0.155]
 * @param {number} [s.headW=0.27]
 * @param {number} [s.headD=0.25]
 * @param {number} [s.handW=0.135]
 * @param {boolean} [s.neck=true]
 * @param {boolean} [s.ears=true]
 * @param {boolean} [s.bareArms=false] forearms in skin (short sleeves)
 * @param {boolean} [s.bareLegs=false] shins in skin (shorts)
 * @param {string[]} [s.omit] piece keys not to build ('chest', 'abdomen', 'pelvis', 'thighL', …)
 * @returns {Object<string, THREE.Mesh>}
 */
export function buildHuman(parts, d, s = {}) {
  const skin = s.skin === undefined ? SKINS.fair : s.skin;
  const top = s.top === undefined ? 0x8d93a6 : s.top;
  const sleeve = s.sleeve === undefined ? top : s.sleeve;
  const legs = s.legs === undefined ? 0x6b6555 : s.legs;
  const shoe = s.shoe === undefined ? 0x3a3129 : s.shoe;
  const chestW = s.chestW === undefined ? 0.50 : s.chestW;
  const chestD = s.chestD === undefined ? 0.25 : s.chestD;
  const waistW = s.waistW === undefined ? 0.36 : s.waistW;
  const hipW = s.hipW === undefined ? 0.38 : s.hipW;
  const armW = s.armW === undefined ? 0.115 : s.armW;
  const legW = s.legW === undefined ? 0.155 : s.legW;
  const headW = s.headW === undefined ? 0.27 : s.headW;
  const headD = s.headD === undefined ? 0.25 : s.headD;
  const handW = s.handW === undefined ? 0.135 : s.handW;
  const skip = new Set(s.omit || []);

  /** @type {Object<string, THREE.Mesh>} */
  const m = {};
  /**
   * @param {string} key @param {THREE.Object3D} joint @param {() => THREE.Mesh} make
   * @param {number} x @param {number} y @param {number} z @param {number[]} [rot]
   */
  const put = (key, joint, make, x, y, z, rot) => {
    if (skip.has(key)) return;
    m[key] = attach(joint, make(), x, y, z, rot);
  };

  // pelvis, abdomen, chest — three prisms, two visible seams
  put('pelvis', parts.hips, () => prismBox(hipW, d.pelvis + 0.06, chestD * 0.82,
    { sides: 6, top: waistW / hipW, bottom: 1 }, { color: legs }), 0, 0.01, 0);

  put('abdomen', parts.spine, () => prismBox(waistW, d.spine, chestD * 0.86,
    { bevel: 0.26, top: (chestW * 0.86) / waistW, bottom: 1 }, { color: top }), 0, d.spine * 0.5, 0);

  // the chest swells to the shoulder line, then slopes into the neck
  const chestH = d.chest + 0.02;
  const K = 1 / 0.86;
  put('chest', parts.chest, () => prismBox(chestW * 0.86, chestH, chestD,
    { bevelF: 0.2, bevelB: 0.3, rings: [[0, 1, 0.96], [0.62, K, 1.0], [1, K * 0.92, 0.80]] }, { color: top }),
  0, chestH * 0.5 - 0.02, 0);

  if (s.neck !== false) {
    put('neck', parts.neck, () => prismBox(0.11, d.neck + 0.05, 0.10, { sides: 6, top: 0.9 }, { color: skin }),
      0, 0.01, 0);
  }

  // head: a front-flat prism, narrow at the jaw, widest at the cheekbones,
  // rounded off at the crown and the back of the skull. The face is painted on.
  put('head', parts.head, () => prismBox(headW, d.head, headD, {
    bevelF: 0.10, bevelB: 0.32, anchorFront: true,
    rings: [[0, 0.78, 0.88], [0.40, 1.0, 1.0], [1, 0.88, 0.94]],
  }, { color: skin }), 0, d.head * 0.5, 0);

  if (s.ears !== false) {
    for (const sg of [-1, 1]) {
      put(`ear${sg < 0 ? 'L' : 'R'}`, parts.head, () => prismBox(0.03, 0.075, 0.055, { sides: 4, top: 0.8 },
        { color: skin }), sg * (headW * 0.5 - 0.004), d.head * 0.50, -0.015, [0, 0, sg * 0.12]);
    }
  }

  for (const side of ['L', 'R']) {
    const sg = side === 'L' ? -1 : 1;
    put(`shoulder${side}`, parts[`shoulder${side}`],
      () => prismBox(armW * 1.35, 0.12, armW * 1.3, { sides: 6, top: 0.82, bottom: 0.95 }, { color: top }),
      0, -0.03, 0);

    put(`arm${side}`, parts[`arm${side}`],
      () => prismBox(armW, d.upperArm, armW, { sides: 6, top: 1.0, bottom: 0.82 }, { color: sleeve }),
      0, -d.upperArm * 0.5, 0);

    put(`fore${side}`, parts[`fore${side}`],
      () => prismBox(armW * 0.86, d.foreArm, armW * 0.86, { sides: 6, top: 1.0, bottom: 0.84 },
        { color: s.bareArms ? skin : sleeve }),
      0, -d.foreArm * 0.5, 0);

    // MITTEN: a faceted block and a thumb. No fingers, ever.
    put(`hand${side}`, parts[`hand${side}`],
      () => prismBox(handW, d.hand, handW * 0.72, { sides: 6, top: 0.82, bottom: 0.86 }, { color: skin }),
      sg * 0.004, -d.hand * 0.5, 0.006);
    put(`thumb${side}`, parts[`hand${side}`],
      () => wedgeMesh(handW * 0.34, d.hand * 0.55, handW * 0.30, { color: skin }),
      -sg * handW * 0.16, -d.hand * 0.30, handW * 0.38, [Math.PI - 0.45, 0, 0]);

    put(`thigh${side}`, parts[`thigh${side}`],
      () => prismBox(legW, d.thigh, legW * 1.05, { sides: 6, top: 1.0, bottom: 0.86 }, { color: legs }),
      0, -d.thigh * 0.5, 0);

    put(`shin${side}`, parts[`shin${side}`],
      () => prismBox(legW * 0.84, d.shin, legW * 0.9, { sides: 6, top: 1.0, bottom: 0.82 },
        { color: s.bareLegs ? skin : legs }),
      0, -d.shin * 0.5, 0);

    put(`foot${side}`, parts[`foot${side}`],
      () => prismBox(legW * 0.92, d.foot, 0.21, { bevelF: 0.38, bevelB: 0, top: 0.9, topZ: 0.86 }, { color: shoe }),
      0, -d.foot * 0.5, 0.035);
  }

  return m;
}
