import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const bundle=async entry=>{
 const out=await build({entryPoints:[entry],bundle:true,write:false,
  platform:'node',format:'esm',target:'es2022',logLevel:'silent'});
 return import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
};
const {onRequestPost}=await bundle('functions/api/retail/checkout.ts');
const {onRequestGet}=await bundle('functions/api/retail/checkout-status.ts');
const full={MINGEAGLE_DB:null,STRIPE_SECRET_KEY:'sk_test_synthetic_only',
 STRIPE_WEBHOOK_SECRET:'whsec_synthetic_only',STRIPE_MODE:'test',
 STRIPE_CHECKOUT_ENABLED:'true',STRIPE_TAX_POLICY_APPROVED:'true',AIRWALLEX_CLIENT_ID:'synthetic',
 AIRWALLEX_API_KEY:'synthetic',AIRWALLEX_ENV:'sandbox',
 AIRWALLEX_WEBHOOK_SECRET:'synthetic',AIRWALLEX_CHECKOUT_ENABLED:'true',
 RETAIL_CHECKOUT_ENABLED:'true',RETAIL_STOCK_FULFILLMENT_APPROVED:'true',
 RETAIL_TAX_POLICY_APPROVED:'true',
 RETAIL_US_TAX_POLICY_JSON:JSON.stringify({reviewed_on:new Date().toISOString().slice(0,10),review_reference:'TEST_ONLY_NO_LIVE_TAX_APPROVAL',states:{NY:'NO_COLLECTION_REQUIRED'}}),TURNSTILE_ENABLED:'true',
 TURNSTILE_SITE_KEY:'synthetic-site',TURNSTILE_SECRET_KEY:'synthetic-secret'};
const requestId='ab44e012-00da-469b-9000-b50406b1fb70';
const base={requestId,country:'US',method:'air',
 lines:[{sku:'P1-S7',quantity:1,color:'Orange'}],name:'Example Customer',
 email:'example.customer@example.net',phone:'+1 212 555 0100',
 street1:'1 Sample Ave',city:'New York',state:'NY',postalCode:'10001',
 privacyAck:true,turnstileToken:'synthetic-captcha'};
const make=(body=base,origin='https://app.mingeagle.com')=>new Request(
 'https://app.mingeagle.com/api/retail/checkout',{
 method:'POST',headers:{'content-type':'application/json','origin':origin},
 body:JSON.stringify(body)});
let network=0,reads=0,writes=0;
const saved=globalThis.fetch;
const db={prepare(sql){reads++;let parameters=[];
  const statement={sql,parameters,bind(...x){parameters=x;this.parameters=x;return statement},
   async first(){if(sql.includes('FROM retail_checkout_requests'))return db.seen?{request_id:requestId}:null;
    if(sql.includes('FROM contacts'))return null;
    throw Error('Unexpected read '+sql)},
  };
  return statement;
 },async batch(statements){writes+=statements.length;
  const hasQuote=statements.some(s=>s===undefined);assert.equal(hasQuote,false);
  db.lastBatch=statements;db.seen=true;return statements.map(()=>({success:true}));
 },seen:false};
try{
 globalThis.fetch=async()=>{network++;throw Error('Provider network must not be called before readiness')};
 for(const changes of [{RETAIL_US_TAX_POLICY_JSON:''},{STRIPE_SECRET_KEY:''},{STRIPE_CHECKOUT_ENABLED:'false'},
  {STRIPE_WEBHOOK_SECRET:''},{STRIPE_TAX_POLICY_APPROVED:'false'},{RETAIL_CHECKOUT_ENABLED:'false'},
  {RETAIL_STOCK_FULFILLMENT_APPROVED:'false'},
  {RETAIL_TAX_POLICY_APPROVED:'false'},{TURNSTILE_ENABLED:'false'}]){
  const env={...full,...changes,MINGEAGLE_DB:db};
  assert.equal((await onRequestGet({env})).status,200);
  const status=await (await onRequestGet({env})).json();
  assert.equal(status.retailCheckoutReady,false);
  const result=await onRequestPost({env,request:make()});
  assert.equal(result.status,503,'Missing gate should not access CRM or gateway');
 }
 assert.equal(reads,0);assert.equal(writes,0);assert.equal(network,0);
 const env={...full,MINGEAGLE_DB:db};
 const cases=[
  [{...base,state:'CA'},409],
  [{...base,state:'OR',postalCode:'10001'},400],
  [{...base,state:'NH',postalCode:'03901'},400],
  [{...base,lines:[{sku:'P1-S3',quantity:10,color:'Orange'}]},400],
  [{...base,lines:[{sku:'P1-S3',quantity:9,color:'Orange'},{sku:'P2-S3',quantity:1,color:'Orange'}]},409],
  [{...base,method:'sea'},400],
  [{...base,country:'CA'},400],
  [{...base,privacyAck:false},400],
  [{...base,lines:[{sku:'P4-S7',quantity:1}]},400],
 ];
 // The 10-item request is rejected before any challenge or CRM operation.
 for(const [body,status] of cases){
  const res=await onRequestPost({env,request:make(body)});
  assert.equal(res.status,status,JSON.stringify(body));
 }
 assert.equal((await onRequestPost({env,request:make(base,'https://attacker.example')})).status,403);
 assert.equal(reads,0);assert.equal(writes,0);
 globalThis.fetch=async(url)=>{
  network++;
  assert.equal(url,'https://challenges.cloudflare.com/turnstile/v0/siteverify');
  return {ok:true,json:async()=>({success:true,hostname:'app.mingeagle.com',action:'mingeagle_inquiry'})};
 };
 const positive=await onRequestPost({env,request:make()});
 const result=await positive.json();
 assert.equal(positive.status,200,JSON.stringify(result));
 assert.equal(result.quantity,1);
 assert.equal(result.totalBeforeTaxesUSD,28.9);
 assert.equal(result.paymentStatus,'UNPAID');
 assert.match(result.paymentPage,/^https:\/\/app\.mingeagle\.com\/quote\/[0-9a-f]{64}$/);
 assert(writes>=7,'Quote+order+items+customer request must persist atomically');
 assert.equal(network,1,'One signed human validation only; no payment capture call');
 const writesBeforeReplay=writes;
 const again=await onRequestPost({env,request:make()});
 assert.equal(again.status,409,'idempotent checkout prevents repeat order creation');
 const existingOrder=await again.json();
 assert.match(existingOrder.error,/Checkout request already received/,'Client must receive explicit manual recovery guidance instead of a nonexistent previous payment link');
 assert.equal(writesBeforeReplay,writes,'Duplicate checkout must not create a second order or payment attempt');
 assert.equal(network,2,'Challenge verification required even on replay');
 assert(!JSON.stringify(result).includes('synthetic-secret'));
 // Merchant-approved P1-S3 also has a verified one-unit US duty-paid rate.
 db.seen=false;
 const small=await onRequestPost({env,request:make({...base,
  requestId:'cb44e012-00da-469b-9000-b50406b1fb70',
  lines:[{sku:'P1-S3',quantity:1,color:'Orange'}]})});
 assert.equal(small.status,200,await small.clone().text());
 const smallOrder=await small.json();
 assert.equal(smallOrder.totalBeforeTaxesUSD,21.4,'P1-S3: $9.90 product + $11.50 DDP delivery');
 assert.equal(smallOrder.paymentStatus,'UNPAID');
 // Real retail checkout route, not merely shipping math: 2-unit single SKU,
 // mixed confirmed SKUs and the 9-unit upper bound must all create one
 // UNPAID order with the exact sum of separate one-unit duty-paid parcels.
 const eligibleBaskets=[
  {lines:[{sku:'P1-S7',quantity:2,color:'Orange'}],units:2,goods:29.8,shipping:28,total:57.8},
  {lines:[{sku:'P1-S3',quantity:1,color:'Blue'},{sku:'P1-S7',quantity:1,color:'Orange'}],units:2,goods:24.8,shipping:25.5,total:50.3},
  {lines:[{sku:'P1-S7',quantity:9,color:'Orange'}],units:9,goods:134.1,shipping:126,total:260.1}
 ];
 for(const [i,basket] of eligibleBaskets.entries()){
  db.seen=false;
  const beforeNetwork=network;
  const body={...base,requestId:'eb44e012-00da-469b-9000-b50406b1fb7'+i,lines:basket.lines};
  const response=await onRequestPost({env,request:make(body)});
  assert.equal(response.status,200,'Eligible multi-item checkout should prepare one unpaid order: '+JSON.stringify(basket));
  const order=await response.json();
  assert.equal(order.quantity,basket.units);
  assert.equal(Math.round(order.totalBeforeTaxesUSD*100),Math.round(basket.total*100));
  assert.equal(order.paymentStatus,'UNPAID','Preparing a basket does not mark Stripe funds received');
  assert.match(order.paymentPage,/^https:\/\/app\.mingeagle\.com\/quote\/[0-9a-f]{64}$/);
  assert.equal(network,beforeNetwork+1,'Only anti-bot verification occurs; checkout does not charge');
  const stored=db.lastBatch;
  const orderInsert=stored.find(x=>x.sql.includes('INSERT INTO orders('));
  assert(orderInsert,'One order inserted for the entire cart');
  assert.equal(Math.round(orderInsert.parameters[5]*100),Math.round(basket.goods*100));
  assert.equal(Math.round(orderInsert.parameters[6]*100),Math.round(basket.shipping*100));
  assert.equal(Math.round(orderInsert.parameters[7]*100),Math.round(basket.total*100));
  const orderLines=stored.filter(x=>x.sql.includes('INSERT INTO order_items('));
  const quoteLines=stored.filter(x=>x.sql.includes('INSERT INTO quote_items('));
  assert.equal(orderLines.length,basket.lines.length,'Preserve each variant/size in the order');
  assert.equal(quoteLines.length,basket.lines.length,'Preserve each variant/size in the accepted retail quote');
  assert.equal(Math.round(orderLines.reduce((sum,x)=>sum+Number(x.parameters[5]),0)*100),
   Math.round(basket.goods*100),'All order line subtotals must reconcile exactly');
  assert.deepEqual(orderLines.map(x=>Number(x.parameters[3])),basket.lines.map(x=>x.quantity));
  assert.equal(stored.filter(x=>x.sql.includes('INSERT INTO retail_checkout_requests(')).length,1,
   'One idempotency record per mixed cart, not one per product');
 }
 db.seen=false;
 const unconfirmed=await onRequestPost({env,request:make({...base,
  requestId:'db44e012-00da-469b-9000-b50406b1fb70',
  lines:[{sku:'P1-S5',quantity:1,color:'Orange'}]})});
 assert.equal(unconfirmed.status,409,'Unconfirmed other SKU must not create a retail payment order');
 const sql=readFileSync('migrations/0013_retail_checkout_requests.sql','utf8');
 assert(sql.includes('PRIMARY KEY')&&sql.includes('order_id TEXT NOT NULL UNIQUE'));
 assert(!/card_number|cvv|pan_number/i.test(sql));
 const routes=readFileSync('src/App.tsx','utf8');
 assert(routes.includes('path="/retail/checkout"'));
 assert(routes.includes('path="/quote/:token"'));
 const retailUi=readFileSync('src/RetailCheckout.tsx','utf8');
 assert(retailUi.includes('Confirmed duty-paid parcel rates are not yet available for:'),
  'Unsupported SKU must have a specific, truthful reason before quote fallback');
 assert(retailUi.includes('unconfirmedSkus.length===0')&&retailUi.includes('overDirectLimit'),
  'Two supported SKUs cannot be rejected merely because the cart has multiple lines');
 const quoteUi=readFileSync('src/CustomerQuote.tsx','utf8');
 assert(quoteUi.includes('payment_status')&&quoteUi.includes('noindex,nofollow'));
 assert(!quoteUi.includes('/api/payments/airwallex/create'),
  'Customer quote UI must not expose legacy Airwallex payment');
 assert(!quoteUi.includes('Pay securely with Airwallex'),
  'Customer quote UI must not offer Airwallex');
 assert(quoteUi.includes('order&&checkoutReadyForOrder?')&&quoteUi.includes('payment?.stripe?.retailConfigurationReady'),
  'Retail sample payment remains available only after retail-specific readiness validation');
 assert(quoteUi.includes('payment?.stripe?.b2bConfigurationReady'),
  'Wholesale quote must never inherit retail-only Stripe readiness');
 console.log('PASS: Stripe-only readiness gates, quantity & origin bounds, Turnstile, verified 1-unit price, atomic pending order and idempotency.');
}finally{globalThis.fetch=saved}
