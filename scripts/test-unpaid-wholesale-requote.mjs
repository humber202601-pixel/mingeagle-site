import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
const result=await build({entryPoints:['functions/api/admin/unpaid-wholesale-requote.ts'],
 bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
const {onRequestPost}=await import('data:text/javascript;base64,'+
 Buffer.from(result.outputFiles[0].text).toString('base64'));
const middleware=readFileSync('functions/_middleware.ts','utf8');
assert.match(middleware,/previewWrites\\s*=\\s*new Set\\([\\s\\S]*['"]\\/api\\/admin\\/unpaid-wholesale-requote['"]/,
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
   sqlite.prepare('UPDATE orders SET payment_status=? WHERE id=?').run(op.status,op.id);
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
 sqlite.prepare(`INSERT INTO quotes(id,reference,status,currency,subtotal,discount,shipping,tax,total,
  payment_terms,shipping_terms,valid_until)
  VALUES(?,?,'CONVERTED','USD',150,0,30,0,180,'Accepted original Stripe terms',
  'DDP sea freight; Ship-to state: TX',date('now','+10 days'))`)
  .run(quoteId,'ME-Q-'+name);
 sqlite.prepare(`INSERT INTO orders(id,reference,quote_id,status,payment_status,currency,
  subtotal,discount,shipping,tax,total)
  VALUES(?,?,?,'PAYMENT_PENDING','UNPAID','USD',150,0,30,0,180)`)
  .run(orderId,ref,quoteId);
 sqlite.prepare(`INSERT INTO order_items(id,order_id,description,quantity,unit_price,line_total)
  VALUES(?,?,?,10,15,150)`)
  .run('line-'+name,orderId,'Flocked Silent Basketball Set | No. 7 | Orange');
 return {quoteId,orderId,ref};
};
try{
 assert.equal((await call('')).status,400);
 assert.equal((await call('ME-O-MISSING')).status,404);
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
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM quotes').get().n,2);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM tasks').get().n,1,
  'A double-click cannot schedule duplicate outreach');
 sqlite.prepare("UPDATE orders SET payment_status='PAID' WHERE id=?").run(source.orderId);
 assert.equal((await call(source.ref)).status,409,'A paid original order may never be requoted or duplicated');
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
 const late=setup('ROLLBACK');
 sqlite.exec(`CREATE TRIGGER stop_recovery_activity BEFORE INSERT ON activities
  WHEN NEW.activity_type='UNPAID_ORDER_REQUOTE_DRAFT'
  BEGIN SELECT RAISE(ABORT,'synthetic late audit failure');END;`);
 const activityCount=sqlite.prepare('SELECT COUNT(*) n FROM activities').get().n;
 response=await call(late.ref);
 assert.equal(response.status,409);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM quotes').get().n,before+1,
  'Rollback must remove all new draft records, not the legitimate source');
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM activities').get().n,activityCount);
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM b2b_recovery_quote_links WHERE source_order_id=?").get(late.orderId).n,0);
 console.log('PASS: owner-only draft replacement for unpaid 10+ unit wholesale is Stripe-safe, idempotent, finance-gated, atomic, never mailed or charged.');
}finally{sqlite.close();}
