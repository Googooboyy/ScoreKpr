-- Migration 040: Persist per-entry score snapshot metadata
-- Adds optional snapshot URL + storage path so tally snapshots can be shown
-- in Stage 3 preview, History cards, and game history rows.

ALTER TABLE entries
    ADD COLUMN IF NOT EXISTS score_snapshot_url TEXT,
    ADD COLUMN IF NOT EXISTS score_snapshot_storage_path TEXT;

CREATE INDEX IF NOT EXISTS idx_entries_score_snapshot_url
    ON entries(score_snapshot_url);
