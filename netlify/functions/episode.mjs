/**
 * OFFICE HOURS VII — serves one stored viewer-episode spec.
 *
 * Blobs are not reachable from a browser, so the player comes through here.
 *
 * @module netlify/functions/episode
 */

import { getStore } from '@netlify/blobs';
import { EPISODE_STORE, json } from './_shared.mjs';

export const config = { path: '/api/episode' };

export default async (req) => {
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!/^u_[a-z0-9]{6,12}$/.test(id)) return json(400, { error: 'bad id' });

  const rec = await getStore(EPISODE_STORE).get(id, { type: 'json' }).catch(() => null);
  if (!rec) return json(404, { error: 'No such episode.' });

  return new Response(JSON.stringify(rec), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // A finished episode never changes, but it can be deleted, so this is a
      // short cache rather than an immutable one.
      'cache-control': 'public, max-age=300',
    },
  });
};
