/**
 * OFFICE HOURS VII — shared helpers for the viewer-episode functions.
 *
 * @module netlify/functions/_shared
 */

import { getStore } from '@netlify/blobs';

/** Blobs store holding finished episode specs, keyed by id. */
export const EPISODE_STORE = 'viewer-episodes';
/** Blobs store holding in-flight job status, keyed by id. */
export const JOB_STORE = 'viewer-jobs';
/** Blobs store holding per-day submission counts. */
export const LIMIT_STORE = 'viewer-limits';
/**
 * Blobs store holding the private half of a submission: the prompt, the name,
 * and which counters it was charged to. Kept apart from JOB_STORE because
 * /api/job serves job records to anyone who knows the id.
 */
export const TICKET_STORE = 'viewer-tickets';

/* ------------------------------------------------------------------ *
 * the daily limit — every number lives here and nowhere else
 * ------------------------------------------------------------------ */

/** Submissions allowed per device (and per IP) per day. */
export const DAILY_LIMIT = 2;

/**
 * Names that get a bigger allowance, lower-cased. HONOUR SYSTEM: anyone can
 * type any name, so this is a convenience, not an access control.
 */
export const NAME_LIMITS = Object.freeze({ clark: 15 });

/** Longest prompt the generator reads. Mirrored by the textarea's maxlength. */
export const MAX_PROMPT = 500;

/** Longest name the form accepts. Mirrored by the input's maxlength. */
export const MAX_NAME = 40;

/**
 * Normalises a submitted name: control characters out, whitespace collapsed,
 * trimmed, capped.
 *
 * @param {*} raw
 * @returns {string} possibly empty
 */
export function cleanName(raw) {
  return String(raw == null ? '' : raw)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME)
    .trim();
}

/**
 * The allowance for a name. The client never sends a limit; it is always
 * derived here from the name, so the server stays the authority.
 *
 * @param {string} name already cleaned
 * @returns {number}
 */
export function limitFor(name) {
  const k = String(name || '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(NAME_LIMITS, k) ? NAME_LIMITS[k] : DAILY_LIMIT;
}

/** @returns {string} today's date as YYYY-MM-DD, UTC */
export function today() {
  return new Date().toISOString().slice(0, 10);
}

/** @returns {string} when today's counters stop counting: the next midnight UTC, ISO */
export function resetsAt() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)).toISOString();
}

/** @returns {string} a fresh viewer-episode id */
export function newId() {
  const rnd = Array.from(crypto.getRandomValues(new Uint8Array(6)))
    .map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 10);
  return `u_${rnd}`;
}

/**
 * @param {number} status
 * @param {*} body
 * @returns {Response}
 */
export function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

/**
 * The client's IP, as Netlify reports it.
 *
 * @param {Request} req
 * @param {*} context
 * @returns {string}
 */
export function clientIp(req, context) {
  if (context && context.ip) return String(context.ip);
  const fwd = req.headers.get('x-nf-client-connection-ip')
    || req.headers.get('x-forwarded-for') || '';
  return String(fwd).split(',')[0].trim() || 'unknown';
}

/** The device id shape the client mints. Anything else counts as no device. */
const DEVICE_RE = /^u_[a-z0-9]{6,12}$/;

/**
 * The two counter keys a submission is charged to.
 *
 * TWO counters, deliberately. The device id is supplied by the browser and is
 * trivially reset by clearing site data, so on its own it is a courtesy, not a
 * limit — it exists so an honest viewer on a shared connection is not punished
 * for a neighbour's submissions. The IP counter is the one that actually holds,
 * and is checked with the same allowance. A submission has to pass both.
 *
 * The NAME is not part of either key. It only picks the allowance; if it were
 * in the key, typing a new name would buy a fresh set of submissions.
 *
 * Neither is airtight: IPs are shared behind CGNAT and change on a phone that
 * switches network. This is a cost guard, not an identity system, and it is
 * sized so that getting around it takes more effort than it is worth.
 *
 * @param {string} deviceId
 * @param {string} ip
 * @returns {string[]} [deviceKey, ipKey]
 */
export function rateKeys(deviceId, ip) {
  const day = today();
  const dev = DEVICE_RE.test(String(deviceId || '')) ? deviceId : 'none';
  return [`d:${dev}:${day}`, `i:${ip}:${day}`];
}

/**
 * Strongly consistent, because these reads decide whether money is spent. The
 * default (eventual) read can be up to a minute stale at the edge, which let a
 * second submission read a count of zero moments after the first one.
 *
 * @returns {*} the limits store
 */
function limitStore() {
  return getStore(LIMIT_STORE, { consistency: 'strong' });
}

/**
 * @param {*} store
 * @param {string} key
 * @returns {Promise<{n:number, etag?:string, exists:boolean}>}
 */
async function readCount(store, key) {
  const rec = await store.getWithMetadata(key, { type: 'json' });
  if (!rec) return { n: 0, exists: false };
  const n = rec.data && typeof rec.data.n === 'number' ? rec.data.n : 0;
  return { n, etag: rec.etag, exists: true };
}

/** How many times a contended compare-and-swap is retried before giving up. */
const CAS_TRIES = 6;

/**
 * Adds `delta` to one counter with a compare-and-swap, so two requests landing
 * together cannot both read 1 and both write 2. A positive delta refuses to
 * take the counter past `ceiling`.
 *
 * @param {*} store
 * @param {string} key
 * @param {number} delta +1 to reserve, -1 to refund
 * @param {number} ceiling
 * @returns {Promise<{ok:boolean, n:number, busy?:boolean}>}
 */
async function bump(store, key, delta, ceiling) {
  for (let i = 0; i < CAS_TRIES; i++) {
    const cur = await readCount(store, key);
    if (delta > 0 && cur.n >= ceiling) return { ok: false, n: cur.n };
    const next = Math.max(0, cur.n + delta);
    if (next === cur.n) return { ok: true, n: next };

    let cond;
    if (!cur.exists) cond = { onlyIfNew: true };
    else if (cur.etag) cond = { onlyIfMatch: cur.etag };
    // No etag means a store that cannot do conditional writes (a local sandbox).
    // Fall back to a plain write rather than locking everyone out.

    const res = await store.setJSON(key, { n: next, day: today() }, cond);
    if (!res || res.modified !== false) return { ok: true, n: next };
    // Someone else wrote between our read and our write. Read again.
    await new Promise((r) => setTimeout(r, 15 + Math.random() * 40));
  }
  return { ok: false, n: -1, busy: true };
}

/**
 * How many submissions are left today, without spending one.
 *
 * @param {string} deviceId
 * @param {string} ip
 * @param {string} name already cleaned
 * @returns {Promise<{limit:number, used:number, remaining:number, resetsAt:string}>}
 */
export async function quota(deviceId, ip, name) {
  const store = limitStore();
  const limit = limitFor(name);
  const counts = await Promise.all(rateKeys(deviceId, ip).map((k) => readCount(store, k)
    .then((c) => c.n).catch(() => 0)));
  const used = Math.max(...counts);
  return { limit, used, remaining: Math.max(0, limit - used), resetsAt: resetsAt() };
}

/**
 * Reserves one submission against both counters, BEFORE any model call. The
 * slot is taken at the moment of asking; a failed generation hands it back
 * with {@link refund}.
 *
 * @param {string} deviceId
 * @param {string} ip
 * @param {string} name already cleaned
 * @returns {Promise<{ok:boolean, limit:number, remaining:number, resetsAt:string,
 *   keys:string[], reason?:string, busy?:boolean}>}
 */
export async function reserve(deviceId, ip, name) {
  const store = limitStore();
  const limit = limitFor(name);
  const keys = rateKeys(deviceId, ip);
  const base = { limit, resetsAt: resetsAt(), keys };
  const full = {
    ...base,
    ok: false,
    remaining: 0,
    reason: `That is ${limit} episode${limit === 1 ? '' : 's'} today. The limit resets at midnight UTC.`,
  };
  const busy = {
    ...base,
    ok: false,
    busy: true,
    remaining: 0,
    reason: 'The office is swamped right now. Give it a few seconds and try again.',
  };

  const dev = await bump(store, keys[0], +1, limit);
  if (dev.busy) return busy;
  if (!dev.ok) return full;

  const ipc = await bump(store, keys[1], +1, limit);
  if (!ipc.ok) {
    // The device slot was taken but the IP had none left: give it back, so a
    // refusal never costs anything.
    await bump(store, keys[0], -1, limit).catch(() => {});
    return ipc.busy ? busy : full;
  }

  return { ...base, ok: true, remaining: Math.max(0, limit - Math.max(dev.n, ipc.n)) };
}

/**
 * Hands a reserved slot back. Used when the failure was ours, not the viewer's.
 *
 * @param {string[]} keys as returned by {@link reserve}
 * @returns {Promise<void>}
 */
export async function refund(keys) {
  if (!Array.isArray(keys)) return;
  const store = limitStore();
  await Promise.all(keys.map((k) => bump(store, String(k), -1, Infinity).catch(() => {})));
}

/**
 * Writes a job's status. The client polls this, so it is the only thing that
 * tells a viewer staring at a loader whether anything is happening.
 *
 * @param {string} id
 * @param {{status:string, stage?:string, error?:string, title?:string}} patch
 * @returns {Promise<void>}
 */
export async function setJob(id, patch) {
  const store = getStore(JOB_STORE, { consistency: 'strong' });
  const prev = await store.get(id, { type: 'json' }).catch(() => null);
  await store.setJSON(id, {
    id,
    ...(prev || {}),
    ...patch,
    updatedAt: new Date().toISOString(),
  });
}
