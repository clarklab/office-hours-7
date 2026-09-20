/**
 * OFFICE HOURS VII — dev static server.
 *
 * Dependency-free. Serves the repo root over HTTP because ES modules are
 * CORS-blocked over `file://`, which is the only reason this file exists — the
 * shipped site is plain static hosting with no server of its own.
 *
 * ```
 * node tools/serve.mjs          # auto-picks a free port
 * node tools/serve.mjs 8080     # or takes one, falling back if it is busy
 * ```
 *
 * ```js
 * import { start } from './tools/serve.mjs';
 * const srv = await start();
 * console.log(srv.url);         // http://127.0.0.1:41235
 * await srv.close();
 * ```
 *
 * @module tools/serve
 */

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repo root: this file lives in `<root>/tools`. */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Extension -> Content-Type. `.js`/`.mjs` MUST be `text/javascript` or the
 * browser refuses the module with a strict-MIME error.
 * @type {Object<string, string>}
 */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.toml': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
};

/**
 * Content-Type for a path.
 * @param {string} file
 * @returns {string}
 */
export function mimeFor(file) {
  return MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

/**
 * Maps a request URL onto a file inside the served root, refusing anything
 * that escapes it.
 * @param {string} root absolute directory being served
 * @param {string} urlPath the pathname of the request
 * @returns {string|null} absolute file path, or null if it escapes the root
 */
function resolvePath(root, urlPath) {
  let rel;
  try {
    rel = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  } catch {
    return null;
  }
  if (rel.includes('\0')) return null;
  const abs = path.resolve(root, `.${path.posix.normalize(rel)}`);
  const withSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (abs !== root && !abs.startsWith(withSep)) return null;
  return abs;
}

/**
 * @param {string} p
 * @returns {Promise<import('node:fs').Stats|null>}
 */
async function statOrNull(p) {
  try {
    return await fsp.stat(p);
  } catch {
    return null;
  }
}

/**
 * Starts the server.
 *
 * @param {Object} [o]
 * @param {number} [o.port=0] 0 auto-picks a free port; a busy explicit port
 *   falls back to auto rather than throwing (other agents run servers too)
 * @param {string} [o.root] directory to serve; defaults to the repo root
 * @param {string} [o.host='127.0.0.1']
 * @param {boolean} [o.quiet=true] false logs every request
 * @returns {Promise<{url:string, port:number, root:string, server:http.Server, close:()=>Promise<void>}>}
 */
export async function start(o = {}) {
  const root = path.resolve(o.root || ROOT);
  const host = o.host || '127.0.0.1';
  const quiet = o.quiet !== false;
  const wanted = Number.isFinite(o.port) ? Number(o.port) : 0;

  const server = http.createServer((req, res) => {
    handle(req, res, root, quiet).catch((err) => {
      try {
        res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
        res.end(`500 ${err && err.message ? err.message : err}\n`);
      } catch {
        /* the socket is already gone; nothing to do */
      }
    });
  });

  // Keep-alive sockets stop close() from ever completing. Track and destroy.
  /** @type {Set<import('node:net').Socket>} */
  const sockets = new Set();
  server.on('connection', (s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });

  const port = await listen(server, wanted, host);

  return {
    url: `http://${host}:${port}`,
    port,
    root,
    server,
    /** Stops accepting connections and drops any that are still open. */
    close() {
      return new Promise((resolve) => {
        for (const s of sockets) s.destroy();
        sockets.clear();
        server.close(() => resolve());
      });
    },
  };
}

/**
 * @param {http.Server} server
 * @param {number} wanted
 * @param {string} host
 * @returns {Promise<number>}
 */
function listen(server, wanted, host) {
  return new Promise((resolve, reject) => {
    let triedFallback = false;
    const onError = (err) => {
      if (!triedFallback && (err.code === 'EADDRINUSE' || err.code === 'EACCES') && wanted !== 0) {
        triedFallback = true;
        server.listen(0, host);
        return;
      }
      server.removeListener('error', onError);
      reject(err);
    };
    server.on('error', onError);
    server.listen(wanted, host, () => {
      server.removeListener('error', onError);
      const addr = server.address();
      resolve(typeof addr === 'object' && addr ? addr.port : wanted);
    });
  });
}

/**
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {string} root
 * @param {boolean} quiet
 * @returns {Promise<void>}
 */
async function handle(req, res, root, quiet) {
  const started = Date.now();
  const url = req.url || '/';

  /**
   * @param {number} code
   * @param {string} body
   * @param {string} [type]
   */
  const fail = (code, body, type = 'text/plain; charset=utf-8') => {
    res.writeHead(code, {
      'content-type': type,
      'cache-control': 'no-store, no-cache, must-revalidate',
      'content-length': Buffer.byteLength(body),
    });
    res.end(req.method === 'HEAD' ? undefined : body);
    if (!quiet) console.log(`${code} ${req.method} ${url} ${Date.now() - started}ms`);
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    fail(405, '405 method not allowed\n');
    return;
  }

  let file = resolvePath(root, url);
  if (!file) {
    fail(403, '403 forbidden\n');
    return;
  }

  let st = await statOrNull(file);
  if (st && st.isDirectory()) {
    const index = path.join(file, 'index.html');
    const indexStat = await statOrNull(index);
    if (indexStat) {
      file = index;
      st = indexStat;
    } else {
      fail(404, `404 no index.html in ${path.relative(root, file) || '/'}\n`);
      return;
    }
  }

  if (!st || !st.isFile()) {
    // A clear, greppable 404 body: the smoke test prints these back and the
    // whole point is telling an agent exactly which file is not there yet.
    fail(404, `404 not found: ${url}\n`);
    return;
  }

  res.writeHead(200, {
    'content-type': mimeFor(file),
    'content-length': st.size,
    'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
    pragma: 'no-cache',
    expires: '0',
    // Lets the harness read canvas pixels and time things precisely.
    'access-control-allow-origin': '*',
  });

  if (req.method === 'HEAD') {
    res.end();
    if (!quiet) console.log(`200 HEAD ${url} ${Date.now() - started}ms`);
    return;
  }

  await new Promise((resolve) => {
    const stream = fs.createReadStream(file);
    stream.on('error', () => {
      res.destroy();
      resolve();
    });
    stream.on('end', resolve);
    res.on('close', resolve);
    stream.pipe(res);
  });
  if (!quiet) console.log(`200 GET ${url} ${Date.now() - started}ms`);
}

/* Run directly: node tools/serve.mjs [port] */
if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = Number(process.argv[2]);
  const srv = await start({ port: Number.isFinite(arg) ? arg : 0, quiet: false });
  console.log(`OFFICE HOURS VII — serving ${srv.root}`);
  console.log(`  ${srv.url}/`);
  console.log(`  ${srv.url}/watch.html?ep=ep1`);
  const bye = () => {
    srv.close().then(() => process.exit(0));
  };
  process.on('SIGINT', bye);
  process.on('SIGTERM', bye);
}
