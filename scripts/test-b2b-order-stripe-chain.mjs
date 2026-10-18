import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readdirSync,readFileSync} from 'node:fs';
import {createHash,createHmac,randomUUID} from 'node:crypto';
import {build} from 'esbuild';

const load=async path=>{
 const result=await build({entryPoints:[path],bundle:true,write:false,platform:'node',format:'esm',logLevel:'silent'});
 return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
};
const {onRequestPost:acceptQuote,onRequestGet:quoteApiGet}=await load('functions/api/quote/[token].ts');
const {onRequestGet:quotePage}=await load('functions/quote/[token].ts');
const {onRequestPost:checkout}=await load('functions/api/payments/stripe/create.ts');
const {onRequestPost:webhook}=await load('functions/api/payments/stripe/webhook.ts');
const {onRequestGet:status}=await load('functions/api/payments/stripe/status.ts');
const sqlite=new DatabaseSync(':memory:');
for(const file of readdirSync('migrations').filter(x=>x.endsWith('.sql')).sort())
 sqlite.exec(readFileSync('migrations/'+file,'utf8'));
let writes=0,network=0;
const db={
 prepare(sql){
  const stmt={args:[],bind(...args){this.args=args;return this},
   async first(){return sqlite.prepare(sql).get(...this.args)||null},
   async all(){return {success:true,results:sqlite.prepare(sql).all(...this.args)}},
   async run(){writes++;const x=sqlite.prepare(sql).run(...this.args);return {success:true,meta:{changes:Number(x.changes)}}}};
  return stmt;
 },
 async batch(stmts){
  sqlite.exec('BEGIN');try{
   const results=[];for(const stmt of stmts)results.push(await stmt.run());
   sqlite.exec('COMMIT');return results;
  }catch(e){sqlite.exec('ROLLBACK');throw e}
 }
};
const origin='https://b2b-chain-test.example';
const env={MINGEAGLE_DB:db,STRIPE_MODE:'test',
 STRIPE_SECRET_KEY:'sk_test_synthetic_b2b_chain_only',STRIPE_WEBHOOK_SECRET:'whsec_synthetic_b2b_chain_only',
 STRIPE_CHECKOUT_ENABLED:'true',STRIPE_TAX_POLICY_APPROVED:'true',
 STRIPE_RETAIL_ONLY_ENABLED:'false',STRIPE_B2B_CHECKOUT_ENABLED:'true',
 STRIPE_B2B_TAX_POLICY_APPROVED:'true',STRIPE_B2B_APPROVED_US_STATES:'TX,OR,NH'};
const quoteId=randomUUID(),reference='MEQ-SYNTHETIC-B2B-20261016';
const bearer=randomUUID().replaceAll('-','')+randomUUID().replaceAll('-','');
const bearerHash=createHash('sha256').update(bearer).digest('hex');
const orderPage=origin+'/quote/'+bearer;
const accept=shippingAddress=>acceptQuote({
 env,params:{token:bearer},
 request:new Request(orderPage,{method:'POST',headers:{origin,'content-type':'application/json'},
  body:JSON.stringify({action:'accept',shippingAddress})})
});
const checkoutRequest=()=>new Request(origin+'/api/payments/stripe/create',{
 method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({token:bearer})
});
const signedEvent=(event,wrong=false)=>{
 const raw=JSON.stringify(event),now=Math.floor(Date.now()/1000);
 const mac=createHmac('sha256',env.STRIPE_WEBHOOK_SECRET).update(now+'.'+raw).digest('hex');
 return new Request(origin+'/api/payments/stripe/webhook',{method:'POST',body:raw,
  headers:{'stripe-signature':'t='+now+',v1='+(wrong?'bad':mac)}});
};
const savedFetch=globalThis.fetch, provider=new Map();
let providerGetOutage=false;
globalThis.fetch=async(url,init)=>{
 network++;
 const endpoint=String(url);
 assert(endpoint.startsWith('https://api.stripe.com/v1/checkout/sessions'),'Only mock Stripe Checkout endpoints');
 assert(new Headers(init.headers).get('authorization')?.startsWith('Bearer sk_test_'));
 if(init.method!=='POST'){
  if(providerGetOutage)return Response.json({error:'synthetic provider outage'},{status:503});
  return Response.json(provider.get(endpoint.split('/').at(-1)));
 }
 const params=new URLSearchParams(init.body);
 assert.equal(params.get('mode'),'payment');
 assert.equal(params.get('client_reference_id')?.startsWith('ME-'),true);
 assert.equal(params.get('line_items[0][price_data][unit_amount]'),'15000');
 assert.equal(params.get('line_items[1][price_data][unit_amount]'),'3000');
 assert.equal(params.get('line_items[2][price_data][unit_amount]'),null);
 const id='cs_test_syntheticB2BChain'+String(provider.size+1);
 const session={id,status:'open',payment_status:'unpaid',currency:'usd',livemode:false,
  url:'https://checkout.stripe.com/c/pay/'+id,
  amount_total:18000,client_reference_id:params.get('client_reference_id'),
  metadata:{order_id:params.get('metadata[order_id]'),order_reference:params.get('metadata[order_reference]')}};
 provider.set(id,session);
 return Response.json(session);
};
try{
 sqlite.prepare(`INSERT INTO quotes
  (id,reference,status,currency,subtotal,discount,shipping,tax,total,payment_terms,shipping_terms,
   valid_until,sent_at,tax_basis,public_token_hash)
  VALUES (?,?,'SENT','USD',150,0,30,0,180,?,?,datetime('now','+14 days'),
   datetime('now','-1 day'),?,?)`)
 .run(quoteId,reference,
  'Full amount payable by secure Stripe card checkout',
  'DDP sea freight 25–30 days, customs and duties included; Ship-to state: TX',
  'SYNTHETIC TEST ONLY: simulated tax-basis review is NOT merchant tax approval',
  bearerHash);
 sqlite.prepare(`INSERT INTO quote_items
  (id,quote_id,description,quantity,unit_price,line_total,sort_order)
  VALUES (?,?,?,10,15,150,0)`).run(randomUUID(),quoteId,'Flocked Silent Basketball Set | No. 7 | Orange');
 // Public HTML and JSON quote endpoints must agree with the shared
 // quoteTermsIssues validity contract: YYYY-MM-DD is inclusive through
 // that day's end (UTC). Explicit timestamps retain precise expiry.
 const quoteGet=()=>quoteApiGet({env,params:{token:bearer},request:new Request(orderPage)});
 sqlite.prepare("UPDATE quotes SET valid_until=datetime('now','-1 hour') WHERE id=?").run(quoteId);
 let expired=await quoteGet();
 assert.equal(expired.status,200);
 assert.equal((await expired.json()).quote.status,'EXPIRED',
  'Explicit datetime in the past must already expire');
 sqlite.prepare("UPDATE quotes SET status='SENT',valid_until=date('now','-1 day') WHERE id=?").run(quoteId);
 expired=await quoteGet();
 assert.equal((await expired.json()).quote.status,'EXPIRED',
  'Date-only yesterday must expire');
 const expiredUnaccepted=await accept({country:'US',state:'TX',city:'Austin',postalCode:'78701',line1:'123 Synthetic B2B Street'});
 assert.equal(expiredUnaccepted.status,409,'Expired unaccepted quote still cannot produce a new order');
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM orders').get().n,0);
 sqlite.prepare("UPDATE quotes SET status='SENT',valid_until=date('now') WHERE id=?").run(quoteId);
 const todayApi=await quoteGet();
 assert.equal(todayApi.status,200);
 const todayData=await todayApi.json();
 assert.equal(todayData.quote.status,'VIEWED',
  'Date-only quote remains valid during the final UTC calendar day');
 assert.equal(sqlite.prepare("SELECT status FROM quotes WHERE id=?").get(quoteId).status,'VIEWED');
 const todayHtml=await quotePage({env,params:{token:bearer},request:new Request(orderPage)});
 assert.equal(todayHtml.status,200);
 assert(!(await todayHtml.text()).includes('This quote has expired'),
  'HTML must not show final-day quote as expired');
 const ship={country:'US',state:'TX',city:'Austin',postalCode:'78701',line1:'123 Synthetic B2B Street'};
 // A previously sent quotation without a documented seller tax basis must
 // not create an unpayable order, even if freight, Stripe terms and ZIP match.
 sqlite.prepare('UPDATE quotes SET tax_basis=NULL WHERE id=?').run(quoteId);
 const missingTaxBasis=await accept(ship);
 assert.equal(missingTaxBasis.status,409,'Legacy quote missing seller tax basis must be revised before buyer acceptance');
 assert.equal((await missingTaxBasis.json()).code,'QUOTE_SALES_TAX_BASIS_NOT_DOCUMENTED');
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM orders').get().n,0,
  'Missing tax basis may not create a real customer order');
 const noTaxQuote=await (await quoteGet()).json();
 assert.equal(noTaxQuote.quote.tax_basis_documented,0,'Public quote exposes a boolean only');
 assert(!JSON.stringify(noTaxQuote).includes('simulated tax-basis review'),
  'Never publish the seller internal tax review detail');
 const missingBasisPage=await quotePage({env,params:{token:bearer},request:new Request(orderPage)});
 assert.equal(missingBasisPage.status,200);
 const missingBasisHtml=await missingBasisPage.text();
 assert.match(missingBasisHtml,/Updated quotation required/);
 assert.match(missingBasisHtml,/Seller sales-tax review is not documented/);
 assert(!missingBasisHtml.includes('id="acceptBtn"'),
  'Buyer must not be offered acceptance of an unpayable legacy quotation');
 assert(!missingBasisHtml.includes('SYNTHETIC TEST ONLY: simulated tax-basis review'),
  'Seller internal tax-basis details never appear in HTML');
 sqlite.prepare('UPDATE quotes SET tax_basis=? WHERE id=?').run(
  'SYNTHETIC TEST ONLY: simulated tax-basis review is NOT merchant tax approval',quoteId);
 const repairedQuote=await (await quoteGet()).json();
 assert.equal(repairedQuote.quote.tax_basis_documented,1);
 sqlite.prepare("UPDATE quotes SET shipping_terms='DDP sea freight 25–30 days; Ship-to state: ZZ' WHERE id=?").run(quoteId);
 const impossible=await accept({...ship,state:'ZZ'});
 assert.equal(impossible.status,409,'Buyer may not accept invalid state code even if quote has same two letters');
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM orders').get().n,0);
 sqlite.prepare("UPDATE quotes SET shipping_terms='DDP sea freight 25–30 days, customs and duties included; Ship-to state: TX' WHERE id=?").run(quoteId);
 const incorrect=await accept({...ship,state:'CA'});
 assert.equal(incorrect.status,409,'Wrong delivery state must not create an order');
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM orders').get().n,0);
 // Inject a failure in the final payment follow-up task. The accepted
 // order, all copied lines and quote conversion must roll back together.
 sqlite.exec(`CREATE TRIGGER reject_payment_task BEFORE INSERT ON tasks
  WHEN NEW.type='PAYMENT' BEGIN SELECT RAISE(ABORT,'synthetic late task failure'); END;`);
 const failedAccept=await accept(ship);
 assert.equal(failedAccept.status,500,'Late staff task failure cannot report acceptance');
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM orders').get().n,0,
  'No orphan payable order if the payment follow-up task fails');
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM order_items').get().n,0,
  'No partial product lines if staff task fails');
 assert.equal(sqlite.prepare('SELECT status FROM quotes WHERE id=?').get(quoteId).status,'VIEWED',
  'Source quote remains unconverted after rolled-back acceptance');
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM activities WHERE activity_type='QUOTE_ACCEPTED'").get().n,0);
 sqlite.exec('DROP TRIGGER reject_payment_task');
 const accepted=await accept(ship);
 assert.equal(accepted.status,201,await accepted.clone().text());
 const created=await accepted.json();
 assert.equal(created.order.payment_status,'UNPAID');
 const orderId=created.order.id;
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM order_items WHERE order_id=?').get(orderId).n,1);
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM tasks WHERE order_id=? AND type='PAYMENT'").get(orderId).n,1);
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM activities WHERE entity_id=? AND activity_type='QUOTE_ACCEPTED'").get(orderId).n,1);
 assert.deepEqual(JSON.parse(sqlite.prepare('SELECT shipping_address FROM orders WHERE id=?').get(orderId).shipping_address),
  {line1:ship.line1,city:ship.city,state:ship.state,postalCode:ship.postalCode,country:ship.country},
  'Saved buyer delivery facts match the accepted address');
 const secondAccept=await accept(ship);
 assert.equal(secondAccept.status,200,'A second acceptance must reuse the existing order');
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM orders WHERE quote_id=?').get(quoteId).n,1);
 // Once accepted, its order remains available through the same private token
 // even if the original seller quotation expires. Never create a second order.
 sqlite.prepare("UPDATE quotes SET valid_until=datetime('now','-1 hour') WHERE id=?").run(quoteId);
 const writesBeforeExpiredRetry=writes;
 const expiredAcceptedRetry=await accept(ship);
 assert.equal(expiredAcceptedRetry.status,200,'An existing accepted order survives quotation expiry');
 assert.equal((await expiredAcceptedRetry.json()).order.id,orderId);
 assert.equal(writes,writesBeforeExpiredRetry,'Idempotent expired acceptance must not change D1');
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM orders WHERE quote_id=?').get(quoteId).n,1);
 assert.equal(sqlite.prepare('SELECT status FROM quotes WHERE id=?').get(quoteId).status,'CONVERTED');
 // Subsequent payment tests use an otherwise still-valid accepted quotation.
 sqlite.prepare("UPDATE quotes SET valid_until=date('now') WHERE id=?").run(quoteId);
 // Historic converted 10+ quotes created before mandatory tax review may
 // still be unpaid. Keep order status visible, but never offer a Pay button
 // that the server must reject. Retail sample self-checkout is separate.
 sqlite.prepare("UPDATE quotes SET tax_basis=NULL WHERE id=?").run(quoteId);
 const legacyUnpaidPage=await quotePage({env,params:{token:bearer},request:new Request(orderPage)});
 assert.equal(legacyUnpaidPage.status,200);
 const legacyUnpaidHtml=await legacyUnpaidPage.text();
 assert.match(legacyUnpaidHtml,/Payment is not available for this quotation/);
 assert.match(legacyUnpaidHtml,/Seller sales-tax review must be documented/);
 assert(legacyUnpaidHtml.includes('Order '+created.order.reference),
  'Historic unpaid order status remains visible for support and reconciliation');
 assert(!legacyUnpaidHtml.includes('id="stripePayBtn"'),
  'Unreviewed converted wholesale order must not display a misleading Pay button');
 const beforeLegacyCheckoutNetwork=network;
 const rejectedLegacyCheckout=await checkout({env,request:checkoutRequest()});
 assert.equal(rejectedLegacyCheckout.status,409,
  'Direct Stripe API still independently rejects missing historical quote tax review');
 assert.equal(network,beforeLegacyCheckoutNetwork,
  'Unreviewed legacy order may not contact Stripe');
 assert.equal(provider.size,0);
 sqlite.prepare('UPDATE quotes SET tax_basis=? WHERE id=?').run(
  'SYNTHETIC TEST ONLY: simulated tax-basis review is NOT merchant tax approval',quoteId);
 const quoteView=await quotePage({env,params:{token:bearer},request:new Request(orderPage)});
 assert.equal(quoteView.status,200);
 const quoteHtml=await quoteView.text();
 assert(quoteHtml.includes('Pay securely with Stripe'));
 assert(quoteHtml.includes('WHOLESALE QUOTATION'),'Ten-unit accepted quote is wholesale');
 // The accepted merchandise is not mutable merely because its amount stays the same.
 sqlite.prepare(`UPDATE order_items SET description='Another ball of identical price' WHERE order_id=?`).run(orderId);
 const beforeBlocked=network;
 const altered=await checkout({env,request:checkoutRequest()});
 assert.equal(altered.status,409,'Changed SKU/description is not payable against original quote');
 assert.equal(network,beforeBlocked,'Tampered order must not call Stripe');
 sqlite.prepare(`UPDATE order_items SET description='Flocked Silent Basketball Set | No. 7 | Orange' WHERE order_id=?`).run(orderId);
 // Unpaid order with an active manual Stripe review must never get a
 // brand-new Checkout from a direct POST, even if the buyer UI hides Pay.
 const disputeTaskId='synthetic-checkout-hold';
 sqlite.prepare("INSERT INTO tasks(id,order_id,type,title,status,priority) VALUES (?,?,'PAYMENT',?,'OPEN','URGENT')")
  .run(disputeTaskId,orderId,'Review disputed Stripe receipts for '+reference);
 for(const disputeStatus of ['OPEN','IN_PROGRESS']){
  sqlite.prepare('UPDATE tasks SET status=? WHERE id=?').run(disputeStatus,disputeTaskId);
  const writesBeforeHold=writes,networkBeforeHold=network;
  const denied=await checkout({env,request:checkoutRequest()});
  assert.equal(denied.status,409,'Checkout must be held while dispute is '+disputeStatus);
  assert.match((await denied.json()).error,/unresolved Stripe payment review/i);
  assert.equal(writes,writesBeforeHold,'Checkout dispute guard must not write D1');
  assert.equal(network,networkBeforeHold,'Checkout dispute guard must not call Stripe');
  assert.equal(provider.size,0,'Checkout dispute guard must not create Stripe session');
 }
 sqlite.prepare("UPDATE tasks SET status='DONE' WHERE id=?").run(disputeTaskId);
 const createdCheckout=await checkout({env,request:checkoutRequest()});
 assert.equal(createdCheckout.status,200,await createdCheckout.clone().text());
 assert.equal(provider.size,1,'One simulated hosted checkout');
 const ref=sqlite.prepare("SELECT provider_intent_id FROM payment_provider_sessions WHERE order_id=? AND provider='STRIPE'").get(orderId);
 assert.equal(ref.provider_intent_id,'cs_test_syntheticB2BChain1');
 // An already-open Stripe Session must not be reissued during a new
 // staff review: guard runs before Stripe retrieval and URL reuse.
 sqlite.prepare("UPDATE tasks SET status='OPEN' WHERE id=?").run(disputeTaskId);
 const writesBeforeReuseHold=writes,networkBeforeReuseHold=network;
 const deniedReuse=await checkout({env,request:checkoutRequest()});
 assert.equal(deniedReuse.status,409,'Active review blocks existing session URL reuse');
 assert.equal(network,networkBeforeReuseHold,'Existing Stripe session must not be fetched/reused under hold');
 assert.equal(writes,writesBeforeReuseHold,'Existing session hold must not mutate D1');
 sqlite.prepare("UPDATE tasks SET status='DONE' WHERE id=?").run(disputeTaskId);
 // Even if our D1 session row still matches the order, Stripe's own live
 // session response must agree before an existing URL is reissued.
 const originalSession=provider.get(ref.provider_intent_id);
 for(const [label,patch] of [
  ['wrong amount',{amount_total:17999}],
  ['wrong currency',{currency:'eur'}],
  ['other order reference',{client_reference_id:'ME-FORGED-ORDER'}],
  ['different metadata',{metadata:{...originalSession.metadata,order_id:'forged-order-id'}}],
  ['unexpected Stripe Tax',{automatic_tax:{enabled:true}}]
 ]){
  provider.set(ref.provider_intent_id,{...originalSession,...patch});
  const mismatched=await checkout({env,request:checkoutRequest()});
  assert.equal(mismatched.status,409,'Never reuse an inconsistent hosted checkout: '+label);
  assert.equal(provider.size,1,'Mismatched checkout must not create new Stripe sessions');
 }
 provider.set(ref.provider_intent_id,originalSession);
 const reused=await checkout({env,request:checkoutRequest()});
 assert.equal(reused.status,200);
 assert.equal((await reused.json()).reused,true,'Second click must reuse an existing open Checkout');
 assert.equal(provider.size,1);
 // If Stripe cannot be queried, fail closed instead of POSTing a new Checkout.
 providerGetOutage=true;
 const blockedOnOutage=await checkout({env,request:checkoutRequest()});
 assert.equal(blockedOnOutage.status,503,'Provider outage must not create a second payment attempt');
 assert.equal(provider.size,1,'Provider outage cannot POST another Checkout');
 providerGetOutage=false;
 provider.set(ref.provider_intent_id,{...originalSession,status:'unknown'});
 const blockedOnUnknown=await checkout({env,request:checkoutRequest()});
 assert.equal(blockedOnUnknown.status,409,'Unknown prior session status must block another Checkout');
 assert.equal(provider.size,1);
 provider.set(ref.provider_intent_id,{...originalSession,url:'https://invalid.example/checkout'});
 const blockedOnBadUrl=await checkout({env,request:checkoutRequest()});
 assert.equal(blockedOnBadUrl.status,409,'Open session with untrusted URL may not be replaced');
 assert.equal(provider.size,1);
 provider.set(ref.provider_intent_id,{...originalSession,status:'expired',url:null});
 const afterExpiry=await checkout({env,request:checkoutRequest()});
 assert.equal(afterExpiry.status,200,'Provider-confirmed expired Checkout should allow controlled replacement');
 const replacement=await afterExpiry.json();
 assert.equal(replacement.reused,undefined);
 assert.equal(provider.size,2,'Expired Checkout must get a fresh provider session');
 const oldRow=sqlite.prepare("SELECT status FROM payment_provider_sessions WHERE provider_intent_id=?").get(ref.provider_intent_id);
 assert.equal(oldRow.status,'EXPIRED','Replacement transaction retires the old expired session');
 const newRef=sqlite.prepare("SELECT provider_intent_id,request_id FROM payment_provider_sessions WHERE order_id=? AND status='OPEN'").get(orderId);
 assert(newRef.provider_intent_id!==ref.provider_intent_id);
 assert(newRef.request_id.includes(ref.provider_intent_id),'Replacement uses a fresh stable idempotency key');
 const reusedAfterExpiry=await checkout({env,request:checkoutRequest()});
 assert.equal(reusedAfterExpiry.status,200);
 assert.equal((await reusedAfterExpiry.json()).reused,true,'Replacement checkout must be reusable');
 assert.equal(provider.size,2);
 const paid={...provider.get(newRef.provider_intent_id),status:'complete',payment_status:'paid'};
 const event={id:'evt_synthetic_b2b_completed',type:'checkout.session.completed',livemode:false,data:{object:paid}};
 const beforeInvalidWrites=writes;
 assert.equal((await webhook({env,request:signedEvent(event,true)})).status,401);
 assert.equal(writes,beforeInvalidWrites,'Invalid signature must not reach database');
 const badAmount={...event,id:'evt_synthetic_b2b_bad_amount',
  data:{object:{...paid,amount_total:18001}}};
 assert.equal((await webhook({env,request:signedEvent(badAmount)})).status,409);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM payments WHERE order_id=?').get(orderId).n,0);
 const completed=await webhook({env,request:signedEvent(event)});
 assert.equal(completed.status,200,await completed.clone().text());
 assert.equal((await completed.json()).paymentStatus,'PAID');
 assert.equal(sqlite.prepare('SELECT payment_status FROM orders WHERE id=?').get(orderId).payment_status,'PAID');
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM payments WHERE order_id=?').get(orderId).n,1);
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM tasks WHERE order_id=? AND type='FULFILLMENT'").get(orderId).n,1);
 const duplicate=await webhook({env,request:signedEvent(event)});
 assert.equal(duplicate.status,200);
 assert.equal((await duplicate.json()).duplicate,true);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM payments WHERE order_id=?').get(orderId).n,1);
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM tasks WHERE order_id=? AND type='FULFILLMENT'").get(orderId).n,1);
 // Stripe may deliver a second, separately identified signed notification for
 // the SAME already-paid Checkout, after warehouse staff completed its task.
 // That notification must never schedule an additional shipment.
 sqlite.prepare("UPDATE tasks SET status='DONE',completed_at=CURRENT_TIMESTAMP WHERE order_id=? AND type='FULFILLMENT'").run(orderId);
 const lateRepeat={...event,id:'evt_synthetic_b2b_late_distinct_notification'};
 const lateResult=await webhook({env,request:signedEvent(lateRepeat)});
 assert.equal(lateResult.status,200,await lateResult.clone().text());
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM payments WHERE order_id=? AND provider='STRIPE'").get(orderId).n,1,
  'Distinct signed notification cannot book the same settled Checkout twice');
 assert.deepEqual(sqlite.prepare("SELECT status FROM tasks WHERE order_id=? AND type='FULFILLMENT'").all(orderId).map(x=>x.status),['DONE'],
  'Later webhook events cannot reopen or recreate completed fulfillment');
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM payment_webhook_events WHERE provider='STRIPE' AND event_id=? AND processed_at IS NOT NULL").get(lateRepeat.id).n,1,
  'Late signed notification is acknowledged without repeated fulfillment');
 const statusBeforeWrites=writes;
 const statusResponse=await status({env,request:new Request(origin+'/api/payments/stripe/status?token='+bearer)});
 assert.equal(statusResponse.status,200);
 const normalStatus=await statusResponse.json();
 assert.equal(normalStatus.paymentStatus,'PAID');
 assert.equal(normalStatus.stripeVerifiedReceived,180,'Verified Stripe payment is backed by succeeded Checkout');
 assert.equal(normalStatus.historicalOtherReceived,0);
 assert.equal(normalStatus.paymentEvidence,'STRIPE_VERIFIED');
 assert.equal(normalStatus.requiresManualReview,false);
 assert.equal(writes,statusBeforeWrites,'Buyer polling stays read-only');
 // Even a fully paid Stripe receipt must not be advertised as free for
 // fulfillment when an unresolved manual review task has been opened.
 const holdId='synthetic-active-stripe-reconciliation';
 sqlite.prepare("INSERT INTO tasks(id,order_id,type,title,status,priority) VALUES (?,?,'PAYMENT',?,'OPEN','URGENT')")
   .run(holdId,orderId,'Review disputed Stripe receipts for '+reference);
 const holdBeforeWrites=writes;
 const heldStatusResponse=await status({env,request:new Request(origin+'/api/payments/stripe/status?token='+bearer)});
 const heldStatus=await heldStatusResponse.json();
 assert.equal(heldStatusResponse.status,200);
 assert.equal(heldStatus.paymentStatus,'PAID','Historical ledger status is not overwritten');
 assert.equal(heldStatus.requiresManualReview,true,'Active manual review overrides otherwise complete Stripe receipts');
 assert.equal(heldStatus.paymentEvidence,'MANUAL_RECONCILIATION');
 const heldPage=await quotePage({env,params:{token:bearer},request:new Request(orderPage)});
 assert.equal(heldPage.status,200);
 const heldHtml=await heldPage.text();
 assert(heldHtml.includes('Stripe payment needs manual reconciliation.'),'Buyer is told about Stripe payment review');
 assert(!heldHtml.includes('Payment received in full.'),'Buyer must not get unconditional paid notice during reconciliation');
 assert(!heldHtml.includes('id="stripePayBtn"'),'Held order must not prompt buyer to pay again');
 assert.equal(writes,holdBeforeWrites,'Status and public payment review display must be read-only');
 sqlite.prepare("UPDATE tasks SET status='DONE' WHERE id=?").run(holdId);
 const clearedStatus=await (await status({env,request:new Request(origin+'/api/payments/stripe/status?token='+bearer)})).json();
 assert.equal(clearedStatus.requiresManualReview,false,'Closed review no longer imposes active hold');
 assert.equal(clearedStatus.paymentEvidence,'STRIPE_VERIFIED');
 const afterPaid=await checkout({env,request:checkoutRequest()});
 assert.equal(afterPaid.status,409,'Paid wholesale order must not create another Checkout');
 assert.equal(provider.size,2,'Two recorded sessions include one expired and one paid; no extra checkout after payment');
 // A historic/manual receipt added to this same order must never be
 // misattributed as Stripe-verified funds in the buyer status endpoint.
 sqlite.prepare("INSERT INTO payments(id,order_id,method,provider,provider_reference,amount,currency,status) "+
   "VALUES(?,?, 'BANK_TRANSFER',NULL,NULL,5,'USD','RECEIVED')").run(randomUUID(),orderId);
 const statusBeforeMixed=writes;
 const reviewResponse=await status({env,request:new Request(origin+'/api/payments/stripe/status?token='+bearer)});
 assert.equal(reviewResponse.status,200);
 const reviewed=await reviewResponse.json();
 assert.equal(reviewed.stripeVerifiedReceived,180);
 assert.equal(reviewed.historicalOtherReceived,5);
 assert.equal(reviewed.received,185,'Accounting total includes all recorded channels without mislabeling them');
 assert.equal(reviewed.requiresManualReview,true,'Mixed records need seller review');
 assert.equal(reviewed.paymentEvidence,'MANUAL_RECONCILIATION');
 assert.equal(writes,statusBeforeMixed,'Status observation may not mutate a receipt');
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM tasks WHERE order_id=? AND type='FULFILLMENT'").get(orderId).n,1,
  'Buyer polling never duplicates fulfillment');

 console.log('PASS: isolated B2B quote acceptance → one order → exact item validation → mocked Stripe session → signed paid webhook → PAID → fulfillment once; no live charges.');
}finally{globalThis.fetch=savedFetch;sqlite.close();}
