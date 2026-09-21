/**
 * OFFICE HOURS VII — the lockup as real geometry.
 *
 * The flat version in `logo.js` draws a fine line-art mark into a 2D canvas.
 * This one is the 1997 box-shifter treatment instead: heavy extruded caps with
 * a chiselled bevel, a brushed-metal gradient down the face, a gold roman
 * numeral and a red rule under the second line. It is built as actual meshes
 * and dropped into the scene, so the PS1 pipeline treats it like everything
 * else — the vertices snap to the 384x216 grid, the faces swim, the whole thing
 * dithers down to 15-bit. A flat overlay cannot do any of that.
 *
 * NO FONT FILES. Every glyph below is a polygon, the same rule the rest of the
 * project runs on. They are drawn on a unit box: x from 0 to the glyph's
 * advance, y from 0 at the baseline to 1 at the cap height.
 */

import * as THREE from 'three';
import { ps1Material, makeTexture, VIRTUAL_W, VIRTUAL_H } from '../core/ps1.js';

/** Extrusion depth, in cap heights. */
const DEPTH = 0.34;
/** Chisel size, in cap heights. Small — a big bevel reads as mush at 384x216. */
const BEVEL = 0.05;
/** Space between glyphs, in cap heights. */
const TRACK = 0.10;

/**
 * The block alphabet.
 *
 * `w` is the advance. `o` is the outer contour. `h` is an optional list of
 * holes. Corners are square or chamfered rather than curved: a curve costs
 * triangles and, at this resolution, renders as a ragged stair anyway.
 *
 * @type {Object<string, {w:number, o:number[][], h?:number[][][]}>}
 */
const GLYPHS = {
  O: {
    w: 1.0,
    o: [[0.18, 0], [0.82, 0], [1, 0.18], [1, 0.82], [0.82, 1], [0.18, 1], [0, 0.82], [0, 0.18]],
    h: [[[0.30, 0.22], [0.70, 0.22], [0.78, 0.30], [0.78, 0.70], [0.70, 0.78], [0.30, 0.78], [0.22, 0.70], [0.22, 0.30]]],
  },
  F: {
    w: 0.90,
    o: [[0, 0], [0.26, 0], [0.26, 0.40], [0.72, 0.40], [0.72, 0.62], [0.26, 0.62], [0.26, 0.78], [0.88, 0.78], [0.88, 1], [0, 1]],
  },
  I: {
    w: 0.26,
    o: [[0, 0], [0.26, 0], [0.26, 1], [0, 1]],
  },
  C: {
    w: 1.0,
    o: [[0.18, 0], [0.82, 0], [1.0, 0.20], [1.0, 0.30], [0.74, 0.30], [0.70, 0.24], [0.30, 0.24],
      [0.24, 0.30], [0.24, 0.70], [0.30, 0.76], [0.70, 0.76], [0.74, 0.70], [1.0, 0.70], [1.0, 0.80],
      [0.82, 1.0], [0.18, 1.0], [0, 0.82], [0, 0.18]],
  },
  E: {
    w: 0.90,
    o: [[0, 0], [0.88, 0], [0.88, 0.22], [0.26, 0.22], [0.26, 0.40], [0.72, 0.40], [0.72, 0.62],
      [0.26, 0.62], [0.26, 0.78], [0.88, 0.78], [0.88, 1], [0, 1]],
  },
  H: {
    w: 0.90,
    o: [[0, 0], [0.26, 0], [0.26, 0.40], [0.62, 0.40], [0.62, 0], [0.88, 0], [0.88, 1], [0.62, 1],
      [0.62, 0.62], [0.26, 0.62], [0.26, 1], [0, 1]],
  },
  U: {
    w: 0.92,
    o: [[0, 1], [0, 0.18], [0.18, 0], [0.74, 0], [0.92, 0.18], [0.92, 1], [0.66, 1], [0.66, 0.26],
      [0.60, 0.22], [0.32, 0.22], [0.26, 0.26], [0.26, 1]],
  },
  R: {
    w: 1.0,
    o: [[0, 0], [0.26, 0], [0.26, 0.40], [0.44, 0.40], [0.70, 0], [0.98, 0], [0.70, 0.44],
      [0.84, 0.52], [0.84, 0.90], [0.72, 1.0], [0, 1.0]],
    h: [[[0.26, 0.58], [0.58, 0.58], [0.58, 0.80], [0.26, 0.80]]],
  },
  S: {
    w: 0.92,
    o: [[0, 0], [0.92, 0], [0.92, 0.60], [0.26, 0.60], [0.26, 0.78], [0.92, 0.78], [0.92, 1.0],
      [0, 1.0], [0, 0.40], [0.66, 0.40], [0.66, 0.22], [0, 0.22]],
  },
  V: {
    w: 0.92,
    o: [[0, 1.0], [0.34, 0], [0.58, 0], [0.92, 1.0], [0.66, 1.0], [0.46, 0.30], [0.26, 1.0]],
  },
  /** The numeral's I is serifed, where the wordmark's is a plain bar. */
  J: {
    w: 0.44,
    o: [[0, 0], [0.44, 0], [0.44, 0.14], [0.30, 0.14], [0.30, 0.86], [0.44, 0.86], [0.44, 1],
      [0, 1], [0, 0.86], [0.14, 0.86], [0.14, 0.14], [0, 0.14]],
  },
};

/**
 * A glyph as a THREE.Shape, already translated to `dx` so that a whole word
 * shares one coordinate space. That matters: ExtrudeGeometry maps front-face
 * UVs straight from shape coordinates, so laying the letters out before
 * extruding is what lets one gradient run across the entire word instead of
 * restarting on every letter.
 *
 * @param {string} ch
 * @param {number} dx
 * @returns {THREE.Shape|null}
 */
function glyphShape(ch, dx) {
  const g = GLYPHS[ch];
  if (!g) return null;
  const shape = new THREE.Shape();
  g.o.forEach(([x, y], i) => (i ? shape.lineTo(x + dx, y) : shape.moveTo(x + dx, y)));
  shape.closePath();
  for (const hole of g.h || []) {
    const path = new THREE.Path();
    hole.forEach(([x, y], i) => (i ? path.lineTo(x + dx, y) : path.moveTo(x + dx, y)));
    path.closePath();
    shape.holes.push(path);
  }
  return shape;
}

/** @param {string} text @returns {number} advance width of `text` in cap heights */
export function wordWidth(text) {
  let w = 0;
  for (const ch of text) w += (GLYPHS[ch] ? GLYPHS[ch].w : 0.5) + TRACK;
  return Math.max(0, w - TRACK);
}

/**
 * A vertical metal gradient, 1px wide. The band order is the whole trick: a
 * bright crown, a hard mid-tone break just above centre, then a second bounce
 * near the base. That break is what reads as polished metal rather than a
 * plastic fade.
 *
 * @param {string[]} stops `#rrggbb` from top to bottom
 * @returns {THREE.Texture}
 */
function metalTexture(stops) {
  return makeTexture(1, 64, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

/** Cold steel with a blue cast, for OFFICE HOURS. */
const SILVER = ['#f2f4ff', '#b9c2e2', '#7f8cb8', '#e8ecff', '#5d6894', '#39406a', '#9aa4cc'];
/** Warm gold for the numeral. */
const GOLD = ['#fff4c9', '#f0cf6a', '#c79a2c', '#fff0b0', '#a87a1c', '#6d4c0e', '#e0b845'];

/**
 * Extrudes one word into a mesh.
 *
 * The front face gets the gradient, the bevel and sides get a flat dark tone —
 * two groups, which is exactly what ExtrudeGeometry emits (0 = caps, 1 = walls).
 *
 * @param {string} text
 * @param {Object} o
 * @param {string[]} o.stops gradient bands for the face
 * @param {number} o.side colour of the extruded walls
 * @param {number} [o.depth]
 * @returns {{mesh:THREE.Mesh, width:number, dispose:()=>void}}
 */
function extrudeWord(text, o) {
  const shapes = [];
  let dx = 0;
  for (const ch of text) {
    const s = glyphShape(ch, dx);
    if (s) shapes.push(s);
    dx += (GLYPHS[ch] ? GLYPHS[ch].w : 0.5) + TRACK;
  }
  const width = Math.max(0, dx - TRACK);

  const geo = new THREE.ExtrudeGeometry(shapes, {
    depth: o.depth === undefined ? DEPTH : o.depth,
    bevelEnabled: true,
    bevelThickness: BEVEL,
    bevelSize: BEVEL,
    bevelSegments: 1,
    curveSegments: 1,
    steps: 1,
  });

  // The gradient is mapped across the word's own bounding box. Front-face UVs
  // come through as raw shape coordinates, so this is the transform that turns
  // them into 0..1 — and it only works because ps1.js honours texture.matrix.
  const tex = metalTexture(o.stops);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(1 / Math.max(width, 0.0001), -1);
  tex.offset.set(0, 1);

  const over = o.overlay ? { depthTest: false, depthWrite: false, cache: false } : {};
  const face = ps1Material(Object.assign({ map: tex, unlit: true, jitter: 1 }, over));
  const wall = ps1Material(Object.assign({ color: o.side, unlit: true, jitter: 1 }, over));

  const mesh = new THREE.Mesh(geo, [face, wall]);
  // Walls before faces, so the extrusion never punches through its own front.
  if (o.overlay) mesh.renderOrder = 900;
  mesh.name = `logo3d:${text}`;
  return {
    mesh,
    width,
    dispose: () => { geo.dispose(); tex.dispose(); face.dispose(); wall.dispose(); },
  };
}

/**
 * Builds the full lockup, centred on the origin, one cap height per line and
 * facing +Z.
 *
 * Layout follows the reference: OFFICE on top, HOURS beneath it, a red rule
 * under HOURS, and the numeral set to the right at a larger size so it reads as
 * a separate mark rather than a fourth word.
 *
 * @param {Object} [o]
 * @param {number} [o.scale=1] cap height in world units
 * @param {boolean} [o.overlay=false] draw over the depth buffer, for a title
 *   card that must stay readable wherever the episode's camera happens to be
 * @returns {{group:THREE.Group, width:number, height:number, dispose:()=>void}}
 */
export function createLogo3D(o = {}) {
  const scale = o.scale === undefined ? 1 : o.scale;
  const overlay = !!o.overlay;
  const group = new THREE.Group();
  group.name = 'logo3d';
  const parts = [];

  const office = extrudeWord('OFFICE', { stops: SILVER, side: 0x1a2149, overlay });
  const hours = extrudeWord('HOURS', { stops: SILVER, side: 0x1a2149, overlay });
  parts.push(office, hours);

  // HOURS is set slightly larger so the two lines end near the same x, the way
  // the reference stacks them.
  const hoursScale = 1.18;
  const lineGap = 0.16;

  office.mesh.position.set(0, 1 + lineGap, 0);
  hours.mesh.scale.setScalar(hoursScale);
  hours.mesh.position.set(0, 0, 0);

  const officeW = office.width;
  const hoursW = hours.width * hoursScale;
  const wordW = Math.max(officeW, hoursW);

  // Red rule under HOURS, inset from both ends like the reference's.
  const barH = 0.12;
  const barGeo = new THREE.BoxGeometry(hoursW * 0.92, barH, DEPTH * 0.7);
  const barMat = ps1Material(Object.assign({ color: 0xc8202a, unlit: true, jitter: 1 },
    overlay ? { depthTest: false, depthWrite: false, cache: false } : {}));
  const bar = new THREE.Mesh(barGeo, barMat);
  bar.position.set(hoursW * 0.46, -barH * 0.9, DEPTH * 0.2);
  bar.name = 'logo3d:rule';
  if (overlay) bar.renderOrder = 899;
  group.add(bar);

  const numeral = extrudeWord('VJJ', { stops: GOLD, side: 0x4a3208, depth: DEPTH * 1.1, overlay });
  parts.push(numeral);
  const numScale = 1.55;
  numeral.mesh.scale.setScalar(numScale);
  numeral.mesh.position.set(wordW + 0.24, -0.10, 0);

  group.add(office.mesh, hours.mesh, numeral.mesh);

  // Centre the whole lockup on its own bounds so callers can just place it.
  const box = new THREE.Box3().setFromObject(group);
  const size = new THREE.Vector3();
  const mid = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(mid);
  group.children.forEach((c) => c.position.sub(mid));

  group.scale.setScalar(scale);

  return {
    group,
    width: size.x * scale,
    height: size.y * scale,
    dispose: () => {
      parts.forEach((p) => p.dispose());
      barGeo.dispose();
      barMat.dispose();
    },
  };
}

/**
 * Positions a built lockup in front of `camera`, sized to the 384x216 frame.
 *
 * Shared by the episode title card and the brand poster so the lockup is framed
 * identically in both — the one place that knows the aspect is the PS1 buffer's
 * rather than the letterboxed canvas's.
 *
 * @param {{group:THREE.Group, width:number, height:number}} built
 * @param {THREE.PerspectiveCamera} camera
 * @param {Object} [o]
 * @param {number} [o.dist=3.2] stand-off in world units
 * @param {number} [o.fill=0.70] fraction of frame width to occupy
 * @param {number} [o.push=0] pulled this much closer than `dist`
 * @param {number} [o.yaw=-5] degrees, so the extruded walls read
 * @param {number} [o.pitch=5] degrees
 * @returns {void}
 */
export function frameLockup(built, camera, o = {}) {
  const dist = o.dist === undefined ? 3.2 : o.dist;
  const fill = o.fill === undefined ? 0.70 : o.fill;
  const push = o.push || 0;
  const yaw = (o.yaw === undefined ? -5 : o.yaw) * Math.PI / 180;
  const pitch = (o.pitch === undefined ? 5 : o.pitch) * Math.PI / 180;

  const halfH = Math.tan((camera.fov * Math.PI / 180) / 2) * dist;
  const frameH = halfH * 2;
  const frameW = frameH * (VIRTUAL_W / VIRTUAL_H);
  const k = Math.min(
    (frameW * fill) / Math.max(built.width, 0.0001),
    (frameH * (fill * 0.66)) / Math.max(built.height, 0.0001),
  );
  built.group.scale.setScalar(k);

  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  built.group.position.copy(camera.position).add(fwd.multiplyScalar(dist - push));
  built.group.quaternion.copy(camera.quaternion);
  built.group.rotateY(yaw);
  built.group.rotateX(pitch);
}
