/**
 * OFFICE HOURS VII — the landing page.
 *
 * Builds the hero (the real logo canvas, redrawn on resize), the three episode cards,
 * the cast strip and the favicon. Deliberately 2D-only: nothing in this module's import
 * graph reaches three.js, so the gallery stays a fast text-and-canvas document.
 *
 * @module gallery
 */

import { drawFullLogo, drawMark } from '/js/brand/logo.js';
import { EPISODES } from '/js/episodes/index.js';
import { PROFILES } from '/js/characters/index.js';

/* ------------------------------------------------------------------ *
 * the cast — data only
 * ------------------------------------------------------------------ */

/** Billing order for the cast strip. @type {string[]} */
const CAST_ORDER = ['brad', 'dez', 'kiki', 'roop', 'marge', 'tuesday'];

/**
 * One line of silhouette description per character.
 *
 * Everything else the strip shows — names, roles, accents and joke stats — comes from
 * `PROFILES` in `/js/characters/index.js`, which is deliberately dependency-free: it
 * imports neither three nor any character builder, so the gallery stays a 2D page.
 * Only this prose lives here, because it is the site's copy rather than cast data.
 *
 * @type {Object<string, string>}
 */
const HOOKS = {
  brad: 'Tallest in the room, hair at an angle, puffy vest over a dress shirt.',
  dez: 'Shoulder pads with a magenta suit attached. Shades indoors. Ponytail.',
  kiki: 'Shortest, roundest hair, headset mic boom, forever tangled in the cord.',
  roop: 'Hood up, shoulders down, cargo shorts, socks and sandals, under a desk.',
  marge: 'Ramrod straight, tight bun, enormous round glasses, one red ledger.',
  tuesday: 'Old dapple dachshund. Three legs, one inside-out ear, zero chill.',
};

/**
 * The cast strip's rows, in billing order: the real `CharProfile` records with this
 * page's one-line hook attached.
 *
 * @type {ReadonlyArray<{id:string, name:string, fullName:string, role:string, color:string, stats:string[], hook:string}>}
 */
export const CAST_PROFILES = Object.freeze(
  CAST_ORDER
    .filter((id) => PROFILES && PROFILES[id])
    .map((id) => Object.freeze(Object.assign({ hook: HOOKS[id] || '' }, PROFILES[id]))),
);

/** Display names by id, for the "starring" line on each episode card. */
const NAME_BY_ID = Object.fromEntries(CAST_PROFILES.map((p) => [p.id, p.name]));

/* ------------------------------------------------------------------ *
 * small helpers
 * ------------------------------------------------------------------ */

/**
 * Makes an element, sets a class and text, and appends children. Keeps the render
 * functions below readable without a template language.
 *
 * @param {string} tag
 * @param {string} [cls]
 * @param {string|Node|Array<string|Node|null|undefined>|null} [kids]
 * @returns {HTMLElement}
 */
function el(tag, cls, kids) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  const list = Array.isArray(kids) ? kids : [kids];
  for (const k of list) {
    if (k === null || k === undefined) continue;
    node.appendChild(typeof k === 'string' ? document.createTextNode(k) : k);
  }
  return node;
}

/** Runs `fn` at most once per animation frame. @param {Function} fn @returns {Function} */
function raf1(fn) {
  let queued = 0;
  return (...args) => {
    if (queued) return;
    queued = requestAnimationFrame(() => {
      queued = 0;
      fn(...args);
    });
  };
}

/* ------------------------------------------------------------------ *
 * the procedural poster plate
 * ------------------------------------------------------------------ */

/** Design space the plate art is composed in, then scaled to whatever box it lands in. */
const PLATE_W = 256;
const PLATE_H = 144;

/** Ceiling band, window band and the wall/floor junction, in design-space pixels. */
const CEIL = 20;
const WIN_TOP = 40;
const WIN_BOT = 82;
const HORIZON = 88;

/**
 * A solid form with a rim of light along its top and left edges — the office is lit
 * from the ceiling and the window wall, so that is where the light lands.
 *
 * @param {CanvasRenderingContext2D} c
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {string} fill
 * @param {string} rim
 * @param {number} [top=0.5] rim alpha along the top edge
 * @param {number} [side=0.22] rim alpha down the left edge
 */
function slab(c, x, y, w, h, fill, rim, top = 0.5, side = 0.22) {
  c.fillStyle = fill;
  c.fillRect(x, y, w, h);
  if (top > 0) {
    c.globalAlpha = top;
    c.fillStyle = rim;
    c.fillRect(x, y, w, 0.9);
    c.globalAlpha = 1;
  }
  if (side > 0) {
    c.globalAlpha = side;
    c.fillStyle = rim;
    c.fillRect(x, y, 0.9, h);
    c.globalAlpha = 1;
  }
}

/**
 * A standing person in the show's blocky PS1 proportions: two leg chunks, a slab
 * torso, an oversized head. Silhouetted against the window wall, which is why every
 * figure is placed so its head reaches eye level.
 *
 * @param {CanvasRenderingContext2D} c
 * @param {number} x centre
 * @param {number} groundY feet
 * @param {number} h total height
 * @param {string} rim accent for the rim light
 */
function figure(c, x, groundY, h, rim) {
  const headH = h * 0.21;
  const headW = h * 0.20;
  const torsoH = h * 0.40;
  const torsoW = h * 0.32;
  const legH = h - headH - torsoH;
  const legW = torsoW * 0.30;
  const body = '#080d14';

  slab(c, x - torsoW * 0.40, groundY - legH, legW, legH, body, rim, 0.12, 0.10);
  slab(c, x + torsoW * 0.10, groundY - legH, legW, legH, body, rim, 0.12, 0.10);
  slab(c, x - torsoW / 2, groundY - legH - torsoH, torsoW, torsoH, body, rim, 0.42, 0.26);
  slab(c, x - headW / 2, groundY - h, headW, headH, body, rim, 0.72, 0.34);
}

/**
 * A person sitting behind a table: head and shoulders only, which is all a meeting
 * ever shows anyway.
 *
 * @param {CanvasRenderingContext2D} c
 * @param {number} x @param {number} baseY where the table edge cuts them off
 * @param {number} h visible height @param {string} rim
 */
function seated(c, x, baseY, h, rim) {
  const headH = h * 0.40;
  const headW = h * 0.36;
  const torsoW = h * 0.62;
  const body = '#080d14';
  slab(c, x - torsoW / 2, baseY - (h - headH), torsoW, h - headH, body, rim, 0.38, 0.22);
  slab(c, x - headW / 2, baseY - h, headW, headH, body, rim, 0.7, 0.32);
}

/**
 * The dog: a long, low dachshund slab on stubby legs — one front leg, because
 * she only has the one — a head held high with a long snout, a floppy ear and
 * a tail up like a flag.
 *
 * @param {CanvasRenderingContext2D} c
 * @param {number} x @param {number} groundY @param {number} h @param {string} rim
 */
function dog(c, x, groundY, h, rim) {
  const body = '#080d14';
  const bw = h * 1.9;
  const legH = h * 0.24;
  const top = groundY - legH - h * 0.34;
  slab(c, x - bw / 2, top, bw, h * 0.36, body, rim, 0.85, 0.45);
  // one back leg, one front leg (the only one)
  slab(c, x - bw * 0.42, groundY - legH - 2, h * 0.16, legH + 2, body, rim, 0.12, 0.1);
  slab(c, x + bw * 0.30, groundY - legH - 2, h * 0.16, legH + 2, body, rim, 0.12, 0.1);
  // neck and head, carried high
  slab(c, x + bw * 0.34, groundY - h * 0.86, h * 0.26, h * 0.34, body, rim, 0.92, 0.5);
  // the long snout
  slab(c, x + bw * 0.34 + h * 0.22, groundY - h * 0.80, h * 0.34, h * 0.16, body, rim, 0.92, 0.5);
  // the floppy ear, hanging
  c.fillStyle = body;
  c.beginPath();
  c.moveTo(x + bw * 0.36, groundY - h * 0.84);
  c.lineTo(x + bw * 0.30, groundY - h * 0.50);
  c.lineTo(x + bw * 0.42, groundY - h * 0.56);
  c.closePath();
  c.fill();
  // tail, up like a flag
  c.beginPath();
  c.moveTo(x - bw * 0.48, top + 2);
  c.lineTo(x - bw * 0.66, top - h * 0.30);
  c.lineTo(x - bw * 0.56, top + h * 0.06);
  c.closePath();
  c.fill();
}

/**
 * Draws one episode's poster plate: the MUNCH office in silhouette against its window
 * wall, staged differently for each episode and graded with that episode's accent.
 *
 * This is the card artwork until `/assets/thumbs/epN.png` exists, and it is also the
 * backdrop on the player's title card. It is meant to be the art, not an apology.
 *
 * @param {CanvasRenderingContext2D} c
 * @param {import('/js/episodes/index.js').EpisodeMeta} ep
 */
function drawPlate(c, ep) {
  const W = PLATE_W;
  const H = PLATE_H;
  const A = ep.accent;
  const cx = W * 0.5;

  c.clearRect(0, 0, W, H);

  /* --- wall --- */
  const wall = c.createLinearGradient(0, CEIL, 0, HORIZON);
  wall.addColorStop(0, '#1a2431');
  wall.addColorStop(1, '#0d1621');
  c.fillStyle = wall;
  c.fillRect(0, 0, W, HORIZON);

  /* --- window wall: the city, flat and pre-rendered, exactly like a PS1 field --- */
  const sky = c.createLinearGradient(0, WIN_TOP, 0, WIN_BOT);
  sky.addColorStop(0, '#20344d');
  sky.addColorStop(0.62, '#33506f');
  sky.addColorStop(1, '#40617f');
  c.fillStyle = sky;
  c.fillRect(0, WIN_TOP, W, WIN_BOT - WIN_TOP);

  let bx = -3;
  let n = 3;
  while (bx < W + 3) {
    const bw = 8 + ((n * 13) % 13);
    const bh = 9 + ((n * 17) % 20);
    c.fillStyle = '#0e1622';
    c.fillRect(bx, WIN_BOT - bh, bw, bh);
    c.fillStyle = '#ffd9a0';
    for (let r = 0; r < Math.floor(bh / 5); r++) {
      for (let q = 0; q < Math.floor(bw / 4); q++) {
        if ((n + r * 3 + q * 5) % 4 !== 0) continue;
        c.globalAlpha = 0.28 + ((n + r + q) % 3) * 0.16;
        c.fillRect(bx + 1.6 + q * 4, WIN_BOT - bh + 2 + r * 5, 1.6, 2);
      }
    }
    c.globalAlpha = 1;
    bx += bw + 2;
    n++;
  }

  // mullions + sill
  c.globalAlpha = 0.34;
  c.fillStyle = '#0b1119';
  for (let x = 10; x < W; x += 43) c.fillRect(x, WIN_TOP, 1.2, WIN_BOT - WIN_TOP);
  c.globalAlpha = 1;
  c.fillStyle = '#0b1119';
  c.fillRect(0, WIN_TOP - 2, W, 2.4);
  c.fillRect(0, WIN_BOT, W, 2.4);
  c.globalAlpha = 0.28;
  c.fillStyle = '#c9d8e8';
  c.fillRect(0, WIN_BOT + 2.4, W, 0.9);
  c.globalAlpha = 1;

  /* --- drop ceiling: tee bars, and the fluorescents that light the whole show --- */
  c.fillStyle = '#080e15';
  c.fillRect(0, 0, W, CEIL);
  c.strokeStyle = '#2a3a4c';
  c.lineWidth = 0.6;
  c.globalAlpha = 0.5;
  c.beginPath();
  for (let i = -5; i <= 5; i++) {
    c.moveTo(cx + i * 60, 0);
    c.lineTo(cx + i * 13, CEIL);
  }
  c.moveTo(0, CEIL * 0.55);
  c.lineTo(W, CEIL * 0.55);
  c.stroke();
  c.globalAlpha = 1;

  // Fluorescent panels, in two runs receding to the vanishing point with the dark
  // tee-bar between them. Hard-edged: a bloom would read as a smear at thumbnail size.
  const rows = [[2.0, 112, 30, 4.4, 0.82], [9.2, 68, 18, 2.9, 0.5], [14.8, 41, 11, 1.8, 0.28]];
  for (const [y, outer, inner, th, alpha] of rows) {
    c.globalAlpha = alpha;
    c.fillStyle = '#eef5ff';
    for (const side of [-1, 1]) {
      c.beginPath();
      c.moveTo(cx + side * outer, y);
      c.lineTo(cx + side * inner, y);
      c.lineTo(cx + side * inner * 0.72, y + th);
      c.lineTo(cx + side * outer * 0.72, y + th);
      c.closePath();
      c.fill();
    }
  }
  c.globalAlpha = 1;

  // the accent grade, poured in from the ceiling
  const wash = c.createRadialGradient(cx, -4, 0, cx, -4, H * 1.05);
  wash.addColorStop(0, A);
  wash.addColorStop(1, 'rgba(0,0,0,0)');
  c.globalAlpha = 0.13;
  c.fillStyle = wash;
  c.fillRect(0, 0, W, H);
  c.globalAlpha = 1;

  /* --- carpet --- */
  const floor = c.createLinearGradient(0, HORIZON, 0, H);
  floor.addColorStop(0, '#131c26');
  floor.addColorStop(1, '#05080d');
  c.fillStyle = floor;
  c.fillRect(0, HORIZON, W, H - HORIZON);

  c.strokeStyle = A;
  c.lineWidth = 0.55;
  c.globalAlpha = 0.17;
  c.beginPath();
  for (let i = -6; i <= 6; i++) {
    c.moveTo(cx, HORIZON);
    c.lineTo(cx + i * (W * 0.30), H);
  }
  for (let k = 1; k <= 5; k++) {
    const y = HORIZON + (H - HORIZON) * (1 - 1 / (1 + k * 0.62));
    c.moveTo(0, y);
    c.lineTo(W, y);
  }
  c.stroke();
  c.globalAlpha = 1;

  /* --- staging --- */
  if (ep.id === 'ep1') {
    // STANDUP: a whiteboard on wheels, and five people arranged in a receding line.
    c.fillStyle = '#0b1119';
    c.fillRect(32, 48, 70, 40);
    c.fillStyle = '#c3d1e0';
    c.fillRect(34, 50, 66, 36);
    c.globalAlpha = 0.55;
    c.fillStyle = '#25313f';
    c.fillRect(40, 57, 42, 1.6);
    c.fillRect(40, 64, 54, 1.6);
    c.fillRect(40, 71, 28, 1.6);
    c.globalAlpha = 0.85;
    c.strokeStyle = '#c0453c';
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(66, 76);
    c.lineTo(92, 80);
    c.stroke();
    c.globalAlpha = 1;
    c.fillStyle = '#0c141d';
    c.fillRect(40, 88, 2.4, 16);
    c.fillRect(92, 88, 2.4, 16);
    for (const [x, g, h] of [[112, 100, 30], [142, 106, 36], [170, 114, 44], [200, 124, 54], [228, 136, 66]]) {
      figure(c, x, g, h, A);
    }
  } else if (ep.id === 'ep2') {
    // RUNWAY: the pull-down screen, the table, and a line that only goes one way.
    c.fillStyle = '#0b1119';
    c.fillRect(80, 34, 100, 50);
    c.fillStyle = '#b9c7d6';
    c.fillRect(82, 36, 96, 46);
    c.globalAlpha = 0.45;
    c.strokeStyle = '#3a4756';
    c.lineWidth = 0.7;
    c.beginPath();
    c.moveTo(89, 42);
    c.lineTo(89, 76);
    c.lineTo(172, 76);
    c.stroke();
    c.globalAlpha = 1;
    c.strokeStyle = '#c0453c';
    c.lineWidth = 1.8;
    c.beginPath();
    c.moveTo(90, 44);
    c.lineTo(112, 53);
    c.lineTo(134, 62);
    c.lineTo(171, 75);
    c.stroke();

    for (const [x, b, h] of [[70, 106, 26], [104, 108, 28], [152, 108, 28], [186, 106, 26]]) {
      seated(c, x, b, h, A);
    }
    figure(c, 222, 120, 48, A);

    // the table, in perspective, cutting everyone off at the elbows
    c.fillStyle = '#101922';
    c.beginPath();
    c.moveTo(cx - 104, H);
    c.lineTo(cx + 104, H);
    c.lineTo(cx + 46, 104);
    c.lineTo(cx - 46, 104);
    c.closePath();
    c.fill();
    c.globalAlpha = 0.55;
    c.fillStyle = A;
    c.fillRect(cx - 46, 104, 92, 1);
    c.globalAlpha = 1;
  } else if (ep.id === 'ep4') {
    // GOOD GIRL: the company in a row, the dog, and a hamburger with a candle in it.
    for (const [x, g, h] of [[58, 110, 44], [96, 106, 40], [160, 106, 40], [198, 110, 44]]) {
      figure(c, x, g, h, A);
    }
    figure(c, 128, 104, 38, A);
    dog(c, 118, 128, 20, A);
    // the burger: bun, patty, bun, and a candle with a flame in the accent
    slab(c, 150, 124, 16, 4, '#141c26', A, 0.4, 0.2);
    slab(c, 149, 120, 18, 4, '#0c1219', A, 0.4, 0.2);
    slab(c, 150, 115, 16, 5, '#141c26', A, 0.6, 0.3);
    c.fillStyle = '#c3d1e0';
    c.fillRect(157.2, 106, 1.8, 9);
    c.fillStyle = A;
    c.globalAlpha = 0.35;
    c.beginPath();
    c.arc(158, 103.5, 5, 0, Math.PI * 2);
    c.fill();
    c.globalAlpha = 1;
    c.beginPath();
    c.moveTo(158, 100);
    c.lineTo(160, 105);
    c.lineTo(156, 105);
    c.closePath();
    c.fill();
  } else {
    // TUESDAY: a dog, a lot of carpet, and a target cursor nobody agreed on.
    // two desks, on the carpet where desks live
    slab(c, 2, 90, 64, 5, '#1c2633', A, 0.5, 0.2);
    slab(c, 8, 95, 52, 13, '#0e1620', A, 0.14, 0.12);
    slab(c, 196, 94, 58, 6, '#1c2633', A, 0.5, 0.2);
    slab(c, 201, 100, 48, 14, '#0e1620', A, 0.14, 0.12);

    for (const [x, g, h] of [[86, 104, 34], [216, 116, 46], [242, 106, 36]]) {
      figure(c, x, g, h, A);
    }

    // a pool of fluorescent light on the carpet, so the star of the episode reads
    const pool = c.createRadialGradient(150, 124, 1, 150, 124, 26);
    pool.addColorStop(0, 'rgba(210,228,248,0.20)');
    pool.addColorStop(1, 'rgba(210,228,248,0)');
    c.fillStyle = pool;
    c.fillRect(120, 100, 62, 44);

    dog(c, 150, 124, 28, A);

    // the battle cursor, hovering over the only competent party member
    c.fillStyle = '#ffce4a';
    c.beginPath();
    c.moveTo(140, 80);
    c.lineTo(160, 80);
    c.lineTo(150, 91);
    c.closePath();
    c.fill();
    c.globalAlpha = 0.4;
    c.fillRect(140, 75, 20, 2);
    c.globalAlpha = 1;
  }

  /* --- scanlines, baked so they survive any scale --- */
  c.globalAlpha = 0.12;
  c.fillStyle = '#000';
  for (let y = 0; y < H; y += 2) c.fillRect(0, y, W, 1);
  c.globalAlpha = 1;

  /* --- vignette --- */
  const vig = c.createRadialGradient(cx, H * 0.46, H * 0.20, cx, H * 0.46, H * 0.92);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.70)');
  c.fillStyle = vig;
  c.fillRect(0, 0, W, H);
}

/**
 * Sizes a plate canvas to its box at device resolution and redraws the episode's
 * poster in the 256x144 design space. Used by the gallery cards and, on the player,
 * behind the title card.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {import('/js/episodes/index.js').EpisodeMeta} ep
 * @param {{width?:number, height?:number}} [box] explicit CSS size; defaults to the element's
 */
export function paintPlate(canvas, ep, box) {
  if (!canvas || !ep) return;
  const rect = box || canvas.getBoundingClientRect();
  const w = Math.max(64, Math.round(rect.width || PLATE_W));
  const h = Math.max(36, Math.round(rect.height || PLATE_H));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const c = canvas.getContext('2d');
  if (!c) return;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.scale((w * dpr) / PLATE_W, (h * dpr) / PLATE_H);
  drawPlate(c, ep);
}

/* ------------------------------------------------------------------ *
 * hero
 * ------------------------------------------------------------------ */

/** Widest the hero lockup is ever drawn, in CSS px. */
const HERO_MAX = 760;

/**
 * Mounts the OFFICE HOURS VII lockup into the hero and keeps it sharp: the logo is
 * vector-ish line art, so a resize redraws it rather than scaling the bitmap.
 *
 * @param {HTMLElement} slot the hero container
 * @returns {() => void} teardown
 */
export function mountHero(slot) {
  /** @type {HTMLImageElement|null} the rendered plate, once it has decoded */
  let heroPlate = null;
  if (!slot) return () => {};
  let lastW = -1;
  /** @type {HTMLCanvasElement|null} */
  let canvas = null;

  const draw = (force) => {
    const avail = Math.round(slot.clientWidth || HERO_MAX);
    const w = Math.max(240, Math.min(HERO_MAX, avail));
    // `force` is how the plate gets in: the width has not changed when the
    // image finishes decoding, so the ordinary same-width bail would drop the
    // swap and leave the fallback drawing on screen forever.
    if (!force && Math.abs(w - lastW) < 2 && canvas) return;
    lastW = w;
    const h = Math.round(w * 0.70);
    const dpr = Math.min(window.devicePixelRatio || 1, 3);

    const next = document.createElement('canvas');
    next.width = Math.round(w * dpr);
    next.height = Math.round(h * dpr);
    next.style.width = `${w}px`;
    next.style.height = `${h}px`;
    const c = next.getContext('2d');
    if (!c) return;
    c.scale(dpr, dpr);
    drawFullLogo(c, w, h, { subtitle: 'a MUNCH production', glow: 0.42, seed: 7 });
    // The procedural lockup above is the fallback. What normally shows is the
    // rendered plate: the same 3D lockup the episodes open with, shot in the
    // office by `tools/shoot.mjs brand`, so the hero and the title card cannot
    // drift apart. Only swapped in once it has actually decoded, so a missing
    // file degrades to the drawing rather than to a broken image.
    if (!heroPlate) {
      const img = new Image();
      img.decoding = 'async';
      img.alt = 'OFFICE HOURS VII — a MUNCH production';
      img.className = 'hero-plate';
      img.addEventListener('load', () => { heroPlate = img; draw(true); });
      img.src = '/assets/logo.png';
    }

    const shown = heroPlate || next;
    if (heroPlate) {
      heroPlate.style.width = `${w}px`;
      heroPlate.style.height = 'auto';
    }
    if (canvas) canvas.replaceWith(shown);
    else slot.appendChild(shown);
    canvas = shown;
    slot.style.minHeight = `${h}px`;
  };

  draw();
  const onResize = raf1(draw);
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(onResize) : null;
  if (ro) ro.observe(slot);
  else window.addEventListener('resize', onResize);

  return () => {
    if (ro) ro.disconnect();
    else window.removeEventListener('resize', onResize);
  };
}

/* ------------------------------------------------------------------ *
 * episode cards
 * ------------------------------------------------------------------ */

/**
 * Builds one episode card. The whole card is a single link to the player.
 *
 * @param {import('/js/episodes/index.js').EpisodeMeta} ep
 * @returns {{node: HTMLElement, plate: HTMLCanvasElement}}
 */
function episodeCard(ep) {
  const article = el('article', 'ep');
  article.style.setProperty('--accent', ep.accent);

  const plate = document.createElement('canvas');
  plate.className = 'plate';
  plate.setAttribute('aria-hidden', 'true');

  const thumb = el('div', 'ep-thumb', [
    plate,
    el('span', 'ep-tag', 'Live 3D'),
    el('span', 'ep-num', ep.numeral),
  ]);

  // The rendered still is optional. It is only attached once it has actually loaded,
  // so a missing /assets/thumbs/epN.png can never render as a broken image.
  const shot = new Image();
  shot.className = 'ep-shot';
  shot.alt = `${ep.title} — still frame`;
  // NOT lazy. This image is deliberately detached until it loads, and a lazy
  // image only starts fetching once it is in the document and near the
  // viewport — which it never is, because it is only inserted on load. The two
  // together deadlock and the real thumbnails silently never appear.
  shot.loading = 'eager';
  shot.decoding = 'async';
  shot.addEventListener('load', () => {
    thumb.insertBefore(shot, plate.nextSibling);
    thumb.classList.add('has-shot');
  });
  shot.addEventListener('error', () => { /* keep the procedural plate */ });
  shot.src = ep.thumb;

  const starring = ep.starring.map((id) => NAME_BY_ID[id] || id.toUpperCase()).join(' · ');

  const body = el('div', 'ep-body', [
    el('p', 'ep-kicker', `Episode ${ep.ordinal}`),
    el('h3', 'ep-title', ep.title),
    el('p', 'ep-log', ep.logline),
    el('p', 'ep-cast', starring),
    el('div', 'ep-foot', [
      el('span', 'ep-run', ep.runtime),
      el('span', 'ep-cta', [el('span', 'tri', '▶'), 'Watch']),
    ]),
  ]);

  const link = el('a', 'ep-link', [thumb, body]);
  link.href = `/watch.html?ep=${encodeURIComponent(ep.id)}`;
  link.setAttribute('aria-label', `Watch episode ${ep.number}, ${ep.title}. ${ep.logline} Runtime ${ep.runtime}.`);

  article.appendChild(link);
  return { node: article, plate };
}

/**
 * Renders all three episode cards into `mount` and keeps their poster plates painted
 * at the current element size.
 *
 * @param {HTMLElement} mount
 * @returns {() => void} teardown
 */
export function renderEpisodes(mount) {
  if (!mount) return () => {};
  mount.textContent = '';

  /** @type {Array<[HTMLCanvasElement, import('/js/episodes/index.js').EpisodeMeta]>} */
  const plates = [];
  for (const ep of EPISODES) {
    const { node, plate } = episodeCard(ep);
    mount.appendChild(node);
    plates.push([plate, ep]);
  }

  const paint = raf1(() => {
    for (const [canvas, ep] of plates) paintPlate(canvas, ep);
  });
  paint();

  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(paint) : null;
  if (ro) ro.observe(mount);
  else window.addEventListener('resize', paint);

  return () => {
    if (ro) ro.disconnect();
    else window.removeEventListener('resize', paint);
  };
}

/* ------------------------------------------------------------------ *
 * cast strip
 * ------------------------------------------------------------------ */

/**
 * Renders the cast strip from {@link CAST_PROFILES}. Data only — no geometry, no
 * three.js, no character modules: the headshot on each card is a PNG shot ahead of
 * time by `tools/shoot.mjs cast` from the real character rigs, so the page shows the
 * actual models without the gallery ever touching the renderer.
 *
 * @param {HTMLElement} mount a `<ul>`
 */
export function renderCast(mount) {
  if (!mount) return;
  mount.textContent = '';
  for (const p of CAST_PROFILES) {
    const face = el('span', 'cast-face');

    const li = el('li', 'cast-card', [
      face,
      el('div', 'cast-text', [
        el('p', 'cast-name', p.name),
        el('p', 'cast-role', `${p.fullName} \u2014 ${p.role}`),
        el('p', 'cast-hook', p.hook),
        el('ul', 'cast-stats', p.stats.map((s) => el('li', null, s))),
      ]),
    ]);
    li.style.setProperty('--accent', p.color);

    // Same contract as the episode stills: the headshot is only attached once it has
    // actually loaded, so a missing /assets/cast/<id>.png leaves a text-only card
    // rather than a broken image. NOT lazy — a detached lazy image never starts
    // fetching, so `loading="lazy"` plus attach-on-load deadlock and the headshots
    // would silently never appear. See the note on `ep-shot` above.
    const shot = new Image();
    shot.className = 'cast-shot';
    shot.alt = `${p.fullName} \u2014 headshot`;
    shot.width = 256;
    shot.height = 256;
    shot.loading = 'eager';
    shot.decoding = 'async';
    shot.addEventListener('load', () => {
      face.appendChild(shot);
      li.classList.add('has-shot');
    });
    shot.addEventListener('error', () => { /* a text-only card, which is the fallback */ });
    shot.src = `/assets/cast/${encodeURIComponent(p.id)}.png`;

    mount.appendChild(li);
  }
}

/* ------------------------------------------------------------------ *
 * favicon
 * ------------------------------------------------------------------ */

/**
 * Draws the logo mark into a 64x64 canvas and installs it as the favicon, so the tab
 * carries the real brand rather than a letter in a box. No icon file is shipped.
 */
export function installFavicon() {
  try {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#05070c';
    ctx.fillRect(0, 0, 64, 64);
    ctx.translate(0, 4);
    drawMark(ctx, 64, 56, { seed: 7 });
    const link = document.querySelector('link[rel="icon"]') || document.createElement('link');
    link.setAttribute('rel', 'icon');
    link.setAttribute('type', 'image/png');
    link.setAttribute('href', c.toDataURL('image/png'));
    if (!link.parentNode) document.head.appendChild(link);
  } catch {
    /* a missing favicon is not worth breaking the page over */
  }
}

/* ------------------------------------------------------------------ *
 * boot
 * ------------------------------------------------------------------ */

/**
 * Wires up the landing page: favicon, hero lockup, episode cards, cast strip, and the
 * "start" button's href.
 *
 * @returns {() => void} teardown, for completeness — the page never calls it
 */
export function initGallery() {
  installFavicon();

  const stops = [];
  stops.push(mountHero(document.getElementById('logo-slot')));
  stops.push(renderEpisodes(document.getElementById('episodes')));
  renderCast(document.getElementById('cast'));

  const start = document.getElementById('start');
  if (start && EPISODES.length) {
    start.href = `/watch.html?ep=${encodeURIComponent(EPISODES[0].id)}`;
  }

  const count = document.getElementById('ep-count');
  if (count) count.textContent = `${String(EPISODES.length).padStart(2, '0')} / ${String(EPISODES.length).padStart(2, '0')}`;

  return () => { for (const s of stops) if (typeof s === 'function') s(); };
}

// Page entry point. index.html loads this module directly, so it boots itself rather
// than needing an inline <script> (which a strict CSP would have to whitelist). The
// #logo-slot check means importing this module from anywhere else is side-effect free.
if (typeof document !== 'undefined' && document.getElementById('logo-slot')) {
  initGallery();
}
