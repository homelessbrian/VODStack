// VODStack Worker: dashboard API + Nuvio addon.
//
// Data model (see db.ts):
// - A library holds one provider's categories and titles. It is imported, refreshed and TMDB-matched
//   once, by its owner, and shared by everyone who joins it with the owner's invite link.
// - Each person (a "setup") stores only their own provider login, and their own row names/order/
//   hidden choices. Stream links are built from the viewer's own login at play time.
import { dashboard } from './dashboard';
import { handleAddon } from './addon';
import { getDb } from './db';
import { MATCH_BATCH, fillOriginalLanguages, matchBatch, searchTerms, sortKey, tmdbBase } from './tmdb';
import { copyLanguage } from './lang';
import { CERTS, GENRES, LANGUAGES, SMART_LISTS, SORT_LABELS, buildSmartIds, refreshSmartRow, refreshStaleSmartRows, smartLabel, validSmartDef } from './smart';
import {
  type Env,
  type SourceConfig,
  type SourceKind,
  type MediaType,
  HttpError,
  auth,
  b64,
  clearSession,
  cookie,
  decrypt,
  encrypt,
  catalogsFor,
  getLibrary,
  librarySettings,
  matchesHideRule,
  backfillSortTitles,
  recountCatalogs,
  getLogin,
  hideSecrets,
  html,
  json,
  m3uCredentials,
  m3uStoredRef,
  mediaTypeOf,
  optHttp,
  optStr,
  ownedLibrary,
  providerRequest,
  proxyProvider,
  randomCode,
  relayBase,
  responseError,
  safeUrl,
  setSession,
  sha,
  str,
  uuid,
  wakeRelay,
  xtreamApiUrl,
} from './lib';

const SESSION_SECONDS = 2592000;
async function newSession(env: Env, setupId: string, body: unknown) {
  const token = b64(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.prepare('INSERT INTO sessions(token_hash,setup_id,expires_at) VALUES(?,?,?)')
    .bind(await sha(token), setupId, Math.floor(Date.now() / 1000) + SESSION_SECONDS)
    .run();
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json', 'set-cookie': setSession(token), 'cache-control': 'no-store' },
  });
}
async function createSetup(env: Env, libraryId: string | null) {
  const id = uuid();
  const recoveryCode = randomCode();
  const addonToken = b64(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.prepare(
    'INSERT INTO setups(id,recovery_hash,addon_token_hash,addon_token_encrypted,library_id) VALUES(?,?,?,?,?)',
  )
    .bind(id, await sha(recoveryCode), await sha(addonToken), await encrypt(env, { token: addonToken }), libraryId)
    .run();
  return { id, recoveryCode, addonToken };
}

/** Validate a login form. Xtream logins are checked with one request to the provider. */
async function readLogin(env: Env, kind: SourceKind, body: any, check: boolean): Promise<SourceConfig> {
  const userAgent = str(body.userAgent, 300) || undefined;
  if (kind === 'xtream') {
    const cfg: SourceConfig = {
      baseUrl: safeUrl(str(body.baseUrl, 500)).toString().replace(/\/(player_api\.php)?$/, '').replace(/\/$/, ''),
      username: str(body.username, 200),
      password: str(body.password, 200),
      userAgent,
    };
    if (!cfg.username || !cfg.password) throw new HttpError(400, 'Username and password are required.');
    if (check) {
      const r = await providerRequest(env, cfg, xtreamApiUrl(cfg, {}), 45000);
      const d = (await r.json().catch(() => null)) as any;
      if (!d?.user_info || String(d.user_info.auth) === '0')
        throw new HttpError(400, 'The provider rejected this login. Check the server URL, username and password.');
      if (d.user_info.status && String(d.user_info.status).toLowerCase() !== 'active')
        throw new HttpError(400, `The provider says this account is "${d.user_info.status}".`);
    }
    return cfg;
  }
  const cfg: SourceConfig = { playlistUrl: safeUrl(str(body.playlistUrl, 2000)).toString(), userAgent };
  if (!m3uCredentials(cfg))
    throw new HttpError(400, 'The playlist URL should contain your username and password (…get.php?username=…&password=…).');
  return cfg;
}
async function saveLogin(env: Env, setupId: string, libraryId: string, cfg: SourceConfig) {
  await env.DB.prepare(
    "INSERT INTO logins(setup_id,library_id,encrypted_config) VALUES(?,?,?) ON CONFLICT(setup_id,library_id) DO UPDATE SET encrypted_config=excluded.encrypted_config,updated_at=datetime('now')",
  )
    .bind(setupId, libraryId, await encrypt(env, cfg))
    .run();
}

const PURGE_AFTER_DAYS = 90;
/** Delete titles the provider removed more than 90 days ago (and their search entries). */
async function purgeRemoved(env: Env, libraryId: string) {
  const cutoff = Math.floor(Date.now() / 1000) - PURGE_AFTER_DAYS * 86400;
  const ids = (
    await env.DB.prepare('SELECT id FROM vod_items WHERE library_id=? AND is_available=0 AND removed_at<? LIMIT 5000')
      .bind(libraryId, cutoff)
      .raw<[number]>()
  ).map((r) => r[0]);
  if (!ids.length) return 0;
  const list = JSON.stringify(ids);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM search_terms WHERE item_id IN (SELECT value FROM json_each(?))').bind(list),
    env.DB.prepare('DELETE FROM vod_items WHERE id IN (SELECT value FROM json_each(?1)) AND library_id=?2').bind(list, libraryId),
  ]);
  return ids.length;
}
async function libraryStats(env: Env, libraryId: string) {
  const rows = (
    await env.DB.prepare(
      'SELECT tmdb_match_status AS s,COUNT(*) AS n,SUM(imdb_id IS NOT NULL) AS imdb FROM vod_items WHERE library_id=? AND is_available=1 GROUP BY tmdb_match_status',
    )
      .bind(libraryId)
      .all<{ s: string; n: number; imdb: number }>()
  ).results;
  const by = Object.fromEntries(rows.map((r) => [r.s, r.n]));
  const stats = {
    total: rows.reduce((n, r) => n + r.n, 0),
    pending: by.pending || 0,
    matched: by.matched || 0,
    unmatched: (by.unmatched || 0) + (by.error || 0),
    withImdb: rows.reduce((n, r) => n + (r.imdb || 0), 0),
  };
  await env.DB.prepare('UPDATE libraries SET stats_json=? WHERE id=?').bind(JSON.stringify(stats), libraryId).run();
  return stats;
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();
  if (method === 'GET' && path === '/') return html(dashboard());
  if (method === 'GET' && path === '/health') return json({ ok: true, app: env.APP_NAME || 'VODStack' });
  if (path.startsWith('/addon/')) return (await handleAddon(env, path)) || json({ error: 'Not found.' }, 404);
  const body = method === 'POST' || method === 'PATCH' ? ((await request.json().catch(() => ({}))) as any) : {};

  // ---- no session needed ----
  if (method === 'POST' && path === '/api/setup') {
    const s = await createSetup(env, null);
    return newSession(env, s.id, { ok: true, recoveryCode: s.recoveryCode });
  }
  if (method === 'GET' && path === '/api/invite') {
    const lib = await env.DB.prepare('SELECT name,kind FROM libraries WHERE invite_hash=?')
      .bind(await sha(str(url.searchParams.get('code'), 200)))
      .first<{ name: string; kind: SourceKind }>();
    return lib ? json({ ok: true, name: lib.name, kind: lib.kind }) : json({ error: 'This invite link is no longer valid. Ask for a new one.' }, 404);
  }
  if (method === 'POST' && path === '/api/join') {
    // Family members join in one step: invite code + their own login. Returns their Nuvio link.
    const lib = await env.DB.prepare('SELECT id,kind FROM libraries WHERE invite_hash=?')
      .bind(await sha(str(body.code, 200)))
      .first<{ id: string; kind: SourceKind }>();
    if (!lib) return json({ error: 'This invite link is no longer valid. Ask for a new one.' }, 404);
    const cfg = await readLogin(env, lib.kind, body, lib.kind === 'xtream'); // checked before anything is saved
    const s = await createSetup(env, lib.id);
    await saveLogin(env, s.id, lib.id, cfg);
    return newSession(env, s.id, { ok: true, recoveryCode: s.recoveryCode, addonUrl: `${url.origin}/addon/${s.addonToken}/manifest.json` });
  }
  if (method === 'POST' && path === '/api/recover') {
    const code = str(body.code, 100).toUpperCase();
    if (!code) return json({ error: 'Recovery code required.' }, 400);
    const row = await env.DB.prepare('SELECT id FROM setups WHERE recovery_hash=?').bind(await sha(code)).first<{ id: string }>();
    if (!row) return json({ error: 'Recovery code not recognized.' }, 401);
    return newSession(env, row.id, { ok: true });
  }
  if (method === 'POST' && path === '/api/logout') {
    const token = cookie(request, 'vod_session');
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha(token)).run();
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'content-type': 'application/json', 'set-cookie': clearSession(), 'cache-control': 'no-store' },
    });
  }

  if (!path.startsWith('/api/')) return json({ error: 'Not found.' }, 404);
  const setupId = await auth(request, env);
  if (!setupId) return json({ error: 'Setup session required. Recover your setup first.' }, 401);

  if (method === 'GET' && path === '/api/state') {
    const setup = await env.DB.prepare('SELECT addon_token_encrypted FROM setups WHERE id=?').bind(setupId).first<any>();
    const lib = await getLibrary(env, setupId);
    const [login, catalogs, tmdbKey] = lib
      ? await Promise.all([
          getLogin(env, setupId, lib.id),
          // Only the owner arranges rows; family members just need their login and Nuvio link.
          lib.isOwner ? catalogsFor(env, setupId, lib.id) : [],
          lib.isOwner
            ? env.DB.prepare('SELECT 1 AS k FROM setup_secrets WHERE setup_id=? AND secret_name=?').bind(setupId, 'tmdb_api_key').first()
            : null,
        ])
      : [null, [], null];
    let addonToken = '';
    try {
      addonToken = (await decrypt<{ token: string }>(env, setup.addon_token_encrypted)).token;
    } catch {}
    let inviteUrl: string | null = null;
    if (lib?.isOwner && lib.invite_encrypted)
      try {
        inviteUrl = `${url.origin}/?invite=${encodeURIComponent((await decrypt<{ code: string }>(env, lib.invite_encrypted)).code)}`;
      } catch {}
    return json({
      role: lib ? (lib.isOwner ? 'owner' : 'member') : 'new',
      library: lib
        ? {
            name: lib.name,
            kind: lib.kind,
            lastRefreshAt: lib.last_refresh_at,
            status: lib.last_refresh_status,
            stats: lib.stats_json ? JSON.parse(lib.stats_json) : null,
            settings: lib.isOwner ? librarySettings(lib) : undefined,
            sortReady: !!(lib as any).sort_ready,
            createdAt: Math.floor(Date.parse(lib.created_at.replace(' ', 'T') + 'Z') / 1000) || null,
          }
        : null,
      login: login
        ? { baseUrl: login.baseUrl, username: login.username, userAgent: login.userAgent || '', hasPlaylist: !!login.playlistUrl }
        : null,
      catalogs,
      inviteUrl,
      tmdbConfigured: !!tmdbKey,
      relayConfigured: !!relayBase(env),
      addonUrl: addonToken ? `${url.origin}/addon/${addonToken}/manifest.json` : null,
    });
  }

  if (method === 'GET' && path === '/api/relay/wake') return json(await wakeRelay(env));

  // ---- the owner's library ----
  if (method === 'POST' && path === '/api/library') {
    // Create the library (first time) or update the owner's own login and the library name.
    const lib = await getLibrary(env, setupId);
    if (lib && !lib.isOwner) return json({ error: 'You joined a shared library. Update your login on the My login page.' }, 403);
    const kind = (lib?.kind || body.kind) as SourceKind;
    if (!['xtream', 'm3u'].includes(kind)) return json({ error: 'Choose Xtream Codes or M3U playlist.' }, 400);
    const name = str(body.name, 100) || lib?.name || 'My provider';
    const cfg = await readLogin(env, kind, body, false);
    const id = lib?.id || uuid();
    if (lib) await env.DB.prepare('UPDATE libraries SET name=? WHERE id=?').bind(name, id).run();
    else
      await env.DB.batch([
        // New libraries get sort names as they import, so they skip the fill-in.
        env.DB.prepare('INSERT INTO libraries(id,owner_setup_id,name,kind,sort_ready) VALUES(?,?,?,?,1)').bind(id, setupId, name, kind),
        env.DB.prepare('UPDATE setups SET library_id=? WHERE id=?').bind(id, setupId),
      ]);
    await saveLogin(env, setupId, id, cfg);
    return json({ ok: true, kind });
  }
  if (method === 'DELETE' && path === '/api/library') {
    const lib = await ownedLibrary(env, setupId);
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM search_terms WHERE term >= ?1 AND term < ?2`).bind(lib.id.slice(0, 8) + ' ', lib.id.slice(0, 8) + '~'),
      env.DB.prepare('DELETE FROM vod_items WHERE library_id=?').bind(lib.id),
      env.DB.prepare('DELETE FROM catalog_prefs WHERE catalog_id IN (SELECT id FROM catalogs WHERE library_id=?)').bind(lib.id),
      env.DB.prepare('DELETE FROM catalogs WHERE library_id=?').bind(lib.id),
      env.DB.prepare('DELETE FROM logins WHERE library_id=?').bind(lib.id),
      env.DB.prepare('UPDATE setups SET library_id=NULL WHERE library_id=?').bind(lib.id),
      env.DB.prepare('DELETE FROM libraries WHERE id=?').bind(lib.id),
    ]);
    return json({ ok: true });
  }
  if (method === 'POST' && path === '/api/library/settings') {
    // Row-management settings. With apply=true, also hide existing categories that match the words.
    const lib = await ownedLibrary(env, setupId);
    const hideRules = (Array.isArray(body.hideRules) ? body.hideRules : [])
      .map((w: unknown) => str(w, 60))
      .filter(Boolean)
      .slice(0, 100);
    const settings = {
      hideNew: !!body.hideNew,
      hideRules,
      onlyMatched: body.onlyMatched !== false,
      englishOriginal: !!body.englishOriginal,
      englishCopy: !!body.englishCopy,
    };
    await env.DB.prepare('UPDATE libraries SET settings_json=? WHERE id=?').bind(JSON.stringify(settings), lib.id).run();
    let hidden = 0;
    if (body.apply && hideRules.length) {
      const ids = (await catalogsFor(env, setupId, lib.id))
        .filter((c) => !c.isMerge && !c.hidden && matchesHideRule(c.source_category_name, hideRules))
        .map((c) => c.id);
      if (ids.length)
        await env.DB.prepare(
          `INSERT INTO catalog_prefs(setup_id,catalog_id,is_hidden) SELECT ?1,value,1 FROM json_each(?2) WHERE true
           ON CONFLICT(setup_id,catalog_id) DO UPDATE SET is_hidden=1`,
        )
          .bind(setupId, JSON.stringify(ids))
          .run();
      hidden = ids.length;
    }
    await recountCatalogs(env, lib.id);
    return json({ ok: true, hidden });
  }
  if (method === 'POST' && path === '/api/library/detect-langs') {
    // Re-read the provider's language labels for titles already imported (2,000 per call).
    const lib = await ownedLibrary(env, setupId);
    const after = Math.max(0, Number(body.after) || 0);
    const rows = await env.DB.prepare(
      `SELECT v.id,v.title,c.source_category_name,v.copy_lang FROM vod_items v CROSS JOIN catalogs c ON c.id=v.catalog_id
       WHERE v.id>? AND v.library_id=? ORDER BY v.id LIMIT 2000`,
    )
      .bind(after, lib.id)
      .raw<[number, string, string, string | null]>();
    const changes = rows
      .map(([id, title, cat, old]) => ({ id, cl: copyLanguage(title, cat), old }))
      .filter((r) => r.cl !== r.old)
      .map(({ id, cl }) => ({ id, cl }));
    if (changes.length)
      await env.DB.prepare(
        "UPDATE vod_items SET copy_lang=json_extract(r.value,'$.cl') FROM json_each(?2) r WHERE vod_items.id=json_extract(r.value,'$.id') AND vod_items.library_id=?1",
      )
        .bind(lib.id, JSON.stringify(changes))
        .run();
    return json({ ok: true, checked: rows.length, changed: changes.length, next: rows.length === 2000 ? rows[rows.length - 1][0] : null });
  }
  if (method === 'GET' && path === '/api/tmdb/langs/pending') {
    // Matched titles whose original language isn't known yet (matched before this existed).
    const lib = await ownedLibrary(env, setupId);
    const after = Math.max(0, Number(url.searchParams.get('after')) || 0);
    const ids = (
      await env.DB.prepare(
        "SELECT id FROM vod_items WHERE id>? AND library_id=? AND tmdb_id IS NOT NULL AND orig_lang IS NULL AND tmdb_match_status='matched' AND is_available=1 ORDER BY id LIMIT 5000",
      )
        .bind(after, lib.id)
        .raw<[number]>()
    ).map((r) => r[0]);
    return json({ ids, next: ids.length === 5000 ? ids[ids.length - 1] : null });
  }
  if (method === 'POST' && path === '/api/tmdb/langs') {
    const lib = await ownedLibrary(env, setupId);
    const ids = (Array.isArray(body.ids) ? body.ids : []).filter((n: unknown): n is number => Number.isInteger(n)).slice(0, 40);
    if (!ids.length) return json({ error: 'No titles.' }, 400);
    return fillOriginalLanguages(env, setupId, lib.id, ids);
  }
  if (method === 'POST' && path === '/api/library/sort-backfill') {
    const lib = await ownedLibrary(env, setupId);
    return json(await backfillSortTitles(env, lib.id, sortKey));
  }
  if (method === 'POST' && path === '/api/library/invite') {
    // A new invite link; the previous one stops working. People who already joined are unaffected.
    const lib = await ownedLibrary(env, setupId);
    const code = b64(crypto.getRandomValues(new Uint8Array(18)));
    await env.DB.prepare('UPDATE libraries SET invite_hash=?,invite_encrypted=? WHERE id=?')
      .bind(await sha(code), await encrypt(env, { code }), lib.id)
      .run();
    return json({ ok: true, inviteUrl: `${url.origin}/?invite=${encodeURIComponent(code)}` });
  }

  // ---- everyone: their own login ----
  if ((method === 'POST' || method === 'PATCH') && path === '/api/login') {
    const lib = await getLibrary(env, setupId);
    if (!lib) return json({ error: 'Set up or join a library first.' }, 400);
    let cfg: SourceConfig;
    if (method === 'PATCH') {
      // Only the User-Agent changes.
      const old = await getLogin(env, setupId, lib.id);
      if (!old) return json({ error: 'Save your login first.' }, 400);
      cfg = { ...old, userAgent: str(body.userAgent, 300) || undefined };
    } else cfg = await readLogin(env, lib.kind, body, lib.kind === 'xtream');
    await saveLogin(env, setupId, lib.id, cfg);
    return json({ ok: true });
  }

  // ---- import (owner only; the browser does the parsing, see client-import.ts) ----
  if (method === 'GET' && path === '/api/library/provider') return proxyProvider(env, setupId, url.searchParams.get('part') || '');
  if (method === 'GET' && path === '/api/library/index') {
    // What the library already holds, so the browser only sends new/changed titles.
    const lib = await ownedLibrary(env, setupId);
    const after = Math.max(0, Number(url.searchParams.get('after')) || 0);
    const rows = await env.DB.prepare(
      `SELECT v.id,v.media_type,c.source_category_id,v.provider_item_id,v.content_hash,v.is_available
       FROM vod_items v CROSS JOIN catalogs c ON c.id=v.catalog_id WHERE v.id>? AND v.library_id=? ORDER BY v.id LIMIT 5000`,
    )
      .bind(after, lib.id)
      .raw<[number, string, string, string, string, number]>();
    return json({ rows, next: rows.length === 5000 ? rows[rows.length - 1][0] : null });
  }
  if (method === 'POST' && path === '/api/library/import/catalogs') {
    const lib = await ownedLibrary(env, setupId);
    const list = Array.isArray(body.catalogs) ? body.catalogs : [];
    if (!list.length || list.length > 1000) return json({ error: 'Send between 1 and 1000 categories.' }, 400);
    const clean: { t: MediaType; c: string; n: string }[] = [];
    for (const x of list) {
      const t = mediaTypeOf(x?.t);
      const c = str(x?.c, 200);
      if (t && c) clean.push({ t, c, n: str(x?.n, 150) || c });
    }
    const top = await env.DB.prepare('SELECT COALESCE(MAX(sort_order),-1) AS m FROM catalogs WHERE library_id=?').bind(lib.id).first<{ m: number }>();
    const now = Math.floor(Date.now() / 1000);
    const r = await env.DB.prepare(
      `INSERT INTO catalogs(library_id,source_category_id,source_category_name,media_type,sort_order,created_at)
       SELECT ?1,json_extract(j.value,'$.c'),json_extract(j.value,'$.n'),json_extract(j.value,'$.t'),?3+1+j.key,?4
       FROM json_each(?2) j WHERE true
       ON CONFLICT(library_id,media_type,source_category_id) DO UPDATE SET source_category_name=excluded.source_category_name
       WHERE catalogs.source_category_name IS NOT excluded.source_category_name
       RETURNING id,source_category_name,created_at`,
    )
      .bind(lib.id, JSON.stringify(clean), top?.m ?? -1, now)
      .all<{ id: number; source_category_name: string; created_at: number | null }>();
    // Categories that just appeared: hide them if they match an auto-hide word, or if the owner
    // chose "new categories start hidden" (not on the very first import, which would hide everything).
    const settings = librarySettings(lib);
    const firstImport = (top?.m ?? -1) < 0;
    const toHide = r.results
      .filter((c) => c.created_at === now)
      .filter((c) => matchesHideRule(c.source_category_name, settings.hideRules) || (settings.hideNew && !firstImport))
      .map((c) => c.id);
    if (toHide.length)
      await env.DB.prepare(
        `INSERT INTO catalog_prefs(setup_id,catalog_id,is_hidden) SELECT ?1,value,1 FROM json_each(?2) WHERE true
         ON CONFLICT(setup_id,catalog_id) DO UPDATE SET is_hidden=1`,
      )
        .bind(setupId, JSON.stringify(toHide))
        .run();
    return json({ ok: true, written: r.results.length, hidden: toHide.length });
  }
  if (method === 'POST' && path === '/api/library/import/items') {
    const lib = await ownedLibrary(env, setupId);
    const list = Array.isArray(body.items) ? body.items : [];
    if (!list.length || list.length > 500) return json({ error: 'Send between 1 and 500 titles.' }, 400);
    const cfg = lib.kind === 'm3u' ? await getLogin(env, setupId, lib.id) : null;
    const clean = [];
    for (const x of list) {
      const t = mediaTypeOf(x?.t);
      const c = str(x?.c, 200);
      const p = str(x?.p, 200);
      const title = str(x?.title, 300);
      if (!t || !c || !p || !title) continue;
      let pb: string | null = null;
      const rawPb = str(x?.pb, 2000);
      if (lib.kind === 'xtream' && /^xt:[a-z0-9]{1,8}$/i.test(rawPb)) pb = rawPb;
      if (lib.kind === 'm3u' && cfg && /^https?:\/\//i.test(rawPb)) pb = m3uStoredRef(rawPb, cfg);
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
        tm: Number.isInteger(Number(x?.tm)) && Number(x?.tm) > 0 ? Number(x.tm) : null,
        // M3U lists series episode-by-episode, which can't be matched to a show reliably.
        ms: lib.kind === 'm3u' && t === 'series' ? 'skip' : 'pending',
        // Language the provider labels this copy as (from the title or its category).
        cl: copyLanguage(title, str(x?.cn, 150)),
        so: sortKey(title),
      });
    }
    const items = JSON.stringify(clean);
    // A renamed title (or a new provider TMDB ID) needs matching again; otherwise keep the match.
    const RESET = '(vod_items.title IS NOT excluded.title OR (excluded.tmdb_id IS NOT NULL AND vod_items.tmdb_id IS NOT excluded.tmdb_id))';
    // CROSS JOIN keeps json_each as the outer loop, so each title costs one indexed category lookup.
    const JOIN = `FROM json_each(?2) j CROSS JOIN catalogs c
      ON c.library_id=?1 AND c.media_type=json_extract(j.value,'$.t') AND c.source_category_id=json_extract(j.value,'$.c')`;
    const r = await env.DB.prepare(
      `INSERT INTO vod_items(library_id,catalog_id,provider_item_id,media_type,title,year,poster_url,overview,playback_ref,content_hash,is_available,tmdb_id,tmdb_match_status,copy_lang,sort_title)
       SELECT ?1,c.id,json_extract(j.value,'$.p'),c.media_type,json_extract(j.value,'$.title'),json_extract(j.value,'$.y'),
              json_extract(j.value,'$.img'),json_extract(j.value,'$.d'),json_extract(j.value,'$.pb'),json_extract(j.value,'$.h'),1,
              json_extract(j.value,'$.tm'),json_extract(j.value,'$.ms'),json_extract(j.value,'$.cl'),json_extract(j.value,'$.so')
       ${JOIN} WHERE true
       ON CONFLICT(catalog_id,provider_item_id) DO UPDATE SET
         title=excluded.title,year=excluded.year,poster_url=excluded.poster_url,overview=excluded.overview,
         playback_ref=excluded.playback_ref,content_hash=excluded.content_hash,is_available=1,removed_at=NULL,copy_lang=excluded.copy_lang,sort_title=excluded.sort_title,
         tmdb_match_status=CASE WHEN ${RESET} THEN excluded.tmdb_match_status ELSE vod_items.tmdb_match_status END,
         tmdb_id=CASE WHEN ${RESET} THEN excluded.tmdb_id ELSE vod_items.tmdb_id END,
         imdb_id=CASE WHEN ${RESET} THEN NULL ELSE vod_items.imdb_id END,
         tmdb_poster=CASE WHEN ${RESET} THEN NULL ELSE vod_items.tmdb_poster END
       WHERE vod_items.content_hash IS NOT excluded.content_hash OR vod_items.is_available=0`,
    )
      .bind(lib.id, items)
      .run();
    // Search terms for these titles (one indexed lookup per title to find its id).
    const saved = await env.DB.prepare(
      `SELECT v.id,v.title ${JOIN} CROSS JOIN vod_items v ON v.catalog_id=c.id AND v.provider_item_id=json_extract(j.value,'$.p')`,
    )
      .bind(lib.id, items)
      .raw<[number, string]>();
    const terms = saved.flatMap(([id, title]) => searchTerms(lib.id, title).map((t) => [t, id]));
    if (terms.length)
      await env.DB.prepare(
        "INSERT OR IGNORE INTO search_terms(term,item_id) SELECT json_extract(value,'$[0]'),json_extract(value,'$[1]') FROM json_each(?)",
      )
        .bind(JSON.stringify(terms))
        .run();
    return json({ ok: true, written: r.meta.changes });
  }
  if (method === 'POST' && path === '/api/library/import/remove') {
    const lib = await ownedLibrary(env, setupId);
    const ids = (Array.isArray(body.ids) ? body.ids : []).filter((n: unknown) => Number.isInteger(n));
    if (!ids.length || ids.length > 5000) return json({ error: 'Send between 1 and 5000 ids.' }, 400);
    const r = await env.DB.prepare(
      "UPDATE vod_items SET is_available=0,removed_at=CAST(strftime('%s','now') AS INTEGER) WHERE id IN (SELECT value FROM json_each(?2)) AND library_id=?1 AND is_available=1",
    )
      .bind(lib.id, JSON.stringify(ids))
      .run();
    return json({ ok: true, written: r.meta.changes });
  }
  if (method === 'POST' && path === '/api/library/import/finish') {
    const lib = await ownedLibrary(env, setupId);
    const cfg = (await getLogin(env, setupId, lib.id)) || {};
    if (body.error) {
      await env.DB.prepare('UPDATE libraries SET last_refresh_status=? WHERE id=?')
        .bind(hideSecrets(`Error · ${str(body.error, 180)}`, cfg), lib.id)
        .run();
      return json({ ok: true });
    }
    // Store per-row counts once here, so pages never have to count titles.
    await libraryStats(env, lib.id);
    await recountCatalogs(env, lib.id);
    const purged = await purgeRemoved(env, lib.id);
    await env.DB.prepare("UPDATE libraries SET last_refresh_status=?,last_refresh_at=datetime('now') WHERE id=?")
      .bind((str(body.status, 180) || 'OK') + (purged ? ` · ${purged} long-gone titles cleaned up` : ''), lib.id)
      .run();
    return json({ ok: true, purged, stats: await libraryStats(env, lib.id) });
  }

  // ---- everyone: their own rows ----
  const catalogMatch = path.match(/^\/api\/catalogs\/(\d+)$/);
  if (method === 'PATCH' && catalogMatch) {
    const lib = await ownedLibrary(env, setupId);
    const cat = lib
      ? await env.DB.prepare('SELECT id FROM catalogs WHERE id=? AND library_id=?').bind(Number(catalogMatch[1]), lib.id).first()
      : null;
    if (!cat) return json({ error: 'Catalog not found.' }, 404);
    if (body.title_order === 'az' || body.title_order === 'recent') {
      await env.DB.prepare('UPDATE catalogs SET title_order=? WHERE id=? AND library_id=?').bind(body.title_order, Number(catalogMatch[1]), lib.id).run();
      return json({ ok: true });
    }
    const name = typeof body.display_name === 'string' ? body.display_name.trim().slice(0, 150) : undefined;
    const hidden = typeof body.is_hidden === 'boolean' ? (body.is_hidden ? 1 : 0) : undefined;
    if (name === undefined && hidden === undefined) return json({ error: 'No supported changes supplied.' }, 400);
    await env.DB.prepare(
      `INSERT INTO catalog_prefs(setup_id,catalog_id,display_name,is_hidden) VALUES(?1,?2,?3,?4)
       ON CONFLICT(setup_id,catalog_id) DO UPDATE SET
         display_name=CASE WHEN ?5 THEN excluded.display_name ELSE catalog_prefs.display_name END,
         is_hidden=CASE WHEN ?6 THEN excluded.is_hidden ELSE catalog_prefs.is_hidden END`,
    )
      .bind(setupId, Number(catalogMatch[1]), name || null, hidden ?? null, name !== undefined ? 1 : 0, hidden !== undefined ? 1 : 0)
      .run();
    return json({ ok: true });
  }
  // ---- look inside a row (owner only): 100 titles per page, optionally filtered ----
  const titlesMatch = path.match(/^\/api\/catalogs\/(\d+)\/titles$/);
  if (method === 'GET' && titlesMatch) {
    const lib = await ownedLibrary(env, setupId);
    const id = Number(titlesMatch[1]);
    const cat = await env.DB.prepare('SELECT id,is_merge,smart_ids FROM catalogs WHERE id=? AND library_id=?')
      .bind(id, lib.id)
      .first<{ id: number; is_merge: number; smart_ids: string | null }>();
    if (!cat) return json({ error: 'Row not found.' }, 404);
    const skip = Math.max(0, Math.min(50000, Number(url.searchParams.get('skip')) || 0));
    const q = str(url.searchParams.get('q'), 60).toLowerCase();
    if (cat.smart_ids !== null) {
      // Smart row: in TMDB's order.
      const all: number[] = JSON.parse(cat.smart_ids || '[]');
      const rows = (
        await env.DB.prepare(
          'SELECT id,title,year,poster_url,tmdb_poster,imdb_id,tmdb_match_status,is_available,catalog_id FROM vod_items WHERE id IN (SELECT value FROM json_each(?))',
        )
          .bind(JSON.stringify(all))
          .all<any>()
      ).results;
      const byId = new Map(rows.map((r) => [r.id, r]));
      const list = all.map((i) => byId.get(i)).filter((r) => r && (!q || r.title.toLowerCase().includes(q)));
      return json({ titles: list.slice(skip, skip + 100), more: list.length > skip + 100 });
    }
    const ids = cat.is_merge
      ? (await env.DB.prepare('SELECT id FROM catalogs WHERE merged_into=? AND library_id=?').bind(id, lib.id).raw<[number]>()).map((r) => r[0])
      : [id];
    const COLS = 'id,title,sort_title,year,poster_url,tmdb_poster,imdb_id,tmdb_match_status,is_available,catalog_id';
    const lists = await Promise.all(
      ids.map((cid) =>
        (q
          ? env.DB.prepare(`SELECT ${COLS} FROM vod_items WHERE catalog_id=? AND is_available=1 AND lower(title) LIKE ? ORDER BY sort_title LIMIT ?`).bind(cid, '%' + q + '%', skip + 101)
          : env.DB.prepare(`SELECT ${COLS} FROM vod_items WHERE catalog_id=? AND is_available=1 ORDER BY sort_title LIMIT ?`).bind(cid, skip + 101)
        )
          .all<any>()
          .then((r) => r.results),
      ),
    );
    const k = (x: any) => (x.sort_title ?? '') + '\u0000' + x.title;
    const all = lists.flat().sort((a, b) => (k(a) < k(b) ? -1 : k(a) > k(b) ? 1 : 0));
    return json({ titles: all.slice(skip, skip + 100), more: all.length > skip + 100 });
  }

  // ---- smart rows (owner only): TMDB lists filtered to this library ----
  if (method === 'GET' && path === '/api/smart/options') {
    const lists = Object.entries(SMART_LISTS).map(([id, l]) => ({ id, label: l.label, movie: !!l.movie, series: !!l.series, genre: !!l.discover }));
    return json({ lists, genres: GENRES, languages: LANGUAGES, certs: CERTS, sorts: SORT_LABELS });
  }
  if (method === 'POST' && path === '/api/smart') {
    const lib = await ownedLibrary(env, setupId);
    const def = validSmartDef(body);
    if (!def) return json({ error: 'Pick a list (and a genre, for genre lists).' }, 400);
    const hasKey = await env.DB.prepare('SELECT 1 AS k FROM setup_secrets WHERE setup_id=? AND secret_name=?').bind(setupId, 'tmdb_api_key').first();
    if (!hasKey) return json({ error: 'Smart rows need a TMDB key (Settings → TMDB matching).' }, 400);
    const rows = await catalogsFor(env, setupId, lib.id);
    const defJson = JSON.stringify(def);
    if (
      def.list !== 'custom' &&
      rows.some((c) => c.smart && c.smart.list === def.list && c.smart.type === def.type && (c.smart.genre || 0) === (def.genre || 0))
    )
      return json({ error: 'You already have that smart row.' }, 400);
    // New smart rows go to the top of the list.
    const top = rows.length ? Math.min(...rows.map((c) => c.order)) - 1 : 0;
    const row = await env.DB.prepare(
      `INSERT INTO catalogs(library_id,media_type,source_category_id,source_category_name,item_count,sort_order,smart_json,title_order)
       VALUES(?,?,?,?,0,?,?,'az') RETURNING id`,
    )
      .bind(lib.id, def.type, 'smart:' + uuid(), str(body.name, 150) || smartLabel(def), top, defJson)
      .first<{ id: number }>();
    try {
      const count = await refreshSmartRow(env, { id: row!.id, library_id: lib.id, smart_json: defJson }, setupId);
      return json({ ok: true, id: row!.id, count });
    } catch (e) {
      // Don't leave a half-made row behind (it would block trying again).
      await env.DB.prepare('DELETE FROM catalogs WHERE id=?').bind(row!.id).run();
      throw e;
    }
  }
  if (method === 'POST' && path === '/api/smart/preview') {
    // Try a smart row's settings without saving: how many titles, and the first few.
    const lib = await ownedLibrary(env, setupId);
    const def = validSmartDef(body);
    if (!def) return json({ error: 'Pick a list (and a genre, for genre lists).' }, 400);
    const ids = await buildSmartIds(env, def, lib.id, setupId);
    const rows = (
      await env.DB.prepare('SELECT id,title,year,poster_url,tmdb_poster FROM vod_items WHERE id IN (SELECT value FROM json_each(?))')
        .bind(JSON.stringify(ids.slice(0, 30)))
        .all<any>()
    ).results;
    const byId = new Map(rows.map((r) => [r.id, r]));
    return json({ count: ids.length, name: smartLabel(def), titles: ids.slice(0, 30).map((i) => byId.get(i)).filter(Boolean) });
  }
  const smartEdit = path.match(/^\/api\/smart\/(\d+)$/);
  if (method === 'PATCH' && smartEdit) {
    // Change a smart row's settings (and name), then rebuild it.
    const lib = await ownedLibrary(env, setupId);
    const def = validSmartDef(body);
    if (!def) return json({ error: 'Pick a list (and a genre, for genre lists).' }, 400);
    const id = Number(smartEdit[1]);
    const r = await env.DB.prepare('UPDATE catalogs SET smart_json=?,source_category_name=?,media_type=? WHERE id=? AND library_id=? AND smart_json IS NOT NULL')
      .bind(JSON.stringify(def), str(body.name, 150) || smartLabel(def), def.type, id, lib.id)
      .run();
    if (!r.meta.changes) return json({ error: 'Smart row not found.' }, 404);
    // A new name replaces any earlier rename.
    if (str(body.name, 150)) await env.DB.prepare('UPDATE catalog_prefs SET display_name=NULL WHERE setup_id=? AND catalog_id=?').bind(setupId, id).run();
    return json({ ok: true, count: await refreshSmartRow(env, { id, library_id: lib.id, smart_json: JSON.stringify(def) }, setupId) });
  }
  const smartRefresh = path.match(/^\/api\/smart\/(\d+)\/refresh$/);
  if (method === 'POST' && smartRefresh) {
    const lib = await ownedLibrary(env, setupId);
    const row = await env.DB.prepare('SELECT id,library_id,smart_json FROM catalogs WHERE id=? AND library_id=? AND smart_json IS NOT NULL')
      .bind(Number(smartRefresh[1]), lib.id)
      .first<{ id: number; library_id: string; smart_json: string }>();
    if (!row) return json({ error: 'Smart row not found.' }, 404);
    return json({ ok: true, count: await refreshSmartRow(env, row, setupId) });
  }
  const smartDelete = path.match(/^\/api\/smart\/(\d+)$/);
  if (method === 'DELETE' && smartDelete) {
    const lib = await ownedLibrary(env, setupId);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM catalog_prefs WHERE catalog_id=?').bind(Number(smartDelete[1])),
      env.DB.prepare('DELETE FROM catalogs WHERE id=? AND library_id=? AND smart_json IS NOT NULL').bind(Number(smartDelete[1]), lib.id),
    ]);
    return json({ ok: true });
  }

  // ---- merged rows (owner only) ----
  // A merged row only points at its categories; titles never move, so new titles in any of
  // the original categories show up in the merged row automatically after each refresh.
  const recountMerges = (libraryId: string) =>
    env.DB.prepare(
      `UPDATE catalogs SET item_count=COALESCE((SELECT SUM(m.item_count) FROM catalogs m WHERE m.merged_into=catalogs.id),0)
       WHERE library_id=? AND is_merge=1`,
    ).bind(libraryId);
  if (method === 'POST' && path === '/api/merges') {
    const lib = await ownedLibrary(env, setupId);
    const all = await catalogsFor(env, setupId, lib.id);
    const byId = new Map(all.map((c) => [c.id, c]));
    const picked = [...new Set<number>((Array.isArray(body.ids) ? body.ids : []).map(Number))].map((i) => byId.get(i)).filter(Boolean) as typeof all;
    const targets = picked.filter((c) => c.isMerge);
    const members = picked.filter((c) => !c.isMerge);
    if (picked.some((c) => c.smart)) return json({ error: 'Smart rows can’t be merged.' }, 400);
    if (targets.length > 1) return json({ error: 'Pick at most one merged row to add to.' }, 400);
    if (!members.length || (!targets.length && members.length < 2))
      return json({ error: 'Pick at least two categories to merge (or a merged row plus the categories to add to it).' }, 400);
    if (new Set(picked.map((c) => c.media_type)).size > 1) return json({ error: 'Movies and series can’t be merged together.' }, 400);
    let target = targets[0]?.id;
    if (!target) {
      const name = str(body.name, 150) || members.map((m) => m.name).join(' + ').slice(0, 150);
      const row = await env.DB.prepare(
        `INSERT INTO catalogs(library_id,media_type,source_category_id,source_category_name,item_count,sort_order,is_merge)
         VALUES(?,?,?,?,0,?,1) RETURNING id`,
      )
        .bind(lib.id, members[0].media_type, 'merge:' + uuid(), name, Math.min(...members.map((m) => m.order)))
        .first<{ id: number }>();
      target = row!.id;
    }
    await env.DB.batch([
      env.DB.prepare('UPDATE catalogs SET merged_into=?1 WHERE id IN (SELECT value FROM json_each(?2)) AND library_id=?3 AND is_merge=0').bind(
        target,
        JSON.stringify(members.map((m) => m.id)),
        lib.id,
      ),
      recountMerges(lib.id),
      // A merged row left with no categories (because they moved here) is removed.
      env.DB.prepare('DELETE FROM catalogs WHERE library_id=? AND is_merge=1 AND id NOT IN (SELECT merged_into FROM catalogs WHERE merged_into IS NOT NULL)').bind(lib.id),
    ]);
    return json({ ok: true, id: target });
  }
  const unmergeMatch = path.match(/^\/api\/catalogs\/(\d+)\/unmerge$/);
  if (method === 'POST' && unmergeMatch) {
    // On a merged row: split it back into its categories. On a category: take it out of its merged row.
    const lib = await ownedLibrary(env, setupId);
    const id = Number(unmergeMatch[1]);
    const cat = await env.DB.prepare('SELECT id,is_merge FROM catalogs WHERE id=? AND library_id=?').bind(id, lib.id).first<{ id: number; is_merge: number }>();
    if (!cat) return json({ error: 'Row not found.' }, 404);
    await env.DB.batch([
      cat.is_merge
        ? env.DB.prepare('UPDATE catalogs SET merged_into=NULL WHERE merged_into=? AND library_id=?').bind(id, lib.id)
        : env.DB.prepare('UPDATE catalogs SET merged_into=NULL WHERE id=? AND library_id=?').bind(id, lib.id),
      recountMerges(lib.id),
      env.DB.prepare('DELETE FROM catalog_prefs WHERE catalog_id IN (SELECT id FROM catalogs WHERE library_id=?1 AND is_merge=1 AND id NOT IN (SELECT merged_into FROM catalogs WHERE merged_into IS NOT NULL))').bind(lib.id),
      env.DB.prepare('DELETE FROM catalogs WHERE library_id=? AND is_merge=1 AND id NOT IN (SELECT merged_into FROM catalogs WHERE merged_into IS NOT NULL)').bind(lib.id),
    ]);
    return json({ ok: true });
  }
  if (method === 'POST' && path === '/api/catalogs/bulk') {
    // Show or hide many rows at once (one statement).
    const lib = await ownedLibrary(env, setupId);
    const ids = (Array.isArray(body.ids) ? body.ids : []).filter((n: unknown) => Number.isInteger(n)).slice(0, 2000);
    if (!ids.length || typeof body.is_hidden !== 'boolean') return json({ error: 'Send ids and is_hidden.' }, 400);
    await env.DB.prepare(
      `INSERT INTO catalog_prefs(setup_id,catalog_id,is_hidden)
       SELECT ?1,c.id,?3 FROM json_each(?2) j CROSS JOIN catalogs c ON c.id=j.value AND c.library_id=?4 WHERE true
       ON CONFLICT(setup_id,catalog_id) DO UPDATE SET is_hidden=excluded.is_hidden`,
    )
      .bind(setupId, JSON.stringify(ids), body.is_hidden ? 1 : 0, lib.id)
      .run();
    return json({ ok: true });
  }
  if (method === 'POST' && path === '/api/catalog-order') {
    // Reuse the current order values in the new sequence, so moving one row writes only the rows that moved.
    const lib = await ownedLibrary(env, setupId);
    const current = await catalogsFor(env, setupId, lib.id);
    const ids: unknown[] = Array.isArray(body.ids) ? body.ids : [];
    const byId = new Map(current.map((c) => [c.id, c]));
    if (ids.length !== current.length || new Set(ids).size !== ids.length || ids.some((i) => !byId.has(Number(i))))
      return json({ error: 'Order must contain every catalog exactly once.' }, 400);
    const values = current.map((c) => c.order).sort((a, b) => a - b);
    const changes = ids
      .map((i, pos) => ({ id: Number(i), order: values[pos] }))
      .filter((x) => byId.get(x.id)!.order !== x.order);
    if (changes.length)
      await env.DB.prepare(
        `INSERT INTO catalog_prefs(setup_id,catalog_id,sort_order)
         SELECT ?1,json_extract(value,'$.id'),json_extract(value,'$.order') FROM json_each(?2) WHERE true
         ON CONFLICT(setup_id,catalog_id) DO UPDATE SET sort_order=excluded.sort_order`,
      )
        .bind(setupId, JSON.stringify(changes))
        .run();
    return json({ ok: true, changed: changes.length });
  }

  // ---- TMDB matching (owner only; matches are shared with everyone in the library) ----
  if (path === '/api/tmdb/key' && method === 'POST') {
    await ownedLibrary(env, setupId);
    const apiKey = str(body.apiKey, 64);
    if (!/^[a-f0-9]{32}$/i.test(apiKey)) return json({ error: 'TMDB v3 API key should be a 32-character hexadecimal key.' }, 400);
    const testUrl = new URL(tmdbBase(env) + '/configuration');
    testUrl.searchParams.set('api_key', apiKey);
    const test = await fetch(testUrl.toString(), { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
    if (!test.ok) return json({ error: 'TMDB rejected this key. Check the key in your TMDB API settings.' }, 400);
    await env.DB.prepare(
      "INSERT INTO setup_secrets(setup_id,secret_name,encrypted_value) VALUES(?,?,?) ON CONFLICT(setup_id,secret_name) DO UPDATE SET encrypted_value=excluded.encrypted_value,updated_at=datetime('now')",
    )
      .bind(setupId, 'tmdb_api_key', await encrypt(env, { apiKey }))
      .run();
    return json({ ok: true, configured: true });
  }
  if (path === '/api/tmdb/key' && method === 'DELETE') {
    await env.DB.prepare('DELETE FROM setup_secrets WHERE setup_id=? AND secret_name=?').bind(setupId, 'tmdb_api_key').run();
    return json({ ok: true, configured: false });
  }
  if (path === '/api/tmdb/status' && method === 'GET') {
    const lib = await ownedLibrary(env, setupId);
    const key = await env.DB.prepare('SELECT 1 AS k FROM setup_secrets WHERE setup_id=? AND secret_name=?').bind(setupId, 'tmdb_api_key').first();
    const stats = lib.stats_json ? JSON.parse(lib.stats_json) : { total: 0, pending: 0, matched: 0, unmatched: 0, withImdb: 0 };
    return json({ configured: !!key, ...stats, batch: MATCH_BATCH });
  }
  if (path === '/api/tmdb/stats' && method === 'POST') {
    // Recount after a matching run (one read of the library, then stored).
    const lib = await ownedLibrary(env, setupId);
    const stats = await libraryStats(env, lib.id);
    await recountCatalogs(env, lib.id);
    return json(stats);
  }
  if (path === '/api/tmdb/pending' && method === 'GET') {
    const lib = await ownedLibrary(env, setupId);
    const after = Math.max(0, Number(url.searchParams.get('after')) || 0);
    const rows = await env.DB.prepare(
      "SELECT id FROM vod_items WHERE id>? AND library_id=? AND tmdb_match_status='pending' AND is_available=1 ORDER BY id LIMIT 5000",
    )
      .bind(after, lib.id)
      .raw<[number]>();
    const ids = rows.map((r) => r[0]);
    return json({ ids, next: ids.length === 5000 ? ids[ids.length - 1] : null });
  }
  if (path === '/api/tmdb/match' && method === 'POST') {
    const lib = await ownedLibrary(env, setupId);
    const ids = (Array.isArray(body.ids) ? body.ids : []).filter((n: unknown): n is number => Number.isInteger(n)).slice(0, MATCH_BATCH);
    if (!ids.length) return json({ error: 'No titles to match.' }, 400);
    return matchBatch(env, setupId, lib.id, ids);
  }
  if (path === '/api/tmdb/retry' && method === 'POST') {
    const lib = await ownedLibrary(env, setupId);
    const r = await env.DB.prepare(
      "UPDATE vod_items SET tmdb_match_status='pending' WHERE library_id=? AND tmdb_match_status IN ('unmatched','error') AND is_available=1",
    )
      .bind(lib.id)
      .run();
    await libraryStats(env, lib.id);
    return json({ ok: true, reset: r.meta.changes });
  }

  if (method === 'POST' && path === '/api/recovery-code/rotate') {
    const recoveryCode = randomCode();
    await env.DB.prepare("UPDATE setups SET recovery_hash=?,updated_at=datetime('now') WHERE id=?").bind(await sha(recoveryCode), setupId).run();
    return json({ ok: true, recoveryCode });
  }
  return json({ error: 'API route not found.' }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    let res: Response;
    try {
      res = await route(request, { ...env, DB: env.DB || getDb(env.TURSO_URL, env.TURSO_TOKEN) });
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
  // Cron trigger (wrangler.toml): ping the relay so Render's free tier doesn't put it to sleep,
  // otherwise pressing play on a series episode could wait a minute for it to wake.
  async scheduled(_event: unknown, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }) {
    ctx.waitUntil(wakeRelay(env));
    // Fill in A–Z sort names for libraries imported before they existed (2,000 titles per run).
    if (env.TURSO_URL)
      ctx.waitUntil(
        (async () => {
          const db = { ...env, DB: getDb(env.TURSO_URL, env.TURSO_TOKEN) };
          const lib = await db.DB.prepare('SELECT id FROM libraries WHERE sort_ready=0 LIMIT 1').first<{ id: string }>();
          if (lib) await backfillSortTitles(db, lib.id, sortKey);
        })().catch(() => {}),
      );
    // Keep smart rows (TMDB lists) fresh, a couple per run.
    if (env.TURSO_URL) ctx.waitUntil(refreshStaleSmartRows({ ...env, DB: getDb(env.TURSO_URL, env.TURSO_TOKEN) }));
  },
};
