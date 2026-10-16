import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createHmac,webcrypto} from 'node:crypto';
import {build,transform} from 'esbuild';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
// The secure buyer page must not offer a second pay button when a
// signed Stripe receipt is succeeded but administrative reconciliation remains.
const publicPage=readFileSync('functions/quote/[token].ts','utf8');
assert(publicPage.includes("['PENDING','PENDING_REVIEW','SUCCEEDED']"),'Succeeded provider payment awaiting reconciliation suppresses duplicate pay action');
assert(publicPage.includes('Stripe receipt needs reconciliation.'),'Buyer sees manual review guidance without a paid claim');
const src=readFileSync('lib/closed-order-payment.ts','utf8');
const helper=(await transform(src,{loader:'ts',format:'esm'})).code;
const {requiresClosedOrderPaymentReview}=await import('data:text/javascript;base64,'+Buffer.from(helper).toString('base64'));
assert.equal(requiresClosedOrderPaymentReview({status:'CANCELLED',payment_status:'UNPAID'}),true);
assert.equal(requiresClosedOrderPaymentReview({status:'COMPLETED',payment_status:'REFUNDED'}),true);
assert.equal(requiresClosedOrderPaymentReview({status:'PAYMENT_PENDING',payment_status:'UNPAID'}),false);
const out=await build({entryPoints:['functions/api/payments/stripe/webhook.ts'],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
const {onRequestPost}=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
const sqlite=new DatabaseSync(':memory:');
for(const file of readdirSync('migrations').filter(x=>x.endsWith('.sql')).sort())sqlite.exec(readFileSync('migrations/'+file,'utf8'));
const db={
 prepare(sql){
  const obj={args:[],bind(...values){this.args=values;return this},
   async first(){return sqlite.prepare(sql).get(...this.args)||null},
   async all(){return {results:sqlite.prepare(sql).all(...this.args)}},
   async run(){const r=sqlite.prepare(sql).run(...this.args);return {success:true,meta:{changes:r.changes}}}
  };
  return obj;
 },
 async batch(stmts){return Promise.all(stmts.map(x=>x.run()))}
};
const secret='whsec_synthetic_test_only';
const env={MINGEAGLE_DB:db,STRIPE_WEBHOOK_SECRET:secret,STRIPE_MODE:'test'};
const scenarios=[
 {orderId:'order-cancelled',state:'CANCELLED',payment:'UNPAID',ref:'ME-RO-CANCELLED'},
 {orderId:'order-refunded',state:'COMPLETED',payment:'REFUNDED',ref:'ME-RO-REFUNDED'},
 {orderId:'order-open',state:'PAYMENT_PENDING',payment:'UNPAID',ref:'ME-RO-OPEN'}
];
for(const [i,o] of scenarios.entries()){
 sqlite.prepare('INSERT INTO orders(id,reference,status,payment_status,total,currency) VALUES (?,?,?,?,?,?)').run(o.orderId,o.ref,o.state,o.payment,28.9,'USD');
 sqlite.prepare('INSERT INTO payment_provider_sessions(id,order_id,provider,provider_intent_id,request_id,amount,currency,status) VALUES (?,?,\'STRIPE\',?,?,?,\'USD\',\'PENDING\')')
  .run('ses-'+i,o.orderId,'cs_test_late'+i,'req-'+i,28.9);
 const event={id:'evt-late-'+i,type:'checkout.session.completed',data:{object:{
  id:'cs_test_late'+i,client_reference_id:o.ref,
  payment_status:'paid',currency:'usd',amount_total:2890,
  metadata:{order_id:o.orderId,order_reference:o.ref}
 }}};
 const textBody=JSON.stringify(event),ts=Math.floor(Date.now()/1000),sig=createHmac('sha256',secret).update(ts+'.'+textBody).digest('hex');
 const call=()=>onRequestPost({env,request:new Request('https://app.mingeagle.com/api/payments/stripe/webhook',{
  method:'POST',headers:{'stripe-signature':'t='+ts+',v1='+sig},body:textBody
 })});
 const response=await call(),body=await response.json();
 assert.equal(response.status,200,JSON.stringify(body));
 const current=sqlite.prepare('SELECT status,payment_status FROM orders WHERE id=?').get(o.orderId);
 const payments=sqlite.prepare('SELECT COUNT(*) n FROM payments WHERE order_id=? AND status=\'RECEIVED\'').get(o.orderId);
 const fulfillment=sqlite.prepare('SELECT COUNT(*) n FROM tasks WHERE order_id=? AND type=\'FULFILLMENT\'').get(o.orderId);
 const review=sqlite.prepare("SELECT COUNT(*) n FROM tasks WHERE order_id=? AND type='PAYMENT' AND title LIKE 'Review payment on closed order%'").get(o.orderId);
 assert.equal(payments.n,1,'Signed payment must be recorded exactly once');
 if(o.state==='CANCELLED'||o.payment==='REFUNDED'){
  assert.equal(body.fulfillmentBlocked,true,'Closed order cannot trigger fulfillment');
  assert.equal(current.status,o.state,'Cancellation/closed order status must not be changed');
  assert.equal(current.payment_status,o.payment,'Refund state must not be overwritten');
  assert.equal(fulfillment.n,0,'No shipping task for closed order');
  assert.equal(review.n,1,'Urgent manual payment review created');
 }else{
  assert.equal(current.payment_status,'PAID');
  assert.equal(fulfillment.n,1,'Open fully paid order still triggers fulfillment');
 }
 const retry=await call();
 assert.equal(retry.status,200);
 assert.equal((await retry.json()).duplicate,true,'Repeated signed event is idempotent');
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM payments WHERE order_id=?').get(o.orderId).n,1);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM tasks WHERE order_id=? AND type=\'PAYMENT\'').get(o.orderId).n,review.n);
}
// A verified Stripe receipt must NOT silently combine with legacy bank
// payments, exceed the quote, or launch a second fulfillment on an order
// already shown as PAID. Preserve evidence, make an urgent staff task.
for(const [j,scenario] of [
 {kind:'mixed',total:28.9,oldPayment:'UNPAID',manual:true},
 {kind:'overpaid',total:20,oldPayment:'UNPAID',manual:false},
 {kind:'previously-paid',total:28.9,oldPayment:'PAID',manual:false}
].entries()){
 const orderId='order-risk-'+j,ref='ME-RO-RISK-'+j,sessionId='cs_test_risk'+j;
 sqlite.prepare("INSERT INTO orders(id,reference,status,payment_status,total,currency) VALUES (?,?,'PAYMENT_PENDING',?,?,'USD')")
  .run(orderId,ref,scenario.oldPayment,scenario.total);
 if(scenario.manual)sqlite.prepare(
  "INSERT INTO payments(id,order_id,method,provider,provider_reference,amount,currency,status) "+
  "VALUES (?,?,'BANK_TRANSFER','BANK_TRANSFER',?,2,'USD','RECEIVED')"
 ).run('manual-risk-'+j,orderId,'synthetic-manual-'+j);
 sqlite.prepare("INSERT INTO payment_provider_sessions(id,order_id,provider,provider_intent_id,request_id,amount,currency,status) "+
  "VALUES (?,?,'STRIPE',?, ?,28.9,'USD','PENDING')")
  .run('risk-session-'+j,orderId,sessionId,'risk-request-'+j);
 const event={id:'evt-risk-'+j,type:'checkout.session.completed',data:{object:{
  id:sessionId,client_reference_id:ref,payment_status:'paid',
  currency:'usd',amount_total:2890,metadata:{order_id:orderId,order_reference:ref}
 }}};
 const payload=JSON.stringify(event),timestamp=Math.floor(Date.now()/1000);
 const sig=createHmac('sha256',secret).update(timestamp+'.'+payload).digest('hex');
 const call=()=>onRequestPost({env,request:new Request('https://synthetic.example/api/payments/stripe/webhook',{
  method:'POST',body:payload,headers:{'stripe-signature':'t='+timestamp+',v1='+sig}
 })});
 const outcome=await call(),data=await outcome.json();
 assert.equal(outcome.status,200,'Signed anomalous payment must be acknowledged: '+scenario.kind);
 assert.equal(data.fulfillmentBlocked,true,'Block automatic fulfillment on '+scenario.kind);
 assert.equal(data.requiresManualReview,true);
 assert.equal(sqlite.prepare("SELECT payment_status FROM orders WHERE id=?").get(orderId).payment_status,
  scenario.oldPayment,'Reconciliation case must not automatically change payment status');
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM payments WHERE order_id=? AND provider='STRIPE' AND status='RECEIVED'").get(orderId).n,1,
  'Record the genuine signed Stripe receipt for later reconciliation');
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM tasks WHERE order_id=? AND type='FULFILLMENT'").get(orderId).n,0);
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM tasks WHERE order_id=? AND priority='URGENT' AND title LIKE 'Review disputed Stripe receipts%'").get(orderId).n,1);
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM activities WHERE entity_id=? AND activity_type='PAYMENT_RECONCILIATION_REQUIRED'").get(orderId).n,1);
 const duplicate=await call();
 assert.equal(duplicate.status,200);
 assert.equal((await duplicate.json()).duplicate,true);
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM payments WHERE order_id=? AND provider='STRIPE'").get(orderId).n,1);
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM tasks WHERE order_id=? AND priority='URGENT'").get(orderId).n,1);
}
const airwallexBundle=await build({entryPoints:['functions/api/payments/airwallex/webhook.ts'],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
const {onRequestPost:airwallexWebhook}=await import('data:text/javascript;base64,'+Buffer.from(airwallexBundle.outputFiles[0].text).toString('base64'));
const airwallexSecret='synthetic_airwallex_secret_only';
for(const [i,o] of scenarios.entries()){
 const orderId='aw-'+o.orderId,ref='AW-'+o.ref,intent='pi_synthetic_'+i;
 sqlite.prepare('INSERT INTO orders(id,reference,status,payment_status,total,currency) VALUES(?,?,?,?,?,?)')
  .run(orderId,ref,o.state,o.payment,28.9,'USD');
 sqlite.prepare("INSERT INTO payment_provider_sessions(id,order_id,provider,provider_intent_id,request_id,amount,currency,status) VALUES(?,?,'AIRWALLEX',?, ?,?,'USD','PENDING')")
  .run('aw-ses-'+i,orderId,intent,'aw-req-'+i,28.9);
 const event={id:'aw-event-'+i,name:'payment_intent.succeeded',data:{object:{
  id:intent,merchant_order_id:ref,currency:'USD',captured_amount:28.9,amount:28.9,status:'SUCCEEDED'
 }}};
 const raw=JSON.stringify(event),timestamp=String(Date.now());
 const signature=createHmac('sha256',airwallexSecret).update(timestamp+raw).digest('hex');
 const call=()=>airwallexWebhook({env:{MINGEAGLE_DB:db,AIRWALLEX_WEBHOOK_SECRET:airwallexSecret},
  request:new Request('https://app.mingeagle.com/api/payments/airwallex/webhook',{
   method:'POST',headers:{'x-timestamp':timestamp,'x-signature':signature},body:raw
  })});
 const result=await call(),resultBody=await result.json();
 assert.equal(result.status,200,JSON.stringify(resultBody));
 const order=sqlite.prepare('SELECT status,payment_status FROM orders WHERE id=?').get(orderId);
 const receipt=sqlite.prepare("SELECT COUNT(*) n FROM payments WHERE order_id=? AND status='RECEIVED'").get(orderId);
 const fulfillment=sqlite.prepare("SELECT COUNT(*) n FROM tasks WHERE order_id=? AND type='FULFILLMENT'").get(orderId);
 const pendingReview=sqlite.prepare("SELECT COUNT(*) n FROM tasks WHERE order_id=? AND type='PAYMENT' AND title LIKE 'Review payment on closed order%'").get(orderId);
 assert.equal(receipt.n,1,'Airwallex signed receipt must be preserved');
 if(o.state==='CANCELLED'||o.payment==='REFUNDED'){
  assert.equal(resultBody.fulfillmentBlocked,true);
  assert.equal(order.status,o.state,'Airwallex cannot reopen closed order');
  assert.equal(order.payment_status,o.payment,'Airwallex cannot overwrite refund');
  assert.equal(fulfillment.n,0,'No fulfillment on cancelled/refunded Airwallex order');
  assert.equal(pendingReview.n,1,'Urgent Airwallex reconciliation task');
 }else{
  assert.equal(order.payment_status,'PAID');
  assert.equal(fulfillment.n,1,'Normal paid Airwallex orders fulfill');
 }
 const retry=await call();
 assert.equal(retry.status,200);
 assert.equal((await retry.json()).duplicate,true,'Duplicate Airwallex event is idempotent');
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM payments WHERE order_id=?').get(orderId).n,1);
}
const aw=readFileSync('functions/api/payments/airwallex/webhook.ts','utf8');
const stripe=readFileSync('functions/api/payments/stripe/webhook.ts','utf8');
assert(aw.includes('if (requiresClosedOrderPaymentReview(order))'));
assert(aw.includes('await markEventProcessed(db,eventId)'));
assert(aw.includes('automatic fulfillment blocked'));
assert(aw.indexOf('if (requiresClosedOrderPaymentReview(order))')<aw.indexOf('if (fullyPaid)'),'Airwallex guard must happen before the fulfillment path');
assert(stripe.indexOf('if(requiresClosedOrderPaymentReview(order)){')<stripe.indexOf('if(fullyPaid){'),'Stripe guard must happen before fulfillment');
assert(!aw.includes('await sendEmailToCustomer'),'Review must not automatically contact buyers');
sqlite.close();
console.log('PASS: real signed Stripe and Airwallex webhook handlers preserve late receipts without reopening cancelled/refunded orders; duplicate events are idempotent; ordinary payments still fulfill.');
