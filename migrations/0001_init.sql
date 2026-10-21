PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS setups (
  id TEXT PRIMARY KEY,
  recovery_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  setup_id TEXT NOT NULL REFERENCES setups(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS sessions_setup_id_idx ON sessions(setup_id);
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  setup_id TEXT NOT NULL REFERENCES setups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('xtream','m3u')),
  encrypted_config TEXT NOT NULL,
  last_refresh_at TEXT,
  last_refresh_status TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS sources_setup_id_idx ON sources(setup_id);
CREATE TABLE IF NOT EXISTS catalogs (
  id TEXT PRIMARY KEY,
  setup_id TEXT NOT NULL REFERENCES setups(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  source_category_id TEXT NOT NULL,
  source_category_name TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK(media_type IN ('movie','series')),
  display_name TEXT NOT NULL,
  is_hidden INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source_id, media_type, source_category_id)
);
CREATE INDEX IF NOT EXISTS catalogs_setup_sort_idx ON catalogs(setup_id, sort_order);
CREATE TABLE IF NOT EXISTS vod_items (
  id TEXT PRIMARY KEY,
  setup_id TEXT NOT NULL REFERENCES setups(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  catalog_id TEXT NOT NULL REFERENCES catalogs(id) ON DELETE CASCADE,
  provider_item_id TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK(media_type IN ('movie','series')),
  title TEXT NOT NULL,
  year INTEGER,
  poster_url TEXT,
  overview TEXT,
  provider_data_json TEXT NOT NULL DEFAULT '{}',
  playback_ref TEXT,
  is_available INTEGER NOT NULL DEFAULT 1,
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source_id, media_type, provider_item_id, catalog_id)
);
CREATE INDEX IF NOT EXISTS vod_items_catalog_idx ON vod_items(catalog_id, is_available, title);
CREATE INDEX IF NOT EXISTS vod_items_provider_idx ON vod_items(source_id, provider_item_id);
ALTER TABLE setups ADD COLUMN addon_token_hash TEXT;
ALTER TABLE setups ADD COLUMN addon_token_encrypted TEXT;
