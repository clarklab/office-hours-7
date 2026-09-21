/**
 * OFFICE HOURS VII — the episode registry.
 *
 * This file is the single source of truth for episode *metadata*. The gallery and the
 * player both read from here and neither of them ever imports `ep1.js` / `ep2.js` /
 * `ep3.js` directly — those modules pull in three.js and the whole 3D stack, and the
 * landing page must stay a text-and-canvas document.
 *
 * The episode modules themselves are fetched on demand by {@link loadEpisode}.
 *
 * @module episodes/index
 */

/**
 * @typedef {Object} EpisodeMeta
 * @property {string} id            module id, e.g. `'ep1'` — also the `?ep=` query value
 * @property {number} number        1-based position in the running order
 * @property {string} ordinal       spelled-out number for chrome, e.g. `'ONE'`
 * @property {string} numeral       roman numeral used in the poster plate, e.g. `'I'`
 * @property {string} title         `'STANDUP'`
 * @property {string} logline       one line for the gallery card
 * @property {string} runtime       `'1:00'`, mm:ss
 * @property {string} accent        CSS hex used for the card, the poster plate and the chrome
 * @property {string[]} starring    character ids, in billing order
 * @property {string} thumb         path to the rendered thumbnail; may 404 until `tools/shoot.mjs` runs
 */

/**
 * The running order. Kept deliberately small and serialisable — no functions, no imports.
 * @type {ReadonlyArray<EpisodeMeta>}
 */
export const EPISODES = Object.freeze([
  Object.freeze({
    id: 'ep1',
    number: 1,
    ordinal: 'ONE',
    numeral: 'I',
    title: 'STANDUP',
    logline: 'Five people introduce themselves. It does not help.',
    runtime: '1:56',
    accent: '#39c7b5',
    starring: Object.freeze(['brad', 'dez', 'kiki', 'roop', 'marge']),
    thumb: '/assets/thumbs/ep1.png',
  }),
  Object.freeze({
    id: 'ep2',
    number: 2,
    ordinal: 'TWO',
    numeral: 'II',
    title: 'RUNWAY',
    logline: 'The budget meeting, run as an escalating RPG menu.',
    runtime: '2:08',
    accent: '#e8a33d',
    starring: Object.freeze(['marge', 'brad', 'dez', 'roop', 'kiki']),
    thumb: '/assets/thumbs/ep2.png',
  }),
  Object.freeze({
    id: 'ep3',
    number: 3,
    ordinal: 'THREE',
    numeral: 'III',
    title: 'TUESDAY',
    logline: 'A dog is in the office. Nobody agrees what to do.',
    runtime: '1:47',
    accent: '#c98a4b',
    starring: Object.freeze(['tuesday', 'kiki', 'brad', 'dez', 'roop', 'marge']),
    thumb: '/assets/thumbs/ep3.png',
  }),
]);

/** Default episode when `?ep=` is missing or blank. @type {string} */
export const DEFAULT_EPISODE_ID = EPISODES[0].id;

/**
 * Viewer-submitted episodes are a SEPARATE GROUPING from the numbered ones
 * above, and the prefix is what keeps them apart everywhere at once.
 *
 * `EPISODES` is the show: three episodes we wrote, numbered, with a running
 * order, thumbnails and a place in the canon. A viewer episode is somebody's
 * prompt turned into a validated JSON spec — it has no number, it is not in the
 * running order, `nextEpisode()` never walks into one, and it is never loaded as
 * a module. Keeping the two in one list would put a stranger's idea in the
 * middle of the show's running order, which is not what either is for.
 *
 * @type {string}
 */
export const VIEWER_PREFIX = 'u_';

/**
 * @param {string|null|undefined} id
 * @returns {boolean} true for a viewer-submitted episode id
 */
export function isViewerEpisodeId(id) {
  return typeof id === 'string' && id.startsWith(VIEWER_PREFIX) && id.length > VIEWER_PREFIX.length;
}

/**
 * @param {string|null|undefined} id
 * @returns {boolean} true for one of the numbered episodes we produced
 */
export function isOfficialEpisodeId(id) {
  return !!getEpisode(id);
}

/**
 * Looks up episode metadata by id. Never throws — the caller decides what an unknown id
 * means (the gallery ignores it, the player shows a not-found card).
 *
 * @param {string|null|undefined} id
 * @returns {EpisodeMeta|null}
 */
export function getEpisode(id) {
  if (!id) return null;
  const want = String(id).trim().toLowerCase();
  return EPISODES.find((e) => e.id === want) || null;
}

/**
 * The episode after `id` in the running order, wrapping from the last back to the first
 * so the player's NEXT EPISODE button is never a dead end.
 *
 * @param {string} id
 * @returns {EpisodeMeta|null} null only if `id` is not a known episode
 */
export function nextEpisode(id) {
  const i = EPISODES.findIndex((e) => e.id === id);
  if (i === -1) return null;
  return EPISODES[(i + 1) % EPISODES.length];
}

/**
 * Parses `'1:05'` into seconds. Used for the player's progress estimate.
 *
 * @param {string} runtime mm:ss
 * @returns {number} seconds, or 60 if unparseable
 */
export function runtimeSeconds(runtime) {
  const m = /^(\d+):(\d{1,2})$/.exec(String(runtime || '').trim());
  if (!m) return 60;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Dynamically imports one episode module and returns its definition with the registry's
 * metadata layered on top, so `EPISODES` stays authoritative for anything the gallery
 * shows while `run` / `poster` come from the module.
 *
 * The import is deliberately lazy: nothing here loads three.js until it is called.
 *
 * @param {string} id
 * @returns {Promise<import('./ep1.js').EpisodeDef>} the episode definition
 * @throws {Error} if the id is unknown, or the module is missing / has no default export
 */
export async function loadEpisode(id) {
  // A viewer episode is data, not a module. It is fetched and interpreted by
  // js/episodes/runtime.js; importing `/js/episodes/u_xxx.js` would be asking
  // the server for a file that must never exist.
  if (isViewerEpisodeId(id)) {
    const e = new Error(`"${id}" is a viewer episode and does not load as a module.`);
    e.code = 'EPISODE_IS_VIEWER';
    throw e;
  }

  const meta = getEpisode(id);
  if (!meta) throw new Error(`Unknown episode: ${id}`);

  let mod;
  try {
    mod = await import(`/js/episodes/${meta.id}.js`);
  } catch (err) {
    const e = new Error(`Episode "${meta.id}" is not available yet.`);
    e.cause = err;
    e.code = 'EPISODE_MISSING';
    throw e;
  }

  const def = mod && mod.default;
  if (!def || typeof def.run !== 'function') {
    const e = new Error(`Episode "${meta.id}" has no default export with a run().`);
    e.code = 'EPISODE_MALFORMED';
    throw e;
  }

  return Object.assign({}, def, meta);
}
