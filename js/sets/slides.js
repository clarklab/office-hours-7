/**
 * OFFICE HOURS — the MUNCH, Inc. slide deck.
 *
 * One corporate template (navy title bar, green rule, bitten-disc MUNCH mark,
 * a footer of dry legal text and a slide counter that never ends) and ~16
 * slides built on it. Every slide is a small canvas texture from
 * `makeTexture()`, drawn entirely with `fillRect` and a built-in bitmap font,
 * so it stays crisp under nearest filtering and never looks like a vector.
 *
 * ```js
 * import { slideTexture } from '/js/sets/slides.js';
 * board.userData.setDrawing(slideTexture('barChart'));
 * screen.userData.setScreen(slideTexture('announcement', { text: 'TAKE YOUR DOG TO WORK DAY' }));
 * board.userData.setDrawing(slideTexture('kpi', { wide: true }));   // 2:1 boards
 * ```
 *
 * Sizes: 128x96 (4:3) by default — projector screen, CRTs, the bullpen board.
 * `opts.wide` gives 192x96 (2:1) for the meeting-room whiteboard / logo wall.
 *
 * Every slide also takes the template opts: `title` (title-bar text),
 * `n` (slide number), `footer` (footer text), `wide` (2:1 canvas).
 *
 * @module sets/slides
 */

import { makeTexture } from '/js/core/ps1.js';

/* ----------------------------------------------------------------- colours */

const C = {
  paper: '#e4e5dc',
  paperDark: '#d2d4c9',
  ink: '#23272c',
  gray: '#6b7076',
  grayLight: '#a9ada6',
  navy: '#1d2a4a',
  navyLight: '#2b3d66',
  green: '#2f7d5e',
  greenLight: '#6cc49a',
  red: '#b0362c',
  redDark: '#7a241d',
  amber: '#c8913a',
  yellow: '#efd66a',
  blue: '#2f5aa0',
  white: '#f4f4ec',
  black: '#101214',
  sky: '#7fa3c4',
  brown: '#8a5e36',
};

/* ------------------------------------------------------------ bitmap fonts */

/** 5x7 caps font, one number per row, bit 4 = leftmost pixel. */
const BIG = {
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14], D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14], J: [7, 2, 2, 2, 2, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 17, 25, 21, 19, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14], P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14],
  2: [14, 17, 1, 2, 4, 8, 31], 3: [31, 2, 4, 2, 1, 17, 14],
  4: [2, 6, 10, 18, 31, 2, 2], 5: [31, 16, 30, 1, 1, 17, 14],
  6: [6, 8, 16, 30, 17, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8],
  8: [14, 17, 17, 14, 17, 17, 14], 9: [14, 17, 17, 15, 1, 2, 12],
  ' ': [0, 0, 0, 0, 0, 0, 0], '.': [0, 0, 0, 0, 0, 12, 12],
  ',': [0, 0, 0, 0, 12, 4, 8], '!': [4, 4, 4, 4, 4, 0, 4],
  '?': [14, 17, 1, 2, 4, 0, 4], ':': [0, 12, 12, 0, 12, 12, 0],
  "'": [12, 4, 8, 0, 0, 0, 0], '"': [10, 10, 0, 0, 0, 0, 0],
  '-': [0, 0, 0, 31, 0, 0, 0], '+': [0, 4, 4, 31, 4, 4, 0],
  '/': [1, 1, 2, 4, 8, 16, 16], '$': [4, 15, 20, 14, 5, 30, 4],
  '%': [24, 25, 2, 4, 8, 19, 3], '#': [10, 10, 31, 10, 31, 10, 10],
  '&': [12, 18, 20, 8, 21, 18, 13], '(': [2, 4, 8, 8, 8, 4, 2],
  ')': [8, 4, 2, 2, 2, 4, 8], '@': [14, 17, 23, 21, 23, 16, 15],
  '=': [0, 0, 31, 0, 31, 0, 0], '*': [0, 4, 21, 14, 21, 4, 0],
  '_': [0, 0, 0, 0, 0, 0, 31], '<': [2, 4, 8, 16, 8, 4, 2],
  '>': [8, 4, 2, 1, 2, 4, 8], '·': [0, 0, 0, 12, 12, 0, 0],
};

/** 3x5 caps font for labels, bit 2 = leftmost pixel. */
const SMALL = {
  A: [2, 5, 7, 5, 5], B: [6, 5, 6, 5, 6], C: [3, 4, 4, 4, 3], D: [6, 5, 5, 5, 6],
  E: [7, 4, 6, 4, 7], F: [7, 4, 6, 4, 4], G: [3, 4, 5, 5, 3], H: [5, 5, 7, 5, 5],
  I: [7, 2, 2, 2, 7], J: [1, 1, 1, 5, 2], K: [5, 5, 6, 5, 5], L: [4, 4, 4, 4, 7],
  M: [5, 7, 7, 5, 5], N: [6, 5, 5, 5, 5], O: [2, 5, 5, 5, 2], P: [6, 5, 6, 4, 4],
  Q: [2, 5, 5, 6, 3], R: [6, 5, 6, 5, 5], S: [3, 4, 2, 1, 6], T: [7, 2, 2, 2, 2],
  U: [5, 5, 5, 5, 7], V: [5, 5, 5, 5, 2], W: [5, 5, 7, 7, 5], X: [5, 5, 2, 5, 5],
  Y: [5, 5, 2, 2, 2], Z: [7, 1, 2, 4, 7],
  0: [7, 5, 5, 5, 7], 1: [2, 6, 2, 2, 7], 2: [6, 1, 2, 4, 7], 3: [6, 1, 2, 1, 6],
  4: [5, 5, 7, 1, 1], 5: [7, 4, 6, 1, 6], 6: [3, 4, 7, 5, 7], 7: [7, 1, 2, 2, 2],
  8: [7, 5, 7, 5, 7], 9: [7, 5, 7, 1, 6],
  ' ': [0, 0, 0, 0, 0], '.': [0, 0, 0, 0, 2], ',': [0, 0, 0, 2, 4],
  '!': [2, 2, 2, 0, 2], '?': [6, 1, 2, 0, 2], ':': [0, 2, 0, 2, 0],
  "'": [2, 2, 0, 0, 0], '"': [5, 5, 0, 0, 0], '-': [0, 0, 7, 0, 0],
  '+': [0, 2, 7, 2, 0], '/': [1, 1, 2, 4, 4], '$': [3, 6, 2, 3, 6],
  '%': [5, 1, 2, 4, 5], '#': [5, 7, 5, 7, 5], '(': [1, 2, 2, 2, 1],
  ')': [4, 2, 2, 2, 4], '@': [2, 5, 7, 4, 3], '=': [0, 7, 0, 7, 0],
  '*': [0, 5, 2, 5, 0], '&': [2, 5, 2, 5, 3], '_': [0, 0, 0, 0, 7],
  '<': [1, 2, 4, 2, 1], '>': [4, 2, 1, 2, 4], '·': [0, 0, 2, 0, 0],
};

// the 3px-wide '#' reads as an H, so it gets five columns (#REF! must read)
SMALL['#'] = Object.assign([10, 31, 10, 31, 10], { w: 5 });
SMALL['@'] = Object.assign([14, 17, 23, 22, 15], { w: 5 });

const FONTS = {
  big: { g: BIG, w: 5, h: 7 },
  small: { g: SMALL, w: 3, h: 5 },
};

/** Normalise punctuation the fonts do not carry. @param {string} s */
function norm(s) {
  return String(s == null ? '' : s).toUpperCase()
    .replace(/[—–]/g, '-').replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"').replace(/…/g, '...');
}

/**
 * Width in pixels of `str` in the given font options.
 * @param {string} str @param {{font?:string, sx?:number, s?:number}} [o]
 * @returns {number}
 */
function measure(str, o = {}) {
  const f = FONTS[o.font || 'big'];
  const sx = o.sx || o.s || 1;
  const s = norm(str);
  let w = 0;
  for (const ch of s) w += (glyphW(f, ch) + 1) * sx;
  return s.length ? w - sx : 0;
}

/** Advance width of one glyph (a few small glyphs are wider than 3px). */
function glyphW(f, ch) {
  const g = f.g[ch] || f.g['?'];
  return g.w || f.w;
}

/**
 * Draws bitmap caps text. `y` is the TOP of the glyphs.
 * @param {CanvasRenderingContext2D} c @param {string} str
 * @param {number} x @param {number} y
 * @param {Object} [o]
 * @param {'big'|'small'} [o.font='big'] @param {number} [o.s=1] uniform scale
 * @param {number} [o.sx] @param {number} [o.sy] per-axis scale (sy 2 = tall condensed)
 * @param {string} [o.col] @param {'left'|'center'|'right'} [o.align='left']
 * @param {string} [o.outline] 1px outline colour (meme captions, text on busy art)
 * @param {string} [o.shadow] 1px drop-shadow colour
 * @returns {number} drawn width
 */
function text(c, str, x, y, o = {}) {
  const f = FONTS[o.font || 'big'];
  const sx = o.sx || o.s || 1;
  const sy = o.sy || o.s || 1;
  const s = norm(str);
  const w = measure(s, o);
  let x0 = x;
  if (o.align === 'center') x0 = x - Math.floor(w / 2);
  else if (o.align === 'right') x0 = x - w;
  x0 = Math.round(x0);
  y = Math.round(y);
  const paint = (ox, oy, col) => {
    c.fillStyle = col;
    let gx = x0 + ox;
    for (let i = 0; i < s.length; i++) {
      const g = f.g[s[i]] || f.g['?'];
      const gw = g.w || f.w;
      for (let r = 0; r < f.h; r++) {
        const bits = g[r];
        if (!bits) continue;
        for (let b = 0; b < gw; b++) {
          if (bits & (1 << (gw - 1 - b))) c.fillRect(gx + b * sx, y + r * sy + oy, sx, sy);
        }
      }
      gx += (gw + 1) * sx;
    }
  };
  if (o.outline) {
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if (ox || oy) paint(ox, oy, o.outline);
  }
  if (o.shadow) paint(1, 1, o.shadow);
  paint(0, 0, o.col || C.ink);
  return w;
}

/**
 * Greedy word wrap to a pixel width. `\n` forces a break.
 * @param {string} str @param {number} maxW @param {Object} [o] font options
 * @returns {string[]}
 */
function wrap(str, maxW, o = {}) {
  const out = [];
  for (const para of norm(str).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (measure(next, o) <= maxW || !line) line = next;
      else { out.push(line); line = word; }
    }
    out.push(line);
  }
  return out;
}

/**
 * Picks the largest font setting whose wrapped text fits a box.
 * @param {string} str @param {number} maxW @param {number} maxH
 * @param {Object[]} tries font option sets, largest first
 * @param {number} [lead=2] extra pixels between lines (scaled by sy)
 * @returns {{o:Object, lines:string[], lh:number}}
 */
function fit(str, maxW, maxH, tries, lead = 2) {
  let best = null;
  for (const o of tries) {
    const f = FONTS[o.font || 'big'];
    const sy = o.sy || o.s || 1;
    const lh = f.h * sy + lead * Math.max(1, sy - 0);
    const lines = wrap(str, maxW, o);
    best = { o, lines, lh };
    const widest = Math.max(...lines.map((l) => measure(l, o)));
    if (widest <= maxW && lines.length * lh - lead <= maxH) return best;
  }
  return best;
}

/* ------------------------------------------------------------ pixel shapes */

/** @param {CanvasRenderingContext2D} c */
function rect(c, col, x, y, w, h) {
  c.fillStyle = col;
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** 1px rectangle outline. */
function frame(c, col, x, y, w, h) {
  rect(c, col, x, y, w, 1);
  rect(c, col, x, y + h - 1, w, 1);
  rect(c, col, x, y, 1, h);
  rect(c, col, x + w - 1, y, 1, h);
}

/** Checkerboard dither of `col` over a rect (the only "gradient" we allow). */
function dither(c, col, x, y, w, h, phase = 0) {
  c.fillStyle = col;
  for (let j = 0; j < h; j++) {
    for (let i = (j + phase) & 1; i < w; i += 2) c.fillRect(x + i, y + j, 1, 1);
  }
}

/** Deterministic 0..1 noise. */
function rnd(i) {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Filled pixel disc (scanline, no anti-aliasing). */
function disc(c, cx, cy, r, col) {
  c.fillStyle = col;
  for (let y = -r; y <= r; y++) {
    const half = Math.floor(Math.sqrt((r + 0.4) * (r + 0.4) - y * y));
    c.fillRect(cx - half, cy + y, half * 2 + 1, 1);
  }
}

/** Per-pixel painter over a disc's bounding box. `fn(dx,dy,d)` returns a colour or null. */
function discPixels(c, cx, cy, r, fn) {
  for (let y = -r - 1; y <= r + 1; y++) {
    for (let x = -r - 1; x <= r + 1; x++) {
      const d = Math.sqrt(x * x + y * y);
      const col = fn(x, y, d);
      if (col) { c.fillStyle = col; c.fillRect(cx + x, cy + y, 1, 1); }
    }
  }
}

/** Bresenham line, `t`-pixel square brush, optional dash [on, off]. */
function line(c, x0, y0, x1, y1, col, t = 1, dash = null) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let step = 0;
  const o = Math.floor((t - 1) / 2);
  c.fillStyle = col;
  for (;;) {
    if (!dash || (step % (dash[0] + dash[1])) < dash[0]) c.fillRect(x0 - o, y0 - o, t, t);
    step++;
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/** Filled triangle via per-row scan (crisp). */
function tri(c, col, ax, ay, bx, by, cx, cy) {
  const minY = Math.floor(Math.min(ay, by, cy)), maxY = Math.ceil(Math.max(ay, by, cy));
  c.fillStyle = col;
  const edges = [[ax, ay, bx, by], [bx, by, cx, cy], [cx, cy, ax, ay]];
  for (let y = minY; y <= maxY; y++) {
    const yc = y + 0.5;
    const xs = [];
    for (const [x0, y0, x1, y1] of edges) {
      if ((yc >= y0 && yc < y1) || (yc >= y1 && yc < y0)) xs.push(x0 + ((yc - y0) / (y1 - y0)) * (x1 - x0));
    }
    if (xs.length >= 2) {
      const l = Math.round(Math.min(...xs)), r = Math.round(Math.max(...xs));
      if (r > l) c.fillRect(l, y, r - l, 1);
    }
  }
}

/**
 * Draws a sprite from a string grid. `map` maps chars to colours; '.' is clear.
 * @param {CanvasRenderingContext2D} c @param {string[]} rows
 * @param {number} x @param {number} y @param {Object<string,string>} map
 * @param {number} [s=1] scale @param {boolean} [flip=false] mirror horizontally
 */
function sprite(c, rows, x, y, map, s = 1, flip = false) {
  for (let j = 0; j < rows.length; j++) {
    const row = rows[j];
    for (let i = 0; i < row.length; i++) {
      const col = map[row[i]];
      if (!col) continue;
      c.fillStyle = col;
      const ix = flip ? row.length - 1 - i : i;
      c.fillRect(x + ix * s, y + j * s, s, s);
    }
  }
}

/* ----------------------------------------------------------------- sprites */

const PAW = [
  '..X.X..',
  '..X.X..',
  'X.....X',
  'X.XXX.X',
  '..XXX..',
  '.XXXXX.',
  '.XX.XX.',
];

const HEART = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];
const REPOST = ['.X.....', 'XXXXXX.', '.X...X.', '.X...X.', '.XXXXXX', '.....X.'];
const REPLY = ['.XXXXX.', 'X.....X', 'X.....X', '.XXXXX.', '.X.....', 'X......'];
const EYE = ['.XXX.', 'X.X.X', '.XXX.'];

/** An original chubby round bird — the "PEEP" app mascot. Not anyone's logo. */
const BIRD = [
  '...XXXX...',
  '..XXXXXX..',
  '.XXXXXoXX.',
  '.XXXXXXXBB',
  'XWWXXXXXB.',
  'XWWWXXXX..',
  '.XWXXXXX..',
  '..XXXXX...',
  '...L..L...',
];
const BIRD_MAP = { X: '#d9822b', W: '#a95f1c', o: '#141414', B: '#f2c14e', L: '#6b4a2b' };

const ROCKET = [
  '....X....',
  '...XXX...',
  '...XXX...',
  '..XXXXX..',
  '..XXBXX..',
  '..XBBBX..',
  '..XXBXX..',
  '..XXXXX..',
  '..XXXXX..',
  '..XXXXX..',
  '.RXXXXXR.',
  'RRXXXXXRR',
  'RR.XXX.RR',
  '...FYF...',
  '...FYF...',
  '....F....',
];
const ROCKET_MAP = { X: '#eeeee6', B: '#3d6fb5', R: C.red, F: '#e8742b', Y: '#f7d65a' };

/** Tuesday, the unauthorised dog, facing left. */
const DOG = [
  '.EE.............',
  'EDDD............',
  'DDoDD...........',
  'NDDDDD.......T..',
  '.DDDDDDDDDDDDT..',
  '...DDDDDDDDDD...',
  '...DDDDDDDDDD...',
  '...D.D....D.D...',
  '...D.D....D.D...',
];
const DOG_MAP = { D: '#a2703f', E: '#5e3d22', o: '#111', N: '#111', T: '#a2703f' };

/* ---------------------------------------------------------- the MUNCH mark */

/**
 * The MUNCH, Inc. mark: a green disc with a bite taken out of the top right.
 * The bite is painted in `bg`, so pass whatever is behind it.
 */
function munchMark(c, cx, cy, r, bg) {
  disc(c, cx, cy, r, C.green);
  // a highlight so it reads as a round thing at 5px
  if (r >= 4) disc(c, cx - Math.round(r * 0.35), cy - Math.round(r * 0.35), Math.max(1, Math.round(r * 0.3)), C.greenLight);
  // the bite: three overlapping scallops
  const br = Math.max(1, Math.round(r * 0.34));
  const bx = cx + Math.round(r * 0.78), by = cy - Math.round(r * 0.78);
  disc(c, bx, by, br, bg);
  disc(c, bx - Math.round(r * 0.42), by - Math.round(r * 0.08), br, bg);
  disc(c, bx + Math.round(r * 0.08), by + Math.round(r * 0.42), br, bg);
}

/* ---------------------------------------------------------------- template */

/**
 * The shared deck template. Returns the content box.
 * @param {CanvasRenderingContext2D} c @param {number} W @param {number} H
 * @param {{title:string, n:number, footer:string}} t
 * @returns {{x:number,y:number,w:number,h:number,cx:number,cy:number}}
 */
function template(c, W, H, t) {
  rect(c, C.paper, 0, 0, W, H);
  // the faint toner speckle every projected slide has
  for (let i = 0; i < 70; i++) rect(c, C.paperDark, (rnd(i) * W) | 0, (rnd(i + 90) * H) | 0, 1, 1);
  // title bar
  rect(c, C.navy, 0, 0, W, 15);
  rect(c, C.navyLight, 0, 0, W, 1);
  rect(c, C.green, 0, 15, W, 2);
  munchMark(c, W - 9, 7, 5, C.navy);
  const title = norm(t.title);
  if (measure(title) <= W - 24) text(c, title, 5, 4, { col: C.white });
  else text(c, title, 5, 5, { font: 'small', col: C.white });
  // footer
  rect(c, C.grayLight, 4, H - 9, W - 8, 1);
  text(c, t.footer, 4, H - 7, { font: 'small', col: C.gray });
  text(c, `${t.n}/212`, W - 4, H - 7, { font: 'small', col: C.gray, align: 'right' });
  const box = { x: 4, y: 19, w: W - 8, h: H - 19 - 11 };
  return { ...box, cx: box.x + box.w / 2, cy: box.y + box.h / 2 };
}

/** Navy cover background shared by `title` and `thanks`. */
function coverBg(c, W, H) {
  rect(c, C.navy, 0, 0, W, H);
  rect(c, C.navyLight, 0, 0, W, 6);
  dither(c, C.navyLight, 0, 6, W, 4);
  dither(c, C.navy, 0, 6, W, 2, 1);
}

/* ------------------------------------------------------------ chart pieces */

/** Axes with dotted gridlines. Returns the plot rect. */
function axes(c, x, y, w, h, ticks = 4, labels = null) {
  for (let i = 1; i <= ticks; i++) {
    const gy = Math.round(y + h - (h * i) / ticks);
    for (let gx = x + 2; gx < x + w; gx += 3) rect(c, C.grayLight, gx, gy, 1, 1);
    if (labels) text(c, labels[i], x - 2, gy - 2, { font: 'small', col: C.gray, align: 'right' });
  }
  rect(c, C.ink, x, y, 1, h + 1);
  rect(c, C.ink, x, y + h, w, 1);
}

/* ------------------------------------------------------------------ slides */

/**
 * @typedef {Object} SlideDef
 * @property {string} desc one-line description for authoring docs
 * @property {Object<string,string>} opts slide-specific opts and what they do
 * @property {string} title default title-bar text
 * @property {string} footer default footer text
 * @property {(c:CanvasRenderingContext2D, W:number, H:number, o:Object, n:number) => void} draw
 */

/** @type {Object<string, SlideDef>} */
const SLIDES = {
  /* ------------------------------------------------------------- title */
  title: {
    desc: 'Deck cover: MUNCH wordmark, "The Everything Layer", a big title and subtitle.',
    opts: { title: 'big cover title, e.g. "Q3 ALL HANDS"', subtitle: 'line under it, e.g. "PRESENTED BY BRAD" ("" for none)' },
    title: 'Q3 ALL HANDS',
    footer: 'MUNCH, INC.',
    draw(c, W, H, o) {
      coverBg(c, W, H);
      const cx = W / 2;
      // lockup: mark + wordmark + tagline, centred as a unit
      const wm = measure('MUNCH', { s: 3 });
      const lockW = 22 + 4 + wm;
      const lx = Math.round(cx - lockW / 2);
      munchMark(c, lx + 11, 29, 10, C.navy);
      text(c, 'MUNCH', lx + 26, 19, { s: 3, col: C.white, shadow: C.black });
      text(c, 'THE EVERYTHING LAYER', lx + 26, 43, { font: 'small', col: C.greenLight });
      // title band
      rect(c, C.green, 0, 53, W, 1);
      rect(c, C.paper, 0, 56, W, 20);
      rect(c, C.paperDark, 0, 75, W, 1);
      const t = fit(o.title, W - 8, 16, [{ s: 2 }, { sx: 1, sy: 2 }, {}, { font: 'small' }], 1);
      const lines = t.lines.slice(0, 2);
      const th = lines.length * t.lh - 1;
      lines.forEach((ln, i) => text(c, ln, cx, 66 - Math.floor(th / 2) + i * t.lh, { ...t.o, col: C.navy, align: 'center' }));
      const sub = o.subtitle === undefined ? 'FOR INTERNAL USE ONLY' : o.subtitle;
      if (sub) text(c, sub, cx, 80, { font: 'small', col: C.grayLight, align: 'center' });
      text(c, o.footer, 4, H - 7, { font: 'small', col: C.gray });
      text(c, 'V14 FINAL', W - 4, H - 7, { font: 'small', col: C.gray, align: 'right' });
    },
  },

  /* ------------------------------------------------------------ agenda */
  agenda: {
    desc: 'Numbered agenda; one item struck through.',
    opts: { items: 'array of up to 5 short strings', strike: 'index of the item to strike out (-1 for none)' },
    title: 'AGENDA',
    footer: 'DO NOT SHOW DOG',
    draw(c, W, H, o, n, B) {
      const items = (o.items || ['WELCOME', 'WINS', 'LEARNINGS', 'RESTRUCTURE', 'Q&A (BRIEF)']).slice(0, 5);
      const strike = o.strike === undefined ? 1 : o.strike;
      const pitch = Math.min(13, Math.floor(B.h / items.length));
      items.forEach((it, i) => {
        const y = B.y + 3 + i * pitch;
        rect(c, C.green, B.x + 4, y, 9, 9);
        text(c, String(i + 1), B.x + 6, y + 2, { font: 'small', col: C.white });
        const w = text(c, it, B.x + 18, y + 1, { col: i === strike ? C.grayLight : C.ink });
        if (i === strike) rect(c, C.red, B.x + 16, y + 4, w + 4, 1);
      });
      text(c, '60 MIN', B.x + B.w - 2, B.y + 3, { font: 'small', col: C.gray, align: 'right' });
      text(c, '(90)', B.x + B.w - 2, B.y + 10, { font: 'small', col: C.red, align: 'right' });
    },
  },

  /* ---------------------------------------------------------- lineChart */
  lineChart: {
    desc: 'Plan vs actual line chart: the dashed plan soars, the actual does not.',
    opts: { plan: 'array of 0..100 values', actual: 'array of 0..100 values', labels: 'x-axis labels' },
    title: 'REVENUE',
    footer: 'FORWARD-LOOKING. SORRY.',
    draw(c, W, H, o, n, B) {
      const plan = o.plan || [12, 24, 48, 96];
      const actual = o.actual || [12, 9, 5, 2];
      const labels = o.labels || ['Q1', 'Q2', 'Q3', 'Q4'];
      const px = B.x + 12, py = B.y + 4, pw = B.w - 16, ph = B.h - 12;
      axes(c, px, py, pw, ph, 4, ['', '', '', '', '$$$']);
      const xAt = (i, arr) => px + 4 + Math.round((i * (pw - 10)) / (arr.length - 1));
      const yAt = (v) => py + ph - 1 - Math.round((Math.min(100, v) / 100) * (ph - 2));
      for (let i = 0; i < labels.length; i++) text(c, labels[i], xAt(i, labels), py + ph + 3, { font: 'small', col: C.gray, align: 'center' });
      for (let i = 1; i < plan.length; i++) line(c, xAt(i - 1, plan), yAt(plan[i - 1]), xAt(i, plan), yAt(plan[i]), C.green, 2, [3, 2]);
      for (let i = 1; i < actual.length; i++) line(c, xAt(i - 1, actual), yAt(actual[i - 1]), xAt(i, actual), yAt(actual[i]), C.red, 2);
      for (let i = 0; i < actual.length; i++) rect(c, C.redDark, xAt(i, actual) - 1, yAt(actual[i]) - 1, 3, 3);
      // legend
      const lx = px + 5, ly = py + 1;
      line(c, lx, ly + 2, lx + 7, ly + 2, C.green, 2, [3, 2]);
      text(c, 'PLAN', lx + 10, ly, { font: 'small', col: C.green });
      line(c, lx, ly + 9, lx + 7, ly + 9, C.red, 2);
      text(c, 'ACTUAL', lx + 10, ly + 7, { font: 'small', col: C.red });
    },
  },

  /* ----------------------------------------------------------- barChart */
  barChart: {
    desc: 'Bar chart where one bar is absurdly off the scale and breaks through the chart.',
    opts: { values: 'array of numbers', labels: 'array of short labels (<=5 chars)' },
    title: 'MEETINGS / WEEK',
    footer: 'SOURCE: VIBES',
    draw(c, W, H, o, n, B) {
      const values = o.values || [3, 4, 2, 5, 61];
      const labels = o.labels || ['ENG', 'SALES', 'OPS', 'HR', 'BRAD'];
      const sorted = [...values].sort((a, b) => b - a);
      const outlier = sorted.length > 1 && sorted[0] > sorted[1] * 3;
      const max = o.max || Math.max(3, Math.ceil(((outlier ? sorted[1] : sorted[0]) * 1.4) / 3) * 3);
      const px = B.x + 10, py = B.y + 2, pw = B.w - 12, ph = B.h - 10;
      axes(c, px, py, pw, ph, 3, ['', ...[1, 2, 3].map((i) => String(Math.round((max * i) / 3)))]);
      const slot = Math.floor(pw / values.length);
      const bw = Math.max(4, Math.floor(slot * 0.6));
      values.forEach((v, i) => {
        const bx = px + 1 + i * slot + Math.floor((slot - bw) / 2);
        const over = v > max;
        const bh = over ? ph + 6 : Math.max(1, Math.round((v / max) * ph));
        const by = py + ph - bh;
        const col = over ? C.red : C.navy;
        rect(c, col, bx, by, bw, bh);
        rect(c, over ? C.redDark : C.navyLight, bx + bw - 2, by, 2, bh);
        text(c, labels[i] || '', bx + bw / 2, py + ph + 3, { font: 'small', col: C.gray, align: 'center' });
        if (over) {
          // the bar tears the chart — a zigzag break and a big number
          for (let k = 0; k < bw; k += 2) rect(c, C.paper, bx + k, by + (k % 4 === 0 ? 0 : 1), 2, 2);
          text(c, String(v), bx - 3, by + 6, { col: C.red, align: 'right', outline: C.paper });
        } else {
          text(c, String(v), bx + bw / 2, by - 6, { font: 'small', col: C.ink, align: 'center' });
        }
      });
    },
  },

  /* ----------------------------------------------------------- pieChart */
  pieChart: {
    desc: 'Pie chart: 94% snacks.',
    opts: { slices: 'array of {label, pct} (pct sums to 100), first slice is the joke' },
    title: 'WHERE IT WENT',
    footer: 'UNAUDITED',
    draw(c, W, H, o, n, B) {
      const slices = o.slices || [
        { label: 'SNACKS', pct: 94 }, { label: 'PRODUCT', pct: 4 }, { label: '???', pct: 2 },
      ];
      const cols = [C.green, C.navy, C.red, C.amber, C.blue];
      const r = Math.min(27, Math.floor(B.h / 2) - 2);
      const pcx = Math.max(B.x + r + 6, Math.round(B.cx - (2 * r + 64) / 2 + r)), pcy = Math.round(B.cy);
      rect(c, C.grayLight, pcx - r + 2, pcy + r - 1, r * 2, 3); // a cast shadow, 1997-style
      const ends = [];
      let acc = 0;
      for (const s of slices) { acc += s.pct; ends.push(acc / 100); }
      discPixels(c, pcx, pcy, r, (x, y, d) => {
        if (d > r + 0.4) return null;
        if (d > r - 0.6) return C.ink;
        let a = Math.atan2(x, -y) / (Math.PI * 2);
        if (a < 0) a += 1;
        let k = ends.findIndex((e) => a <= e);
        if (k < 0) k = slices.length - 1;
        return cols[k % cols.length];
      });
      // highlight arc on the big slice so it reads as a disc
      discPixels(c, pcx, pcy, r, (x, y, d) => (d > r - 3.5 && d <= r - 1.5 && x < -y * 0.2 && y < 0 && x < 0 ? C.greenLight : null));
      // legend
      const lx = pcx + r + 8;
      slices.forEach((s, i) => {
        const ly = B.y + 5 + i * 17;
        rect(c, cols[i % cols.length], lx, ly, 6, 6);
        text(c, `${s.pct}%`, lx + 9, ly, { col: i === 0 ? C.green : C.ink });
        text(c, s.label, lx + 9, ly + 9, { font: 'small', col: C.gray });
      });
    },
  },

  /* -------------------------------------------------------- spreadsheet */
  spreadsheet: {
    desc: 'Spreadsheet screenshot: column letters, row numbers, #REF!/#DIV/0!, one selected cell.',
    opts: { rows: 'array of 4-cell string rows (first row is the header)', highlight: '[col,row] of the selected cell (0-based into rows)', formula: 'formula-bar text' },
    title: 'Q3_FINAL_V9.XLS',
    footer: 'DO NOT SORT',
    draw(c, W, H, o, n, B) {
      const rows = (o.rows || [
        ['ITEM', 'Q1', 'Q2', 'Q3'],
        ['REVENUE', '12', '9', '#REF!'],
        ['COSTS', '40', '88', '131'],
        ['SNACKS', '30', '71', '#DIV/0!'],
        ['MARGIN', '-28', '-79', '#DIV/0!'],
        ['RUNWAY', '9MO', '3MO', '11D'],
      ]).slice(0, 6);
      const hl = o.highlight || [3, 5];
      const RH = 8, RN = 9;
      const weights = [3, 2, 2, 3];
      const rest = B.w - RN;
      const cw = weights.map((wt) => Math.floor((rest * wt) / 10));
      cw[3] = rest - cw[0] - cw[1] - cw[2];
      const x0 = B.x, y0 = B.y;
      // formula bar
      rect(c, C.white, x0, y0, B.w, RH);
      frame(c, C.grayLight, x0, y0, B.w, RH);
      const ref = `${'ABCD'[hl[0]]}${hl[1] + 1}`;
      text(c, ref, x0 + 2, y0 + 2, { font: 'small', col: C.ink });
      text(c, 'FX', x0 + 17, y0 + 2, { font: 'small', col: C.gray });
      text(c, o.formula || '=RUNWAY-HOPE', x0 + 27, y0 + 2, { font: 'small', col: C.ink });
      const gy = y0 + RH + 1;
      // column header row
      rect(c, C.paperDark, x0, gy, B.w, RH);
      let cx = x0 + RN;
      cw.forEach((w, i) => {
        text(c, 'ABCD'[i], cx + w / 2, gy + 2, { font: 'small', col: i === hl[0] ? C.green : C.gray, align: 'center' });
        cx += w;
      });
      // cells
      rows.forEach((row, r) => {
        const ry = gy + RH * (r + 1);
        rect(c, r === 0 ? '#eef0e6' : C.white, x0 + RN, ry, B.w - RN, RH);
        rect(c, C.paperDark, x0, ry, RN, RH);
        text(c, String(r + 1), x0 + RN / 2, ry + 2, { font: 'small', col: r === hl[1] ? C.green : C.gray, align: 'center' });
        let x = x0 + RN;
        row.slice(0, 4).forEach((v, i) => {
          const w = cw[i];
          const s = norm(v);
          const isErr = s.startsWith('#');
          const isNum = /^-?[\d$.]/.test(s) || isErr;
          const neg = s.startsWith('-');
          if (i === hl[0] && r === hl[1]) rect(c, C.yellow, x, ry, w, RH);
          const col = isErr || neg ? C.red : r === 0 ? C.navy : C.ink;
          if (isNum && r > 0) text(c, s, x + w - 2, ry + 2, { font: 'small', col, align: 'right' });
          else text(c, s, x + 2, ry + 2, { font: 'small', col });
          x += w;
        });
      });
      // gridlines
      const gh = RH * (rows.length + 1);
      for (let r = 0; r <= rows.length + 1; r++) rect(c, C.grayLight, x0, gy + r * RH, B.w, 1);
      let gx = x0;
      for (const w of [RN, ...cw]) { rect(c, C.grayLight, gx, gy, 1, gh); gx += w; }
      rect(c, C.grayLight, x0 + B.w - 1, gy, 1, gh + 1);
      // the selection box, Excel-green, with its fill handle
      const sx = x0 + RN + cw.slice(0, hl[0]).reduce((a, b) => a + b, 0);
      const sy = gy + RH * (hl[1] + 1);
      frame(c, C.green, sx - 1, sy - 1, cw[hl[0]] + 3, RH + 3);
      frame(c, C.green, sx, sy, cw[hl[0]] + 1, RH + 1);
      rect(c, C.green, sx + cw[hl[0]], sy + RH, 3, 3);
    },
  },

  /* --------------------------------------------------------------- meme */
  meme: {
    desc: 'Original two-panel EXPECTATION / REALITY meme: a rocket vs a cardboard box and the dog. Impact-style captions.',
    opts: { top: 'top caption', bottom: 'bottom caption', left: 'left panel label', right: 'right panel label' },
    title: 'CUSTOMER JOURNEY',
    footer: 'APPROVED BY LEGAL (NO)',
    draw(c, W, H, o, n, B) {
      rect(c, C.black, B.x, B.y, B.w, B.h);
      const pw = Math.floor((B.w - 3) / 2), ph = B.h - 2;
      const lx = B.x + 1, rx = B.x + 2 + pw, py = B.y + 1;
      // LEFT: the pitch. Night sky, stars, a rocket.
      rect(c, '#2a3f6b', lx, py, pw, ph);
      dither(c, '#3c5a8f', lx, py + ph - 14, pw, 6);
      rect(c, '#3c5a8f', lx, py + ph - 8, pw, 8);
      for (let i = 0; i < 18; i++) rect(c, C.white, lx + ((rnd(i + 7) * pw) | 0), py + ((rnd(i + 31) * (ph - 16)) | 0), 1, 1);
      const rkx = lx + Math.floor(pw / 2) - 4, rky = py + 27;
      sprite(c, ROCKET, rkx, rky, ROCKET_MAP);
      dither(c, '#f7d65a', rkx + 2, rky + 16, 5, 6);
      // RIGHT: what shipped. Carpet, a box that says ROCKET, the dog.
      rect(c, '#a49b88', rx, py, pw, ph);
      rect(c, '#50554e', rx, py + 41, pw, ph - 41);
      dither(c, '#3c413c', rx, py + 41, pw, ph - 41);
      rect(c, '#8d8574', rx, py + 39, pw, 2);
      const bx = rx + 6, by = py + 31;
      rect(c, '#b48a57', bx, by, 26, 14);
      rect(c, '#8f6a3f', bx, by, 26, 2);
      rect(c, '#d9c7a0', bx + 11, by, 4, 14);
      text(c, 'ROCKET', bx + 13, by + 6, { font: 'small', col: '#4a3520', align: 'center' });
      // smoke from the box, one sad puff
      dither(c, '#c9cbc2', bx + 19, by - 5, 4, 4);
      dither(c, '#c9cbc2', bx + 22, by - 8, 3, 3, 1);
      sprite(c, DOG, rx + pw - 19, py + 37, DOG_MAP);
      // panel labels
      text(c, o.left || 'EXPECTATION', lx + pw / 2, py + 19, { font: 'small', col: C.yellow, align: 'center', outline: C.black });
      text(c, o.right || 'REALITY', rx + pw / 2, py + 19, { font: 'small', col: C.yellow, align: 'center', outline: C.black });
      // Impact-style captions over both panels
      const cap = (s, y, fromBottom) => {
        const t = fit(s, B.w - 4, 16, [{ sx: 1, sy: 2 }, {}, { font: 'small' }], 1);
        const lines = t.lines.slice(0, 2);
        const y0 = fromBottom ? y - (lines.length * t.lh - 1) : y;
        lines.forEach((ln, i) => text(c, ln, B.cx, y0 + i * t.lh, { ...t.o, col: C.white, outline: C.black, align: 'center' }));
      };
      cap(o.top || 'WHAT WE PITCHED', B.y + 3, false);
      cap(o.bottom || 'WHAT WE SHIPPED', B.y + B.h - 2, true);
    },
  },

  /* ---------------------------------------------------------- billboard */
  billboard: {
    desc: 'Photo of a roadside MUNCH billboard: product shot, slogan, 1-800 number.',
    opts: { slogan: 'billboard slogan', phone: 'phone line', brand: 'wordmark text' },
    title: 'OUT OF HOME',
    footer: 'MOCKUP. NOT PAID FOR.',
    draw(c, W, H, o, n, B) {
      // sky in stepped, dithered bands
      const bands = ['#6f93b8', '#86a6c4', '#9fb8cf', '#b8c9d6'];
      const bh = Math.ceil((B.h - 16) / bands.length);
      bands.forEach((col, i) => {
        rect(c, col, B.x, B.y + i * bh, B.w, bh);
        if (i) dither(c, bands[i - 1], B.x, B.y + i * bh, B.w, 2);
      });
      // hills and road
      const gy = B.y + B.h - 16;
      for (let x = 0; x < B.w; x++) {
        const hh = 4 + Math.round(3 * Math.sin(x * 0.09) + 2 * Math.sin(x * 0.23 + 1));
        rect(c, '#6f7f68', B.x + x, gy - hh, 1, hh);
      }
      rect(c, '#5f6f58', B.x, gy, B.w, 5);
      rect(c, '#4a4d50', B.x, gy + 5, B.w, 11);
      for (let x = B.x + 2; x < B.x + B.w; x += 10) rect(c, C.yellow, x, gy + 10, 5, 1);
      // posts and catwalk
      const bwid = Math.min(B.w - 12, 108), bx = Math.round(B.cx - bwid / 2), by = B.y + 3, bht = 42;
      rect(c, '#3a3d40', bx + 18, by + bht, 3, gy - by - bht + 4);
      rect(c, '#3a3d40', bx + bwid - 21, by + bht, 3, gy - by - bht + 4);
      rect(c, '#55595c', bx + 4, by + bht + 2, bwid - 8, 1);
      for (let x = bx + 6; x < bx + bwid - 6; x += 4) rect(c, '#55595c', x, by + bht, 1, 3);
      // the board
      rect(c, '#2b2e31', bx - 1, by - 1, bwid + 2, bht + 2);
      rect(c, C.white, bx, by, bwid, bht);
      rect(c, C.green, bx, by + bht - 6, bwid, 6);
      // product shot: a MUNCH box, lit like it's worth money
      const px = bx + 5, py = by + 5;
      rect(c, C.navy, px, py + 3, 22, 27);
      rect(c, C.navyLight, px + 22, py + 5, 3, 25);
      tri(c, C.navyLight, px, py + 3, px + 3, py, px + 25, py + 3);
      rect(c, C.navyLight, px + 3, py, 22, 3);
      rect(c, '#e8742b', px + 22, py, 3, 5);
      munchMark(c, px + 11, py + 13, 6, C.navy);
      text(c, 'MUNCH', px + 11, py + 22, { font: 'small', col: C.white, align: 'center' });
      rect(c, C.white, px + 2, py + 5, 1, 20);
      // sparkle
      for (const [sx, sy] of [[px + 26, py - 2], [px - 2, py + 27]]) {
        rect(c, C.yellow, sx - 2, sy, 5, 1);
        rect(c, C.yellow, sx, sy - 2, 1, 5);
      }
      // copy
      const tx = px + 32, tw = bx + bwid - tx - 3, tcx = tx + tw / 2;
      const brand = o.brand || 'MUNCH';
      const bs = measure(brand, { s: 2 }) <= tw ? { s: 2 } : { sx: 1, sy: 2 };
      text(c, brand, tcx, by + 4, { ...bs, col: C.navy, align: 'center' });
      const sl = fit(o.slogan || "IT'S A LAYER.", tw, 8, [{}, { font: 'small' }]);
      text(c, sl.lines[0], tcx, by + 21, { ...sl.o, col: C.ink, align: 'center' });
      text(c, o.phone || '1-800-MUNCH-IT', tcx, by + 30, { font: 'small', col: C.red, align: 'center' });
      text(c, 'THE EVERYTHING LAYER', bx + bwid / 2, by + bht - 5, { font: 'small', col: C.white, align: 'center' });
    },
  },

  /* ------------------------------------------------------------- social */
  social: {
    desc: 'Screenshot of a microblog post on "PEEP" (fictional bird app) from @MUNCHINC, with reply line and dismal counts.',
    opts: { text: 'post text (~50 chars)', name: 'display name', handle: '@handle', replyTo: '@handle being replied to', time: 'timestamp', likes: 'like count', reposts: 'repost count', replies: 'reply count' },
    title: 'SOCIAL SENTIMENT',
    footer: 'DO NOT ENGAGE',
    draw(c, W, H, o, n, B) {
      const cw = Math.min(B.w, 124), x = Math.round(B.cx - cw / 2), y = B.y;
      rect(c, C.white, x, y, cw, B.h);
      frame(c, C.grayLight, x, y, cw, B.h);
      // avatar: the MUNCH mark in a round frame
      disc(c, x + 9, y + 8, 6, C.navy);
      munchMark(c, x + 9, y + 8, 4, C.navy);
      const nw = text(c, o.name || 'MUNCH, INC.', x + 18, y + 3, { col: C.ink });
      // verified-ish badge
      disc(c, x + 18 + nw + 5, y + 6, 3, C.blue);
      rect(c, C.white, x + 18 + nw + 3, y + 6, 1, 1);
      rect(c, C.white, x + 18 + nw + 4, y + 7, 1, 1);
      rect(c, C.white, x + 18 + nw + 5, y + 6, 1, 1);
      rect(c, C.white, x + 18 + nw + 6, y + 5, 1, 1);
      text(c, `${o.handle || '@MUNCHINC'} · ${o.time || '2H'}`, x + 18, y + 12, { font: 'small', col: C.gray });
      sprite(c, BIRD, x + cw - 13, y + 2, BIRD_MAP);
      text(c, 'PEEP', x + cw - 8, y + 12, { font: 'small', col: '#a95f1c', align: 'center' });
      text(c, `REPLYING TO ${o.replyTo || '@DOGFAN88'}`, x + 4, y + 19, { font: 'small', col: C.blue });
      const body = wrap(o.text || 'WE HEARD YOU. THE LAYER IS NOW MORE EVERYTHING.', cw - 8);
      if (body.length > 3) body[2] = `${body[2].slice(0, Math.floor((cw - 8) / 6) - 3)}...`;
      body.slice(0, 3).forEach((ln, i) => text(c, ln, x + 4, y + 27 + i * 9, { col: C.ink }));
      // counts row
      const ry = y + B.h - 9;
      rect(c, C.paperDark, x + 3, ry - 3, cw - 6, 1);
      const stats = [
        [REPLY, o.replies === undefined ? '1' : String(o.replies), C.gray],
        [REPOST, o.reposts === undefined ? '0' : String(o.reposts), C.gray],
        [HEART, o.likes === undefined ? '2' : String(o.likes), C.red],
        [EYE, '9', C.gray],
      ];
      const step = Math.floor((cw - 8) / stats.length);
      stats.forEach(([spr, v, col], i) => {
        const sx = x + 5 + i * step;
        sprite(c, spr, sx, ry + (spr === EYE ? 1 : 0), { X: col });
        text(c, v, sx + 9, ry, { font: 'small', col: C.gray });
      });
    },
  },

  /* ----------------------------------------------------------- orgChart */
  orgChart: {
    desc: 'Org chart: the dog at the top, Brad below her, the team at the bottom.',
    opts: { top: '{name, role} of the top box', mid: '{name, role} of the middle box', team: 'array of up to 4 {name, role}' },
    title: 'ORG CHART',
    footer: 'EFFECTIVE IMMEDIATELY',
    draw(c, W, H, o, n, B) {
      const top = o.top || { name: 'TUESDAY', role: 'CHAIR (DOG)' };
      const mid = o.mid || { name: 'BRAD', role: 'CEO' };
      const team = (o.team || [
        { name: 'DEZ', role: 'SALES' }, { name: 'KIKI', role: 'DESK' },
        { name: 'ROOP', role: 'IT' }, { name: 'MARGE', role: 'MONEY' },
      ]).slice(0, 4);
      const node = (x, y, w, h, nd, style) => {
        rect(c, style.bg, x, y, w, h);
        frame(c, style.edge, x, y, w, h);
        const nm = measure(nd.name) <= w - 4 ? {} : { font: 'small' };
        text(c, nd.name, x + w / 2, y + 2, { ...nm, col: style.fg, align: 'center' });
        text(c, nd.role, x + w / 2, y + h - 6, { font: 'small', col: style.sub, align: 'center' });
      };
      const cx = Math.round(B.cx);
      const tw = 52, th = 17;
      const ty = B.y + 1, my = B.y + 25, by = B.y + 50;
      // wiring first
      rect(c, C.ink, cx, ty + th, 1, my - ty - th);
      const gap = 3;
      const bw = Math.min(34, Math.floor((B.w - gap * (team.length - 1)) / team.length));
      const rowW = bw * team.length + gap * (team.length - 1);
      const bx0 = Math.round(cx - rowW / 2);
      const busY = my + th + 3;
      rect(c, C.ink, cx, my + th, 1, busY - my - th);
      rect(c, C.ink, bx0 + Math.floor(bw / 2), busY, rowW - bw + 1, 1);
      team.forEach((_, i) => rect(c, C.ink, bx0 + i * (bw + gap) + Math.floor(bw / 2), busY, 1, by - busY));
      // the dog: gold border, paws either side
      node(cx - tw / 2, ty, tw, th, top, { bg: '#f3e2b0', edge: C.amber, fg: C.ink, sub: C.brown });
      sprite(c, PAW, cx - tw / 2 - 10, ty + 5, { X: C.amber });
      sprite(c, PAW, cx + tw / 2 + 3, ty + 5, { X: C.amber });
      node(cx - tw / 2, my, tw, th, mid, { bg: C.navy, edge: C.navy, fg: C.white, sub: C.greenLight });
      team.forEach((m, i) => node(bx0 + i * (bw + gap), by, bw, th, m, { bg: C.white, edge: C.grayLight, fg: C.ink, sub: C.gray }));
    },
  },

  /* ------------------------------------------------------------ roadmap */
  roadmap: {
    desc: 'Gantt roadmap across Q1-Q5: ghost "plan" bars, and every real bar slips into Q5.',
    opts: { items: 'array of up to 5 {label, start} (start = quarter index 0..3)' },
    title: 'ROADMAP',
    footer: 'DATES ARE ASPIRATIONAL',
    draw(c, W, H, o, n, B) {
      const items = (o.items || [
        { label: 'APP', start: 0 }, { label: 'API', start: 0 }, { label: 'LAYER', start: 1 },
        { label: 'AI', start: 2 }, { label: 'PROFIT', start: 3 },
      ]).slice(0, 5);
      const lw = 26, gx = B.x + lw, gw = B.w - lw, qw = gw / 5;
      const hy = B.y + 1, ry0 = B.y + 11, pitch = 10;
      const qx = (q) => Math.round(gx + q * qw);
      // Q5 column: a quarter that does not exist, highlighted
      rect(c, '#efd9d3', qx(4), hy, Math.ceil(qw), B.h - 2);
      for (let q = 0; q < 5; q++) {
        text(c, `Q${q + 1}`, qx(q) + qw / 2, hy + 2, { font: 'small', col: q === 4 ? C.red : C.gray, align: 'center' });
        if (q) for (let y = hy; y < B.y + B.h - 2; y += 2) rect(c, C.grayLight, qx(q), y, 1, 1);
      }
      rect(c, C.ink, gx, hy + 8, gw, 1);
      items.forEach((it, i) => {
        const y = ry0 + i * pitch;
        text(c, it.label, gx - 3, y + 1, { font: 'small', col: C.ink, align: 'right' });
        const s = Math.max(0, Math.min(3, it.start | 0));
        // the plan: a dotted ghost one quarter long
        const px0 = qx(s) + 1, pw = Math.round(qw) - 2;
        for (let x = 0; x < pw; x += 2) { rect(c, C.gray, px0 + x, y, 1, 1); rect(c, C.gray, px0 + x, y + 6, 1, 1); }
        rect(c, C.gray, px0, y, 1, 7);
        rect(c, C.gray, px0 + pw - 1, y, 1, 7);
        // reality: starts a bit late, ends in Q5
        const ax0 = px0 + Math.round(qw * 0.35), ax1 = qx(5) - 4;
        rect(c, i % 2 ? C.green : C.navy, ax0, y + 2, ax1 - ax0, 3);
        tri(c, C.red, ax1, y, ax1, y + 7, ax1 + 3, y + 3.5);
      });
      // today line
      const tx = qx(3) + Math.round(qw * 0.5);
      for (let y = hy + 9; y < B.y + B.h - 2; y += 3) rect(c, C.red, tx, y, 1, 2);
      text(c, 'NOW', tx, B.y + B.h - 6, { font: 'small', col: C.red, align: 'center' });
    },
  },

  /* ---------------------------------------------------------------- kpi */
  kpi: {
    desc: 'KPI dashboard: four tiles with big numbers and tiny sparklines, all red, all down.',
    opts: { tiles: 'array of 4 {label, value}' },
    title: 'KPIS',
    footer: 'RED IS ON BRAND',
    draw(c, W, H, o, n, B) {
      const tiles = (o.tiles || [
        { label: 'USERS', value: '12' }, { label: 'NPS', value: '-80' },
        { label: 'CHURN', value: '140%' }, { label: 'UPTIME', value: '71%' },
      ]).slice(0, 4);
      const gap = 3;
      const tw = Math.floor((B.w - gap) / 2), th = Math.floor((B.h - gap) / 2);
      tiles.forEach((t, i) => {
        const x = B.x + (i % 2) * (tw + gap), y = B.y + Math.floor(i / 2) * (th + gap);
        rect(c, C.white, x, y, tw, th);
        frame(c, C.grayLight, x, y, tw, th);
        rect(c, C.red, x, y, 2, th);
        text(c, t.label, x + 5, y + 3, { font: 'small', col: C.gray });
        // down arrow
        tri(c, C.red, x + tw - 9, y + 3, x + tw - 3, y + 3, x + tw - 6, y + 8);
        const vs = measure(t.value, { s: 2 }) <= tw - 8 ? { s: 2 } : { sx: 1, sy: 2 };
        text(c, t.value, x + 5, y + 9, { ...vs, col: C.red });
        // sparkline: a jittery slide to the floor
        let prev = null;
        const sw = tw - 10;
        for (let k = 0; k <= 8; k++) {
          const sx = x + 5 + Math.round((k * sw) / 8);
          const sy = y + th - 7 + Math.round((k / 8) * 4 - (rnd(k + i * 9) - 0.5) * 3);
          const clampY = Math.max(y + th - 7, Math.min(y + th - 3, sy));
          if (prev) line(c, prev[0], prev[1], sx, clampY, C.red);
          prev = [sx, clampY];
        }
      });
    },
  },

  /* --------------------------------------------------------------- venn */
  venn: {
    desc: 'Venn diagram: "what customers want" vs "what we built", overlapping by about 3 pixels.',
    opts: { left: 'left circle label', right: 'right circle label', overlap: 'overlap label' },
    title: 'PRODUCT FIT',
    footer: 'NOT TO SCALE (IT IS)',
    draw(c, W, H, o, n, B) {
      const r = Math.min(24, Math.floor((B.h - 10) / 2));
      const dist = r * 2 - 3;
      const cy = B.y + r + 1;
      const lx = Math.round(B.cx - dist / 2), rx = Math.round(B.cx + dist / 2);
      const inL = (x, y) => (x - lx) ** 2 + (y - cy) ** 2 <= (r + 0.4) ** 2;
      const inR = (x, y) => (x - rx) ** 2 + (y - cy) ** 2 <= (r + 0.4) ** 2;
      for (let y = cy - r - 1; y <= cy + r + 1; y++) {
        for (let x = lx - r - 1; x <= rx + r + 1; x++) {
          const a = inL(x, y), b = inR(x, y);
          if (!a && !b) continue;
          let col = null;
          if (a && b) col = C.red;
          else if (a) col = (x + y) & 1 ? '#a8d4bd' : null;
          else col = (x + y) & 1 ? '#aab6d0' : null;
          const edgeA = a && !inL(x + 1, y) + !inL(x - 1, y) + !inL(x, y + 1) + !inL(x, y - 1);
          const edgeB = b && !inR(x + 1, y) + !inR(x - 1, y) + !inR(x, y + 1) + !inR(x, y - 1);
          if (edgeA && !b) col = C.green;
          if (edgeB && !a) col = C.navy;
          if (col) { c.fillStyle = col; c.fillRect(x, y, 1, 1); }
        }
      }
      const lab = (s, x) => {
        const lines = wrap(s, r * 2 - 10, { font: 'small' });
        const y0 = cy - Math.round((lines.length * 7 - 2) / 2);
        lines.forEach((ln, i) => text(c, ln, x, y0 + i * 7, { font: 'small', col: C.ink, align: 'center', outline: C.paper }));
      };
      lab(o.left || 'WHAT CUSTOMERS WANT', lx - 5);
      lab(o.right || 'WHAT WE BUILT', rx + 5);
      // callout to the sliver
      const mx = Math.round(B.cx);
      line(c, mx, cy + 4, mx, B.y + B.h - 9, C.red);
      text(c, o.overlap || 'US', mx, B.y + B.h - 7, { font: 'small', col: C.red, align: 'center' });
    },
  },

  /* -------------------------------------------------------------- quote */
  quote: {
    desc: 'Mission / inspirational quote with a giant pixel quote mark and attribution.',
    opts: { text: 'the quote', by: 'attribution' },
    title: 'OUR MISSION',
    footer: 'ATTRIBUTION DISPUTED',
    draw(c, W, H, o, n, B) {
      // big blocky opening quote
      for (const qx of [B.x + 2, B.x + 11]) {
        rect(c, C.green, qx, B.y + 2, 7, 7);
        rect(c, C.green, qx + 3, B.y + 9, 4, 3);
        rect(c, C.green, qx + 1, B.y + 12, 3, 2);
      }
      const tx = B.x + 22;
      const t = fit(o.text || 'WE DO NOT HAVE CUSTOMERS. WE HAVE A LAYER.', B.x + B.w - tx - 2, B.h - 16,
        [{ sx: 1, sy: 2 }, {}, { font: 'small' }], 1);
      t.lines.forEach((ln, i) => text(c, ln, tx, B.y + 3 + i * t.lh, { ...t.o, col: C.navy }));
      rect(c, C.green, tx, B.y + B.h - 11, 10, 1);
      text(c, `- ${o.by || 'BRAD, FOUNDER'}`, B.x + B.w - 2, B.y + B.h - 7, { font: 'small', col: C.gray, align: 'right' });
    },
  },

  /* ------------------------------------------------------- announcement */
  announcement: {
    desc: 'Big event banner with bunting and a trail of paw prints, e.g. TAKE YOUR DOG TO WORK DAY.',
    opts: { text: 'the event, e.g. "TAKE YOUR DOG TO WORK DAY"', sub: 'small line under it (date, place)', paws: 'false to drop the paw prints' },
    title: 'ANNOUNCEMENT',
    footer: 'PENDING HR APPROVAL',
    draw(c, W, H, o, n, B) {
      // bunting
      const cols = [C.green, C.amber, C.red, C.navy];
      line(c, B.x, B.y, B.x + B.w - 1, B.y, C.gray);
      for (let i = 0, x = B.x + 1; x + 7 <= B.x + B.w; i++, x += 9) tri(c, cols[i % cols.length], x, B.y + 1, x + 7, B.y + 1, x + 3.5, B.y + 7);
      // a paw trail walking across behind the words
      if (o.paws !== false) {
        const steps = Math.floor(B.w / 13);
        for (let i = 0; i < steps; i++) {
          const px = B.x + 2 + i * 13;
          const py = B.y + B.h - 17 - Math.round((i / steps) * (B.h - 30)) + (i % 2 ? 5 : 0);
          sprite(c, PAW, px, py, { X: '#cbbfa6' });
        }
      }
      const sub = o.sub === undefined ? 'FRIDAY. BRING A DOG.' : o.sub;
      const avail = B.h - 10 - (sub ? 8 : 0);
      const t = fit(o.text || 'TAKE YOUR DOG TO WORK DAY', B.w - 4, avail, [{ s: 2 }, { sx: 1, sy: 2 }, {}], 1);
      const blockH = t.lines.length * t.lh - 1;
      const y0 = B.y + 9 + Math.max(0, Math.floor((avail - blockH) / 2));
      t.lines.forEach((ln, i) => text(c, ln, B.cx, y0 + i * t.lh, { ...t.o, col: C.navy, align: 'center', outline: C.paper, shadow: C.greenLight }));
      if (sub) {
        const sy = B.y + B.h - 6;
        const sw = measure(sub, { font: 'small' });
        rect(c, C.paper, Math.round(B.cx - sw / 2) - 2, sy - 1, sw + 4, 7);
        text(c, sub, B.cx, sy, { font: 'small', col: C.red, align: 'center' });
        if (o.paws !== false && sw + 26 <= B.w) {
          sprite(c, PAW, Math.round(B.cx - sw / 2) - 11, sy - 2, { X: C.brown });
          sprite(c, PAW, Math.round(B.cx + sw / 2) + 4, sy - 2, { X: C.brown });
        }
      }
    },
  },

  /* ------------------------------------------------------------- thanks */
  thanks: {
    desc: 'Closing slide: QUESTIONS? (please, no questions).',
    opts: { text: 'big line (default QUESTIONS?)', sub: 'line under it' },
    title: 'QUESTIONS?',
    footer: 'THIS COULD HAVE BEEN AN EMAIL',
    draw(c, W, H, o) {
      coverBg(c, W, H);
      const big = o.text || o.title;
      const t = fit(big, W - 10, 24, [{ sx: 2, sy: 3 }, { s: 2 }, { sx: 1, sy: 2 }, {}]);
      const th = FONTS.big.h * (t.o.sy || t.o.s || 1);
      text(c, t.lines[0], W / 2, 32 - Math.floor(th / 2), { ...t.o, col: C.white, shadow: C.black, align: 'center' });
      rect(c, C.green, W / 2 - 20, 47, 40, 2);
      text(c, 'THANK YOU', W / 2, 53, { col: C.greenLight, align: 'center' });
      text(c, o.sub || '(PLEASE, NO QUESTIONS)', W / 2, 64, { font: 'small', col: C.grayLight, align: 'center' });
      munchMark(c, W / 2 - 16, 76, 4, C.navy);
      text(c, 'MUNCH, INC.', W / 2 - 9, 74, { font: 'small', col: C.white });
      text(c, o.footer, W / 2, H - 7, { font: 'small', col: C.gray, align: 'center' });
    },
  },
};

/* ------------------------------------------------------------------ public */

/**
 * Every slide id, in deck order.
 * @type {ReadonlyArray<string>}
 */
export const SLIDE_IDS = Object.freeze(Object.keys(SLIDES));

/**
 * id -> { desc, opts } for authoring docs. `opts` lists slide-specific options;
 * all slides also take `title`, `n`, `footer`, `wide` (see {@link TEMPLATE_OPTS}).
 * @type {Readonly<Object<string, {desc:string, opts:Object<string,string>}>>}
 */
export const SLIDE_INFO = Object.freeze(Object.fromEntries(
  SLIDE_IDS.map((id) => [id, Object.freeze({ desc: SLIDES[id].desc, opts: Object.freeze({ ...SLIDES[id].opts }) })]),
));

/** Options every slide accepts. */
export const TEMPLATE_OPTS = Object.freeze({
  title: 'title-bar text (cover slides: the big title)',
  n: 'slide number shown in the footer as "n/212"',
  footer: 'footer small print',
  wide: 'true for a 192x96 (2:1) canvas instead of 128x96 (4:3)',
});

/** Canvas sizes. */
export const SLIDE_SIZE = Object.freeze({ normal: [128, 96], wide: [192, 96] });

/** @type {Map<string, import('three').Texture>} */
const CACHE = new Map();

/** Stable JSON for cache keys (sorted object keys). */
function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${k}:${stable(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

/**
 * A MUNCH, Inc. deck slide as a nearest-filtered canvas texture. Cached per
 * id + opts, so call it freely. Unknown ids fall back to `title`.
 *
 * @param {string} id one of {@link SLIDE_IDS}
 * @param {Object} [opts] template opts (`title`, `n`, `footer`, `wide`) plus
 *   the slide's own (see {@link SLIDE_INFO})
 * @returns {import('three').Texture} `tex.image` is the canvas
 */
export function slideTexture(id, opts = {}) {
  const key = `${id}|${stable(opts || {})}`;
  const hit = CACHE.get(key);
  if (hit) return hit;
  const sid = SLIDES[id] ? id : 'title';
  const def = SLIDES[sid];
  const o = { ...opts };
  o.title = opts.title === undefined ? def.title : String(opts.title);
  o.footer = opts.footer === undefined ? def.footer : String(opts.footer);
  const n = opts.n === undefined ? SLIDE_IDS.indexOf(sid) + 1 : opts.n;
  const [W, H] = opts.wide ? SLIDE_SIZE.wide : SLIDE_SIZE.normal;
  const tex = makeTexture(W, H, (c, w, h) => {
    const B = sid === 'title' || sid === 'thanks' ? null : template(c, w, h, { title: o.title, n, footer: o.footer });
    def.draw(c, w, h, o, n, B);
  });
  tex.name = `slide:${sid}`;
  CACHE.set(key, tex);
  return tex;
}

/**
 * Frees every cached slide texture (scene teardown).
 * @returns {void}
 */
export function disposeSlides() {
  for (const t of CACHE.values()) t.dispose();
  CACHE.clear();
}
