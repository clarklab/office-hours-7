/**
 * OFFICE HOURS VII — the most recent viewer episodes, for the gallery.
 *
 * @module netlify/functions/recent
 */

import { getStore } from '@netlify/blobs';
import { EPISODE_STORE, json } from './_shared.mjs';

/** How many to show. */
const MAX = 24;
/**
 * How many keys to look at before giving up on being exhaustive. Each one costs
 * a metadata round trip, so this is the ceiling on the work one request can do.
 */
const SCAN = 200;

const ID_RE = /^u_[a-z0-9]{6,12}$/;

export const config = { path: '/api/recent' };

export default async () => {
  try {
    const store = getStore(EPISODE_STORE);
    const { blobs } = await store.list();

    const keys = (blobs || [])
      .map((b) => b.key)
      .filter((k) => ID_RE.test(k))
      .slice(0, SCAN);

    // list() returns only { etag, key } — no metadata, whatever the shape of
    // the write. So the title and date come from a getMetadata() per key,
    // fetched in parallel. That is a round trip each, which is why SCAN caps
    // it; the alternative, an index blob, would need every generation to
    // read-modify-write one shared key and would lose entries whenever two
    // finished at once.
    const rows = await Promise.all(keys.map(async (id) => {
      try {
        const { metadata } = await store.getMetadata(id);
        const m = metadata || {};
        return {
          id,
          title: m.title || 'UNTITLED',
          logline: m.logline || '',
          seconds: Number(m.seconds) || 0,
          createdAt: m.createdAt || '',
        };
      } catch {
        return null;
      }
    }));

    const episodes = rows
      .filter(Boolean)
      // Newest first. A missing date sorts last rather than jumping the queue.
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, MAX);

    return json(200, { episodes });
  } catch (err) {
    // An empty gallery is a better failure than a broken page.
    return json(200, { episodes: [], error: String((err && err.message) || err).slice(0, 200) });
  }
};
