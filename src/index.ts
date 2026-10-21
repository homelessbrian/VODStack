import { dashboard } from './dashboard';
interface D1Result<T = unknown> {
  results: T[];
  success: boolean;
  meta: { changes: number; [key: string]: unknown };
}
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
  raw<T = unknown[]>(): Promise<T[]>;
}
interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
}
interface Env {
  DB: D1Database;
  ENCRYPTION_KEY: string;
  APP_NAME?: string;
  /** Optional relay (relay/server.mjs on Render) for providers that block Cloudflare. Set both as Worker secrets. */
  RELAY_URL?: string;
  RELAY_KEY?: string;
}
type MediaType = 'movie' | 'series';
type SourceKind = 'xtream' | 'm3u';
interface CatalogRow {
  id: string;
  source_id: string;
  source_category_id: string;
  source_category_name: string;
  media_type: MediaType;
  display_name: string;
  is_hidden: number;
  sort_order: number;
  item_count?: number;
}
interface SourceConfig {
  baseUrl?: string;
  username?: string;
  password?: string;
  playlistUrl?: string;
  userAgent?: string;
}
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
const html = (body: string, status = 200) =>
  new Response(body, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'content-security-policy':
        "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' https: data:; base-uri 'none'; frame-ancestors 'none'",
    },
  });
const uuid = () => crypto.randomUUID();
const b64 = (b: ArrayBuffer | Uint8Array) =>
  btoa(
    String.fromCharCode(
      ...new Uint8Array(
        b instanceof ArrayBuffer ? b : b.buffer,
        b instanceof ArrayBuffer ? 0 : b.byteOffset,
        b instanceof ArrayBuffer ? b.byteLength : b.byteLength,
      ),
    ),
  )
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const unb64 = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) =>
    c.charCodeAt(0),
  );
async function sha(s: string) {
  return b64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
}
function randomCode() {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  const s = b64(a)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return `VOD-${s.slice(0, 6)}-${s.slice(6, 12)}-${s.slice(12, 18)}-${s.slice(18, 24)}`;
}
async function key(env: Env) {
  if (!env.ENCRYPTION_KEY)
    throw new Error('Server encryption key is not configured. Set ENCRYPTION_KEY before creating sources.');
  const raw = unb64(env.ENCRYPTION_KEY);
  if (raw.length !== 32) throw new Error('ENCRYPTION_KEY must be base64-encoded 32-byte key.');
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}
async function encrypt(env: Env, value: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await key(env),
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return `${b64(iv)}.${b64(ciphertext)}`;
}
async function decrypt<T>(env: Env, value: string): Promise<T> {
  const [iv, cipher] = value.split('.');
  const clear = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: unb64(iv) },
    await key(env),
    unb64(cipher),
  );
  return JSON.parse(new TextDecoder().decode(clear)) as T;
}
function cookie(request: Request, name: string) {
  return (request.headers.get('cookie') || '')
    .split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith(name + '='))
    ?.slice(name.length + 1);
}
async function auth(request: Request, env: Env) {
  const token = cookie(request, 'vod_session');
  if (!token) return null;
  const hash = await sha(token);
  const row = await env.DB.prepare('SELECT setup_id, expires_at FROM sessions WHERE token_hash=?')
    .bind(hash)
    .first<{ setup_id: string; expires_at: number }>();
  if (!row || row.expires_at < Date.now() / 1000) {
    if (row) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(hash).run();
    return null;
  }
  return row.setup_id;
}
function setSession(token: string) {
  return `vod_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000`;
}
function clearSession() {
  return 'vod_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0';
}
function safeUrl(s: string) {
  const u = new URL(s);
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password)
    throw new Error('Use a valid HTTP(S) URL without embedded credentials.');
  const host = u.hostname.toLowerCase();
  if (
    ['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(host) ||
    host.endsWith('.local') ||
    host === 'metadata.google.internal'
  )
    throw new Error('Local and internal addresses are not allowed.');
  return u;
}
function responseError(e: unknown) {
  const message = e instanceof Error ? e.message : 'Unexpected server error';
  return json({ error: message }, e instanceof HttpError ? e.status : 400);
}
const DEFAULT_USER_AGENT = 'VLC/3.0.21 LibVLC/3.0.21';
const XTREAM_PARTS: Record<string, string> = {
  account: '',
  vod_categories: 'get_vod_categories',
  series_categories: 'get_series_categories',
  vod_streams: 'get_vod_streams',
  series: 'get_series',
};
async function getSource(env: Env, setupId: string, sourceId: string) {
  const row = await env.DB.prepare('SELECT id,kind,encrypted_config FROM sources WHERE id=? AND setup_id=?')
    .bind(sourceId, setupId)
    .first<{ id: string; kind: SourceKind; encrypted_config: string }>();
  if (!row) throw new HttpError(404, 'Source not found.');
  return { ...row, cfg: await decrypt<SourceConfig>(env, row.encrypted_config) };
}
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
/** Credentials embedded in an M3U playlist URL (get.php?username=…&password=…). */
function m3uCredentials(cfg: SourceConfig) {
  try {
    const u = new URL(cfg.playlistUrl || '');
    const username = u.searchParams.get('username') || '';
    const password = u.searchParams.get('password') || '';
    return username.length >= 3 && password.length >= 3 ? { username, password } : null;
  } catch {
    return null;
  }
}
/** Replace the account's username/password inside a stream URL with placeholders, so stored URLs hold no secrets. */
function stripCredentials(url: string, creds: { username: string; password: string } | null) {
  if (!creds) return url;
  let out = url;
  for (const [value, mark] of [
    [creds.password, '{p}'],
    [creds.username, '{u}'],
  ] as const) {
    for (const form of new Set([value, encodeURIComponent(value)])) {
      out = out.split('/' + form + '/').join('/' + mark + '/').split('=' + form).join('=' + mark);
    }
  }
  return out;
}
function hideSecrets(text: string, cfg: SourceConfig) {
  let out = text;
  for (const v of [cfg.password, cfg.username, m3uCredentials(cfg)?.password, m3uCredentials(cfg)?.username])
    if (v && v.length >= 3) out = out.split(v).join('***');
  return out;
}
function providerUrl(kind: SourceKind, cfg: SourceConfig, part: string) {
  if (kind === 'm3u') {
    if (part !== 'playlist') throw new HttpError(400, 'Unknown playlist part.');
    return safeUrl(cfg.playlistUrl || '');
  }
  if (!(part in XTREAM_PARTS)) throw new HttpError(400, 'Unknown Xtream part.');
  const u = safeUrl(cfg.baseUrl || '');
  u.pathname = u.pathname.replace(/\/(player_api\.php)?$/, '') + '/player_api.php';
  u.searchParams.set('username', cfg.username || '');
  u.searchParams.set('password', cfg.password || '');
  if (XTREAM_PARTS[part]) u.searchParams.set('action', XTREAM_PARTS[part]);
  return u;
}
function explainProviderStatus(status: number) {
  if (status === 401 || status === 403)
    return `The provider refused the request (HTTP ${status}). Usually this means wrong login details, the account is already in use, or the provider blocks requests from Cloudflare's servers or from this User-Agent. Try setting a different User-Agent on the source.`;
  if (status === 404) return 'The provider says that address does not exist (HTTP 404). Check the server/playlist URL.';
  if (status === 429)
    return 'The provider is rate-limiting this account (HTTP 429). Wait 15–30 minutes before trying again.';
  if (status >= 520 && status <= 530)
    return `The provider's server could not be reached through Cloudflare (HTTP ${status}). It may be down or blocking Cloudflare.`;
  return `The provider returned HTTP ${status}.`;
}
const relayBase = (env: Env) =>
  env.RELAY_URL && env.RELAY_KEY ? env.RELAY_URL.trim().replace(/\/+$/, '') : null;
/** Ping the relay. Render's free tier sleeps after 15 idle minutes and takes about a minute to wake. */
async function wakeRelay(env: Env) {
  const base = relayBase(env);
  if (!base) return { configured: false, ready: false };
  try {
    const r = await fetch(base + '/health', { signal: AbortSignal.timeout(25000) });
    const d = (await r.json().catch(() => null)) as { ok?: boolean } | null;
    return { configured: true, ready: !!(r.ok && d?.ok) };
  } catch {
    return { configured: true, ready: false };
  }
}
/** Fetch one list from the provider and stream it straight back to the browser (no parsing here). */
async function proxyProvider(env: Env, setupId: string, sourceId: string, part: string) {
  const src = await getSource(env, setupId, sourceId);
  const target = providerUrl(src.kind, src.cfg, part);
  const userAgent = src.cfg.userAgent || DEFAULT_USER_AGENT;
  const relay = relayBase(env);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 75000); // time limit to *start* responding
  let r: Response;
  try {
    r = relay
      ? await fetch(relay + '/fetch', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-relay-key': env.RELAY_KEY! },
          body: JSON.stringify({ url: target.toString(), userAgent }),
          signal: controller.signal,
        })
      : await fetch(target.toString(), {
          headers: { 'user-agent': userAgent, accept: '*/*' },
          redirect: 'follow',
          signal: controller.signal,
        });
  } catch (e) {
    const why = controller.signal.aborted
      ? 'it did not respond within 75 seconds'
      : hideSecrets(e instanceof Error ? e.message : String(e), src.cfg);
    return json({ error: `Couldn't reach the ${relay ? 'relay' : 'provider'}: ${why}.` }, 502);
  } finally {
    clearTimeout(timer);
  }
  if (relay && !r.headers.get('x-upstream-status')) {
    // The relay itself answered (bad key, asleep, crashed) rather than passing on the provider's reply.
    const d = (await r.json().catch(() => null)) as { error?: string } | null;
    const why = d?.error
      ? hideSecrets(d.error, src.cfg)
      : `HTTP ${r.status} — it may still be waking up; try again in a minute`;
    return json(
      {
        error: `The relay couldn't download from the provider: ${why}${r.status === 401 ? ' Check that RELAY_KEY in Cloudflare matches the one in Render.' : ''}`,
      },
      502,
    );
  }
  if (!r.ok) {
    let snippet = '';
    try {
      snippet = hideSecrets((await r.text()).slice(0, 200).replace(/\s+/g, ' ').trim(), src.cfg);
    } catch {}
    const cloudflareBlock = /error code: 1\d{3}/i.test(snippet);
    const message = cloudflareBlock
      ? relay
        ? `The provider's Cloudflare protection blocked the relay too (${snippet}). Use "Refresh from file" for this provider.`
        : `The provider's server is behind Cloudflare, and Cloudflare blocked this request (${snippet}). Set up the relay (see RELAY-SETUP.md in the repo), or import the playlist file from your own device: open your playlist URL in a new browser tab to download it, then choose that file with "Use a playlist file" (or "Refresh from file").`
      : explainProviderStatus(r.status) + (snippet ? ` Provider said: "${snippet}"` : '');
    return json({ error: message }, 502);
  }
  return new Response(r.body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const optStr = (v: unknown, max: number) => str(v, max) || null;
const optHttp = (v: unknown) => {
  const s = str(v, 1000);
  return /^https?:\/\//i.test(s) ? s : null;
};
const mediaTypeOf = (v: unknown): MediaType | null => (v === 'movie' || v === 'series' ? v : null);
async function setupByAddonToken(env: Env, token: string) {
  const h = await sha(token);
  return env.DB.prepare('SELECT id FROM setups WHERE addon_token_hash=?').bind(h).first<{ id: string }>();
}
async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();
  if (method === 'GET' && path === '/') return html(dashboard());
  if (method === 'GET' && path === '/health') return json({ ok: true, app: env.APP_NAME || 'VODStack' });
  if (method === 'POST' && path === '/api/setup') {
    const id = uuid(),
      recoveryCode = randomCode(),
      addonToken = b64(crypto.getRandomValues(new Uint8Array(32)));
    const [recoveryHash, addonHash, addonEncrypted] = await Promise.all([
      sha(recoveryCode),
      sha(addonToken),
      encrypt(env, { token: addonToken }),
    ]);
    await env.DB.prepare(
      'INSERT INTO setups(id,recovery_hash,addon_token_hash,addon_token_encrypted) VALUES(?,?,?,?)',
    )
      .bind(id, recoveryHash, addonHash, addonEncrypted)
      .run();
    const token = b64(crypto.getRandomValues(new Uint8Array(32)));
    await env.DB.prepare('INSERT INTO sessions(token_hash,setup_id,expires_at) VALUES(?,?,?)')
      .bind(await sha(token), id, Math.floor(Date.now() / 1000) + 2592000)
      .run();
    return new Response(JSON.stringify({ ok: true, recoveryCode }), {
      headers: {
        'content-type': 'application/json',
        'set-cookie': setSession(token),
        'cache-control': 'no-store',
      },
    });
  }
  if (method === 'POST' && path === '/api/recover') {
    const body = (await request.json()) as { code?: string };
    const code = (body.code || '').trim().toUpperCase();
    if (!code) return json({ error: 'Recovery code required.' }, 400);
    const row = await env.DB.prepare('SELECT id FROM setups WHERE recovery_hash=?')
      .bind(await sha(code))
      .first<{ id: string }>();
    if (!row) return json({ error: 'Recovery code not recognized.' }, 401);
    const token = b64(crypto.getRandomValues(new Uint8Array(32)));
    await env.DB.prepare('INSERT INTO sessions(token_hash,setup_id,expires_at) VALUES(?,?,?)')
      .bind(await sha(token), row.id, Math.floor(Date.now() / 1000) + 2592000)
      .run();
    return new Response(JSON.stringify({ ok: true }), {
      headers: {
        'content-type': 'application/json',
        'set-cookie': setSession(token),
        'cache-control': 'no-store',
      },
    });
  }
  if (method === 'POST' && path === '/api/logout') {
    const token = cookie(request, 'vod_session');
    if (token)
      await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?')
        .bind(await sha(token))
        .run();
    return new Response(JSON.stringify({ ok: true }), {
      headers: {
        'content-type': 'application/json',
        'set-cookie': clearSession(),
        'cache-control': 'no-store',
      },
    });
  }
  const setupId = await auth(request, env);
  if (path.startsWith('/api/')) {
    if (!setupId) return json({ error: 'Setup session required. Recover your setup first.' }, 401);
    if (method === 'GET' && path === '/api/state') {
      const [catalogs, sources, setup] = await Promise.all([
        env.DB.prepare(
          'SELECT c.*,(SELECT COUNT(*) FROM vod_items v WHERE v.catalog_id=c.id AND v.is_available=1) AS item_count FROM catalogs c WHERE c.setup_id=? ORDER BY c.sort_order,c.display_name',
        )
          .bind(setupId)
          .all<CatalogRow>(),
        env.DB.prepare(
          'SELECT id,name,kind,last_refresh_at,last_refresh_status,created_at FROM sources WHERE setup_id=? ORDER BY created_at',
        )
          .bind(setupId)
          .all<any>(),
        env.DB.prepare('SELECT addon_token_encrypted FROM setups WHERE id=?').bind(setupId).first<any>(),
      ]);
      let addonToken = '';
      if (setup?.addon_token_encrypted) {
        try {
          addonToken = (await decrypt<{ token: string }>(env, setup.addon_token_encrypted)).token;
        } catch {}
      }
      return json({
        catalogs: catalogs.results,
        sources: sources.results,
        relayConfigured: !!relayBase(env),
        addonUrl: addonToken ? `${url.origin}/addon/${addonToken}/manifest.json` : null,
      });
    }
    if (method === 'POST' && path === '/api/sources') {
      // Saves the source only. The browser then runs the import (see client-import.ts).
      const body = (await request.json()) as any;
      const name = str(body.name, 100);
      const kind = body.kind as SourceKind;
      if (!name || !['xtream', 'm3u'].includes(kind))
        return json({ error: 'Source name and a supported connection type are required.' }, 400);
      const userAgent = str(body.userAgent, 300) || undefined;
      const cfg: SourceConfig =
        kind === 'xtream'
          ? {
              baseUrl: safeUrl(str(body.baseUrl, 500))
                .toString()
                .replace(/\/(player_api\.php)?$/, ''),
              username: str(body.username, 200),
              password: str(body.password, 200),
              userAgent,
            }
          : { playlistUrl: safeUrl(str(body.playlistUrl, 2000)).toString(), userAgent };
      if (kind === 'xtream' && (!cfg.username || !cfg.password))
        return json({ error: 'Username and password are required.' }, 400);
      // Re-submitting the form with the same name updates that source instead of piling up duplicates.
      const existing = await env.DB.prepare('SELECT id FROM sources WHERE setup_id=? AND name=? AND kind=?')
        .bind(setupId, name, kind)
        .first<{ id: string }>();
      const id = existing?.id || uuid();
      if (existing)
        await env.DB.prepare('UPDATE sources SET encrypted_config=? WHERE id=?')
          .bind(await encrypt(env, cfg), id)
          .run();
      else
        await env.DB.prepare('INSERT INTO sources(id,setup_id,name,kind,encrypted_config) VALUES(?,?,?,?,?)')
          .bind(id, setupId, name, kind, await encrypt(env, cfg))
          .run();
      return json({ ok: true, sourceId: id, kind });
    }
    if (method === 'GET' && path === '/api/relay/wake') return json(await wakeRelay(env));
    const srcMatch = path.match(/^\/api\/sources\/([^/]+)\/(provider|index|import\/catalogs|import\/items|import\/remove|import\/finish)$/);
    if (srcMatch) {
      const [, sourceId, action] = srcMatch;
      if (action === 'provider' && method === 'GET')
        return proxyProvider(env, setupId, sourceId, url.searchParams.get('part') || '');

      if (action === 'index' && method === 'GET') {
        // What is already stored for this source, so the browser only sends new/changed titles.
        const after = Math.max(0, Number(url.searchParams.get('after')) || 0);
        const pageSize = 5000;
        const rows = await env.DB.prepare(
          'SELECT v.id,v.media_type,c.source_category_id,v.provider_item_id,v.content_hash,v.is_available FROM vod_items v JOIN catalogs c ON c.id=v.catalog_id WHERE v.source_id=? AND v.setup_id=? AND v.id>? ORDER BY v.id LIMIT ?',
        )
          .bind(sourceId, setupId, after, pageSize)
          .raw<[number, string, string, string, string, number]>();
        return json({ rows, next: rows.length === pageSize ? rows[rows.length - 1][0] : null });
      }

      if (method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
      const src = await getSource(env, setupId, sourceId);
      const body = (await request.json()) as any;

      if (action === 'import/catalogs') {
        const list = Array.isArray(body.catalogs) ? body.catalogs : [];
        if (!list.length || list.length > 1000) return json({ error: 'Send between 1 and 1000 categories.' }, 400);
        const clean: { t: MediaType; c: string; n: string }[] = [];
        for (const x of list) {
          const t = mediaTypeOf(x?.t);
          const c = str(x?.c, 200);
          if (t && c) clean.push({ t, c, n: str(x?.n, 150) || c });
        }
        // One statement for the whole list. Renamed catalogs keep their custom name.
        const r = await env.DB.prepare(
          `INSERT INTO catalogs(id,setup_id,source_id,source_category_id,source_category_name,media_type,display_name,sort_order)
           SELECT lower(hex(randomblob(16))),?1,?2,json_extract(j.value,'$.c'),json_extract(j.value,'$.n'),json_extract(j.value,'$.t'),json_extract(j.value,'$.n'),?3+j.key
           FROM json_each(?4) j WHERE true
           ON CONFLICT(source_id,media_type,source_category_id) DO UPDATE SET
             display_name=CASE WHEN catalogs.display_name=catalogs.source_category_name THEN excluded.source_category_name ELSE catalogs.display_name END,
             source_category_name=excluded.source_category_name,updated_at=datetime('now')
           WHERE catalogs.source_category_name IS NOT excluded.source_category_name`,
        )
          .bind(setupId, sourceId, Date.now(), JSON.stringify(clean))
          .run();
        return json({ ok: true, written: r.meta.changes });
      }

      if (action === 'import/items') {
        const list = Array.isArray(body.items) ? body.items : [];
        if (!list.length || list.length > 500) return json({ error: 'Send between 1 and 500 titles.' }, 400);
        const creds = src.kind === 'm3u' ? m3uCredentials(src.cfg) : null;
        const clean = [];
        for (const x of list) {
          const t = mediaTypeOf(x?.t);
          const c = str(x?.c, 200);
          const p = str(x?.p, 200);
          const title = str(x?.title, 300);
          if (!t || !c || !p || !title) continue;
          let pb: string | null = null;
          const rawPb = str(x?.pb, 2000);
          if (src.kind === 'xtream' && /^xt:[a-z0-9]{1,8}$/i.test(rawPb)) pb = rawPb;
          if (src.kind === 'm3u' && /^https?:\/\//i.test(rawPb)) pb = 'url:' + stripCredentials(rawPb, creds);
          const y = Number(x?.y);
          clean.push({
            t,
            c,
            p,
            title,
            y: Number.isInteger(y) && y > 1880 && y < 2200 ? y : null,
            img: optHttp(x?.img),
            d: optStr(x?.d, 2000),
            pb,
            h: str(x?.h, 32),
          });
        }
        // One statement saves the whole chunk. Rows whose content hash is unchanged are not rewritten.
        const r = await env.DB.prepare(
          `INSERT INTO vod_items(setup_id,source_id,catalog_id,provider_item_id,media_type,title,year,poster_url,overview,playback_ref,content_hash,is_available)
           SELECT ?1,?2,c.id,json_extract(j.value,'$.p'),c.media_type,json_extract(j.value,'$.title'),json_extract(j.value,'$.y'),
                  json_extract(j.value,'$.img'),json_extract(j.value,'$.d'),json_extract(j.value,'$.pb'),json_extract(j.value,'$.h'),1
           FROM json_each(?3) j
           JOIN catalogs c ON c.setup_id=?1 AND c.source_id=?2 AND c.media_type=json_extract(j.value,'$.t') AND c.source_category_id=json_extract(j.value,'$.c')
           WHERE true
           ON CONFLICT(catalog_id,provider_item_id) DO UPDATE SET
             title=excluded.title,year=excluded.year,poster_url=excluded.poster_url,overview=excluded.overview,
             playback_ref=excluded.playback_ref,content_hash=excluded.content_hash,is_available=1
           WHERE vod_items.content_hash IS NOT excluded.content_hash OR vod_items.is_available=0`,
        )
          .bind(setupId, sourceId, JSON.stringify(clean))
          .run();
        return json({ ok: true, written: r.meta.changes });
      }

      if (action === 'import/remove') {
        const ids = (Array.isArray(body.ids) ? body.ids : []).filter((n: unknown) => Number.isInteger(n));
        if (!ids.length || ids.length > 5000) return json({ error: 'Send between 1 and 5000 ids.' }, 400);
        const r = await env.DB.prepare(
          'UPDATE vod_items SET is_available=0 WHERE setup_id=?1 AND source_id=?2 AND is_available=1 AND id IN (SELECT value FROM json_each(?3))',
        )
          .bind(setupId, sourceId, JSON.stringify(ids))
          .run();
        return json({ ok: true, written: r.meta.changes });
      }

      if (action === 'import/finish') {
        const status = body.error ? `Error · ${str(body.error, 180)}` : str(body.status, 200) || 'OK';
        await env.DB.prepare(
          `UPDATE sources SET last_refresh_status=?${body.error ? '' : ",last_refresh_at=datetime('now')"} WHERE id=?`,
        )
          .bind(hideSecrets(status, src.cfg), sourceId)
          .run();
        return json({ ok: true });
      }
    }
    const patchSource = path.match(/^\/api\/sources\/([^/]+)$/);
    if (method === 'PATCH' && patchSource) {
      const src = await getSource(env, setupId, patchSource[1]);
      const body = (await request.json()) as any;
      const cfg = { ...src.cfg, userAgent: str(body.userAgent, 300) || undefined };
      await env.DB.prepare('UPDATE sources SET encrypted_config=? WHERE id=?')
        .bind(await encrypt(env, cfg), src.id)
        .run();
      return json({ ok: true });
    }
    const deleteMatch = path.match(/^\/api\/sources\/([^/]+)$/);
    if (method === 'DELETE' && deleteMatch) {
      const r = await env.DB.prepare('DELETE FROM sources WHERE id=? AND setup_id=?')
        .bind(deleteMatch[1], setupId)
        .run();
      if (!r.meta.changes) return json({ error: 'Source not found.' }, 404);
      return json({ ok: true });
    }
    const catalogMatch = path.match(/^\/api\/catalogs\/([^/]+)$/);
    if (method === 'PATCH' && catalogMatch) {
      const c = await env.DB.prepare('SELECT id FROM catalogs WHERE id=? AND setup_id=?')
        .bind(catalogMatch[1], setupId)
        .first();
      if (!c) return json({ error: 'Catalog not found.' }, 404);
      const body = (await request.json()) as any;
      const sets: string[] = [];
      const values: any[] = [];
      if (typeof body.display_name === 'string') {
        const name = body.display_name.trim().slice(0, 150);
        if (!name) return json({ error: 'Catalog name cannot be empty.' }, 400);
        sets.push('display_name=?');
        values.push(name);
      }
      if (typeof body.is_hidden === 'boolean') {
        sets.push('is_hidden=?');
        values.push(body.is_hidden ? 1 : 0);
      }
      if (!sets.length) return json({ error: 'No supported changes supplied.' }, 400);
      sets.push("updated_at=datetime('now')");
      values.push(catalogMatch[1], setupId);
      await env.DB.prepare(`UPDATE catalogs SET ${sets.join(',')} WHERE id=? AND setup_id=?`)
        .bind(...values)
        .run();
      return json({ ok: true });
    }
    if (method === 'POST' && path === '/api/catalog-order') {
      const body = (await request.json()) as { ids?: string[] };
      if (!Array.isArray(body.ids) || body.ids.length > 2000)
        return json({ error: 'Invalid catalog order.' }, 400);
      const rows = await env.DB.prepare('SELECT id FROM catalogs WHERE setup_id=?')
        .bind(setupId)
        .all<{ id: string }>();
      const allowed = new Set(rows.results.map((r) => r.id));
      if (
        body.ids.some((id) => !allowed.has(id)) ||
        new Set(body.ids).size !== body.ids.length ||
        body.ids.length !== allowed.size
      )
        return json({ error: 'Order must contain every catalog exactly once.' }, 400);
      await env.DB.prepare(
        "UPDATE catalogs SET sort_order=o.key,updated_at=datetime('now') FROM (SELECT key,value FROM json_each(?1)) o WHERE catalogs.id=o.value AND catalogs.setup_id=?2 AND catalogs.sort_order IS NOT o.key",
      )
        .bind(JSON.stringify(body.ids), setupId)
        .run();
      return json({ ok: true });
    }
    if (path === '/api/tmdb/key' && method === 'POST') {
      const body = (await request.json()) as { apiKey?: string };
      const apiKey = String(body.apiKey || '').trim();
      if (!/^[a-f0-9]{32}$/i.test(apiKey))
        return json({ error: 'TMDB v3 API key should be a 32-character hexadecimal key.' }, 400);
      const testUrl = new URL('https://api.themoviedb.org/3/configuration');
      testUrl.searchParams.set('api_key', apiKey);
      const test = await fetch(testUrl.toString(), {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(12000),
      });
      if (!test.ok)
        return json({ error: 'TMDB rejected this key. Check the key in your TMDB API settings.' }, 400);
      await env.DB.prepare(
        "INSERT INTO setup_secrets(setup_id,secret_name,encrypted_value,updated_at) VALUES(?,?,?,datetime('now')) ON CONFLICT(setup_id,secret_name) DO UPDATE SET encrypted_value=excluded.encrypted_value,updated_at=datetime('now')",
      )
        .bind(setupId, 'tmdb_api_key', await encrypt(env, { apiKey }))
        .run();
      return json({ ok: true, configured: true });
    }
    if (path === '/api/tmdb/key' && method === 'DELETE') {
      await env.DB.prepare('DELETE FROM setup_secrets WHERE setup_id=? AND secret_name=?')
        .bind(setupId, 'tmdb_api_key')
        .run();
      return json({ ok: true, configured: false });
    }
    if (path === '/api/tmdb/match' && method === 'POST') {
      const secret = await env.DB.prepare(
        'SELECT encrypted_value FROM setup_secrets WHERE setup_id=? AND secret_name=?',
      )
        .bind(setupId, 'tmdb_api_key')
        .first<{ encrypted_value: string }>();
      if (!secret) return json({ error: 'Save a valid TMDB API key first.' }, 400);
      const { apiKey } = await decrypt<{ apiKey: string }>(env, secret.encrypted_value);
      const batch = await env.DB.prepare(
        "SELECT id,title,year,media_type FROM vod_items WHERE setup_id=? AND tmdb_match_status='pending' AND is_available=1 ORDER BY title LIMIT 20",
      )
        .bind(setupId)
        .all<any>();
      let matched = 0,
        unmatched = 0;
      const writes: D1PreparedStatement[] = [];
      for (const item of batch.results) {
        const endpoint = item.media_type === 'series' ? 'tv' : 'movie';
        const u = new URL(`https://api.themoviedb.org/3/search/${endpoint}`);
        u.searchParams.set('api_key', apiKey);
        u.searchParams.set('query', item.title);
        if (item.year)
          u.searchParams.set(
            item.media_type === 'series' ? 'first_air_date_year' : 'year',
            String(item.year),
          );
        const r = await fetch(u.toString(), { signal: AbortSignal.timeout(10000) });
        if (!r.ok) {
          writes.push(
            env.DB.prepare("UPDATE vod_items SET tmdb_match_status='error' WHERE id=? AND setup_id=?").bind(
              item.id,
              setupId,
            ),
          );
          continue;
        }
        const data = (await r.json()) as any;
        const results = Array.isArray(data.results) ? data.results : [];
        const norm = (v: string) =>
          v
            .toLowerCase()
            .normalize('NFKD')
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
        const titleKey = norm(item.title.replace(/\b(19|20)\d{2}\b/g, ''));
        const candidates = results
          .map((x: any) => {
            const candidate = norm(x.title || x.name || '');
            const exact = candidate === titleKey ? 1 : 0;
            const yearValue = Number(String(x.release_date || x.first_air_date || '').slice(0, 4)) || null;
            const yearScore =
              item.year && yearValue ? Math.max(0, 1 - Math.abs(item.year - yearValue) / 5) : 0.5;
            const score = exact * 0.8 + yearScore * 0.2;
            return { ...x, _score: score, _year: yearValue };
          })
          .sort((a: any, b: any) => b._score - a._score);
        const best = candidates[0];
        if (best && best._score >= 0.72) {
          const title = best.title || best.name || item.title;
          const poster = best.poster_path ? `https://image.tmdb.org/t/p/w500${best.poster_path}` : null;
          const overview = String(best.overview || '').slice(0, 4000);
          const year = best._year || item.year || null;
          writes.push(
            env.DB.prepare(
              "UPDATE vod_items SET tmdb_id=?,tmdb_match_status='matched',tmdb_match_score=?,poster_url=COALESCE(?,poster_url),overview=CASE WHEN ?<>'' THEN ? ELSE overview END,year=COALESCE(?,year) WHERE id=? AND setup_id=?",
            ).bind(best.id, best._score, poster, overview, overview, year, item.id, setupId),
          );
          matched++;
        } else {
          writes.push(
            env.DB.prepare(
              "UPDATE vod_items SET tmdb_match_status='unmatched',tmdb_match_score=? WHERE id=? AND setup_id=?",
            ).bind(best ? best._score : null, item.id, setupId),
          );
          unmatched++;
        }
      }
      if (writes.length) await env.DB.batch(writes);
      const remaining = await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM vod_items WHERE setup_id=? AND tmdb_match_status='pending' AND is_available=1",
      )
        .bind(setupId)
        .first<{ n: number }>();
      return json({ checked: batch.results.length, matched, unmatched, remaining: remaining?.n || 0 });
    }
    if (method === 'POST' && path === '/api/recovery-code/rotate') {
      const recoveryCode = randomCode();
      await env.DB.prepare("UPDATE setups SET recovery_hash=?,updated_at=datetime('now') WHERE id=?")
        .bind(await sha(recoveryCode), setupId)
        .run();
      return json({ ok: true, recoveryCode });
    }
    return json({ error: 'API route not found.' }, 404);
  }
  const addonMatch = path.match(
    /^\/addon\/([^/]+)\/(manifest\.json|catalog\/([^/]+)\/([^/]+)\.json|meta\/([^/]+)\/([^/]+)\.json|stream\/([^/]+)\/([^/]+)\.json)$/,
  );
  if (addonMatch) {
    const owner = await setupByAddonToken(env, addonMatch[1]);
    if (!owner) return json({ error: 'Invalid addon token.' }, 401);
    const kind = addonMatch[2];
    if (kind === 'manifest.json') {
      const cats = await env.DB.prepare(
        'SELECT id,display_name,media_type FROM catalogs WHERE setup_id=? AND is_hidden=0 ORDER BY sort_order,display_name',
      )
        .bind(owner.id)
        .all<any>();
      return json({
        id: 'com.vodstack.addon',
        version: '0.1.0',
        name: 'VODStack',
        description: 'Custom IPTV VOD catalogs',
        resources: ['catalog', 'meta', 'stream'],
        types: ['movie', 'series'],
        idPrefixes: ['vodstack'],
        catalogs: cats.results.map((c) => ({
          type: c.media_type === 'series' ? 'series' : 'movie',
          id: `vodstack_${c.id}`,
          name: c.display_name,
        })),
      });
    }
    const [, token, , catalogType, catalogId, metaType, metaId, streamType, streamId] = addonMatch;
    if (kind.startsWith('catalog/')) {
      const catalog = await env.DB.prepare(
        'SELECT id,display_name,media_type FROM catalogs WHERE setup_id=? AND id=? AND is_hidden=0',
      )
        .bind(owner.id, catalogId.replace(/^vodstack_/, ''))
        .first<any>();
      if (!catalog) return json({ metas: [] });
      const rows = await env.DB.prepare(
        'SELECT id,title,year,poster_url,overview,media_type FROM vod_items WHERE setup_id=? AND catalog_id=? AND is_available=1 ORDER BY title LIMIT 500',
      )
        .bind(owner.id, catalog.id)
        .all<any>();
      return json({
        metas: rows.results.map((x) => ({
          id: `vodstack:${x.id}`,
          type: x.media_type,
          name: x.title,
          year: x.year,
          poster: x.poster_url,
          description: x.overview,
          catalog: catalog.display_name,
        })),
      });
    }
    if (kind.startsWith('meta/')) {
      const item = await env.DB.prepare(
        'SELECT id,title,year,poster_url,overview,media_type FROM vod_items WHERE setup_id=? AND id=? AND is_available=1',
      )
        .bind(owner.id, Number(metaId.replace(/^vodstack:/, '')) || 0)
        .first<any>();
      if (!item) return json({ error: 'Item not found.' }, 404);
      return json({
        meta: {
          id: `vodstack:${item.id}`,
          type: item.media_type,
          name: item.title,
          year: item.year,
          poster: item.poster_url,
          description: item.overview,
        },
      });
    }
    if (kind.startsWith('stream/')) {
      const item = await env.DB.prepare(
        'SELECT id,media_type,playback_ref,source_id,provider_item_id FROM vod_items WHERE setup_id=? AND id=? AND is_available=1',
      )
        .bind(owner.id, Number(streamId.replace(/^vodstack:/, '')) || 0)
        .first<any>();
      if (!item) return json({ error: 'Item not found.' }, 404);
      const src = await env.DB.prepare('SELECT kind,encrypted_config FROM sources WHERE id=?')
        .bind(item.source_id)
        .first<{ kind: SourceKind; encrypted_config: string }>();
      if (!src) return json({ error: 'Source not found.' }, 404);
      const cfg = await decrypt<SourceConfig>(env, src.encrypted_config);
      const ref: string = item.playback_ref || '';
      let urlOut: string | null = null;
      if (ref.startsWith('xt:') && src.kind === 'xtream') {
        const ext = ref.slice(3).replace(/[^a-z0-9]/gi, '') || 'mp4';
        urlOut = `${String(cfg.baseUrl).replace(/\/$/, '')}/movie/${encodeURIComponent(cfg.username!)}/${encodeURIComponent(cfg.password!)}/${encodeURIComponent(item.provider_item_id)}.${ext}`;
      } else if (ref.startsWith('url:')) {
        const creds = m3uCredentials(cfg);
        urlOut = ref.slice(4);
        if (creds) urlOut = urlOut.split('{u}').join(creds.username).split('{p}').join(creds.password);
      } else if (item.media_type === 'series' && src.kind === 'xtream') {
        return json({ error: 'Series playback (season/episode lists) is not implemented yet.' }, 501);
      }
      if (!urlOut) return json({ error: 'No playback URL is available for this item.' }, 404);
      return json({ streams: [{ title: 'IPTV provider', url: urlOut }] });
    }
  }
  return json({ error: 'Not found.' }, 404);
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    let res: Response;
    try {
      res = await route(request, env);
    } catch (e) {
      res = responseError(e);
    }
    // Addon routes are read by player apps from other origins.
    if (new URL(request.url).pathname.startsWith('/addon/')) {
      res = new Response(res.body, res);
      res.headers.set('access-control-allow-origin', '*');
    }
    return res;
  },
};
