#!/usr/bin/env node
/**
 * OFFICE HOURS VII — cast review server.
 *
 * Serves the working tree exactly like `serve.mjs`, plus one extra route:
 * `/__ref/<path>` answers with `git show <ref>:<path>`, so the review page can
 * load the cast as it exists on another branch (default `main`) next to the
 * cast in this tree — no second checkout, nothing copied into the repo.
 *
 * ```
 * node tools/cast-review.mjs            # compare this tree against main
 * node tools/cast-review.mjs --ref=HEAD~3 --port=8090
 * ```
 * then open the printed `/tools/cast-review.html` URL.
 *
 * @module tools/cast-review
 */

import http from 'node:http';
import { execFile } from 'node:child_process';
import { start, ROOT, mimeFor } from './serve.mjs';

const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v === undefined ? true : v];
}));
const REF = String(argv.ref || 'main');
const PORT = Number(argv.port) || 8090;

/**
 * @param {string} rel repo-relative path
 * @returns {Promise<Buffer|null>}
 */
function gitShow(rel) {
  return new Promise((resolve) => {
    execFile('git', ['show', `${REF}:${rel}`], { cwd: ROOT, encoding: 'buffer', maxBuffer: 64 << 20 },
      (err, out) => resolve(err ? null : out));
  });
}

const inner = await start({ port: 0 });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://x');
  if (url.pathname.startsWith('/__ref/')) {
    const rel = decodeURIComponent(url.pathname.slice('/__ref/'.length));
    const body = rel.includes('..') ? null : await gitShow(rel);
    if (!body) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end(`404 ${REF}:${rel}\n`);
      return;
    }
    res.writeHead(200, { 'content-type': mimeFor(rel), 'cache-control': 'no-store' });
    res.end(body);
    return;
  }
  if (url.pathname === '/__ref') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ref: REF }));
    return;
  }
  // everything else: the ordinary static server
  const up = http.request(`${inner.url}${req.url}`, { method: req.method, headers: req.headers }, (r) => {
    res.writeHead(r.statusCode || 500, r.headers);
    r.pipe(res);
  });
  up.on('error', () => { res.writeHead(502); res.end(); });
  req.pipe(up);
});

server.listen(PORT, '127.0.0.1', () => {
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
  console.log(`cast review — this tree vs ${REF}`);
  console.log(`  http://127.0.0.1:${port}/tools/cast-review.html`);
});
