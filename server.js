import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, isDemo } from './lib/config.js';
import * as store from './lib/store.js';
import { parseQuery, search, details, waitFor } from './lib/restaurants.js';
import { googlePhotoUrl } from './lib/google.js';

const PUBLIC = fileURLToPath(new URL('./public/', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

function send(res, status, body, headers = {}) {
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
  res.writeHead(status, { 'Content-Type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', ...headers });
  res.end(isJson ? JSON.stringify(body) : body);
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 256 * 1024) throw Object.assign(new Error('Body too large'), { status: 413 });
    chunks.push(chunk);
  }
  try { return chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}; } catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
}

async function serveStatic(res, pathname) {
  const file = normalize(join(PUBLIC, pathname === '/' ? 'index.html' : decodeURIComponent(pathname)));
  if (!file.startsWith(PUBLIC.endsWith(sep) ? PUBLIC : PUBLIC + sep)) return send(res, 403, 'Forbidden');
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch {
    send(res, 404, 'Not found');
  }
}

async function route(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const { pathname } = url;
  const q = Object.fromEntries(url.searchParams);
  const m = req.method;

  if (!pathname.startsWith('/api/')) return m === 'GET' ? serveStatic(res, pathname) : send(res, 405, 'Method not allowed');

  if (m === 'GET' && pathname === '/api/config') {
    return send(res, 200, { demo: isDemo(), yelp: !!config.yelpKey, google: !!config.googleKey, liveWait: !!config.bestTimeKey });
  }
  if (m === 'GET' && pathname === '/api/family') return send(res, 200, store.view(await store.load()));
  if (m === 'PUT' && pathname === '/api/family/members') return send(res, 200, await store.setMembers((await readBody(req)).members));
  if (m === 'POST' && pathname === '/api/family/chooser') return send(res, 200, await store.setChooser(String((await readBody(req)).memberId)));
  if (m === 'POST' && pathname === '/api/family/advance') return send(res, 200, await store.advance((await readBody(req)).by ?? 1));
  if (m === 'POST' && pathname === '/api/history') return send(res, 200, await store.addHistory(await readBody(req)));
  let hm = pathname.match(/^\/api\/history\/(\d+)$/);
  if (m === 'DELETE' && hm) return send(res, 200, await store.removeHistory(hm[1]));

  if (m === 'GET' && pathname === '/api/search') {
    return send(res, 200, await search(parseQuery(q), store.view(await store.load())));
  }
  hm = pathname.match(/^\/api\/restaurant\/([\w-]+)$/);
  if (m === 'GET' && hm) return send(res, 200, await details(hm[1], parseQuery(q), store.view(await store.load())));
  hm = pathname.match(/^\/api\/wait\/([\w-]+)$/);
  if (m === 'GET' && hm) return send(res, 200, await waitFor(hm[1], parseQuery(q)));

  if (m === 'GET' && pathname === '/api/photo') {
    if (!config.googleKey) return send(res, 404, 'No photos');
    const target = await googlePhotoUrl(String(q.name || ''));
    res.writeHead(302, { Location: target, 'Cache-Control': 'private, max-age=1800' });
    return res.end();
  }
  send(res, 404, { error: 'Not found' });
}

const server = http.createServer((req, res) => {
  route(req, res).catch((err) => {
    const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
    if (status >= 500) console.error(err);
    if (!res.headersSent) send(res, status, { error: err.message || 'Server error' });
    else res.end();
  });
});

server.listen(config.port, () => {
  const sources = [config.yelpKey && 'Yelp', config.googleKey && 'Google Places', config.bestTimeKey && 'BestTime (live waits)'].filter(Boolean);
  console.log(`Restaurant Chooser running at http://localhost:${config.port}`);
  console.log(isDemo() ? 'DEMO MODE: add API keys to .env for real restaurants (see README).' : `Data sources: ${sources.join(', ')}`);
});
