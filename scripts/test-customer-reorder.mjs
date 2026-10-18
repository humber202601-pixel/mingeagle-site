import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const t=mkdtempSync(join(tmpdir(),'reorder-safe-'));
try{
 const p=join(t,'intent.mjs');await build({entryPoints:['src/reorderIntent.ts'],outfile:p,bundle:true,platform:'node',format:'esm',logLevel:'silent'});
 const {safeReorderReference,reorderMessage}=await import(pathToFileURL(p));
 assert.equal(safeReorderReference('me-q-ABC12345'), 'ME-Q-ABC12345');
 assert.match(reorderMessage('ME-Q-ABC12345'),/reconfirm products, quantities, destination/);
 for(const bad of [null,'','ME-Q-','abc<script>', 'Bearer abcdef', 'ME-Q-ABC12345?token=abc','https://x.evil/','ME-O-123456789']){
  assert.equal(safeReorderReference(bad),null);
  assert.equal(reorderMessage(bad),'');
 }
 assert(!reorderMessage('ME-Q-ABC12345').includes('token='));
 console.log('PASS: token-free repeat-order intent; invalid references never autofill or bypass customer confirmation.');
 // Isolated SQLite integration test for the actual admin reorder endpoint.
 // Deliberately no customer outreach, Stripe charge or production D1 writes.
 const {readFileSync}=await import('node:fs');
 const {DatabaseSync}=await import('node:sqlite');
 const compiled=join(t,'reorder-endpoint.mjs');
 await build({entryPoints:['functions/api/admin/reorder-quote.ts'],outfile:compiled,
   bundle:true,platform:'node',format:'esm',logLevel:'silent'});
 const {onRequestPost}=await import(pathToFileURL(compiled));
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(readFileSync('migrations/0001_core.sql','utf8'));
 sqlite.exec(readFileSync('migrations/0003_airwallex_payment_sessions.sql','utf8'));
 const db={
  prepare(sql){const stmt={args:[],bind(...a){this.args=a;return this;},
   async first(){return sqlite.prepare(sql).get(...this.args)||null;},
   async all(){return {results:sqlite.prepare(sql).all(...this.args)};},
   async run(){const row=sqlite.prepare(sql).run(...this.args);return {success:true,meta:{changes:Number(row.changes)}}}};return stmt;},
  async batch(items){sqlite.exec('BEGIN');try{const out=[];for(const x of items)out.push(await x.run());sqlite.exec('COMMIT');return out;}catch(e){sqlite.exec('ROLLBACK');throw e;}}
 };
 const run=async(ref)=>{const request=new Request('https://app.example/api/admin/reorder-quote',{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({orderReference:ref})});
  const r=await onRequestPost({request,env:{MINGEAGLE_DB:db}});
  return {status:r.status,data:await r.json()};};
 sqlite.exec(`INSERT INTO orders(id,reference,status,payment_status,currency,subtotal,shipping,tax,total)
  VALUES ('paid-old','ME-O-SUCCESS','COMPLETED','PAID','USD',120,18,6,144);
 INSERT INTO order_items(id,order_id,description,quantity,unit_price,line_total)
  VALUES ('item1','paid-old','Flocked Silent Basketball Set | No. 5 | Blue',10,8.50,85),
         ('item2','paid-old','Weighted Flocked Silent Basketball | No. 7 | Black',5,7.00,35);
 INSERT INTO orders(id,reference,status,payment_status,currency,subtotal,shipping,total)
  VALUES('unpaid-old','ME-O-UNPAID','PAYMENT_PENDING','UNPAID','USD',20,5,25);
 INSERT INTO order_items(id,order_id,description,quantity,unit_price,line_total)
  VALUES('item3','unpaid-old','Historical unmatched payment order',10,2,20);`);
 let response=await run('ME-O-UNPAID');
 assert.equal(response.status,409,'Unpaid historical orders must not be reused as approved reorders');
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM quotes').get().n,0);
 // A historical COMPLETED/PAID source without payment evidence must not
 // create a new quote, task, activity or schedule a contact follow-up.
 response=await run('ME-O-SUCCESS');
 assert.equal(response.status,409);
 assert.equal(response.data.code,'REORDER_PAYMENT_EVIDENCE_REQUIRED');
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM quotes').get().n,0);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM tasks').get().n,0);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM activities').get().n,0);
 sqlite.exec(`INSERT INTO payment_provider_sessions
   (id,order_id,provider,provider_intent_id,request_id,amount,currency,status)
   VALUES ('reorder-session','paid-old','STRIPE','cs_test_reorder_paid','request_reorder_paid',144,'USD','SUCCEEDED');
 INSERT INTO payments
   (id,order_id,method,provider,provider_reference,amount,currency,status)
   VALUES ('reorder-receipt','paid-old','ONLINE_PAYMENT','STRIPE','cs_test_reorder_paid',144,'USD','RECEIVED');`);
 sqlite.exec(`INSERT INTO payments
   (id,order_id,method,provider_reference,amount,currency,status)
   VALUES ('extra-bank','paid-old','BANK_TRANSFER','test-bank-only',1,'USD','RECEIVED')`);
 assert.equal((await run('ME-O-SUCCESS')).data.code,'REORDER_PAYMENT_EVIDENCE_REQUIRED',
  'Mixed historical payments must not be silently reused for repeat orders');
 sqlite.exec("DELETE FROM payments WHERE id='extra-bank'");
 sqlite.exec(`INSERT INTO tasks (id,order_id,type,title,status,priority)
   VALUES ('review-open','paid-old','PAYMENT','Review disputed Stripe receipts for synthetic','OPEN','URGENT')`);
 assert.equal((await run('ME-O-SUCCESS')).data.code,'REORDER_PAYMENT_EVIDENCE_REQUIRED',
  'Even verified Stripe receipts need open disputes cleared before generating follow-ups');
 sqlite.exec("UPDATE tasks SET status='DONE' WHERE id='review-open'");
 response=await run('ME-O-SUCCESS');
 assert.equal(response.status,201,JSON.stringify(response));
 assert.equal(response.data.quote.requiresReview,true);
 assert.equal(response.data.quote.total,138,'Old sales tax must not be silently carried over');
 const row=sqlite.prepare('SELECT * FROM quotes').get();
 assert.equal(row.status,'DRAFT');
 assert.equal(row.notes,null,'Internal factory-cost review instructions must not appear in public quote notes');
 assert.match(row.payment_terms,/Stripe card checkout/);
 assert.match(row.shipping_terms,/to be confirmed/);
 assert.equal(row.tax,0,'New sale tax needs independent review');
 assert.equal(row.shipping,18,'Old shipping charge is retained only as a draft snapshot');
 assert.equal(row.total,138);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM quote_items').get().n,2);
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM tasks WHERE type='REORDER'").get().n,1);
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM activities WHERE activity_type='REORDER_QUOTE_CREATED'").get().n,1);
 assert.equal(sqlite.prepare("SELECT status FROM orders WHERE id='paid-old'").get().status,'COMPLETED');
 // Inject a failure after draft and line inserts; rollback must leave no
 // orphan quote, line item, task or activity.
 sqlite.exec(`CREATE TRIGGER abort_reorder_task BEFORE INSERT ON tasks
   WHEN NEW.type='REORDER' BEGIN SELECT RAISE(ABORT,'synthetic insert failure'); END;`);
 response=await run('ME-O-SUCCESS');
 assert.equal(response.status,503,'Transaction failure should be explicit');
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM quotes').get().n,1,'No additional orphan quote on late failure');
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM quote_items').get().n,2,'No additional partial line items');
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM activities').get().n,1,'No additional orphan activity');
 sqlite.exec('DROP TRIGGER abort_reorder_task;');
 sqlite.prepare("UPDATE order_items SET line_total=35.01 WHERE id='item2'").run();
 response=await run('ME-O-SUCCESS');
 assert.equal(response.status,409,'Reorder cannot clone tampered historical line prices');
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM quotes').get().n,1);
 sqlite.close();
 console.log('PASS: fully paid completed order reorders atomically, Stripe-only draft, old tax reviewed, unpaid and bad totals blocked, rollback on late failure.');

}finally{rmSync(t,{recursive:true,force:true})}
