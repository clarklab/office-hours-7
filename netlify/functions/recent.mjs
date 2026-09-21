/**
 * OFFICE HOURS VII — the most recent viewer episodes, for the gallery.
 *
 * Built from blob metadata in one list() call rather than by fetching every
 * spec to read its title.
 *
 * @module netlify/functions/recent
 */

import { getStore } from '@netlify/blobs';
import { EPISODE_STORE, json } from './_shared.mjs';

export const config = { path: '/api/recent' };

const MAX = 24;

export default async () => {
  try {
    const { blobs } = await getStore(EPISODE_STORE).list();
    const rows = (blobs || [])
      .map((b) => ({
        id: b.key,
        title: (b.metadata && b.metadata.title) || 'UNTITLED',
        logline: (b.metadata && b.metadata.logline) || '',
        seconds: (b.metadata && b.metadata.seconds) || 0,
        createdAt: (b.metadata && b.metadata.createdAt) || '',
      }))
      .filter((r) => /^u_[a-z0-9]{6,12}$/.test(r.id))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, MAX);
    return json(200, { episodes: rows });
  } catch (err) {
    // An empty gallery is a better failure than a broken page.
    return json(200, { episodes: [], error: String((err && err.message) || err).slice(0, 200) });
  }
};
