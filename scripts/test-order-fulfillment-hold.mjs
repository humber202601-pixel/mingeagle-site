import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {build} from 'esbuild';

// Isolated D1-shaped SQLite fixture: no live accounts, payments or emails.
const bundled=await build({entryPoints:['functions/api/admin/order-action.ts'],
  bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
const {onRequestPost}=await import('data:text/javascript;base64,'+
  Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const sqlite=new DatabaseSync(':memory:');
for(const file of readdirSync('migrations').filter(x=>x.endsWith('.sql')).sort())
 sqlite.exec(readFileSync('migrations/'+file,'utf8'));
let writes=0;
const db={
 prepare(sql){
  const q={args:[],bind(...args){this.args=args;return this},
   async first(){return sqlite.prepare(sql).get(...this.args)||null},
   async all(){return {success:true,results:sqlite.prepare(sql).all(...this.args)}},
   async run(){const res=sqlite.prepare(sql).run(...this.args);writes++;return {success:true,meta:{changes:res.changes}}}
  };return q;
 }
};
const orderId='order-synthetic-hold',ref='ME-RO-SYNTHETIC-HOLD';
sqlite.prepare("INSERT INTO orders(id,reference,status,payment_status,total,currency) VALUES (?,?,'PAID','PAID',180,'USD')")
 .run(orderId,ref);
const reviewId='review-synthetic';
sqlite.prepare("INSERT INTO tasks(id,order_id,type,title,status,priority) VALUES (?,?,'PAYMENT',?,'OPEN','URGENT')")
 .run(reviewId,orderId,'Review disputed Stripe receipts for '+ref);
const call=async(action,details={})=>{
 const request=new Request('https://synthetic.example/api/admin/order-action',{method:'POST',
 headers:{'content-type':'application/json'},
 body:JSON.stringify({orderReference:ref,action,...details})});
 const response=await onRequestPost({request,env:{MINGEAGLE_DB:db}});
 return {status:response.status,body:await response.json()};
};
const track={carrier:'Test Carrier',service:'Test Sea',trackingNumber:'SYNTHETIC-TRACK-001',
 trackingUrl:'https://example.invalid/track'};
for(const action of ['START_PROCESSING','READY_TO_SHIP','SHIP']){
 const before=writes,result=await call(action,action==='SHIP'?track:{});
 assert.equal(result.status,409,'Unresolved payment dispute must block '+action);
 assert.equal(result.body.code,'PAYMENT_RECONCILIATION_HOLD');
 assert.equal(writes,before,'Payment dispute must block before all D1 writes');
 assert.equal(sqlite.prepare('SELECT status FROM orders WHERE id=?').get(orderId).status,'PAID');
}
sqlite.prepare("UPDATE tasks SET status='IN_PROGRESS' WHERE id=?").run(reviewId);
assert.equal((await call('READY_TO_SHIP')).status,409,'IN_PROGRESS review remains a hold');
sqlite.prepare("UPDATE tasks SET status='DONE' WHERE id=?").run(reviewId);
// Even when staff close a review task, a historic PAID label without a
// provider-linked Stripe receipt cannot release an order for fulfillment.
for(const action of ['START_PROCESSING','READY_TO_SHIP','SHIP','DELIVER','COMPLETE']){
 const heldWrites=writes;
 const blocked=await call(action,action==='SHIP'?track:{});
 assert.equal(blocked.status,409,'Unverified historic PAID must block '+action);
 assert.equal(blocked.body.code,'PAYMENT_EVIDENCE_REQUIRED');
 assert.equal(writes,heldWrites,'No D1 writes allowed before receipt verification');
}
sqlite.prepare(`INSERT INTO payment_provider_sessions
 (id,order_id,provider,provider_intent_id,request_id,amount,currency,status)
 VALUES('session-synthetic-hold',?,'STRIPE','cs_test_synthetic_hold','request_synthetic_hold',180,'USD','SUCCEEDED')`).run(orderId);
sqlite.prepare(`INSERT INTO payments
 (id,order_id,method,provider,provider_reference,amount,currency,status)
 VALUES('payment-synthetic-hold',?,'ONLINE_PAYMENT','STRIPE','cs_test_synthetic_hold',180,'USD','RECEIVED')`).run(orderId);
// Mixed receipts or overpayment may not bypass the guard, even with a
// succeeded provider session matching the original amount.
sqlite.prepare(`INSERT INTO payments
 (id,order_id,method,provider_reference,amount,currency,status)
 VALUES('extra-manual-synthetic',?,'BANK_TRANSFER','synthetic-only',5,'USD','RECEIVED')`).run(orderId);
assert.equal((await call('START_PROCESSING')).body.code,'PAYMENT_EVIDENCE_REQUIRED');
sqlite.prepare("DELETE FROM payments WHERE id='extra-manual-synthetic'").run();
sqlite.prepare("UPDATE payments SET amount=185 WHERE id='payment-synthetic-hold'").run();
assert.equal((await call('START_PROCESSING')).body.code,'PAYMENT_EVIDENCE_REQUIRED');
sqlite.prepare("UPDATE payments SET amount=180 WHERE id='payment-synthetic-hold'").run();
const processing=await call('START_PROCESSING');
assert.equal(processing.status,200,JSON.stringify(processing.body));
assert.equal(processing.body.order.status,'PROCESSING');
let before=writes;
const again=await call('START_PROCESSING');
assert.equal(again.status,200);assert.equal(again.body.unchanged,true);
assert.equal(writes,before,'Duplicate processing action must do no work');
assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM tasks WHERE order_id=? AND title LIKE 'Prepare % for shipment'").get(orderId).n,1);
const ready=await call('READY_TO_SHIP');
assert.equal(ready.status,200,JSON.stringify(ready.body));
before=writes;
const readyAgain=await call('READY_TO_SHIP');
assert.equal(readyAgain.status,200);assert.equal(readyAgain.body.unchanged,true);
assert.equal(writes,before,'Duplicate ready-to-ship action must not add fulfillment tasks');
const shipped=await call('SHIP',track);
assert.equal(shipped.status,200,JSON.stringify(shipped.body));
before=writes;
const shippedAgain=await call('SHIP',track);
assert.equal(shippedAgain.status,200);assert.equal(shippedAgain.body.unchanged,true);
assert.equal(writes,before,'Identical tracking must not produce repeat shipment and email activity');
assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM tasks WHERE order_id=? AND type='DELIVERY_CHECK'").get(orderId).n,1);
// A payment dispute may be discovered only after shipping. It must still
// halt delivery confirmation and downstream reorder messaging/tasks.
sqlite.prepare("UPDATE tasks SET status='OPEN' WHERE id=?").run(reviewId);
for(const action of ['DELIVER','COMPLETE']){
 const priorWrites=writes;
 const denied=await call(action);
 assert.equal(denied.status,409,'Post-shipment payment hold must block '+action);
 assert.equal(denied.body.code,'PAYMENT_RECONCILIATION_HOLD');
 assert.equal(writes,priorWrites,'No D1 writes under post-shipment review: '+action);
 assert.equal(sqlite.prepare('SELECT status FROM orders WHERE id=?').get(orderId).status,'SHIPPED');
}
assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM tasks WHERE order_id=? AND type='REORDER'").get(orderId).n,0,
 'No reorder campaign should begin while shipped payment is disputed');
sqlite.prepare("UPDATE tasks SET status='IN_PROGRESS' WHERE id=?").run(reviewId);
assert.equal((await call('DELIVER')).status,409,'IN_PROGRESS review blocks delivery confirmation');
sqlite.prepare("UPDATE tasks SET status='DONE' WHERE id=?").run(reviewId);
const delivered=await call('DELIVER');
assert.equal(delivered.status,200,JSON.stringify(delivered.body));
before=writes;
const deliveredAgain=await call('DELIVER');
assert.equal(deliveredAgain.status,200);assert.equal(deliveredAgain.body.unchanged,true);
assert.equal(writes,before,'Repeated delivery event must not schedule duplicate reorder prompts');
assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM tasks WHERE order_id=? AND type='REORDER'").get(orderId).n,1);
// A dispute raised after proof-of-delivery must also block final completion.
sqlite.prepare("UPDATE tasks SET status='OPEN' WHERE id=?").run(reviewId);
const completeHoldWrites=writes;
const deniedCompletion=await call('COMPLETE');
assert.equal(deniedCompletion.status,409,'Payment hold blocks completed status after delivery');
assert.equal(deniedCompletion.body.code,'PAYMENT_RECONCILIATION_HOLD');
assert.equal(writes,completeHoldWrites);
assert.equal(sqlite.prepare('SELECT status FROM orders WHERE id=?').get(orderId).status,'DELIVERED');
sqlite.prepare("UPDATE tasks SET status='DONE' WHERE id=?").run(reviewId);
const completed=await call('COMPLETE');
assert.equal(completed.status,200,JSON.stringify(completed.body));
before=writes;
const completedAgain=await call('COMPLETE');
assert.equal(completedAgain.status,200);assert.equal(completedAgain.body.unchanged,true);
assert.equal(writes,before,'Repeated completion must not re-log activities');
assert.equal(sqlite.prepare('SELECT status FROM orders WHERE id=?').get(orderId).status,'COMPLETED');
console.log('PASS: active Stripe disputes block processing, shipping, delivery and completion; repeated lifecycle actions remain idempotent.');
sqlite.close();
