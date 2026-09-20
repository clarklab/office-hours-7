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
 *   - hands are MITTENS, one slightly tapered box each, never fingers;
 *   - limbs are tapered boxes with a visible seam at every joint;
 *   - hair is a handful of big faceted wedges;
 *   - faces are FLAT PAINTED TEXTURES on a tapered head box — a 2x2 frame atlas
 *     (neutral / talk / shocked / squint) swapped by moving `map.offset`;
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

/** Frame -> `map.offset` for the 2x2 face atlas. @type {Object<string, number[]>} */
export const FACE_FRAMES = {
  neutral: [0, 0.5],
  talk: [0.5, 0.5],
  shocked: [0, 0],
  squint: [0.5, 0],
};

/** Default face frame per animation. @type {Object<string, string>} */
const ANIM_FACE = {
  idle: 'neutral',
  walk: 'neutral',
  talk: 'talk',
  panic: 'shocked',
  point: 'neutral',
  type: 'squint',
  shrug: 'neutral',
  cheer: 'talk',
  slump: 'squint',
  sit: 'neutral',
  run: 'shocked',
  bark: 'talk',
  shake: 'squint',
  sniff: 'squint',
  zoomies: 'talk',
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
  const geo = new THREE.ConeGeometry(0.5, h, 4, 1, false);
  geo.rotateY(Math.PI / 4);
  geo.scale(w / 0.7071, 1, d / 0.7071);
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
 * Paints one 32x32 face frame at `ox, oy` of the atlas.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} ox @param {number} oy
 * @param {string} frame 'neutral'|'talk'|'shocked'|'squint'
 * @param {Object} o see {@link faceTexture}
 */
function drawFaceFrame(ctx, ox, oy, frame, o) {
  const S = 32;
  const skin = o.skin;
  const shade = o.shade;
  const dark = o.line;

  ctx.save();
  ctx.translate(ox, oy);

  // base + one shaded plane down the left cheek, the only "form" a PS1 face got
  ctx.fillStyle = skin;
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, 4, S);
  ctx.fillRect(S - 3, 0, 3, S);

  // the nose is at most one shaded polygon
  ctx.fillStyle = o.nose;
  ctx.beginPath();
  ctx.moveTo(15, 17);
  ctx.lineTo(18, 22);
  ctx.lineTo(14, 22);
  ctx.closePath();
  ctx.fill();

  const shocked = frame === 'shocked';
  const squint = frame === 'squint';

  // brow line
  ctx.fillStyle = o.brow;
  const browY = shocked ? 7 : 9;
  const browTilt = o.browTilt || 0;
  ctx.fillRect(5, browY + browTilt, 9, 2);
  ctx.fillRect(18, browY - browTilt, 9, 2);

  // BIG simple eyes — this is what reads at 384x216
  const eyeY = 13;
  if (squint) {
    ctx.fillStyle = dark;
    ctx.fillRect(5, eyeY + 2, 9, 2);
    ctx.fillRect(18, eyeY + 2, 9, 2);
  } else {
    const ew = shocked ? 9 : 8;
    const eh = shocked ? 8 : 6;
    ctx.fillStyle = o.sclera;
    blob(ctx, 5, eyeY, ew, eh);
    blob(ctx, 32 - 5 - ew, eyeY, ew, eh);
    ctx.fillStyle = dark;
    const iw = shocked ? 3 : 4;
    const ih = shocked ? 4 : 5;
    ctx.fillRect(5 + (o.gaze || 1), eyeY + 1, iw, ih);
    ctx.fillRect(32 - 5 - ew + (o.gaze || 1) + 1, eyeY + 1, iw, ih);
  }

  // mouth
  ctx.fillStyle = o.mouth;
  if (frame === 'talk') {
    blob(ctx, 12, 23, 8, 6);
  } else if (shocked) {
    blob(ctx, 14, 24, 5, 5);
  } else if (squint) {
    ctx.fillRect(12, 26, 8, 1);
  } else {
    ctx.fillRect(12, 25, 8, 2);
    if (o.smirk) ctx.fillRect(20, 24, 2, 2);
  }

  if (typeof o.extra === 'function') o.extra(ctx, frame, S);
  ctx.restore();
}

/**
 * Builds a 64x64 face texture: a 2x2 atlas of 32x32 frames laid out
 * neutral / talk on the top row and shocked / squint on the bottom. Swap frames
 * by writing `tex.offset` from {@link FACE_FRAMES} — the rig does this for you.
 *
 * @param {Object} [o]
 * @param {string} [o.skin='#c9a689'] base fill
 * @param {string} [o.shade] side-plane shade (defaults to a darker skin)
 * @param {string} [o.line='#241a18'] iris / eyeline colour
 * @param {string} [o.brow] brow bar colour
 * @param {string} [o.mouth] mouth colour
 * @param {string} [o.sclera='#e6e2dc'] eye white
 * @param {string} [o.nose] nose polygon colour
 * @param {number} [o.browTilt=0] +1 angry, -1 worried
 * @param {number} [o.gaze=1] iris offset in px
 * @param {boolean} [o.smirk=false]
 * @param {(ctx:CanvasRenderingContext2D, frame:string, size:number)=>void} [o.extra]
 *   painted last, in frame-local pixels — shades, glasses, freckles, muzzles
 * @returns {THREE.Texture}
 */
export function faceTexture(o = {}) {
  const skin = o.skin || '#c9a689';
  const cfg = {
    skin,
    shade: o.shade || shadeOf(skin, 0.82),
    line: o.line || '#241a18',
    brow: o.brow || o.line || '#241a18',
    mouth: o.mouth || '#5c3a33',
    sclera: o.sclera || '#e6e2dc',
    nose: o.nose || shadeOf(skin, 0.86),
    browTilt: o.browTilt || 0,
    gaze: o.gaze === undefined ? 1 : o.gaze,
    smirk: !!o.smirk,
    extra: o.extra,
  };
  const tex = makeTexture(64, 64, (ctx) => {
    drawFaceFrame(ctx, 0, 0, 'neutral', cfg);
    drawFaceFrame(ctx, 32, 0, 'talk', cfg);
    drawFaceFrame(ctx, 0, 32, 'shocked', cfg);
    drawFaceFrame(ctx, 32, 32, 'squint', cfg);
  });
  tex.repeat.set(0.5, 0.5);
  tex.offset.set(FACE_FRAMES.neutral[0], FACE_FRAMES.neutral[1]);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/**
 * Multiplies a `#rrggbb` string toward black.
 * @param {string} hex @param {number} k
 * @returns {string}
 */
function shadeOf(hex, k) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return `#${c.getHexString()}`;
}

/**
 * Hangs the painted face on the front of a head joint. Affine warping is on
 * (the ps1 default), which is what makes it swim as the head turns.
 * @param {THREE.Object3D} head the head joint
 * @param {THREE.Texture} tex from {@link faceTexture}
 * @param {Object} o
 * @param {number} o.w quad width
 * @param {number} o.h quad height
 * @param {number} o.y local y of the quad centre
 * @param {number} o.z local z of the quad plane
 * @returns {THREE.Mesh}
 */
export function addFace(head, tex, o) {
  const geo = new THREE.PlaneGeometry(o.w, o.h, 1, 1);
  const mesh = new THREE.Mesh(geo, ps1Material({ map: tex, color: 0xffffff, affine: true }));
  mesh.position.set(0, o.y, o.z);
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
 * Exact vertical shortening of a leg whose thigh sits at `T` radians from
 * vertical and whose shin sits at `T + S`. Poses use this to drop the hips by
 * precisely the right amount, which is why no character's feet ever sink
 * through the floor.
 * @param {number} T @param {number} S @param {Object<string,number>} d
 * @returns {number} metres
 */
function legDrop(T, S, d) {
  const straight = d.thigh + d.shin;
  return straight - (d.thigh * Math.cos(T) + d.shin * Math.cos(T + S));
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
    P.p('hips', 0, br * 0.005 * m, 0);
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
    P.r('footL', clamp(-(TL + SL) * 0.55 + 0.04, -0.5, 0.5), 0, 0);
    P.r('footR', clamp(-(TR + SR) * 0.55 + 0.04, -0.5, 0.5), 0, 0);

    // Drop the hips by exactly the amount the spread legs lose in height, so
    // the planted foot stays welded to the floor.
    const drop = (d.thigh + d.shin) * (1 - Math.cos(sw * Math.abs(s)));
    P.p('hips', 0, -drop + 0.006 * (1 + Math.cos(ph * 2)) * 0.5, 0);
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
    P.p('hips', 0.008 * f, -0.02 + 0.012 * Math.abs(Math.sin(t * 9.5)), 0);
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
    P.p('hips', 0, -0.006, 0);
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
    P.p('hips', 0, hop * 0.085 - legDrop(FWD * bend, bend * 2, d), 0);
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
    P.p('hips', 0, -legDrop(T, S, d) - 0.01, 0);
  },

  sit(P, t, c) {
    HUMAN_POSES.idle(P, t, c);
  },
};

/**
 * The seated override. Applied on top of whatever the upper body is doing, so
 * a character can sit and talk, sit and type, or sit and panic.
 * @type {Pose}
 */
export const HUMAN_SIT = (P, t, c) => {
  const d = c.dims;
  const T = -1.35;
  const S = 1.35;
  const seat = d.foot + d.shin + d.thigh * Math.cos(T);
  P.r('thighL', T, 0, 0.06);
  P.r('thighR', T, 0, -0.06);
  P.r('shinL', S, 0, 0);
  P.r('shinR', S, 0, 0);
  P.r('footL', 0.06, 0, 0);
  P.r('footR', 0.06, 0, 0);
  P.p('hips', 0, seat - (d.foot + d.shin + d.thigh), -0.26);
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
 * @property {(frame:string|null)=>void} setFace additive: force a face frame
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
 * @property {Object<string,string>} [animFace] anim -> face frame overrides
 * @property {Object<string,number>} [style] `motion`, `armSwing`, `faceRate`
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
  let faceOverride = null;
  let lastFrame = '';

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
    faceOverride = frame && FACE_FRAMES[frame] ? frame : null;
  }

  /**
   * @param {string} frame
   * @returns {void}
   */
  function applyFaceFrame(frame) {
    if (!faceTex || frame === lastFrame) return;
    const uv = FACE_FRAMES[frame] || FACE_FRAMES.neutral;
    faceTex.offset.set(uv[0], uv[1]);
    lastFrame = frame;
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

    if (faceTex) {
      let frame = faceOverride;
      if (!frame) {
        const active = fade < 0.5 ? prevName : animName;
        frame = animFace[active] || 'neutral';
        if (frame === 'talk') {
          frame = Math.floor(clock * style.faceRate) % 2 === 0 ? 'talk' : 'neutral';
        }
      }
      applyFaceFrame(frame);
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
    prop: spec.prop || null,
    anims: () => Object.keys(poses),
    triangles,
    dispose,
  };
  ctx.actor = actor;
  group.userData.actor = actor;

  // Settle into the rest pose so the very first rendered frame is already posed.
  applyPose(0);
  if (faceTex) applyFaceFrame('neutral');

  return actor;
}

/* ------------------------------------------------------------------------- *
 * Shared body construction
 * ------------------------------------------------------------------------- */

/**
 * Hangs the standard human chunk set on a joint tree: pelvis, abdomen and chest
 * slabs, a tapered head, tapered upper/lower arms with MITTEN hands, tapered
 * thighs and shins, and shoe boxes. Roughly 250 triangles, leaving each
 * character 50-650 for their silhouette hook.
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
 * @param {boolean} [s.bareArms=false] forearms in skin (short sleeves)
 * @param {boolean} [s.bareLegs=false] shins in skin (shorts)
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

  /** @type {Object<string, THREE.Mesh>} */
  const m = {};

  // pelvis
  m.pelvis = attach(parts.hips, taperedBox(hipW, d.pelvis + 0.06, chestD * 0.82,
    { top: waistW / hipW, bottom: 1 }, { color: legs }), 0, 0.01, 0);

  // abdomen slab, then the chest slab — two chunks, one visible seam
  m.abdomen = attach(parts.spine, taperedBox(waistW, d.spine, chestD * 0.86,
    { top: (chestW * 0.86) / waistW, bottom: 1 }, { color: top }), 0, d.spine * 0.5, 0);

  const chestH = d.chest + 0.02;
  m.chest = attach(parts.chest, taperedBox(chestW * 0.86, chestH, chestD,
    { top: chestW / (chestW * 0.86), bottom: 1 }, { color: top }),
  0, chestH * 0.5 - 0.02, 0);

  if (s.neck !== false) {
    m.neck = attach(parts.neck, taperedBox(0.11, d.neck + 0.05, 0.10, { top: 0.9 }, { color: skin }), 0, 0.01, 0);
  }

  // head: a slightly tapered box, and nothing else. The face is painted on.
  // The head tapers on X only: the front stays a flat vertical plane so the
  // painted face sits flush against it instead of floating off the brow.
  m.head = attach(parts.head, taperedBox(headW, d.head, headD,
    { top: 0.86, bottom: 1.0, topZ: 0.99, bottomZ: 1 }, { color: skin }), 0, d.head * 0.5, 0);

  for (const side of ['L', 'R']) {
    const sg = side === 'L' ? -1 : 1;
    m[`shoulder${side}`] = attach(parts[`shoulder${side}`],
      taperedBox(armW * 1.35, 0.12, armW * 1.3, { top: 1, bottom: 0.85 }, { color: top }), 0, -0.03, 0);

    m[`arm${side}`] = attach(parts[`arm${side}`],
      taperedBox(armW, d.upperArm, armW, { top: 1.0, bottom: 0.82 }, { color: sleeve }),
      0, -d.upperArm * 0.5, 0);

    m[`fore${side}`] = attach(parts[`fore${side}`],
      taperedBox(armW * 0.86, d.foreArm, armW * 0.86, { top: 1.0, bottom: 0.84 },
        { color: s.bareArms ? skin : sleeve }),
      0, -d.foreArm * 0.5, 0);

    // MITTEN. One box. No fingers, ever.
    m[`hand${side}`] = attach(parts[`hand${side}`],
      taperedBox(handW, d.hand, handW * 0.72, { top: 0.82, bottom: 0.86 }, { color: skin }),
      sg * 0.004, -d.hand * 0.5, 0.006);

    m[`thigh${side}`] = attach(parts[`thigh${side}`],
      taperedBox(legW, d.thigh, legW * 1.05, { top: 1.0, bottom: 0.86 }, { color: legs }),
      0, -d.thigh * 0.5, 0);

    m[`shin${side}`] = attach(parts[`shin${side}`],
      taperedBox(legW * 0.84, d.shin, legW * 0.9, { top: 1.0, bottom: 0.82 },
        { color: s.bareLegs ? skin : legs }),
      0, -d.shin * 0.5, 0);

    m[`foot${side}`] = attach(parts[`foot${side}`],
      taperedBox(legW * 0.92, d.foot, 0.21, { top: 0.9, bottom: 1, topZ: 0.86, bottomZ: 1 }, { color: shoe }),
      0, -d.foot * 0.5, 0.035);
  }

  return m;
}
