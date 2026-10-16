import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readdirSync,readFileSync} from 'node:fs';
import {createHash,createHmac,randomUUID} from 'node:crypto';
import {build} from 'esbuild';

const load=async path=>{
 const result=await build({entryPoints:[path],bundle:true,write:false,platform:'node',format:'esm',logLevel:'silent'});
 return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
};
const {onRequestPost:acceptQuote}=await load('functions/api/quote/[token].ts');
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
globalThis.fetch=async(url,init)=>{
 network++;
 const endpoint=String(url);
 assert(endpoint.startsWith('https://api.stripe.com/v1/checkout/sessions'),'Only mock Stripe Checkout endpoints');
 assert(new Headers(init.headers).get('authorization')?.startsWith('Bearer sk_test_'));
 if(init.method!=='POST')return Response.json(provider.get(endpoint.split('/').at(-1)));
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
 const ship={country:'US',state:'TX',city:'Austin',postalCode:'78701',line1:'123 Synthetic B2B Street'};
 const incorrect=await accept({...ship,state:'CA'});
 assert.equal(incorrect.status,409,'Wrong delivery state must not create an order');
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM orders').get().n,0);
 const accepted=await accept(ship);
 assert.equal(accepted.status,201,await accepted.clone().text());
 const created=await accepted.json();
 assert.equal(created.order.payment_status,'UNPAID');
 const orderId=created.order.id;
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM order_items WHERE order_id=?').get(orderId).n,1);
 assert.deepEqual(JSON.parse(sqlite.prepare('SELECT shipping_address FROM orders WHERE id=?').get(orderId).shipping_address),
  {line1:ship.line1,city:ship.city,state:ship.state,postalCode:ship.postalCode,country:ship.country},
  'Saved buyer delivery facts match the accepted address');
 const secondAccept=await accept(ship);
 assert.equal(secondAccept.status,200,'A second acceptance must reuse the existing order');
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM orders WHERE quote_id=?').get(quoteId).n,1);
 const quoteView=await quotePage({env,params:{token:bearer},request:new Request(orderPage)});
 assert.equal(quoteView.status,200);
 assert((await quoteView.text()).includes('Pay securely with Stripe'));
 // The accepted merchandise is not mutable merely because its amount stays the same.
 sqlite.prepare(`UPDATE order_items SET description='Another ball of identical price' WHERE order_id=?`).run(orderId);
 const beforeBlocked=network;
 const altered=await checkout({env,request:checkoutRequest()});
 assert.equal(altered.status,409,'Changed SKU/description is not payable against original quote');
 assert.equal(network,beforeBlocked,'Tampered order must not call Stripe');
 sqlite.prepare(`UPDATE order_items SET description='Flocked Silent Basketball Set | No. 7 | Orange' WHERE order_id=?`).run(orderId);
 const createdCheckout=await checkout({env,request:checkoutRequest()});
 assert.equal(createdCheckout.status,200,await createdCheckout.clone().text());
 assert.equal(provider.size,1,'One simulated hosted checkout');
 const ref=sqlite.prepare("SELECT provider_intent_id FROM payment_provider_sessions WHERE order_id=? AND provider='STRIPE'").get(orderId);
 assert.equal(ref.provider_intent_id,'cs_test_syntheticB2BChain1');
 const reused=await checkout({env,request:checkoutRequest()});
 assert.equal(reused.status,200);
 assert.equal((await reused.json()).reused,true,'Second click must reuse an existing open Checkout');
 assert.equal(provider.size,1);
 const paid={...provider.get(ref.provider_intent_id),status:'complete',payment_status:'paid'};
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
 const statusBeforeWrites=writes;
 const statusResponse=await status({env,request:new Request(origin+'/api/payments/stripe/status?token='+bearer)});
 assert.equal(statusResponse.status,200);
 assert.equal((await statusResponse.json()).paymentStatus,'PAID');
 assert.equal(writes,statusBeforeWrites,'Buyer polling stays read-only');
 const afterPaid=await checkout({env,request:checkoutRequest()});
 assert.equal(afterPaid.status,409,'Paid wholesale order must not create another Checkout');
 assert.equal(provider.size,1);
 console.log('PASS: isolated B2B quote acceptance → one order → exact item validation → mocked Stripe session → signed paid webhook → PAID → fulfillment once; no live charges.');
}finally{globalThis.fetch=savedFetch;sqlite.close();}
