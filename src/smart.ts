// Smart rows: a TMDB list filtered down to the titles the provider actually has.
//
// Two kinds:
// - Preset lists (Trending today, Popular, Top rated, …).
// - Custom rows the owner builds: genres, years, sort, minimum rating, language, age rating and a
//   size ("Top 25 Action movies from the 90s"). Custom rows keep walking TMDB's results until they
//   have found that many titles the library has (at most 10 pages).
//
// The result is cached on the row and refreshed every few hours by the cron (or on first view), so
// Nuvio never waits on TMDB. A refresh costs ≤10 TMDB calls and one indexed lookup per page.
import { decrypt, HttpError, type Env, type MediaType } from './lib';
import { tmdbBase } from './tmdb';

export type CustomFilters = {
  genres: number[];
  genreMode: 'all' | 'any';
  yearFrom?: number;
  yearTo?: number;
  sort: 'popular' | 'rating' | 'votes' | 'newest' | 'oldest' | 'revenue';
  minRating?: number;
  language?: string;
  maxCert?: string;
  limit: number;
};
export type SmartDef = { list: string; type: MediaType; genre?: number; custom?: CustomFilters };
export const SMART_STALE_SECONDS = 6 * 3600;

/** Preset lists. `movie` / `series` are the TMDB endpoints. */
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
export const LANGUAGES: Record<string, string> = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese', ja: 'Japanese',
  ko: 'Korean', zh: 'Chinese', hi: 'Hindi', ar: 'Arabic', ru: 'Russian', tr: 'Turkish', nl: 'Dutch', sv: 'Swedish',
};
export const CERTS = ['G', 'PG', 'PG-13', 'R']; // US movie ratings
const SORTS: Record<CustomFilters['sort'], { label: string; movie: string; series: string }> = {
  popular: { label: 'Most popular', movie: 'popularity.desc', series: 'popularity.desc' },
  rating: { label: 'Highest rated', movie: 'vote_average.desc', series: 'vote_average.desc' },
  votes: { label: 'Most voted', movie: 'vote_count.desc', series: 'vote_count.desc' },
  newest: { label: 'Newest', movie: 'primary_release_date.desc', series: 'first_air_date.desc' },
  oldest: { label: 'Oldest', movie: 'primary_release_date.asc', series: 'first_air_date.asc' },
  revenue: { label: 'Biggest box office', movie: 'revenue.desc', series: 'popularity.desc' },
};
export const SORT_LABELS = Object.fromEntries(Object.entries(SORTS).map(([k, v]) => [k, v.label]));

const int = (v: unknown, lo: number, hi: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= lo && n <= hi ? n : undefined;
};
function validCustom(x: any, type: MediaType): CustomFilters | null {
  const genres = (Array.isArray(x?.genres) ? x.genres : []).map(Number).filter((g: number) => GENRES[type][g]).slice(0, 6);
  const sort = (x?.sort in SORTS ? x.sort : 'popular') as CustomFilters['sort'];
  let yearFrom = int(x?.yearFrom, 1900, 2100);
  let yearTo = int(x?.yearTo, 1900, 2100);
  if (yearFrom && yearTo && yearFrom > yearTo) [yearFrom, yearTo] = [yearTo, yearFrom];
  const c: CustomFilters = {
    genres,
    genreMode: x?.genreMode === 'any' ? 'any' : 'all',
    sort: type === 'series' && sort === 'revenue' ? 'popular' : sort,
    limit: int(x?.limit, 5, 100) || 25,
  };
  if (yearFrom) c.yearFrom = yearFrom;
  if (yearTo) c.yearTo = yearTo;
  const minRating = Number(x?.minRating);
  if (minRating > 0 && minRating <= 9.5) c.minRating = Math.round(minRating * 2) / 2;
  if (LANGUAGES[x?.language]) c.language = x.language;
  if (type === 'movie' && CERTS.includes(x?.maxCert)) c.maxCert = x.maxCert;
  return c;
}
export function validSmartDef(x: any): SmartDef | null {
  const type: MediaType | null = x?.type === 'movie' || x?.type === 'series' ? x.type : null;
  if (!type) return null;
  if (x?.list === 'custom') {
    const custom = validCustom(x.custom || x, type);
    return custom ? { list: 'custom', type, custom } : null;
  }
  const list = SMART_LISTS[String(x?.list)];
  if (!list || !list[type]) return null;
  if (list.discover) {
    const genre = Number(x.genre);
    if (!GENRES[type][genre]) return null;
    return { list: String(x.list), type, genre };
  }
  return { list: String(x.list), type };
}
/** A readable default name, e.g. "Top 25 Action Movies · 1990–1999". */
export function smartLabel(def: SmartDef) {
  const kind = def.type === 'movie' ? 'Movies' : 'Series';
  if (def.list === 'custom' && def.custom) {
    const c = def.custom;
    const g = c.genres.map((id) => GENRES[def.type][id]).join(c.genreMode === 'any' ? ' or ' : ' & ');
    const lead = { popular: 'Top', rating: 'Best rated', votes: 'Most voted', newest: 'Newest', oldest: 'Classic', revenue: 'Biggest' }[c.sort];
    const years =
      c.yearFrom && c.yearTo ? (c.yearFrom === c.yearTo ? ` · ${c.yearFrom}` : ` · ${c.yearFrom}–${c.yearTo}`) : c.yearFrom ? ` · since ${c.yearFrom}` : c.yearTo ? ` · up to ${c.yearTo}` : '';
    return `${lead} ${c.limit} ${g ? g + ' ' : ''}${kind}${years}${c.language ? ` · ${LANGUAGES[c.language]}` : ''}`.trim();
  }
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

function pageUrl(env: Env, apiKey: string, def: SmartDef, page: number) {
  const discover = def.list === 'custom' || SMART_LISTS[def.list].discover;
  const path = def.list === 'custom' ? (def.type === 'movie' ? '/discover/movie' : '/discover/tv') : SMART_LISTS[def.list][def.type]!;
  const u = new URL(tmdbBase(env) + path);
  u.searchParams.set('api_key', apiKey);
  u.searchParams.set('page', String(page));
  if (!discover) return u;
  u.searchParams.set('include_adult', 'false');
  if (def.list === 'genre') {
    u.searchParams.set('with_genres', String(def.genre));
    u.searchParams.set('sort_by', 'popularity.desc');
    u.searchParams.set('vote_count.gte', '50');
    return u;
  }
  const c = def.custom!;
  const movie = def.type === 'movie';
  u.searchParams.set('sort_by', SORTS[c.sort][def.type]);
  if (c.genres.length) u.searchParams.set('with_genres', c.genres.join(c.genreMode === 'any' ? '|' : ','));
  const dateKey = movie ? 'primary_release_date' : 'first_air_date';
  if (c.yearFrom) u.searchParams.set(`${dateKey}.gte`, `${c.yearFrom}-01-01`);
  if (c.yearTo) u.searchParams.set(`${dateKey}.lte`, `${c.yearTo}-12-31`);
  if (c.minRating) u.searchParams.set('vote_average.gte', String(c.minRating));
  // Rating sorts are dominated by obscure titles with three votes unless we require some votes.
  u.searchParams.set('vote_count.gte', c.sort === 'rating' || c.minRating ? '200' : '20');
  if (c.language) u.searchParams.set('with_original_language', c.language);
  if (movie && c.maxCert) {
    u.searchParams.set('certification_country', 'US');
    u.searchParams.set('certification.lte', c.maxCert);
  }
  return u;
}

/** Walk the TMDB list and return this library's matching titles, in TMDB's order. */
export async function buildSmartIds(env: Env, def: SmartDef, libraryId: string, ownerSetupId: string) {
  const apiKey = await tmdbKey(env, ownerSetupId);
  const custom = def.list === 'custom';
  const want = custom ? def.custom!.limit : Infinity;
  const maxPages = custom ? 10 : 5;
  const ids: number[] = [];
  const seen = new Set<number>();
  for (let page = 1; page <= maxPages && ids.length < want; page++) {
    const r = await fetch(pageUrl(env, apiKey, def, page).toString(), { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
    if (!r.ok) {
      if (page === 1) throw new HttpError(502, `TMDB returned HTTP ${r.status} for this list. Try again later.`);
      break;
    }
    const d = (await r.json()) as { results?: { id: number }[]; total_pages?: number };
    const tmdbIds = (d.results || []).map((x) => x.id).filter((x) => Number.isInteger(x));
    if (tmdbIds.length) {
      // One indexed lookup per page. Several provider entries can share a TMDB ID; keep one.
      const found = (
        await env.DB.prepare(
          `SELECT v.id,v.tmdb_id FROM vod_items v WHERE v.tmdb_id IN (SELECT value FROM json_each(?1))
           AND v.library_id=?2 AND v.media_type=?3 AND v.is_available=1`,
        )
          .bind(JSON.stringify(tmdbIds), libraryId, def.type)
          .raw<[number, number]>()
      ).reduce((m, [id, t]) => (m.has(t) ? m : m.set(t, id)), new Map<number, number>());
      for (const t of tmdbIds) {
        const id = found.get(t);
        if (id && !seen.has(id)) {
          seen.add(id);
          ids.push(id);
        }
      }
    }
    if (!d.total_pages || page >= d.total_pages) break;
  }
  return custom ? ids.slice(0, want) : ids;
}

/** Re-fetch one smart row's TMDB list and cache the matching titles on the row. */
export async function refreshSmartRow(env: Env, row: { id: number; library_id: string; smart_json: string }, ownerSetupId: string) {
  const def = validSmartDef(JSON.parse(row.smart_json));
  if (!def) throw new HttpError(400, 'This smart row has an unknown list.');
  const ids = await buildSmartIds(env, def, row.library_id, ownerSetupId);
  await env.DB.prepare('UPDATE catalogs SET smart_ids=?,smart_at=?,item_count=? WHERE id=? AND library_id=?')
    .bind(JSON.stringify(ids), Math.floor(Date.now() / 1000), ids.length, row.id, row.library_id)
    .run();
  return ids.length;
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
