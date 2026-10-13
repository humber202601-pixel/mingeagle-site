-- Online retail orders (1-9) may be created only by the fully guarded
-- checkout API. No payment success is inferred before the signed provider webhook.
-- Request idempotency persists through browser refresh and provider retries.
CREATE TABLE IF NOT EXISTS retail_checkout_requests (
 request_id TEXT PRIMARY KEY,
 fingerprint TEXT NOT NULL,
 order_id TEXT NOT NULL UNIQUE,
 order_reference TEXT NOT NULL UNIQUE,
 provider_request_id TEXT NOT NULL UNIQUE,
 state TEXT NOT NULL DEFAULT 'RESERVING'
  CHECK(state IN ('RESERVING','NEW','CREATING','READY','FAILED')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_retail_checkout_requests_order
 ON retail_checkout_requests(order_id);
