/**
 * OFFICE HOURS VII — takes a viewer's prompt and, if they have any left today,
 * starts generating it.
 *
 * This is the SYNCHRONOUS front door, and the reason it exists: a background
 * function always answers with an empty 202, whatever it returns, so a limit
 * enforced inside one cannot say no to the browser. The browser only found out
 * by polling /api/job, after a cold start and an eventually consistent read —
 * which looked like the generator running for most of a minute and then
 * refusing. Here the allowance is checked AND the slot taken before anything
 * else happens, and a refusal is an immediate 429.
 *
 * Only once a slot is held does this write a private ticket (the prompt, the
 * name, the counters charged) and poke the background function with the id.
 * The background function will only run an id that has an unclaimed ticket, so
 * calling it directly buys nothing.
 *
 * @module netlify/functions/submit
 */

import { getStore } from '@netlify/blobs';
import {
  TICKET_STORE, MAX_PROMPT, cleanName, clientIp, json, newId, refund, reserve, setJob,
} from './_shared.mjs';

export const config = { path: '/api/submit' };

/** @type {import('@netlify/functions').Handler} */
export default async (req, context) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });

  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'bad JSON' });
  }

  const prompt = String((body && body.prompt) || '').trim().slice(0, MAX_PROMPT);
  const name = cleanName(body && body.name);
  const deviceId = String((body && body.deviceId) || '').slice(0, 64);

  if (!name) return json(400, { error: 'Tell us your name first.', field: 'name' });
  if (prompt.length < 4) return json(400, { error: 'Give us a little more than that.', field: 'prompt' });

  // 1. The allowance. Nothing below this line runs for a viewer who is out.
  let rate;
  try {
    rate = await reserve(deviceId, clientIp(req, context), name);
  } catch {
    // Failing closed: if the counters cannot be read, nobody gets a free run.
    return json(503, { error: 'The office cannot check your allowance right now. Try again in a minute.' });
  }
  const allowance = { limit: rate.limit, remaining: rate.remaining, resetsAt: rate.resetsAt };
  if (!rate.ok) {
    return json(rate.busy ? 503 : 429, { error: rate.reason, ...allowance });
  }

  // 2. The ticket and the public job status.
  const id = newId();
  try {
    const put = await getStore(TICKET_STORE, { consistency: 'strong' }).setJSON(id, {
      id,
      prompt,
      name,
      keys: rate.keys,
      createdAt: new Date().toISOString(),
      claimed: false,
    }, { onlyIfNew: true });
    if (put && put.modified === false) throw new Error('id collision');
    await setJob(id, { status: 'queued', stage: 'Starting up' });
  } catch {
    await refund(rate.keys);
    return json(503, { error: 'The office could not take that just now. Try again in a minute.' });
  }

  // 3. Start the background run. It answers 202 as soon as it is queued.
  let started = false;
  try {
    const res = await fetch(new URL('/api/generate', req.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    await res.text().catch(() => '');
    started = res.status === 202 || res.ok;
  } catch {
    started = false;
  }
  if (!started) {
    await refund(rate.keys);
    await setJob(id, { status: 'failed', error: 'The generator did not pick up. Try again in a minute.' })
      .catch(() => {});
    return json(502, { error: 'The generator did not pick up. Try again in a minute.', id });
  }

  return json(202, { id, ...allowance });
};
