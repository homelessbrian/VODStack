import { dashboard } from './dashboard';
import { handleAddon } from './addon';
import { MATCH_BATCH, matchBatch, searchText, tmdbBase } from './tmdb';
import {
  CatalogRow,
  D1Database,
  D1PreparedStatement,
  D1Result,
  DEFAULT_USER_AGENT,
  Env,
  HttpError,
  MediaType,
  SourceConfig,
  SourceKind,
  XTREAM_PARTS,
  auth,
  b64,
  clearSession,
  cookie,
  decrypt,
  encrypt,
  explainProviderStatus,
  getSource,
  hideSecrets,
  html,
  json,
  key,
  m3uCredentials,
  mediaTypeOf,
  optHttp,
  optStr,
  providerUrl,
  proxyProvider,
  randomCode,
  relayBase,
  responseError,
  safeUrl,
  setSession,
  setupByAddonToken,
  sha,
  str,
  stripCredentials,
  unb64,
  uuid,
  wakeRelay,
} from './lib';

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
            tm: Number.isInteger(Number(x?.tm)) && Number(x?.tm) > 0 ? Number(x.tm) : null,
            // M3U lists series episode-by-episode, which can't be matched to a show reliably.
            ms: src.kind === 'm3u' && t === 'series' ? 'skip' : 'pending',
            st: searchText(title),
          });
        }
        // One statement saves the whole chunk. Rows whose content hash is unchanged are not rewritten.
        const RESET =
          '(vod_items.title IS NOT excluded.title OR (excluded.tmdb_id IS NOT NULL AND vod_items.tmdb_id IS NOT excluded.tmdb_id))';
        const r = await env.DB.prepare(
          `INSERT INTO vod_items(setup_id,source_id,catalog_id,provider_item_id,media_type,title,year,poster_url,overview,playback_ref,content_hash,is_available,tmdb_id,tmdb_match_status,search_text)
           SELECT ?1,?2,c.id,json_extract(j.value,'$.p'),c.media_type,json_extract(j.value,'$.title'),json_extract(j.value,'$.y'),
                  json_extract(j.value,'$.img'),json_extract(j.value,'$.d'),json_extract(j.value,'$.pb'),json_extract(j.value,'$.h'),1,
                  json_extract(j.value,'$.tm'),json_extract(j.value,'$.ms'),json_extract(j.value,'$.st')
           FROM json_each(?3) j
           JOIN catalogs c ON c.setup_id=?1 AND c.source_id=?2 AND c.media_type=json_extract(j.value,'$.t') AND c.source_category_id=json_extract(j.value,'$.c')
           WHERE true
           ON CONFLICT(catalog_id,provider_item_id) DO UPDATE SET
             title=excluded.title,year=excluded.year,poster_url=excluded.poster_url,overview=excluded.overview,
             playback_ref=excluded.playback_ref,content_hash=excluded.content_hash,is_available=1,
             -- A renamed title (or a new provider TMDB ID) needs matching again; otherwise keep the match.
             tmdb_match_status=CASE WHEN ${RESET} THEN excluded.tmdb_match_status ELSE vod_items.tmdb_match_status END,
             tmdb_id=CASE WHEN ${RESET} THEN excluded.tmdb_id ELSE vod_items.tmdb_id END,
             imdb_id=CASE WHEN ${RESET} THEN NULL ELSE vod_items.imdb_id END,
             tmdb_poster=CASE WHEN ${RESET} THEN NULL ELSE vod_items.tmdb_poster END,
             search_text=CASE WHEN ${RESET} OR vod_items.search_text IS NULL THEN excluded.search_text ELSE vod_items.search_text END
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
      const testUrl = new URL(tmdbBase(env) + '/configuration');
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
    if (path === '/api/tmdb/status' && method === 'GET') {
      const [key, counts] = await Promise.all([
        env.DB.prepare('SELECT 1 AS k FROM setup_secrets WHERE setup_id=? AND secret_name=?').bind(setupId, 'tmdb_api_key').first(),
        env.DB.prepare(
          'SELECT tmdb_match_status AS s,COUNT(*) AS n,SUM(imdb_id IS NOT NULL) AS imdb FROM vod_items WHERE setup_id=? AND is_available=1 GROUP BY tmdb_match_status',
        )
          .bind(setupId)
          .all<{ s: string; n: number; imdb: number }>(),
      ]);
      const by = Object.fromEntries(counts.results.map((r) => [r.s, r.n]));
      return json({
        configured: !!key,
        pending: by.pending || 0,
        matched: by.matched || 0,
        unmatched: (by.unmatched || 0) + (by.error || 0),
        withImdb: counts.results.reduce((n, r) => n + (r.imdb || 0), 0),
        batch: MATCH_BATCH,
      });
    }
    if (path === '/api/tmdb/pending' && method === 'GET') {
      // IDs still waiting for a TMDB match, in pages, so the browser can hand them out in small batches.
      const after = Math.max(0, Number(url.searchParams.get('after')) || 0);
      const rows = await env.DB.prepare(
        "SELECT id FROM vod_items WHERE setup_id=? AND tmdb_match_status='pending' AND is_available=1 AND id>? ORDER BY id LIMIT 5000",
      )
        .bind(setupId, after)
        .raw<[number]>();
      const ids = rows.map((r) => r[0]);
      return json({ ids, next: ids.length === 5000 ? ids[ids.length - 1] : null });
    }
    if (path === '/api/tmdb/match' && method === 'POST') {
      const body = (await request.json()) as { ids?: unknown[] };
      const ids = (Array.isArray(body.ids) ? body.ids : []).filter((n): n is number => Number.isInteger(n)).slice(0, MATCH_BATCH);
      if (!ids.length) return json({ error: 'No titles to match.' }, 400);
      return matchBatch(env, setupId, ids);
    }
    if (path === '/api/tmdb/retry' && method === 'POST') {
      // Give titles that didn't match another go (e.g. after the matcher improves).
      const r = await env.DB.prepare(
        "UPDATE vod_items SET tmdb_match_status='pending' WHERE setup_id=? AND tmdb_match_status IN ('unmatched','error') AND is_available=1",
      )
        .bind(setupId)
        .run();
      return json({ ok: true, reset: r.meta.changes });
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
  if (path.startsWith('/addon/')) {
    const res = await handleAddon(env, path);
    if (res) return res;
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
  // Cron trigger (wrangler.toml): ping the relay so Render's free tier doesn't put it to sleep,
  // otherwise pressing play on a series episode could wait a minute for it to wake.
  async scheduled(_event: unknown, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }) {
    ctx.waitUntil(wakeRelay(env));
  },
};
