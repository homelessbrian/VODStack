// Stremio-style addon that Nuvio installs from the manifest URL.
//
// - The titles and row layout come from the shared library (arranged by its owner); stream links
//   use the viewer's own login.
// - Titles matched to IMDb use their real ID (tt…), so Nuvio shows its normal metadata for them.
// - Unmatched titles use "vodstack:<n>" IDs with the provider's own name/poster.
// - Search only returns what the provider has. Series episodes come from get_series_info.
//
// Reads are kept small: a row page reads ~100 titles via an index, search reads only matching
// search terms, and responses carry cache headers so players can reuse them.
import {
  catalogsFor,
  visibleFilter,
  NOT_HIDDEN_EVERYWHERE,
  shuffleWindow,
  getLibrary,
  getLogin,
  json,
  playbackUrl,
  providerRequest,
  setupByAddonToken,
  xtreamApiUrl,
  xtreamStreamUrl,
  type Env,
  type SourceConfig,
} from './lib';
import { displayTitle, norm } from './tmdb';
import { refreshSmartRow } from './smart';

const PAGE = 100;
type ItemRow = {
  id: number;
  title: string;
  year: number | null;
  poster_url: string | null;
  tmdb_poster: string | null;
  overview: string | null;
  media_type: 'movie' | 'series';
  imdb_id: string | null;
  catalog_id?: number;
  sort_title?: string | null;
};
const ITEM_COLS = 'v.id,v.title,v.sort_title,v.year,v.poster_url,v.tmdb_poster,v.overview,v.media_type,v.imdb_id,v.catalog_id';

const cached = (data: unknown, seconds: number) =>
  new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': `public, max-age=${seconds}` },
  });

function metaPreview(x: ItemRow) {
  return {
    id: x.imdb_id || `vodstack:${x.id}`,
    type: x.media_type,
    name: displayTitle(x.title),
    poster: x.tmdb_poster || x.poster_url || undefined,
    posterShape: 'poster',
    releaseInfo: x.year ? String(x.year) : undefined,
    description: x.overview || undefined,
  };
}
const key = (x: { sort_title?: string | null; title: string }) => (x.sort_title ?? '') + '\u0000' + x.title;
const byKey = (a: ItemRow, b: ItemRow) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);
function dedupe<T extends { id: string }>(list: T[]) {
  const seen = new Set<string>();
  return list.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
}
function parseExtra(extra: string | undefined) {
  const out: Record<string, string> = {};
  for (const part of (extra || '').split('&')) {
    const i = part.indexOf('=');
    if (i > 0)
      try {
        out[decodeURIComponent(part.slice(0, i))] = decodeURIComponent(part.slice(i + 1));
      } catch {}
  }
  return out;
}

type Episode = { id: string; season: number; episode: number; title: string; ext: string; plot?: string; image?: string; released?: string };
export type Ctx = { waitUntil(p: Promise<unknown>): void };
const EPISODES_FRESH_SECONDS = 24 * 3600;
/**
 * Episode list for an Xtream series, remembered per library. Episode ids are the same for every
 * login on the provider, so one fetch serves everyone. A list older than a day is still served
 * right away and refreshed in the background, so opening a series rarely needs the relay.
 */
async function seriesEpisodes(env: Env, cfg: SourceConfig, seriesId: string, libraryId: string, ctx?: Ctx): Promise<Episode[]> {
  const row = await env.DB.prepare('SELECT episodes_json,fetched_at FROM series_cache WHERE library_id=? AND series_id=?')
    .bind(libraryId, seriesId)
    .first<{ episodes_json: string; fetched_at: number }>();
  const now = Math.floor(Date.now() / 1000);
  const refresh = async () => {
    const eps = await fetchEpisodes(env, cfg, seriesId);
    if (eps.length)
      await env.DB.prepare(
        `INSERT INTO series_cache(library_id,series_id,episodes_json,fetched_at) VALUES(?,?,?,?)
         ON CONFLICT(library_id,series_id) DO UPDATE SET episodes_json=excluded.episodes_json,fetched_at=excluded.fetched_at`,
      )
        .bind(libraryId, seriesId, JSON.stringify(eps), now)
        .run();
    return eps;
  };
  if (row) {
    if (now - row.fetched_at > EPISODES_FRESH_SECONDS) {
      const bg = refresh().catch(() => []);
      if (ctx) ctx.waitUntil(bg);
    }
    return JSON.parse(row.episodes_json) as Episode[];
  }
  return refresh();
}
/** One provider request (with the viewer's login): the episode list for an Xtream series. */
async function fetchEpisodes(env: Env, cfg: SourceConfig, seriesId: string): Promise<Episode[]> {
  // Allow time for the relay to wake if it was asleep.
  const r = await providerRequest(env, cfg, xtreamApiUrl(cfg, { action: 'get_series_info', series_id: seriesId }), 70000);
  const data = (await r.json().catch(() => null)) as any;
  const groups = data?.episodes ? (Array.isArray(data.episodes) ? data.episodes : Object.values(data.episodes)) : [];
  const out: Episode[] = [];
  for (const group of groups as any[])
    for (const e of Array.isArray(group) ? group : []) {
      const season = Number(e.season ?? e.season_number);
      const episode = Number(e.episode_num ?? e.episode);
      if (!e.id || !Number.isFinite(season) || !Number.isFinite(episode)) continue;
      const rel = String(e.info?.releasedate || e.info?.air_date || '');
      out.push({
        id: String(e.id),
        season,
        episode,
        title: String(e.title || `Episode ${episode}`),
        ext: String(e.container_extension || 'mp4'),
        plot: e.info?.plot || undefined,
        image: /^https?:\/\//.test(String(e.info?.movie_image || '')) ? e.info.movie_image : undefined,
        released: /^\d{4}-\d{2}-\d{2}/.test(rel) ? new Date(rel.slice(0, 10)).toISOString() : undefined,
      });
    }
  return out.sort((a, b) => a.season - b.season || a.episode - b.episode);
}

function stream(url: string, library: string, detail: string) {
  return {
    name: 'VODStack',
    title: [library, detail].filter(Boolean).join(' · '),
    url,
    behaviorHints: { notWebReady: true, bingeGroup: 'vodstack' },
  };
}

export async function handleAddon(env: Env, path: string, ctx?: Ctx): Promise<Response | null> {
  const m = path.match(/^\/addon\/([^/]+)\/(manifest\.json|(catalog|meta|stream)\/(movie|series)\/([^/]+?)(?:\/([^/]+))?\.json)$/);
  if (!m) return null;
  const owner = await setupByAddonToken(env, m[1]);
  if (!owner) return json({ error: 'Invalid addon token.' }, 401);
  const setupId = owner.id;
  const lib = await getLibrary(env, setupId);
  const resource = m[3];
  const type = m[4] as 'movie' | 'series';
  let id = m[5] || '';
  try {
    id = decodeURIComponent(id);
  } catch {}
  const extra = parseExtra(m[6]);
  // The owner's "What family sees" switches (full metadata only, English only, …).
  const META = lib ? visibleFilter(lib) : '';
  const filtered = META !== '';

  if (m[2] === 'manifest.json') {
    // Hidden, empty and merged-away categories are left out, so Nuvio doesn't request rows nobody sees.
    const cats = lib ? (await catalogsFor(env, lib.owner_setup_id, lib.id)).filter((c) => !c.hidden && !c.mergedInto && (filtered ? c.visibleCount : c.item_count) > 0) : [];
    return cached(
      {
        id: 'com.vodstack.addon',
        version: '0.4.0',
        name: 'VODStack',
        description: lib ? `${lib.name}: movies and series, with search.` : 'Your IPTV provider’s movies and series.',
        types: ['movie', 'series'],
        idPrefixes: ['tt', 'vodstack'],
        resources: [
          'catalog',
          { name: 'meta', types: ['movie', 'series'], idPrefixes: ['vodstack'] },
          { name: 'stream', types: ['movie', 'series'], idPrefixes: ['tt', 'vodstack'] },
        ],
        catalogs: [
          ...cats.map((c) => ({ type: c.media_type, id: `vodstack_${c.id}`, name: c.name, extra: [{ name: 'skip', isRequired: false }] })),
          // Search results are grouped under these names in Nuvio.
          { type: 'movie', id: 'vodstack_search', name: 'Movies', extra: [{ name: 'search', isRequired: true }] },
          { type: 'series', id: 'vodstack_search', name: 'Series', extra: [{ name: 'search', isRequired: true }] },
        ],
        behaviorHints: { configurable: false, configurationRequired: false },
      },
      300,
    );
  }
  if (!lib) return json(resource === 'catalog' ? { metas: [] } : resource === 'meta' ? { meta: null } : { streams: [] });

  if (resource === 'catalog') {
    if (id === 'vodstack_search') {
      const q = norm(String(extra.search || '')).slice(0, 60);
      if (!q) return json({ metas: [] });
      const prefix = lib.id.slice(0, 8) + ' ';
      const rows = (
        await env.DB.prepare(
          `SELECT ${ITEM_COLS} FROM (SELECT DISTINCT item_id FROM search_terms WHERE term >= ?1 AND term < ?2 LIMIT 300) t
           CROSS JOIN vod_items v ON v.id=t.item_id WHERE v.library_id=?3 AND v.media_type=?4 AND v.is_available=1${META}`,
        )
          .bind(prefix + q, prefix + q + '~', lib.id, type)
          .all<ItemRow>()
      ).results;
      // Leave out categories the library owner hid (a tiny read: only the owner's changed rows).
      const [hiddenRows, mergedRows] = await Promise.all([
        env.DB.prepare('SELECT catalog_id FROM catalog_prefs WHERE setup_id=? AND is_hidden=1').bind(lib.owner_setup_id).raw<[number]>(),
        env.DB.prepare('SELECT id,merged_into FROM catalogs WHERE library_id=? AND merged_into IS NOT NULL').bind(lib.id).raw<[number, number]>(),
      ]);
      const hiddenSet = new Set(hiddenRows.map((r) => r[0]));
      const mergedTo = new Map(mergedRows.map((r) => [r[0], r[1]]));
      const hidden = { has: (catalogId: number) => hiddenSet.has(mergedTo.get(catalogId) ?? catalogId) };
      const rank = (x: ItemRow) => {
        const t = norm(displayTitle(x.title));
        return (t === q ? 0 : t.startsWith(q) ? 1 : 2) * 2 + (x.imdb_id ? 0 : 1);
      };
      const list = rows.filter((r) => !hidden.has(r.catalog_id!)).sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title));
      return cached({ metas: dedupe(list.map(metaPreview)).slice(0, PAGE) }, 600);
    }
    const catalogId = Number(id.replace(/^vodstack_/, ''));
    const cat = await env.DB.prepare(
      'SELECT c.id,c.is_merge,c.title_order,c.smart_json,c.smart_ids,c.smart_at,c.shuffle_ids,c.shuffle_at,p.is_hidden FROM catalogs c LEFT JOIN catalog_prefs p ON p.setup_id=? AND p.catalog_id=c.id WHERE c.id=? AND c.library_id=?',
    )
      .bind(lib.owner_setup_id, catalogId, lib.id)
      .first<{
        id: number;
        is_merge: number;
        title_order: string;
        smart_json: string | null;
        smart_ids: string | null;
        smart_at: number | null;
        shuffle_ids: string | null;
        shuffle_at: number | null;
        is_hidden: number | null;
      }>();
    if (!cat || cat.is_hidden) return json({ metas: [] });
    const skip = Math.max(0, Math.min(50000, Number(extra.skip) || 0));
    // "Newest first" walks the (catalog_id) index backwards; A–Z walks (catalog_id, title).
    const recent = cat.title_order === 'recent';
    // A–Z walks the (catalog_id, sort_title) index: clean titles, ignoring a leading "The".
    const ORDER = recent ? 'ORDER BY v.id DESC' : 'ORDER BY v.sort_title';
    if (cat.smart_json) {
      // Smart row: TMDB's order, cached on the row (the cron keeps it fresh; first view fills it).
      let ids: number[] = JSON.parse(cat.smart_ids || '[]');
      if (!cat.smart_at)
        try {
          await refreshSmartRow(env, { id: cat.id, library_id: lib.id, smart_json: cat.smart_json }, lib.owner_setup_id);
          const again = await env.DB.prepare('SELECT smart_ids FROM catalogs WHERE id=?').bind(cat.id).first<{ smart_ids: string }>();
          ids = JSON.parse(again?.smart_ids || '[]');
        } catch {}
      const page = ids.slice(skip, skip + PAGE);
      if (!page.length) return cached({ metas: [] }, 900);
      const rows = (
        await env.DB.prepare(
          `SELECT ${ITEM_COLS} FROM vod_items v WHERE v.id IN (SELECT value FROM json_each(?)) AND v.is_available=1${META} AND ${NOT_HIDDEN_EVERYWHERE}`,
        )
          .bind(JSON.stringify(page), lib.owner_setup_id, lib.id)
          .all<ItemRow>()
      ).results;
      const byId = new Map(rows.map((r) => [r.id, r]));
      return cached({ metas: dedupe(page.map((i) => byId.get(i)).filter((r): r is ItemRow => !!r).map(metaPreview)) }, 900);
    }
    if (cat.title_order === 'shuffle') {
      // A random order that changes every 4 hours. Worked out once per window (reads the row's titles
      // once), stored on the row, then each page reads only its 100 titles.
      const win = shuffleWindow();
      let ids: number[] | null = cat.shuffle_at === win && cat.shuffle_ids ? JSON.parse(cat.shuffle_ids) : null;
      if (!ids) {
        const cats = cat.is_merge
          ? (await env.DB.prepare('SELECT id FROM catalogs WHERE merged_into=? AND library_id=?').bind(catalogId, lib.id).raw<[number]>()).map((r) => r[0])
          : [catalogId];
        const rows = await env.DB.prepare(
          `SELECT v.id,v.imdb_id FROM vod_items v WHERE v.catalog_id IN (SELECT value FROM json_each(?)) AND v.is_available=1${META} ORDER BY v.id`,
        )
          .bind(JSON.stringify(cats))
          .raw<[number, string | null]>();
        // One entry per title, even if it's in several merged categories.
        const seen = new Set<string>();
        ids = rows.filter(([id, imdb]) => (imdb ? (seen.has(imdb) ? false : (seen.add(imdb), true)) : true)).map(([id]) => id);
        // Same shuffle for everyone in this window (seeded), so pages line up.
        let seed = (win * 2654435761 + catalogId * 40503) >>> 0;
        const rand = () => {
          seed = (seed + 0x6d2b79f5) >>> 0;
          let t = seed;
          t = Math.imul(t ^ (t >>> 15), t | 1);
          t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
        for (let i = ids.length - 1; i > 0; i--) {
          const j = Math.floor(rand() * (i + 1));
          [ids[i], ids[j]] = [ids[j], ids[i]];
        }
        await env.DB.prepare('UPDATE catalogs SET shuffle_ids=?,shuffle_at=? WHERE id=?').bind(JSON.stringify(ids), win, catalogId).run();
      }
      const page = ids.slice(skip, skip + PAGE);
      if (!page.length) return cached({ metas: [] }, 900);
      const rows = (
        await env.DB.prepare(`SELECT ${ITEM_COLS} FROM vod_items v WHERE v.id IN (SELECT value FROM json_each(?)) AND v.is_available=1${META}`)
          .bind(JSON.stringify(page))
          .all<ItemRow>()
      ).results;
      const byId = new Map(rows.map((r) => [r.id, r]));
      return cached({ metas: dedupe(page.map((i) => byId.get(i)).filter((r): r is ItemRow => !!r).map(metaPreview)) }, 900);
    }
    if (cat.is_merge) {
      // Read the first skip+100 titles of each merged category (index order), then interleave them.
      const members = (
        await env.DB.prepare('SELECT id FROM catalogs WHERE merged_into=? AND library_id=?').bind(catalogId, lib.id).raw<[number]>()
      ).map((r) => r[0]);
      const lists = await Promise.all(
        members.map((mid) =>
          env.DB.prepare(`SELECT ${ITEM_COLS} FROM vod_items v WHERE v.catalog_id=? AND v.is_available=1${META} ${ORDER} LIMIT ?`)
            .bind(mid, skip + PAGE)
            .all<ItemRow>()
            .then((r) => r.results),
        ),
      );
      const merged = dedupe(
        lists
          .flat()
          .sort((a, b) => (recent ? b.id - a.id : byKey(a, b)))
          .map(metaPreview),
      );
      return cached({ metas: merged.slice(skip, skip + PAGE) }, 1800);
    }
    // Walks the (catalog_id, title) index: reads only the titles on this page (plus any skipped).
    const rows = (
      await env.DB.prepare(`SELECT ${ITEM_COLS} FROM vod_items v WHERE v.catalog_id=? AND v.is_available=1${META} ${ORDER} LIMIT ? OFFSET ?`)
        .bind(catalogId, PAGE, skip)
        .all<ItemRow>()
    ).results;
    return cached({ metas: dedupe(rows.map(metaPreview)) }, 1800);
  }

  if (resource === 'meta') {
    const n = Number((id.match(/^vodstack:(\d+)$/) || [])[1]);
    const item = n
      ? await env.DB.prepare(`SELECT ${ITEM_COLS},v.provider_item_id FROM vod_items v WHERE v.id=? AND v.library_id=? AND v.is_available=1`)
          .bind(n, lib.id)
          .first<ItemRow & { provider_item_id: string }>()
      : null;
    if (!item) return json({ meta: null }, 404);
    const meta: Record<string, unknown> = { ...metaPreview(item), id: `vodstack:${item.id}`, background: item.tmdb_poster || item.poster_url || undefined };
    if (item.media_type === 'series') {
      if (lib.kind === 'xtream') {
        const cfg = await getLogin(env, setupId, lib.id);
        const eps = cfg ? await seriesEpisodes(env, cfg, item.provider_item_id, lib.id, ctx) : [];
        meta.videos = eps.map((e) => ({
          id: `vodstack:${item.id}:ep:${e.id}:${e.ext.replace(/[^a-z0-9]/gi, '')}`,
          title: e.title,
          season: e.season,
          episode: e.episode,
          overview: e.plot,
          thumbnail: e.image,
          released: e.released,
        }));
      } else {
        // M3U lists each episode as its own entry.
        const se = item.title.match(/\bS(\d{1,2})\s?E(\d{1,3})\b/i);
        meta.videos = [{ id: `vodstack:${item.id}`, title: displayTitle(item.title), season: se ? Number(se[1]) : 1, episode: se ? Number(se[2]) : 1 }];
      }
    }
    return cached({ meta }, 3600);
  }

  // ---- streams: built from the viewer's own login ----
  const cfg = await getLogin(env, setupId, lib.id);
  if (!cfg) return json({ streams: [] });
  const streams: ReturnType<typeof stream>[] = [];
  const own = id.match(/^vodstack:(\d+)(?::ep:([^:]+):([a-z0-9]{1,8}))?$/i);
  if (own) {
    if (own[2]) {
      if (lib.kind === 'xtream') streams.push(stream(xtreamStreamUrl(cfg, 'series', own[2], own[3]), lib.name, ''));
      return json({ streams });
    }
    const item = await env.DB.prepare('SELECT provider_item_id,playback_ref FROM vod_items WHERE id=? AND library_id=? AND is_available=1')
      .bind(Number(own[1]), lib.id)
      .first<{ provider_item_id: string; playback_ref: string | null }>();
    const url = item && playbackUrl(lib.kind, cfg, item.playback_ref || '', item.provider_item_id);
    if (url) streams.push(stream(url, lib.name, ''));
    return json({ streams });
  }

  const tt = id.match(/^(tt\d+)(?::(\d+):(\d+))?$/);
  if (!tt) return json({ streams });
  const rows = (
    await env.DB.prepare(
      `SELECT v.provider_item_id,v.playback_ref,c.source_category_name AS cat FROM vod_items v CROSS JOIN catalogs c ON c.id=v.catalog_id
       WHERE v.imdb_id=? AND v.library_id=? AND v.media_type=? AND v.is_available=1${META} AND ${NOT_HIDDEN_EVERYWHERE} LIMIT 6`,
    )
      .bind(tt[1], lib.id, type, lib.owner_setup_id, lib.id)
      .all<{ provider_item_id: string; playback_ref: string | null; cat: string }>()
  ).results;
  const done = new Set<string>();
  for (const r of rows) {
    if (done.has(r.provider_item_id)) continue; // same title listed in several categories
    done.add(r.provider_item_id);
    if (type === 'movie') {
      const url = playbackUrl(lib.kind, cfg, r.playback_ref || '', r.provider_item_id);
      if (url) streams.push(stream(url, lib.name, r.cat));
    } else if (lib.kind === 'xtream' && tt[2]) {
      try {
        const ep = (await seriesEpisodes(env, cfg, r.provider_item_id, lib.id, ctx)).find((e) => e.season === Number(tt[2]) && e.episode === Number(tt[3]));
        if (ep) streams.push(stream(xtreamStreamUrl(cfg, 'series', ep.id, ep.ext), lib.name, `S${tt[2]} E${tt[3]}`));
      } catch {
        // Provider unreachable for this one.
      }
    }
    if (streams.length >= 4) break;
  }
  return json({ streams });
}
