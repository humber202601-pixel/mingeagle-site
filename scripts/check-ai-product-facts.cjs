const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const root=path.resolve('public');
const run=(dir,...args)=>cp.execFileSync(process.execPath,['scripts/build-ai-product-facts.cjs',dir,...args],{encoding:'utf8'});
run(root);
const jsonBefore=fs.readFileSync(path.join(root,'ai-product-facts.json'),'utf8');
const txtBefore=fs.readFileSync(path.join(root,'llms.txt'),'utf8');
run(root,'--check');
run(root);
assert.equal(fs.readFileSync(path.join(root,'ai-product-facts.json'),'utf8'),jsonBefore,'Catalog generator not idempotent');
assert.equal(fs.readFileSync(path.join(root,'llms.txt'),'utf8'),txtBefore,'LLM directory generator not idempotent');
const data=JSON.parse(jsonBefore);
const master=JSON.parse(fs.readFileSync(path.join(root,'product-master.json'),'utf8'));
const retail=JSON.parse(fs.readFileSync(path.join(root,'retail-prices.json'),'utf8'));
const us=JSON.parse(fs.readFileSync(path.join(root,'us-single-parcel-shipping.json'),'utf8'));
const scope=JSON.parse(fs.readFileSync(path.join(root,'retail-checkout-scope.json'),'utf8'));
const approved=new Set(us.confirmedDdpSingleItems.map(item=>item.sku));
assert.deepEqual([...approved].sort(),[...scope.eligibleSkus].sort());
const siteMap=fs.readFileSync(path.join(root,'sitemap.xml'),'utf8');
assert.equal(data.documentType,'first-party-public-product-facts');
assert.equal(data.publisher.website,'https://www.mingeagle.com/');
assert.equal(data.products.length,4);
assert.equal(data.publisher.wholesaleProductFactsCsv,'https://www.mingeagle.com/wholesale-product-facts.csv');
assert(txtBefore.includes('[Download first-party wholesale product comparison (CSV)]('+data.publisher.wholesaleProductFactsCsv+')'),'Machine-readable buyer guide must expose real downloadable CSV');
assert.equal(data.guides.length,10);
assert.equal(new Set(data.products.map(x=>x.id)).size,4);
assert.equal(new Set(data.guides.map(x=>x.url)).size,10);
for(const item of data.products){
 assert.equal(item.name,master[item.id].name);
 assert.equal(item.colors,master[item.id].colors);
 assert.equal(item.image,'https://www.mingeagle.com/'+master[item.id].hero);
 assert.deepEqual(item.retailReferencePricesUsdBySize,retail.products[item.id]);
 const usFees=us.productSizeShippingUSD[item.id];
 assert.deepEqual(item.usSingleItemAirParcelShippingUsdBySize,usFees);
 assert.deepEqual(Object.keys(item.usSingleItemTotalBeforeTaxUsdBySize).sort(),
  Object.keys(usFees).filter(size=>approved.has(item.id.toUpperCase()+'-S'+size)).sort(),
  'Only DDP-approved SKUs may have a published US single-unit landed total');
 for(const size of Object.keys(retail.products[item.id])){
  const expected=Math.round((retail.products[item.id][size]+usFees[size])*100)/100;
  const confirmed=approved.has(item.id.toUpperCase()+'-S'+size);
  if(confirmed){
   assert.equal(item.usSingleItemTotalBeforeTaxUsdBySize[size],expected);
   assert(txtBefore.includes('Size '+size+' USD '+expected.toFixed(2)),'Confirmed DDP totals must be AI-readable '+item.id+' '+size);
  }else assert(!Object.prototype.hasOwnProperty.call(item.usSingleItemTotalBeforeTaxUsdBySize,size),
   'No unconfirmed DDP total in first-party AI facts '+item.id+' '+size);
 }
 const sourceSizes=[...master[item.id].sizes.matchAll(/No\.\s*(\d+)/g)].map(m=>'No. '+m[1]);
 assert.deepEqual(item.sizes,sourceSizes);
 assert(siteMap.includes('<loc>'+item.url+'</loc>'));
 assert(txtBefore.includes('['+item.name+']('+item.url+')'),'Missing product navigational text');
 assert(fs.existsSync(path.join(root,item.image.replace('https://www.mingeagle.com/',''))));
}
for(const g of data.guides){
 assert(siteMap.includes('<loc>'+g.url+'</loc>'));
 assert(txtBefore.includes(']('+g.url+')'));
}
assert(!/\b(?:inStock|InStock|aggregateRating|reviewCount|ratingValue|guaranteed silent|certified safe)\b/i.test(jsonBefore),'Do not publish unverified availability/review/certification claims');
assert(txtBefore.includes('not an independent test report'));
assert(txtBefore.includes('public-sector sports equipment quote'),'Institutional procurement buyers need source link');
assert(txtBefore.includes('only; final delivered total'),'Unconfirmed direct checkout must be clearly disclosed');
assert(txtBefore.includes('not imply any provider has crawled, indexed, ranked or cited'));
assert(data.retailPricing.limitations.includes('Excludes international shipping'));
assert.equal(data.usSingleItemAirParcel.deliveryEstimateGuaranteed,false);
assert.deepEqual(data.usSingleItemAirParcel.estimatedDeliveryDaysAfterDispatch,{min:12,max:15});
assert(!Object.keys(data).includes('searchRanking'));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ai-facts-negative-'));
try{
 const files=['product-master.json','retail-prices.json','us-single-parcel-shipping.json','retail-fulfillment-policy.json','retail-checkout-scope.json','sitemap.xml',...data.products.map(p=>p.url.split('/').at(-1)),...data.guides.map(g=>g.url.split('/').at(-1)),'products.html','inquiry.html','wholesale-product-facts.csv'];
 for(const name of new Set(files))fs.copyFileSync(path.join(root,name),path.join(tmp,name));
 fs.mkdirSync(path.join(tmp,'assets'));
 for(const x of data.products)fs.copyFileSync(path.join(root,master[x.id].hero),path.join(tmp,master[x.id].hero));
 const testFailure=()=>{assert.throws(()=>run(tmp),'Invalid source data must stop AI catalog generation')};
 let p=JSON.parse(fs.readFileSync(path.join(tmp,'retail-prices.json'),'utf8'));
 delete p.products.p3['7'];fs.writeFileSync(path.join(tmp,'retail-prices.json'),JSON.stringify(p));
 testFailure();
 fs.copyFileSync(path.join(root,'retail-prices.json'),path.join(tmp,'retail-prices.json'));
 let m=JSON.parse(fs.readFileSync(path.join(tmp,'product-master.json'),'utf8'));
 m.p1.hero='assets/nonexistent-product.webp';fs.writeFileSync(path.join(tmp,'product-master.json'),JSON.stringify(m));
 testFailure();
 fs.copyFileSync(path.join(root,'product-master.json'),path.join(tmp,'product-master.json'));
 fs.writeFileSync(path.join(tmp,'sitemap.xml'),siteMap.replace('<loc>https://www.mingeagle.com/for-coaches.html</loc>',''));
 testFailure();
}finally{fs.rmSync(tmp,{recursive:true,force:true})}
console.log('PASS: first-party AI JSON/llms text identical on repeat builds, all four product specs/prices source aligned, five real buyer pages, and rejects missing evidence/invalid SKUs.');
