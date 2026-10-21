-- Real IDs for metadata and search.
-- imdb_id lets the addon serve matched titles under their IMDb ID (tt…), so Nuvio shows its
-- normal metadata and asks VODStack for the stream. tmdb_poster is TMDB's poster, used in rows.
-- Adds columns only: no imported data is lost.
ALTER TABLE vod_items ADD COLUMN imdb_id TEXT;
ALTER TABLE vod_items ADD COLUMN tmdb_poster TEXT;
-- Accent-free title text (provider + TMDB names) that search matches against.
ALTER TABLE vod_items ADD COLUMN search_text TEXT;
-- Partial index: only matched titles are indexed, so unmatched rows cost no extra writes.
CREATE INDEX IF NOT EXISTS vod_items_imdb_idx ON vod_items(imdb_id) WHERE imdb_id IS NOT NULL;
