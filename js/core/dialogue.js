/**
 * OFFICE HOURS VII \u2014 the FF7 UI layer.
 *
 * Dialogue boxes, menus, the battle HUD, damage numbers, name cards and title
 * cards, laid out in the 384x216 design space and drawn ENTIRELY into 1x
 * canvases so that the host's `image-rendering: pixelated` upscale gives real,
 * hard PS1 pixels. Nothing here uses CSS text, CSS gradients, border-radius,
 * blur or box-shadow \u2014 all of those resample and would soften the look.
 *
 * Visual contract (SPEC 4.4 as corrected by 10.1/10.2/10.3/10.6, and refs
 * docs/ref/01-battle-hud.webp and docs/ref/02-field-dialogue.webp):
 *   - the speaker's name is the FIRST LINE OF TEXT INSIDE THE BOX; the spoken
 *     line follows, indented and wrapped in full-width curly quotes.
 *   - ~2px light-periwinkle rounded outline over a 1px dark inset, on a
 *     top-lit steel-blue -> near-black-navy gradient at ~88% opacity, dithered.
 *   - boxes are sized to their content and placed near the speaker; several
 *     may coexist.
 *
 * @module core/dialogue
 */

import { makeSpeaker, playSfx } from '/js/core/audio.js';

/* ------------------------------------------------------------------ *
 * Design space
 * ------------------------------------------------------------------ */

const W = 384;
const H = 216;

/** Glyph ink box. Caps occupy rows 0..6; rows 7..8 are descenders. */
const GW = 5;
const GH = 9;
const CAP = 7;
/** Horizontal advance per character (5px of ink + 2px of tracking). */
const ADV = 7;
/** Baseline-to-baseline distance inside a box. */
const LINE = 11;

/** 1px outer dark + 2px light rule + 1px inner dark. */
const FRAME = 4;
const PAD_X = 5;
const PAD_Y = 4;
const RADIUS = 4;

const COL_EDGE = '#dfe6ff';
const COL_TOP = '#2b4fa8';
const COL_BOT = '#060b2a';
const COL_DARK = '#050916';
const COL_TEXT = '#ffffff';
const COL_HEAD = '#9db0dd';
const COL_SHADOW = '#000000';
const COL_LIMIT = '#ff5fa8';
const COL_TIME = '#ffb877';
const COL_AMBER = '#ffd24a';

const OPEN_Q = '\u201c';
const CLOSE_Q = '\u201d';

/* ------------------------------------------------------------------ *
 * The pixel font
 *
 * Hand-authored 5x9 bitmap, one entry per glyph. Rows are '/'-separated and
 * use '#' for ink; a leading digit is the number of blank rows to prepend
 * (so lowercase and punctuation stay short). Everything is procedural \u2014 no
 * font files, and it renders identically on every machine, which a system
 * monospace stack at 7px emphatically does not.
 * ------------------------------------------------------------------ */

const GLYPHS = {
  ' ': '',
  '!': '..#../..#../..#../..#../..#../...../..#..',
  '"': '.#.#./.#.#.',
  '#': '1.#.#./#####/.#.#./#####/.#.#.',
  '$': '..#../.####/#.#../.###./..#.#/####./..#..',
  '%': '##..#/##..#/...#./..#../.#.../#..##/#..##',
  '&': '.##../#..#./#.#../.#.../#.#.#/#..#./.##.#',
  '\'': '..#../..#..',
  '(': '...#./..#../.#.../.#.../.#.../..#../...#.',
  ')': '.#.../..#../...#./...#./...#./..#../.#...',
  '*': '1..#../#.#.#/.###./#.#.#/..#..',
  '+': '2..#../..#../#####/..#../..#..',
  ',': '6.##../.#...',
  '-': '4.###.',
  '.': '6.##..',
  '/': '....#/....#/...#./..#../.#.../#..../#....',
  '0': '.###./#...#/#..##/#.#.#/##..#/#...#/.###.',
  '1': '..#../.##../..#../..#../..#../..#../.###.',
  '2': '.###./#...#/....#/..##./.#.../#..../#####',
  '3': '####./....#/....#/.###./....#/#...#/.###.',
  '4': '...#./..##./.#.#./#..#./#####/...#./...#.',
  '5': '#####/#..../####./....#/....#/#...#/.###.',
  '6': '..##./.#.../#..../####./#...#/#...#/.###.',
  '7': '#####/....#/...#./..#../.#.../.#.../.#...',
  '8': '.###./#...#/#...#/.###./#...#/#...#/.###.',
  '9': '.###./#...#/#...#/.####/....#/...#./.##..',
  ':': '2.##../...../...../.##..',
  ';': '2.##../...../...../.##../.#...',
  '<': '2...#./..#../.#.../..#../...#.',
  '=': '3#####/...../#####',
  '>': '2.#.../..#../...#./..#../.#...',
  '?': '.###./#...#/....#/..##./..#../...../..#..',
  '@': '.###./#...#/#.###/#.#.#/#.###/#..../.###.',
  'A': '.###./#...#/#...#/#####/#...#/#...#/#...#',
  'B': '####./#...#/#...#/####./#...#/#...#/####.',
  'C': '.###./#...#/#..../#..../#..../#...#/.###.',
  'D': '###../#..#./#...#/#...#/#...#/#..#./###..',
  'E': '#####/#..../#..../####./#..../#..../#####',
  'F': '#####/#..../#..../####./#..../#..../#....',
  'G': '.###./#...#/#..../#.###/#...#/#...#/.###.',
  'H': '#...#/#...#/#...#/#####/#...#/#...#/#...#',
  'I': '.###./..#../..#../..#../..#../..#../.###.',
  'J': '..###/...#./...#./...#./...#./#..#./.##..',
  'K': '#...#/#..#./#.#../##.../#.#../#..#./#...#',
  'L': '#..../#..../#..../#..../#..../#..../#####',
  'M': '#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#',
  'N': '#...#/##..#/##..#/#.#.#/#..##/#..##/#...#',
  'O': '.###./#...#/#...#/#...#/#...#/#...#/.###.',
  'P': '####./#...#/#...#/####./#..../#..../#....',
  'Q': '.###./#...#/#...#/#...#/#.#.#/#..#./.##.#',
  'R': '####./#...#/#...#/####./#.#../#..#./#...#',
  'S': '.####/#..../#..../.###./....#/....#/####.',
  'T': '#####/..#../..#../..#../..#../..#../..#..',
  'U': '#...#/#...#/#...#/#...#/#...#/#...#/.###.',
  'V': '#...#/#...#/#...#/#...#/#...#/.#.#./..#..',
  'W': '#...#/#...#/#...#/#.#.#/#.#.#/##.##/#...#',
  'X': '#...#/#...#/.#.#./..#../.#.#./#...#/#...#',
  'Y': '#...#/#...#/.#.#./..#../..#../..#../..#..',
  'Z': '#####/....#/...#./..#../.#.../#..../#####',
  '[': '.###./.#.../.#.../.#.../.#.../.#.../.###.',
  '\\': '#..../#..../.#.../..#../...#./....#/....#',
  ']': '.###./...#./...#./...#./...#./...#./.###.',
  '^': '..#../.#.#./#...#',
  '_': '7#####',
  '`': '.#.../..#..',
  'a': '2.###./....#/.####/#...#/.####',
  'b': '#..../#..../####./#...#/#...#/#...#/####.',
  'c': '2.###./#...#/#..../#...#/.###.',
  'd': '....#/....#/.####/#...#/#...#/#...#/.####',
  'e': '2.###./#...#/#####/#..../.###.',
  'f': '..##./.#.../####./.#.../.#.../.#.../.#...',
  'g': '2.####/#...#/#...#/.####/....#/#...#/.###.',
  'h': '#..../#..../####./#...#/#...#/#...#/#...#',
  'i': '..#../...../.##../..#../..#../..#../.###.',
  'j': '...#./...../..##./...#./...#./...#./...#./#..#./.##..',
  'k': '#..../#..../#..#./#.#../##.../#.#../#..#.',
  'l': '.##../..#../..#../..#../..#../..#../.###.',
  'm': '2##.#./#.#.#/#.#.#/#.#.#/#.#.#',
  'n': '2####./#...#/#...#/#...#/#...#',
  'o': '2.###./#...#/#...#/#...#/.###.',
  'p': '2####./#...#/#...#/#...#/####./#..../#....',
  'q': '2.####/#...#/#...#/#...#/.####/....#/....#',
  'r': '2#.##./##..#/#..../#..../#....',
  's': '2.####/#..../.###./....#/####.',
  't': '.#.../.#.../####./.#.../.#.../.#..#/..##.',
  'u': '2#...#/#...#/#...#/#...#/.####',
  'v': '2#...#/#...#/#...#/.#.#./..#..',
  'w': '2#...#/#...#/#.#.#/#.#.#/.#.#.',
  'x': '2#...#/.#.#./..#../.#.#./#...#',
  'y': '2#...#/#...#/#...#/.####/....#/#...#/.###.',
  'z': '2#####/...#./..#../.#.../#####',
  '{': '..##./..#../..#../.#.../..#../..#../..##.',
  '|': '..#../..#../..#../..#../..#../..#../..#..',
  '}': '.##../..#../..#../...#./..#../..#../.##..',
  '~': '3.#..#/#..#.',
  '\u201c': '.#..#/##.##/##.##',
  '\u201d': '##.##/##.##/#..#.',
  '\u2026': '6#.#.#',
  '\u2014': '4#####',
  '\u25b6': '#..../##.../###../####./###../##.../#....',
  '\u25bc': '2#####/.###./..#..',
  '\u25b2': '4..#../.###./#####',
  '\u25cf': '2.###./#####/#####/.###.',
  '\u2665': '1.#.#./#####/#####/.###./..#..',
  '\u2192': '3...#./#####/...#.',
  '\u00b7': '4..#..'
};

/** Characters we silently fold onto glyphs we actually have. */
const FOLD = {
  '\u2018': '\'', '\u2019': '\'', '\u2013': '-', '\u2212': '-',
  '\u00d7': 'x', '\u2022': '\u25cf', '\u00a0': ' ', '\t': ' '
};

/** @type {Map<string, {runs:number[], w:number}>} */
const FONT = new Map();

(function buildFont() {
  for (const ch of Object.keys(GLYPHS)) {
    let spec = GLYPHS[ch];
    let top = 0;
    if (spec && spec.charCodeAt(0) >= 48 && spec.charCodeAt(0) <= 57) {
      top = Number(spec[0]);
      spec = spec.slice(1);
    }
    const rows = spec ? spec.split('/') : [];
    /** @type {number[]} flat triples of x, y, length */
    const runs = [];
    let maxX = 0;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const y = top + i;
      let x = 0;
      while (x < row.length) {
        if (row[x] === '#') {
          let len = 1;
          while (row[x + len] === '#') len++;
          runs.push(x, y, len);
          if (x + len > maxX) maxX = x + len;
          x += len;
        } else {
          x++;
        }
      }
    }
    FONT.set(ch, { runs, w: maxX });
  }
})();

const MISSING = FONT.get('?');

/**
 * @param {string} ch
 * @returns {{runs:number[], w:number}}
 */
function glyph(ch) {
  const folded = FOLD[ch] || ch;
  return FONT.get(folded) || MISSING;
}

/**
 * Width in design px of a string rendered at `scale` (trailing tracking is
 * not counted, so centring is symmetric).
 * @param {string} text
 * @param {number} [scale=1]
 * @returns {number}
 */
function textW(text, scale = 1) {
  if (!text || !text.length) return 0;
  return text.length * ADV * scale - (ADV - GW) * scale;
}

/**
 * Blits a run of text. `y` is the TOP of the glyph cell (cap row 0).
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} x
 * @param {number} y
 * @param {Object} [o]
 * @param {string} [o.color='#ffffff']
 * @param {number} [o.scale=1]
 * @param {string|null} [o.shadow='#000000'] hard offset shadow, no blur
 * @param {number} [o.tracking=0] extra px between characters
 * @param {string|null} [o.outline=null] 1px hard outline colour (damage numbers)
 * @param {string|null} [o.lowColor=null] colour for ink below 55% of cap height
 * @param {number} [o.reveal=Infinity] only draw the first N characters
 * @returns {void}
 */
function drawText(ctx, text, x, y, o = {}) {
  const scale = o.scale || 1;
  const adv = ADV * scale + (o.tracking || 0);
  const shadow = o.shadow === undefined ? COL_SHADOW : o.shadow;
  const outline = o.outline || null;
  const so = Math.max(1, Math.ceil(scale / 2));
  const n = Math.min(text.length, o.reveal === undefined ? Infinity : o.reveal);
  const split = Math.round(CAP * 0.55);

  const blit = (dx, dy, color) => {
    ctx.fillStyle = color;
    for (let i = 0; i < n; i++) {
      const g = glyph(text[i]);
      const gx = x + i * adv + dx;
      for (let r = 0; r < g.runs.length; r += 3) {
        ctx.fillRect(
          gx + g.runs[r] * scale,
          y + g.runs[r + 1] * scale + dy,
          g.runs[r + 2] * scale,
          scale
        );
      }
    }
  };

  if (outline) {
    ctx.fillStyle = outline;
    for (let i = 0; i < n; i++) {
      const g = glyph(text[i]);
      const gx = x + i * adv;
      for (let r = 0; r < g.runs.length; r += 3) {
        const rx = gx + g.runs[r] * scale;
        const ry = y + g.runs[r + 1] * scale;
        const rw = g.runs[r + 2] * scale;
        ctx.fillRect(rx - so, ry - so, rw + so * 2, scale + so * 2);
      }
    }
  } else if (shadow) {
    blit(so, so, shadow);
  }

  if (o.lowColor) {
    // Two-tone fill: bright above the waist, cooler below. FF7 damage numerals.
    ctx.fillStyle = o.color || COL_TEXT;
    for (let i = 0; i < n; i++) {
      const g = glyph(text[i]);
      const gx = x + i * adv;
      for (let r = 0; r < g.runs.length; r += 3) {
        const gy = g.runs[r + 1];
        ctx.fillStyle = gy < split ? (o.color || COL_TEXT) : o.lowColor;
        ctx.fillRect(gx + g.runs[r] * scale, y + gy * scale, g.runs[r + 2] * scale, scale);
      }
    }
  } else {
    blit(0, 0, o.color || COL_TEXT);
  }
}

/* ------------------------------------------------------------------ *
 * Panels \u2014 rounded rect, hard border, dithered gradient
 * ------------------------------------------------------------------ */

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/**
 * Horizontal inset of a rounded-rect row. Integer, so corners stay crisp.
 * @param {number} y @param {number} h @param {number} r
 * @returns {number}
 */
function cornerInset(y, h, r) {
  if (r <= 0) return 0;
  let dy;
  if (y < r) dy = r - y - 0.5;
  else if (y >= h - r) dy = y - (h - r) + 0.5;
  else return 0;
  return Math.max(0, r - Math.round(Math.sqrt(Math.max(0, r * r - dy * dy))));
}

/**
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {number} k erosion in px @param {number} r0 base corner radius
 * @returns {boolean}
 */
function inShape(x, y, w, h, k, r0) {
  const yy = y - k;
  const hh = h - k * 2;
  const ww = w - k * 2;
  if (yy < 0 || yy >= hh || ww <= 0) return false;
  const xi = cornerInset(yy, hh, Math.max(0, r0 - k));
  return x >= k + xi && x < k + ww - xi;
}

/** @param {string} hex @returns {[number,number,number]} */
function rgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/**
 * Paints an FF7 panel into a fresh canvas: 1px dark halo, 2px light rule,
 * 1px dark inset, then the steel-blue -> navy gradient, Bayer-dithered to
 * 5 bits per channel the way a PS1 gradient actually looks.
 * @param {number} w @param {number} h
 * @param {Object} [o]
 * @param {string} [o.top='#2b4fa8']
 * @param {string} [o.bottom='#060b2a']
 * @param {string} [o.edge='#dfe6ff']
 * @param {number} [o.alpha=0.88]
 * @param {number} [o.radius=4]
 * @returns {HTMLCanvasElement}
 */
function panelCanvas(w, h, o = {}) {
  const top = rgb(o.top || COL_TOP);
  const bot = rgb(o.bottom || COL_BOT);
  const edge = rgb(o.edge || COL_EDGE);
  const dark = rgb(COL_DARK);
  const alpha = Math.round((o.alpha === undefined ? 0.88 : o.alpha) * 255);
  const r = o.radius === undefined ? RADIUS : o.radius;

  const cv = document.createElement('canvas');
  cv.width = Math.max(1, w);
  cv.height = Math.max(1, h);
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(cv.width, cv.height);
  const d = img.data;
  const inner = h - FRAME * 2;

  for (let y = 0; y < h; y++) {
    const t = inner > 1 ? Math.min(1, Math.max(0, (y - FRAME) / (inner - 1))) : 0;
    const gr = top[0] + (bot[0] - top[0]) * t;
    const gg = top[1] + (bot[1] - top[1]) * t;
    const gb = top[2] + (bot[2] - top[2]) * t;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (!inShape(x, y, w, h, 0, r)) continue;
      let cr;
      let cg;
      let cb;
      let ca;
      if (!inShape(x, y, w, h, 1, r)) {
        cr = dark[0]; cg = dark[1]; cb = dark[2]; ca = 200;
      } else if (!inShape(x, y, w, h, 3, r)) {
        cr = edge[0]; cg = edge[1]; cb = edge[2]; ca = 255;
      } else if (!inShape(x, y, w, h, 4, r)) {
        cr = dark[0]; cg = dark[1]; cb = dark[2]; ca = 235;
      } else {
        const th = (BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.47) * 8;
        cr = Math.min(255, Math.max(0, Math.round((gr + th) / 8) * 8));
        cg = Math.min(255, Math.max(0, Math.round((gg + th) / 8) * 8));
        cb = Math.min(255, Math.max(0, Math.round((gb + th) / 8) * 8));
        ca = alpha;
      }
      d[i] = cr; d[i + 1] = cg; d[i + 2] = cb; d[i + 3] = ca;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/**
 * The bevelled gauge slot used by the battle HUD (LIMIT / TIME / BARRIER).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {number} fill 0..1
 * @param {string|null} color null = the inert grey BARRIER slot
 * @returns {void}
 */
function gauge(ctx, x, y, w, h, fill, color) {
  ctx.fillStyle = '#0a0e1c';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#aab4cd';
  ctx.fillRect(x, y, w, 1);
  ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x, y, 1, h);
  ctx.fillRect(x + w - 1, y, 1, h);
  const ix = x + 1;
  const iy = y + 1;
  const iw = w - 2;
  const ih = h - 2;
  ctx.fillStyle = color ? '#191f36' : '#59637d';
  ctx.fillRect(ix, iy, iw, ih);
  if (!color) {
    ctx.fillStyle = '#767f99';
    ctx.fillRect(ix, iy, iw, 1);
    ctx.fillStyle = '#414a61';
    ctx.fillRect(ix, iy + ih - 1, iw, 1);
    return;
  }
  const fw = Math.round(Math.min(1, Math.max(0, fill)) * iw);
  if (fw <= 0) return;
  ctx.fillStyle = color;
  ctx.fillRect(ix, iy, fw, ih);
  ctx.fillStyle = lighten(color, 0.42);
  ctx.fillRect(ix, iy, fw, Math.max(1, Math.floor(ih / 2)));
  ctx.fillStyle = lighten(color, -0.3);
  ctx.fillRect(ix, iy + ih - 1, fw, 1);
}

/**
 * @param {string} hex @param {number} amt -1..1
 * @returns {string}
 */
function lighten(hex, amt) {
  const c = rgb(hex);
  const f = (v) => {
    const n = amt >= 0 ? v + (255 - v) * amt : v * (1 + amt);
    return Math.min(255, Math.max(0, Math.round(n)));
  };
  return `rgb(${f(c[0])},${f(c[1])},${f(c[2])})`;
}

/* ------------------------------------------------------------------ *
 * Text wrapping
 * ------------------------------------------------------------------ */

/**
 * Greedy word wrap that never splits a run of dots (FF7 ellipses are a joke
 * delivery mechanism and must stay intact).
 * @param {string} text @param {number} max characters per line
 * @returns {string[]}
 */
function wrapText(text, max) {
  const out = [];
  const paras = String(text === undefined || text === null ? '' : text).split('\n');
  for (const para of paras) {
    const words = para.split(' ');
    let line = '';
    for (let w = 0; w < words.length; w++) {
      let word = words[w];
      if (!word && line === '' && words.length > 1) continue;
      while (word.length > max) {
        if (line) { out.push(line); line = ''; }
        out.push(word.slice(0, max));
        word = word.slice(max);
      }
      const next = line ? `${line} ${word}` : word;
      if (next.length > max && line) {
        out.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    out.push(line);
  }
  return out.length ? out : [''];
}

/* ------------------------------------------------------------------ *
 * Stylesheet
 * ------------------------------------------------------------------ */

/**
 * Idempotently links /css/dialogue.css so the layer works on any page, even one
 * that forgot to include it.
 * @returns {void}
 */
function ensureStylesheet() {
  if (typeof document === 'undefined') return;
  if (document.querySelector('link[data-oh-dialogue]')) return;
  for (const l of document.querySelectorAll('link[rel="stylesheet"]')) {
    if (/\/css\/dialogue\.css(\?|$)/.test(l.getAttribute('href') || '')) return;
  }
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/css/dialogue.css';
  link.setAttribute('data-oh-dialogue', '');
  document.head.appendChild(link);
}

/**
 * Inline copy of the geometry /css/dialogue.css sets, so the very first frame
 * is laid out correctly even if the stylesheet has not arrived yet.
 * @param {HTMLElement} el @param {number} z
 * @returns {void}
 */
function pinLayer(el, z) {
  const s = el.style;
  s.position = 'absolute';
  s.left = '0px';
  s.top = '0px';
  s.width = `${W}px`;
  s.height = `${H}px`;
  s.pointerEvents = 'none';
  if (z) s.zIndex = String(z);
}

/* ------------------------------------------------------------------ *
 * createDialogue
 * ------------------------------------------------------------------ */

/**
 * @typedef {Object} SayOpts
 * @property {string} [speaker]   printed as the first line inside the box
 * @property {string} text        may contain \n for explicit line breaks
 * @property {string} [voice='narrator']
 * @property {string} [color]     accepted for API compatibility and IGNORED:
 *   per §10.1 the speaker's name is plain white, with no coloured plate
 * @property {number} [cps=34]
 * @property {number} [hold=750]
 * @property {'bottom'|'top'} [pos='bottom']
 * @property {boolean} [auto=true]
 * @property {boolean} [keep=false] leave the box up when the next say() runs
 * @property {'auto'|'tl'|'tm'|'tr'|'ml'|'mr'|'bl'|'bm'|'br'} [anchor='bm']
 * @property {[number,number]} [at] screen point to float the box above
 * @property {number} [maxWidth=230]
 * @property {string} [id]        name this box so closeBoxes() can find it
 * @property {number} [timeout]   hard watchdog for auto:false, ms
 */

/**
 * @typedef {Object} MenuOpts
 * @property {string} [prompt]
 * @property {string[]} options
 * @property {number} [auto=2000] ms before the cursor walks to `pick`
 * @property {number} [pick=0]
 * @property {'menu'|'battle'} [style='menu']
 * @property {string} [voice]
 */

/** @typedef {{title?:string, subtitle?:string, ms?:number, logo?:boolean}} TitleOpts */
/** @typedef {{name:string, role:string, color?:string, stats?:string[], ms?:number}} NameCardOpts */
/** @typedef {{name:string, hp:number|string, maxHp?:number, mp?:number|string, limit?:number, time?:number, barrier?:number}} PartyRow */

/**
 * @typedef {Object} DialogueUI
 * @property {(o: SayOpts) => Promise<void>} say
 * @property {(o: MenuOpts) => Promise<number>} menu
 * @property {(o: TitleOpts) => Promise<void>} title
 * @property {(o: NameCardOpts) => Promise<void>} nameCard
 * @property {(text: string, ms?: number) => Promise<void>} toast
 * @property {(text: string) => void} setSubtitle
 * @property {(ids: string[]|null) => void} closeBoxes
 * @property {(rows: PartyRow[]|null) => void} battleHud
 * @property {(patch: Object<string, Partial<PartyRow>>) => void} updateHud
 * @property {(text: string, o?: {at?:[number,number], color?:string, big?:boolean}) => Promise<void>} damage
 * @property {(pos: [number,number]|null) => void} targetCursor
 * @property {(text: string, o?: {ms?:number}) => Promise<void>} encounter
 * @property {() => void} clear
 * @property {() => void} dispose
 * @property {(v: boolean) => void} setSkippable
 */

/**
 * Mounts the FF7 UI layer into a host element that the player has sized to the
 * 384x216 design space and CSS-scaled. Everything the returned object draws
 * lives inside that host, is pixel-exact, and every promise it hands back is
 * guaranteed to resolve \u2014 episodes run unattended and nothing may hang.
 *
 * @param {HTMLElement} host a positioned container sized to 384x216
 * @returns {DialogueUI}
 */
export function createDialogue(host) {
  ensureStylesheet();

  const root = document.createElement('div');
  root.className = 'oh-dlg';
  pinLayer(root, 2);
  root.style.overflow = 'hidden';
  host.classList.add('oh-dlg-host');
  host.appendChild(root);

  /** @param {string} cls @param {number} z @returns {HTMLDivElement} */
  const layer = (cls, z) => {
    const el = document.createElement('div');
    el.className = `oh-dlg-layer ${cls}`;
    pinLayer(el, z);
    root.appendChild(el);
    return el;
  };

  const lFx = layer('oh-dlg-fx', 10);
  const lHud = layer('oh-dlg-hud', 15);
  const lBox = layer('oh-dlg-boxes', 20);
  const lCard = layer('oh-dlg-cards', 25);
  const lMenu = layer('oh-dlg-menu', 30);
  const lTitle = layer('oh-dlg-title', 40);

  const catcher = document.createElement('div');
  catcher.className = 'oh-dlg-catch';
  pinLayer(catcher, 50);
  root.appendChild(catcher);

  let alive = true;
  let skippable = true;
  let boxSeq = 0;
  let lastSubtitle = '';

  /** @type {Set<()=>void>} finishers for one-shot clips, flushed by clear() */
  const cleanups = new Set();

  /* ---- ticking ---- */

  /** @type {Set<(dt:number,t:number)=>void>} */
  const tickers = new Set();
  let raf = 0;
  let lastT = 0;

  const tick = (nowMs) => {
    raf = requestAnimationFrame(tick);
    const t = nowMs / 1000;
    const dt = lastT ? Math.min(0.1, t - lastT) : 0.016;
    lastT = t;
    for (const fn of Array.from(tickers)) {
      if (tickers.has(fn)) fn(dt, t);
    }
  };
  raf = requestAnimationFrame(tick);

  /** @param {(dt:number,t:number)=>void} fn @returns {()=>void} */
  const addTicker = (fn) => {
    tickers.add(fn);
    return () => tickers.delete(fn);
  };

  /* ---- deferred bookkeeping: nothing may ever hang ---- */

  /** @type {Set<{settle:(v?:any)=>void}>} */
  const pending = new Set();

  /**
   * @param {*} fallback value handed back if clear()/dispose() flushes us
   * @returns {{promise:Promise<any>, settle:(v?:any)=>void, done:()=>boolean}}
   */
  const defer = (fallback) => {
    let resolveFn;
    let finished = false;
    const promise = new Promise((res) => { resolveFn = res; });
    const entry = {
      settle: (v) => {
        if (finished) return;
        finished = true;
        pending.delete(entry);
        resolveFn(v === undefined ? fallback : v);
      },
      done: () => finished
    };
    pending.add(entry);
    return { promise, settle: entry.settle, done: entry.done };
  };

  const flushPending = () => {
    for (const e of Array.from(pending)) e.settle();
    pending.clear();
  };

  /* ---- input ---- */

  /** @type {{advance:()=>void, nav?:(e:KeyboardEvent)=>void}|null} */
  let awaiting = null;

  const syncCatcher = () => {
    catcher.style.pointerEvents = awaiting && skippable ? 'auto' : 'none';
  };

  /** @param {{advance:()=>void, nav?:(e:KeyboardEvent)=>void}|null} h */
  const setAwaiting = (h) => { awaiting = h; syncCatcher(); };

  const onKey = (e) => {
    if (!alive || !skippable || !awaiting) return;
    const k = e.key;
    if (k === 'Enter' || k === ' ' || k === 'Spacebar') {
      e.preventDefault();
      awaiting.advance();
    } else if (awaiting.nav && (k === 'ArrowUp' || k === 'ArrowDown' || k === 'w' || k === 's')) {
      e.preventDefault();
      awaiting.nav(k === 'ArrowUp' || k === 'w' ? -1 : 1);
    }
  };
  const onPointer = (e) => {
    if (!alive || !skippable || !awaiting) return;
    e.preventDefault();
    awaiting.advance();
  };
  window.addEventListener('keydown', onKey);
  catcher.addEventListener('pointerdown', onPointer);

  /* ---- canvas helper ---- */

  /**
   * @param {HTMLElement} parent @param {number} w @param {number} h
   * @returns {{el:HTMLCanvasElement, ctx:CanvasRenderingContext2D, move:(x:number,y:number)=>void, remove:()=>void}}
   */
  const surface = (parent, w, h) => {
    const el = document.createElement('canvas');
    el.width = Math.max(1, Math.round(w));
    el.height = Math.max(1, Math.round(h));
    el.className = 'oh-dlg-c';
    el.style.position = 'absolute';
    el.style.left = '0px';
    el.style.top = '0px';
    el.style.width = `${el.width}px`;
    el.style.height = `${el.height}px`;
    el.style.imageRendering = 'pixelated';
    parent.appendChild(el);
    const ctx = el.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    return {
      el,
      ctx,
      move: (x, y) => {
        el.style.left = `${Math.round(x)}px`;
        el.style.top = `${Math.round(y)}px`;
      },
      remove: () => { if (el.parentNode) el.parentNode.removeChild(el); }
    };
  };

  /* ================================================================ *
   * Dialogue boxes
   * ================================================================ */

  /** @type {Map<string, any>} */
  const boxes = new Map();

  /** Bottom edge that bottom-anchored things must stay clear of. */
  const bottomLimit = () => (hud.rows ? hud.y - 3 : H - 6);

  /**
   * @param {any} box
   * @returns {void}
   */
  const paintBox = (box) => {
    const ctx = box.surf.ctx;
    ctx.clearRect(0, 0, box.w, box.h);
    ctx.drawImage(box.bg, 0, 0);
    let left = box.revealed;
    const x0 = FRAME + PAD_X;
    const y0 = FRAME + PAD_Y;
    for (let i = 0; i < box.lines.length; i++) {
      const ln = box.lines[i];
      const take = Math.max(0, Math.min(ln.text.length, left));
      left -= ln.text.length;
      if (take <= 0) continue;
      drawText(ctx, ln.text, x0 + ln.indent, y0 + i * LINE, {
        color: ln.color,
        reveal: take
      });
    }
    if (box.revealed >= box.total && box.cursorOn) {
      drawText(ctx, '\u25bc', box.w - FRAME - 8, box.h - FRAME - 7,
        { color: COL_EDGE, shadow: COL_SHADOW });
    }
  };

  /**
   * @param {SayOpts} o
   * @returns {{lines:{text:string,color:string,indent:number}[], w:number, h:number, total:number}}
   */
  const layoutSay = (o) => {
    const maxW = Math.max(90, Math.min(370, o.maxWidth || 230));
    const maxChars = Math.max(8, Math.floor((maxW - FRAME * 2 - PAD_X * 2) / ADV));
    /** @type {{text:string,color:string,indent:number}[]} */
    const lines = [];

    if (o.speaker) {
      // §10.1: the name is simply the first line of text, flush left and plain
      // white. There is no coloured plate; `o.color` is accepted and ignored.
      lines.push({ text: String(o.speaker), color: COL_TEXT, indent: 0 });
      const body = `${OPEN_Q}${String(o.text === undefined ? '' : o.text)}${CLOSE_Q}`;
      const wrapped = wrapText(body, maxChars - 2);
      for (let i = 0; i < wrapped.length; i++) {
        lines.push({ text: wrapped[i], color: COL_TEXT, indent: i === 0 ? ADV : ADV * 2 });
      }
    } else {
      const wrapped = wrapText(String(o.text === undefined ? '' : o.text), maxChars);
      for (const t of wrapped) lines.push({ text: t, color: COL_TEXT, indent: 0 });
    }

    let content = 0;
    let total = 0;
    for (const ln of lines) {
      content = Math.max(content, ln.indent + textW(ln.text));
      total += ln.text.length;
    }
    const w = Math.max(90, Math.min(maxW, content + (FRAME + PAD_X) * 2));
    const h = lines.length * LINE + (FRAME + PAD_Y) * 2 + 2;
    return { lines, w, h, total };
  };

  /**
   * True if a candidate rect would sit on top of a box that is already up.
   * @param {number} x @param {number} y @param {number} w @param {number} h
   * @returns {boolean}
   */
  const clashes = (x, y, w, h) => {
    for (const b of boxes.values()) {
      if (x < b.x + b.w + 3 && x + w + 3 > b.x && y < b.y + b.h + 3 && y + h + 3 > b.y) {
        return true;
      }
    }
    return false;
  };

  /**
   * Chooses the box's top-left corner. `at` floats it above a screen point
   * (the Director projects the speaker's head into design space); otherwise a
   * nine-slot anchor is used. Either way, if the ideal spot would bury a box
   * that is still on screen, the box steps off it — overlapping dialogue is the
   * point (ref 04), burying the previous line is not.
   * @param {SayOpts} o @param {number} w @param {number} h
   * @returns {[number, number]}
   */
  const placeBox = (o, w, h) => {
    const m = 6;
    const clamp = (x, y) => [
      Math.round(Math.max(2, Math.min(W - 2 - w, x))),
      Math.round(Math.max(2, Math.min(H - 2 - h, y)))
    ];
    /** @param {number} x @param {number} y @returns {[number,number]} */
    const dodge = (x, y) => {
      const first = clamp(x, y);
      if (!boxes.size || !clashes(first[0], first[1], w, h)) return first;
      const steps = [
        [0, -(h + 5)], [0, h + 5], [-(w * 0.6), 0], [w * 0.6, 0],
        [-(w * 0.6), -(h + 5)], [w * 0.6, -(h + 5)],
        [-(w * 0.6), h + 5], [w * 0.6, h + 5],
        [0, -(h + 5) * 2], [0, (h + 5) * 2]
      ];
      for (const [dx, dy] of steps) {
        const c = clamp(x + dx, y + dy);
        if (!clashes(c[0], c[1], w, h)) return c;
      }
      return first;
    };

    if (o.at && o.at.length === 2) {
      return dodge(o.at[0] - w / 2, o.at[1] - h - 6);
    }
    let anchor = o.anchor || (o.pos === 'top' ? 'tm' : 'bm');
    const slot = (a) => {
      const bot = bottomLimit() - h;
      const xs = { l: m, m: (W - w) / 2, r: W - m - w };
      const ys = { t: m, m: (H - h) / 2 - 8, b: bot };
      return clamp(xs[a[1]], ys[a[0]]);
    };
    if (anchor === 'auto') {
      const order = ['bm', 'tl', 'tr', 'ml', 'mr', 'bl', 'br', 'tm'];
      for (const a of order) {
        const [x, y] = slot(a);
        if (!clashes(x, y, w, h)) return [x, y];
      }
      anchor = 'bm';
    }
    const [sx, sy] = slot(anchor);
    return dodge(sx, sy);
  };

  /**
   * Removes a box from the screen and settles whatever `say()` call owns it, so
   * a box replaced mid-type (or closed by `closeBoxes`) can never strand its
   * promise.
   * @param {any} box
   * @returns {void}
   */
  const destroyBox = (box) => {
    if (box.gone) return;
    box.gone = true;
    box.stopTick();
    box.surf.remove();
    boxes.delete(box.id);
    if (box.finish) box.finish();
  };

  /**
   * Types one FF7 dialogue box. The box is measured and sized up front so it
   * never resizes while typing.
   * @param {SayOpts} o
   * @returns {Promise<void>}
   */
  const say = (o = {}) => {
    const d = defer(undefined);
    if (!alive) { d.settle(); return d.promise; }

    for (const b of Array.from(boxes.values())) if (!b.keep) destroyBox(b);

    const id = o.id || (o.speaker ? String(o.speaker).toLowerCase() : `box${++boxSeq}`);
    if (boxes.has(id)) destroyBox(boxes.get(id));

    const { lines, w, h, total } = layoutSay(o);
    const [x, y] = placeBox(o, w, h);

    const surf = surface(lBox, w, h);
    surf.move(x, y);

    const box = {
      id,
      x,
      y,
      w,
      h,
      lines,
      total,
      revealed: 0,
      keep: !!o.keep,
      cursorOn: false,
      surf,
      bg: panelCanvas(w, h),
      stopTick: () => {}
    };
    boxes.set(id, box);

    const cps = Math.max(1, o.cps === undefined ? 34 : o.cps);
    const hold = o.hold === undefined ? 750 : o.hold;
    const auto = o.auto === undefined ? true : !!o.auto;
    const speaker = makeSpeaker(o.voice || 'narrator');

    let acc = 0;
    let blink = 0;
    let holdLeft = -1;
    let inputStage = 0;
    let watchdog = auto ? Infinity : (o.timeout === undefined ? 20000 : o.timeout);

    let finishing = false;
    const finish = () => {
      if (finishing || d.done()) return;
      finishing = true;
      cleanups.delete(finish);
      if (!auto) setAwaiting(null);
      speaker.stop();
      box.stopTick();
      if (!box.keep) destroyBox(box);
      else { box.cursorOn = false; paintBox(box); }
      d.settle();
    };
    box.finish = finish;
    cleanups.add(finish);

    const completeNow = () => {
      while (box.revealed < box.total) {
        box.revealed++;
        acc = 0;
      }
      box.cursorOn = true;
      paintBox(box);
    };

    if (!auto) {
      setAwaiting({
        advance: () => {
          if (inputStage === 0 && box.revealed < box.total) {
            inputStage = 1;
            completeNow();
            playSfx('cursor', { gain: 0.5 });
          } else {
            playSfx('confirm', { gain: 0.6 });
            finish();
          }
        }
      });
    }

    box.stopTick = addTicker((dt) => {
      let dirty = false;
      if (box.revealed < box.total) {
        acc += dt * cps;
        while (acc >= 1 && box.revealed < box.total) {
          acc -= 1;
          const ch = charAt(box, box.revealed);
          box.revealed++;
          dirty = true;
          // audio.js rate-limits itself against the audio clock and ignores
          // whitespace, so every revealed character goes straight through.
          speaker.blip(ch);
        }
        if (box.revealed >= box.total) {
          holdLeft = hold;
          blink = 0;
          box.cursorOn = true;
          dirty = true;
        }
      } else {
        blink += dt;
        const on = blink % 0.72 < 0.42;
        if (on !== box.cursorOn) { box.cursorOn = on; dirty = true; }
        if (auto) {
          holdLeft -= dt * 1000;
          if (holdLeft <= 0) { finish(); return; }
        }
      }
      if (!auto) {
        watchdog -= dt * 1000;
        if (watchdog <= 0) { completeNow(); finish(); return; }
      }
      if (dirty) paintBox(box);
    });

    paintBox(box);
    return d.promise;
  };

  /**
   * @param {any} box @param {number} idx
   * @returns {string}
   */
  function charAt(box, idx) {
    let i = idx;
    for (const ln of box.lines) {
      if (i < ln.text.length) return ln.text[i];
      i -= ln.text.length;
    }
    return '';
  }

  /**
   * @param {string[]|null} ids null closes every box on screen
   * @returns {void}
   */
  const closeBoxes = (ids) => {
    if (!ids) {
      for (const b of Array.from(boxes.values())) destroyBox(b);
      return;
    }
    for (const id of ids) {
      const key = String(id).toLowerCase();
      const b = boxes.get(id) || boxes.get(key);
      if (b) destroyBox(b);
    }
  };

  /* ================================================================ *
   * Menu
   * ================================================================ */

  /**
   * FF7 command window. The cursor visibly walks to the auto-pick, one row per
   * step, ticking as it goes, then confirms with a flash.
   * @param {MenuOpts} o
   * @returns {Promise<number>}
   */
  const menu = (o = {}) => {
    const opts = (o.options || []).map((s) => String(s));
    const d = defer(Math.max(0, Math.min(opts.length - 1, o.pick || 0)));
    if (!alive || !opts.length) { d.settle(); return d.promise; }

    const style = o.style === 'battle' ? 'battle' : 'menu';
    const prompt = o.prompt ? String(o.prompt) : '';
    const target = Math.max(0, Math.min(opts.length - 1, o.pick === undefined ? 0 : o.pick));
    const budget = o.auto === undefined || o.auto <= 0 ? 2000 : o.auto;

    const cursorCol = ADV + 2;
    let content = 0;
    for (const s of opts) content = Math.max(content, cursorCol + textW(s));
    if (prompt) content = Math.max(content, textW(prompt));
    const rule = prompt ? 4 : 0;
    const w = Math.max(style === 'battle' ? 84 : 96,
      Math.min(250, content + (FRAME + PAD_X) * 2));
    const h = (prompt ? LINE + rule : 0) + opts.length * LINE + (FRAME + PAD_Y) * 2 + 1;

    const x = style === 'battle' ? 8 : W - 8 - w;
    const y = style === 'battle'
      ? Math.max(6, bottomLimit() - h)
      : Math.round(Math.max(8, Math.min(H - 8 - h, (H - h) / 2 - 6)));

    const surf = surface(lMenu, w, h);
    surf.move(x, y);
    const bg = panelCanvas(w, h);
    let sel = 0;
    let flash = 0;
    let confirmed = false;

    const paint = () => {
      const ctx = surf.ctx;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(bg, 0, 0);
      const x0 = FRAME + PAD_X;
      let ty = FRAME + PAD_Y;
      if (prompt) {
        drawText(ctx, prompt, x0, ty, { color: COL_HEAD });
        ctx.fillStyle = 'rgba(223,230,255,0.45)';
        ctx.fillRect(x0, ty + LINE, w - x0 * 2, 1);
        ty += LINE + rule;
      }
      for (let i = 0; i < opts.length; i++) {
        const rowY = ty + i * LINE;
        const hot = i === sel;
        const dim = confirmed && !hot;
        const on = !confirmed || flash % 2 === 0;
        drawText(ctx, opts[i], x0 + cursorCol, rowY, {
          color: dim ? '#7d88a8' : (hot && !on ? '#9db0dd' : COL_TEXT)
        });
        if (hot) {
          drawText(ctx, '\u25b6', x0, rowY, { color: on ? COL_EDGE : '#5c6da8' });
        }
      }
    };

    const stepMs = Math.max(90, Math.min(260, (budget * 0.55) / Math.max(1, target)));
    let acc = 0;
    let phase = target > 0 ? 'walk' : 'settle';
    let settleLeft = Math.max(220, budget * 0.35);
    let stop = () => {};

    const finish = () => {
      if (d.done()) return;
      stop();
      setAwaiting(null);
      surf.remove();
      d.settle(sel);
    };

    const confirm = () => {
      if (confirmed) return;
      confirmed = true;
      phase = 'confirm';
      acc = 0;
      flash = 0;
      settleLeft = 420;
      playSfx('confirm');
      paint();
    };

    setAwaiting({
      advance: () => { if (!confirmed) confirm(); },
      nav: (dir) => {
        if (confirmed) return;
        phase = 'settle';
        settleLeft = Math.max(settleLeft, 900);
        sel = (sel + dir + opts.length) % opts.length;
        playSfx('cursor');
        paint();
      }
    });

    stop = addTicker((dt) => {
      const ms = dt * 1000;
      if (phase === 'walk') {
        acc += ms;
        while (acc >= stepMs && sel !== target) {
          acc -= stepMs;
          sel += target > sel ? 1 : -1;
          playSfx('cursor');
          paint();
        }
        if (sel === target) { phase = 'settle'; acc = 0; }
      } else if (phase === 'settle') {
        settleLeft -= ms;
        if (settleLeft <= 0) confirm();
      } else {
        acc += ms;
        if (acc >= 70) { acc = 0; flash++; paint(); }
        settleLeft -= ms;
        if (settleLeft <= 0) finish();
      }
    });

    paint();
    return d.promise;
  };

  /* ================================================================ *
   * Title card
   * ================================================================ */

  /**
   * Full-screen title. With `logo:true` this is the real OFFICE HOURS VII
   * lockup from /js/brand/logo.js on black, per the brand rules.
   * @param {TitleOpts} o
   * @returns {Promise<void>}
   */
  const title = (o = {}) => {
    const d = defer(undefined);
    if (!alive) { d.settle(); return d.promise; }

    const ms = o.ms === undefined ? 1900 : o.ms;
    const surf = surface(lTitle, W, H);
    surf.el.classList.add('oh-dlg-fade');
    surf.el.style.opacity = '0';
    const ctx = surf.ctx;

    const paintText = () => {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(4,6,14,0.74)';
      ctx.fillRect(0, 0, W, H);
      const t = String(o.title || '').toUpperCase();
      const tracking = 4;
      const tw = t.length * (ADV * 2 + tracking) - (tracking + (ADV - GW) * 2);
      const tx = Math.round((W - tw) / 2);
      const ty = 88;
      ctx.fillStyle = 'rgba(223,230,255,0.55)';
      ctx.fillRect(tx - 10, ty - 10, tw + 20, 1);
      ctx.fillRect(tx - 10, ty + CAP * 2 + 9, tw + 20, 1);
      drawText(ctx, t, tx, ty, { scale: 2, tracking, color: '#eef2ff', lowColor: '#b6c2e4' });
      if (o.subtitle) {
        const s = String(o.subtitle);
        const sw = s.length * (ADV + 2) - (2 + ADV - GW);
        drawText(ctx, s, Math.round((W - sw) / 2), ty + CAP * 2 + 16, {
          tracking: 2, color: COL_HEAD
        });
      }
    };

    let disposed = false;
    const run = async () => {
      if (o.logo) {
        ctx.fillStyle = '#04060b';
        ctx.fillRect(0, 0, W, H);
        try {
          const mod = await import('/js/brand/logo.js');
          if (disposed) return;
          ctx.fillStyle = '#04060b';
          ctx.fillRect(0, 0, W, H);
          mod.drawFullLogo(ctx, W, H, { subtitle: o.subtitle, glow: 0.35 });
        } catch (err) {
          if (disposed) return;
          paintText();
        }
      } else {
        paintText();
      }
      if (disposed) return;
      surf.el.style.opacity = '1';
      playSfx('chime', { gain: 0.5 });
      timer = setTimeout(() => {
        surf.el.style.opacity = '0';
        timer = setTimeout(() => { finish(); }, 520);
      }, ms + 520);
    };

    let timer = 0;
    let guardTimer = 0;
    const finish = () => {
      if (d.done()) return;
      disposed = true;
      clearTimeout(timer);
      clearTimeout(guardTimer);
      cleanups.delete(finish);
      surf.remove();
      d.settle();
    };
    cleanups.add(finish);
    // Hard watchdog: even if the logo module never resolves, the card leaves.
    guardTimer = setTimeout(finish, ms + 4000);
    run();
    return d.promise;
  };

  /* ================================================================ *
   * Name card
   * ================================================================ */

  /**
   * The character intro placard: an FF7 menu box that slides in from the left
   * with name, role and the joke RPG stats.
   * @param {NameCardOpts} o
   * @returns {Promise<void>}
   */
  const nameCard = (o = {}) => {
    const d = defer(undefined);
    if (!alive) { d.settle(); return d.promise; }

    const name = String(o.name || '').toUpperCase();
    const role = String(o.role || '').toUpperCase();
    const accent = o.color || COL_EDGE;
    const stats = (o.stats || []).map((s) => String(s).toUpperCase());
    const ms = o.ms === undefined ? 2200 : o.ms;

    const maxContent = 250;
    /** @type {string[]} */
    const statLines = [];
    let cur = '';
    for (const s of stats) {
      const next = cur ? `${cur}   ${s}` : s;
      if (textW(next) > maxContent && cur) { statLines.push(cur); cur = s; }
      else cur = next;
    }
    if (cur) statLines.push(cur);

    let content = Math.max(textW(name, 2), textW(role));
    for (const s of statLines) content = Math.max(content, textW(s));
    const w = Math.round(Math.max(130, Math.min(268, content + (FRAME + PAD_X) * 2 + 6)));
    const h = (FRAME + PAD_Y) * 2 + CAP * 2 + 4 + LINE + 4 + statLines.length * LINE + 1;
    const restY = Math.round(Math.min(H - 10 - h, 128));

    const surf = surface(lCard, w, h);
    const bg = panelCanvas(w, h);
    const ctx = surf.ctx;
    ctx.drawImage(bg, 0, 0);
    const x0 = FRAME + PAD_X + 2;
    let ty = FRAME + PAD_Y;
    drawText(ctx, name, x0, ty, { scale: 2, color: accent, lowColor: lighten(accent, -0.28) });
    ty += CAP * 2 + 4;
    drawText(ctx, role, x0, ty, { color: COL_HEAD });
    ty += LINE;
    ctx.fillStyle = 'rgba(223,230,255,0.45)';
    ctx.fillRect(x0, ty, w - x0 * 2, 1);
    ty += 4;
    for (let i = 0; i < statLines.length; i++) {
      drawText(ctx, statLines[i], x0, ty + i * LINE, { color: COL_TEXT });
    }

    surf.move(-w - 2, restY);
    playSfx('whoosh', { gain: 0.5, duration: 0.3 });

    let phase = 'in';
    let p = 0;
    let holdLeft = ms;
    let stop = () => {};
    let stamped = false;

    const finish = () => {
      if (d.done()) return;
      stop();
      surf.remove();
      cleanups.delete(finish);
      d.settle();
    };
    cleanups.add(finish);

    stop = addTicker((dt) => {
      if (phase === 'in') {
        p = Math.min(1, p + dt / 0.3);
        const e = 1 - Math.pow(1 - p, 3);
        surf.move(-w - 2 + e * (w + 2 + 8), restY);
        if (p >= 1) {
          phase = 'hold';
          if (!stamped) { stamped = true; playSfx('stamp', { gain: 0.6 }); }
        }
      } else if (phase === 'hold') {
        holdLeft -= dt * 1000;
        if (holdLeft <= 0) { phase = 'out'; p = 0; }
      } else {
        p = Math.min(1, p + dt / 0.26);
        const e = p * p;
        surf.move(8 - e * (w + 10), restY);
        if (p >= 1) finish();
      }
    });

    return d.promise;
  };

  /* ================================================================ *
   * Toast
   * ================================================================ */

  /**
   * Small banner that drops in at the top of the screen.
   * @param {string} text @param {number} [ms=1600]
   * @returns {Promise<void>}
   */
  const toast = (text, ms) => {
    const d = defer(undefined);
    if (!alive) { d.settle(); return d.promise; }
    const t = String(text === undefined ? '' : text);
    const hold = ms === undefined ? 1600 : ms;
    const w = Math.round(Math.max(76, Math.min(340, textW(t) + (FRAME + PAD_X) * 2 + 6)));
    const h = LINE + (FRAME + PAD_Y) * 2 - 2;
    const x = Math.round((W - w) / 2);

    const surf = surface(lCard, w, h);
    surf.ctx.drawImage(panelCanvas(w, h), 0, 0);
    drawText(surf.ctx, t, Math.round((w - textW(t)) / 2), FRAME + PAD_Y, { color: COL_TEXT });
    surf.move(x, -h);
    playSfx('cursor', { gain: 0.5, rate: 0.85 });

    let phase = 'in';
    let p = 0;
    let holdLeft = hold;
    let stop = () => {};
    const finish = () => {
      if (d.done()) return;
      stop();
      surf.remove();
      cleanups.delete(finish);
      d.settle();
    };
    cleanups.add(finish);

    stop = addTicker((dt) => {
      if (phase === 'in') {
        p = Math.min(1, p + dt / 0.18);
        surf.move(x, -h + (1 - Math.pow(1 - p, 3)) * (h + 6));
        if (p >= 1) { phase = 'hold'; }
      } else if (phase === 'hold') {
        holdLeft -= dt * 1000;
        if (holdLeft <= 0) { phase = 'out'; p = 0; }
      } else {
        p = Math.min(1, p + dt / 0.18);
        surf.move(x, 6 - p * p * (h + 8));
        if (p >= 1) finish();
      }
    });
    return d.promise;
  };

  /* ================================================================ *
   * Subtitle
   * ================================================================ */

  /** @type {{el:HTMLCanvasElement, ctx:CanvasRenderingContext2D, move:Function, remove:Function}|null} */
  let subSurf = null;

  /**
   * Persistent bottom-left caption. '' clears it.
   * @param {string} text
   * @returns {void}
   */
  const setSubtitle = (text) => {
    const t = String(text === undefined || text === null ? '' : text);
    if (subSurf) { subSurf.remove(); subSurf = null; }
    if (!t || !alive) return;
    const lines = wrapText(t, Math.floor((W - 20) / ADV));
    let w = 0;
    for (const ln of lines) w = Math.max(w, textW(ln));
    const h = lines.length * LINE;
    subSurf = surface(lCard, w + 4, h + 2);
    for (let i = 0; i < lines.length; i++) {
      drawText(subSurf.ctx, lines[i], 1, i * LINE, { color: '#e9eeff' });
    }
    subSurf.move(8, bottomLimit() - h - 2);
  };

  /* ================================================================ *
   * Encounter banner
   * ================================================================ */

  /**
   * The `! TUESDAY APPEARED` slab: wipes in from the left, holds, wipes out.
   * @param {string} text @param {{ms?:number}} [o]
   * @returns {Promise<void>}
   */
  const encounter = (text, o = {}) => {
    const d = defer(undefined);
    if (!alive) { d.settle(); return d.promise; }
    const t = String(text === undefined ? '' : text).toUpperCase();
    const hold = o.ms === undefined ? 1400 : o.ms;
    const scale = textW(t, 2) <= W - 40 ? 2 : 1;
    const h = scale === 2 ? 34 : 26;
    const y = Math.round(H * 0.38);

    const surf = surface(lFx, W, h);
    surf.move(0, y);
    const slab = panelCanvas(W, h, { radius: 0, alpha: 0.93 });
    const ctx = surf.ctx;
    const tw = textW(t, scale);
    const tx = Math.round((W - tw) / 2);
    const ty = Math.round((h - CAP * scale) / 2);

    let phase = 'wipe';
    let p = 0;
    let holdLeft = hold;
    let flash = 0;
    let stop = () => {};

    const paint = () => {
      ctx.clearRect(0, 0, W, h);
      const reveal = phase === 'out' ? Math.round((1 - p) * W) : Math.round(Math.min(1, p) * W);
      if (reveal <= 0) return;
      ctx.save();
      ctx.beginPath();
      ctx.rect(phase === 'out' ? W - reveal : 0, 0, reveal, h);
      ctx.clip();
      ctx.drawImage(slab, 0, 0);
      ctx.fillStyle = COL_EDGE;
      ctx.fillRect(0, 0, W, 2);
      ctx.fillRect(0, h - 2, W, 2);
      if (phase !== 'wipe') {
        drawText(ctx, t, tx, ty, {
          scale,
          color: flash > 0 ? '#ffffff' : '#eef2ff',
          lowColor: flash > 0 ? '#ffffff' : '#c3cdee',
          outline: '#05070f'
        });
      }
      ctx.restore();
    };

    const finish = () => {
      if (d.done()) return;
      stop();
      surf.remove();
      cleanups.delete(finish);
      d.settle();
    };
    cleanups.add(finish);
    playSfx('whoosh', { gain: 0.7, duration: 0.22 });

    stop = addTicker((dt) => {
      if (phase === 'wipe') {
        p = Math.min(1, p + dt / 0.2);
        if (p >= 1) { phase = 'hold'; flash = 3; playSfx('chime', { gain: 0.65 }); }
      } else if (phase === 'hold') {
        if (flash > 0) flash -= dt * 20;
        holdLeft -= dt * 1000;
        if (holdLeft <= 0) { phase = 'out'; p = 0; playSfx('whoosh', { gain: 0.45, duration: 0.2 }); }
      } else {
        p = Math.min(1, p + dt / 0.2);
        if (p >= 1) { finish(); return; }
      }
      paint();
    });
    paint();
    return d.promise;
  };

  /* ================================================================ *
   * Damage numbers
   * ================================================================ */

  /**
   * Big outlined numerals (or `MISS`) that pop over a target, rise and fade.
   * @param {string} text
   * @param {{at?:[number,number], color?:string, big?:boolean}} [o]
   * @returns {Promise<void>}
   */
  const damage = (text, o = {}) => {
    const d = defer(undefined);
    if (!alive) { d.settle(); return d.promise; }
    const t = String(text === undefined ? '' : text);
    const scale = o.big ? 3 : 2;
    const tracking = -2 * scale + 2;
    const adv = ADV * scale + tracking;
    const tw = Math.max(1, t.length * adv - tracking - (ADV - GW) * scale);
    const pad = 3;
    const w = tw + pad * 2;
    const h = GH * scale + pad * 2;
    const at = o.at && o.at.length === 2 ? o.at : [W / 2, Math.round(H * 0.46)];

    const surf = surface(lFx, w, h);
    drawText(surf.ctx, t, pad, pad, {
      scale,
      tracking,
      color: o.color || '#ffffff',
      lowColor: o.color ? lighten(o.color, -0.22) : '#c6cee2',
      outline: '#07080f'
    });

    const bx = Math.round(at[0] - w / 2);
    const by = Math.round(at[1] - h);
    surf.move(bx, by);

    let e = 0;
    let stop = () => {};
    const finish = () => {
      if (d.done()) return;
      stop();
      surf.remove();
      cleanups.delete(finish);
      d.settle();
    };
    cleanups.add(finish);

    stop = addTicker((dt) => {
      e += dt;
      const p = e / 0.9;
      if (p >= 1) { finish(); return; }
      const rise = p < 0.38
        ? (1 - Math.pow(1 - p / 0.38, 3)) * 14
        : 14 - (p - 0.38) * 3;
      surf.move(bx, Math.round(by - rise));
      const fade = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
      surf.el.style.opacity = String(Math.max(0, Math.round(fade * 6) / 6));
    });
    return d.promise;
  };

  /* ================================================================ *
   * Target cursor
   * ================================================================ */

  /** @type {any} */
  let target = null;

  /**
   * The amber downward triangle that hovers over the current target.
   * @param {[number,number]|null} pos screen-space point in the 384x216 space
   * @returns {void}
   */
  const targetCursor = (pos) => {
    if (!pos) {
      if (target) { target.stop(); target.surf.remove(); target = null; }
      return;
    }
    if (!target) {
      const tw = 15;
      const th = 9;
      const surf = surface(lFx, tw, th);
      const ctx = surf.ctx;
      for (let yy = 0; yy < th; yy++) {
        const x0 = yy;
        const x1 = tw - 1 - yy;
        if (x1 < x0) break;
        const t = yy / (th - 1);
        ctx.fillStyle = `rgb(${Math.round(255 - t * 26)},${Math.round(226 - t * 96)},${Math.round(120 - t * 92)})`;
        ctx.fillRect(x0, yy, x1 - x0 + 1, 1);
        ctx.fillStyle = '#6b3c04';
        ctx.fillRect(x0, yy, 1, 1);
        ctx.fillRect(x1, yy, 1, 1);
      }
      ctx.fillStyle = '#6b3c04';
      ctx.fillRect(0, 0, tw, 1);
      ctx.fillStyle = '#fff3bd';
      ctx.fillRect(1, 1, tw - 2, 1);
      target = { surf, x: 0, y: 0, stop: () => {} };
      target.stop = addTicker((dt, t) => {
        if (!target) return;
        const bob = Math.round(Math.sin(t * 5.2) * 2);
        target.surf.move(target.x - 7, target.y - 11 + bob);
      });
    }
    target.x = pos[0];
    target.y = pos[1];
    target.surf.move(target.x - 7, target.y - 11);
  };

  /* ================================================================ *
   * Battle HUD
   * ================================================================ */

  const HUD_ROW = 12;
  const HUD_HEAD = 9;
  const HUD_LW = 150;
  const HUD_RW = 222;
  const HUD_LX = 4;
  const HUD_RX = 158;

  const hud = {
    /** @type {any[]|null} */
    rows: null,
    surf: /** @type {any} */ (null),
    bgL: /** @type {HTMLCanvasElement|null} */ (null),
    bgR: /** @type {HTMLCanvasElement|null} */ (null),
    h: 0,
    y: H,
    stop: () => {},
    acc: 0
  };

  /** @param {string} s @returns {number} 0..1, stable per name */
  const hashUnit = (s) => {
    let v = 2166136261;
    for (let i = 0; i < s.length; i++) {
      v ^= s.charCodeAt(i);
      v = Math.imul(v, 16777619);
    }
    return ((v >>> 0) % 1000) / 1000;
  };

  const paintHud = () => {
    if (!hud.rows || !hud.surf) return;
    const ctx = hud.surf.ctx;
    const h = hud.h;
    ctx.clearRect(0, 0, W, h);
    ctx.drawImage(hud.bgL, HUD_LX, 0);
    ctx.drawImage(hud.bgR, HUD_RX, 0);

    const lx = HUD_LX + FRAME + PAD_X;
    const lw = HUD_LW - (FRAME + PAD_X) * 2;
    const rx = HUD_RX + FRAME + PAD_X;
    const hy = FRAME + PAD_Y - 1;

    const HP_W = 72;
    const MP_X = 74;
    const MP_W = 34;
    const BAR_W = 38;
    const LIM_X = 116;
    const TIM_X = 162;

    /** Header caption centred over a gauge column. */
    const head = (s, x, colW) => {
      drawText(ctx, s, x + Math.round((colW - textW(s)) / 2), hy, { color: COL_HEAD });
    };

    drawText(ctx, 'NAME', lx, hy, { color: COL_HEAD });
    drawText(ctx, 'BARRIER', lx + lw - textW('BARRIER'), hy, { color: COL_HEAD });
    drawText(ctx, 'HP', rx, hy, { color: COL_HEAD });
    drawText(ctx, 'MP', rx + MP_X + MP_W - textW('MP'), hy, { color: COL_HEAD });
    head('LIMIT', rx + LIM_X, BAR_W);
    head('TIME', rx + TIM_X, BAR_W);

    const top = FRAME + PAD_Y + HUD_HEAD;
    for (let i = 0; i < hud.rows.length; i++) {
      const r = hud.rows[i];
      const ry = top + i * HUD_ROW;
      const ty = ry + 2;

      drawText(ctx, String(r.name).slice(0, 12), lx, ty, { color: COL_TEXT });
      gauge(ctx, lx + lw - 46, ry + 2, 46, 8,
        r.barrier || 0, r.barrier ? '#9fd8ff' : null);

      const hpText = typeof r.hp === 'string'
        ? r.hp
        : `${Math.max(0, Math.round(r.hp))}/${Math.max(0, Math.round(r.maxHp || 0))}`;
      const hw = textW(hpText);
      const hx = rx + HP_W - hw;
      drawText(ctx, hpText, hx, ty, { color: COL_TEXT });
      const frac = typeof r.hp === 'string'
        ? 1
        : Math.max(0, Math.min(1, r.maxHp ? r.hp / r.maxHp : 1));
      ctx.fillStyle = '#000000';
      ctx.fillRect(hx + 1, ty + CAP + 2, hw, 1);
      ctx.fillStyle = frac <= 0.25 ? '#ff5b5b' : frac <= 0.5 ? '#ffd24a' : '#dfe6ff';
      ctx.fillRect(hx, ty + CAP + 1, hw, 1);

      const mpText = r.mp === undefined || r.mp === null ? '\u2014' : String(r.mp);
      drawText(ctx, mpText, rx + MP_X + MP_W - textW(mpText), ty, { color: COL_TEXT });

      gauge(ctx, rx + LIM_X, ry + 2, BAR_W, 8, r.limit, COL_LIMIT);
      gauge(ctx, rx + TIM_X, ry + 2, BAR_W, 8, r._time, COL_TIME);
    }
  };

  /**
   * Shows the FF7 battle HUD. `hp` may be a string so jokes can land
   * (`{name:'MULCH', hp:'11/11 DAYS'}`).
   * @param {PartyRow[]|null} rows null hides it
   * @returns {void}
   */
  const battleHud = (rows) => {
    hud.stop();
    hud.stop = () => {};
    if (hud.surf) { hud.surf.remove(); hud.surf = null; }
    hud.rows = null;
    hud.y = H;
    if (!rows || !rows.length || !alive) { if (subSurf) reflowSubtitle(); return; }

    hud.rows = rows.slice(0, 5).map((r, i) => ({
      name: String(r.name || '').toUpperCase(),
      hp: r.hp === undefined ? 0 : r.hp,
      maxHp: r.maxHp === undefined ? 100 : r.maxHp,
      mp: r.mp,
      barrier: r.barrier || 0,
      limit: r.limit === undefined ? 0.2 + hashUnit(String(r.name) + 'l') * 0.65 : r.limit,
      _time: r.time === undefined ? hashUnit(String(r.name)) * 0.8 : r.time,
      _rate: 0.1 + ((i * 37 + 11) % 23) / 100,
      _wait: 0
    }));

    hud.h = HUD_HEAD + hud.rows.length * HUD_ROW + (FRAME + PAD_Y) * 2;
    hud.y = H - 2 - hud.h;
    hud.bgL = panelCanvas(HUD_LW, hud.h);
    hud.bgR = panelCanvas(HUD_RW, hud.h);
    hud.surf = surface(lHud, W, hud.h);
    hud.surf.move(0, hud.y);
    hud.acc = 0;
    paintHud();
    reflowSubtitle();

    hud.stop = addTicker((dt) => {
      if (!hud.rows) return;
      for (const r of hud.rows) {
        if (r._wait > 0) {
          r._wait -= dt;
          if (r._wait <= 0) { r._wait = 0; r._time = 0; }
          continue;
        }
        r._time += r._rate * dt;
        if (r._time >= 1) { r._time = 1; r._wait = 0.45 + hashUnit(r.name) * 0.9; }
      }
      hud.acc += dt;
      if (hud.acc >= 0.05) { hud.acc = 0; paintHud(); }
    });
  };

  /**
   * Patches HUD rows in place, keyed by row name (case-insensitive) or index.
   * @param {Object<string, Partial<PartyRow>>} patch
   * @returns {void}
   */
  const updateHud = (patch) => {
    if (!hud.rows || !patch) return;
    for (const key of Object.keys(patch)) {
      const up = patch[key] || {};
      const k = key.toUpperCase();
      let row = hud.rows.find((r) => r.name === k);
      if (!row && /^\d+$/.test(key)) row = hud.rows[Number(key)];
      if (!row) continue;
      if (up.name !== undefined) row.name = String(up.name).toUpperCase();
      if (up.hp !== undefined) row.hp = up.hp;
      if (up.maxHp !== undefined) row.maxHp = up.maxHp;
      if (up.mp !== undefined) row.mp = up.mp;
      if (up.limit !== undefined) row.limit = up.limit;
      if (up.barrier !== undefined) row.barrier = up.barrier;
      if (up.time !== undefined) { row._time = up.time; row._wait = 0; }
    }
    paintHud();
  };

  const reflowSubtitle = () => {
    if (lastSubtitle) setSubtitle(lastSubtitle);
  };

  /* ================================================================ *
   * Lifecycle
   * ================================================================ */

  /** Tears down everything on screen and settles every outstanding promise. */
  const clear = () => {
    for (const fn of Array.from(cleanups)) fn();
    cleanups.clear();
    closeBoxes(null);
    targetCursor(null);
    battleHud(null);
    lastSubtitle = '';
    if (subSurf) { subSurf.remove(); subSurf = null; }
    for (const el of Array.from(lMenu.children)) el.remove();
    for (const el of Array.from(lTitle.children)) el.remove();
    for (const el of Array.from(lCard.children)) el.remove();
    for (const el of Array.from(lFx.children)) el.remove();
    tickers.clear();
    setAwaiting(null);
    flushPending();
  };

  /** Removes the layer entirely. Safe to call twice. */
  const dispose = () => {
    if (!alive) return;
    alive = false;
    clear();
    cancelAnimationFrame(raf);
    raf = 0;
    window.removeEventListener('keydown', onKey);
    catcher.removeEventListener('pointerdown', onPointer);
    if (root.parentNode) root.parentNode.removeChild(root);
    host.classList.remove('oh-dlg-host');
  };

  /**
   * @param {boolean} v false makes the layer ignore clicks and keys entirely
   * @returns {void}
   */
  const setSkippable = (v) => { skippable = !!v; syncCatcher(); };

  /** @type {DialogueUI} */
  const api = {
    say,
    menu,
    title,
    nameCard,
    toast,
    setSubtitle: (t) => { lastSubtitle = String(t === undefined || t === null ? '' : t); setSubtitle(lastSubtitle); },
    closeBoxes,
    battleHud,
    updateHud,
    damage,
    targetCursor,
    encounter,
    clear,
    dispose,
    setSkippable
  };
  return api;
}
