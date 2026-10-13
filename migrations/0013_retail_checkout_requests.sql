-- Customer retail checkout request idempotency. No card data or raw checkout tokens.
-- Customer PII remains in CRM contact / order shipping records under existing
-- access controls, not in this table.
CREATE TABLE IF NOT EXISTS retail_checkout_requests (
  request_id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),
  quote_id TEXT NOT NULL UNIQUE REFERENCES quotes(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_retail_checkout_requests_created
 ON retail_checkout_requests(created_at DESC);
