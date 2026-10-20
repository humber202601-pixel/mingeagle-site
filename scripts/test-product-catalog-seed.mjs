import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

const db = new DatabaseSync(':memory:');
db.exec(readFileSync('migrations/0001_core.sql', 'utf8'));
const migration = readFileSync('migrations/0017_seed_canonical_product_catalog.sql', 'utf8');
db.exec(migration);

const count = (sql) => Number(db.prepare(sql).get().n);
assert.equal(count('SELECT COUNT(*) AS n FROM products'), 4, 'four canonical product families');
assert.equal(count('SELECT COUNT(*) AS n FROM product_variants'), 39, 'all published size/color combinations');
assert.equal(count("SELECT COUNT(*) AS n FROM product_variants WHERE product_id=(SELECT id FROM products WHERE sku='P1')"), 12);
assert.equal(count("SELECT COUNT(*) AS n FROM product_variants WHERE product_id=(SELECT id FROM products WHERE sku='P2')"), 6);
assert.equal(count("SELECT COUNT(*) AS n FROM product_variants WHERE product_id=(SELECT id FROM products WHERE sku='P3')"), 16);
assert.equal(count("SELECT COUNT(*) AS n FROM product_variants WHERE product_id=(SELECT id FROM products WHERE sku='P4')"), 5);
assert.equal(count('SELECT COUNT(*) AS n FROM product_variants v LEFT JOIN products p ON p.id=v.product_id WHERE p.id IS NULL'), 0, 'all variants have a parent product');
assert.equal(count('SELECT COUNT(*) AS n FROM price_tiers'), 0, 'do not infer wholesale prices from retail references');

const expected = [
  ['P1-S3-ORANGE', 9.9], ['P2-S5-GREEN', 12.9],
  ['P3-S7-AQUA-BLUE', 21.9], ['P4-S5-BLACK-GOLD', 17.9]
];
for (const [sku, price] of expected) {
  const row = db.prepare('SELECT retail_price FROM product_variants WHERE variant_sku=?').get(sku);
  assert.ok(row, 'expected published variant ' + sku);
  assert.equal(Number(row.retail_price), price, 'published retail reference for ' + sku);
}

// Idempotence: applying the migration again must not duplicate or rewrite catalog rows.
db.exec(migration);
assert.equal(count('SELECT COUNT(*) AS n FROM products'), 4);
assert.equal(count('SELECT COUNT(*) AS n FROM product_variants'), 39);
console.log('PASS: canonical product catalog migration (4 products, 39 variants, idempotent, no wholesale price tiers)');
