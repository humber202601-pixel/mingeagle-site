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
const full={MINGEAGLE_DB:null,AIRWALLEX_CLIENT_ID:'synthetic',
 AIRWALLEX_API_KEY:'synthetic',AIRWALLEX_ENV:'sandbox',
 AIRWALLEX_WEBHOOK_SECRET:'synthetic',AIRWALLEX_CHECKOUT_ENABLED:'true',
 RETAIL_CHECKOUT_ENABLED:'true',RETAIL_STOCK_FULFILLMENT_APPROVED:'true',
 RETAIL_TAX_POLICY_APPROVED:'true',TURNSTILE_ENABLED:'true',
 TURNSTILE_SITE_KEY:'synthetic-site',TURNSTILE_SECRET_KEY:'synthetic-secret'};
const requestId='ab44e012-00da-469b-9000-b50406b1fb70';
const base={requestId,country:'US',method:'air',
 lines:[{sku:'P1-S3',quantity:1,color:'Orange'}],name:'Example Customer',
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
  const statement={bind(...x){parameters=x;return statement},
   async first(){if(sql.includes('FROM retail_checkout_requests'))return db.seen?{request_id:requestId}:null;
    if(sql.includes('FROM contacts'))return null;
    throw Error('Unexpected read '+sql)},
  };
  return statement;
 },async batch(statements){writes+=statements.length;
  const hasQuote=statements.some(s=>s===undefined);assert.equal(hasQuote,false);
  db.seen=true;return statements.map(()=>({success:true}));
 },seen:false};
try{
 globalThis.fetch=async()=>{network++;throw Error('Provider network must not be called before readiness')};
 for(const changes of [{AIRWALLEX_API_KEY:''},{AIRWALLEX_CHECKOUT_ENABLED:'false'},
  {AIRWALLEX_WEBHOOK_SECRET:''},{RETAIL_CHECKOUT_ENABLED:'false'},
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
 assert.equal(result.totalBeforeTaxesUSD,21.4);
 assert.equal(result.paymentStatus,'UNPAID');
 assert.match(result.paymentPage,/^https:\/\/app\.mingeagle\.com\/quote\/[0-9a-f]{64}$/);
 assert(writes>=7,'Quote+order+items+customer request must persist atomically');
 assert.equal(network,1,'One signed human validation only; no payment capture call');
 const again=await onRequestPost({env,request:make()});
 assert.equal(again.status,409,'idempotent checkout prevents repeat order creation');
 assert.equal(network,2,'Challenge verification required even on replay');
 assert(!JSON.stringify(result).includes('synthetic-secret'));
 const sql=readFileSync('migrations/0013_retail_checkout_requests.sql','utf8');
 assert(sql.includes('PRIMARY KEY')&&sql.includes('order_id TEXT NOT NULL UNIQUE'));
 assert(!/card_number|cvv|pan_number/i.test(sql));
 const routes=readFileSync('src/App.tsx','utf8');
 assert(routes.includes('path="/retail/checkout"'));
 assert(routes.includes('path="/quote/:token"'));
 const quoteUi=readFileSync('src/CustomerQuote.tsx','utf8');
 assert(quoteUi.includes('payment_status')&&quoteUi.includes('noindex,nofollow'));
 assert(quoteUi.includes('/api/payments/airwallex/create'));
 console.log('PASS: payment off by default, quantity & origin bounds, Turnstile, verified 1-unit price, atomic pending order and idempotency, hosted Airwallex webhook-only payment status.');
}finally{globalThis.fetch=saved}
