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
assert(cart.includes("linkToInquiry('quote')")&&cart.includes("linkToInquiry('retail')"));
assert(!cart.includes('window.location.href=\'https://airwallex.com'), 'Never invent an unverified checkout payment link');
const page=fs.readFileSync('public/retail-cart.html','utf8');
assert(page.includes('id="cartSeaConsent"')&&page.includes('25–30 days'));
assert(page.includes('id="cartRetail"')&&page.includes('id="cartWholesale"'));
assert(page.includes('retail-cart.js?v=20261013-quantity-routing'));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'retail-route-'));
try{
 const files=['index.html','products.html','silent-basketball.html','fabric-silent-basketball.html',
  'weighted-flocked-basketball.html','silent-soccer.html',
  'retail-prices.json','us-single-parcel-shipping.json','product-master.json'];
 for(const file of files)fs.copyFileSync(path.join('public',file),path.join(tmp,file));
 cp.execFileSync(process.execPath,['scripts/build-us-delivered-prices.cjs',tmp]);
 for(const file of files.filter(x=>x.endsWith('.html'))){
  const html=fs.readFileSync(path.join(tmp,file),'utf8');
  assert(html.includes('quantity-based wholesale discount'),file);
  assert(html.includes('25–30 days'),file);
 }
 const catalog=fs.readFileSync(path.join(tmp,'products.html'),'utf8');
 assert(catalog.includes('Build retail cart (1–9 items)'));
 assert(catalog.includes('Request wholesale quote (10+)'));
}finally{fs.rmSync(tmp,{recursive:true,force:true})}
console.log('PASS: 9/10 routing and buyer consent, no duplicated cart, no fake checkout, transparent retail and tiered sea wholesale pages.');
