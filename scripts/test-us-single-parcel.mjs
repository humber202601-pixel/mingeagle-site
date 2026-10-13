import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';

const approved=JSON.parse(readFileSync('public/us-single-parcel-shipping.json','utf8'));
const retail=JSON.parse(readFileSync('public/retail-reference-prices.json','utf8')).products;
const source=await build({entryPoints:['lib/us-small-parcel.ts'],
 bundle:true,write:false,platform:'node',format:'esm',target:'es2022',logLevel:'silent'});
const {oneItemUsAirParcel,US_SMALL_PARCEL_RATES}=await import(
 'data:text/javascript;base64,'+Buffer.from(source.outputFiles[0].text).toString('base64'));
let total=0;
for(const [id,sizes] of Object.entries(retail)){
 assert.deepEqual(Object.keys(approved.productSizeShippingUSD[id]).sort(),Object.keys(sizes).sort());
 for(const [size,product] of Object.entries(sizes)){
  const sku=id.toUpperCase()+'-S'+size,fee=approved.productSizeShippingUSD[id][size],quote=oneItemUsAirParcel(sku,'US','air',1);
  assert.equal(US_SMALL_PARCEL_RATES[sku],fee);
  assert.equal(quote.productUSD,product,sku);
  assert.equal(quote.shippingUSD,fee,sku);
  assert.equal(quote.totalBeforeTaxesUSD,Math.round((product+fee)*100)/100,sku);
  assert.equal(quote.deliveryEstimateDaysMin,12);
  assert.equal(quote.deliveryEstimateDaysMax,15);
  assert.equal(quote.paymentEnabled,false);
  assert.equal(quote.taxesNotIncluded,true);
  total++;
 }
}
assert.equal(total,11);
for(const args of [
 ['P1-S3','CA','air',1],['P1-S3','US','sea',10],
 ['P1-S3','US','air',2],['P4-S7','US','air',1],
 ['__proto__','US','air',1],['P1-S3','us','air',1]])
 assert.equal(oneItemUsAirParcel(...args),null,args.join('|'));

async function load(file){
 const out=await build({entryPoints:[file],bundle:true,write:false,
  platform:'node',format:'esm',target:'es2022',logLevel:'silent'});
 return import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
}
const single=await load('functions/api/shipping/estimate.ts');
const cart=await load('functions/api/shipping/cart.ts');
for(const [sku,fee] of Object.entries(US_SMALL_PARCEL_RATES)){
 const query=new URLSearchParams({sku,country:'US',method:'air',quantity:'1'});
 const response=await single.onRequestGet({
  request:new Request('https://app.mingeagle.com/api/shipping/estimate?'+query),
  env:{MINGEAGLE_DB:null}});
 const body=await response.json();
 assert.equal(response.status,200,sku);
 assert.equal(body.shippingUSD,fee,sku);
 assert.equal(body.quoteSource,'APPROVED_US_SINGLE_ITEM_AIR_SMALL_PARCEL');
 assert.equal(body.deliveryEstimateDaysMax,15);
 assert.equal(response.headers.get('cache-control'),'no-store');
 const responseCart=await cart.onRequestPost({
  request:new Request('https://app.mingeagle.com/api/shipping/cart',{
   method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({country:'US',method:'air',lines:[{sku,quantity:1}]})}),
  env:{MINGEAGLE_DB:null}});
 const c=await responseCart.json();
 assert.equal(responseCart.status,200,sku);
 assert.equal(c.totalBeforeTaxesUSD,body.totalBeforeTaxesUSD,sku);
 assert.equal(c.shippingUSD,body.shippingUSD,sku);
 assert.equal(c.paymentEnabled,false);
}
// No silent per-item multiplication for larger carts or non-US destinations.
for(const test of [
 {country:'US',method:'air',lines:[{sku:'P1-S3',quantity:2}]},
 {country:'US',method:'air',lines:[{sku:'P1-S3',quantity:1},{sku:'P2-S3',quantity:1}]},
 {country:'CA',method:'air',lines:[{sku:'P1-S3',quantity:1}]}
]){
 const res=await cart.onRequestPost({request:new Request('https://app.mingeagle.com/api/shipping/cart',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(test)}),env:{}});
 assert.equal(res.status,503,'Other shipping scenarios must use D1 tariff and cannot be guessed');
}
const other=await single.onRequestGet({request:new Request('https://app.mingeagle.com/api/shipping/estimate?sku=P1-S3&country=CA&method=air&quantity=1'),env:{}});
assert.equal(other.status,503,'Other countries still depend on existing D1 rates');
console.log('PASS: 11 USA one-item air shipping prices, 12–15 day estimate, exact website/CRM source match, cart and single SKU endpoints, no extrapolation to bulk or foreign countries.');
