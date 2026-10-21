// Database: Turso (libSQL, SQLite-compatible), wrapped in a small D1-style interface so the
// rest of the code reads like before: env.DB.prepare(sql).bind(...).first()/all()/run()/raw().
//
// The schema is created automatically on first use (no console steps). Bump SCHEMA_VERSION and
// add statements to MIGRATIONS when it changes.
//
// Cost notes (Turso Free counts rows read and written per month):
// - Every index adds a written row per insert, so tables only have the indexes queries need.
// - vod_items is shared per provider library: imported and matched once, used by everyone.
import { createClient, type Client, type InValue, type ResultSet } from '@libsql/client/web';

export interface D1Result<T = unknown> {
  results: T[];
  success: boolean;
  meta: { changes: number };
}
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
  raw<T = unknown[]>(): Promise<T[]>;
}
export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
}

const toArg = (v: unknown): InValue =>
  v === undefined || v === null ? null : typeof v === 'boolean' ? (v ? 1 : 0) : (v as InValue);

function toResult<T>(rs: ResultSet): D1Result<T> {
  const cols = rs.columns;
  const results = rs.rows.map((row) => {
    const o: Record<string, unknown> = {};
    cols.forEach((c, i) => (o[c] = typeof row[i] === 'bigint' ? Number(row[i]) : row[i]));
    return o as T;
  });
  return { results, success: true, meta: { changes: rs.rowsAffected } };
}

class Stmt implements D1PreparedStatement {
  constructor(
    private db: Db,
    readonly sql: string,
    readonly args: InValue[] = [],
  ) {}
  bind(...values: unknown[]) {
    return new Stmt(this.db, this.sql, values.map(toArg));
  }
  async exec() {
    await this.db.ready();
    return this.db.client.execute({ sql: this.sql, args: this.args });
  }
  async all<T>() {
    return toResult<T>(await this.exec());
  }
  async first<T>() {
    return ((await this.all<T>()).results[0] as T) ?? null;
  }
  async run() {
    return this.all();
  }
  async raw<T>() {
    const rs = await this.exec();
    return rs.rows.map((r) => Array.from(r, (v) => (typeof v === 'bigint' ? Number(v) : v))) as T[];
  }
}

class Db implements D1Database {
  private schema: Promise<void> | null = null;
  constructor(readonly client: Client) {}
  prepare(sql: string) {
    return new Stmt(this, sql);
  }
  async batch(statements: D1PreparedStatement[]) {
    await this.ready();
    const list = statements as Stmt[];
    const out = await this.client.batch(
      list.map((s) => ({ sql: s.sql, args: s.args })),
      'write',
    );
    return out.map((rs) => toResult(rs));
  }
  ready() {
    return (this.schema ||= ensureSchema(this.client).catch((e) => {
      this.schema = null; // retry on the next request
      throw e;
    }));
  }
}

let cached: { key: string; db: Db } | null = null;
/** One client per Worker instance; the schema check runs once per instance. */
export function getDb(url: string | undefined, token: string | undefined): D1Database {
  if (!url) throw new Error('Database not configured: set TURSO_URL and TURSO_TOKEN as Worker secrets (see TURSO-SETUP.md).');
  const key = url + '|' + (token || '');
  if (!cached || cached.key !== key) cached = { key, db: new Db(createClient({ url, authToken: token })) };
  return cached.db;
}
/** Tests: wrap an already-created client (e.g. a local file database). */
export function wrapClient(client: Client): D1Database {
  return new Db(client);
}

export const SCHEMA_VERSION = 5;
const MIGRATIONS: Record<number, string[]> = {
  1: [
    `CREATE TABLE IF NOT EXISTS setups (
      id TEXT PRIMARY KEY,
      recovery_hash TEXT NOT NULL,
      addon_token_hash TEXT,
      addon_token_encrypted TEXT,
      library_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    'CREATE INDEX IF NOT EXISTS setups_recovery_idx ON setups(recovery_hash)',
    'CREATE INDEX IF NOT EXISTS setups_addon_idx ON setups(addon_token_hash)',
    `CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      setup_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    ) WITHOUT ROWID`,
    `CREATE TABLE IF NOT EXISTS setup_secrets (
      setup_id TEXT NOT NULL,
      secret_name TEXT NOT NULL,
      encrypted_value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (setup_id, secret_name)
    ) WITHOUT ROWID`,
    // One shared library per provider. The owner imports it; members join with an invite.
    `CREATE TABLE IF NOT EXISTS libraries (
      id TEXT PRIMARY KEY,
      owner_setup_id TEXT NOT NULL,
      name TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('xtream','m3u')),
      invite_hash TEXT,
      invite_encrypted TEXT,
      last_refresh_at TEXT,
      last_refresh_status TEXT,
      stats_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    'CREATE INDEX IF NOT EXISTS libraries_invite_idx ON libraries(invite_hash)',
    // Each person's own provider login for a library (encrypted).
    `CREATE TABLE IF NOT EXISTS logins (
      setup_id TEXT NOT NULL,
      library_id TEXT NOT NULL,
      encrypted_config TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (setup_id, library_id)
    ) WITHOUT ROWID`,
    `CREATE TABLE IF NOT EXISTS catalogs (
      id INTEGER PRIMARY KEY,
      library_id TEXT NOT NULL,
      media_type TEXT NOT NULL CHECK(media_type IN ('movie','series')),
      source_category_id TEXT NOT NULL,
      source_category_name TEXT NOT NULL,
      item_count INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      UNIQUE (library_id, media_type, source_category_id)
    )`,
    // Per-person row customisations; a row exists only when someone changed something.
    `CREATE TABLE IF NOT EXISTS catalog_prefs (
      setup_id TEXT NOT NULL,
      catalog_id INTEGER NOT NULL,
      display_name TEXT,
      is_hidden INTEGER,
      sort_order INTEGER,
      PRIMARY KEY (setup_id, catalog_id)
    ) WITHOUT ROWID`,
    `CREATE TABLE IF NOT EXISTS vod_items (
      id INTEGER PRIMARY KEY,
      library_id TEXT NOT NULL,
      catalog_id INTEGER NOT NULL,
      provider_item_id TEXT NOT NULL,
      media_type TEXT NOT NULL CHECK(media_type IN ('movie','series')),
      title TEXT NOT NULL,
      year INTEGER,
      poster_url TEXT,
      overview TEXT,
      playback_ref TEXT,
      content_hash TEXT,
      is_available INTEGER NOT NULL DEFAULT 1,
      tmdb_id INTEGER,
      tmdb_match_status TEXT NOT NULL DEFAULT 'pending',
      tmdb_match_score REAL,
      imdb_id TEXT,
      tmdb_poster TEXT,
      UNIQUE (catalog_id, provider_item_id)
    )`,
    // Rows in Nuvio page through a category alphabetically: this index lets a page read ~100 rows.
    'CREATE INDEX IF NOT EXISTS vod_items_page_idx ON vod_items(catalog_id, title)',
    // Only matched titles are indexed, so unmatched ones cost no extra writes.
    'CREATE INDEX IF NOT EXISTS vod_items_imdb_idx ON vod_items(imdb_id) WHERE imdb_id IS NOT NULL',
    // Search: every title is stored from each word onwards ("the matrix", "matrix"), so a search
    // is a range lookup that reads only the matches instead of scanning the whole library.
    `CREATE TABLE IF NOT EXISTS search_terms (
      term TEXT NOT NULL,
      item_id INTEGER NOT NULL,
      PRIMARY KEY (term, item_id)
    ) WITHOUT ROWID`,
  ],
  2: [
    // When a title disappeared from the provider (deleted 90 days later unless it comes back).
    'ALTER TABLE vod_items ADD COLUMN removed_at INTEGER',
    "UPDATE vod_items SET removed_at=CAST(strftime('%s','now') AS INTEGER) WHERE is_available=0 AND removed_at IS NULL",
    // Merged rows: a row with is_merge=1 shows the titles of every category whose merged_into points
    // at it. Titles stay in their original categories, so imports keep feeding the merged row.
    'ALTER TABLE catalogs ADD COLUMN is_merge INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE catalogs ADD COLUMN merged_into INTEGER',
    // When a category first appeared (unix seconds), for the "New" badge. NULL for older ones.
    'ALTER TABLE catalogs ADD COLUMN created_at INTEGER',
    // How a row orders its titles in Nuvio: 'az' (default) or 'recent' (newest first).
    "ALTER TABLE catalogs ADD COLUMN title_order TEXT NOT NULL DEFAULT 'az'",
    // Owner's row-management settings: { hideNew, hideRules: [...] }.
    'ALTER TABLE libraries ADD COLUMN settings_json TEXT',
    // Titles in import order within a category, for "newest first" rows (one write per title).
    'CREATE INDEX IF NOT EXISTS vod_items_recent_idx ON vod_items(catalog_id)',
  ],
  3: [
    // Smart rows: a TMDB list filtered to this library. Definition, cached title ids, refresh time.
    'ALTER TABLE catalogs ADD COLUMN smart_json TEXT',
    'ALTER TABLE catalogs ADD COLUMN smart_ids TEXT',
    'ALTER TABLE catalogs ADD COLUMN smart_at INTEGER',
    // Find titles by TMDB ID (only titles that have one are indexed).
    'CREATE INDEX IF NOT EXISTS vod_items_tmdbid_idx ON vod_items(tmdb_id) WHERE tmdb_id IS NOT NULL',
  ],
  4: [
    // Per-row count of titles with full metadata (IMDb match), for "only show matched titles".
    'ALTER TABLE catalogs ADD COLUMN matched_count INTEGER NOT NULL DEFAULT 0',
  ],
  5: [
    // TMDB's original language ('en', 'it', …) and the language the provider labels its copy as.
    'ALTER TABLE vod_items ADD COLUMN orig_lang TEXT',
    'ALTER TABLE vod_items ADD COLUMN copy_lang TEXT',
    // Titles per row that pass every "What family sees" filter, so empty rows stay out of Nuvio.
    'ALTER TABLE catalogs ADD COLUMN visible_count INTEGER NOT NULL DEFAULT 0',
  ],
};

async function ensureSchema(client: Client) {
  let version = 0;
  try {
    const rs = await client.execute("SELECT v FROM meta WHERE k='schema_version'");
    version = Number(rs.rows[0]?.[0] || 0);
  } catch {
    // meta table missing: brand-new database.
  }
  if (version >= SCHEMA_VERSION) return;
  const steps = ['CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT) WITHOUT ROWID'];
  for (let v = version + 1; v <= SCHEMA_VERSION; v++) steps.push(...(MIGRATIONS[v] || []));
  steps.push(`INSERT INTO meta(k,v) VALUES('schema_version','${SCHEMA_VERSION}') ON CONFLICT(k) DO UPDATE SET v=excluded.v`);
  await client.batch(steps, 'write');
}
