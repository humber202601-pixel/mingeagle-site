-- Real, manually exported GSC query/page reports (not live API data).
-- Previously created on the first import request; formalize the schema so
-- a GET with no imports returns a verified empty list rather than a missing table.
CREATE TABLE IF NOT EXISTS search_console_imports (
  id TEXT PRIMARY KEY,
  property TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('queries','pages')),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  row_count INTEGER NOT NULL CHECK (row_count BETWEEN 1 AND 1000)
);
CREATE TABLE IF NOT EXISTS search_console_rows (
  import_id TEXT NOT NULL,
  dimension TEXT NOT NULL,
  clicks INTEGER NOT NULL CHECK (clicks >= 0),
  impressions INTEGER NOT NULL CHECK (impressions >= 0),
  ctr REAL NOT NULL CHECK (ctr >= 0 AND ctr <= 1),
  position REAL NOT NULL CHECK (position >= 0),
  PRIMARY KEY (import_id,dimension),
  CHECK (clicks <= impressions)
);
CREATE INDEX IF NOT EXISTS idx_gsc_manual_import_kind_time
 ON search_console_imports(kind, imported_at DESC);
