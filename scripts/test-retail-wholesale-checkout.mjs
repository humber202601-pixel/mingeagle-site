import assert from 'node:assert/strict';
import {build} from 'esbuild';
const compile=async path=>{
 const built=await build({entryPoints:[path],bundle:true,write:false,platform:'node',format:'esm',target:'es2022',logLevel:'silent'});
 return import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
};
const policy=await compile('functions/_shared/retail-checkout.ts');
const checkout=await compile('functions/api/retail/checkout.ts');
const readiness=await compile('functions/api/retail/checkout-readiness.ts');
const cart=await compile('functions/api/shipping/cart.ts');
const fully={AIRWALLEX_CHECKOUT_ENABLED:'true',AIRWALLEX_ENV:'prod',
 AIRWALLEX_CLIENT_ID:'demo',AIRWALLEX_API_KEY:'demo',
 AIRWALLEX_WEBHOOK_SECRET:'demo',RETAIL_DIRECT_CHECKOUT_ENABLED:'true',
 RETAIL_FULFILLMENT_APPROVED:'true',RETAIL_TAX_COMPLIANCE_APPROVED:'true',
 RETAIL_US_TAX_RULES_JSON:JSON.stringify({
 '94105':{rate:0.0875,shippingTaxable:true,verifiedAt:new Date().toISOString().slice(0,10)}
 }),TURNSTILE_SECRET_KEY:'demo'};
assert(policy.retailCheckoutReady(fully));
assert(!policy.retailCheckoutReady({...fully,AIRWALLEX_ENV:'sandbox'}));
for(const key of Object.keys(fully)){
 assert(!policy.retailCheckoutReady({...fully,[key]:''}),'Cannot activate without '+key);
}
assert.equal(policy.retailTaxCents(fully,'94105',1000,200),105);
assert.throws(()=>policy.retailTaxCents(fully,'10001',1000,200),/reviewed/);
assert.throws(()=>policy.retailTaxCents({...fully,RETAIL_US_TAX_RULES_JSON:'{}'},'94105',1000,200));
const headers={'content-type':'application/json',origin:'https://www.mingeagle.com'};
const request=body=>new Request('https://app.mingeagle.com/api/retail/checkout',{method:'POST',headers,body:JSON.stringify(body)});
const sample={requestId:'123e4567-e89b-42d3-a456-426614174000',
 lines:[{sku:'P1-S3',quantity:1}],shippingCountry:'US',shippingMethod:'air',
 customer:{name:'Test Customer',email:'test@example.com',address1:'1 Main Street',
 city:'San Francisco',region:'CA',postalCode:'94105'},
 acceptShippingTerms:true,acceptTaxes:true,turnstileToken:'invalid'};
let response=await checkout.onRequestPost({request:request(sample),env:{}});assert.equal(response.status,503);
response=await checkout.onRequestPost({request:request(sample),env:fully});assert.equal(response.status,403);
response=await checkout.onRequestPost({request:new Request('https://app.mingeagle.com/api/retail/checkout',{
 method:'POST',headers:{...headers,origin:'https://attacker.example'},body:JSON.stringify(sample)}),env:fully});
assert.equal(response.status,403);
response=await checkout.onRequestPost({request:request({...sample,lines:[{sku:'P1-S3',quantity:10}]}),env:fully});
assert.equal(response.status,400);
response=await checkout.onRequestPost({request:request({...sample,shippingMethod:'sea'}),env:fully});
assert.equal(response.status,400);
response=await checkout.onRequestPost({request:request({...sample,customer:{...sample.customer,address1:'<script>'}}),env:fully});
assert.equal(response.status,400);
const fakeRate={usd_per_unit:8,volume_divisor:6000,min_charge_usd:0,handling_usd:0};
const packs={'P1-S3':{length_cm:25,width_cm:25,height_cm:25,units_per_package:1}};
const db={prepare(sql){
 let args=[];return {bind(...a){args=a;return this},async first(){
  if(sql.includes('shipping_rates'))return fakeRate;
  if(sql.includes('shipping_packaging'))return packs[args[0]]||null;
  throw Error('Unexpected SQL read '+sql);
 }};}};
const requestCart=(lines,method,accepted)=>cart.onRequestPost({request:new Request('https://app.mingeagle.com/api/shipping/cart',{
 method:'POST',headers:{'content-type':'application/json'},
 body:JSON.stringify({lines,country:'US',method,seaFreightAccepted:accepted})}),env:{MINGEAGLE_DB:db}});
const base=Array.from({length:1},()=>({sku:'P1-S3',quantity:9}));
response=await requestCart(base,'air',false);const retail=await response.json();
assert.equal(response.status,200);
assert.equal(retail.productsUSD,89.1);
assert.equal(retail.quantity,9);
assert.equal(retail.paymentEnabled,false);
response=await requestCart([{sku:'P1-S3',quantity:10}],'air',true);
assert.equal(response.status,409);
response=await requestCart([{sku:'P1-S3',quantity:10}],'sea',false);
assert.equal(response.status,409);
response=await requestCart([{sku:'P1-S3',quantity:10}],'sea',true);
const wholesale=await response.json();
assert.equal(response.status,200);
assert.equal(wholesale.mode,'WHOLESALE_RFQ');
assert.equal(wholesale.estimatedTransitDaysMin,25);
assert.equal(wholesale.estimatedTransitDaysMax,30);
assert.equal(wholesale.paymentEnabled,false);
assert(!('totalBeforeTaxesUSD' in wholesale),'Wholesale discount not fabricated');
response=await requestCart([{sku:'P1-S3',quantity:1}],'sea',true);
assert.equal(response.status,409);
const readinessRes=await readiness.onRequestGet({request:new Request('https://app.mingeagle.com/api/retail/checkout-readiness'),env:{}});
assert.equal((await readinessRes.json()).retailCheckoutReady,false);
console.log('PASS: retail 1–9 air, wholesale 10+ consented sea, no made-up bulk price, fail-closed direct payment readiness, tax and Turnstile gates.');
