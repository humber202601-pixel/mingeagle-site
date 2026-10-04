PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'CUSTOMER' CHECK (role IN ('CUSTOMER','STAFF','ADMIN')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INVITED','DISABLED')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT,
  domain TEXT,
  website TEXT,
  customer_type TEXT,
  country TEXT,
  state_region TEXT,
  city TEXT,
  address TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'PROSPECT' CHECK (status IN ('PROSPECT','CUSTOMER','PARTNER','NOT_FIT','ARCHIVED')),
  owner_user_id TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_domain_unique ON companies(domain) WHERE domain IS NOT NULL AND domain <> '';
CREATE INDEX IF NOT EXISTS idx_companies_status ON companies(status);
CREATE INDEX IF NOT EXISTS idx_companies_customer_type ON companies(customer_type);

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  company_id TEXT,
  first_name TEXT,
  last_name TEXT,
  full_name TEXT,
  title TEXT,
  email TEXT,
  email_type TEXT CHECK (email_type IN ('DIRECT_BUSINESS','ROLE_BASED','GENERIC','PERSONAL','INFERRED','INVALID','UNKNOWN')),
  email_verified INTEGER NOT NULL DEFAULT 0,
  phone TEXT,
  whatsapp TEXT,
  linkedin_url TEXT,
  instagram_url TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  do_not_contact INTEGER NOT NULL DEFAULT 0,
  source_url TEXT,
  source_evidence TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_email_unique ON contacts(email) WHERE email IS NOT NULL AND email <> '';
CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(company_id);

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  company_id TEXT,
  primary_contact_id TEXT,
  source TEXT NOT NULL DEFAULT 'WEBSITE',
  source_detail TEXT,
  status TEXT NOT NULL DEFAULT 'DISCOVERED' CHECK (status IN ('DISCOVERED','ANALYZED','QUALIFIED','ENRICHING','READY_TO_CONTACT','CONTACTED','REPLIED','INTERESTED','SAMPLE','QUOTE','NEGOTIATION','WON','NOT_FIT','NO_RESPONSE','NOT_INTERESTED','LOST','DO_NOT_CONTACT')),
  product_interest TEXT NOT NULL DEFAULT 'SILENT_BALL',
  lead_score INTEGER NOT NULL DEFAULT 0 CHECK (lead_score BETWEEN 0 AND 100),
  contact_quality_score INTEGER NOT NULL DEFAULT 0 CHECK (contact_quality_score BETWEEN 0 AND 100),
  potential_value INTEGER NOT NULL DEFAULT 25 CHECK (potential_value BETWEEN 0 AND 100),
  close_probability INTEGER NOT NULL DEFAULT 0 CHECK (close_probability BETWEEN 0 AND 100),
  opportunity_score REAL NOT NULL DEFAULT 0,
  next_best_action TEXT,
  next_action_at TEXT,
  owner_user_id TEXT,
  last_contact_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
  FOREIGN KEY (primary_contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(lead_score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_next_action ON leads(next_action_at);

CREATE TABLE IF NOT EXISTS lead_evidence (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL,
  field_name TEXT NOT NULL,
  value TEXT,
  source_url TEXT,
  evidence_text TEXT,
  confidence INTEGER CHECK (confidence BETWEEN 0 AND 100),
  captured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS inquiries (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  lead_id TEXT,
  company_id TEXT,
  contact_id TEXT,
  request_type TEXT NOT NULL DEFAULT 'WHOLESALE',
  customer_type TEXT,
  product_interest TEXT NOT NULL DEFAULT 'SILENT_BALL',
  estimated_quantity TEXT,
  size_preference TEXT,
  color_preference TEXT,
  customization TEXT,
  order_timing TEXT,
  shipping_country TEXT,
  shipping_city TEXT,
  shipping_postal_code TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','REVIEWING','RESPONDED','QUALIFIED','QUOTED','CLOSED')),
  hubspot_synced INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_inquiries_status ON inquiries(status);
CREATE INDEX IF NOT EXISTS idx_inquiries_created ON inquiries(created_at DESC);

CREATE TABLE IF NOT EXISTS samples (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  lead_id TEXT,
  inquiry_id TEXT,
  company_id TEXT,
  contact_id TEXT,
  product_id TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED','APPROVED','PAYMENT_PENDING','PREPARING','SHIPPED','DELIVERED','FOLLOW_UP','CONVERTED','CLOSED')),
  shipping_address TEXT,
  carrier TEXT,
  tracking_number TEXT,
  cost_amount REAL,
  currency TEXT NOT NULL DEFAULT 'USD',
  follow_up_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  product_family TEXT NOT NULL DEFAULT 'SILENT_BALL',
  description TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DRAFT','ARCHIVED')),
  default_currency TEXT NOT NULL DEFAULT 'USD',
  retail_price REAL,
  wholesale_enabled INTEGER NOT NULL DEFAULT 1,
  image_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_variants (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  variant_sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  size TEXT,
  color TEXT,
  configuration TEXT,
  weight_grams INTEGER,
  inventory_status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (inventory_status IN ('AVAILABLE','LOW_STOCK','OUT_OF_STOCK','PREORDER','DISCONTINUED')),
  fulfillment_location TEXT,
  retail_price REAL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS price_tiers (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  variant_id TEXT,
  customer_segment TEXT NOT NULL DEFAULT 'WHOLESALE',
  min_quantity INTEGER NOT NULL,
  max_quantity INTEGER,
  unit_price REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  lead_id TEXT,
  inquiry_id TEXT,
  company_id TEXT,
  contact_id TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SENT','VIEWED','ACCEPTED','DECLINED','EXPIRED','CONVERTED')),
  currency TEXT NOT NULL DEFAULT 'USD',
  subtotal REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  shipping REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  payment_terms TEXT,
  shipping_terms TEXT,
  notes TEXT,
  valid_until TEXT,
  sent_at TEXT,
  first_viewed_at TEXT,
  accepted_at TEXT,
  public_token_hash TEXT,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL,
  FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON DELETE SET NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS quote_items (
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL,
  product_id TEXT,
  variant_id TEXT,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  line_total REAL NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
  FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  quote_id TEXT,
  lead_id TEXT,
  company_id TEXT,
  contact_id TEXT,
  customer_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','CONFIRMED','PAYMENT_PENDING','PAID','PROCESSING','READY_TO_SHIP','SHIPPED','DELIVERED','COMPLETED','CANCELLED')),
  currency TEXT NOT NULL DEFAULT 'USD',
  subtotal REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  shipping REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'UNPAID' CHECK (payment_status IN ('UNPAID','PARTIAL','PAID','REFUNDED')),
  shipping_address TEXT,
  customer_notes TEXT,
  internal_notes TEXT,
  reorder_of_order_id TEXT,
  confirmed_at TEXT,
  paid_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE SET NULL,
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
  FOREIGN KEY (customer_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (reorder_of_order_id) REFERENCES orders(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_company ON orders(company_id);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  product_id TEXT,
  variant_id TEXT,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  line_total REAL NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
  FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  method TEXT NOT NULL,
  provider TEXT,
  provider_reference TEXT,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','RECEIVED','FAILED','REFUNDED','PARTIAL_REFUND')),
  received_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shipments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  carrier TEXT,
  service TEXT,
  tracking_number TEXT,
  tracking_url TEXT,
  status TEXT NOT NULL DEFAULT 'PREPARING' CHECK (status IN ('PREPARING','SHIPPED','IN_TRANSIT','DELIVERED','EXCEPTION','RETURNED')),
  shipped_at TEXT,
  delivered_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  lead_id TEXT,
  company_id TEXT,
  contact_id TEXT,
  order_id TEXT,
  assigned_user_id TEXT,
  type TEXT NOT NULL DEFAULT 'FOLLOW_UP',
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','DONE','CANCELLED')),
  priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW','MEDIUM','HIGH','URGENT')),
  due_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(status, due_at);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  lead_id TEXT,
  company_id TEXT,
  contact_id TEXT,
  channel TEXT NOT NULL CHECK (channel IN ('EMAIL','WHATSAPP','PHONE','WEBSITE','OTHER')),
  direction TEXT NOT NULL CHECK (direction IN ('INBOUND','OUTBOUND')),
  subject TEXT,
  body TEXT,
  intent TEXT,
  external_id TEXT,
  sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  actor_user_id TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_activities_entity ON activities(entity_type, entity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS automation_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  conditions_json TEXT NOT NULL DEFAULT '{}',
  actions_json TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS automation_runs (
  id TEXT PRIMARY KEY,
  rule_id TEXT,
  entity_type TEXT,
  entity_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('STARTED','COMPLETED','SKIPPED','FAILED')),
  result_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (rule_id) REFERENCES automation_rules(id) ON DELETE SET NULL
);
