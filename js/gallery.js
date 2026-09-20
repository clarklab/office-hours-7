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

/* ------------------------------------------------------------------ *
 * the cast — data only
 * ------------------------------------------------------------------ */

/**
 * The six `CharProfile`-shaped records the cast strip renders.
 *
 * These are copied from SPEC §6 rather than imported from `/js/characters/index.js`:
 * that module's `PROFILES` sits in the same file as the character factories, which
 * statically import `rig.js` -> `three`, so importing it here would pull the whole
 * 1MB+ 3D stack into a page that renders no 3D at all. SPEC §6 is the authority for
 * both files; if a character's accent or role changes there, change it here too.
 *
 * `hook` is this page's own field — the silhouette note from the spec table, used as
 * the one-line character description.
 *
 * @type {ReadonlyArray<{id:string, name:string, fullName:string, role:string, color:string, stats:string[], hook:string}>}
 */
export const CAST_PROFILES = Object.freeze([
  Object.freeze({
    id: 'brad',
    name: 'BRAD',
    fullName: 'BRAD HOLLOWAY',
    role: 'Founder / CEO',
    color: '#39c7b5',
    stats: Object.freeze(['LV 9', 'HP 40/40', 'VIBES 999']),
    hook: 'Tallest in the room, hair at an angle, puffy vest over a dress shirt.',
  }),
  Object.freeze({
    id: 'dez',
    name: 'DEZ',
    fullName: 'DEZ VALENTI',
    role: 'Head of Sales',
    color: '#e0457b',
    stats: Object.freeze(['LV 12', 'HP 88/88', 'CLOSE RATE 4%']),
    hook: 'Shoulder pads with a magenta suit attached. Shades indoors. Ponytail.',
  }),
  Object.freeze({
    id: 'kiki',
    name: 'KIKI',
    fullName: 'KIKI PARK',
    role: 'Front of House',
    color: '#7ee04a',
    stats: Object.freeze(['LV 7', 'HP 62/62', 'PATIENCE 0']),
    hook: 'Shortest, roundest hair, headset mic boom, forever tangled in the cord.',
  }),
  Object.freeze({
    id: 'roop',
    name: 'ROOP',
    fullName: 'RUPERT "ROOP" NG',
    role: 'IT',
    color: '#8f7ae0',
    stats: Object.freeze(['LV 14', 'HP 31/31', 'TICKETS 402']),
    hook: 'Hood up, shoulders down, cargo shorts, socks and sandals, under a desk.',
  }),
  Object.freeze({
    id: 'marge',
    name: 'MARGE',
    fullName: 'MARGUERITE OKONKWO',
    role: 'Finance',
    color: '#e8a33d',
    stats: Object.freeze(['LV 11', 'HP 55/55', 'MP 12']),
    hook: 'Ramrod straight, tight bun, enormous round glasses, one red ledger.',
  }),
  Object.freeze({
    id: 'tuesday',
    name: 'TUESDAY',
    fullName: 'TUESDAY',
    role: 'Unauthorised Dog',
    color: '#c98a4b',
    stats: Object.freeze(['LV ?', 'HP ???', 'GOOD 10/10']),
    hook: 'Scruffy and tan. One floppy ear, one up. Tail keeps perfect time.',
  }),
]);

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

/** Design space the plate art is composed in. Scaled up to the element's real size. */
const PLATE_W = 256;
const PLATE_H = 144;

/** Horizon: where the back wall meets the carpet. */
const HORIZON = PLATE_H * 0.545;

/**
 * A dark silhouette block with a thin rim of light along its top edge — the whole
 * set is read in silhouette against the fluorescents, exactly like the real scenes.
 *
 * @param {CanvasRenderingContext2D} c
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {string} rim rim-light colour
 * @param {number} [rimAlpha=0.5]
 */
function block(c, x, y, w, h, rim, rimAlpha = 0.5) {
  c.fillStyle = '#04060a';
  c.fillRect(x, y, w, h);
  c.globalAlpha = rimAlpha;
  c.fillStyle = rim;
  c.fillRect(x, y, w, 1);
  c.globalAlpha = 1;
}

/**
 * A standing person, in the blocky PS1 proportions the show uses: slab torso,
 * oversized head, no detail below the knee that matters at this size.
 *
 * @param {CanvasRenderingContext2D} c
 * @param {number} x centre
 * @param {number} groundY feet
 * @param {number} h total height
 * @param {string} rim
 */
function figure(c, x, groundY, h, rim) {
  const headH = h * 0.22;
  const bodyH = h * 0.44;
  const legH = h - headH - bodyH;
  const bodyW = h * 0.30;
  const headW = h * 0.20;

  block(c, x - bodyW * 0.36, groundY - legH, bodyW * 0.72, legH, rim, 0.18);
  block(c, x - bodyW / 2, groundY - legH - bodyH, bodyW, bodyH, rim, 0.34);
  block(c, x - headW / 2, groundY - h, headW, headH, rim, 0.62);
}

/**
 * The dog. Four short legs, a body slab, a wedge head, one ear up.
 *
 * @param {CanvasRenderingContext2D} c
 * @param {number} x @param {number} groundY @param {number} h @param {string} rim
 */
function dog(c, x, groundY, h, rim) {
  const bodyW = h * 1.35;
  block(c, x - bodyW / 2, groundY - h * 0.72, bodyW, h * 0.42, rim, 0.45);
  block(c, x - bodyW * 0.42, groundY - h * 0.32, h * 0.16, h * 0.32, rim, 0.12);
  block(c, x + bodyW * 0.26, groundY - h * 0.32, h * 0.16, h * 0.32, rim, 0.12);
  block(c, x + bodyW * 0.34, groundY - h, h * 0.42, h * 0.40, rim, 0.6);
  c.fillStyle = '#04060a';
  c.beginPath();
  c.moveTo(x + bodyW * 0.36, groundY - h);
  c.lineTo(x + bodyW * 0.44, groundY - h * 1.28);
  c.lineTo(x + bodyW * 0.60, groundY - h * 0.98);
  c.closePath();
  c.fill();
  c.fillStyle = '#04060a';
  c.fillRect(x - bodyW * 0.58, groundY - h * 0.78, h * 0.22, h * 0.12);
}

/**
 * Draws one episode's poster plate: a PS1 office scene in silhouette under a
 * carpet-tile perspective grid, tinted with the episode accent.
 *
 * This is what the card shows until `/assets/thumbs/epN.png` exists. It is meant to
 * be the artwork, not an apology for a missing file.
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

  /* --- back wall + ceiling wash --- */
  const wall = c.createLinearGradient(0, 0, 0, HORIZON);
  wall.addColorStop(0, '#12202f');
  wall.addColorStop(1, '#070c14');
  c.fillStyle = wall;
  c.fillRect(0, 0, W, HORIZON);

  const glow = c.createRadialGradient(cx, -H * 0.12, 0, cx, -H * 0.12, H * 0.95);
  glow.addColorStop(0, A);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  c.globalAlpha = 0.16;
  c.fillStyle = glow;
  c.fillRect(0, 0, W, HORIZON);
  c.globalAlpha = 1;

  /* --- fluorescent ceiling panels, in perspective --- */
  for (let i = 0; i < 3; i++) {
    const t = i / 2;
    const y = 3 + i * 7;
    const half = W * (0.46 - i * 0.085);
    c.globalAlpha = 0.5 - i * 0.13;
    c.fillStyle = '#cfe2f5';
    c.fillRect(cx - half, y, half * 2, 2.2 - t);
  }
  c.globalAlpha = 1;

  /* --- window band: a flat PS1 cityscape --- */
  const wy = HORIZON - 30;
  c.fillStyle = '#060c16';
  c.fillRect(0, wy, W, 22);
  c.globalAlpha = 0.5;
  c.fillStyle = '#2b4fa8';
  c.fillRect(0, wy, W, 22);
  c.globalAlpha = 1;
  let bx = 4;
  let n = 0;
  while (bx < W - 4) {
    const bw = 7 + ((n * 13) % 11);
    const bh = 6 + ((n * 7) % 15);
    c.fillStyle = '#04060a';
    c.fillRect(bx, wy + 22 - bh, bw, bh);
    c.fillStyle = '#ffd9a0';
    c.globalAlpha = 0.5;
    for (let r = 0; r < Math.floor(bh / 4); r++) {
      if ((n + r) % 3 === 0) c.fillRect(bx + 2, wy + 24 - bh + r * 4, 2, 2);
    }
    c.globalAlpha = 1;
    bx += bw + 2;
    n++;
  }
  c.globalAlpha = 0.45;
  c.fillStyle = '#9fb6cf';
  c.fillRect(0, wy, W, 1);
  c.fillRect(0, wy + 21, W, 1);
  c.globalAlpha = 1;

  /* --- carpet + perspective grid --- */
  const floor = c.createLinearGradient(0, HORIZON, 0, H);
  floor.addColorStop(0, '#0a1119');
  floor.addColorStop(1, '#04060a');
  c.fillStyle = floor;
  c.fillRect(0, HORIZON, W, H - HORIZON);

  c.strokeStyle = A;
  c.lineWidth = 0.6;
  c.globalAlpha = 0.26;
  c.beginPath();
  for (let i = -9; i <= 9; i++) {
    c.moveTo(cx, HORIZON);
    c.lineTo(cx + i * (W * 0.20), H);
  }
  for (let k = 1; k <= 7; k++) {
    const y = HORIZON + (H - HORIZON) * (1 - 1 / (1 + k * 0.52));
    c.moveTo(0, y);
    c.lineTo(W, y);
  }
  c.stroke();
  c.globalAlpha = 1;

  c.globalAlpha = 0.55;
  c.fillStyle = A;
  c.fillRect(0, HORIZON - 0.5, W, 1);
  c.globalAlpha = 1;

  /* --- per-episode staging --- */
  if (ep.id === 'ep1') {
    // STANDUP: five people in a line, a whiteboard behind them.
    block(c, cx - 44, HORIZON - 26, 62, 24, '#cfe2f5', 0.32);
    c.globalAlpha = 0.20;
    c.fillStyle = '#cfe2f5';
    c.fillRect(cx - 39, HORIZON - 21, 34, 1.4);
    c.fillRect(cx - 39, HORIZON - 16, 44, 1.4);
    c.fillRect(cx - 39, HORIZON - 11, 22, 1.4);
    c.globalAlpha = 1;
    const spots = [[46, 40], [86, 44], [128, 47], [170, 45], [210, 41]];
    for (const [x, h] of spots) figure(c, x, H - 6 + (h - 44) * 0.3, h, A);
  } else if (ep.id === 'ep2') {
    // RUNWAY: the meeting table, and a chart that only goes one way.
    block(c, cx - 52, HORIZON - 34, 104, 32, '#cfe2f5', 0.3);
    c.strokeStyle = '#ff6a5e';
    c.lineWidth = 1.4;
    c.globalAlpha = 0.9;
    c.beginPath();
    c.moveTo(cx - 45, HORIZON - 30);
    c.lineTo(cx - 20, HORIZON - 22);
    c.lineTo(cx + 4, HORIZON - 14);
    c.lineTo(cx + 44, HORIZON - 5);
    c.stroke();
    c.globalAlpha = 1;
    for (const [x, h] of [[40, 40], [78, 43], [178, 43], [216, 40]]) {
      figure(c, x, H - 14 + (h - 42) * 0.3, h, A);
    }
    c.fillStyle = '#060b14';
    c.beginPath();
    c.moveTo(cx - 92, H - 4);
    c.lineTo(cx + 92, H - 4);
    c.lineTo(cx + 46, H - 34);
    c.lineTo(cx - 46, H - 34);
    c.closePath();
    c.fill();
    c.globalAlpha = 0.55;
    c.strokeStyle = A;
    c.lineWidth = 1;
    c.stroke();
    c.globalAlpha = 1;
  } else {
    // TUESDAY: a dog, a lot of empty carpet, and a target cursor.
    for (const [x, h] of [[30, 40], [64, 43], [196, 43], [228, 40]]) {
      figure(c, x, H - 18 + (h - 42) * 0.3, h, A);
    }
    block(c, 96, HORIZON - 20, 30, 18, '#cfe2f5', 0.22);
    dog(c, cx + 4, H - 14, 26, A);
    c.fillStyle = '#ffce4a';
    c.beginPath();
    c.moveTo(cx - 3, H - 52);
    c.lineTo(cx + 11, H - 52);
    c.lineTo(cx + 4, H - 44);
    c.closePath();
    c.fill();
  }

  /* --- dither-ish scanlines, baked so they survive any scale --- */
  c.globalAlpha = 0.22;
  c.fillStyle = '#000';
  for (let y = 0; y < H; y += 2) c.fillRect(0, y, W, 1);
  c.globalAlpha = 1;

  /* --- vignette --- */
  const vig = c.createRadialGradient(cx, H * 0.46, H * 0.18, cx, H * 0.46, H * 0.95);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.72)');
  c.fillStyle = vig;
  c.fillRect(0, 0, W, H);
}

/**
 * Sizes a plate canvas to its box at device resolution and redraws it in the
 * 256x144 design space. Called on mount and on every resize.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {import('/js/episodes/index.js').EpisodeMeta} ep
 */
function paintPlate(canvas, ep) {
  const box = canvas.getBoundingClientRect();
  const w = Math.max(64, Math.round(box.width || PLATE_W));
  const h = Math.max(36, Math.round(box.height || PLATE_H));
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
  if (!slot) return () => {};
  let lastW = -1;
  /** @type {HTMLCanvasElement|null} */
  let canvas = null;

  const draw = () => {
    const avail = Math.round(slot.clientWidth || HERO_MAX);
    const w = Math.max(240, Math.min(HERO_MAX, avail));
    if (Math.abs(w - lastW) < 2 && canvas) return;
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
    drawFullLogo(c, w, h, { subtitle: 'a MULCH production', glow: 0.42, seed: 7 });

    if (canvas) canvas.replaceWith(next);
    else slot.appendChild(next);
    canvas = next;
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
  shot.loading = 'lazy';
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
 * three.js, no character modules.
 *
 * @param {HTMLElement} mount a `<ul>`
 */
export function renderCast(mount) {
  if (!mount) return;
  mount.textContent = '';
  for (const p of CAST_PROFILES) {
    const li = el('li', 'cast-card', [
      el('p', 'cast-name', p.name),
      el('p', 'cast-role', `${p.fullName} — ${p.role}`),
      el('p', 'cast-hook', p.hook),
      el('ul', 'cast-stats', p.stats.map((s) => el('li', null, s))),
    ]);
    li.style.setProperty('--accent', p.color);
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
