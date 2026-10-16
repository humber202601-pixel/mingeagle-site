const assert=require('node:assert/strict');
const fs=require('node:fs'),cp=require('node:child_process'),os=require('node:os'),path=require('node:path');
const policy=require('../public/sales-quantity-policy.json');
assert.deepEqual([policy.retail.minUnits,policy.retail.maxUnits,policy.wholesale.minUnits],[1,9,10]);
assert.equal(policy.wholesale.shippingMethod,'sea');
assert.equal(policy.wholesale.shippingConsentRequired,true);
assert.equal(policy.wholesale.fixedDiscountPercent,null);
assert.deepEqual(policy.wholesale.estimatedSeaDeliveryDays,{min:25,max:30});
for(const file of ['public/retail-cart.js','public/retail-shipping.js']){
 cp.execFileSync(process.execPath,['--check',file],{stdio:'pipe'});
}
const cart=fs.readFileSync('public/retail-cart.js','utf8');
assert.equal((cart.match(/function redraw\(/g)||[]).length,0,'No stale duplicated cart implementation');
assert.equal((cart.match(/function render\(/g)||[]).length,1,'One current cart implementation');
assert(cart.includes('n>=10')&&cart.includes("bulk?'sea':'air'"));
assert(cart.includes('seaFreightAccepted:sourceConsent()'));
assert(cart.includes('/api/retail/checkout-status'));
assert(cart.includes('data.retailCheckoutReady===true'));
assert(cart.includes("new URL('https://app.mingeagle.com/retail/checkout')"));
assert(cart.includes("linkToInquiry('retail')"),'Keep an explicit quote request for unconfirmed retail delivery');
assert(cart.includes("checkoutAvailable?'Continue to secure checkout →':'Request confirmed retail quote →'"),
 'Secure checkout wording may appear only after server readiness confirmation');
assert(cart.includes("result.ddpConfirmed!==true?'Request confirmed delivered-price quote →'"),
 'Unconfirmed DDP route must be explicitly labeled as a quote');
assert(cart.includes("$('cartInquiry').hidden=!checkoutAvailable;"),
 'Quote alternative is offered when online payment is ready');
assert(cart.includes("$('cartInquiry').addEventListener('click'"),'Quote is a customer action, not an automatic redirect');
const availabilityPath=cart.slice(cart.indexOf("const button=$('cartCheckout');"),cart.indexOf("$('cartInquiry').addEventListener('click'"));
assert(!availabilityPath.includes("linkToInquiry('retail')"),
 'Failed secure checkout readiness must relabel the button, not automatically redirect');
assert(cart.includes("if(last.ddpConfirmed!==true||!checkoutAvailable)"),
 'Quote handoff occurs only from explicit quote-labeled CTA');
assert(cart.includes("checkoutAvailable=Boolean(data?.ok&&data.retailCheckoutReady===true&&n<=(data.maxDirectCheckoutUnits??1)"),
 'Payment readiness is checked while building order estimate');
assert(cart.includes("checkoutAvailable=false;"),'Readiness must default to fail-closed');
assert(cart.includes("read().every(x=>allowed(x.sku,x.color)&&data.eligibleSkus?.includes(x.sku))"),
 'Valid different-color cart lines must not be rejected merely for sharing a SKU');
assert(cart.includes("linkToInquiry('quote')")&&cart.includes("linkToInquiry('retail')"));
assert(!cart.includes('window.location.href=\'https://airwallex.com'), 'Never invent an unverified checkout payment link');
const page=fs.readFileSync('public/retail-cart.html','utf8');
assert(page.includes('id="cartSeaConsent"')&&page.includes('25–30 days'));
assert(page.includes('id="cartRetail"')&&page.includes('id="cartWholesale"'));
assert(page.includes('retail-cart.js?v=20261016-rfqonly1'));
assert(page.includes('id="cartInquiry"')&&page.includes('#cartInquiry[hidden]{display:none}'),
 'Secondary quote button must be accessible only after checkout readiness failure');
assert(page.includes('id="cartCustomsNote"')&&page.includes('import duties'));
assert(cart.includes('last.ddpConfirmed!==true'), 'Unconfirmed duty-paid routes must use an inquiry');
assert(cart.includes("lines.every(x=>['P1-S3','P1-S7'].includes(x.sku))"),'Only confirmed eligible SKUs use separate duty-paid parcels');
assert(cart.includes('$11.50 shipping')&&cart.includes('$14.00 shipping'),'Customer sees exact duty-paid shipping rates');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'retail-route-'));
try{
 const files=['index.html','products.html','silent-basketball.html','fabric-silent-basketball.html',
  'weighted-flocked-basketball.html','silent-soccer.html',
  'retail-prices.json','us-single-parcel-shipping.json','retail-fulfillment-policy.json','product-master.json'];
 for(const file of files)fs.copyFileSync(path.join('public',file),path.join(tmp,file));
 cp.execFileSync(process.execPath,['scripts/build-us-delivered-prices.cjs',tmp]);
 for(const file of files.filter(x=>x.endsWith('.html'))){
  const html=fs.readFileSync(path.join(tmp,file),'utf8');
  assert(html.includes('quantity-based wholesale discount'),file);
  assert(html.includes('25–30 days'),file);
 }
 const catalog=fs.readFileSync(path.join(tmp,'products.html'),'utf8');
 assert(catalog.includes('Select product size and color above'));
 assert(catalog.includes('Request wholesale quote (10+)'));
 assert(catalog.includes('Choose size, color &amp; add →'));
 for(const size of [3,5,7])assert(catalog.includes('silent-basketball.html?size='+size+'#buy-now'));

}finally{fs.rmSync(tmp,{recursive:true,force:true})}
console.log('PASS: 9/10 routing and buyer consent, no duplicated cart, no fake checkout, transparent retail and tiered sea wholesale pages.');
