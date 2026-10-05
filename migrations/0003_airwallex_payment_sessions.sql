CREATE TABLE IF NOT EXISTS payment_provider_sessions (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'AIRWALLEX',
  provider_intent_id TEXT NOT NULL UNIQUE,
  request_id TEXT NOT NULL UNIQUE,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'REQUIRES_PAYMENT_METHOD',
  client_secret TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_payment_provider_sessions_order
  ON payment_provider_sessions(order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_provider_sessions_status
  ON payment_provider_sessions(provider, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS payment_webhook_events (
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TEXT,
  PRIMARY KEY (provider, event_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_reference_unique
  ON payments(provider, provider_reference)
  WHERE provider IS NOT NULL AND provider_reference IS NOT NULL;
