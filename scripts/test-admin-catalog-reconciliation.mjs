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

const endpointSource=readFileSync('functions/api/admin/catalog-reconciliation.ts','utf8');
const uiSource=readFileSync('src/OrderManager.tsx','utf8');
assert.match(endpointSource,/env\.ADMIN_ACCESS_KEY/,'report requires the existing server-side admin key');
assert.match(endpointSource,/LEFT JOIN inquiries iq ON iq\.lead_id=o\.lead_id/,'report includes the original inquiry context');
assert.match(endpointSource,/iq\.size_preference,iq\.color_preference/,'report exposes original size and color preferences');
assert.match(uiSource,/询盘\/规格线索/,'UI presents original inquiry context for manual matching');
assert.match(uiSource,/查看线索/,'UI makes the original inquiry context inspectable');
assert.match(endpointSource,/request\.headers\.get\('x-admin-key'\)/,'report validates the existing admin request header');
assert.match(endpointSource,/return reply\(\{ok:false,error:'Unauthorized\.'\},401\)/,'report fails closed for unauthorized requests');
assert.match(uiSource,/fetch\('\/api\/admin\/catalog-reconciliation'/,'order manager calls the reconciliation endpoint');
assert.match(uiSource,/headers: \{ 'x-admin-key': accessKey \}/,'UI uses the current authenticated admin session');
assert.match(uiSource,/仅人工确认后保存商品\/规格关联/,'UI explains manual-only association behavior');
assert.match(uiSource,/saveCatalogMatch/,'UI exposes the manual association action');
assert.match(uiSource,/confirmOriginalEvidence: true/,'UI requires explicit confirmation of original evidence');
const matchSource=readFileSync('functions/api/admin/order-item-catalog-match.ts','utf8');
assert.match(matchSource,/env\.ADMIN_ACCESS_KEY/,'association endpoint requires the existing server-side admin key');
assert.match(matchSource,/Unauthorized\.'\},401/,'association endpoint rejects unauthorized requests');
assert.match(matchSource,/confirmOriginalEvidence!==true/,'association endpoint requires explicit evidence confirmation');
assert.match(matchSource,/order_item_catalog_audit/,'association endpoint records an audit trail');
assert.match(matchSource,/product_id=\?,variant_id=\?/,'association endpoint only updates product/variant association fields');
assert.doesNotMatch(matchSource,/UPDATE orders SET|UPDATE payments SET|UPDATE quotes SET/,'association endpoint does not mutate financial records');
console.log('PASS: reconciliation endpoint is wired to existing admin auth and read-only admin UI');

const guardedSource=readFileSync('functions/api/admin/order-item-catalog-match.ts','utf8');
assert.match(guardedSource,/source\.status!=='PAYMENT_PENDING'\|\|source\.payment_status!=='UNPAID'/,
 'paid and completed historical orders are blocked before mutations');
assert.match(guardedSource,/HISTORICAL_PAYMENT_REVIEW_REQUIRED/,
 'separate reconciliation of historical paid orders is required');
assert.equal((guardedSource.match(/o\.status='PAYMENT_PENDING' AND o\.payment_status='UNPAID'/g)||[]).length,2,
 'audit insert and association update independently recheck unpaid pending state');
assert.equal((guardedSource.match(/p\.status='ACTIVE' AND v\.active=1/g)||[]).length,2,
 'audit insert and association update independently recheck active catalog linkage');
assert.equal((guardedSource.match(/NOT LIKE '%QA TEST%'/g)||[]).length,2,
 'QA exclusion is rechecked during both writes');
console.log('PASS: catalog association blocks paid/completed historical orders and rechecks each mutation');

const evidenceEndpoint=readFileSync('functions/api/admin/order-item-catalog-match.ts','utf8');
const evidenceUi=readFileSync('src/OrderManager.tsx','utf8');
assert.match(evidenceEndpoint,/evidenceReference\.length<12\|\|evidenceReference\.length>500/,'server rejects missing and oversized evidence references');
assert.match(evidenceEndpoint,/order_item_catalog_evidence/,'evidence is persisted in a dedicated audit companion table');
assert.match(evidenceEndpoint,/result\?\.\[2\]\?\.meta\?\.changes/,'save checks audit, item association and evidence insert in a single batch');
assert.match(evidenceUi,/evidenceReference, confirmOriginalEvidence: true/,'admin UI submits evidence to the API');
assert.match(evidenceUi,/line\.order_status!=='PAYMENT_PENDING'\|\|line\.payment_status!=='UNPAID'/,'admin UI blocks paid and completed orders');
console.log('PASS: manual order matching requires stored purchase evidence and hides paid order writes');

await import('./test-admin-catalog-match-transaction.mjs');
