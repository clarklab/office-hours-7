/**
 * OFFICE HOURS VII — job status for a viewer episode being generated.
 *
 * The client polls this while the loader is up, so it is the only thing
 * standing between a viewer and a spinner that never explains itself.
 *
 * @module netlify/functions/job
 */

import { getStore } from '@netlify/blobs';
import { JOB_STORE, json } from './_shared.mjs';

export const config = { path: '/api/job' };

export default async (req) => {
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!/^u_[a-z0-9]{6,12}$/.test(id)) return json(400, { error: 'bad id' });

  // Strong read: an eventually consistent one can lag the writer by up to a
  // minute at the edge, which is a minute of spinner after the job has ended.
  const rec = await getStore(JOB_STORE, { consistency: 'strong' })
    .get(id, { type: 'json' }).catch(() => null);
  // An unknown id is 'queued', not 404: the client polls the moment it fires
  // the request, and the background function may not have written its first
  // status yet. A 404 there would look like failure at the worst moment.
  if (!rec) return json(200, { id, status: 'queued', stage: 'Starting up' });
  // Only the fields the loader uses. A job record is readable by anyone with
  // the id, so nothing private is ever added to it — but a whitelist keeps it
  // that way if someone does.
  const out = { id };
  for (const k of ['status', 'stage', 'error', 'title', 'seconds', 'refunded', 'updatedAt', 'detail']) {
    if (rec[k] !== undefined) out[k] = rec[k];
  }
  return json(200, out);
};
