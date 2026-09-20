/**
 * OFFICE HOURS — the cast.
 *
 * This module is deliberately DEPENDENCY-FREE at the top level: it imports
 * neither three nor any of the character builders. Importing it costs one small
 * file and builds no geometry, so the gallery page can pull {@link PROFILES}
 * for its cast strip without dragging the renderer in behind it.
 *
 * The geometry lives behind {@link loadCast}, which dynamically imports the six
 * builders. After that (or after any character module has been imported
 * directly) {@link spawn} and {@link CAST} work synchronously.
 *
 *   const cast = await loadCast();      // once, during setup
 *   const brad = spawn('brad');         // sync from here on
 *
 * @module characters/index
 */

/**
 * @typedef {import('./rig.js').CharProfile} CharProfile
 * @typedef {import('./rig.js').Actor} Actor
 */

/**
 * The cast, as plain data. No three, no canvas, no geometry — safe to import
 * from a static page. Joke stats are per SPEC section 6.
 * @type {Object<string, CharProfile>}
 */
export const PROFILES = {
  brad: {
    id: 'brad',
    name: 'BRAD',
    fullName: 'BRAD HOLLOWAY',
    role: 'FOUNDER / CEO',
    color: '#39c7b5',
    voice: 'brad',
    stats: ['LV 9', 'HP 40/40', 'VIBES 999'],
    height: 1.86,
  },
  dez: {
    id: 'dez',
    name: 'DEZ',
    fullName: 'DEZ VALENTI',
    role: 'HEAD OF SALES',
    color: '#e0457b',
    voice: 'dez',
    stats: ['LV 12', 'HP 88/88', 'CLOSE RATE 4%'],
    height: 1.78,
  },
  kiki: {
    id: 'kiki',
    name: 'KIKI',
    fullName: 'KIKI PARK',
    role: 'FRONT OF HOUSE',
    color: '#7ee04a',
    voice: 'kiki',
    stats: ['LV 7', 'HP 62/62', 'PATIENCE 0'],
    height: 1.58,
  },
  roop: {
    id: 'roop',
    name: 'ROOP',
    fullName: 'RUPERT "ROOP" NG',
    role: 'IT',
    color: '#8f7ae0',
    voice: 'roop',
    stats: ['LV 14', 'HP 31/31', 'TICKETS 402'],
    height: 1.74,
  },
  marge: {
    id: 'marge',
    name: 'MARGE',
    fullName: 'MARGUERITE OKONKWO',
    role: 'FINANCE',
    color: '#e8a33d',
    voice: 'marge',
    stats: ['LV 11', 'HP 55/55', 'MP 12'],
    height: 1.71,
  },
  tuesday: {
    id: 'tuesday',
    name: 'TUESDAY',
    fullName: 'TUESDAY',
    role: 'UNAUTHORISED DOG',
    color: '#c98a4b',
    voice: 'tuesday',
    stats: ['LV ?', 'HP ???', 'GOOD 10/10'],
    height: 0.62,
  },
};

/** Cast ids in billing order. @type {string[]} */
export const CAST_IDS = ['brad', 'dez', 'kiki', 'roop', 'marge', 'tuesday'];

/** id -> module path and the factory it exports. @type {Object<string, string[]>} */
const SOURCES = {
  brad: ['/js/characters/brad.js', 'createBrad'],
  dez: ['/js/characters/dez.js', 'createDez'],
  kiki: ['/js/characters/kiki.js', 'createKiki'],
  roop: ['/js/characters/roop.js', 'createRoop'],
  marge: ['/js/characters/marge.js', 'createMarge'],
  tuesday: ['/js/characters/tuesday.js', 'createTuesday'],
};

/**
 * Factories, filled in by {@link loadCast} or by a character module registering
 * itself when imported directly.
 * @type {Object<string, () => Actor>}
 */
const registry = {};

/** @type {Promise<Object<string, () => Actor>>|null} */
let loading = null;

/**
 * Character modules call this on import so that importing `brad.js` directly is
 * enough to make `spawn('brad')` work.
 * @param {string} id
 * @param {() => Actor} factory
 * @returns {void}
 */
export function register(id, factory) {
  if (typeof factory === 'function') registry[id] = factory;
}

/**
 * @param {string} id
 * @returns {() => Actor}
 */
function factoryFor(id) {
  const f = registry[id];
  if (!f) {
    throw new Error(
      `characters: '${id}' is not loaded yet. Call \`await loadCast()\` (or ` +
      '`await spawnAsync(id)`) once during setup before building characters.',
    );
  }
  return f;
}

/**
 * Dynamically imports the character builders. Idempotent, and safe to await
 * from several places at once.
 * @param {string[]} [ids] defaults to the whole cast
 * @returns {Promise<Object<string, () => Actor>>} {@link CAST}
 */
export function loadCast(ids) {
  if (!ids && loading) return loading;
  const wanted = (ids && ids.length ? ids : CAST_IDS).filter((id) => SOURCES[id]);
  const p = Promise.all(wanted.map(async (id) => {
    if (registry[id]) return;
    const [path, name] = SOURCES[id];
    const mod = await import(path);
    const f = mod[name] || mod.default;
    if (typeof f !== 'function') throw new Error(`characters: ${path} has no ${name}()`);
    registry[id] = f;
  })).then(() => CAST);
  if (!ids) loading = p;
  return p;
}

/**
 * @returns {boolean} true once every builder is in memory
 */
export function isCastLoaded() {
  return CAST_IDS.every((id) => !!registry[id]);
}

/**
 * The character factories. Each one builds a fresh {@link Actor}; call
 * {@link loadCast} first.
 * @type {Object<string, () => Actor>}
 */
export const CAST = {
  /** @returns {Actor} BRAD HOLLOWAY — founder, tallest, puffy vest, hair spike. */
  brad: () => factoryFor('brad')(),
  /** @returns {Actor} DEZ VALENTI — sales, shoulder pads you could land a plane on. */
  dez: () => factoryFor('dez')(),
  /** @returns {Actor} KIKI PARK — front of house, hair mass, headset, phone. */
  kiki: () => factoryFor('kiki')(),
  /** @returns {Actor} RUPERT "ROOP" NG — IT, hood up, carrying a CRT. */
  roop: () => factoryFor('roop')(),
  /** @returns {Actor} MARGUERITE OKONKWO — finance, bun, glasses, red ledger. */
  marge: () => factoryFor('marge')(),
  /** @returns {Actor} TUESDAY — an unauthorised dog. */
  tuesday: () => factoryFor('tuesday')(),
};

/**
 * Builds one character. Synchronous; requires {@link loadCast} to have resolved.
 * @param {string} id 'brad'|'dez'|'kiki'|'roop'|'marge'|'tuesday'
 * @returns {Actor}
 */
export function spawn(id) {
  const key = String(id || '').toLowerCase();
  if (!SOURCES[key]) throw new Error(`characters: unknown cast member '${id}'`);
  return factoryFor(key)();
}

/**
 * Loads (if needed) and builds one character.
 * @param {string} id
 * @returns {Promise<Actor>}
 */
export async function spawnAsync(id) {
  const key = String(id || '').toLowerCase();
  if (!SOURCES[key]) throw new Error(`characters: unknown cast member '${id}'`);
  if (!registry[key]) await loadCast([key]);
  return spawn(key);
}

/**
 * Loads and builds the whole cast in one call — what the player wants.
 * @param {string[]} [ids] defaults to the whole cast
 * @returns {Promise<Object<string, Actor>>} keyed by id
 */
export async function spawnAll(ids) {
  const wanted = (ids && ids.length ? ids : CAST_IDS).filter((id) => SOURCES[id]);
  await loadCast(wanted);
  /** @type {Object<string, Actor>} */
  const out = {};
  for (const id of wanted) out[id] = spawn(id);
  return out;
}

/**
 * Drives every actor in a cast map for one frame. Nothing in the rig is
 * self-driving, so somebody has to call this from the stage's update loop.
 * @param {Object<string, {update?:(dt:number,t:number)=>void}>} cast
 * @param {number} dt @param {number} t
 * @returns {void}
 */
export function updateCast(cast, dt, t) {
  if (!cast) return;
  for (const key of Object.keys(cast)) {
    const a = cast[key];
    if (a && typeof a.update === 'function') a.update(dt, t);
  }
}
