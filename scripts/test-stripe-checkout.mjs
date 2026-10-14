import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {webcrypto,createHmac} from 'node:crypto';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const load=async file=>{
 const output=await build({entryPoints:[file],bundle:true,platform:'node',
   format:'esm',write:false,target:'es2022',logLevel:'silent'});
 return import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));
};
const {stripeCheckoutReadiness,stripeSessionMatchesMode}=await load('functions/_shared/stripe.ts');
const {onRequestGet:paymentReadiness}=await load('functions/api/payments/status.ts');
assert.equal(stripeSessionMatchesMode('cs_test_synthetic','test'),true);
assert.equal(stripeSessionMatchesMode('cs_live_synthetic','live'),true);
for(const [id,mode] of [['cs_live_synthetic','test'],['cs_test_synthetic','live'],['cs_test_synthetic',''],['cs_unknown_synthetic','test'],['not_a_session','live']])
 assert.equal(stripeSessionMatchesMode(id,mode),false,'Provider session IDs must match environment');
const {onRequestPost:createCheckout}=await load('functions/api/payments/stripe/create.ts');
const {onRequestPost:webhook,verifyStripeSignature}=await load('functions/api/payments/stripe/webhook.ts');
const ready={
 STRIPE_MODE:'test',STRIPE_SECRET_KEY:'sk_test_synthetic_key',
 STRIPE_WEBHOOK_SECRET:'whsec_synthetic_secret_for_tests',
 STRIPE_CHECKOUT_ENABLED:'true',STRIPE_TAX_POLICY_APPROVED:'true',
 RETAIL_CHECKOUT_ENABLED:'true',RETAIL_STOCK_FULFILLMENT_APPROVED:'true',
 RETAIL_TAX_POLICY_APPROVED:'true',RETAIL_US_TAX_POLICY_JSON:JSON.stringify({reviewed_on:new Date().toISOString().slice(0,10),review_reference:'TEST_ONLY_NO_LIVE_TAX_APPROVAL',states:{NY:'NO_COLLECTION_REQUIRED'}})
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
for(const [key,mode] of [['sk_test_synthetic','test'],['rk_test_synthetic','test'],
 ['sk_live_synthetic','live'],['rk_live_synthetic','live'],['',null],['sk_live_',null],['malformed',null]]){
 const result=stripeCheckoutReadiness({...ready,STRIPE_SECRET_KEY:key});
 assert.equal(result.keyMode,mode);
 assert.equal(result.keyConfigured,mode==='test','An advertised key mode never bypasses the configured mode');
}
const mismatch=await (await paymentReadiness({env:{...ready,STRIPE_SECRET_KEY:'rk_live_synthetic_private_key'}})).json();
assert.equal(mismatch.stripe.mode,'test');assert.equal(mismatch.stripe.keyMode,'live');
assert.equal(mismatch.stripe.keyConfigured,false);assert.equal(mismatch.stripe.checkoutReady,false);
assert(!JSON.stringify(mismatch).includes('rk_live_synthetic_private_key'));
assert(!JSON.stringify(mismatch).includes(ready.STRIPE_WEBHOOK_SECRET));
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
 let simulatedShippingState='NY';
 let orderReference='ME-RO-SYNTHETIC',quoteStatus='SENT';
 let retailSku='P1-S7', retailGoods=14.9, retailShipping=14;
 const processedEvents=new Set();
 let receivedInserts=0;
 const db={prepare(sql){
  const state={sql,bind(...values){this.values=values;return this},
   async first(){
    dbReads++;
    if(sql.includes('FROM quotes q JOIN orders o'))return {
      id:'ord_synthetic',reference:orderReference,status:'PAYMENT_PENDING',
      payment_status:'UNPAID',total:retailGoods+retailShipping,subtotal:retailGoods,discount:0,
      shipping:retailShipping,tax:0,currency:'USD',quote_status:quoteStatus,
      shipping_address:JSON.stringify({state:simulatedShippingState,country:'US'}),
      received:0,email:'buyer@example.net'
    };
    if(sql.includes("WHERE order_id=? AND provider='STRIPE'"))return null;
    if(sql.includes("WHERE provider='STRIPE' AND provider_intent_id=?"))return stored?{order_id:'ord_synthetic',amount:28.9,currency:'USD',status:'OPEN'}:null;
    if(sql.includes('FROM payment_webhook_events'))return {processed_at:processedEvents.has(this.values?.[0])?'2026-10-14 00:00:00':null};
    if(sql.includes('FROM orders WHERE id='))return {
      id:'ord_synthetic',reference:'ME-RO-SYNTHETIC',lead_id:null,company_id:null,contact_id:null,
      total:28.9,currency:'USD',payment_status:'UNPAID'
    };
    if(sql.includes('FROM payments WHERE order_id='))return {received:28.9};
    throw Error('Unexpected SQL read '+sql);
   },
   async all(){
    if(sql.includes('FROM order_items WHERE order_id='))return {results:[{description:retailSku+' / Orange Retail silent ball',quantity:1,unit_price:retailGoods}]};
    throw Error('Unexpected SQL list '+sql);
   },
   async run(){
    dbWrites++;
    if(sql.includes('INSERT OR IGNORE INTO payment_provider_sessions'))stored=true;
    if(sql.includes('UPDATE payment_webhook_events SET processed_at='))processedEvents.add(this.values[0]);
    if(sql.includes('INSERT OR IGNORE INTO payments '))receivedInserts++;
    return {success:true,meta:{changes:1}};
   }};
  return state;
 }};
 let requestAmount=0;
 let providerSessionIdOverride=null;
 globalThis.fetch=async(url,init)=>{
  providerCalls++;
  assert.equal(url,'https://api.stripe.com/v1/checkout/sessions');
  assert.equal(init.method,'POST');
  assert.equal(init.redirect,'manual','Never use Workers-unsupported error or credential-forwarding follow mode');
  assert(String(init.headers.get('authorization')).startsWith('Bearer sk_test_'));
  assert.equal(init.headers.get('stripe-version'),'2026-09-30.endive');
  const params=new URLSearchParams(init.body);
  assert.equal(params.get('client_reference_id'),orderReference);
  assert.equal(params.get('payment_method_types[0]'),null,'Checkout method configuration comes from Dashboard on Endive');
  assert.equal(params.get('shipping_address_collection[allowed_countries][0]'),null,'No second buyer-selected ship-to state after order tax review');
  assert.equal(params.get('line_items[0][price_data][unit_amount]'),String(Math.round(retailGoods*100)));
  assert.equal(params.get('line_items[1][price_data][unit_amount]'),String(Math.round(retailShipping*100)));
  requestAmount=Math.round((retailGoods+retailShipping)*100);
  return Response.json({
   id:providerSessionIdOverride||(retailSku==='P1-S3'?'cs_test_syntheticsmall':'cs_test_synthetic'),url:'https://checkout.stripe.com/c/pay/cs_test_synthetic',
   amount_total:requestAmount,currency:'usd',status:'open'
  });
 };
 for(const retailToggle of [undefined,'false','TRUE','']){
  const readsBefore=dbReads,writesBefore=dbWrites;
  const blocked=await createCheckout({env:{...ready,RETAIL_CHECKOUT_ENABLED:retailToggle,MINGEAGLE_DB:db},request:request()});
  assert.equal(blocked.status,503,'Existing unpaid retail orders must honor the retail activation switch');
  assert.equal(providerCalls,0,'Disabled retail must not contact Stripe');
  assert.equal(dbWrites,writesBefore,'Disabled retail must not write payment sessions');
  assert.equal(dbReads,readsBefore+1,'Only the order lookup may run before the retail gate');
 }
 // Disabling retail does not disable separately accepted wholesale quotations.
 orderReference='ME-O-SYNTHETIC';quoteStatus='ACCEPTED';
 const limited=await createCheckout({env:{...ready,STRIPE_RETAIL_ONLY_ENABLED:'true',RETAIL_CHECKOUT_ENABLED:'false',MINGEAGLE_DB:db},request:request()});
 assert.equal(limited.status,503,'Retail launch must not enable unreviewed wholesale payments');
 assert.equal(providerCalls,0);
 const wholesale=await createCheckout({env:{...ready,RETAIL_CHECKOUT_ENABLED:'false',MINGEAGLE_DB:db},request:request()});
 assert.equal(wholesale.status,200,await wholesale.clone().text());
 assert.equal(providerCalls,1);
 orderReference='ME-RO-SYNTHETIC';quoteStatus='SENT';
 providerCalls=0;dbWrites=0;stored=false;
 const denied=await createCheckout({env:{...ready,RETAIL_US_TAX_POLICY_JSON:JSON.stringify({reviewed_on:new Date().toISOString().slice(0,10),review_reference:'TEST_REVIEW_FOR_CA_ONLY',states:{CA:'NO_COLLECTION_REQUIRED'}}),MINGEAGLE_DB:db},request:request()});
 assert.equal(denied.status,409,'No Checkout for a state excluded from the verified tax review');
 assert.equal(providerCalls,0,'Tax-denied state must not call Stripe');
 assert.equal(dbWrites,0,'Tax-denied state must not mutate D1');
 // Kentucky LLC registration and an unknown sales tax permit are NOT reviewed
 // zero-tax decisions. COLLECT_SALES_TAX must not authorize the zero-tax path.
 simulatedShippingState='KY';
 const kyUnreviewed=await createCheckout({env:{...ready,MINGEAGLE_DB:db},request:request()});
 assert.equal(kyUnreviewed.status,409,'KY must fail closed absent a KY-specific reviewed decision');
 const kyMustCollect=await createCheckout({env:{...ready,
  RETAIL_US_TAX_POLICY_JSON:JSON.stringify({reviewed_on:new Date().toISOString().slice(0,10),
   review_reference:'SYNTHETIC_KY_COLLECTION_REQUIRED_NOT_ZERO',
   states:{KY:'COLLECT_SALES_TAX'}}),MINGEAGLE_DB:db},request:request()});
 assert.equal(kyMustCollect.status,409,'KY collection obligations cannot be silently treated as zero tax');
 assert.equal(providerCalls,0,'Unreviewed KY tax must not open Stripe Checkout');
 assert.equal(dbWrites,0,'Unreviewed KY tax must not mutate payments');
 simulatedShippingState='NY';
 const result=await createCheckout({env:{...ready,MINGEAGLE_DB:db},request:request()});
 assert.equal(result.status,200,await result.clone().text());
 const checkout=await result.json();
 assert.equal(checkout.ok,true);
 assert.equal(checkout.url,'https://checkout.stripe.com/c/pay/cs_test_synthetic');
 assert(!JSON.stringify(checkout).includes('sk_test_'));
 assert.equal(stored,true);
 assert(providerCalls===1 && dbWrites>=1);
 const normalProvider=globalThis.fetch,writesBeforeRedirect=dbWrites;
 globalThis.fetch=async()=>new Response(null,{status:302,headers:{location:'https://evil.example/credential-trap'}});
 const redirectedCheckout=await createCheckout({env:{...ready,MINGEAGLE_DB:db},request:request()});
 assert.equal(redirectedCheckout.status,503,'Provider redirects must fail without following Location');
 assert.equal(dbWrites,writesBeforeRedirect,'A rejected redirect must not record a payment session');
 globalThis.fetch=normalProvider;
 
 // A valid Stripe signature alone must not authorize a mismatched order or amount.
 for(const [eventId,change] of [
  ['evt_wrong_amount',{amount_total:2990}],
  ['evt_wrong_currency',{currency:'eur'}],
  ['evt_wrong_order',{client_reference_id:'ME-RO-DIFFERENT'}]
 ]){
  const bad={id:eventId,type:'checkout.session.completed',data:{object:{
   id:'cs_test_synthetic',client_reference_id:'ME-RO-SYNTHETIC',
   metadata:{order_id:'ord_synthetic',order_reference:'ME-RO-SYNTHETIC'},
   payment_status:'paid',amount_total:2890,currency:'usd',...change
  }}};
  const payload=JSON.stringify(bad);
  const sig=createHmac('sha256',ready.STRIPE_WEBHOOK_SECRET).update(now+'.'+payload).digest('hex');
  const deniedWebhook=await webhook({env:{...ready,MINGEAGLE_DB:db},
   request:new Request('https://app.mingeagle.com/api/payments/stripe/webhook',{
    method:'POST',headers:{'stripe-signature':'t='+now+',v1='+sig},body:payload
   })});
  assert.equal(deniedWebhook.status,409,'A signed but mismatched event must be rejected: '+eventId);
 }
 const event={id:'evt_paid_test',type:'checkout.session.completed',data:{object:{
  id:'cs_test_synthetic',client_reference_id:'ME-RO-SYNTHETIC',
  metadata:{order_id:'ord_synthetic',order_reference:'ME-RO-SYNTHETIC'},
  payment_status:'paid',amount_total:2890,currency:'usd'
 }}};
 const eventText=JSON.stringify(event);
 const signed=createHmac('sha256',ready.STRIPE_WEBHOOK_SECRET).update(now+'.'+eventText).digest('hex');
 const res=await webhook({env:{...ready,MINGEAGLE_DB:db},
  request:new Request('https://app.mingeagle.com/api/payments/stripe/webhook',{
   method:'POST',headers:{'stripe-signature':'t='+now+',v1='+signed},body:eventText
  })});
 assert.equal(res.status,200,await res.clone().text());
 assert.equal((await res.json()).paymentStatus,'PAID');
 const paymentWritesAfterFirst=receivedInserts;
 const duplicate=await webhook({env:{...ready,MINGEAGLE_DB:db},
  request:new Request('https://app.mingeagle.com/api/payments/stripe/webhook',{
   method:'POST',headers:{'stripe-signature':'t='+now+',v1='+signed},body:eventText
  })});
 assert.equal(duplicate.status,200,'Retrying same Stripe event should be accepted');
 assert.equal((await duplicate.json()).duplicate,true,'Exact replay is recognized as processed');
 assert.equal(receivedInserts,paymentWritesAfterFirst,'Replay must not create another payment');
 
 const invalid=await webhook({env:{...ready,MINGEAGLE_DB:db},
  request:new Request('https://app.mingeagle.com/api/payments/stripe/webhook',{
   method:'POST',headers:{'stripe-signature':'t='+now+',v1=wrong'},body:eventText
  })});
 assert.equal(invalid.status,401);
 // The newly merchant-confirmed P1-S3 must use the same provider-side validations.
 retailSku='P1-S3';retailGoods=9.9;retailShipping=11.5;
 const smallCheckout=await createCheckout({env:{...ready,MINGEAGLE_DB:db},request:request()});
 assert.equal(smallCheckout.status,200,await smallCheckout.clone().text());
 assert.equal((await smallCheckout.json()).ok,true);
 assert.equal(requestAmount,2140,'Stripe must receive $21.40 for P1-S3 duty-paid delivery');
 const writesBeforeWrongMode=dbWrites;
 providerSessionIdOverride='cs_live_synthetic';
 const wrongMode=await createCheckout({env:{...ready,MINGEAGLE_DB:db},request:request()});
 assert.equal(wrongMode.status,502,'Test mode must reject Stripe live Checkout Session IDs');
 assert.equal(dbWrites,writesBeforeWrongMode,'Rejected live session must not be stored');
 providerSessionIdOverride=null;
 const otherModeEvent={...event,id:'evt_wrong_stripe_mode',
  data:{object:{...event.data.object,id:'cs_live_synthetic'}}};
 const otherModeText=JSON.stringify(otherModeEvent);
 const otherModeSig=createHmac('sha256',ready.STRIPE_WEBHOOK_SECRET).update(now+'.'+otherModeText).digest('hex');
 const wrongModeWebhook=await webhook({env:{...ready,MINGEAGLE_DB:db},
  request:new Request('https://app.mingeagle.com/api/payments/stripe/webhook',{
   method:'POST',headers:{'stripe-signature':'t='+now+',v1='+otherModeSig},body:otherModeText
  })});
 assert.equal(wrongModeWebhook.status,409,'Signed live session must be rejected by a test-mode webhook');
 assert.equal(receivedInserts,paymentWritesAfterFirst,'Cross-mode event must not record payment');
 console.log('PASS: Stripe fail-closed gate, owner-approved tax, signature verification, server price, hosted URL and signed payment reconciliation.');
}finally{globalThis.fetch=saved}
