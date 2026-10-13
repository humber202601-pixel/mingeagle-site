-- Operator-attested CSV exports from Bing Webmaster Tools AI Performance.
-- Distinct from official authenticated Bing API data and manual prompt reviews.
CREATE TABLE IF NOT EXISTS bing_ai_manual_imports (
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('PAGES','GROUNDING_QUERIES')),
 start_date TEXT NOT NULL,
 end_date TEXT NOT NULL,
 source TEXT NOT NULL DEFAULT 'OPERATOR_ATTESTED_BING_CSV'
  CHECK(source='OPERATOR_ATTESTED_BING_CSV'),
 row_count INTEGER NOT NULL CHECK(row_count BETWEEN 1 AND 1000),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS bing_ai_manual_rows (
 import_id TEXT NOT NULL,
 dimension TEXT NOT NULL,
 citations INTEGER NOT NULL CHECK(citations >= 0 AND citations <= 1000000000),
 PRIMARY KEY(import_id,dimension)
);
CREATE INDEX IF NOT EXISTS idx_bing_ai_manual_latest
 ON bing_ai_manual_imports(kind,created_at DESC);
