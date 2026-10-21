// Shared helpers used by the dashboard API, the addon routes and TMDB matching.
import type { D1Database } from './db';
export type { D1Database, D1PreparedStatement, D1Result } from './db';
export interface Env {
  /** Set per request from TURSO_URL/TURSO_TOKEN (see db.ts). */
  DB: D1Database;
  TURSO_URL?: string;
  TURSO_TOKEN?: string;
  ENCRYPTION_KEY: string;
  APP_NAME?: string;
  /** Optional relay (relay/server.mjs on Render) for providers that block Cloudflare. Set both as Worker secrets. */
  RELAY_URL?: string;
  RELAY_KEY?: string;
  /** Tests only: point TMDB calls at a fake server. Leave unset in production. */
  TMDB_API_BASE?: string;
}
export type MediaType = 'movie' | 'series';
export type SourceKind = 'xtream' | 'm3u';
export interface SourceConfig {
  baseUrl?: string;
  username?: string;
  password?: string;
  playlistUrl?: string;
  userAgent?: string;
}
export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
export const html = (body: string, status = 200) =>
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
export const uuid = () => crypto.randomUUID();
export const b64 = (b: ArrayBuffer | Uint8Array) =>
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
export const unb64 = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) =>
    c.charCodeAt(0),
  );
export async function sha(s: string) {
  return b64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
}
export function randomCode() {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  const s = b64(a)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return `VOD-${s.slice(0, 6)}-${s.slice(6, 12)}-${s.slice(12, 18)}-${s.slice(18, 24)}`;
}
export async function key(env: Env) {
  if (!env.ENCRYPTION_KEY)
    throw new Error('Server encryption key is not configured. Set ENCRYPTION_KEY before creating sources.');
  const raw = unb64(env.ENCRYPTION_KEY);
  if (raw.length !== 32) throw new Error('ENCRYPTION_KEY must be base64-encoded 32-byte key.');
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}
export async function encrypt(env: Env, value: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await key(env),
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return `${b64(iv)}.${b64(ciphertext)}`;
}
export async function decrypt<T>(env: Env, value: string): Promise<T> {
  const [iv, cipher] = value.split('.');
  const clear = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: unb64(iv) },
    await key(env),
    unb64(cipher),
  );
  return JSON.parse(new TextDecoder().decode(clear)) as T;
}
export function cookie(request: Request, name: string) {
  return (request.headers.get('cookie') || '')
    .split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith(name + '='))
    ?.slice(name.length + 1);
}
export async function auth(request: Request, env: Env) {
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
export function setSession(token: string) {
  return `vod_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000`;
}
export function clearSession() {
  return 'vod_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0';
}
export function safeUrl(s: string) {
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
export function responseError(e: unknown) {
  const message = e instanceof Error ? e.message : 'Unexpected server error';
  return json({ error: message }, e instanceof HttpError ? e.status : 400);
}
export const DEFAULT_USER_AGENT = 'VLC/3.0.21 LibVLC/3.0.21';
export const XTREAM_PARTS: Record<string, string> = {
  account: '',
  vod_categories: 'get_vod_categories',
  series_categories: 'get_series_categories',
  vod_streams: 'get_vod_streams',
  series: 'get_series',
};
export type Library = {
  id: string;
  owner_setup_id: string;
  name: string;
  kind: SourceKind;
  last_refresh_at: string | null;
  last_refresh_status: string | null;
  stats_json: string | null;
  invite_encrypted: string | null;
  settings_json: string | null;
  created_at: string;
};
export type LibrarySettings = { hideNew: boolean; hideRules: string[]; onlyMatched: boolean };
export function librarySettings(lib: { settings_json: string | null }): LibrarySettings {
  try {
    const s = JSON.parse(lib.settings_json || '{}');
    // onlyMatched is on unless the owner turned it off.
    return { hideNew: !!s.hideNew, hideRules: Array.isArray(s.hideRules) ? s.hideRules.map(String) : [], onlyMatched: s.onlyMatched !== false };
  } catch {
    return { hideNew: false, hideRules: [], onlyMatched: true };
  }
}
/** SQL condition for "has full metadata". M3U series episodes can't be matched, so they always count. */
export const HAS_METADATA = "(v.imdb_id IS NOT NULL OR v.tmdb_match_status='skip')";
/**
 * Should Nuvio only get titles with full metadata? Only once at least something is matched,
 * so a library without a TMDB key doesn't suddenly look empty.
 */
export function onlyMatchedActive(lib: { settings_json: string | null; stats_json: string | null }) {
  if (!librarySettings(lib).onlyMatched) return false;
  try {
    return (JSON.parse(lib.stats_json || '{}').withImdb || 0) > 0;
  } catch {
    return false;
  }
}
/** Recount titles per row (all, and with metadata). Reads the library once; writes only changed rows. */
export async function recountCatalogs(env: Env, libraryId: string) {
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE catalogs SET item_count=n.cnt,matched_count=n.m FROM (
         SELECT v.catalog_id,COUNT(*) AS cnt,SUM(CASE WHEN ${HAS_METADATA} THEN 1 ELSE 0 END) AS m
         FROM vod_items v WHERE v.library_id=?1 AND v.is_available=1 GROUP BY v.catalog_id) n
       WHERE catalogs.id=n.catalog_id AND (catalogs.item_count IS NOT n.cnt OR catalogs.matched_count IS NOT n.m)`,
    ).bind(libraryId),
    env.DB.prepare(
      `UPDATE catalogs SET item_count=0,matched_count=0 WHERE library_id=?1 AND (item_count>0 OR matched_count>0) AND smart_json IS NULL AND is_merge=0
       AND id NOT IN (SELECT DISTINCT catalog_id FROM vod_items WHERE library_id=?1 AND is_available=1)`,
    ).bind(libraryId),
    // Merged rows count the titles of the categories merged into them.
    env.DB.prepare(
      `UPDATE catalogs SET item_count=COALESCE((SELECT SUM(m.item_count) FROM catalogs m WHERE m.merged_into=catalogs.id),0),
         matched_count=COALESCE((SELECT SUM(m.matched_count) FROM catalogs m WHERE m.merged_into=catalogs.id),0)
       WHERE library_id=? AND is_merge=1`,
    ).bind(libraryId),
  ]);
}
/** Does a category name match one of the owner's auto-hide words? (case-insensitive, anywhere in the name) */
export function matchesHideRule(name: string, rules: string[]) {
  const n = name.toLowerCase();
  return rules.some((r) => r && n.includes(r.toLowerCase()));
}
/** The library a setup belongs to (as owner or member), or null. */
export async function getLibrary(env: Env, setupId: string) {
  const lib = await env.DB.prepare(
    'SELECT l.* FROM setups s JOIN libraries l ON l.id=s.library_id WHERE s.id=?',
  )
    .bind(setupId)
    .first<Library>();
  return lib ? { ...lib, isOwner: lib.owner_setup_id === setupId } : null;
}
/** The library, for actions only its owner may take (import, refresh, TMDB). */
export async function ownedLibrary(env: Env, setupId: string) {
  const lib = await getLibrary(env, setupId);
  if (!lib) throw new HttpError(404, 'Set up your provider first.');
  if (!lib.isOwner) throw new HttpError(403, 'Only the library owner can do this.');
  return lib;
}
/** A person's own provider login for a library. */
export async function getLogin(env: Env, setupId: string, libraryId: string) {
  const row = await env.DB.prepare('SELECT encrypted_config FROM logins WHERE setup_id=? AND library_id=?')
    .bind(setupId, libraryId)
    .first<{ encrypted_config: string }>();
  return row ? await decrypt<SourceConfig>(env, row.encrypted_config) : null;
}
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
/** Credentials embedded in an M3U playlist URL (get.php?username=…&password=…). */
export function m3uCredentials(cfg: SourceConfig) {
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
export function stripCredentials(url: string, creds: { username: string; password: string } | null) {
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
/** Store an M3U stream link without credentials, and relative to the playlist's host when possible. */
export function m3uStoredRef(url: string, cfg: SourceConfig) {
  const clean = stripCredentials(url, m3uCredentials(cfg));
  try {
    const origin = new URL(cfg.playlistUrl || '').origin;
    if (clean.startsWith(origin + '/')) return 'rel:' + clean.slice(origin.length);
  } catch {}
  return 'url:' + clean;
}
/** Rebuild a playable link from a stored ref using this person's own login. */
export function playbackUrl(kind: SourceKind, cfg: SourceConfig, ref: string, providerItemId: string) {
  if (ref.startsWith('xt:') && kind === 'xtream') return xtreamStreamUrl(cfg, 'movie', providerItemId, ref.slice(3));
  if (ref.startsWith('rel:') || ref.startsWith('url:')) {
    let u = ref.startsWith('rel:') ? new URL(cfg.playlistUrl || 'http://invalid').origin + ref.slice(4) : ref.slice(4);
    const creds = m3uCredentials(cfg);
    if (creds) u = u.split('{u}').join(encodeURIComponent(creds.username)).split('{p}').join(encodeURIComponent(creds.password));
    return u;
  }
  return null;
}
export function hideSecrets(text: string, cfg: SourceConfig) {
  let out = text;
  for (const v of [cfg.password, cfg.username, m3uCredentials(cfg)?.password, m3uCredentials(cfg)?.username])
    if (v && v.length >= 3) out = out.split(v).join('***');
  return out;
}
export function providerUrl(kind: SourceKind, cfg: SourceConfig, part: string) {
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
export function explainProviderStatus(status: number) {
  if (status === 401 || status === 403)
    return `The provider refused the request (HTTP ${status}). Usually this means wrong login details, the account is already in use, or the provider blocks requests from Cloudflare's servers or from this User-Agent. Try setting a different User-Agent on the source.`;
  if (status === 404) return 'The provider says that address does not exist (HTTP 404). Check the server/playlist URL.';
  if (status === 429)
    return 'The provider is rate-limiting this account (HTTP 429). Wait 15–30 minutes before trying again.';
  if (status >= 520 && status <= 530)
    return `The provider's server could not be reached through Cloudflare (HTTP ${status}). It may be down or blocking Cloudflare.`;
  return `The provider returned HTTP ${status}.`;
}
export const relayBase = (env: Env) =>
  env.RELAY_URL && env.RELAY_KEY ? env.RELAY_URL.trim().replace(/\/+$/, '') : null;
/** Ping the relay. Render's free tier sleeps after 15 idle minutes and takes about a minute to wake. */
export async function wakeRelay(env: Env) {
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
/**
 * Make one request to the provider (through the relay when configured).
 * Returns the provider's successful response, or throws HttpError(502) with a plain-English reason.
 */
export async function providerRequest(env: Env, cfg: SourceConfig, target: URL, timeoutMs = 75000) {
  const userAgent = cfg.userAgent || DEFAULT_USER_AGENT;
  const relay = relayBase(env);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs); // time limit to *start* responding
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
      ? `it did not respond within ${Math.round(timeoutMs / 1000)} seconds`
      : hideSecrets(e instanceof Error ? e.message : String(e), cfg);
    throw new HttpError(502, `Couldn't reach the ${relay ? 'relay' : 'provider'}: ${why}.`);
  } finally {
    clearTimeout(timer);
  }
  if (relay && !r.headers.get('x-upstream-status')) {
    // The relay itself answered (bad key, asleep, crashed) rather than passing on the provider's reply.
    const d = (await r.json().catch(() => null)) as { error?: string } | null;
    const why = d?.error ? hideSecrets(d.error, cfg) : `HTTP ${r.status} — it may still be waking up; try again in a minute`;
    throw new HttpError(
      502,
      `The relay couldn't download from the provider: ${why}${r.status === 401 ? ' Check that RELAY_KEY in Cloudflare matches the one in Render.' : ''}`,
    );
  }
  if (!r.ok) {
    let snippet = '';
    try {
      snippet = hideSecrets((await r.text()).slice(0, 200).replace(/\s+/g, ' ').trim(), cfg);
    } catch {}
    const cloudflareBlock = /error code: 1\d{3}/i.test(snippet);
    const message = cloudflareBlock
      ? relay
        ? `The provider's Cloudflare protection blocked the relay too (${snippet}). Use "Refresh from file" for this provider.`
        : `The provider's server is behind Cloudflare, and Cloudflare blocked this request (${snippet}). Set up the relay (see RELAY-SETUP.md in the repo), or import the playlist file from your own device: open your playlist URL in a new browser tab to download it, then choose that file with "Use a playlist file" (or "Refresh from file").`
      : explainProviderStatus(r.status) + (snippet ? ` Provider said: "${snippet}"` : '');
    throw new HttpError(502, message);
  }
  return r;
}
/** Fetch one list from the provider and stream it straight back to the browser (no parsing here). */
export async function proxyProvider(env: Env, setupId: string, part: string) {
  const lib = await ownedLibrary(env, setupId);
  const cfg = await getLogin(env, setupId, lib.id);
  if (!cfg) throw new HttpError(400, 'Your provider login is missing. Re-enter it on the Library page.');
  const r = await providerRequest(env, cfg, providerUrl(lib.kind, cfg, part));
  return new Response(r.body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
/** Xtream player_api.php URL for an arbitrary action (e.g. get_series_info). */
export function xtreamApiUrl(cfg: SourceConfig, params: Record<string, string>) {
  const u = safeUrl(cfg.baseUrl || '');
  u.pathname = u.pathname.replace(/\/(player_api\.php)?$/, '') + '/player_api.php';
  u.searchParams.set('username', cfg.username || '');
  u.searchParams.set('password', cfg.password || '');
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u;
}
/** Xtream playback URL for a movie or an episode. */
export function xtreamStreamUrl(cfg: SourceConfig, kind: 'movie' | 'series', id: string, ext: string) {
  const e = String(ext || 'mp4').replace(/[^a-z0-9]/gi, '') || 'mp4';
  return `${String(cfg.baseUrl).replace(/\/$/, '')}/${kind}/${encodeURIComponent(cfg.username!)}/${encodeURIComponent(cfg.password!)}/${encodeURIComponent(id)}.${e}`;
}
export const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
export const optStr = (v: unknown, max: number) => str(v, max) || null;
export const optHttp = (v: unknown) => {
  const s = str(v, 1000);
  return /^https?:\/\//i.test(s) ? s : null;
};
export const mediaTypeOf = (v: unknown): MediaType | null => (v === 'movie' || v === 'series' ? v : null);
export async function setupByAddonToken(env: Env, token: string) {
  const h = await sha(token);
  return env.DB.prepare('SELECT id FROM setups WHERE addon_token_hash=?').bind(h).first<{ id: string }>();
}

export type CatalogView = {
  id: number;
  media_type: MediaType;
  source_category_name: string;
  item_count: number;
  name: string;
  hidden: boolean;
  order: number;
  renamed: boolean;
  isMerge: boolean;
  mergedInto: number | null;
  createdAt: number | null;
  titleOrder: 'az' | 'recent';
  smart: { list: string; type: MediaType; genre?: number; at: number | null } | null;
  matchedCount: number;
};
/** A library's categories as this person sees them (their names, order and hidden choices). ~1 read per category. */
export async function catalogsFor(env: Env, setupId: string, libraryId: string): Promise<CatalogView[]> {
  const rows = (
    await env.DB.prepare(
      `SELECT c.id,c.media_type,c.source_category_name,c.item_count,c.sort_order,c.is_merge,c.merged_into,c.created_at,c.title_order,c.smart_json,c.smart_at,c.matched_count,p.display_name,p.is_hidden,p.sort_order AS psort
       FROM catalogs c LEFT JOIN catalog_prefs p ON p.setup_id=? AND p.catalog_id=c.id WHERE c.library_id=?`,
    )
      .bind(setupId, libraryId)
      .all<any>()
  ).results;
  return rows
    .map((r) => ({
      id: r.id,
      media_type: r.media_type,
      source_category_name: r.source_category_name,
      item_count: r.item_count,
      name: r.display_name || r.source_category_name,
      hidden: !!r.is_hidden,
      order: r.psort ?? r.sort_order,
      renamed: !!r.display_name,
      isMerge: !!r.is_merge,
      mergedInto: r.merged_into ?? null,
      createdAt: r.created_at ?? null,
      titleOrder: (r.title_order === 'recent' ? 'recent' : 'az') as 'az' | 'recent',
      smart: r.smart_json ? { ...JSON.parse(r.smart_json), at: r.smart_at ?? null } : null,
      matchedCount: r.smart_json ? r.item_count : r.matched_count,
    }))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

