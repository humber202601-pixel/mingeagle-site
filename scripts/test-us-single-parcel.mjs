import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';

const approved=JSON.parse(readFileSync('public/us-single-parcel-shipping.json','utf8'));
const retail=JSON.parse(readFileSync('public/retail-reference-prices.json','utf8')).products;
const source=await build({entryPoints:['lib/us-small-parcel.ts'],
 bundle:true,write:false,platform:'node',format:'esm',target:'es2022',logLevel:'silent'});
const {oneItemUsAirParcel,separateUnitUsAirParcels,US_SMALL_PARCEL_RATES}=await import(
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
  assert.equal(quote.ddpConfirmed,['P1-S3','P1-S7'].includes(sku));
  assert.equal(quote.importDutiesIncluded,['P1-S3','P1-S7'].includes(sku));
  assert.equal(quote.usSalesTaxNotIncluded,true);
  assert.equal(quote.taxesNotIncluded,true);
  total++;
 }
}
assert.equal(total,11);
assert.deepEqual(approved.confirmedDdpSingleItems.map(x=>[x.sku,x.shippingUSD]).sort(),
 [['P1-S3',11.5],['P1-S7',14]].sort(),'Only confirmed single-item rates permit DDP');
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
 assert.equal(c.ddpConfirmed,['P1-S3','P1-S7'].includes(sku));
 assert.equal(c.wholesale,false,'Retail cart requires explicit wholesale:false even for one unit: '+sku);
 if(c.ddpConfirmed){
  assert(c.notice.includes(sku),'DDP notice must name correct confirmed product');
  assert(c.notice.includes(String.fromCharCode(36)+fee.toFixed(2)),'DDP notice must state exact shipping amount');
  assert(c.notice.includes('no additional import duty'));
 }else assert(c.notice.includes('not yet confirmed'),'Unconfirmed SKU must not claim DDP');
}
// Unconfirmed SKUs, consolidated freight and non-US destinations retain quote pricing.
for(const test of [
 {country:'US',method:'air',lines:[{sku:'P1-S3',quantity:1},{sku:'P2-S3',quantity:1}]},
 {country:'CA',method:'air',lines:[{sku:'P1-S3',quantity:1}]}
]){
 const res=await cart.onRequestPost({request:new Request('https://app.mingeagle.com/api/shipping/cart',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(test)}),env:{}});
 assert.equal(res.status,503,'Other shipping scenarios must use D1 tariff and cannot be guessed');
}
// Multi-unit prices are explicitly separate one-unit parcels, never a combined rate.
for(const [lines,goods,shipping] of [
 [[{sku:'P1-S3',quantity:2}],19.8,23],
 [[{sku:'P1-S7',quantity:2}],29.8,28],
 [[{sku:'P1-S3',quantity:1},{sku:'P1-S7',quantity:1}],24.8,25.5],
 [[{sku:'P1-S7',quantity:9}],134.1,126]
]){
 const request=new Request('https://app.mingeagle.com/api/shipping/cart',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({country:'US',method:'air',lines})});
 const res=await cart.onRequestPost({request,env:{MINGEAGLE_DB:{prepare(){throw Error('Confirmed separate-parcel rates must not use the bulk engine')}}}});
 const data=await res.json();assert.equal(res.status,200,JSON.stringify(data));
 assert.equal(data.productsUSD,goods);assert.equal(data.shippingUSD,shipping);
 assert.equal(Math.round(data.totalBeforeTaxesUSD*100),Math.round(goods*100)+Math.round(shipping*100));
 assert.equal(data.ddpConfirmed,true);assert.equal(data.shippingPlan,'ONE_UNIT_PER_PARCEL');
 assert.equal(data.wholesale,false,'Retail air quote with 2–9 units must explicitly be wholesale:false');
 assert.equal(data.parcelCount,lines.reduce((n,x)=>n+x.quantity,0));assert.equal(data.unitsPerParcel,1);
 assert(data.notice.includes('Parcels may arrive separately'));
}
for(const lines of [[],[{sku:'P1-S3',quantity:0}],[{sku:'P1-S7',quantity:1.5}],[{sku:'P1-S7',quantity:10}],[{sku:'P1-S5',quantity:2}],[{sku:'__proto__',quantity:1}]])
 assert.equal(separateUnitUsAirParcels(lines,'US','air'),null);
assert.equal(separateUnitUsAirParcels([{sku:'P1-S7',quantity:2}],'CA','air'),null);
assert.equal(separateUnitUsAirParcels([{sku:'P1-S7',quantity:2}],'US','sea'),null);
const duplicate=await cart.onRequestPost({request:new Request('https://app.mingeagle.com/api/shipping/cart',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({country:'US',method:'air',lines:[{sku:'P1-S3',quantity:1},{sku:'P1-S3',quantity:1}]})}),env:{}});
assert.equal(duplicate.status,400,'Shipping callers must group the same SKU across colors');
// Strict quantity boundary: retail air through 9, 10+ wholesale sea only.
// No quantity discount percentage or payable wholesale invoice is fabricated.
for(const spec of [
 {n:9,method:'sea',consent:true,status:409},
 {n:10,method:'air',consent:true,status:409},
 {n:10,method:'sea',consent:false,status:409},
 {n:10,method:'sea',consent:true,status:200}
]){
 const response=await cart.onRequestPost({request:new Request('https://app.mingeagle.com/api/shipping/cart',{
  method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
   country:'US',method:spec.method,seaFreightAccepted:spec.consent,
   lines:[{sku:'P1-S3',quantity:spec.n}]
  })}),env:{}});
 assert.equal(response.status,spec.status,JSON.stringify(spec));
 const data=await response.json();
 if(spec.n===10&&spec.method==='sea'&&!spec.consent)
  assert.equal(data.shippingConsentRequired,true);
 if(spec.n===10&&spec.method==='sea'&&spec.consent){
  assert.equal(data.quoteRequired,true);
  assert.equal(data.wholesale,true,'Wholesale sea quote must remain wholesale:true');
  assert.equal(data.volumeCBM,null);
  assert.equal(data.packagingVerified,false);
  assert.equal(data.totalBeforeTaxesUSD,null);
 }
}
// An active sea CBM rate without written DDP source evidence may calculate
// packing volume but must not manufacture a wholesale price in either API.
const dbReadOnly={prepare(){throw Error('Wholesale quote-only endpoints must not trust placeholder D1 cartons')}};
for(const quantity of [10,50,100]){
 const params=new URLSearchParams({sku:'P1-S7',country:'US',method:'sea',quantity:String(quantity)});
 const response=await single.onRequestGet({request:new Request('https://app.mingeagle.com/api/shipping/estimate?'+params),env:{MINGEAGLE_DB:dbReadOnly}});
 const body=await response.json();
 assert.equal(response.status,200,JSON.stringify(body));
 assert.equal(body.quoteRequired,true);
 assert.equal(body.wholesale,true);
 assert.equal(body.paymentEnabled,false);
 assert.equal(body.shippingUSD,null);
 assert.equal(body.productUSD,null);
 assert.equal(body.totalBeforeTaxesUSD,null);
 assert.equal(body.ddpConfirmed,false);
 assert.equal(body.packagingEstimateOnly,false);
 assert.equal(body.cbm,null,'Unverified carton configuration must not produce customer CBM');
 assert.equal(body.packagingVerified,false);
 assert(body.notice.includes('DDP'));
 assert(!JSON.stringify(body).includes('429.4285714'),'Unverified sea rate must not leak as freight quote');
 const cartResponse=await cart.onRequestPost({
  request:new Request('https://app.mingeagle.com/api/shipping/cart',{method:'POST',
   headers:{'content-type':'application/json'},
   body:JSON.stringify({country:'US',method:'sea',seaFreightAccepted:true,lines:[{sku:'P1-S7',quantity}]})}),
  env:{MINGEAGLE_DB:dbReadOnly}
 });
 const result=await cartResponse.json();
 assert.equal(cartResponse.status,200,JSON.stringify(result));
 assert.equal(result.quoteRequired,true);
 assert.equal(result.shippingUSD,null);
 assert.equal(result.productsUSD,null);
 assert.equal(result.totalBeforeTaxesUSD,null);
 assert.equal(result.paymentEnabled,false);
 assert.equal(result.ddpConfirmed,false);
 assert.equal(result.volumeCBM,null,'No shipping volume may be inferred from placeholder cartons');
 assert.equal(result.packagingVerified,false);
 assert.deepEqual(result.lines,[{sku:'P1-S7',quantity}],'Customer RFQ should preserve the selected item/qty only');
}
const other=await single.onRequestGet({request:new Request('https://app.mingeagle.com/api/shipping/estimate?sku=P1-S3&country=CA&method=air&quantity=1'),env:{}});
assert.equal(other.status,503,'Other countries still depend on existing D1 rates');
console.log('PASS: 11 USA one-item air shipping prices, 12–15 day estimate, exact website/CRM source match, cart and single SKU endpoints, no extrapolation to bulk or foreign countries.');
