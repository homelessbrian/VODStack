CREATE TABLE IF NOT EXISTS setup_secrets (
  setup_id TEXT NOT NULL REFERENCES setups(id) ON DELETE CASCADE,
  secret_name TEXT NOT NULL,
  encrypted_value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (setup_id, secret_name)
);
ALTER TABLE vod_items ADD COLUMN tmdb_id INTEGER;
ALTER TABLE vod_items ADD COLUMN tmdb_match_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE vod_items ADD COLUMN tmdb_match_score REAL;
CREATE INDEX IF NOT EXISTS vod_items_tmdb_idx ON vod_items(setup_id, tmdb_match_status, media_type);
