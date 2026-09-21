/**
 * OFFICE HOURS VII — how many episodes this viewer has left today.
 *
 * Read-only: it never spends a slot. The identity is the same one the limit
 * uses (device id + IP, see rateKeys in _shared.mjs); the name only picks the
 * allowance. POST rather than GET so the name stays out of URLs and logs.
 *
 * @module netlify/functions/quota
 */

import { cleanName, clientIp, json, quota } from './_shared.mjs';

export const config = { path: '/api/quota' };

export default async (req, context) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });

  let body = {};
  try {
    body = (await req.json()) || {};
  } catch {
    body = {};
  }

  try {
    const q = await quota(
      String(body.deviceId || '').slice(0, 64),
      clientIp(req, context),
      cleanName(body.name),
    );
    return json(200, q);
  } catch {
    return json(503, { error: 'unavailable' });
  }
};
