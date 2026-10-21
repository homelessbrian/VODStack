-- Rebuild vod_items so each imported title costs as few D1 row-writes as possible.
-- (D1 Free allows 100,000 rows written per day, and every index on a table adds
-- another written row per insert.)
--
-- Old table: TEXT primary key + 4 indexes  -> ~6 rows written per title.
-- New table: INTEGER primary key + 1 index -> 2 rows written per title.
--
-- Previously imported items are dropped (earlier imports never completed
-- reliably). Sources, catalogs, renames, hidden flags and sort order are kept.

DROP INDEX IF EXISTS vod_items_catalog_idx;
DROP INDEX IF EXISTS vod_items_provider_idx;
DROP INDEX IF EXISTS vod_items_tmdb_idx;
DROP TABLE IF EXISTS vod_items;

CREATE TABLE vod_items (
  id INTEGER PRIMARY KEY,
  setup_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  catalog_id TEXT NOT NULL REFERENCES catalogs(id) ON DELETE CASCADE,
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
  -- One index does double duty: uniqueness for upserts, and fast lookups by catalog.
  UNIQUE(catalog_id, provider_item_id)
);
