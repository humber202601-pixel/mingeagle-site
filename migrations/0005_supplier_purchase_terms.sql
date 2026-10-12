-- Supplier purchasing terms are internal-only. No vendor terms are pre-seeded.
CREATE TABLE IF NOT EXISTS supplier_purchase_terms(
  sku TEXT PRIMARY KEY,
  supplier_name TEXT NOT NULL,
  supplier_sku TEXT,
  moq INTEGER NOT NULL CHECK(moq BETWEEN 1 AND 100000),
  case_pack INTEGER NOT NULL CHECK(case_pack BETWEEN 1 AND 100000),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK(currency='USD'),
  tiers_json TEXT NOT NULL DEFAULT '[]',
  source_note TEXT NOT NULL,
  effective_on TEXT NOT NULL,
  expires_on TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','APPROVED','DISABLED')),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
  approved_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS supplier_purchase_audit(
  id TEXT PRIMARY KEY,
  sku TEXT NOT NULL,
  version INTEGER NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('SAVE_DRAFT','APPROVE','DISABLE')),
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_supplier_purchase_audit_recent
  ON supplier_purchase_audit(occurred_at DESC);