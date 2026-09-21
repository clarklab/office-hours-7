/**
 * OFFICE HOURS — reusable office furniture.
 *
 * Every factory in here returns a fresh `THREE.Group` whose origin sits on the
 * FLOOR, centred in X and Z, facing **+Z** unless the doc comment says
 * otherwise. `office.js` is then only a layout file: position, rotate, done.
 *
 * Rules this module obeys, because the render pipeline depends on them:
 *  - all materials come from `ps1Material()`
 *  - all textures come from `makeTexture()`
 *  - geometry is cached and shared aggressively (the set is ~3k triangles)
 *  - anything whose material is animated at runtime is built with `cache:false`
 *    so mutating its uniforms cannot leak into another prop
 *
 * @module sets/props
 */

import * as THREE from 'three';
import { ps1Material, makeTexture } from '/js/core/ps1.js';

/* ------------------------------------------------------------------ palette */

/**
 * The office palette. Desaturated, slightly muddy, low contrast — the
 * fluorescent-lit beige-and-teal of a business park (SPEC 10.4/10.5).
 * Saturated colour is reserved for the UI layer.
 * @type {Object<string, number>}
 */
export const PALETTE = {
  carpet: 0x50554e,
  carpetDark: 0x3c413c,
  wall: 0xa49b88,
  wallShade: 0x8d8574,
  dado: 0x6c6456,
  ceiling: 0xb4b8b0,
  panelLit: 0xe8f0e4,
  beige: 0xcabfa0,
  beigeDark: 0x9e9478,
  deskTop: 0x8c7c62,
  deskEdge: 0x5d5243,
  metal: 0x949a9e,
  metalDark: 0x5c6267,
  plastic: 0x33383e,
  fabric: 0x475462,
  fabricWorn: 0x3a4550,
  screenGlow: 0xb8d8c4,
  white: 0xd6dad3,
  paper: 0xe2e2d8,
  leaf: 0x5f7f48,
  leafDead: 0x7a6538,
  soil: 0x4a3c30,
  munchGreen: 0x2f7d5e,
  munchNavy: 0x1d2a4a,
  warn: 0x9a3b32,
  amber: 0xb98a3a,
};

/* --------------------------------------------------------- geometry cache */

/** @type {Map<string, THREE.BufferGeometry>} */
const GEO = new Map();

/**
 * Cached `BoxGeometry`. Identical dimensions share one buffer.
 * @param {number} w @param {number} h @param {number} d
 * @param {number} [sw=1] @param {number} [sh=1] @param {number} [sd=1]
 * @returns {THREE.BoxGeometry}
 */
function boxGeo(w, h, d, sw = 1, sh = 1, sd = 1) {
  const k = `b${w},${h},${d},${sw},${sh},${sd}`;
  let g = GEO.get(k);
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d, sw, sh, sd);
    GEO.set(k, g);
  }
  return g;
}

/**
 * Cached `PlaneGeometry`.
 * @param {number} w @param {number} h @param {number} [sw=1] @param {number} [sh=1]
 * @returns {THREE.PlaneGeometry}
 */
function planeGeo(w, h, sw = 1, sh = 1) {
  const k = `p${w},${h},${sw},${sh}`;
  let g = GEO.get(k);
  if (!g) {
    g = new THREE.PlaneGeometry(w, h, sw, sh);
    GEO.set(k, g);
  }
  return g;
}

/**
 * Cached `CylinderGeometry` (low segment counts only, please).
 * @param {number} rt @param {number} rb @param {number} h @param {number} [seg=6]
 * @param {boolean} [open=false]
 * @returns {THREE.CylinderGeometry}
 */
function cylGeo(rt, rb, h, seg = 6, open = false) {
  const k = `c${rt},${rb},${h},${seg},${open ? 1 : 0}`;
  let g = GEO.get(k);
  if (!g) {
    g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
    GEO.set(k, g);
  }
  return g;
}

/* ------------------------------------------------------------ mesh helpers */

/**
 * A box mesh with a PS1 material, positioned by its centre.
 * @param {number} w @param {number} h @param {number} d
 * @param {Object} matOpts options forwarded to {@link ps1Material}
 * @param {number} [x=0] @param {number} [y=0] @param {number} [z=0]
 * @returns {THREE.Mesh}
 */
export function boxMesh(w, h, d, matOpts, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(boxGeo(w, h, d), ps1Material(matOpts));
  m.position.set(x, y, z);
  return m;
}

/**
 * A flat quad with a PS1 material. Faces +Z before rotation.
 * @param {number} w @param {number} h
 * @param {Object} matOpts options forwarded to {@link ps1Material}
 * @param {number} [x=0] @param {number} [y=0] @param {number} [z=0]
 * @returns {THREE.Mesh}
 */
export function planeMesh(w, h, matOpts, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(planeGeo(w, h), ps1Material(matOpts));
  m.position.set(x, y, z);
  return m;
}

/**
 * A low-segment cylinder with a PS1 material, positioned by its centre.
 * @param {number} rt top radius @param {number} rb bottom radius
 * @param {number} h @param {number} seg radial segments (keep <= 8)
 * @param {Object} matOpts options forwarded to {@link ps1Material}
 * @param {number} [x=0] @param {number} [y=0] @param {number} [z=0]
 * @returns {THREE.Mesh}
 */
export function cylMesh(rt, rb, h, seg, matOpts, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(cylGeo(rt, rb, h, seg), ps1Material(matOpts));
  m.position.set(x, y, z);
  return m;
}

/* ----------------------------------------------------------- tiny 2D utils */

/**
 * Fills a rect. Saves a lot of noise in the texture painters.
 * @param {CanvasRenderingContext2D} c @param {string} col
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @returns {void}
 */
function rect(c, col, x, y, w, h) {
  c.fillStyle = col;
  c.fillRect(x, y, w, h);
}

/**
 * Deterministic 0..1 noise so textures are identical every run.
 * @param {number} i
 * @returns {number}
 */
function rnd(i) {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Centred pixel-ish caps text.
 * @param {CanvasRenderingContext2D} c @param {string} text @param {number} x
 * @param {number} y @param {number} size @param {string} col
 * @param {string} [weight='bold'] @param {string} [align='center']
 * @returns {void}
 */
function caps(c, text, x, y, size, col, weight = 'bold', align = 'center') {
  c.font = `${weight} ${size}px ui-monospace, 'Courier New', monospace`;
  c.textAlign = /** @type {CanvasTextAlign} */ (align);
  c.textBaseline = 'middle';
  c.fillStyle = col;
  c.fillText(text, x, y);
}

/* --------------------------------------------------------------- textures */

/** Lazily-built shared textures. @type {Object<string, THREE.Texture>} */
const TEX = {};

/**
 * Worn commercial carpet tile: mottled grey-green with visible tile seams.
 * Tiles seamlessly; set `.repeat` on the geometry UVs, not the texture.
 * @returns {THREE.Texture}
 */
export function carpetTexture() {
  if (TEX.carpet) return TEX.carpet;
  TEX.carpet = makeTexture(32, 32, (c, w, h) => {
    rect(c, '#4b504a', 0, 0, w, h);
    for (let i = 0; i < 420; i++) {
      const x = (rnd(i) * w) | 0;
      const y = (rnd(i + 900) * h) | 0;
      const v = rnd(i + 55);
      rect(c, v > 0.72 ? '#5b6157' : v > 0.4 ? '#44493f' : '#545a4f', x, y, 1, 1);
    }
    // tile seams — quarter texture, so 4 tiles per repeat
    rect(c, '#3b403a', 0, 0, w, 1);
    rect(c, '#3b403a', 0, 16, w, 1);
    rect(c, '#3b403a', 0, 0, 1, h);
    rect(c, '#3b403a', 16, 0, 1, h);
  });
  return TEX.carpet;
}

/**
 * Perforated mineral-fibre ceiling tile with grid rails.
 * @returns {THREE.Texture}
 */
export function ceilingTexture() {
  if (TEX.ceiling) return TEX.ceiling;
  TEX.ceiling = makeTexture(32, 32, (c, w, h) => {
    rect(c, '#b6b9b0', 0, 0, w, h);
    for (let i = 0; i < 150; i++) {
      rect(c, '#a4a79e', (rnd(i + 7) * w) | 0, (rnd(i + 401) * h) | 0, 1, 1);
    }
    rect(c, '#8f938c', 0, 0, w, 1);
    rect(c, '#8f938c', 0, 0, 1, h);
    rect(c, '#c6c9c1', 0, 1, w, 1);
    rect(c, '#c6c9c1', 1, 0, 1, h);
  });
  return TEX.ceiling;
}

/**
 * Painted drywall with a faint roller texture and a scuff or two.
 * @returns {THREE.Texture}
 */
export function wallTexture() {
  if (TEX.wall) return TEX.wall;
  TEX.wall = makeTexture(32, 32, (c, w, h) => {
    rect(c, '#a69d8a', 0, 0, w, h);
    for (let i = 0; i < 200; i++) {
      const v = rnd(i + 31);
      rect(c, v > 0.6 ? '#ada494' : '#9d947f', (rnd(i) * w) | 0, (rnd(i + 77) * h) | 0, 1, 1);
    }
    rect(c, '#8f8674', 5, 22, 6, 1);
    rect(c, '#8f8674', 21, 9, 4, 1);
  });
  return TEX.wall;
}

/**
 * A CRT terminal screen: rows of unreadable monospace on a dark green field.
 * Rows repeat every 8px so the office can scroll it by sliding the quad's UVs.
 * @param {number} [seed=1] changes the pseudo-text
 * @returns {THREE.Texture}
 */
export function screenTexture(seed = 1) {
  const key = `screen${seed}`;
  if (TEX[key]) return TEX[key];
  TEX[key] = makeTexture(64, 64, (c, w, h) => {
    rect(c, '#101c16', 0, 0, w, h);
    for (let row = 0; row < 8; row++) {
      const y = row * 8 + 2;
      let x = 3;
      const n = 2 + ((rnd(row * 3 + seed) * 4) | 0);
      for (let i = 0; i < n; i++) {
        const len = 3 + ((rnd(row * 13 + i + seed * 5) * 12) | 0);
        rect(c, rnd(row + i + seed) > 0.78 ? '#9fe8b4' : '#4f9a68', x, y, len, 3);
        x += len + 3;
        if (x > w - 6) break;
      }
    }
    // a scanline wash so it reads as a CRT even at 64px
    for (let y = 1; y < h; y += 2) rect(c, 'rgba(0,0,0,0.22)', 0, y, w, 1);
  });
  return TEX[key];
}

/**
 * The burn chart. A hockey stick pointing decisively the wrong way.
 * @returns {THREE.Texture}
 */
export function burnChartTexture() {
  if (TEX.burn) return TEX.burn;
  TEX.burn = makeTexture(128, 96, (c, w, h) => {
    rect(c, '#e6e7e1', 0, 0, w, h);
    for (let i = 0; i < 120; i++) {
      rect(c, 'rgba(120,125,120,0.16)', (rnd(i) * w) | 0, (rnd(i + 12) * h) | 0, 2, 1);
    }
    // axes
    rect(c, '#2b2f33', 12, 10, 1, 72);
    rect(c, '#2b2f33', 12, 82, 104, 1);
    // the line: a hopeful little climb, then the floor
    c.strokeStyle = '#9c332c';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(14, 60);
    c.lineTo(34, 52);
    c.lineTo(52, 44);
    c.lineTo(66, 38);
    c.lineTo(78, 62);
    c.lineTo(92, 78);
    c.lineTo(112, 88);
    c.stroke();
    // arrowhead, straight down
    c.fillStyle = '#9c332c';
    c.beginPath();
    c.moveTo(112, 94);
    c.lineTo(106, 82);
    c.lineTo(118, 82);
    c.closePath();
    c.fill();
    caps(c, 'RUNWAY', 14, 6, 10, '#2b2f33', 'bold', 'left');
    caps(c, '11 DAYS', 120, 6, 10, '#9c332c', 'bold', 'right');
    caps(c, 'Q3', 16, 90, 8, '#5b6066', 'bold', 'left');
    caps(c, 'NOW', 108, 90, 8, '#5b6066', 'bold', 'left');
    // a crossed-out earlier number
    caps(c, '$4.2M', 64, 20, 9, '#5b6066', 'bold', 'left');
    rect(c, '#5b6066', 62, 20, 30, 1);
  });
  return TEX.burn;
}

/**
 * Generic whiteboard scrawl for the bullpen board: boxes, arrows, a word.
 * @returns {THREE.Texture}
 */
export function whiteboardScrawlTexture() {
  if (TEX.scrawl) return TEX.scrawl;
  TEX.scrawl = makeTexture(128, 96, (c, w, h) => {
    rect(c, '#e8e9e3', 0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      rect(c, 'rgba(110,120,115,0.13)', (rnd(i + 3) * w) | 0, (rnd(i + 44) * h) | 0, 3, 1);
    }
    c.strokeStyle = '#2f5aa0';
    c.lineWidth = 2;
    c.strokeRect(10, 20, 30, 18);
    c.strokeRect(50, 20, 30, 18);
    c.strokeRect(90, 20, 28, 18);
    c.beginPath();
    c.moveTo(40, 29); c.lineTo(50, 29);
    c.moveTo(80, 29); c.lineTo(90, 29);
    c.stroke();
    caps(c, 'USERS', 25, 29, 8, '#2f5aa0');
    caps(c, '???', 65, 29, 8, '#2f5aa0');
    caps(c, 'MUNCH', 104, 29, 8, '#2f5aa0');
    caps(c, 'THE EVERYTHING LAYER', 8, 10, 9, '#3d4247', 'bold', 'left');
    c.strokeStyle = '#8c3a30';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(12, 60); c.lineTo(48, 52); c.lineTo(78, 74); c.lineTo(116, 86);
    c.stroke();
    caps(c, 'DO NOT ERASE', 8, 90, 9, '#8c3a30', 'bold', 'left');
  });
  return TEX.scrawl;
}

/**
 * The MUNCH, Inc. corporate mark. Deliberately ugly: a bevelled green blob
 * with a bite taken out of it, a swoosh, a gradient wordmark and a tagline
 * nobody can explain.
 * This is NOT the show logo (SPEC 11.3).
 * @returns {THREE.Texture}
 */
export function munchLogoTexture() {
  if (TEX.munch) return TEX.munch;
  TEX.munch = makeTexture(128, 64, (c, w, h) => {
    rect(c, '#dfdcd2', 0, 0, w, h);
    rect(c, '#cfccc0', 0, h - 4, w, 4);
    // the blob, with a highlight
    c.fillStyle = '#2f7d5e';
    c.beginPath();
    c.arc(22, 28, 15, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#4fae84';
    c.beginPath();
    c.ellipse(18, 23, 6, 8, -0.5, 0, Math.PI * 2);
    c.fill();
    // ...and the bite out of it: three scallops punched from the top right
    c.fillStyle = '#dfdcd2';
    for (const [bx, by] of [[33, 15], [37, 23], [35, 31]]) {
      c.beginPath();
      c.arc(bx, by, 5, 0, Math.PI * 2);
      c.fill();
    }
    // obligatory swoosh
    c.strokeStyle = '#8fc9a8';
    c.lineWidth = 3;
    c.beginPath();
    c.arc(22, 30, 18, Math.PI * 1.1, Math.PI * 1.85);
    c.stroke();
    // wordmark with a hard metallic band, badly
    const g = c.createLinearGradient(0, 14, 0, 40);
    g.addColorStop(0, '#39507f');
    g.addColorStop(0.5, '#1d2a4a');
    g.addColorStop(0.52, '#4d6699');
    g.addColorStop(1, '#1d2a4a');
    c.fillStyle = '#9aa2b0';
    c.font = 'bold 22px Arial, Helvetica, sans-serif';
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillText('MUNCH', 45, 27);
    c.fillStyle = g;
    c.fillText('MUNCH', 44, 26);
    caps(c, 'THE EVERYTHING LAYER', 44, 43, 7, '#5d6470', 'bold', 'left');
    caps(c, 'INC.', 44, 52, 7, '#8b9199', 'bold', 'left');
  });
  return TEX.munch;
}

/**
 * Flat, slightly painterly PS1 pre-rendered cityscape for the window view.
 * Overcast, hazy, a business park that has seen better quarters.
 * @returns {THREE.Texture}
 */
export function cityTexture() {
  if (TEX.city) return TEX.city;
  TEX.city = makeTexture(128, 64, (c, w, h) => {
    const sky = c.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#8fa3b8');
    sky.addColorStop(0.55, '#c3cbd2');
    sky.addColorStop(1, '#d9d9d2');
    c.fillStyle = sky;
    c.fillRect(0, 0, w, h);
    // far layer
    for (let i = 0; i < 14; i++) {
      const bw = 6 + ((rnd(i * 5) * 12) | 0);
      const bh = 8 + ((rnd(i * 5 + 2) * 18) | 0);
      rect(c, '#9aa7b2', i * 9.4, h - 18 - bh, bw, bh + 18);
    }
    // mid layer
    for (let i = 0; i < 9; i++) {
      const x = i * 14 + ((rnd(i + 60) * 5) | 0);
      const bw = 9 + ((rnd(i + 30) * 8) | 0);
      const bh = 14 + ((rnd(i + 31) * 22) | 0);
      rect(c, '#7d8794', x, h - 12 - bh, bw, bh + 12);
      for (let wy = 0; wy < bh - 4; wy += 4) {
        for (let wx = 1; wx < bw - 1; wx += 3) {
          if (rnd(i * 97 + wy * 7 + wx) > 0.62) {
            rect(c, rnd(i + wy + wx) > 0.7 ? '#d8d2a6' : '#69737f', x + wx, h - 12 - bh + wy + 2, 1, 2);
          }
        }
      }
    }
    // the sad low-rise business park in front
    rect(c, '#5f6771', 0, h - 12, w, 12);
    for (let i = 0; i < 6; i++) {
      rect(c, '#535b64', i * 22 + 2, h - 18, 16, 6);
    }
    // haze band
    rect(c, 'rgba(210,214,216,0.30)', 0, h - 22, w, 8);
    for (let i = 0; i < 200; i++) {
      rect(c, 'rgba(255,255,255,0.05)', (rnd(i + 5) * w) | 0, (rnd(i + 600) * h) | 0, 1, 1);
    }
  });
  return TEX.city;
}

/**
 * Painter for a printed sheet: headline, body lines, optional accent bar.
 * @param {string} text headline, `\n` for line breaks
 * @param {Object} [o]
 * @param {string} [o.bg='#e2e2d8'] @param {string} [o.fg='#23262a']
 * @param {string} [o.accent='#9c332c'] @param {string} [o.sub] small line under the headline
 * @param {number} [o.size=13] headline px at 64x96
 * @param {boolean} [o.tearStrip=false] draw an untouched tear-off fringe
 * @returns {THREE.Texture}
 */
export function posterTexture(text, o = {}) {
  const key = `poster:${text}:${JSON.stringify(o)}`;
  if (TEX[key]) return TEX[key];
  const bg = o.bg || '#e2e2d8';
  const fg = o.fg || '#23262a';
  const accent = o.accent || '#9c332c';
  const size = o.size === undefined ? 13 : o.size;
  TEX[key] = makeTexture(64, 96, (c, w, h) => {
    rect(c, bg, 0, 0, w, h);
    rect(c, accent, 0, 0, w, 5);
    for (let i = 0; i < 70; i++) {
      rect(c, 'rgba(0,0,0,0.05)', (rnd(i + 21) * w) | 0, (rnd(i + 77) * h) | 0, 1, 1);
    }
    const lines = String(text).split('\n');
    let y = 16;
    for (const ln of lines) {
      caps(c, ln, w / 2, y, size, fg);
      y += size + 3;
    }
    if (o.sub) caps(c, o.sub, w / 2, y + 5, 7, '#5d6470');
    if (o.tearStrip) {
      rect(c, '#d4d4c8', 2, h - 26, w - 4, 24);
      for (let i = 0; i < 7; i++) {
        rect(c, bg, 2 + i * 8.6, h - 26, 1, 24);
        caps(c, '555', 2 + i * 8.6 + 4, h - 14, 5, '#5d6470');
      }
    }
    rect(c, 'rgba(0,0,0,0.18)', 0, h - 2, w, 2);
  });
  return TEX[key];
}

/**
 * The fridge door: white enamel buried under magnets, a curling photo,
 * a child's drawing and one very passive-aggressive note.
 * @returns {THREE.Texture}
 */
export function fridgeDoorTexture() {
  if (TEX.fridgeDoor) return TEX.fridgeDoor;
  TEX.fridgeDoor = makeTexture(64, 96, (c, w, h) => {
    rect(c, '#d5d6cf', 0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      rect(c, 'rgba(0,0,0,0.05)', (rnd(i + 9) * w) | 0, (rnd(i + 300) * h) | 0, 1, 1);
    }
    // notes
    rect(c, '#e8e4bd', 6, 8, 20, 16);
    caps(c, 'NOT', 16, 13, 6, '#8c3a30');
    caps(c, 'YOURS', 16, 20, 6, '#8c3a30');
    rect(c, '#cfd9e2', 34, 12, 24, 18);
    caps(c, 'FRI', 46, 20, 8, '#3d4247');
    // child's drawing
    rect(c, '#e6e3d4', 8, 34, 22, 22);
    c.strokeStyle = '#3f6e46';
    c.lineWidth = 1;
    c.strokeRect(11, 37, 16, 16);
    rect(c, '#b6913f', 14, 46, 4, 7);
    rect(c, '#7f9ab8', 19, 41, 5, 5);
    // photo
    rect(c, '#cfcabb', 36, 36, 20, 16);
    rect(c, '#7c8b7a', 38, 38, 16, 9);
    rect(c, '#5c6a72', 38, 47, 16, 3);
    // magnets
    const mag = ['#8c3a30', '#2f7d5e', '#b98a3a', '#3f5d8c', '#7a3f7a'];
    for (let i = 0; i < 11; i++) {
      const x = 4 + ((rnd(i * 11) * (w - 12)) | 0);
      const y = 58 + ((rnd(i * 17 + 3) * 30) | 0);
      rect(c, mag[i % mag.length], x, y, 5, 4);
      rect(c, 'rgba(255,255,255,0.35)', x, y, 5, 1);
    }
    rect(c, '#e8e4bd', 10, 66, 26, 14);
    caps(c, 'LABEL', 23, 71, 6, '#3d4247');
    caps(c, 'IT', 23, 77, 6, '#3d4247');
    rect(c, 'rgba(0,0,0,0.12)', 0, 0, 2, h);
  });
  return TEX.fridgeDoor;
}

/**
 * Vending machine front: a lot of coils and almost nothing on them.
 * @returns {THREE.Texture}
 */
export function vendingTexture() {
  if (TEX.vending) return TEX.vending;
  TEX.vending = makeTexture(64, 96, (c, w, h) => {
    rect(c, '#14181c', 0, 0, w, h);
    rect(c, '#8c3a30', 0, 0, w, 12);
    caps(c, 'SNAX', w / 2, 6, 9, '#e2e2d8');
    for (let row = 0; row < 5; row++) {
      const y = 16 + row * 14;
      rect(c, '#1d2329', 3, y, w - 6, 12);
      // coils
      for (let i = 0; i < 4; i++) {
        const x = 5 + i * 14;
        for (let s = 0; s < 6; s++) rect(c, '#4a5158', x + s * 2, y + 2, 1, 8);
        // one lonely survivor per machine
        if ((row === 1 && i === 2) || (row === 3 && i === 0)) {
          rect(c, row === 1 ? '#b98a3a' : '#3f6e8c', x + 2, y + 2, 8, 8);
          rect(c, 'rgba(255,255,255,0.3)', x + 2, y + 2, 8, 2);
        }
      }
      rect(c, 'rgba(255,255,255,0.05)', 3, y, w - 6, 1);
    }
    rect(c, '#2a3138', 3, 86, w - 6, 8);
    caps(c, 'EXACT CHANGE', w / 2, 90, 6, '#8a9199');
    // glass sheen
    c.fillStyle = 'rgba(200,220,235,0.08)';
    c.beginPath();
    c.moveTo(0, 96); c.lineTo(30, 12); c.lineTo(46, 12); c.lineTo(16, 96);
    c.closePath();
    c.fill();
  });
  return TEX.vending;
}

/**
 * Round analogue clock face, 12 ticks, no numbers. Hands are geometry.
 * @returns {THREE.Texture}
 */
export function clockFaceTexture() {
  if (TEX.clock) return TEX.clock;
  TEX.clock = makeTexture(32, 32, (c, w, h) => {
    rect(c, 'rgba(0,0,0,0)', 0, 0, w, h);
    c.fillStyle = '#dfe0d8';
    c.beginPath();
    c.arc(16, 16, 15, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#2a2e33';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(16, 16, 15, 0, Math.PI * 2);
    c.stroke();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const r1 = i % 3 === 0 ? 9 : 11;
      c.strokeStyle = '#2a2e33';
      c.lineWidth = i % 3 === 0 ? 2 : 1;
      c.beginPath();
      c.moveTo(16 + Math.sin(a) * r1, 16 - Math.cos(a) * r1);
      c.lineTo(16 + Math.sin(a) * 13, 16 - Math.cos(a) * 13);
      c.stroke();
    }
  });
  return TEX.clock;
}

/**
 * Beige keyboard top: key grid with a grubbier space bar.
 * @returns {THREE.Texture}
 */
export function keyboardTexture() {
  if (TEX.keys) return TEX.keys;
  TEX.keys = makeTexture(32, 16, (c, w, h) => {
    rect(c, '#b6ad91', 0, 0, w, h);
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 14; col++) {
        rect(c, row === 3 && col > 3 && col < 10 ? '#a49b80' : '#c8bfa3', 2 + col * 2, 2 + row * 3, 1, 2);
      }
    }
    rect(c, 'rgba(0,0,0,0.12)', 0, h - 1, w, 1);
  });
  return TEX.keys;
}

/**
 * Broad leaf cut-out for potted plants. Alpha-tested.
 * @param {boolean} [dead=false]
 * @returns {THREE.Texture}
 */
export function leafTexture(dead = false) {
  const key = dead ? 'leafDead' : 'leafAlive';
  if (TEX[key]) return TEX[key];
  TEX[key] = makeTexture(32, 32, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    const cols = dead ? ['#7a6538', '#5f4f2c', '#8d7645'] : ['#5f7f48', '#4b6a38', '#6e9152'];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI - Math.PI / 2 + (dead ? 0.9 : 0);
      const len = dead ? 8 + rnd(i) * 4 : 12 + rnd(i) * 3;
      c.save();
      c.translate(16, dead ? 20 : 30);
      c.rotate(a * (dead ? 0.55 : 0.9));
      c.fillStyle = cols[i % cols.length];
      c.beginPath();
      c.ellipse(0, -len, dead ? 2.4 : 3.4, len, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
    if (dead) {
      // a couple of shed leaves near the bottom
      rect(c, '#6b5a35', 6, 27, 3, 2);
      rect(c, '#6b5a35', 22, 29, 3, 2);
    }
  });
  return TEX[key];
}

/**
 * Motivational print: a washed-out stock vista and one enormous abstract noun.
 * @param {string} [word='SYNERGY'] @param {string} [caption]
 * @returns {THREE.Texture}
 */
export function motivationalTexture(word = 'SYNERGY', caption = 'it is what it is') {
  const key = `motiv:${word}:${caption}`;
  if (TEX[key]) return TEX[key];
  TEX[key] = makeTexture(64, 96, (c, w, h) => {
    rect(c, '#14171a', 0, 0, w, h);
    const sky = c.createLinearGradient(0, 8, 0, 56);
    sky.addColorStop(0, '#5f7f9a');
    sky.addColorStop(1, '#c2c0a8');
    c.fillStyle = sky;
    c.fillRect(6, 8, w - 12, 48);
    c.fillStyle = '#3f4a52';
    c.beginPath();
    c.moveTo(6, 56); c.lineTo(24, 24); c.lineTo(40, 56);
    c.closePath();
    c.fill();
    c.fillStyle = '#556069';
    c.beginPath();
    c.moveTo(28, 56); c.lineTo(46, 30); c.lineTo(58, 56);
    c.closePath();
    c.fill();
    rect(c, '#d8d5c4', 20, 26, 6, 3);
    caps(c, word, w / 2, 68, 11, '#e2e2d8');
    caps(c, caption, w / 2, 80, 6, '#8a9199');
    rect(c, '#3a4046', 6, 60, w - 12, 1);
  });
  return TEX[key];
}

/**
 * The flat white wash on a lit fluorescent diffuser.
 * @returns {THREE.Texture}
 */
export function fluorescentTexture() {
  if (TEX.fluo) return TEX.fluo;
  TEX.fluo = makeTexture(16, 16, (c, w, h) => {
    rect(c, '#eef4ea', 0, 0, w, h);
    for (let x = 1; x < w; x += 3) rect(c, '#dfe8dc', x, 0, 1, h);
    rect(c, '#cdd6ca', 0, 0, w, 1);
    rect(c, '#cdd6ca', 0, h - 1, w, 1);
  });
  return TEX.fluo;
}

/* ------------------------------------------------------------------ props */

/**
 * A cheap laminate desk: worktop, modesty panel, one drawer pedestal.
 * Origin on the floor, centred; worktop top surface at `h`.
 * @param {Object} [o]
 * @param {number} [o.w=1.5] width in X @param {number} [o.d=0.8] depth in Z
 * @param {number} [o.h=0.74] worktop height
 * @param {'left'|'right'|'none'} [o.pedestal='left']
 * @param {number} [o.color] worktop colour override
 * @returns {THREE.Group}
 */
export function desk(o = {}) {
  const w = o.w === undefined ? 1.5 : o.w;
  const d = o.d === undefined ? 0.8 : o.d;
  const h = o.h === undefined ? 0.74 : o.h;
  const ped = o.pedestal === undefined ? 'left' : o.pedestal;
  const top = { color: o.color === undefined ? PALETTE.deskTop : o.color, jitter: 0.9 };
  const dark = { color: PALETTE.deskEdge, jitter: 0.9 };
  const g = new THREE.Group();
  g.name = 'desk';
  g.add(boxMesh(w, 0.05, d, top, 0, h - 0.025, 0));
  g.add(boxMesh(w - 0.12, 0.34, 0.04, dark, 0, h - 0.24, -d / 2 + 0.06));
  if (ped === 'none') {
    g.add(boxMesh(0.05, h - 0.05, d - 0.1, dark, -w / 2 + 0.04, (h - 0.05) / 2, 0));
    g.add(boxMesh(0.05, h - 0.05, d - 0.1, dark, w / 2 - 0.04, (h - 0.05) / 2, 0));
  } else {
    const sx = ped === 'left' ? -1 : 1;
    g.add(boxMesh(0.42, h - 0.09, d - 0.08, { color: PALETTE.beigeDark, jitter: 0.9 },
      sx * (w / 2 - 0.24), (h - 0.09) / 2 + 0.04, 0));
    g.add(boxMesh(0.36, 0.02, 0.02, { color: PALETTE.metal }, sx * (w / 2 - 0.24), h - 0.3, (d - 0.08) / 2));
    g.add(boxMesh(0.05, h - 0.05, d - 0.1, dark, -sx * (w / 2 - 0.04), (h - 0.05) / 2, 0));
  }
  return g;
}

/**
 * A rolling task chair. Faces **+Z** (you sit facing +Z).
 * Origin on the floor at the seat centre; seat pad at ~0.45m.
 * @param {Object} [o]
 * @param {number} [o.color] fabric colour
 * @param {number} [o.seatH=0.45]
 * @param {boolean} [o.arms=false]
 * @returns {THREE.Group}
 */
export function officeChair(o = {}) {
  const seatH = o.seatH === undefined ? 0.45 : o.seatH;
  const fab = { color: o.color === undefined ? PALETTE.fabric : o.color, jitter: 0.9 };
  const g = new THREE.Group();
  g.name = 'officeChair';
  g.add(boxMesh(0.46, 0.08, 0.44, fab, 0, seatH, 0));
  g.add(boxMesh(0.44, 0.5, 0.07, fab, 0, seatH + 0.29, -0.2));
  g.add(cylMesh(0.035, 0.035, seatH - 0.1, 5, { color: PALETTE.metalDark }, 0, (seatH - 0.1) / 2 + 0.06, 0));
  const base = cylMesh(0.3, 0.24, 0.05, 5, { color: PALETTE.plastic }, 0, 0.05, 0);
  base.rotation.y = 0.4;
  g.add(base);
  if (o.arms) {
    g.add(boxMesh(0.05, 0.2, 0.3, { color: PALETTE.plastic }, -0.24, seatH + 0.14, -0.04));
    g.add(boxMesh(0.05, 0.2, 0.3, { color: PALETTE.plastic }, 0.24, seatH + 0.14, -0.04));
  }
  return g;
}

/**
 * A beige CRT monitor. Screen faces **+Z**. Origin at the bottom centre.
 *
 * `group.userData.screen` is the screen quad and `group.userData.setScreen(tex)`
 * swaps what is on it. `group.userData.scroll(amount)` slides the screen UVs,
 * which is how the office animates terminal output without redrawing a canvas.
 *
 * @param {Object} [o]
 * @param {THREE.Texture} [o.map] screen texture; defaults to {@link screenTexture}
 * @param {number} [o.scale=1]
 * @param {number} [o.seed=1] varies the default screen contents
 * @returns {THREE.Group}
 */
export function crtMonitor(o = {}) {
  const s = o.scale === undefined ? 1 : o.scale;
  const beige = { color: PALETTE.beige, jitter: 0.9 };
  const g = new THREE.Group();
  g.name = 'crtMonitor';
  g.add(boxMesh(0.38 * s, 0.34 * s, 0.34 * s, beige, 0, 0.29 * s, 0));
  g.add(boxMesh(0.2 * s, 0.05 * s, 0.22 * s, beige, 0, 0.1 * s, 0));
  g.add(boxMesh(0.34 * s, 0.02 * s, 0.3 * s, { color: PALETTE.beigeDark, jitter: 0.9 }, 0, 0.05 * s, 0));

  const geo = planeGeo(0.28, 0.22).clone();
  const screen = new THREE.Mesh(geo, ps1Material({
    map: o.map || screenTexture(o.seed === undefined ? 1 : o.seed),
    color: 0xffffff,
    emissive: 0xb6c8ba,
    jitter: 0.9,
    cache: false,
  }));
  screen.scale.set(s, s, s);
  screen.position.set(0, 0.3 * s, 0.171 * s);
  g.add(screen);

  g.userData.screen = screen;
  /**
   * Replaces the screen image.
   * @param {THREE.Texture} tex
   * @returns {void}
   */
  g.userData.setScreen = (tex) => {
    if (!tex) return;
    screen.material.uniforms.uMap = { value: tex };
    screen.material.needsUpdate = true;
  };
  /**
   * Slides the screen UVs vertically. Cheaper than redrawing the canvas and it
   * plays nicely with the affine mapping.
   * @param {number} amount in UV units
   * @returns {void}
   */
  g.userData.scroll = (amount) => {
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) + amount);
    uv.needsUpdate = true;
  };
  return g;
}

/**
 * A beige keyboard, slightly angled. Keys face up, cable end at -Z.
 * @param {Object} [o] @param {number} [o.w=0.42] @param {number} [o.d=0.16]
 * @returns {THREE.Group}
 */
export function keyboard(o = {}) {
  const w = o.w === undefined ? 0.42 : o.w;
  const d = o.d === undefined ? 0.16 : o.d;
  const g = new THREE.Group();
  g.name = 'keyboard';
  const body = boxMesh(w, 0.025, d, { color: PALETTE.beige, map: keyboardTexture(), jitter: 0.9 }, 0, 0.012, 0);
  body.rotation.x = -0.07;
  g.add(body);
  return g;
}

/**
 * A waist-high fabric cubicle partition. Runs along **X**.
 * @param {Object} [o]
 * @param {number} [o.w=2] @param {number} [o.h=1.25] @param {number} [o.t=0.08]
 * @param {number} [o.color]
 * @returns {THREE.Group}
 */
export function cubiclePartition(o = {}) {
  const w = o.w === undefined ? 2 : o.w;
  const h = o.h === undefined ? 1.25 : o.h;
  const t = o.t === undefined ? 0.08 : o.t;
  const g = new THREE.Group();
  g.name = 'cubiclePartition';
  g.add(boxMesh(w, h - 0.08, t, { color: o.color === undefined ? PALETTE.fabricWorn : o.color, jitter: 0.9 }, 0, (h - 0.08) / 2 + 0.04, 0));
  g.add(boxMesh(w, 0.05, t + 0.02, { color: PALETTE.beigeDark }, 0, h - 0.025, 0));
  g.add(boxMesh(0.05, 0.06, t + 0.04, { color: PALETTE.metalDark }, -w / 2 + 0.03, 0.03, 0));
  g.add(boxMesh(0.05, 0.06, t + 0.04, { color: PALETTE.metalDark }, w / 2 - 0.03, 0.03, 0));
  return g;
}

/**
 * A whiteboard whose drawing is swappable — episodes change what is on it.
 * Board face points **+Z**. Origin on the floor, centred.
 *
 * `group.userData.setDrawing(tex)` replaces the drawing;
 * `group.userData.board` is the face quad.
 *
 * @param {Object} [o]
 * @param {number} [o.w=1.8] @param {number} [o.h=1.1]
 * @param {THREE.Texture} [o.map] defaults to {@link whiteboardScrawlTexture}
 * @param {boolean} [o.wheels=true] free-standing frame on castors
 * @param {number} [o.y=0.85] board bottom height when on wheels
 * @returns {THREE.Group}
 */
export function whiteboard(o = {}) {
  const w = o.w === undefined ? 1.8 : o.w;
  const h = o.h === undefined ? 1.1 : o.h;
  const wheels = o.wheels === undefined ? true : !!o.wheels;
  const y0 = wheels ? (o.y === undefined ? 0.85 : o.y) : 0;
  const g = new THREE.Group();
  g.name = 'whiteboard';

  const cy = y0 + h / 2;
  g.add(boxMesh(w + 0.1, h + 0.1, 0.06, { color: PALETTE.metal, jitter: 0.9 }, 0, cy, -0.02));
  const board = new THREE.Mesh(planeGeo(w, h), ps1Material({
    map: o.map || whiteboardScrawlTexture(),
    color: 0xf2f2ec,
    jitter: 0.9,
    cache: false,
  }));
  board.position.set(0, cy, 0.016);
  g.add(board);
  g.add(boxMesh(w * 0.5, 0.04, 0.08, { color: PALETTE.metal }, 0, y0 - 0.04, 0.04));
  g.add(boxMesh(0.09, 0.02, 0.03, { color: PALETTE.warn }, -0.1, y0 - 0.01, 0.06));
  g.add(boxMesh(0.09, 0.02, 0.03, { color: PALETTE.plastic }, 0.03, y0 - 0.01, 0.06));

  if (wheels) {
    for (const sx of [-1, 1]) {
      g.add(boxMesh(0.05, y0 - 0.06, 0.05, { color: PALETTE.metalDark }, sx * (w / 2), (y0 - 0.06) / 2 + 0.06, -0.02));
      g.add(boxMesh(0.08, 0.06, 0.5, { color: PALETTE.metalDark }, sx * (w / 2), 0.06, -0.02));
    }
  }

  g.userData.board = board;
  /**
   * Replaces the drawing on the board.
   * @param {THREE.Texture} tex
   * @returns {void}
   */
  g.userData.setDrawing = (tex) => {
    if (!tex) return;
    board.material.uniforms.uMap = { value: tex };
    board.material.needsUpdate = true;
  };
  return g;
}

/**
 * A pull-down projector screen with its roller housing. Faces **+Z**.
 * `group.userData.sheet` is the screen quad (the office sways it).
 * @param {Object} [o] @param {number} [o.w=1.8] @param {number} [o.h=1.5]
 * @param {number} [o.top=2.5] housing height
 * @returns {THREE.Group}
 */
export function projectorScreen(o = {}) {
  const w = o.w === undefined ? 1.8 : o.w;
  const h = o.h === undefined ? 1.5 : o.h;
  const top = o.top === undefined ? 2.5 : o.top;
  const g = new THREE.Group();
  g.name = 'projectorScreen';
  g.add(boxMesh(w + 0.14, 0.12, 0.12, { color: PALETTE.beigeDark }, 0, top, 0));
  const sheet = new THREE.Mesh(planeGeo(w, h), ps1Material({ color: 0xcfd2c8, jitter: 0.9 }));
  sheet.position.set(0, top - 0.06 - h / 2, 0.03);
  g.add(sheet);
  g.add(boxMesh(w, 0.03, 0.04, { color: PALETTE.metalDark }, 0, top - 0.06 - h, 0.03));
  g.userData.sheet = sheet;
  const blank = sheet.material;
  /**
   * Projects an image onto the sheet (a slide from `/js/sets/slides.js`), or
   * turns the projector off with `null`. The image is lifted a little toward
   * unlit so it reads as projected light, not paint.
   * @param {THREE.Texture|null} tex
   */
  g.userData.setScreen = (tex) => {
    sheet.material = tex
      ? ps1Material({ map: tex, color: 0xffffff, emissive: 0x2a2a2a, jitter: 0.9 })
      : blank;
  };
  return g;
}

/**
 * A hamburger with a birthday candle stuck in it: sesame bun, patty, cheese,
 * lettuce, and a candle whose flame flickers on its own. Origin at the base of
 * the bottom bun; about 0.14m wide. `userData.setLit(false)` blows it out.
 * @returns {THREE.Group}
 */
export function birthdayBurger() {
  const g = new THREE.Group();
  g.name = 'birthdayBurger';
  g.add(cylMesh(0.065, 0.06, 0.03, 8, { color: 0xc98f4e }, 0, 0.015, 0));
  g.add(cylMesh(0.07, 0.07, 0.012, 8, { color: 0x6fae3e }, 0, 0.035, 0));
  g.add(cylMesh(0.068, 0.068, 0.028, 8, { color: 0x5a3322 }, 0, 0.054, 0));
  const cheese = boxMesh(0.12, 0.008, 0.12, { color: 0xf0b83a }, 0, 0.071, 0);
  cheese.rotation.y = Math.PI / 4;
  g.add(cheese);
  g.add(cylMesh(0.05, 0.068, 0.045, 8, { color: 0xd8a05a }, 0, 0.096, 0));
  // sesame seeds
  for (const [x, z] of [[-0.025, 0.01], [0.02, -0.02], [0.01, 0.028], [-0.01, -0.03]]) {
    g.add(boxMesh(0.008, 0.004, 0.012, { color: 0xf2e8cc }, x, 0.12, z));
  }
  // the candle, with red stripes, and a flame
  g.add(cylMesh(0.007, 0.007, 0.07, 6, { color: 0x6fb7e0 }, 0, 0.15, 0));
  g.add(cylMesh(0.0075, 0.0075, 0.01, 6, { color: 0xe05050 }, 0, 0.14, 0));
  g.add(cylMesh(0.0075, 0.0075, 0.01, 6, { color: 0xe05050 }, 0, 0.165, 0));
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.035, 4),
    ps1Material({ color: 0xffd060, emissive: 0xff9020, unlit: 1 }));
  flame.position.set(0, 0.205, 0);
  flame.onBeforeRender = () => {
    const k = performance.now() / 1000;
    flame.scale.set(1 + 0.15 * Math.sin(k * 23), 1 + 0.25 * Math.sin(k * 17 + 1), 1);
    flame.updateMatrixWorld();
  };
  g.add(flame);
  g.userData.flame = flame;
  g.userData.setLit = (on) => { flame.visible = !!on; };
  return g;
}

/**
 * A fridge, thoroughly magnetised. Door faces **+Z**. Origin on the floor.
 * @param {Object} [o] @param {number} [o.w=0.72] @param {number} [o.h=1.72] @param {number} [o.d=0.66]
 * @returns {THREE.Group}
 */
export function fridge(o = {}) {
  const w = o.w === undefined ? 0.72 : o.w;
  const h = o.h === undefined ? 1.72 : o.h;
  const d = o.d === undefined ? 0.66 : o.d;
  const g = new THREE.Group();
  g.name = 'fridge';
  g.add(boxMesh(w, h, d, { color: 0xc4c6be, jitter: 0.9 }, 0, h / 2, 0));
  const door = new THREE.Mesh(planeGeo(w - 0.04, h - 0.1), ps1Material({
    map: fridgeDoorTexture(), color: 0xffffff, jitter: 0.9,
  }));
  door.position.set(0, h / 2 + 0.02, d / 2 + 0.008);
  g.add(door);
  g.add(boxMesh(0.04, h * 0.5, 0.05, { color: PALETTE.metal }, w / 2 - 0.09, h * 0.56, d / 2 + 0.03));
  g.add(boxMesh(w - 0.04, 0.02, 0.02, { color: PALETTE.metalDark }, 0, h * 0.63, d / 2 + 0.012));
  // three magnets with actual thickness so the door is not perfectly flat
  g.add(boxMesh(0.06, 0.05, 0.02, { color: PALETTE.warn }, -0.18, 0.62, d / 2 + 0.018));
  g.add(boxMesh(0.05, 0.05, 0.02, { color: PALETTE.munchGreen }, 0.12, 0.5, d / 2 + 0.018));
  g.add(boxMesh(0.05, 0.05, 0.02, { color: PALETTE.amber }, 0.22, 0.86, d / 2 + 0.018));
  return g;
}

/**
 * A countertop microwave. Door faces **+Z**. Origin at its base.
 * @param {Object} [o] @param {number} [o.w=0.5]
 * @returns {THREE.Group}
 */
export function microwave(o = {}) {
  const w = o.w === undefined ? 0.5 : o.w;
  const g = new THREE.Group();
  g.name = 'microwave';
  g.add(boxMesh(w, 0.29, 0.36, { color: PALETTE.beige, jitter: 0.9 }, 0, 0.145, 0));
  g.add(boxMesh(w * 0.62, 0.2, 0.01, { color: 0x20262a, jitter: 0.9 }, -w * 0.14, 0.15, 0.181));
  g.add(boxMesh(w * 0.2, 0.22, 0.012, { color: PALETTE.beigeDark }, w * 0.34, 0.15, 0.182));
  g.add(boxMesh(0.03, 0.02, 0.014, { color: 0x6ad07a, emissive: 0x3a8a4a }, w * 0.34, 0.21, 0.19));
  return g;
}

/**
 * A drip coffee machine with a half-inch of coffee from this morning.
 * Faces **+Z**. Origin at its base.
 * @param {Object} [o]
 * @returns {THREE.Group}
 */
export function coffeeMachine(o = {}) {
  const g = new THREE.Group();
  g.name = 'coffeeMachine';
  g.add(boxMesh(0.26, 0.4, 0.26, { color: 0x2e3338, jitter: 0.9 }, 0, 0.2, -0.02));
  g.add(boxMesh(0.24, 0.02, 0.2, { color: PALETTE.metalDark }, 0, 0.13, 0.07));
  g.add(boxMesh(0.17, 0.14, 0.15, { color: 0x8a9096, jitter: 0.9 }, 0, 0.21, 0.09));
  g.add(boxMesh(0.16, 0.03, 0.14, { color: 0x3a2318 }, 0, 0.16, 0.09));
  g.add(boxMesh(0.05, 0.05, 0.02, { color: PALETTE.warn, emissive: 0x662018 }, 0.08, 0.33, 0.12));
  return g;
}

/**
 * A water cooler with a bottle on top. Faces **+Z**. Origin on the floor.
 * `group.userData.bottle` is the bottle (the office bobs it).
 * @param {Object} [o]
 * @returns {THREE.Group}
 */
export function waterCooler(o = {}) {
  const g = new THREE.Group();
  g.name = 'waterCooler';
  g.add(boxMesh(0.34, 0.95, 0.34, { color: PALETTE.white, jitter: 0.9 }, 0, 0.475, 0));
  g.add(boxMesh(0.2, 0.12, 0.04, { color: PALETTE.metalDark }, 0, 0.72, 0.18));
  g.add(boxMesh(0.05, 0.04, 0.05, { color: 0x3f6e8c }, -0.05, 0.78, 0.2));
  g.add(boxMesh(0.05, 0.04, 0.05, { color: PALETTE.warn }, 0.05, 0.78, 0.2));
  const bottle = cylMesh(0.14, 0.2, 0.46, 7, { color: 0x6fa7c4, transparent: true, opacity: 0.7, jitter: 0.9 }, 0, 1.19, 0);
  g.add(bottle);
  g.add(cylMesh(0.07, 0.07, 0.05, 6, { color: 0x3f6e8c }, 0, 1.44, 0));
  g.userData.bottle = bottle;
  return g;
}

/**
 * A vending machine that is mostly a lit display case full of nothing.
 * Front faces **+Z**. Origin on the floor.
 * @param {Object} [o] @param {number} [o.w=0.9] @param {number} [o.h=1.9] @param {number} [o.d=0.72]
 * @returns {THREE.Group}
 */
export function vendingMachine(o = {}) {
  const w = o.w === undefined ? 0.9 : o.w;
  const h = o.h === undefined ? 1.9 : o.h;
  const d = o.d === undefined ? 0.72 : o.d;
  const g = new THREE.Group();
  g.name = 'vendingMachine';
  g.add(boxMesh(w, h, d, { color: 0x6d2f2a, jitter: 0.9 }, 0, h / 2, 0));
  const face = new THREE.Mesh(planeGeo(w - 0.12, h - 0.26), ps1Material({
    map: vendingTexture(), color: 0xffffff, emissive: 0x2a3230, jitter: 0.9,
  }));
  face.position.set(-0.04, h / 2 + 0.06, d / 2 + 0.008);
  g.add(face);
  g.add(boxMesh(0.16, h - 0.3, 0.03, { color: 0x1d2329 }, w / 2 - 0.1, h / 2 + 0.06, d / 2 + 0.01));
  g.add(boxMesh(0.1, 0.03, 0.02, { color: 0x8a9199 }, w / 2 - 0.1, h * 0.72, d / 2 + 0.025));
  g.add(boxMesh(w - 0.24, 0.16, 0.04, { color: 0x20262a }, 0, 0.2, d / 2 + 0.01));
  return g;
}

/**
 * A small round break-room table.
 * @param {Object} [o] @param {number} [o.r=0.72] @param {number} [o.h=0.74]
 * @returns {THREE.Group}
 */
export function roundTable(o = {}) {
  const r = o.r === undefined ? 0.72 : o.r;
  const h = o.h === undefined ? 0.74 : o.h;
  const g = new THREE.Group();
  g.name = 'roundTable';
  g.add(cylMesh(r, r, 0.05, 8, { color: PALETTE.deskTop, jitter: 0.9 }, 0, h - 0.025, 0));
  g.add(cylMesh(0.06, 0.06, h - 0.08, 6, { color: PALETTE.metalDark }, 0, (h - 0.08) / 2 + 0.03, 0));
  g.add(cylMesh(0.3, 0.32, 0.04, 6, { color: PALETTE.metalDark }, 0, 0.02, 0));
  return g;
}

/**
 * The long meeting-room table. Long axis runs **Z**.
 * @param {Object} [o] @param {number} [o.w=1.2] X @param {number} [o.l=3] Z @param {number} [o.h=0.74]
 * @returns {THREE.Group}
 */
export function conferenceTable(o = {}) {
  const w = o.w === undefined ? 1.2 : o.w;
  const l = o.l === undefined ? 3 : o.l;
  const h = o.h === undefined ? 0.74 : o.h;
  const g = new THREE.Group();
  g.name = 'conferenceTable';
  g.add(boxMesh(w, 0.06, l, { color: PALETTE.deskTop, jitter: 0.9 }, 0, h - 0.03, 0));
  g.add(boxMesh(w - 0.08, 0.03, l - 0.06, { color: PALETTE.deskEdge }, 0, h - 0.07, 0));
  for (const sz of [-1, 1]) {
    g.add(boxMesh(w - 0.5, 0.6, 0.08, { color: PALETTE.deskEdge, jitter: 0.9 }, 0, 0.36, sz * (l / 2 - 0.5)));
    g.add(boxMesh(w - 0.24, 0.06, 0.4, { color: PALETTE.metalDark }, 0, 0.03, sz * (l / 2 - 0.5)));
  }
  return g;
}

/**
 * The starfish conference phone. Origin at its base; arms spread in XZ.
 * `group.userData.led` is the status light (the office pulses it).
 * @param {Object} [o] @param {number} [o.r=0.11]
 * @returns {THREE.Group}
 */
export function speakerphone(o = {}) {
  const r = o.r === undefined ? 0.11 : o.r;
  const g = new THREE.Group();
  g.name = 'speakerphone';
  g.add(cylMesh(r, r * 1.1, 0.05, 6, { color: 0x2b3036, jitter: 0.8 }, 0, 0.025, 0));
  g.add(cylMesh(r * 0.55, r * 0.55, 0.02, 6, { color: 0x4a5158 }, 0, 0.055, 0));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    const arm = boxMesh(0.09, 0.035, 0.18, { color: 0x2b3036, jitter: 0.8 },
      Math.sin(a) * (r + 0.07), 0.018, Math.cos(a) * (r + 0.07));
    arm.rotation.y = a;
    g.add(arm);
    g.add(boxMesh(0.05, 0.008, 0.05, { color: 0x1a1e22 },
      Math.sin(a) * (r + 0.09), 0.038, Math.cos(a) * (r + 0.09)));
  }
  const led = boxMesh(0.022, 0.008, 0.022, { color: 0x8a3a32, emissive: 0x6a1c16, cache: false }, 0, 0.066, 0);
  g.add(led);
  g.userData.led = led;
  return g;
}

/**
 * A potted plant. `dead:true` gives the very sad one.
 * `group.userData.fronds` is the foliage pivot (the office sways it).
 * @param {Object} [o]
 * @param {boolean} [o.dead=false]
 * @param {number} [o.scale=1]
 * @returns {THREE.Group}
 */
export function pottedPlant(o = {}) {
  const dead = !!o.dead;
  const s = o.scale === undefined ? 1 : o.scale;
  const g = new THREE.Group();
  g.name = dead ? 'deadPlant' : 'pottedPlant';
  g.add(cylMesh(0.19 * s, 0.14 * s, 0.32 * s, 6, { color: dead ? 0x6d5c4c : 0x7a5442, jitter: 0.9 }, 0, 0.16 * s, 0));
  g.add(cylMesh(0.2 * s, 0.2 * s, 0.04 * s, 6, { color: dead ? 0x5c4d40 : 0x664536 }, 0, 0.33 * s, 0));
  g.add(cylMesh(0.16 * s, 0.16 * s, 0.02 * s, 6, { color: PALETTE.soil }, 0, 0.34 * s, 0));

  const fronds = new THREE.Group();
  fronds.position.y = 0.33 * s;
  const mat = {
    map: leafTexture(dead), color: dead ? 0xb0a080 : 0xd8e0c8,
    alphaTest: 0.5, side: THREE.DoubleSide, jitter: 0.9,
  };
  const n = dead ? 2 : 3;
  for (let i = 0; i < n; i++) {
    const q = new THREE.Mesh(planeGeo(0.62 * s, 0.62 * s), ps1Material(mat));
    q.position.y = (dead ? 0.2 : 0.3) * s;
    q.rotation.y = (i / n) * Math.PI;
    if (dead) q.rotation.z = 0.25;
    fronds.add(q);
  }
  if (!dead) {
    g.add(cylMesh(0.02 * s, 0.03 * s, 0.3 * s, 4, { color: 0x4f6b3c }, 0, 0.48 * s, 0));
  } else {
    const stick = cylMesh(0.012 * s, 0.02 * s, 0.4 * s, 4, { color: 0x5f5136 }, 0, 0.52 * s, 0);
    stick.rotation.z = 0.3;
    g.add(stick);
  }
  g.add(fronds);
  g.userData.fronds = fronds;
  return g;
}

/**
 * A stack of banker's boxes that were never unpacked.
 * @param {Object} [o] @param {number} [o.count=3] @param {boolean} [o.lids=true]
 * @returns {THREE.Group}
 */
export function bankersBoxStack(o = {}) {
  const count = Math.max(1, o.count === undefined ? 3 : o.count);
  const g = new THREE.Group();
  g.name = 'bankersBoxStack';
  const body = { color: 0xa9a08a, jitter: 0.9 };
  const lid = { color: 0x968d78, jitter: 0.9 };
  for (let i = 0; i < count; i++) {
    const y = i * 0.29;
    const jitterX = (rnd(i * 3.3) - 0.5) * 0.1;
    const box = boxMesh(0.5, 0.26, 0.38, body, jitterX, y + 0.13, (rnd(i * 7.7) - 0.5) * 0.08);
    box.rotation.y = (rnd(i * 5.1) - 0.5) * 0.3;
    g.add(box);
    if (o.lids === false) continue;
    const cap = boxMesh(0.52, 0.03, 0.4, lid, jitterX, y + 0.275, (rnd(i * 7.7) - 0.5) * 0.08);
    cap.rotation.y = box.rotation.y;
    g.add(cap);
  }
  return g;
}

/**
 * A wall clock. Face points **+Z**. Origin at the face centre.
 * `group.userData.hourHand` / `.minuteHand` are pivots rotated about Z.
 * @param {Object} [o] @param {number} [o.r=0.17]
 * @returns {THREE.Group}
 */
export function wallClock(o = {}) {
  const r = o.r === undefined ? 0.17 : o.r;
  const g = new THREE.Group();
  g.name = 'wallClock';
  const case_ = cylMesh(r, r, 0.05, 8, { color: PALETTE.plastic, jitter: 0.8 }, 0, 0, 0);
  case_.rotation.x = Math.PI / 2;
  g.add(case_);
  const face = new THREE.Mesh(planeGeo(r * 2, r * 2), ps1Material({
    map: clockFaceTexture(), color: 0xffffff, alphaTest: 0.5, jitter: 0.8,
  }));
  face.position.z = 0.028;
  g.add(face);

  const hourHand = new THREE.Group();
  hourHand.position.z = 0.032;
  hourHand.add(boxMesh(0.018, r * 0.55, 0.008, { color: 0x24282c }, 0, r * 0.26, 0));
  g.add(hourHand);

  const minuteHand = new THREE.Group();
  minuteHand.position.z = 0.038;
  minuteHand.add(boxMesh(0.013, r * 0.82, 0.008, { color: 0x24282c }, 0, r * 0.4, 0));
  g.add(minuteHand);

  g.userData.hourHand = hourHand;
  g.userData.minuteHand = minuteHand;
  return g;
}

/**
 * A printed sheet on a wall. Face points **+Z**; origin at the sheet centre.
 * @param {string} text headline; `\n` breaks lines
 * @param {Object} [o]
 * @param {number} [o.w=0.44] @param {number} [o.h=0.62]
 * @param {string} [o.bg] @param {string} [o.fg] @param {string} [o.accent]
 * @param {string} [o.sub] @param {number} [o.size]
 * @param {boolean} [o.tearStrip=false]
 * @param {boolean} [o.frame=false] give it a cheap clip frame
 * @returns {THREE.Group}
 */
export function poster(text, o = {}) {
  const w = o.w === undefined ? 0.44 : o.w;
  const h = o.h === undefined ? 0.62 : o.h;
  const g = new THREE.Group();
  g.name = 'poster';
  if (o.frame) g.add(boxMesh(w + 0.04, h + 0.04, 0.015, { color: PALETTE.plastic }, 0, 0, -0.008));
  const sheet = new THREE.Mesh(planeGeo(w, h), ps1Material({
    map: posterTexture(text, {
      bg: o.bg, fg: o.fg, accent: o.accent, sub: o.sub, size: o.size, tearStrip: o.tearStrip,
    }),
    color: 0xffffff,
    jitter: 0.9,
  }));
  sheet.position.z = 0.002;
  g.add(sheet);
  g.userData.sheet = sheet;
  return g;
}

/**
 * A framed motivational print. Face points **+Z**; origin at the centre.
 * @param {Object} [o]
 * @param {string} [o.word='SYNERGY'] @param {string} [o.caption]
 * @param {number} [o.w=0.5] @param {number} [o.h=0.7]
 * @returns {THREE.Group}
 */
export function motivationalPoster(o = {}) {
  const w = o.w === undefined ? 0.5 : o.w;
  const h = o.h === undefined ? 0.7 : o.h;
  const g = new THREE.Group();
  g.name = 'motivationalPoster';
  g.add(boxMesh(w + 0.05, h + 0.05, 0.02, { color: 0x1b1f23 }, 0, 0, -0.011));
  const sheet = new THREE.Mesh(planeGeo(w, h), ps1Material({
    map: motivationalTexture(o.word, o.caption), color: 0xffffff, jitter: 0.9,
  }));
  sheet.position.z = 0.002;
  g.add(sheet);
  return g;
}

/**
 * A floor-standing copier that has one job and resents it.
 * Front (output tray and panel) faces **+Z**. Origin on the floor.
 * `group.userData.lamp` is the scanner glow bar.
 * @param {Object} [o]
 * @returns {THREE.Group}
 */
export function copier(o = {}) {
  const g = new THREE.Group();
  g.name = 'copier';
  g.add(boxMesh(0.84, 0.72, 0.68, { color: 0x6f7378, jitter: 0.9 }, 0, 0.36, 0));
  g.add(boxMesh(0.86, 0.16, 0.7, { color: 0x585d62, jitter: 0.9 }, 0, 0.8, 0));
  g.add(boxMesh(0.8, 0.06, 0.6, { color: 0x83888d }, 0, 0.91, 0));
  g.add(boxMesh(0.62, 0.05, 0.3, { color: 0x4a4f54 }, 0, 0.62, 0.3));
  g.add(boxMesh(0.5, 0.02, 0.24, { color: PALETTE.paper }, 0, 0.65, 0.3));
  g.add(boxMesh(0.24, 0.1, 0.03, { color: 0x2b3036 }, 0.24, 0.84, 0.36));
  const lamp = boxMesh(0.2, 0.02, 0.02, { color: 0x7fd8a8, emissive: 0x2f7d5e, cache: false }, 0.24, 0.87, 0.375);
  g.add(lamp);
  g.add(boxMesh(0.8, 0.05, 0.02, { color: 0x4a4f54 }, 0, 0.2, 0.35));
  g.userData.lamp = lamp;
  return g;
}

/**
 * A beige desk phone with a handset and a coiled cord stub.
 * Faces **+Z**. Origin at its base.
 * @param {Object} [o] @param {number} [o.color]
 * @returns {THREE.Group}
 */
export function deskPhone(o = {}) {
  const col = { color: o.color === undefined ? PALETTE.beige : o.color, jitter: 0.85 };
  const g = new THREE.Group();
  g.name = 'deskPhone';
  const base = boxMesh(0.2, 0.05, 0.22, col, 0, 0.025, 0);
  base.rotation.x = -0.12;
  g.add(base);
  g.add(boxMesh(0.12, 0.02, 0.12, { color: PALETTE.beigeDark }, 0.02, 0.05, 0.02));
  g.add(boxMesh(0.07, 0.05, 0.21, col, -0.05, 0.07, 0));
  g.add(boxMesh(0.07, 0.03, 0.05, col, -0.05, 0.05, -0.1));
  g.add(boxMesh(0.07, 0.03, 0.05, col, -0.05, 0.05, 0.1));
  return g;
}

/**
 * A recessed fluorescent ceiling panel in its grid tile.
 * Faces **down**. Origin at the ceiling plane.
 *
 * `group.userData.setLevel(v)` scales its brightness 0..1 — that is how the
 * office drives the one panel that will not stop flickering.
 *
 * @param {Object} [o]
 * @param {number} [o.w=1.16] @param {number} [o.d=0.56]
 * @param {boolean} [o.flicker=false] give it a private (uncached) material
 * @returns {THREE.Group}
 */
export function ceilingPanel(o = {}) {
  const w = o.w === undefined ? 1.16 : o.w;
  const d = o.d === undefined ? 0.56 : o.d;
  const g = new THREE.Group();
  g.name = 'ceilingPanel';
  g.add(boxMesh(w + 0.06, 0.05, d + 0.06, { color: PALETTE.metalDark, jitter: 0.8 }, 0, 0.035, 0));
  const base = new THREE.Color(PALETTE.panelLit);
  const mat = ps1Material({
    map: fluorescentTexture(), color: PALETTE.panelLit, unlit: 1, jitter: 0.8,
    cache: !o.flicker,
  });
  const diff = new THREE.Mesh(planeGeo(w, d), mat);
  diff.rotation.x = Math.PI / 2;
  diff.position.y = -0.022;
  g.add(diff);
  g.userData.diffuser = diff;
  /**
   * Sets panel brightness.
   * @param {number} v 0..1
   * @returns {void}
   */
  g.userData.setLevel = (v) => {
    const k = Math.max(0, Math.min(1, v));
    mat.uniforms.uColor.value.setRGB(base.r * k, base.g * k, base.b * k);
  };
  return g;
}

/**
 * A door opening: two jambs plus a header. Straddles the wall plane, opening
 * runs along **X**. Origin on the floor at the centre of the opening.
 * @param {Object} [o]
 * @param {number} [o.width=2] clear opening
 * @param {number} [o.height=2.1]
 * @param {number} [o.thickness=0.2] wall thickness it wraps
 * @param {number} [o.ceil=2.75] ceiling height, for the panel above the header
 * @returns {THREE.Group}
 */
export function doorway(o = {}) {
  const width = o.width === undefined ? 2 : o.width;
  const height = o.height === undefined ? 2.1 : o.height;
  const t = o.thickness === undefined ? 0.2 : o.thickness;
  const ceil = o.ceil === undefined ? 2.75 : o.ceil;
  const g = new THREE.Group();
  g.name = 'doorway';
  const jamb = { color: PALETTE.dado, jitter: 0.9 };
  g.add(boxMesh(0.08, height, t + 0.04, jamb, -width / 2 - 0.04, height / 2, 0));
  g.add(boxMesh(0.08, height, t + 0.04, jamb, width / 2 + 0.04, height / 2, 0));
  g.add(boxMesh(width + 0.16, 0.1, t + 0.04, jamb, 0, height + 0.05, 0));
  if (ceil > height + 0.1) {
    g.add(boxMesh(width + 0.16, ceil - height - 0.1, t, { color: PALETTE.wall, map: wallTexture(), jitter: 0.9 },
      0, (ceil + height + 0.1) / 2, 0));
  }
  return g;
}

/**
 * A wall segment with a dado rail. Runs along **X**, faces **+Z** / **-Z**.
 * Origin on the floor at the centre.
 * @param {Object} [o]
 * @param {number} [o.w=4] @param {number} [o.h=2.75] @param {number} [o.t=0.18]
 * @param {boolean} [o.dado=true]
 * @param {number} [o.color]
 * @returns {THREE.Group}
 */
export function wallSegment(o = {}) {
  const w = o.w === undefined ? 4 : o.w;
  const h = o.h === undefined ? 2.75 : o.h;
  const t = o.t === undefined ? 0.18 : o.t;
  const g = new THREE.Group();
  g.name = 'wallSegment';
  g.add(boxMesh(w, h, t, {
    color: o.color === undefined ? PALETTE.wall : o.color, map: wallTexture(), jitter: 0.9,
  }, 0, h / 2, 0));
  if (o.dado !== false) {
    g.add(boxMesh(w, 0.95, t + 0.03, { color: PALETTE.dado, jitter: 0.9 }, 0, 0.475, 0));
    g.add(boxMesh(w, 0.05, t + 0.06, { color: PALETTE.beigeDark, jitter: 0.9 }, 0, 0.97, 0));
    g.add(boxMesh(w, 0.09, t + 0.05, { color: 0x4d4740, jitter: 0.9 }, 0, 0.045, 0));
  }
  return g;
}

/**
 * The MUNCH, Inc. logo wall: a raised panel with the corporate mark on it,
 * plus the mandatory uplight strip. Faces **+Z**; origin on the floor.
 * @param {Object} [o] @param {number} [o.w=2.6] @param {number} [o.h=1.3] @param {number} [o.y=1.55]
 * @returns {THREE.Group}
 */
export function munchLogoWall(o = {}) {
  const w = o.w === undefined ? 2.6 : o.w;
  const h = o.h === undefined ? 1.3 : o.h;
  const y = o.y === undefined ? 1.55 : o.y;
  const g = new THREE.Group();
  g.name = 'munchLogoWall';
  g.add(boxMesh(w + 0.16, h + 0.16, 0.06, { color: PALETTE.beigeDark, jitter: 0.9 }, 0, y, 0.03));
  const face = new THREE.Mesh(planeGeo(w, h), ps1Material({
    map: munchLogoTexture(), color: 0xffffff, emissive: 0x2a2c26, jitter: 0.9,
  }));
  face.position.set(0, y, 0.065);
  g.add(face);
  g.add(boxMesh(w * 0.7, 0.05, 0.12, { color: PALETTE.metalDark }, 0, y - h / 2 - 0.16, 0.08));
  return g;
}

/**
 * A glazed window wall with mullions, a sill and a faint pane. Runs along
 * **X**, glass in the XY plane at z=0.
 * @param {Object} [o]
 * @param {number} [o.w=9.6] @param {number} [o.h=2.75]
 * @param {number} [o.sill=0.85] @param {number} [o.bays=4]
 * @returns {THREE.Group}
 */
export function windowWall(o = {}) {
  const w = o.w === undefined ? 9.6 : o.w;
  const h = o.h === undefined ? 2.75 : o.h;
  const sill = o.sill === undefined ? 0.85 : o.sill;
  const bays = Math.max(1, o.bays === undefined ? 4 : o.bays);
  const g = new THREE.Group();
  g.name = 'windowWall';
  const frame = { color: PALETTE.metalDark, jitter: 0.9 };
  // spandrel below the glass, head above
  g.add(boxMesh(w, sill, 0.16, { color: PALETTE.dado, jitter: 0.9 }, 0, sill / 2, 0));
  g.add(boxMesh(w, 0.06, 0.24, { color: PALETTE.beigeDark, jitter: 0.9 }, 0, sill + 0.03, 0.03));
  g.add(boxMesh(w, h - 2.45, 0.16, { color: PALETTE.wall, map: wallTexture(), jitter: 0.9 }, 0, h - (h - 2.45) / 2, 0));
  g.add(boxMesh(w, 0.08, 0.2, frame, 0, 2.45, 0));
  for (let i = 0; i <= bays; i++) {
    g.add(boxMesh(0.09, 2.45 - sill, 0.18, frame, -w / 2 + (i * w) / bays, (2.45 + sill) / 2, 0));
  }
  g.add(boxMesh(w, 0.05, 0.18, frame, 0, (2.45 + sill) / 2, 0));
  const glass = new THREE.Mesh(planeGeo(w - 0.1, 2.45 - sill), ps1Material({
    color: 0x9fc0d4, transparent: true, opacity: 0.14, depthWrite: false, jitter: 0.9, side: THREE.DoubleSide,
  }));
  glass.position.set(0, (2.45 + sill) / 2, -0.02);
  g.add(glass);
  return g;
}

/**
 * The view out of the window: a flat pre-rendered-looking cityscape on one
 * big unlit quad (SPEC 10.5). Faces **+Z**; origin at the quad centre.
 * @param {Object} [o] @param {number} [o.w=26] @param {number} [o.h=13]
 * @returns {THREE.Group}
 */
export function cityscapeBackdrop(o = {}) {
  const w = o.w === undefined ? 26 : o.w;
  const h = o.h === undefined ? 13 : o.h;
  const g = new THREE.Group();
  g.name = 'cityscapeBackdrop';
  const m = new THREE.Mesh(planeGeo(w, h), ps1Material({
    map: cityTexture(), color: 0xf0f2f0, unlit: 1, jitter: 0, affine: false,
  }));
  m.renderOrder = -1;
  g.add(m);
  return g;
}

/**
 * The carpet. A horizontal tiled plane, tessellated enough for the vertex
 * lighting to carry a gradient across the floor.
 * @param {Object} [o]
 * @param {number} [o.w=26] X @param {number} [o.d=14] Z
 * @param {number} [o.repeat=1.1] carpet tiles per metre
 * @param {number} [o.segs=10] @param {number} [o.segsZ]
 * @returns {THREE.Group}
 */
export function floorTiles(o = {}) {
  const w = o.w === undefined ? 26 : o.w;
  const d = o.d === undefined ? 14 : o.d;
  const rep = o.repeat === undefined ? 1.1 : o.repeat;
  const sx = o.segs === undefined ? 10 : o.segs;
  const sz = o.segsZ === undefined ? Math.max(4, Math.round(sx * (d / w))) : o.segsZ;
  const g = new THREE.Group();
  g.name = 'floorTiles';
  const geo = new THREE.PlaneGeometry(w, d, sx, sz);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * w * rep, uv.getY(i) * d * rep);
  }
  uv.needsUpdate = true;
  const m = new THREE.Mesh(geo, ps1Material({ map: carpetTexture(), color: 0xffffff, jitter: 1 }));
  m.rotation.x = -Math.PI / 2;
  g.add(m);
  return g;
}

/**
 * A run of break-room counter with a kick plate and an optional stainless sink.
 * Runs along **X**, front faces **+Z**. Origin on the floor.
 * @param {Object} [o]
 * @param {number} [o.w=3] @param {number} [o.d=0.6] @param {number} [o.h=0.9]
 * @param {boolean} [o.sink=false] @param {number} [o.sinkX=0]
 * @returns {THREE.Group}
 */
export function counter(o = {}) {
  const w = o.w === undefined ? 3 : o.w;
  const d = o.d === undefined ? 0.6 : o.d;
  const h = o.h === undefined ? 0.9 : o.h;
  const g = new THREE.Group();
  g.name = 'counter';
  g.add(boxMesh(w, h - 0.12, d - 0.06, { color: PALETTE.beigeDark, jitter: 0.9 }, 0, (h - 0.12) / 2 + 0.1, -0.03));
  g.add(boxMesh(w, 0.06, d, { color: 0x6e6a60, jitter: 0.9 }, 0, h - 0.03, 0));
  g.add(boxMesh(w - 0.06, 0.1, 0.03, { color: 0x4d4740 }, 0, 0.05, d / 2 - 0.09));
  for (let i = 1; i < Math.round(w / 1.2); i++) {
    g.add(boxMesh(0.02, h - 0.2, 0.02, { color: 0x8d8574 }, -w / 2 + i * 1.2, (h - 0.2) / 2 + 0.12, d / 2 - 0.04));
  }
  if (o.sink) {
    const x = o.sinkX === undefined ? 0 : o.sinkX;
    g.add(boxMesh(0.44, 0.04, 0.34, { color: 0x9aa0a4, jitter: 0.85 }, x, h - 0.05, 0));
    g.add(boxMesh(0.38, 0.06, 0.28, { color: 0x4a5055 }, x, h - 0.08, 0));
    g.add(cylMesh(0.016, 0.016, 0.22, 5, { color: 0x9aa0a4 }, x, h + 0.11, -0.16));
    g.add(boxMesh(0.02, 0.02, 0.14, { color: 0x9aa0a4 }, x, h + 0.21, -0.1));
    g.add(boxMesh(0.06, 0.09, 0.06, { color: 0x3f6e8c }, x + 0.14, h + 0.06, -0.14));
  }
  return g;
}

/**
 * Disposes every geometry and texture this module has cached. Only the page
 * teardown should call this — the caches are shared across all props.
 * @returns {void}
 */
export function disposeSharedAssets() {
  for (const g of GEO.values()) g.dispose();
  GEO.clear();
  for (const k of Object.keys(TEX)) {
    TEX[k].dispose();
    delete TEX[k];
  }
}
