-- This table was originally created lazily by quote view and approval
-- handlers. Move schema ownership to versioned D1 migrations so quote
-- views, status polling and admin reads never need schema-write privileges.
CREATE TABLE IF NOT EXISTS quote_retail_approvals (
  quote_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  retail_usd REAL NOT NULL,
  source_url TEXT NOT NULL,
  approved_description TEXT NOT NULL,
  approved_unit_price REAL NOT NULL,
  approved_quantity INTEGER NOT NULL,
  approved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (quote_id, item_id)
);
