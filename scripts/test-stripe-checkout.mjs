import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {webcrypto,createHmac} from 'node:crypto';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const load=async file=>{
 const output=await build({entryPoints:[file],bundle:true,platform:'node',
   format:'esm',write:false,target:'es2022',logLevel:'silent'});
 return import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));
};
const {stripeCheckoutReadiness}=await load('functions/_shared/stripe.ts');
const {onRequestPost:createCheckout}=await load('functions/api/payments/stripe/create.ts');
const {onRequestPost:webhook,verifyStripeSignature}=await load('functions/api/payments/stripe/webhook.ts');
const ready={
 STRIPE_MODE:'test',STRIPE_SECRET_KEY:'sk_test_synthetic_key',
 STRIPE_WEBHOOK_SECRET:'whsec_synthetic_secret_for_tests',
 STRIPE_CHECKOUT_ENABLED:'true',STRIPE_TAX_POLICY_APPROVED:'true',
 RETAIL_CHECKOUT_ENABLED:'true',RETAIL_STOCK_FULFILLMENT_APPROVED:'true',
 RETAIL_TAX_POLICY_APPROVED:'true'
};
assert.equal(stripeCheckoutReadiness(ready).checkoutReady,true);
assert.equal(stripeCheckoutReadiness({...ready,STRIPE_SECRET_KEY:'rk_test_syntheticRestrictedKey'}).checkoutReady,true);
assert.equal(stripeCheckoutReadiness({...ready,STRIPE_MODE:'live',STRIPE_SECRET_KEY:'rk_live_syntheticRestrictedKey'}).checkoutReady,true);
assert.equal(stripeCheckoutReadiness({...ready,STRIPE_MODE:'live',STRIPE_SECRET_KEY:'sk_live_syntheticStandardKey'}).checkoutReady,true);
assert.equal(stripeCheckoutReadiness({...ready,STRIPE_MODE:'test',STRIPE_SECRET_KEY:'rk_live_syntheticRestrictedKey'}).checkoutReady,false);
assert.equal(stripeCheckoutReadiness({...ready,STRIPE_MODE:'live',STRIPE_SECRET_KEY:'rk_test_syntheticRestrictedKey'}).checkoutReady,false);
assert.equal(stripeCheckoutReadiness({...ready,STRIPE_MODE:'live'}).checkoutReady,false);
assert.equal(stripeCheckoutReadiness({...ready,STRIPE_WEBHOOK_SECRET:''}).checkoutReady,false);
assert.equal(stripeCheckoutReadiness({...ready,STRIPE_CHECKOUT_ENABLED:'false'}).checkoutReady,false);
const saved=globalThis.fetch;
let providerCalls=0,dbReads=0,dbWrites=0;
const request=()=>new Request('https://app.mingeagle.com/api/payments/stripe/create',{
 method:'POST',headers:{'content-type':'application/json',origin:'https://app.mingeagle.com'},
 body:JSON.stringify({token:'a'.repeat(64)})
});
const emptyDB={prepare(){dbReads++;throw Error('Disabled payments must not access D1');}};
try{
 globalThis.fetch=async()=>{providerCalls++;throw Error('Disabled payments must not call Stripe')};
 for(const disabled of [
  {...ready,STRIPE_SECRET_KEY:''},
  {...ready,STRIPE_MODE:'live'},
  {...ready,STRIPE_WEBHOOK_SECRET:''},
  {...ready,STRIPE_CHECKOUT_ENABLED:'false'},
  {...ready,STRIPE_TAX_POLICY_APPROVED:'false'},
 ]){
  const response=await createCheckout({env:{...disabled,MINGEAGLE_DB:emptyDB},request:request()});
  assert.equal(response.status,503);
 }
 assert.equal(providerCalls,0);assert.equal(dbReads,0);

 const now=Math.floor(Date.now()/1000),payload=JSON.stringify({id:'evt_synthetic',type:'customer.created'});
 const signature=createHmac('sha256',ready.STRIPE_WEBHOOK_SECRET).update(now+'.'+payload).digest('hex');
 assert(await verifyStripeSignature(payload,'t='+now+',v1='+signature,ready.STRIPE_WEBHOOK_SECRET,now*1000));
 assert(!await verifyStripeSignature(payload+' ','t='+now+',v1='+signature,ready.STRIPE_WEBHOOK_SECRET,now*1000));
 assert(!await verifyStripeSignature(payload,'t='+(now-1000)+',v1='+signature,ready.STRIPE_WEBHOOK_SECRET,now*1000));
 assert(!await verifyStripeSignature(payload,'t='+now+',v1=invalid',ready.STRIPE_WEBHOOK_SECRET,now*1000));

 let stored=false;
 const db={prepare(sql){
  const state={sql,bind(...values){this.values=values;return this},
   async first(){
    dbReads++;
    if(sql.includes('FROM quotes q JOIN orders o'))return {
      id:'ord_synthetic',reference:'ME-RO-SYNTHETIC',status:'PAYMENT_PENDING',
      payment_status:'UNPAID',total:21.4,subtotal:9.9,discount:0,
      shipping:11.5,tax:0,currency:'USD',quote_status:'SENT',
      received:0,email:'buyer@example.net'
    };
    if(sql.includes("WHERE order_id=? AND provider='STRIPE'"))return null;
    if(sql.includes("WHERE provider='STRIPE' AND provider_intent_id=?"))return stored?{order_id:'ord_synthetic',amount:21.4,currency:'USD',status:'OPEN'}:null;
    if(sql.includes('FROM payment_webhook_events'))return {processed_at:null};
    if(sql.includes('FROM orders WHERE id='))return {
      id:'ord_synthetic',reference:'ME-RO-SYNTHETIC',lead_id:null,company_id:null,contact_id:null,
      total:21.4,currency:'USD',payment_status:'UNPAID'
    };
    if(sql.includes('FROM payments WHERE order_id='))return {received:21.4};
    throw Error('Unexpected SQL read '+sql);
   },
   async run(){
    dbWrites++;
    if(sql.includes('INSERT OR IGNORE INTO payment_provider_sessions'))stored=true;
    return {success:true,meta:{changes:1}};
   }};
  return state;
 }};
 let requestAmount=0;
 globalThis.fetch=async(url,init)=>{
  providerCalls++;
  assert.equal(url,'https://api.stripe.com/v1/checkout/sessions');
  assert.equal(init.method,'POST');
  assert(String(init.headers.get('authorization')).startsWith('Bearer sk_test_'));
  const params=new URLSearchParams(init.body);
  assert.equal(params.get('client_reference_id'),'ME-RO-SYNTHETIC');
  assert.equal(params.get('line_items[0][price_data][unit_amount]'),'990');
  assert.equal(params.get('line_items[1][price_data][unit_amount]'),'1150');
  requestAmount=2140;
  return Response.json({
   id:'cs_test_synthetic',url:'https://checkout.stripe.com/c/pay/cs_test_synthetic',
   amount_total:requestAmount,currency:'usd',status:'open'
  });
 };
 const result=await createCheckout({env:{...ready,MINGEAGLE_DB:db},request:request()});
 assert.equal(result.status,200,await result.clone().text());
 const checkout=await result.json();
 assert.equal(checkout.ok,true);
 assert.equal(checkout.url,'https://checkout.stripe.com/c/pay/cs_test_synthetic');
 assert(!JSON.stringify(checkout).includes('sk_test_'));
 assert.equal(stored,true);
 assert(providerCalls===1 && dbWrites>=1);
 
 const event={id:'evt_paid_test',type:'checkout.session.completed',data:{object:{
  id:'cs_test_synthetic',client_reference_id:'ME-RO-SYNTHETIC',
  metadata:{order_id:'ord_synthetic',order_reference:'ME-RO-SYNTHETIC'},
  payment_status:'paid',amount_total:2140,currency:'usd'
 }}};
 const eventText=JSON.stringify(event);
 const signed=createHmac('sha256',ready.STRIPE_WEBHOOK_SECRET).update(now+'.'+eventText).digest('hex');
 const res=await webhook({env:{...ready,MINGEAGLE_DB:db},
  request:new Request('https://app.mingeagle.com/api/payments/stripe/webhook',{
   method:'POST',headers:{'stripe-signature':'t='+now+',v1='+signed},body:eventText
  })});
 assert.equal(res.status,200,await res.clone().text());
 assert.equal((await res.json()).paymentStatus,'PAID');
 
 const invalid=await webhook({env:{...ready,MINGEAGLE_DB:db},
  request:new Request('https://app.mingeagle.com/api/payments/stripe/webhook',{
   method:'POST',headers:{'stripe-signature':'t='+now+',v1=wrong'},body:eventText
  })});
 assert.equal(invalid.status,401);
 console.log('PASS: Stripe fail-closed gate, owner-approved tax, signature verification, server price, hosted URL and signed payment reconciliation.');
}finally{globalThis.fetch=saved}
