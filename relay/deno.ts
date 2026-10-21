// VODStack relay for Deno Deploy (same job and API as relay/server.mjs, which runs on Render).
//
// Downloads provider playlists/API responses for the VODStack Worker, because some IPTV providers
// block requests coming from Cloudflare Workers. It only streams bytes through and stores nothing.
//
//   GET  /health -> {"ok":true}
//   POST /fetch  -> streams the target URL's response back (gzip-compressed when accepted)
//        headers: x-relay-key: <RELAY_KEY>
//        body:    {"url": "http(s)://…", "userAgent": "…"}
// The target URL goes in the POST body, not the address, so provider passwords never appear
// in request logs.
//
// Deno Deploy settings: no preset, Dynamic, entrypoint `relay/deno.ts`, no install/build command,
// environment variable RELAY_KEY (secret) = the same key VODStack has in Cloudflare.

const KEY = Deno.env.get('RELAY_KEY') || '';
const DEFAULT_UA = 'VLC/3.0.21 LibVLC/3.0.21';

function json(status: number, obj: unknown) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
function keyMatches(given: string | null) {
  if (KEY.length < 16 || !given) return false;
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(KEY);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]; // constant-time compare
  return diff === 0;
}
function isPrivateHost(host: string) {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  const v4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  if (h.includes(':')) return h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80') || h.startsWith('::ffff:');
  return false;
}

Deno.serve(async (req) => {
  const path = new URL(req.url).pathname;
  if (req.method === 'GET' && (path === '/health' || path === '/')) return json(200, { ok: true, service: 'vodstack-relay', host: 'deno' });
  if (req.method !== 'POST' || path !== '/fetch') return json(404, { error: 'Not found.' });
  if (KEY.length < 16) return json(500, { error: 'RELAY_KEY is not set on the relay (Deno Deploy → Settings → Environment variables).' });
  if (!keyMatches(req.headers.get('x-relay-key'))) return json(401, { error: 'Bad relay key.' });

  let body: { url?: string; userAgent?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Invalid request.' });
  }
  let target: URL;
  try {
    target = new URL(String(body.url || ''));
  } catch {
    return json(400, { error: 'Invalid URL.' });
  }
  if (!['http:', 'https:'].includes(target.protocol) || isPrivateHost(target.hostname)) return json(400, { error: 'URL not allowed.' });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000); // time limit to start responding
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      headers: { 'user-agent': String(body.userAgent || DEFAULT_UA).slice(0, 300), accept: '*/*' },
      redirect: 'follow',
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    return json(502, { error: controller.signal.aborted ? 'Provider did not respond within 60 seconds.' : `Could not reach provider: ${(e as Error).message}` });
  }
  clearTimeout(timer);
  const headers = new Headers({
    'content-type': upstream.headers.get('content-type') || 'application/octet-stream',
    'cache-control': 'no-store',
    'x-upstream-status': String(upstream.status),
  });
  let out = upstream.body;
  // Provider lists are large JSON/text; gzip makes them roughly 10x smaller on the way to VODStack.
  if (out && /\bgzip\b/.test(req.headers.get('accept-encoding') || '')) {
    out = out.pipeThrough(new CompressionStream('gzip'));
    headers.set('content-encoding', 'gzip');
  }
  return new Response(out, { status: upstream.status, headers });
});
