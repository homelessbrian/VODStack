// TMDB matching: link provider titles to real TMDB/IMDb IDs so Nuvio can show its normal
// metadata (posters, cast, trailers) for them.
//
// Workers Free allows 50 subrequests per request, so the browser sends small batches of
// item IDs (MATCH_BATCH) and each batch costs at most 3 TMDB calls per title plus 3 D1 calls.
import { decrypt, json, type Env, type MediaType } from './lib';

export const MATCH_BATCH = 14;
export const tmdbBase = (env: Env) => (env.TMDB_API_BASE || 'https://api.themoviedb.org/3').replace(/\/+$/, '');
const IMG = 'https://image.tmdb.org/t/p/w500';

/** Strip the provider's decorations: "EN - Dune: Part Two (2024) [4K]" -> "Dune: Part Two". */
export function cleanTitle(raw: string, stripTrailingYear = true) {
  let s = String(raw || '');
  s = s.replace(/^\s*(?:\|[^|]{1,12}\|\s*)+/, ''); // |EN| |4K|
  s = s.replace(/^\s*(?:[A-Z0-9]{2,4}\s*[-|:]\s*)+(?=\S)/, ''); // EN - , 4K-EN - , NF:
  s = s.replace(/\[[^\]]*\]|\{[^}]*\}/g, ' ');
  s = s.replace(
    /\b(?:4K|8K|UHD|FHD|HDR10\+?|HDR|DV|HD|SD|HEVC|H\.?26[45]|X26[45]|2160P|1080P|720P|480P|MULTI(?:-?SUBS?)?|SUBS?|DUB(?:BED)?|VOSTFR|ATMOS|REMUX|WEB-?DL|WEBRIP|BLU-?RAY|BRRIP|NF|AMZN)\b/gi,
    ' ',
  );
  s = s.replace(/\(\s*(?:19|20)\d{2}\s*\)/g, ' ');
  s = s.replace(/\(\s*(?:US|UK|GB|AU|CA|NZ|IE)\s*\)/g, ' '); // "The Office (US)" -> "The Office"
  // A trailing year ("Dune 2021", "Dune - 2021") is a year hint unless it's the whole title ("1917").
  if (stripTrailingYear)
    s = s.replace(/^(.*\S)\s+[-–]?\s*((?:19|20)\d{2})\s*$/, (m, rest, y) => (plausibleYear(Number(y)) ? rest : m));
  s = s.replace(/\(\s*\)/g, ' ');
  s = s.replace(/\s+/g, ' ').replace(/^[\s\-–|:.,]+|[\s\-–|:.,]+$/g, '');
  return s || String(raw || '').trim();
}
const plausibleYear = (y: number) => y >= 1900 && y <= new Date().getUTCFullYear() + 1;
/** Title to show people: decorations removed, but numbers that are part of the name kept ("Wonder Woman 1984"). */
export function displayTitle(raw: string) {
  return cleanTitle(raw, false).replace(/\s[-–]\s(?:19|20)\d{2}$/, '');
}
/** A–Z sort key: the clean title, lowercased, without accents or a leading "The"/"A"/"An". */
export function sortKey(raw: string) {
  return norm(displayTitle(raw)).replace(/^(the|a|an) (?=\S)/, '').slice(0, 120);
}
const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'in', 'on', 'to', 'for', 'at', 'by', 'de', 'la', 'le', 'el', 'les', 'der', 'die', 'das']);
/**
 * Search keys for a title: the normalized title from each word onwards, so "the matrix reloaded"
 * is found by "matrix" and "reloaded" too. Keys start with the library's prefix, so a search is
 * one index range per library and reads only the matches.
 */
export function searchTerms(libraryId: string, ...titles: (string | null | undefined)[]) {
  const prefix = libraryId.slice(0, 8) + ' ';
  const out = new Set<string>();
  for (const t of titles) {
    if (!t) continue;
    const words = norm(cleanTitle(String(t), false)).split(' ').filter(Boolean);
    for (let i = 0; i < words.length && i < 8; i++) {
      if (i > 0 && STOP.has(words[i])) continue;
      out.add(prefix + words.slice(i).join(' ').slice(0, 60));
    }
  }
  return [...out].slice(0, 16);
}
export function yearHint(raw: string) {
  const m = String(raw || '').match(/\(\s*((?:19|20)\d{2})\s*\)|[-–\s]((?:19|20)\d{2})\s*$/);
  const y = m ? Number(m[1] || m[2]) : null;
  return y && plausibleYear(y) ? y : null;
}
export function norm(s: string) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
function titleSim(a: string, b: string) {
  const x = norm(a),
    y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const strip = (v: string) => v.replace(/^(the|a|an) /, '');
  if (strip(x) === strip(y)) return 0.97;
  const tx = x.split(' '),
    ty = y.split(' ');
  const sy = new Set(ty);
  const common = tx.filter((t) => sy.has(t)).length;
  return (2 * common) / (tx.length + ty.length); // Dice coefficient on words
}
function yearScore(a: number | null, b: number | null) {
  if (!a || !b) return 0.6;
  const d = Math.abs(a - b);
  return d === 0 ? 1 : d === 1 ? 0.85 : d === 2 ? 0.4 : 0;
}

type Candidate = { id: number; title?: string; name?: string; original_title?: string; original_name?: string; release_date?: string; first_air_date?: string };
/** variants: ways to read the provider title, e.g. "Wonder Woman" + year 1984, or "Wonder Woman 1984" + no year. */
export function pickBest(results: Candidate[], variants: { t: string; y: number | null }[]) {
  let best: { id: number; score: number; sim: number } | null = null;
  for (const r of results.slice(0, 10)) {
    const ry = Number(String(r.release_date || r.first_air_date || '').slice(0, 4)) || null;
    for (const v of variants) {
      const sim = Math.max(titleSim(v.t, r.title || r.name || ''), titleSim(v.t, r.original_title || r.original_name || ''));
      const score = 0.7 * sim + 0.3 * yearScore(v.y, ry);
      if (!best || score > best.score + 1e-9) best = { id: r.id, score, sim }; // ties keep TMDB's (popularity) order
    }
  }
  if (best && best.sim >= 0.85 && best.score >= 0.75) return best;
  return best ? { id: 0, score: best.score, sim: best.sim } : null;
}

class RateLimited extends Error {}
async function tmdbGet(base: string, apiKey: string, path: string, params: Record<string, string> = {}) {
  const u = new URL(base + path);
  u.searchParams.set('api_key', apiKey);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const r = await fetch(u.toString(), { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
  if (r.status === 429) throw new RateLimited();
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`TMDB HTTP ${r.status}`);
  return (await r.json()) as any;
}

type Row = { id: number; title: string; year: number | null; media_type: MediaType; tmdb_id: number | null };
type Result = { id: number; status: 'matched' | 'unmatched' | 'error'; tmdb: number | null; imdb: string | null; poster: string | null; score: number | null; names?: string[]; ol?: string | null };

async function matchOne(base: string, apiKey: string, row: Row): Promise<Result> {
  const kind = row.media_type === 'series' ? 'tv' : 'movie';
  const details = async (id: number) => {
    const d = await tmdbGet(base, apiKey, `/${kind}/${id}`, { append_to_response: 'external_ids' });
    if (!d) return null;
    const imdb = String(d.imdb_id || d.external_ids?.imdb_id || '');
    return {
      tmdb: Number(d.id),
      ol: /^[a-z]{2}$/.test(String(d.original_language || '')) ? String(d.original_language) : null,
      imdb: /^tt\d+$/.test(imdb) ? imdb : null,
      poster: d.poster_path ? IMG + d.poster_path : null,
      names: [d.title || d.name, d.original_title || d.original_name].filter(Boolean) as string[],
    };
  };
  // 1. The provider already told us the TMDB ID.
  if (row.tmdb_id) {
    const d = await details(row.tmdb_id);
    if (d) return { id: row.id, status: 'matched', ...d, score: 1 };
  }
  // 2. Search by cleaned title (+ year when known), then without the year if nothing came back.
  const title = cleanTitle(row.title);
  const withNumber = cleanTitle(row.title, false);
  const year = row.year || yearHint(row.title) || yearHint(withNumber);
  const variants = [{ t: title, y: year }];
  if (withNumber !== title) variants.push({ t: withNumber, y: null });
  const yearParam = kind === 'tv' ? 'first_air_date_year' : 'year';
  let res = await tmdbGet(base, apiKey, `/search/${kind}`, { query: title, include_adult: 'false', ...(year ? { [yearParam]: String(year) } : {}) });
  let best = pickBest(res?.results || [], variants);
  if ((!best || !best.id) && year) {
    res = await tmdbGet(base, apiKey, `/search/${kind}`, { query: title, include_adult: 'false' });
    const second = pickBest(res?.results || [], variants);
    if (second && (!best || second.score > best.score)) best = second;
  }
  if (!best || !best.id) return { id: row.id, status: 'unmatched', tmdb: null, imdb: null, poster: null, score: best ? best.score : null };
  const d = await details(best.id);
  if (!d) return { id: row.id, status: 'unmatched', tmdb: null, imdb: null, poster: null, score: best.score };
  return { id: row.id, status: 'matched', ...d, score: Math.round(best.score * 1000) / 1000 };
}

/** POST /api/tmdb/match {ids:[…]} — match up to MATCH_BATCH titles and save the results in one statement. */
export async function matchBatch(env: Env, setupId: string, libraryId: string, ids: number[]) {
  const secret = await env.DB.prepare('SELECT encrypted_value FROM setup_secrets WHERE setup_id=? AND secret_name=?')
    .bind(setupId, 'tmdb_api_key')
    .first<{ encrypted_value: string }>();
  if (!secret) return json({ error: 'Save a valid TMDB API key first (Setup & security).' }, 400);
  const { apiKey } = await decrypt<{ apiKey: string }>(env, secret.encrypted_value);
  const rows = (
    await env.DB.prepare(
      "SELECT id,title,year,media_type,tmdb_id FROM vod_items WHERE id IN (SELECT value FROM json_each(?2)) AND library_id=?1 AND tmdb_match_status='pending'",
    )
      .bind(libraryId, JSON.stringify(ids.slice(0, MATCH_BATCH)))
      .all<Row>()
  ).results;
  const results: Result[] = [];
  let rateLimited = false;
  // A few at a time: Workers allow 6 open connections, and TMDB rate-limits bursts.
  const queue = [...rows];
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let row = queue.shift(); row; row = queue.shift()) {
        if (rateLimited) return;
        try {
          results.push(await matchOne(tmdbBase(env), apiKey, row));
        } catch (e) {
          if (e instanceof RateLimited) rateLimited = true;
          else results.push({ id: row.id, status: 'error', tmdb: null, imdb: null, poster: null, score: null });
        }
      }
    }),
  );
  if (results.length) {
    const writes = [
      env.DB.prepare(
        `UPDATE vod_items SET tmdb_match_status=json_extract(r.value,'$.status'),tmdb_id=COALESCE(json_extract(r.value,'$.tmdb'),vod_items.tmdb_id),
           imdb_id=json_extract(r.value,'$.imdb'),tmdb_poster=json_extract(r.value,'$.poster'),tmdb_match_score=json_extract(r.value,'$.score'),
           orig_lang=COALESCE(json_extract(r.value,'$.ol'),vod_items.orig_lang)
         FROM json_each(?2) r WHERE vod_items.id=json_extract(r.value,'$.id') AND vod_items.library_id=?1`,
      ).bind(libraryId, JSON.stringify(results.map(({ names, ...r }) => r))),
    ];
    // Make TMDB's names searchable too (e.g. a French provider title found by its English name).
    const terms = results.flatMap((r) => (r.names ? searchTerms(libraryId, ...r.names).map((t) => [t, r.id]) : []));
    if (terms.length)
      writes.push(
        env.DB.prepare(
          "INSERT OR IGNORE INTO search_terms(term,item_id) SELECT json_extract(value,'$[0]'),json_extract(value,'$[1]') FROM json_each(?)",
        ).bind(JSON.stringify(terms)),
      );
    await env.DB.batch(writes);
  }
  const count = (s: string) => results.filter((r) => r.status === s).length;
  return json({ checked: results.length, matched: count('matched'), unmatched: count('unmatched'), errors: count('error'), rateLimited });
}

/** POST /api/tmdb/langs — look up TMDB's original language for up to 40 already-matched titles. */
export async function fillOriginalLanguages(env: Env, setupId: string, libraryId: string, ids: number[]) {
  const secret = await env.DB.prepare('SELECT encrypted_value FROM setup_secrets WHERE setup_id=? AND secret_name=?')
    .bind(setupId, 'tmdb_api_key')
    .first<{ encrypted_value: string }>();
  if (!secret) return json({ error: 'Save a valid TMDB API key first (Settings).' }, 400);
  const { apiKey } = await decrypt<{ apiKey: string }>(env, secret.encrypted_value);
  const rows = (
    await env.DB.prepare('SELECT id,tmdb_id,media_type FROM vod_items WHERE id IN (SELECT value FROM json_each(?2)) AND library_id=?1 AND tmdb_id IS NOT NULL')
      .bind(libraryId, JSON.stringify(ids))
      .all<{ id: number; tmdb_id: number; media_type: MediaType }>()
  ).results;
  const out: { id: number; ol: string }[] = [];
  let rateLimited = false;
  const queue = [...rows];
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let r = queue.shift(); r; r = queue.shift()) {
        if (rateLimited) return;
        try {
          const d = await tmdbGet(tmdbBase(env), apiKey, `/${r.media_type === 'series' ? 'tv' : 'movie'}/${r.tmdb_id}`);
          // Unknown or missing: record "xx" so the title isn't looked up again every time.
          out.push({ id: r.id, ol: /^[a-z]{2}$/.test(String(d?.original_language || '')) ? String(d.original_language) : 'xx' });
        } catch (e) {
          if (e instanceof RateLimited) rateLimited = true;
        }
      }
    }),
  );
  if (out.length)
    await env.DB.prepare(
      "UPDATE vod_items SET orig_lang=json_extract(r.value,'$.ol') FROM json_each(?2) r WHERE vod_items.id=json_extract(r.value,'$.id') AND vod_items.library_id=?1",
    )
      .bind(libraryId, JSON.stringify(out))
      .run();
  return json({ checked: out.length, rateLimited });
}
