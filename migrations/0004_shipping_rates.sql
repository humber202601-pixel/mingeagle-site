CREATE TABLE IF NOT EXISTS shipping_rates (
 id TEXT PRIMARY KEY,
 country TEXT NOT NULL,
 method TEXT NOT NULL CHECK(method IN ('air','sea')),
 usd_per_unit REAL NOT NULL CHECK(usd_per_unit>0),
 min_charge_usd REAL NOT NULL DEFAULT 0,
 handling_usd REAL NOT NULL DEFAULT 0,
 volume_divisor REAL NOT NULL DEFAULT 6000,
 min_units INTEGER NOT NULL,
 active INTEGER NOT NULL DEFAULT 0,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(country,method)
);
CREATE TABLE IF NOT EXISTS shipping_packaging (
 sku TEXT PRIMARY KEY,
 length_cm REAL NOT NULL CHECK(length_cm>0),
 width_cm REAL NOT NULL CHECK(width_cm>0),
 height_cm REAL NOT NULL CHECK(height_cm>0),
 units_per_package INTEGER NOT NULL DEFAULT 1 CHECK(units_per_package>0),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
