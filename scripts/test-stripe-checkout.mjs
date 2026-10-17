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
const {acceptedB2bItemSnapshotMatches}=await load('lib/b2b-line-snapshot.ts');
const line=(description,quantity,unit_price)=>({product_id:'sku-1',variant_id:'size-7',
 description,quantity,unit_price,line_total:quantity*unit_price});
const accepted=[line('Blue silent basketball',2,12.5),line('Orange silent soccer',1,10)];
assert.equal(acceptedB2bItemSnapshotMatches(accepted,[accepted[1],accepted[0]],35,35),true,
 'Identical line content must survive row reordering');
for(const revised of [
 [line('Different ball',2,12.5),accepted[1]],
 [{...accepted[0],variant_id:'size-5'},accepted[1]],
 [line('Blue silent basketball',1,25),accepted[1]],
 [{...accepted[0],line_total:25.01},accepted[1]],
 [accepted[0],{...accepted[1],unit_price:10.01}],
 [accepted[0]],
 []]){
 assert.equal(acceptedB2bItemSnapshotMatches(accepted,revised,35,35),false,
  'Changing buyer-accepted items must not preserve Stripe chargeability');
}
assert.equal(acceptedB2bItemSnapshotMatches(accepted,accepted,34.99,35),false,
 'Subtotal must reconcile against accepted line items');

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
const enabledRetailEnv={...ready,STRIPE_TAX_POLICY_APPROVED:'true',RETAIL_CHECKOUT_ENABLED:'true',
 RETAIL_STOCK_FULFILLMENT_APPROVED:'true',RETAIL_TAX_POLICY_APPROVED:'true'};
const enabledB2bEnv={...ready,STRIPE_TAX_POLICY_APPROVED:'true',STRIPE_RETAIL_ONLY_ENABLED:'false',
 STRIPE_B2B_CHECKOUT_ENABLED:'true',STRIPE_B2B_TAX_POLICY_APPROVED:'true',STRIPE_B2B_APPROVED_US_STATES:'OR'};
const retailReadiness=(await (await paymentReadiness({env:enabledRetailEnv})).json()).stripe;
assert.equal(retailReadiness.retailConfigurationReady,true,'Completed retail prerequisites permit retail UI');
assert.equal(retailReadiness.b2bConfigurationReady,false,'Retail approval must not unlock wholesale UI');
const b2bReadiness=(await (await paymentReadiness({env:{...enabledB2bEnv,RETAIL_CHECKOUT_ENABLED:'false'}})).json()).stripe;
assert.equal(b2bReadiness.b2bConfigurationReady,true,'Approved B2B config unlocks wholesale payment UI');
assert.equal(b2bReadiness.retailConfigurationReady,false,'B2B permission must not enable unreviewed retail flow');
const globallyReady=(await (await paymentReadiness({env:{...ready,RETAIL_CHECKOUT_ENABLED:'false'}})).json()).stripe;
assert.equal(globallyReady.checkoutReady,true);
assert.equal(globallyReady.retailConfigurationReady,false,'Global Stripe readiness alone cannot enable retail UI');
assert.equal(globallyReady.b2bConfigurationReady,false,'Global Stripe readiness alone cannot enable B2B UI');
const closedGate=(await (await paymentReadiness({env:{...enabledB2bEnv,STRIPE_CHECKOUT_ENABLED:''}})).json()).stripe;
assert.equal(closedGate.b2bConfigurationReady,false,'Unset global Stripe switch must keep B2B UI disabled');
assert.equal(closedGate.b2bLiveConfigurationReady,false);
assert(closedGate.b2bActivationBlockers.includes('GLOBAL_CHECKOUT_NOT_ENABLED'));
const missingLiveMode=(await (await paymentReadiness({env:{...enabledB2bEnv,
 STRIPE_MODE:'',STRIPE_CHECKOUT_ENABLED:''}})).json()).stripe;
assert.equal(missingLiveMode.b2bLiveConfigurationReady,false);
assert(missingLiveMode.b2bActivationBlockers.includes('LIVE_STRIPE_MODE_NOT_SET'));
assert(missingLiveMode.b2bActivationBlockers.includes('GLOBAL_CHECKOUT_NOT_ENABLED'));
const liveReady=(await (await paymentReadiness({env:{...enabledB2bEnv,
 STRIPE_MODE:'live',STRIPE_SECRET_KEY:'rk_live_syntheticRestrictedKey'}})).json()).stripe;
assert.equal(liveReady.b2bLiveConfigurationReady,true,'Live config may pass prerequisites but not tax nexus or money movement');
assert.deepEqual(liveReady.b2bActivationBlockers,[]);
assert.match(liveReady.b2bTaxScopeWarning,/do not establish nexus/);
assert(!JSON.stringify(liveReady).includes('rk_live_syntheticRestrictedKey'));
assert(!JSON.stringify(liveReady).includes(ready.STRIPE_WEBHOOK_SECRET));
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
 let hasB2BShippingAddress=true;
 let orderReference='ME-RO-SYNTHETIC',quoteStatus='SENT';
 let wholesaleTerms='Full amount payable by secure Stripe card checkout';
 let wholesaleTaxBasis='SYNTHETIC_TEST: documented merchant tax review in this isolated test';
 let wholesaleSentAt='2026-10-15 12:00:00';
 let simulatedQuoteAmountDelta=0;
 let simulatedOrderItemChange='';
 let simulatedOrderStatus='PAYMENT_PENDING',simulatedPaymentStatus='UNPAID';
 let simulatedActiveStripeReview=false;
 let retailSku='P1-S7', retailGoods=14.9, retailShipping=14;
 const processedEvents=new Set();
 let receivedInserts=0,paidOrderUpdates=0,fulfillmentTaskInserts=0;
 const db={prepare(sql){
  const state={sql,bind(...values){this.values=values;return this},
   async first(){
    dbReads++;
    if(sql.includes('FROM quotes q JOIN orders o'))return {
      id:'ord_synthetic',quote_id:'quote_synthetic',reference:orderReference,status:simulatedOrderStatus,
      payment_status:simulatedPaymentStatus,total:retailGoods+retailShipping,subtotal:retailGoods,discount:0,
      shipping:retailShipping,tax:0,currency:'USD',quote_status:quoteStatus,
       quote_sent_at:wholesaleSentAt,quote_accepted_at:'2026-10-15 12:10:00',
       quote_subtotal:retailGoods,quote_discount:0,quote_shipping:retailShipping,quote_tax:0,
       quote_total:retailGoods+retailShipping+simulatedQuoteAmountDelta,quote_currency:'USD',
       tax_basis:wholesaleTaxBasis,
       quote_payment_terms:wholesaleTerms,
       quote_shipping_terms:'China origin sea freight, 25–30 days, duties confirmed in quotation. Ship-to state: OR',
       valid_until:'2026-12-31 23:59:59',
      shipping_address:hasB2BShippingAddress?JSON.stringify({state:simulatedShippingState,country:'US',city:'Portland',postalCode:'97201',line1:'123 Example Street'}):null,
      received:0,email:'buyer@example.net'
    };
    if(sql.includes("FROM tasks")&&sql.includes("Review disputed Stripe receipts"))return simulatedActiveStripeReview?{id:'review_synthetic'}:null;
    if(sql.includes("WHERE order_id=? AND provider='STRIPE'"))return null;
    if(sql.includes("WHERE provider='STRIPE' AND provider_intent_id=?"))return stored?{order_id:'ord_synthetic',amount:28.9,currency:'USD',status:'OPEN'}:null;
    if(sql.includes('FROM payment_webhook_events'))return {processed_at:processedEvents.has(this.values?.[0])?'2026-10-14 00:00:00':null};
    if(sql.includes('FROM orders WHERE id='))return {
      id:'ord_synthetic',reference:orderReference,lead_id:null,company_id:null,contact_id:null,
      total:28.9,currency:'USD',payment_status:'UNPAID'
    };
    if(sql.includes('FROM payments WHERE order_id='))return {received:28.9};
    throw Error('Unexpected SQL read '+sql);
   },
   async all(){
    if(sql.includes('FROM quote_items WHERE quote_id='))return {success:true,results:[{
      product_id:'product_one',variant_id:'variant_one',description:'Synthetic Silent Ball | No. 7 | Orange',
      quantity:1,unit_price:retailGoods,line_total:retailGoods
    }]};
    if(sql.includes('FROM order_items WHERE order_id=')){
      if(orderReference.startsWith('ME-O-'))return {success:true,results:[{
        product_id:'product_one',variant_id:simulatedOrderItemChange==='variant'?'variant_swapped':'variant_one',
        description:simulatedOrderItemChange==='description'?'Different silent basketball':'Synthetic Silent Ball | No. 7 | Orange',
        quantity:1,unit_price:retailGoods,line_total:retailGoods
      }]};
      return {success:true,results:[{description:retailSku+' / Orange Retail silent ball',quantity:1,unit_price:retailGoods}]};
    }
    throw Error('Unexpected SQL list '+sql);
   },
   async run(){
    dbWrites++;
    if(sql.includes('INSERT OR IGNORE INTO payment_provider_sessions'))stored=true;
    if(sql.includes('UPDATE payment_webhook_events SET processed_at='))processedEvents.add(this.values[0]);
    if(sql.includes('INSERT OR IGNORE INTO payments '))receivedInserts++;
    if(sql.includes("UPDATE orders SET payment_status='PAID'"))paidOrderUpdates++;
    if(sql.includes("INSERT INTO tasks")&&sql.includes("'FULFILLMENT'"))fulfillmentTaskInserts++;
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
  assert.equal(dbReads,readsBefore+2,'Only the order and active payment hold may be read before retail eligibility');
 }
 // Both retail and wholesale must respect the same server-side Stripe
 // reconciliation hold even when their payment buttons are hidden in the UI.
 simulatedActiveStripeReview=true;
 const beforeHoldWrites=dbWrites,beforeHoldCalls=providerCalls;
 const held=await createCheckout({env:{...ready,RETAIL_CHECKOUT_ENABLED:'true',MINGEAGLE_DB:db},request:request()});
 assert.equal(held.status,409,'Active manual Stripe review must block checkout directly');
 assert.equal(dbWrites,beforeHoldWrites,'Payment hold cannot create or edit DB session');
 assert.equal(providerCalls,beforeHoldCalls,'Payment hold cannot contact Stripe');
 simulatedActiveStripeReview=false;
 // Wholesale requires a separate opt-in in addition to the retail-only restriction.
 orderReference='ME-O-SYNTHETIC';quoteStatus='ACCEPTED';simulatedShippingState='OR';
 const limited=await createCheckout({env:{...ready,STRIPE_RETAIL_ONLY_ENABLED:'true',STRIPE_B2B_CHECKOUT_ENABLED:'true',STRIPE_B2B_TAX_POLICY_APPROVED:'true',STRIPE_B2B_APPROVED_US_STATES:'OR,NH',RETAIL_CHECKOUT_ENABLED:'false',MINGEAGLE_DB:db},request:request()});
 assert.equal(limited.status,503,'Retail-only restriction must override B2B opt-in');
 assert.equal(providerCalls,0);
 const notOptedIn=await createCheckout({env:{...ready,STRIPE_RETAIL_ONLY_ENABLED:'false',RETAIL_CHECKOUT_ENABLED:'false',MINGEAGLE_DB:db},request:request()});
 assert.equal(notOptedIn.status,503,'Removing retail restriction alone must not activate wholesale charges');
 assert.equal(providerCalls,0);
 const taxNotApproved=await createCheckout({env:{...ready,STRIPE_RETAIL_ONLY_ENABLED:'false',
  STRIPE_B2B_CHECKOUT_ENABLED:'true',RETAIL_CHECKOUT_ENABLED:'false',MINGEAGLE_DB:db},request:request()});
 assert.equal(taxNotApproved.status,503,'B2B Stripe payment must not inherit retail tax approval');
 assert.equal(providerCalls,0,'Unreviewed wholesale tax must not call Stripe');
 const wholesale=await createCheckout({env:{...ready,STRIPE_RETAIL_ONLY_ENABLED:'false',STRIPE_B2B_CHECKOUT_ENABLED:'true',STRIPE_B2B_TAX_POLICY_APPROVED:'true',STRIPE_B2B_APPROVED_US_STATES:'OR,NH',RETAIL_CHECKOUT_ENABLED:'false',MINGEAGLE_DB:db},request:request()});
 assert.equal(wholesale.status,200,await wholesale.clone().text());
 wholesaleTaxBasis='';
 const unreviewedTaxBasis=await createCheckout({env:{...ready,STRIPE_RETAIL_ONLY_ENABLED:'false',
   STRIPE_B2B_CHECKOUT_ENABLED:'true',STRIPE_B2B_TAX_POLICY_APPROVED:'true',
   STRIPE_B2B_APPROVED_US_STATES:'OR,NH',RETAIL_CHECKOUT_ENABLED:'false',MINGEAGLE_DB:db},request:request()});
 assert.equal(unreviewedTaxBasis.status,409,'Wholesale card charges require a documented tax basis');
 wholesaleTaxBasis='SYNTHETIC_TEST: documented merchant tax review in this isolated test';
 for(const mutation of ['variant','description']){
  simulatedOrderItemChange=mutation;
  const changedItem=await createCheckout({env:{...ready,STRIPE_RETAIL_ONLY_ENABLED:'false',
   STRIPE_B2B_CHECKOUT_ENABLED:'true',STRIPE_B2B_TAX_POLICY_APPROVED:'true',
   STRIPE_B2B_APPROVED_US_STATES:'OR,NH',MINGEAGLE_DB:db},request:request()});
  assert.equal(changedItem.status,409,'Accepted quote cannot silently change '+mutation);
  assert.equal(providerCalls,1,'Tampered B2B line must not contact Stripe');
 }
 simulatedOrderItemChange='';
 assert.equal(providerCalls,1);
 wholesaleTerms='Bank transfer before production';
 const wrongAgreedMethod=await createCheckout({env:{...ready,STRIPE_RETAIL_ONLY_ENABLED:'false',
   STRIPE_B2B_CHECKOUT_ENABLED:'true',STRIPE_B2B_TAX_POLICY_APPROVED:'true',
   STRIPE_B2B_APPROVED_US_STATES:'OR,NH',MINGEAGLE_DB:db},request:request()});
 assert.equal(wrongAgreedMethod.status,409,'Cannot collect by Stripe if buyer accepted bank transfer only');
 assert.equal(providerCalls,1);
 wholesaleTerms='Full amount payable by secure Stripe card checkout';
 hasB2BShippingAddress=false;
 const missingAddress=await createCheckout({env:{...ready,STRIPE_RETAIL_ONLY_ENABLED:'false',
   STRIPE_B2B_CHECKOUT_ENABLED:'true',STRIPE_B2B_TAX_POLICY_APPROVED:'true',
   STRIPE_B2B_APPROVED_US_STATES:'OR,NH',MINGEAGLE_DB:db},request:request()});
 assert.equal(missingAddress.status,409,'Wholesale destination must be verified before checkout');
 assert.equal(providerCalls,1);
 hasB2BShippingAddress=true;
 simulatedShippingState='NY';
 const unknownTaxState=await createCheckout({env:{...ready,STRIPE_RETAIL_ONLY_ENABLED:'false',
   STRIPE_B2B_CHECKOUT_ENABLED:'true',STRIPE_B2B_TAX_POLICY_APPROVED:'true',
   STRIPE_B2B_APPROVED_US_STATES:'OR,NH',MINGEAGLE_DB:db},request:request()});
 assert.equal(unknownTaxState.status,409,'Do not use no-sales-tax decision for other states');
 assert.equal(providerCalls,1);
 simulatedShippingState='OR';
 simulatedQuoteAmountDelta=0.01;
 const changedQuote=await createCheckout({env:{...ready,STRIPE_RETAIL_ONLY_ENABLED:'false',
  STRIPE_B2B_CHECKOUT_ENABLED:'true',STRIPE_B2B_TAX_POLICY_APPROVED:'true',STRIPE_B2B_APPROVED_US_STATES:'OR,NH',
  RETAIL_CHECKOUT_ENABLED:'false',MINGEAGLE_DB:db},request:request()});
 assert.equal(changedQuote.status,409,'Wholesale order must agree with the buyer-accepted quote');
 assert.equal(providerCalls,1,'Mismatched quote amounts must not call Stripe');
 simulatedQuoteAmountDelta=0;
 wholesaleTerms='Payment terms to be confirmed before sending.';
 const unconfirmed=await createCheckout({env:{...ready,STRIPE_RETAIL_ONLY_ENABLED:'false',
  STRIPE_B2B_CHECKOUT_ENABLED:'true',STRIPE_B2B_TAX_POLICY_APPROVED:'true',STRIPE_B2B_APPROVED_US_STATES:'OR,NH',RETAIL_CHECKOUT_ENABLED:'false',MINGEAGLE_DB:db},request:request()});
 assert.equal(unconfirmed.status,409,'Accepted B2B quotes with unconfirmed payment terms are not payable');
 assert.equal(providerCalls,1,'Unconfirmed terms must not call Stripe');
 wholesaleTerms='Full amount payable by secure Stripe card checkout';
 wholesaleSentAt='';
 const neverSent=await createCheckout({env:{...ready,STRIPE_RETAIL_ONLY_ENABLED:'false',
  STRIPE_B2B_CHECKOUT_ENABLED:'true',STRIPE_B2B_TAX_POLICY_APPROVED:'true',STRIPE_B2B_APPROVED_US_STATES:'OR,NH',RETAIL_CHECKOUT_ENABLED:'false',MINGEAGLE_DB:db},request:request()});
 assert.equal(neverSent.status,409,'Quote must have been formally issued by seller');
 assert.equal(providerCalls,1);
 wholesaleSentAt='2026-10-15 12:00:00';
 orderReference='ME-RO-SYNTHETIC';quoteStatus='SENT';simulatedShippingState='NY';
 providerCalls=0;dbWrites=0;stored=false;
 for(const closed of [{status:'CANCELLED',payment:'UNPAID'},{status:'REFUNDED',payment:'UNPAID'},{status:'PAYMENT_PENDING',payment:'REFUNDED'}]){
  simulatedOrderStatus=closed.status;simulatedPaymentStatus=closed.payment;
  const deniedClosed=await createCheckout({env:{...ready,MINGEAGLE_DB:db},request:request()});
  assert.equal(deniedClosed.status,409,'Closed/refunded order cannot create a Stripe session');
  assert.equal(providerCalls,0,'No Stripe API call for closed/refunded order');
  assert.equal(dbWrites,0,'No payment session write for closed/refunded order');
 }
 simulatedOrderStatus='PAYMENT_PENDING';simulatedPaymentStatus='UNPAID';
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

 // Exercise the complete accepted-B2B-quote path: an accepted, formally sent
 // wholesale quote can create a hosted Stripe session only with explicit B2B
 // and tax-review gates. Its signed payment webhook must then mark the order
 // PAID and create exactly one fulfillment task; replay must do neither again.
 orderReference='ME-O-SYNTHETIC-B2B';
 quoteStatus='ACCEPTED';
 simulatedShippingState='OR';
 simulatedOrderStatus='PAYMENT_PENDING';
 simulatedPaymentStatus='UNPAID';
 wholesaleTerms='Full amount payable by secure Stripe card checkout';
 wholesaleTaxBasis='SYNTHETIC_TEST: documented merchant tax review in this isolated test';
 wholesaleSentAt='2026-10-15 12:00:00';
 providerSessionIdOverride='cs_test_syntheticB2B';
 const b2bEnv={...ready,STRIPE_RETAIL_ONLY_ENABLED:'false',
  STRIPE_B2B_CHECKOUT_ENABLED:'true',STRIPE_B2B_TAX_POLICY_APPROVED:'true',
  STRIPE_B2B_APPROVED_US_STATES:'OR,NH',RETAIL_CHECKOUT_ENABLED:'false',MINGEAGLE_DB:db};
 const b2bCheckout=await createCheckout({env:b2bEnv,request:request()});
 assert.equal(b2bCheckout.status,200,await b2bCheckout.clone().text());
 assert.equal((await b2bCheckout.json()).url,'https://checkout.stripe.com/c/pay/cs_test_synthetic');
 assert.equal(providerCalls,2,'One Stripe Checkout session created for accepted B2B quote');
 assert.equal(stored,true,'B2B Checkout session persisted before returning its URL');
 providerSessionIdOverride=null;
 const b2bEvent={id:'evt_paid_b2b_test',type:'checkout.session.completed',data:{object:{
  id:'cs_test_syntheticB2B',client_reference_id:orderReference,
  metadata:{order_id:'ord_synthetic',order_reference:orderReference},
  payment_status:'paid',amount_total:2890,currency:'usd'
 }}};
 const b2bEventText=JSON.stringify(b2bEvent);
 const b2bSignature=createHmac('sha256',ready.STRIPE_WEBHOOK_SECRET)
  .update(now+'.'+b2bEventText).digest('hex');
 const paidBeforeB2B=paidOrderUpdates,fulfillmentBeforeB2B=fulfillmentTaskInserts;
 const b2bWebhook=await webhook({env:{...ready,MINGEAGLE_DB:db},
  request:new Request('https://app.mingeagle.com/api/payments/stripe/webhook',{
   method:'POST',headers:{'stripe-signature':'t='+now+',v1='+b2bSignature},body:b2bEventText
  })});
 assert.equal(b2bWebhook.status,200,await b2bWebhook.clone().text());
 assert.equal((await b2bWebhook.json()).paymentStatus,'PAID');
 assert.equal(paidOrderUpdates,paidBeforeB2B+1,'B2B order is marked paid only after signed webhook');
 assert.equal(fulfillmentTaskInserts,fulfillmentBeforeB2B+1,'Successful B2B payment creates a fulfillment task');
 const b2bPaymentsAfter=receivedInserts;
 const b2bPaidUpdatesAfter=paidOrderUpdates,b2bFulfillmentAfter=fulfillmentTaskInserts;
 const b2bReplay=await webhook({env:{...ready,MINGEAGLE_DB:db},
  request:new Request('https://app.mingeagle.com/api/payments/stripe/webhook',{
   method:'POST',headers:{'stripe-signature':'t='+now+',v1='+b2bSignature},body:b2bEventText
  })});
 assert.equal(b2bReplay.status,200);
 assert.equal((await b2bReplay.json()).duplicate,true,'B2B webhook event replay is idempotent');
 assert.equal(receivedInserts,b2bPaymentsAfter,'B2B replay does not create a second payment');
 assert.equal(paidOrderUpdates,b2bPaidUpdatesAfter,'B2B replay does not repeat paid-state transition');
 assert.equal(fulfillmentTaskInserts,b2bFulfillmentAfter,'B2B replay does not create duplicate fulfillment task');
 orderReference='ME-RO-SYNTHETIC';simulatedShippingState='NY';

 // Merchant-approved standalone $0.50 Live payment link is a real charge,
 // but intentionally has no order record. It must be acknowledged, audited
 // and NEVER treated as an ordinary CRM order or fulfillment trigger.
 const liveProof={id:'evt_synthetic_live_payment_link',type:'checkout.session.completed',data:{object:{
   id:'cs_live_syntheticExternalOnly',
   payment_link:'plink_1UR4X56ggh6j2Fv09VrTJNum',
   payment_status:'paid',currency:'usd',amount_total:50,
   client_reference_id:null,
   metadata:{purpose:'live_payment_verification_20261016_3',charge:'USER_REQUESTED_050_USD'}
 }}};
 const liveProofEnv={...ready,STRIPE_MODE:'live',MINGEAGLE_DB:db};
 const signedProof=async(value)=>{
   const raw=JSON.stringify(value);
   const sig=createHmac('sha256',ready.STRIPE_WEBHOOK_SECRET).update(now+'.'+raw).digest('hex');
   return webhook({env:liveProofEnv,request:new Request('https://app.mingeagle.com/api/payments/stripe/webhook',{
     method:'POST',headers:{'stripe-signature':'t='+now+',v1='+sig},body:raw
   })});
 };
 const proof=await signedProof(liveProof);
 assert.equal(proof.status,200,await proof.clone().text());
 assert.equal((await proof.json()).standaloneLiveVerification,true);
 assert(processedEvents.has(liveProof.id),'Standalone test event is audit-processed');
 assert.equal(receivedInserts,b2bPaymentsAfter,'Standalone payment must not create any order payment');
 assert.equal((await (await signedProof(liveProof)).json()).duplicate,true,'Standalone proof is idempotent');
 for(const [name,changes] of [
   ['unknown link',{payment_link:'plink_synthetic_unrelated'}],
   ['wrong amount',{amount_total:51}],
   ['wrong purpose',{metadata:{purpose:'something_else',charge:'USER_REQUESTED_050_USD'}}],
   ['linked customer order',{client_reference_id:'ME-O-REAL'}]
 ]){
   const other={...liveProof,id:'evt_synthetic_reject_'+name.replaceAll(' ','_'),
     data:{object:{...liveProof.data.object,...changes}}};
   const rejected=await signedProof(other);
   assert.equal(rejected.status,409,'Unrecognized Stripe session must fail closed: '+name);
   assert(!processedEvents.has(other.id),'Unexpected event must remain unprocessed: '+name);
   assert.equal(receivedInserts,b2bPaymentsAfter);
 }

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
 assert.equal(receivedInserts,b2bPaymentsAfter,'Cross-mode event must not record payment');
 console.log('PASS: Stripe fail-closed gate, owner-approved tax, signature verification, server price, hosted URL and signed payment reconciliation.');
}finally{globalThis.fetch=saved}
