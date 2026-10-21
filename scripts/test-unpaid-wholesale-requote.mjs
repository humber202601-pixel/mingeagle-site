import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
const result=await build({entryPoints:['functions/api/admin/unpaid-wholesale-requote.ts'],
 bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
const {onRequestPost}=await import('data:text/javascript;base64,'+
 Buffer.from(result.outputFiles[0].text).toString('base64'));
const readinessSource=readFileSync('functions/api/admin/unpaid-wholesale-requote-readiness.ts','utf8');
assert.match(readinessSource,/onRequestGet/,'readiness uses GET only');
assert.match(readinessSource,/ADMIN_ACCESS_KEY/,'readiness requires admin authorization');
assert.match(readinessSource,/SOURCE_CATALOG_EVIDENCE_REQUIRED/,'readiness explains evidence gaps');
assert.match(readinessSource,/SOURCE_PAYMENT_REVIEW_REQUIRED/,'readiness flags payment evidence');
assert.doesNotMatch(readinessSource,/CREATE TABLE|INSERT INTO|UPDATE orders|UPDATE order_items|DELETE FROM/,'readiness may not mutate D1');
assert.match(readFileSync('src/OrderManager.tsx','utf8'),/checkRecoveryReadiness/,'admin displays read-only readiness diagnostics');
const orderManagerGuard=readFileSync('src/OrderManager.tsx','utf8');
assert.match(orderManagerGuard,/const freshResponse=await fetch\('\/api\/admin\/catalog-reconciliation'/,
 'draft click must refresh current matching report');
assert.match(orderManagerGuard,/setReport\(fresh\)/,'fresh report replaces stale visual state');
assert.match(orderManagerGuard,/fresh\.missingLines\?\.some\(line=>line\.order_reference===orderReference\)/,
 'newly unlinked lines prevent requote even if previous report was clear');
assert.ok(orderManagerGuard.indexOf("const freshResponse=await fetch('/api/admin/catalog-reconciliation'") <
 orderManagerGuard.indexOf("const response=await fetch('/api/admin/unpaid-wholesale-requote'"),
 'read-only preflight runs before draft creation POST');

assert.match(orderManagerGuard,/report===null \|\| Boolean\(report\.missingLines\?\.some\(line=>line\.order_reference===reference\)\)/,
 'replacement quote button requires a loaded reconciliation report with no unlinked line');
assert.match(orderManagerGuard,/待补齐商品凭证 · 暂不可恢复报价/,
 'unlinked order displays the missing procurement evidence explanation');
const middleware=readFileSync('functions/_middleware.ts','utf8');
const orderManager=readFileSync('src/OrderManager.tsx','utf8');
assert.ok(orderManager.includes("order.quote_id==null") && orderManager.includes("text(order.quote_status)==='CONVERTED'"),
 'The admin recovery action must be visible for unlinked legacy orders and converted-quote orders.');
assert.ok(middleware.includes("'/api/admin/unpaid-wholesale-requote'"),
 'The guarded recovery action must also work in isolated preview.');
const sqlite=new DatabaseSync(':memory:');
for(const file of readdirSync('migrations').filter(x=>x.endsWith('.sql')).sort())
 sqlite.exec(readFileSync('migrations/'+file,'utf8'));
let concurrency=null;
const db={
 prepare(sql){return {sql,args:[],bind(...args){this.args=args;return this;},
  async first(){return sqlite.prepare(sql).get(...this.args)||null},
  async all(){return {results:sqlite.prepare(sql).all(...this.args)}},
  async run(){const q=sqlite.prepare(sql).run(...this.args);return {success:true,meta:{changes:Number(q.changes)}}}
 }},
 async batch(items){
  if(concurrency){
   const op=concurrency;concurrency=null;
   if(op.status)sqlite.prepare('UPDATE orders SET payment_status=? WHERE id=?').run(op.status,op.id);
   if(op.description)sqlite.prepare('UPDATE order_items SET description=? WHERE order_id=?').run(op.description,op.id);
  }
  sqlite.exec('BEGIN');
  try{
   const rows=[];
   for(const x of items)rows.push(await x.run());
   sqlite.exec('COMMIT');return rows;
  }catch(e){sqlite.exec('ROLLBACK');console.error('SYNTHETIC_D1_BATCH_ERROR',String(e));throw e}
 }
};
const call=async ref=>{
 const r=await onRequestPost({env:{MINGEAGLE_DB:db},request:new Request('https://app.test/api/admin/unpaid-wholesale-requote',{
  method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({orderReference:ref})})});
 return {status:r.status,body:await r.json()};
};
const setup=(name)=>{
 const quoteId='src-quote-'+name,orderId='src-order-'+name,ref='ME-O-'+name;
 const productId='product-'+name,variantId='variant-'+name;
 sqlite.prepare(`INSERT INTO products(id,sku,slug,name,status) VALUES(?,?,?,?,'ACTIVE')`)
  .run(productId,'SKU-'+name,'slug-'+name,'Silent Basketball '+name);
 sqlite.prepare(`INSERT INTO product_variants(id,product_id,variant_sku,name,active) VALUES(?,?,?,?,1)`)
  .run(variantId,productId,'VAR-'+name,'No. 7 Orange');
 sqlite.prepare(`INSERT INTO quotes(id,reference,status,currency,subtotal,discount,shipping,tax,total,
  payment_terms,shipping_terms,valid_until)
  VALUES(?,?,'CONVERTED','USD',150,0,30,0,180,'Accepted original Stripe terms',
  'DDP sea freight; Ship-to state: TX',date('now','+10 days'))`)
  .run(quoteId,'ME-Q-'+name);
 sqlite.prepare(`INSERT INTO orders(id,reference,quote_id,status,payment_status,currency,
  subtotal,discount,shipping,tax,total)
  VALUES(?,?,?,'PAYMENT_PENDING','UNPAID','USD',150,0,30,0,180)`)
  .run(orderId,ref,quoteId);
 sqlite.prepare(`INSERT INTO order_items(id,order_id,product_id,variant_id,description,quantity,unit_price,line_total)
  VALUES(?,?,?,?,?,10,15,150)`)
  .run('line-'+name,orderId,productId,variantId,'Flocked Silent Basketball Set | No. 7 | Orange');
 return {quoteId,orderId,ref};
};
try{
 assert.equal((await call('')).status,400);
 assert.equal((await call('ME-O-MISSING')).status,404);
 const qa=setup('QA-BLOCKED');
 sqlite.prepare("UPDATE order_items SET description='QA TEST - MING EAGLE Silent Basketball - DO NOT SEND' WHERE order_id=?").run(qa.orderId);
 const quoteCountBeforeQa=sqlite.prepare('SELECT COUNT(*) n FROM quotes').get().n;
 const qaResponse=await call(qa.ref);
 assert.equal(qaResponse.status,409,'A QA/demo order must never become a customer quote');
 assert.equal(qaResponse.body.code,'SOURCE_TEST_ORDER_BLOCKED');
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM quotes').get().n,quoteCountBeforeQa,
  'Blocking a test order must not create a replacement quote');
 assert.equal(sqlite.prepare('SELECT status,payment_status,total FROM orders WHERE id=?').get(qa.orderId).payment_status,'UNPAID',
  'Blocking a QA order must leave the historical order unchanged');
 const quoteCountBeforeSource=sqlite.prepare('SELECT COUNT(*) n FROM quotes').get().n;
 const source=setup('SOURCE');
 let response=await call(source.ref);
 assert.equal(response.status,201,JSON.stringify(response.body));
 assert.equal(response.body.reused,false);
 assert.equal(response.body.quote.status,'DRAFT');
 assert.equal(response.body.quote.total,180,'Historical DDP shipping is a draft snapshot only');
 const replacementId=response.body.quote.id, replacementRef=response.body.quote.reference;
 const original=sqlite.prepare('SELECT status,payment_status,total FROM orders WHERE id=?').get(source.orderId);
 assert.equal(original.status,'PAYMENT_PENDING');
 assert.equal(original.payment_status,'UNPAID');
 assert.equal(original.total,180,'The original order must never be edited or marked PAID');
 const quote=sqlite.prepare('SELECT * FROM quotes WHERE id=?').get(replacementId);
 assert.equal(quote.status,'DRAFT');assert.equal(quote.tax_basis,null);
 assert.equal(quote.tax,0);assert.equal(quote.notes,null);
 assert.equal(quote.public_token_hash,null,'New quote must not have a customer pay link');
 assert.match(quote.shipping_terms,/require fresh seller approval/);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM quote_items WHERE quote_id=?').get(replacementId).n,1);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM tasks').get().n,1);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM activities').get().n,1);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM b2b_recovery_quote_links').get().n,1);
 response=await call(source.ref);
 assert.equal(response.status,200,'Retry may reuse an existing safe draft');
 assert.equal(response.body.reused,true);assert.equal(response.body.quote.id,replacementId);
 assert.equal(response.body.quote.reference,replacementRef);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM quotes').get().n,quoteCountBeforeSource+2,
  'Only the source quote and one replacement draft may be added');
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM tasks').get().n,1,
  'A double-click cannot schedule duplicate outreach');
 sqlite.prepare("UPDATE orders SET payment_status='PAID' WHERE id=?").run(source.orderId);
 assert.equal((await call(source.ref)).status,409,'A paid original order may never be requoted or duplicated');
 // Historical unpaid orders can exist without a quote_id. They must still
 // reconcile exactly and can only create a fresh, unapproved draft.
 const orphanId='src-order-ORPHAN', orphanRef='ME-O-ORPHAN';
 sqlite.prepare(`INSERT INTO orders(id,reference,quote_id,status,payment_status,currency,
  subtotal,discount,shipping,tax,total)
  VALUES(?,?,NULL,'PAYMENT_PENDING','UNPAID','USD',150,0,30,0,180)`)
  .run(orphanId,orphanRef);
 sqlite.prepare(`INSERT INTO products(id,sku,slug,name,status) VALUES('product-ORPHAN','SKU-ORPHAN','slug-ORPHAN','Silent Basketball ORPHAN','ACTIVE')`).run();
 sqlite.prepare(`INSERT INTO product_variants(id,product_id,variant_sku,name,active) VALUES('variant-ORPHAN','product-ORPHAN','VAR-ORPHAN','No. 7 Orange',1)`).run();
 sqlite.prepare(`INSERT INTO order_items(id,order_id,product_id,variant_id,description,quantity,unit_price,line_total)
  VALUES(?,?,?,?,?,10,15,150)`)
  .run('line-ORPHAN',orphanId,'product-ORPHAN','variant-ORPHAN','Flocked Silent Basketball Set | No. 7 | Orange');
 response=await call(orphanRef);
 assert.equal(response.status,409,'Orphan quote recovery must reject an undocumented catalog match');
 assert.equal(response.body.code,'SOURCE_CATALOG_EVIDENCE_REQUIRED');
 sqlite.exec(`CREATE TABLE IF NOT EXISTS order_item_catalog_audit(
 id TEXT PRIMARY KEY,order_id TEXT NOT NULL,order_item_id TEXT NOT NULL,
 new_product_id TEXT NOT NULL,new_variant_id TEXT NOT NULL)`);
 sqlite.exec(`CREATE TABLE IF NOT EXISTS order_item_catalog_evidence(
 audit_id TEXT PRIMARY KEY,order_item_id TEXT NOT NULL,evidence_reference TEXT NOT NULL)`);
 sqlite.prepare("INSERT INTO order_item_catalog_audit(id,order_id,order_item_id,new_product_id,new_variant_id) VALUES('audit-orphan',?,?,?,?)")
  .run(orphanId,'line-ORPHAN','product-ORPHAN','variant-ORPHAN');
 response=await call(orphanRef);
 assert.equal(response.status,409,'An audit without original buyer evidence is not enough');
 sqlite.prepare("INSERT INTO order_item_catalog_evidence(audit_id,order_item_id,evidence_reference) VALUES('audit-orphan','line-ORPHAN','buyer-confirmation-email-2026-10-21')").run();
 response=await call(orphanRef);
 assert.equal(response.status,201,'An audited documented legacy order may create only a fresh draft');
 assert.equal(response.body.quote.status,'DRAFT');
 const orphanDraft=sqlite.prepare('SELECT status,tax_basis,public_token_hash FROM quotes WHERE id=?').get(response.body.quote.id);
 assert.equal(orphanDraft.status,'DRAFT');
 assert.equal(orphanDraft.tax_basis,null);
 assert.equal(orphanDraft.public_token_hash,null);
 assert.equal(sqlite.prepare('SELECT quote_id FROM orders WHERE id=?').get(orphanId).quote_id,null,
  'Recovery must not edit the original order or invent a source quote');
 assert.equal((await call(orphanRef)).status,200,'Retry must reuse the orphan order draft');
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM b2b_recovery_quote_links WHERE source_order_id=?").get(orphanId).n,1);
  const paid=setup('PAID');
 sqlite.prepare("UPDATE orders SET payment_status='PAID' WHERE id=?").run(paid.orderId);
 assert.equal((await call(paid.ref)).body.code,'SOURCE_ORDER_NOT_SAFE_FOR_REQUOTE');
 const partial=setup('PARTIAL');
 sqlite.prepare("UPDATE orders SET payment_status='PARTIAL' WHERE id=?").run(partial.orderId);
 assert.equal((await call(partial.ref)).status,409);
 const recorded=setup('RECORDED');
 sqlite.prepare(`INSERT INTO payments(id,order_id,method,amount,currency,status)
 VALUES('historical-payment',?,'BANK_TRANSFER',1,'USD','PENDING')`).run(recorded.orderId);
 assert.equal((await call(recorded.ref)).body.code,'SOURCE_PAYMENT_REVIEW_REQUIRED',
  'Even unresolved historical payment entries require manual reconciliation');
 const session=setup('SESSION');
 sqlite.prepare(`INSERT INTO payment_provider_sessions
  (id,order_id,provider,provider_intent_id,request_id,amount,currency,status)
  VALUES('synthetic-session',?,'STRIPE','cs_test_unpaid','req_test_unpaid',180,'USD','OPEN')`)
  .run(session.orderId);
 assert.equal((await call(session.ref)).body.code,'SOURCE_PAYMENT_REVIEW_REQUIRED');
 const small=setup('SAMPLE');
 sqlite.prepare("UPDATE order_items SET quantity=1,line_total=15 WHERE order_id=?").run(small.orderId);
 assert.equal((await call(small.ref)).body.code,'SOURCE_NOT_WHOLESALE');
 const missingProduct=setup('MISSING-PRODUCT');
 sqlite.prepare("UPDATE order_items SET product_id=NULL WHERE order_id=?").run(missingProduct.orderId);
 const missingProductCount=sqlite.prepare('SELECT COUNT(*) n FROM quotes').get().n;
 const missingProductResult=await call(missingProduct.ref);
 assert.equal(missingProductResult.status,409,'A legacy line without product association must not become a customer quote');
 assert.equal(missingProductResult.body.code,'SOURCE_PRODUCT_SNAPSHOT_REQUIRED');
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM quotes').get().n,missingProductCount,
  'Missing product association must not create a draft quote');
 const missingVariant=setup('MISSING-VARIANT');
 sqlite.prepare("UPDATE order_items SET variant_id=NULL WHERE order_id=?").run(missingVariant.orderId);
 const missingVariantResult=await call(missingVariant.ref);
 assert.equal(missingVariantResult.status,409,'A product with variants must have a valid variant snapshot');
 assert.equal(missingVariantResult.body.code,'SOURCE_PRODUCT_SNAPSHOT_REQUIRED');
 const tamper=setup('TAMPER');
 sqlite.prepare("UPDATE order_items SET line_total=149 WHERE order_id=?").run(tamper.orderId);
 assert.equal((await call(tamper.ref)).body.code,'SOURCE_LINE_ITEMS_INVALID');
 const badTotal=setup('BADTOTAL');
 sqlite.prepare("UPDATE orders SET total=179 WHERE id=?").run(badTotal.orderId);
 assert.equal((await call(badTotal.ref)).body.code,'SOURCE_LINE_ITEMS_INVALID',
  'Do not clone an order whose total does not reconcile with items and freight');
 const badTax=setup('BADTAX');
 sqlite.prepare("UPDATE orders SET tax=5 WHERE id=?").run(badTax.orderId);
 assert.equal((await call(badTax.ref)).body.code,'SOURCE_LINE_ITEMS_INVALID',
  'Tax changes must reconcile with the original total before preparing a new quote');
 const race=setup('RACE');
 concurrency={id:race.orderId,status:'PAID'};
 const before=sqlite.prepare('SELECT COUNT(*) n FROM quotes').get().n;
 response=await call(race.ref);
 assert.equal(response.status,409,'Concurrent Stripe payment must defeat the recovery transaction');
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM quotes').get().n,before,
  'No replacement quote may survive a race with PAID');
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM b2b_recovery_quote_links WHERE source_order_id=?").get(race.orderId).n,0);
 const lateQa=setup('LATE-QA');
 concurrency={id:lateQa.orderId,description:'QA TEST - DO NOT SEND'};
 const beforeLateQa=sqlite.prepare('SELECT COUNT(*) n FROM quotes').get().n;
 response=await call(lateQa.ref);
 assert.equal(response.status,409,'A QA marker added before the atomic batch must block recovery');
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM quotes').get().n,beforeLateQa,'Atomic QA guard must prevent draft creation');
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM b2b_recovery_quote_links WHERE source_order_id=?').get(lateQa.orderId).n,0);
 const late=setup('ROLLBACK');
 sqlite.exec(`CREATE TRIGGER stop_recovery_activity BEFORE INSERT ON activities
  WHEN NEW.activity_type='UNPAID_ORDER_REQUOTE_DRAFT'
  BEGIN SELECT RAISE(ABORT,'synthetic late audit failure');END;`);
 const activityCount=sqlite.prepare('SELECT COUNT(*) n FROM activities').get().n;
 const quoteCountBeforeLate=sqlite.prepare('SELECT COUNT(*) n FROM quotes').get().n;
 response=await call(late.ref);
 assert.equal(response.status,409);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM quotes').get().n,quoteCountBeforeLate,
  'Rollback must remove all new draft records, not the legitimate source');
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM activities').get().n,activityCount);
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM b2b_recovery_quote_links WHERE source_order_id=?").get(late.orderId).n,0);
 console.log('PASS: owner-only draft replacement for unpaid 10+ unit wholesale is Stripe-safe, idempotent, finance-gated, atomic, never mailed or charged.');
}finally{sqlite.close();}

await import('./test-unpaid-wholesale-readiness-runtime.mjs');
