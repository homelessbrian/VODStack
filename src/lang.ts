// Which language is the provider's copy of a title? IPTV providers mark it in the title
// ("IT - Title", "|FR| Title", "Title [ITA]") or in the category name ("ITALIAN MOVIES",
// "DE | Action", "Latino"). Untagged titles are treated as English.
//
// Two-letter codes only count in tag positions (a prefix before "-", "|" or ":", or inside brackets),
// so ordinary words like "It" or "In" in a title never trigger it. Full language names count anywhere
// in a category name, or inside brackets in a title.

const CODES: Record<string, string[]> = {
  en: ['en', 'eng', 'us', 'usa', 'uk', 'gb', 'english'],
  it: ['it', 'ita', 'italian', 'italiano', 'italia'],
  fr: ['fr', 'fre', 'fra', 'vf', 'vff', 'french', 'francais', 'français'],
  de: ['de', 'ger', 'deu', 'german', 'deutsch'],
  es: ['es', 'esp', 'spa', 'lat', 'spanish', 'espanol', 'español', 'latino', 'castellano'],
  pt: ['pt', 'por', 'br', 'portuguese', 'portugues', 'português', 'brasil', 'brazil'],
  nl: ['nl', 'dut', 'dutch', 'nederlands'],
  tr: ['tr', 'tur', 'turkish', 'turk', 'türk'],
  ar: ['ar', 'ara', 'arabic', 'arab'],
  hi: ['hi', 'hin', 'hindi', 'bollywood'],
  ta: ['ta', 'tam', 'tamil'],
  te: ['tel', 'telugu'],
  ru: ['ru', 'rus', 'russian'],
  pl: ['pl', 'pol', 'polish', 'polski'],
  sv: ['se', 'swe', 'swedish', 'svenska'],
  no: ['nor', 'norwegian'],
  da: ['dk', 'dan', 'danish'],
  fi: ['fin', 'finnish'],
  el: ['gr', 'gre', 'greek'],
  ro: ['ro', 'rom', 'romanian'],
  hu: ['hun', 'hungarian'],
  cs: ['cz', 'cze', 'czech'],
  ja: ['jp', 'jap', 'jpn', 'japanese'],
  ko: ['kr', 'kor', 'korean'],
  zh: ['cn', 'chi', 'chinese', 'mandarin', 'cantonese'],
  fa: ['ir', 'per', 'persian', 'farsi'],
  he: ['il', 'heb', 'hebrew'],
  ur: ['pk', 'urdu', 'pakistani'],
  al: ['alb', 'albanian'],
  ex: ['exyu', 'ex-yu', 'balkan'],
};
const BY_TOKEN = new Map<string, string>();
for (const [lang, list] of Object.entries(CODES)) for (const t of list) BY_TOKEN.set(t, lang);
/** Full words that are safe to recognise anywhere (no short codes). */
const WORDS = new Set([...BY_TOKEN.keys()].filter((t) => t.length >= 5 || ['latino', 'arab', 'turk', 'urdu', 'farsi', 'tamil', 'hindi', 'greek', 'czech', 'dutch'].includes(t)));

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

/** Language tags in tag positions: prefixes ("IT - ", "|FR| ", "4K-EN - ", "EN | "), brackets, trailing " - ITA". */
function tagLangs(s: string, isCategory = false) {
  const out: string[] = [];
  const t = norm(s);
  const add = (chunk: string) => {
    for (const tok of chunk.split(/[^a-z0-9]+/).filter(Boolean)) {
      const l = BY_TOKEN.get(tok);
      if (l) out.push(l);
    }
  };
  // Leading tag block: one or more "|xx|" or "xx -" / "xx:" / "xx |" pieces.
  const lead = t.match(/^\s*((?:\|[a-z0-9-]{2,8}\|\s*|[a-z0-9-]{2,8}\s*[-|:]\s+)+)/);
  if (lead) add(lead[1]);
  // Categories also use a bare leading code: "US Movies", "DE Animation".
  else if (isCategory) {
    const bare = t.match(/^\s*([a-z]{2,3})\s+\S/);
    if (bare && BY_TOKEN.get(bare[1])) out.push(BY_TOKEN.get(bare[1])!);
  }
  // Bracketed anywhere: "[ITA]", "(Italian)", "{FR}"
  for (const m of t.matchAll(/[\[({]\s*([a-z][a-z .-]{1,20})\s*[\])}]/g)) add(m[1]);
  // Trailing " - ITA" / " | FR"
  const tail = t.match(/\s[-|]\s*([a-z]{2,3})\s*$/);
  if (tail && BY_TOKEN.get(tail[1])) out.push(BY_TOKEN.get(tail[1])!);
  return out;
}
/** Full language words anywhere in a category name ("ITALIAN MOVIES", "Latino Accion"). */
function wordLangs(s: string) {
  const out: string[] = [];
  for (const tok of norm(s).split(/[^a-z-]+/).filter(Boolean)) if (WORDS.has(tok)) out.push(BY_TOKEN.get(tok)!);
  return out;
}

/**
 * The copy's language as a code ('en', 'it', …), or null when nothing says (treated as English).
 * The title wins over the category: "EN - Title" in a "MULTI" category is English.
 */
export function copyLanguage(title: string, categoryName: string): string | null {
  const fromTitle = tagLangs(title);
  if (fromTitle.length) return fromTitle.includes('en') ? 'en' : fromTitle[0];
  return categoryLanguage(categoryName);
}
function categoryLanguage(categoryName: string): string | null {
  const fromCat = [...tagLangs(categoryName, true), ...wordLangs(categoryName)];
  if (fromCat.length) return fromCat.includes('en') ? 'en' : fromCat[0];
  return null;
}
// Same answer as copyLanguage, but each category name is only examined once per batch of titles.
const catCache = new Map<string, string | null>();
export function copyLanguageCached(title: string, categoryName: string): string | null {
  const fromTitle = tagLangs(title);
  if (fromTitle.length) return fromTitle.includes('en') ? 'en' : fromTitle[0];
  let v = catCache.get(categoryName);
  if (v === undefined) {
    if (catCache.size > 5000) catCache.clear();
    v = categoryLanguage(categoryName);
    catCache.set(categoryName, v);
  }
  return v;
}
