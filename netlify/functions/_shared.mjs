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

/** Submissions allowed per device per day. */
export const DAILY_LIMIT = 2;

/** @returns {string} today's date as YYYY-MM-DD, UTC */
export function today() {
  return new Date().toISOString().slice(0, 10);
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

/**
 * Counts a submission against the daily limit.
 *
 * TWO counters, deliberately. The device id is supplied by the browser and is
 * trivially reset by clearing site data, so on its own it is a courtesy, not a
 * limit — it exists so an honest viewer on a shared connection is not punished
 * for a neighbour's submissions. The IP counter is the one that actually holds,
 * and is checked with the same allowance. A submission has to pass both.
 *
 * Neither is airtight: IPs are shared behind CGNAT and change on a phone that
 * switches network. This is a cost guard, not an identity system, and it is
 * sized so that getting around it takes more effort than it is worth.
 *
 * @param {string} deviceId
 * @param {string} ip
 * @param {boolean} [commit=true] false only counts, for a dry-run check
 * @returns {Promise<{ok:boolean, remaining:number, reason?:string}>}
 */
export async function checkRate(deviceId, ip, commit = true) {
  const store = getStore(LIMIT_STORE);
  const day = today();
  const keys = [
    `d:${(deviceId || 'none').slice(0, 64)}:${day}`,
    `i:${ip}:${day}`,
  ];

  const counts = await Promise.all(keys.map(async (k) => {
    const v = await store.get(k, { type: 'json' }).catch(() => null);
    return (v && typeof v.n === 'number') ? v.n : 0;
  }));

  const used = Math.max(counts[0], counts[1]);
  if (used >= DAILY_LIMIT) {
    return {
      ok: false,
      remaining: 0,
      reason: `That is ${DAILY_LIMIT} episodes today. The limit resets at midnight UTC.`,
    };
  }

  if (commit) {
    await Promise.all(keys.map((k, i) => store.setJSON(k, { n: counts[i] + 1, day })
      .catch(() => {})));
  }
  return { ok: true, remaining: DAILY_LIMIT - used - 1 };
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
  const store = getStore(JOB_STORE);
  const prev = await store.get(id, { type: 'json' }).catch(() => null);
  await store.setJSON(id, {
    id,
    updatedAt: new Date().toISOString(),
    ...(prev || {}),
    ...patch,
  });
}
