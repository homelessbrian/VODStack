// Stremio-style addon that Nuvio installs from the manifest URL.
//
// - Titles matched to IMDb are served under their real ID (tt…), so Nuvio shows its own
//   normal metadata for them and asks this addon for the stream.
// - Unmatched titles use "vodstack:<n>" IDs and get metadata from what the provider supplied.
// - Search catalogs only return what the provider actually has.
// - Series episodes come from the provider's get_series_info, fetched only when needed.
import {
  decrypt,
  json,
  m3uCredentials,
  providerRequest,
  setupByAddonToken,
  xtreamApiUrl,
  xtreamStreamUrl,
  type Env,
  type SourceConfig,
  type SourceKind,
} from './lib';
import { cleanTitle, displayTitle, norm } from './tmdb';

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
};
const ITEM_COLS = 'v.id,v.title,v.year,v.poster_url,v.tmdb_poster,v.overview,v.media_type,v.imdb_id';

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
function dedupe<T extends { id: string }>(list: T[]) {
  const seen = new Set<string>();
  return list.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
}
function parseExtra(extra: string | undefined) {
  const out: Record<string, string> = {};
  if (!extra) return out;
  for (const part of extra.split('&')) {
    const i = part.indexOf('=');
    if (i > 0)
      try {
        out[decodeURIComponent(part.slice(0, i))] = decodeURIComponent(part.slice(i + 1));
      } catch {}
  }
  return out;
}

type SourceInfo = { kind: SourceKind; cfg: SourceConfig; name: string };
async function loadSource(env: Env, cache: Map<string, SourceInfo | null>, sourceId: string) {
  if (cache.has(sourceId)) return cache.get(sourceId)!;
  const s = await env.DB.prepare('SELECT kind,name,encrypted_config FROM sources WHERE id=?')
    .bind(sourceId)
    .first<{ kind: SourceKind; name: string; encrypted_config: string }>();
  const info = s ? { kind: s.kind, name: s.name, cfg: await decrypt<SourceConfig>(env, s.encrypted_config) } : null;
  cache.set(sourceId, info);
  return info;
}

type Episode = { id: string; season: number; episode: number; title: string; ext: string; plot?: string; image?: string; released?: string };
/** One provider request: the episode list for an Xtream series. */
async function seriesEpisodes(env: Env, cfg: SourceConfig, seriesId: string): Promise<Episode[]> {
  const r = await providerRequest(env, cfg, xtreamApiUrl(cfg, { action: 'get_series_info', series_id: seriesId }), 30000);
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

function stream(url: string, source: string, detail: string, sourceId: string) {
  return {
    name: 'VODStack',
    title: [source, detail].filter(Boolean).join(' · '),
    url,
    behaviorHints: { notWebReady: true, bingeGroup: `vodstack-${sourceId}` },
  };
}
function playbackUrl(info: SourceInfo, ref: string, providerItemId: string) {
  if (ref.startsWith('xt:') && info.kind === 'xtream') return xtreamStreamUrl(info.cfg, 'movie', providerItemId, ref.slice(3));
  if (ref.startsWith('url:')) {
    const creds = m3uCredentials(info.cfg);
    let u = ref.slice(4);
    if (creds) u = u.split('{u}').join(creds.username).split('{p}').join(creds.password);
    return u;
  }
  return null;
}

export async function handleAddon(env: Env, path: string): Promise<Response | null> {
  const m = path.match(/^\/addon\/([^/]+)\/(manifest\.json|(catalog|meta|stream)\/(movie|series)\/([^/]+?)(?:\/([^/]+))?\.json)$/);
  if (!m) return null;
  const owner = await setupByAddonToken(env, m[1]);
  if (!owner) return json({ error: 'Invalid addon token.' }, 401);
  const setupId = owner.id;
  const resource = m[3];
  const type = m[4] as 'movie' | 'series';
  let id = m[5] || '';
  try {
    id = decodeURIComponent(id);
  } catch {}
  const extra = parseExtra(m[6]);

  if (m[2] === 'manifest.json') {
    const cats = await env.DB.prepare(
      'SELECT id,display_name,media_type FROM catalogs WHERE setup_id=? AND is_hidden=0 ORDER BY sort_order,display_name',
    )
      .bind(setupId)
      .all<{ id: string; display_name: string; media_type: string }>();
    return json({
      id: 'com.vodstack.addon',
      version: '0.2.0',
      name: 'VODStack',
      description: 'Your IPTV provider’s movies and series, with search.',
      types: ['movie', 'series'],
      idPrefixes: ['tt', 'vodstack'],
      resources: [
        'catalog',
        { name: 'meta', types: ['movie', 'series'], idPrefixes: ['vodstack'] },
        { name: 'stream', types: ['movie', 'series'], idPrefixes: ['tt', 'vodstack'] },
      ],
      catalogs: [
        ...cats.results.map((c) => ({
          type: c.media_type === 'series' ? 'series' : 'movie',
          id: `vodstack_${c.id}`,
          name: c.display_name,
          extra: [{ name: 'skip', isRequired: false }],
        })),
        { type: 'movie', id: 'vodstack_search', name: 'VODStack', extra: [{ name: 'search', isRequired: true }] },
        { type: 'series', id: 'vodstack_search', name: 'VODStack', extra: [{ name: 'search', isRequired: true }] },
      ],
      behaviorHints: { configurable: false, configurationRequired: false },
    });
  }

  if (resource === 'catalog') {
    if (id === 'vodstack_search') {
      const q = String(extra.search || '').trim().slice(0, 100);
      const words = norm(q).split(' ').filter(Boolean).slice(0, 6);
      if (!words.length) return json({ metas: [] });
      // Each word must appear in the title. Hidden categories are left out of search too.
      const like = (w: string) => '%' + w.replace(/[\\%_]/g, (c) => '\\' + c) + '%';
      const rows = (
        await env.DB.prepare(
          `SELECT ${ITEM_COLS} FROM vod_items v JOIN catalogs c ON c.id=v.catalog_id AND c.is_hidden=0
           WHERE v.setup_id=? AND v.media_type=? AND v.is_available=1 AND ${words.map(() => "COALESCE(v.search_text,lower(v.title)) LIKE ? ESCAPE '\\'").join(' AND ')}
           LIMIT 300`,
        )
          .bind(setupId, type, ...words.map(like))
          .all<ItemRow>()
      ).results;
      const nq = norm(q);
      const rank = (x: ItemRow) => {
        const t = norm(displayTitle(x.title));
        return (t === nq ? 0 : t.startsWith(nq) ? 1 : 2) * 2 + (x.imdb_id ? 0 : 1);
      };
      rows.sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title));
      return json({ metas: dedupe(rows.map(metaPreview)).slice(0, PAGE) });
    }
    const skip = Math.max(0, Math.min(100000, Number(extra.skip) || 0));
    const rows = (
      await env.DB.prepare(
        `SELECT ${ITEM_COLS} FROM vod_items v JOIN catalogs c ON c.id=v.catalog_id
         WHERE c.setup_id=? AND c.id=? AND c.is_hidden=0 AND v.is_available=1 ORDER BY v.title LIMIT ? OFFSET ?`,
      )
        .bind(setupId, id.replace(/^vodstack_/, ''), PAGE, skip)
        .all<ItemRow>()
    ).results;
    return json({ metas: dedupe(rows.map(metaPreview)) });
  }

  const sources = new Map<string, SourceInfo | null>();

  if (resource === 'meta') {
    const n = Number((id.match(/^vodstack:(\d+)$/) || [])[1]);
    const item = n
      ? await env.DB.prepare(
          `SELECT ${ITEM_COLS},v.source_id,v.provider_item_id FROM vod_items v WHERE v.setup_id=? AND v.id=? AND v.is_available=1`,
        )
          .bind(setupId, n)
          .first<ItemRow & { source_id: string; provider_item_id: string }>()
      : null;
    if (!item) return json({ meta: null }, 404);
    const meta: Record<string, unknown> = { ...metaPreview(item), id: `vodstack:${item.id}`, background: item.tmdb_poster || item.poster_url || undefined };
    if (item.media_type === 'series') {
      const src = await loadSource(env, sources, item.source_id);
      if (src?.kind === 'xtream') {
        const eps = await seriesEpisodes(env, src.cfg, item.provider_item_id);
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
    return json({ meta });
  }

  // ---- streams ----
  const streams: ReturnType<typeof stream>[] = [];
  const own = id.match(/^vodstack:(\d+)(?::ep:([^:]+):([a-z0-9]{1,8}))?$/i);
  if (own) {
    const item = await env.DB.prepare(
      `SELECT v.id,v.source_id,v.provider_item_id,v.playback_ref,v.media_type,c.display_name FROM vod_items v JOIN catalogs c ON c.id=v.catalog_id WHERE v.setup_id=? AND v.id=? AND v.is_available=1`,
    )
      .bind(setupId, Number(own[1]))
      .first<{ id: number; source_id: string; provider_item_id: string; playback_ref: string | null; media_type: string; display_name: string }>();
    const src = item && (await loadSource(env, sources, item.source_id));
    if (item && src) {
      const url = own[2]
        ? src.kind === 'xtream'
          ? xtreamStreamUrl(src.cfg, 'series', own[2], own[3])
          : null
        : playbackUrl(src, item.playback_ref || '', item.provider_item_id);
      if (url) streams.push(stream(url, src.name, item.display_name, item.source_id));
    }
    return json({ streams });
  }

  const tt = id.match(/^(tt\d+)(?::(\d+):(\d+))?$/);
  if (!tt) return json({ streams });
  const rows = (
    await env.DB.prepare(
      `SELECT v.id,v.source_id,v.provider_item_id,v.playback_ref,c.display_name FROM vod_items v JOIN catalogs c ON c.id=v.catalog_id
       WHERE v.setup_id=? AND v.imdb_id=? AND v.media_type=? AND v.is_available=1 LIMIT 6`,
    )
      .bind(setupId, tt[1], type)
      .all<{ id: number; source_id: string; provider_item_id: string; playback_ref: string | null; display_name: string }>()
  ).results;
  const done = new Set<string>();
  for (const r of rows) {
    const key = r.source_id + '|' + r.provider_item_id;
    if (done.has(key)) continue; // same title listed in several categories
    done.add(key);
    const src = await loadSource(env, sources, r.source_id);
    if (!src) continue;
    if (type === 'movie') {
      const url = playbackUrl(src, r.playback_ref || '', r.provider_item_id);
      if (url) streams.push(stream(url, src.name, r.display_name, r.source_id));
    } else if (src.kind === 'xtream' && tt[2]) {
      try {
        const ep = (await seriesEpisodes(env, src.cfg, r.provider_item_id)).find(
          (e) => e.season === Number(tt[2]) && e.episode === Number(tt[3]),
        );
        if (ep) streams.push(stream(xtreamStreamUrl(src.cfg, 'series', ep.id, ep.ext), src.name, `S${tt[2]} E${tt[3]}`, r.source_id));
      } catch {
        // Provider unreachable for this one; other sources may still work.
      }
    }
    if (streams.length >= 4) break;
  }
  return json({ streams });
}
