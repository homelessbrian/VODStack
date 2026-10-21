// VODStack relay: downloads provider playlists/API responses for the VODStack Worker.
//
// Why it exists: some IPTV providers sit behind Cloudflare and block requests that come
// from Cloudflare Workers ("error code: 1106"). This relay runs on Render instead, so the
// provider sees an ordinary server. It only streams bytes through; it stores nothing.
//
// Endpoints:
//   GET  /health -> {"ok":true}   (also used to wake the service after it sleeps)
//   POST /fetch  -> streams the target URL's response back
//        headers: x-relay-key: <RELAY_KEY>
//        body:    {"url": "http(s)://…", "userAgent": "…"}
// The target URL goes in the POST body, not the address, so provider passwords never
// appear in request logs.
//
// No dependencies: Node 20+ only.
import http from 'node:http';
import { Readable } from 'node:stream';
import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

const KEY = process.env.RELAY_KEY || '';
const PORT = Number(process.env.PORT) || 10000;
const DEFAULT_UA = 'VLC/3.0.21 LibVLC/3.0.21';

if (KEY.length < 16) {
  console.error('RELAY_KEY must be set to a random value of at least 16 characters.');
  process.exit(1);
}

function keyMatches(given) {
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(KEY);
  return a.length === b.length && timingSafeEqual(a, b);
}

function isPrivateHost(host) {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  const v = isIP(h);
  if (v === 4) {
    const [a, b] = h.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  if (v === 6) return h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80') || h.startsWith('::ffff:');
  return false;
}

function send(res, status, obj) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(obj));
}

async function readBody(req, limit = 16384) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new Error('Request body too large.');
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

const server = http.createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://relay').pathname;
    if (req.method === 'GET' && (path === '/health' || path === '/')) return send(res, 200, { ok: true, service: 'vodstack-relay' });
    if (req.method !== 'POST' || path !== '/fetch') return send(res, 404, { error: 'Not found.' });
    if (!keyMatches(req.headers['x-relay-key'])) return send(res, 401, { error: 'Bad relay key.' });

    const body = await readBody(req);
    let target;
    try {
      target = new URL(String(body.url || ''));
    } catch {
      return send(res, 400, { error: 'Invalid URL.' });
    }
    if (!['http:', 'https:'].includes(target.protocol) || isPrivateHost(target.hostname))
      return send(res, 400, { error: 'URL not allowed.' });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000); // time limit to start responding
    let upstream;
    try {
      upstream = await fetch(target, {
        headers: { 'user-agent': String(body.userAgent || DEFAULT_UA).slice(0, 300), accept: '*/*' },
        redirect: 'follow',
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      return send(res, 502, { error: controller.signal.aborted ? 'Provider did not respond within 60 seconds.' : `Could not reach provider: ${e.cause?.code || e.message}` });
    }
    clearTimeout(timer);
    res.writeHead(upstream.status, {
      'content-type': upstream.headers.get('content-type') || 'application/octet-stream',
      'cache-control': 'no-store',
      'x-upstream-status': String(upstream.status),
    });
    if (!upstream.body) return res.end();
    Readable.fromWeb(upstream.body).on('error', () => res.destroy()).pipe(res);
  } catch (e) {
    if (!res.headersSent) send(res, 500, { error: e.message || 'Relay error.' });
    else res.destroy();
  }
});

server.requestTimeout = 0; // big playlists can take a while to stream
server.listen(PORT, () => console.log(`vodstack-relay listening on ${PORT}`));
