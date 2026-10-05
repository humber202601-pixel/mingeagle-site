CREATE TABLE IF NOT EXISTS quote_public_links (
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_quote_public_links_quote
  ON quote_public_links(quote_id, created_at DESC);
