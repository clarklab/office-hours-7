/**
 * OFFICE HOURS VII — the show logo.
 *
 * Anatomy lifted from the Final Fantasy VII logo: a fine white hand-drawn mark hanging
 * above a widely-tracked serif wordmark, with a large roman numeral beneath it, all filled
 * with a vertical metallic silver gradient over a near-black outline.
 *
 * Where FF7 has Meteor bearing down on the planet, we have a crumpled sheet of paper the
 * size of a meteor bearing down on a very small business park.
 *
 * Everything here is drawn procedurally into a 2D canvas context and is deterministic:
 * the same size and seed always produce the same linework.
 */

/* ------------------------------------------------------------------ *
 * deterministic noise
 * ------------------------------------------------------------------ */

/**
 * mulberry32 — small deterministic PRNG so the "hand-drawn" jitter is stable across
 * reloads, screenshots and thumbnail renders.
 * @param {number} seed
 * @returns {() => number} random in [0, 1)
 */
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ *
 * hand-drawn primitives
 * ------------------------------------------------------------------ */

/**
 * A straight-ish line with a slight bow and jittered endpoints, so it reads as inked
 * by hand rather than plotted.
 */
function roughLine(ctx, x1, y1, x2, y2, r, jitter) {
  const j = jitter === undefined ? 1 : jitter;
  const mx = (x1 + x2) / 2 + (r() - 0.5) * j * 2.2;
  const my = (y1 + y2) / 2 + (r() - 0.5) * j * 2.2;
  ctx.beginPath();
  ctx.moveTo(x1 + (r() - 0.5) * j, y1 + (r() - 0.5) * j);
  ctx.quadraticCurveTo(mx, my, x2 + (r() - 0.5) * j, y2 + (r() - 0.5) * j);
  ctx.stroke();
}

/** Closed rough polygon through a list of [x, y] points. */
function roughPoly(ctx, pts, r, jitter) {
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    roughLine(ctx, a[0], a[1], b[0], b[1], r, jitter);
  }
}

/** Parallel shading strokes clipped to an angle — the classic pen-hatch. */
function hatch(ctx, cx, cy, rad, angle, count, r, spread) {
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  for (let i = 0; i < count; i++) {
    const t = (i / (count - 1) - 0.5) * 2 * rad * (spread === undefined ? 1 : spread);
    const len = rad * (0.5 + r() * 0.55) * Math.sqrt(Math.max(0, 1 - (t / rad) * (t / rad)));
    const px = cx + -sa * t;
    const py = cy + ca * t;
    roughLine(ctx, px - ca * len, py - sa * len, px + ca * len, py + sa * len, r, 0.8);
  }
}

/* ------------------------------------------------------------------ *
 * the mark — a crumpled paper meteor over a very small business park
 * ------------------------------------------------------------------ */

/**
 * Draws the meteor illustration.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w @param {number} h
 * @param {Object} [o]
 * @param {number} [o.seed=7]
 * @param {number} [o.alpha=1]
 */
export function drawMark(ctx, w, h, o) {
  const opt = o || {};
  const r = rng(opt.seed === undefined ? 7 : opt.seed);
  const a = opt.alpha === undefined ? 1 : opt.alpha;
  const s = Math.min(w, h * 1.7) / 100;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#ffffff';

  const cx = w * 0.5;
  const cy = h * 0.37;
  const rad = Math.min(w * 0.245, h * 0.355);

  /* --- motion streaks, from the upper right, drawn behind the mass --- */
  const ang0 = 2.24; // travelling down-left, so the streaks trail up and to the right
  for (let i = 0; i < 14; i++) {
    const off = (i / 13 - 0.5) * rad * 2.5;
    const px = cx + Math.cos(ang0 + Math.PI / 2) * off;
    const py = cy + Math.sin(ang0 + Math.PI / 2) * off;
    const near = rad * (0.95 + r() * 0.35);
    const len = rad * (1.5 + r() * 1.7);
    ctx.lineWidth = Math.max(0.6, s * (0.06 + r() * 0.10));
    ctx.globalAlpha = a * (0.10 + r() * 0.30);
    roughLine(ctx, px - Math.cos(ang0) * near, py - Math.sin(ang0) * near,
      px - Math.cos(ang0) * len, py - Math.sin(ang0) * len, r, 2.4);
  }

  /* --- the horizon: a very small business park --- */
  const hy = h * 0.90;
  ctx.globalAlpha = a * 0.55;
  ctx.lineWidth = Math.max(1, s * 0.13);
  roughLine(ctx, w * 0.20, hy, w * 0.80, hy + s * 0.18, r, 1.4);

  const bw = s * 8.5;
  const bh = s * 4.2;
  const bx = cx - bw * 0.5;
  const by = hy - bh;
  ctx.globalAlpha = a * 0.9;
  ctx.lineWidth = Math.max(1, s * 0.15);
  roughPoly(ctx, [[bx, by], [bx + bw, by], [bx + bw, hy], [bx, hy]], r, 0.5);
  ctx.globalAlpha = a * 0.45;
  ctx.lineWidth = Math.max(0.7, s * 0.09);
  for (let row = 1; row <= 3; row++) {
    const yy = by + (bh * row) / 4;
    roughLine(ctx, bx + s * 0.35, yy, bx + bw - s * 0.35, yy, r, 0.4);
  }
  for (let col = 1; col <= 4; col++) {
    const xx = bx + (bw * col) / 5;
    roughLine(ctx, xx, by + s * 0.3, xx, hy - s * 0.25, r, 0.4);
  }
  ctx.globalAlpha = a * 0.42;
  for (const px of [cx - s * 11, cx + s * 11.5]) {
    roughLine(ctx, px, hy, px, hy - s * 2.1, r, 0.5);
    roughLine(ctx, px - s * 0.55, hy - s * 1.7, px + s * 0.55, hy - s * 1.75, r, 0.45);
  }

  /* --- the crumpled sheet: an angular silhouette, opaque, creased like real paper --- */
  const N = 13;
  const pts = [];
  for (let i = 0; i < N; i++) {
    const ang = (i / N) * Math.PI * 2 + (r() - 0.5) * 0.16;
    // paper crumples into sharp corners and shallow dents, not a smooth blob
    const rr = rad * (i % 3 === 0 ? 0.94 + r() * 0.12 : 0.78 + r() * 0.16);
    pts.push([cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr * 0.98]);
  }

  // fill it so the streaks behind do not show through — the mass must read as solid
  ctx.globalAlpha = a;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < N; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fillStyle = 'rgba(4,6,11,0.94)';
  ctx.fill();

  // crumple centres — real crumpled paper fans creases out from a few pinch points
  const centres = [];
  for (let i = 0; i < 3; i++) {
    const ang = (i / 3) * Math.PI * 2 + 0.6;
    const d = rad * (0.16 + r() * 0.30);
    centres.push([cx + Math.cos(ang) * d, cy + Math.sin(ang) * d * 0.9]);
  }

  // silhouette, hard and bright
  ctx.globalAlpha = a;
  ctx.lineWidth = Math.max(1.2, s * 0.21);
  roughPoly(ctx, pts, r, 0.55);

  // each silhouette vertex creases back to its nearest pinch point
  ctx.lineWidth = Math.max(0.8, s * 0.12);
  for (const p of pts) {
    let best = centres[0];
    let bd = Infinity;
    for (const c of centres) {
      const d = (c[0] - p[0]) * (c[0] - p[0]) + (c[1] - p[1]) * (c[1] - p[1]);
      if (d < bd) { bd = d; best = c; }
    }
    ctx.globalAlpha = a * (0.52 + r() * 0.42);
    roughLine(ctx, p[0], p[1], best[0], best[1], r, 0.7);
  }
  // and the pinch points crease to each other
  ctx.globalAlpha = a * 0.6;
  for (let i = 0; i < centres.length; i++) {
    roughLine(ctx, centres[i][0], centres[i][1],
      centres[(i + 1) % centres.length][0], centres[(i + 1) % centres.length][1], r, 0.7);
  }

  // shading hatch on the lower-left facets, clipped to the silhouette
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < N; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.clip();
  ctx.globalAlpha = a * 0.26;
  ctx.lineWidth = Math.max(0.6, s * 0.08);
  hatch(ctx, cx - rad * 0.40, cy + rad * 0.34, rad * 0.62, -0.65, 11, r, 1);
  ctx.globalAlpha = a * 0.16;
  hatch(ctx, cx - rad * 0.10, cy + rad * 0.60, rad * 0.40, -0.65, 7, r, 1);
  ctx.restore();

  // heat ticks radiating off the leading (lower-left) edge
  ctx.globalAlpha = a * 0.4;
  ctx.lineWidth = Math.max(0.7, s * 0.10);
  for (let i = 0; i < 20; i++) {
    const ang = (i / 20) * Math.PI * 2;
    if (Math.cos(ang) > 0.35 && Math.sin(ang) < 0.1) continue;
    const r0 = rad * (1.06 + r() * 0.10);
    const r1 = r0 + rad * (0.08 + r() * 0.18);
    ctx.globalAlpha = a * (0.16 + r() * 0.3);
    roughLine(ctx, cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0 * 0.95,
      cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1 * 0.95, r, 0.9);
  }

  ctx.restore();
}

/* ------------------------------------------------------------------ *
 * the wordmark
 * ------------------------------------------------------------------ */

/**
 * The metallic silver gradient that makes the type read as the real logo:
 * white at the top, a hard mid-grey band across the middle, bright again at the bottom.
 */
function silver(ctx, top, bottom) {
  const g = ctx.createLinearGradient(0, top, 0, bottom);
  g.addColorStop(0.00, '#ffffff');
  g.addColorStop(0.30, '#eef3f9');
  g.addColorStop(0.46, '#b9c4d2');
  g.addColorStop(0.50, '#6c7b8d');
  g.addColorStop(0.545, '#55637446');
  g.addColorStop(0.55, '#8b98a8');
  g.addColorStop(0.72, '#dfe7f0');
  g.addColorStop(1.00, '#f7fafd');
  return g;
}

const SERIF = '"Times New Roman", "Nimbus Roman", Times, "Liberation Serif", Georgia, serif';

/**
 * Draws text with manual letter-spacing, an outline, and the silver fill.
 * Canvas letterSpacing is not universally supported, so it is done by hand.
 */
function trackedText(ctx, text, cx, y, px, track, weight) {
  ctx.font = (weight || 400) + ' ' + px + 'px ' + SERIF;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  const chars = Array.from(text);
  let total = 0;
  for (const c of chars) total += ctx.measureText(c).width + track;
  total -= track;

  const top = y - px * 0.74;
  const bottom = y + px * 0.10;

  let x = cx - total / 2;
  for (const c of chars) {
    const wid = ctx.measureText(c).width;
    ctx.lineWidth = Math.max(1.5, px * 0.055);
    ctx.strokeStyle = '#080c14';
    ctx.lineJoin = 'round';
    ctx.strokeText(c, x, y);
    ctx.fillStyle = silver(ctx, top, bottom);
    ctx.fillText(c, x, y);
    x += wid + track;
  }
  return { width: total, top: top, bottom: bottom };
}

/**
 * Draws the OFFICE HOURS / VII type lockup.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w @param {number} h
 * @param {Object} [o]
 * @param {string} [o.subtitle]
 * @param {number} [o.alpha=1]
 */
export function drawWordmark(ctx, w, h, o) {
  const opt = o || {};
  const a = opt.alpha === undefined ? 1 : opt.alpha;
  ctx.save();
  ctx.globalAlpha = a;

  // Lay the stack out from real metrics rather than magic fractions, so OFFICE HOURS
  // and VII never collide at any aspect ratio.
  const topPx = Math.min(w * 0.070, h * 0.20);
  const viiPx = Math.min(w * 0.235, h * 0.62);
  const topCap = topPx * 0.72;
  const viiCap = viiPx * 0.72;
  const gap = topPx * 0.62;
  const stack = topCap + gap + viiCap;
  const top = (h - stack) / 2;

  const topBase = top + topCap;
  const viiBase = top + topCap + gap + viiCap;

  const small = trackedText(ctx, 'OFFICE HOURS', w * 0.5, topBase, topPx, topPx * 0.34, 400);
  trackedText(ctx, 'VII', w * 0.5, viiBase, viiPx, viiPx * 0.05, 400);

  // Short flanking hairlines OUTSIDE the small type, vertically centred on it —
  // never a rule running through the letters.
  const ruleY = topBase - topCap * 0.46;
  const inner = small.width / 2 + topPx * 0.85;
  const outer = Math.min(w * 0.47, inner + topPx * 2.6);
  if (outer > inner) {
    ctx.globalAlpha = a * 0.5;
    ctx.strokeStyle = '#b9c6d6';
    ctx.lineWidth = Math.max(0.8, topPx * 0.035);
    ctx.beginPath();
    ctx.moveTo(w * 0.5 - outer, ruleY);
    ctx.lineTo(w * 0.5 - inner, ruleY);
    ctx.moveTo(w * 0.5 + inner, ruleY);
    ctx.lineTo(w * 0.5 + outer, ruleY);
    ctx.stroke();
  }

  if (opt.subtitle) {
    const sp = Math.max(9, Math.min(w * 0.019, h * 0.07));
    ctx.globalAlpha = a * 0.7;
    ctx.font = '400 ' + sp + 'px ' + SERIF;
    ctx.fillStyle = '#9fadbe';
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    const chars = Array.from(opt.subtitle.toUpperCase());
    const track = sp * 0.45;
    let total = 0;
    for (const c of chars) total += ctx.measureText(c).width + track;
    total -= track;
    let x = w * 0.5 - total / 2;
    const y = viiBase + sp * 2.0;
    for (const c of chars) {
      ctx.fillText(c, x, y);
      x += ctx.measureText(c).width + track;
    }
  }

  ctx.restore();
}

/* ------------------------------------------------------------------ *
 * full lockup
 * ------------------------------------------------------------------ */

/**
 * Draws the complete OFFICE HOURS VII logo lockup.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w @param {number} h
 * @param {Object} [o]
 * @param {boolean} [o.mark=true]
 * @param {boolean} [o.wordmark=true]
 * @param {string}  [o.subtitle]
 * @param {number}  [o.glow=0.35]
 * @param {number}  [o.seed=7]
 * @param {number}  [o.alpha=1]
 */
export function drawFullLogo(ctx, w, h, o) {
  const opt = o || {};
  const showMark = opt.mark !== false;
  const showWord = opt.wordmark !== false;
  const glow = opt.glow === undefined ? 0.35 : opt.glow;
  const a = opt.alpha === undefined ? 1 : opt.alpha;

  ctx.save();

  // cool outer glow — a soft radial wash behind everything
  if (glow > 0) {
    const g = ctx.createRadialGradient(w * 0.5, h * 0.46, 0, w * 0.5, h * 0.46, Math.max(w, h) * 0.62);
    g.addColorStop(0, 'rgba(96,138,196,' + (0.30 * glow * a).toFixed(3) + ')');
    g.addColorStop(0.45, 'rgba(58,84,132,' + (0.14 * glow * a).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  // The mark occupies the top ~54%, the type the bottom ~40%, overlapping slightly —
  // the numeral's ascenders tuck under the illustration exactly like the FF7 lockup.
  if (showMark) {
    ctx.save();
    ctx.translate(w * 0.5 - w * 0.34, 0);
    drawMark(ctx, w * 0.68, h * (showWord ? 0.58 : 1), { seed: opt.seed, alpha: a });
    ctx.restore();
  }
  if (showWord) {
    ctx.save();
    const wy = showMark ? h * 0.52 : h * 0.08;
    const wh = showMark ? h * 0.36 : h * 0.76;
    ctx.translate(0, wy);
    drawWordmark(ctx, w, wh, { subtitle: opt.subtitle, alpha: a });
    ctx.restore();
  }

  ctx.restore();
}

/* ------------------------------------------------------------------ *
 * convenience
 * ------------------------------------------------------------------ */

/**
 * Returns a detached canvas with the logo drawn on it at device pixel ratio.
 * The logo is vector-ish, so redraw on resize rather than CSS-scaling the bitmap.
 * @param {number} w @param {number} h
 * @param {Object} [o] see drawFullLogo; plus {number} [o.dpr]
 * @returns {HTMLCanvasElement}
 */
export function logoCanvas(w, h, o) {
  const opt = o || {};
  const dpr = opt.dpr || (typeof devicePixelRatio === 'number' ? Math.min(devicePixelRatio, 3) : 1);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * dpr));
  c.height = Math.max(1, Math.round(h * dpr));
  c.style.width = w + 'px';
  c.style.height = h + 'px';
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  drawFullLogo(ctx, w, h, opt);
  return c;
}

/**
 * A nearest-filtered texture of the logo for use inside the 3D scene or a title card.
 * Imports three lazily so the gallery page never pulls it in.
 * @param {number} w @param {number} h
 * @param {Object} [o] see drawFullLogo
 * @returns {Promise<import('three').Texture>}
 */
export async function logoTexture(w, h, o) {
  const THREE = await import('three');
  const c = logoCanvas(w, h, Object.assign({ dpr: 1 }, o || {}));
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
