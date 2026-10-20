import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

const db=new DatabaseSync(':memory:');
db.exec(readFileSync('migrations/0001_core.sql','utf8'));
db.exec(readFileSync('migrations/0017_seed_canonical_product_catalog.sql','utf8'));

db.prepare(`INSERT INTO orders(id,reference,status,payment_status,currency,subtotal,shipping,tax,total)
 VALUES('o-unlinked','ME-UNLINKED','PAYMENT_PENDING','UNPAID','USD',850,100,0,950)`).run();
db.prepare(`INSERT INTO order_items(id,order_id,description,quantity,unit_price,line_total)
 VALUES('line-unlinked','o-unlinked','MING EAGLE Silent Basketball',50,17,850)`).run();

db.prepare(`INSERT INTO orders(id,reference,status,payment_status,currency,subtotal,shipping,tax,total)
 VALUES('o-linked','ME-LINKED','PAYMENT_PENDING','UNPAID','USD',149,14,0,163)`).run();
db.prepare(`INSERT INTO order_items(id,order_id,product_id,variant_id,description,quantity,unit_price,line_total)
 VALUES('line-linked','o-linked','catalog-p1','variant-p1-s7-orange','Flocked Silent Basketball Set | No. 7 | Orange',10,14.9,149)`).run();

db.prepare(`INSERT INTO orders(id,reference,status,payment_status,currency,subtotal,shipping,tax,total)
 VALUES('o-qa','ME-QA','PAYMENT_PENDING','UNPAID','USD',1,0,0,1)`).run();
db.prepare(`INSERT INTO order_items(id,order_id,description,quantity,unit_price,line_total)
 VALUES('line-qa','o-qa','QA TEST - DO NOT SEND',1,1,1)`).run();

const missing=db.prepare(`SELECT o.reference AS order_reference,o.status AS order_status,
 o.payment_status,o.currency,o.total AS order_total,i.id AS item_id,
 i.description,i.quantity,i.unit_price,i.line_total
 FROM orders o JOIN order_items i ON i.order_id=o.id
 WHERE i.product_id IS NULL OR i.variant_id IS NULL
 ORDER BY o.created_at ASC,o.reference,i.id`).all();
const catalog=db.prepare(`SELECT p.sku AS product_sku,p.name AS product_name,p.status AS product_status,
 v.variant_sku,v.name AS variant_name,v.size,v.color,v.retail_price
 FROM products p JOIN product_variants v ON v.product_id=p.id
 WHERE p.status='ACTIVE' AND v.active=1
 ORDER BY p.sort_order,p.sku,CAST(v.size AS INTEGER),v.color`).all();

assert.equal(missing.length,2,'report shows only unlinked lines');
assert.deepEqual(new Set(missing.map(x=>x.order_reference)),new Set(['ME-UNLINKED','ME-QA']));
assert.equal(catalog.length,39,'catalog candidates are exposed for manual review');
assert.equal(missing.find(x=>x.order_reference==='ME-UNLINKED').description,'MING EAGLE Silent Basketball',
 'report preserves ambiguous original descriptions and does not guess a match');
assert.equal(db.prepare("SELECT product_id FROM order_items WHERE id='line-unlinked'").get().product_id,null);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM quotes").get().n,0,'report never creates quotations');
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM payments").get().n,0,'report never creates payment evidence');
console.log('PASS: read-only catalog reconciliation report query preserves ambiguity and performs no writes');
