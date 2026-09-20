/**
 * Verifies (or rewrites) the CSP hash that pins the inline import map.
 *
 * netlify.toml ships a strict Content-Security-Policy whose script-src pins the
 * sha256 of the inline <script type="importmap"> block. If that block's text ever
 * changes and the hash is not updated, the deployed site silently refuses to load
 * three.js and every page dies — but it still works perfectly in local dev, where
 * no CSP header is served. That failure mode is invisible until production, so it
 * is checked here instead of trusted to a comment.
 *
 *   node tools/csp-hash.mjs          verify; exit 1 on mismatch
 *   node tools/csp-hash.mjs --write  rewrite netlify.toml with the current hash
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = ['index.html', 'watch.html'];
const CONFIG = 'netlify.toml';

/**
 * @param {string} file
 * @returns {string|null} the base64 sha256 of the file's import map block
 */
export function importMapHash(file) {
  const html = readFileSync(join(ROOT, file), 'utf8');
  const m = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  if (!m) return null;
  return createHash('sha256').update(m[1]).digest('base64');
}

/** @returns {number} process exit code */
export function main(argv = process.argv.slice(2)) {
  const write = argv.includes('--write');
  const hashes = new Map();

  for (const page of PAGES) {
    const h = importMapHash(page);
    if (!h) {
      console.error(`FAIL ${page} has no <script type="importmap"> block`);
      return 1;
    }
    hashes.set(page, h);
  }

  const distinct = new Set(hashes.values());
  if (distinct.size > 1) {
    console.error('FAIL the pages disagree on their import map, so one hash cannot cover both:');
    for (const [page, h] of hashes) console.error(`  ${page}  sha256-${h}`);
    console.error('Make the import map byte-identical in every page, then re-run.');
    return 1;
  }

  const want = `sha256-${[...distinct][0]}`;
  const config = readFileSync(join(ROOT, CONFIG), 'utf8');
  const found = [...config.matchAll(/sha256-[A-Za-z0-9+/=]+/g)].map((x) => x[0]);

  if (write) {
    if (found.length === 0) {
      console.error(`FAIL ${CONFIG} has no sha256- literal to rewrite`);
      return 1;
    }
    let next = config;
    for (const f of new Set(found)) next = next.split(f).join(want);
    writeFileSync(join(ROOT, CONFIG), next);
    console.log(`WROTE ${CONFIG} -> ${want}`);
    return 0;
  }

  if (!found.includes(want)) {
    console.error(`FAIL the CSP hash in ${CONFIG} does not match the inline import map.`);
    console.error(`  import map is  ${want}`);
    console.error(`  ${CONFIG} pins ${found.length ? found.join(', ') : '(nothing)'}`);
    console.error('  The site would load locally and break on Netlify.');
    console.error('  Fix: node tools/csp-hash.mjs --write');
    return 1;
  }

  console.log(`CSP OK  ${want} matches ${PAGES.join(' and ')}`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main());
