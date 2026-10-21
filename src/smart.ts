// Smart rows: a TMDB list (trending, popular, a genre…) filtered down to the titles the
// provider actually has. The result is cached on the row and refreshed every few hours by the
// cron trigger (or on first view), so Nuvio never waits on TMDB.
//
// Cost per refresh: up to 5 TMDB calls (100 titles) + one indexed lookup by TMDB ID.
import { decrypt, HttpError, type Env, type MediaType } from './lib';
import { tmdbBase } from './tmdb';

export type SmartDef = { list: string; type: MediaType; genre?: number };
export const SMART_STALE_SECONDS = 6 * 3600;

/** The lists on offer. `path` is the TMDB endpoint for movies / series. */
export const SMART_LISTS: Record<string, { label: string; movie?: string; series?: string; discover?: boolean }> = {
  trending_day: { label: 'Trending today', movie: '/trending/movie/day', series: '/trending/tv/day' },
  trending_week: { label: 'Trending this week', movie: '/trending/movie/week', series: '/trending/tv/week' },
  popular: { label: 'Popular', movie: '/movie/popular', series: '/tv/popular' },
  top_rated: { label: 'Top rated', movie: '/movie/top_rated', series: '/tv/top_rated' },
  now_playing: { label: 'Now in theaters', movie: '/movie/now_playing' },
  on_the_air: { label: 'Airing now', series: '/tv/on_the_air' },
  genre: { label: 'Popular in a genre', movie: '/discover/movie', series: '/discover/tv', discover: true },
};
export const GENRES: Record<MediaType, Record<number, string>> = {
  movie: {
    28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 99: 'Documentary', 18: 'Drama',
    10751: 'Family', 14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance',
    878: 'Science Fiction', 53: 'Thriller', 10752: 'War', 37: 'Western',
  },
  series: {
    10759: 'Action & Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 99: 'Documentary', 18: 'Drama',
    10751: 'Family', 10762: 'Kids', 9648: 'Mystery', 10764: 'Reality', 10765: 'Sci-Fi & Fantasy', 10768: 'War & Politics', 37: 'Western',
  },
};
export function validSmartDef(x: any): SmartDef | null {
  const type: MediaType | null = x?.type === 'movie' || x?.type === 'series' ? x.type : null;
  const list = SMART_LISTS[String(x?.list)];
  if (!type || !list || !list[type]) return null;
  if (list.discover) {
    const genre = Number(x.genre);
    if (!GENRES[type][genre]) return null;
    return { list: String(x.list), type, genre };
  }
  return { list: String(x.list), type };
}
export function smartLabel(def: SmartDef) {
  const kind = def.type === 'movie' ? 'Movies' : 'Series';
  if (def.list === 'genre') return `Popular ${GENRES[def.type][def.genre!]} ${kind}`;
  return `${SMART_LISTS[def.list].label} · ${kind}`;
}

async function tmdbKey(env: Env, ownerSetupId: string) {
  const secret = await env.DB.prepare('SELECT encrypted_value FROM setup_secrets WHERE setup_id=? AND secret_name=?')
    .bind(ownerSetupId, 'tmdb_api_key')
    .first<{ encrypted_value: string }>();
  if (!secret) throw new HttpError(400, 'Smart rows need a TMDB key (Settings → TMDB matching).');
  return (await decrypt<{ apiKey: string }>(env, secret.encrypted_value)).apiKey;
}

/** Re-fetch one smart row's TMDB list and keep the titles this library has, in TMDB's order. */
export async function refreshSmartRow(env: Env, row: { id: number; library_id: string; smart_json: string }, ownerSetupId: string) {
  const def = validSmartDef(JSON.parse(row.smart_json));
  if (!def) throw new HttpError(400, 'This smart row has an unknown list.');
  const apiKey = await tmdbKey(env, ownerSetupId);
  const list = SMART_LISTS[def.list];
  const tmdbIds: number[] = [];
  for (let page = 1; page <= 5; page++) {
    const u = new URL(tmdbBase(env) + list[def.type]!);
    u.searchParams.set('api_key', apiKey);
    u.searchParams.set('page', String(page));
    if (list.discover) {
      u.searchParams.set('with_genres', String(def.genre));
      u.searchParams.set('sort_by', 'popularity.desc');
      u.searchParams.set('vote_count.gte', '50');
    }
    const r = await fetch(u.toString(), { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
    if (!r.ok) {
      if (page === 1) throw new HttpError(502, `TMDB returned HTTP ${r.status} for this list. Try again later.`);
      break;
    }
    const d = (await r.json()) as { results?: { id: number }[]; total_pages?: number };
    for (const x of d.results || []) if (Number.isInteger(x.id)) tmdbIds.push(x.id);
    if (!d.total_pages || page >= d.total_pages) break;
  }
  // One indexed lookup for all of them. Several provider entries can share a TMDB ID; keep one.
  const found = (
    await env.DB.prepare(
      `SELECT v.id,v.tmdb_id FROM vod_items v WHERE v.tmdb_id IN (SELECT value FROM json_each(?1))
       AND v.library_id=?2 AND v.media_type=?3 AND v.is_available=1`,
    )
      .bind(JSON.stringify(tmdbIds), row.library_id, def.type)
      .raw<[number, number]>()
  ).reduce((m, [id, t]) => (m.has(t) ? m : m.set(t, id)), new Map<number, number>());
  const ids = tmdbIds.map((t) => found.get(t)).filter((x): x is number => !!x);
  const unique = [...new Set(ids)];
  await env.DB.prepare('UPDATE catalogs SET smart_ids=?,smart_at=?,item_count=? WHERE id=? AND library_id=?')
    .bind(JSON.stringify(unique), Math.floor(Date.now() / 1000), unique.length, row.id, row.library_id)
    .run();
  return unique.length;
}

/** Cron: refresh a couple of the stalest smart rows each run (keeps each run small). */
export async function refreshStaleSmartRows(env: Env) {
  const cutoff = Math.floor(Date.now() / 1000) - SMART_STALE_SECONDS;
  const rows = (
    await env.DB.prepare(
      `SELECT c.id,c.library_id,c.smart_json,l.owner_setup_id FROM catalogs c CROSS JOIN libraries l ON l.id=c.library_id
       WHERE c.smart_json IS NOT NULL AND COALESCE(c.smart_at,0)<? ORDER BY COALESCE(c.smart_at,0) LIMIT 2`,
    )
      .bind(cutoff)
      .all<{ id: number; library_id: string; smart_json: string; owner_setup_id: string }>()
  ).results;
  for (const r of rows)
    try {
      await refreshSmartRow(env, r, r.owner_setup_id);
    } catch {
      // Keep the old list; try this row again in about 30 minutes rather than blocking the others.
      await env.DB.prepare('UPDATE catalogs SET smart_at=? WHERE id=?')
        .bind(Math.floor(Date.now() / 1000) - SMART_STALE_SECONDS + 1800, r.id)
        .run();
    }
}
