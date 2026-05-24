-- H1: schema drift fix.
--
-- Migration 002 declared `category TEXT NOT NULL DEFAULT '自选股'` but the
-- live production DB ended up with DEFAULT '默认' (different ALTER path on
-- an earlier branch). This rebuild aligns both, retroactively migrating any
-- '默认' values to '自选股' so older rows match the migration intent.
--
-- SQLite cannot change a column DEFAULT in place; the canonical pattern is
-- to rebuild the table. The migration runner already wraps every .sql in a
-- transaction, so no explicit BEGIN/COMMIT here.

CREATE TABLE watchlist_items_new (
  symbol TEXT NOT NULL UNIQUE,
  market TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  category TEXT NOT NULL DEFAULT '自选股'
);

INSERT INTO watchlist_items_new
  (symbol, market, display_name, created_at, updated_at, category)
SELECT
  symbol,
  market,
  display_name,
  created_at,
  updated_at,
  CASE WHEN category = '默认' THEN '自选股' ELSE category END
FROM watchlist_items;

DROP TABLE watchlist_items;
ALTER TABLE watchlist_items_new RENAME TO watchlist_items;
