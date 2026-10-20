// First-party facts for AI-assisted discovery, derived from the same public
// catalog that ships to buyers. This is NOT a Google/Bing/OpenAI product feed
// and creates no guarantee of indexing, citations or recommendations.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const args=process.argv.slice(2),check=args.includes('--check');
const root=path.resolve(args.find(v=>v!=='--check')||'public');
const base='https://www.mingeagle.com/';
// Link the already published buyer CSV from each machine-readable source, not a
// claimed independent review, AI endorsement, or wholesale price feed.
const wholesaleCsvUrl=base+'wholesale-product-facts.csv';
assert(fs.existsSync(path.join(root,'wholesale-product-facts.csv')),'Buyer CSV must exist before publishing AI source pointers');
const master=JSON.parse(fs.readFileSync(path.join(root,'product-master.json'),'utf8'));
const prices=JSON.parse(fs.readFileSync(path.join(root,'retail-prices.json'),'utf8'));
const checkoutScope=JSON.parse(fs.readFileSync(path.join(root,'retail-checkout-scope.json'),'utf8'));
const fulfillment=JSON.parse(fs.readFileSync(path.join(root,'retail-fulfillment-policy.json'),'utf8'));
const usShipping=JSON.parse(fs.readFileSync(path.join(root,'us-single-parcel-shipping.json'),'utf8'));
assert.equal(usShipping.destinationCountry,'US');assert.equal(usShipping.scope,'one_product_unit_per_parcel');
const sitemap=fs.readFileSync(path.join(root,'sitemap.xml'),'utf8');
assert.equal(prices.currency,'USD');
const models=[
 {id:'p1',page:'silent-basketball.html',use:'Soft flocked indoor basketball and mini hoop set for controlled family play'},
 {id:'p2',page:'fabric-silent-basketball.html',use:'Fabric-covered soft indoor basketball and mini hoop set for family activities'},
 {id:'p3',page:'weighted-flocked-basketball.html',use:'Weighted-feel indoor basketball model for supervised handling and training-style drills'},
 {id:'p4',page:'silent-soccer.html',use:'Soft flocked size-5 indoor soccer ball for controlled footwork and family activities'}
];
const makeUrl=filename=>{
 assert(/^[a-z0-9-]+\.html$/.test(filename));
 const url=base+filename;
 assert(fs.existsSync(path.join(root,filename)),'Missing buyer-facing source '+filename);
 assert(sitemap.includes('<loc>'+url+'</loc>'),'Missing canonical public sitemap record '+url);
 return url;
};
assert.deepEqual(Object.keys(master).sort(),models.map(x=>x.id).sort(),'Facts registry must cover the exact published product catalog');
assert.deepEqual(Object.keys(prices.products).sort(),Object.keys(master).sort(),'Retail sizes must match published product catalog');
const confirmedDdp=new Set((usShipping.confirmedDdpSingleItems||[]).map(item=>item.sku));
assert.deepEqual([...confirmedDdp].sort(),[...checkoutScope.eligibleSkus].sort(),
 'Only confirmed DDP models may have approved direct-checkout totals');
for(const item of usShipping.confirmedDdpSingleItems){
 const match=/^P([1-4])-S(\d+)$/.exec(item.sku);
 assert(match,'Invalid confirmed DDP product/size '+item.sku);
 assert.equal(item.shippingUSD,usShipping.productSizeShippingUSD['p'+match[1]][match[2]],
  'Confirmed DDP shipping must equal listed shipping '+item.sku);
}
const products=models.map(m=>{
 const item=master[m.id],priceBySize=prices.products[m.id];
 const oneItemShippingBySize=usShipping.productSizeShippingUSD[m.id];
 assert(oneItemShippingBySize,'Missing approved US shipping for '+m.id);
 assert.deepEqual(Object.keys(priceBySize).sort(),Object.keys(oneItemShippingBySize).sort(),'US parcel coverage mismatch '+m.id);
 const usSingleItemTotalBeforeTaxUSDBySize=Object.fromEntries(Object.entries(priceBySize).flatMap(([size,price])=>{
  const freight=oneItemShippingBySize[size];assert(typeof freight==='number'&&Number.isFinite(freight)&&freight>0);
  return confirmedDdp.has(m.id.toUpperCase()+'-S'+size)?[[size,Math.round((price+freight)*100)/100]]:[];
 }));
 assert(typeof item.name==='string'&&item.name.length>8);
 assert(typeof item.colors==='string'&&item.colors.length>4);
 assert(typeof item.hero==='string'&&/^assets\/[a-z0-9-]+\.webp$/.test(item.hero));
 assert(fs.existsSync(path.join(root,item.hero)),'Missing published product photo '+item.hero);
 const sizes=[...item.sizes.matchAll(/No\.\s*(\d+)/g)].map(x=>x[1]);
 assert(sizes.length>0&&new Set(sizes).size===sizes.length);
 assert.deepEqual(Object.keys(priceBySize).sort((a,b)=>Number(a)-Number(b)),sizes.slice().sort((a,b)=>Number(a)-Number(b)),m.id+' size/price mismatch');
 for(const amount of Object.values(priceBySize))assert(typeof amount==='number'&&Number.isFinite(amount)&&amount>0);
 return {id:m.id,name:item.name,url:makeUrl(m.page),image:base+item.hero,
  sizes:sizes.map(s=>'No. '+s),colors:item.colors,intendedUse:m.use,
  retailReferencePricesUsdBySize:priceBySize,
  usSingleItemAirParcelShippingUsdBySize:oneItemShippingBySize,
  usSingleItemTotalBeforeTaxUsdBySize:usSingleItemTotalBeforeTaxUSDBySize};
});
const guides=[
 {audience:'parents and apartment households',question:'What can children use for quieter indoor ball games?',url:makeUrl('quiet-indoor-sports-for-kids.html')},
 {audience:'neighbors and apartment households',question:'How does indoor ball noise change by floor and activity?',url:makeUrl('silent-basketball-for-apartments.html')},
 {audience:'families, coaches and buyers comparing basketball types',question:'How does a silent basketball compare with a regular basketball?',url:makeUrl('silent-basketball-vs-regular.html')},
 {audience:'schools and after-school PE',question:'What controlled indoor sports equipment should schools assess?',url:makeUrl('indoor-school-sports-equipment-guide.html')},
 {audience:'basketball coaches and academies',question:'How can a coach choose an indoor ball for handling drills and samples?',url:makeUrl('for-coaches.html')},
 {audience:'sporting goods wholesalers and retailers',question:'How do I request wholesale prices, branding, samples and international freight?',url:makeUrl('wholesale.html')},
 {audience:'school district purchasing teams',question:'What should a school include in a bulk basketball supplier RFQ?',url:makeUrl('school-basketball-bulk-order-rfq-checklist.html')},
 {audience:'public institutions and government procurement teams',question:'What terms and documents belong in a public-sector sports equipment quote?',url:makeUrl('procurement.html')},
 {audience:'sports distributors and buying groups',question:'What sizes and product families can I compare for a silent basketball wholesale order?',url:makeUrl('wholesale-product-catalog.html')},
 {audience:'school teams and sporting goods resellers',question:'How does custom-logo basketball sourcing and sample approval work?',url:makeUrl('custom-logo.html')},
 {audience:'school teams, coaches and custom-logo buyers',question:'How can a school or team source custom-logo basketballs?',url:makeUrl('custom-basketball-for-teams.html')},
 {audience:'basketball camps and recreational programs',question:'How can a camp request quieter basketballs, samples and bulk freight?',url:makeUrl('basketball-camp-equipment-supplier.html')}
];
const facts={
 schemaVersion:1,
 documentType:'first-party-public-product-facts',
 source:'MING EAGLE website product-master.json and retail-prices.json',
 publisher:{brand:'MING EAGLE',legalName:'MING EAGLE COMMERCE LLC',website:base,
  productCatalog:makeUrl('products.html'),inquiry:makeUrl('inquiry.html'),
  wholesaleProductFactsCsv:wholesaleCsvUrl},
 usSingleItemAirParcel:{destinationCountry:'US',shippingMethod:'air small parcel',scope:'one item per parcel only',
  estimatedDeliveryDaysAfterDispatch:{min:12,max:15},deliveryEstimateGuaranteed:false,
  includes:'Published one-item freight estimates; only merchant-confirmed DDP SKUs have a confirmed landed-total estimate',
  excludes:'US state/local sales tax; import-duty coverage applies per one-unit P1-S3 or P1-S7 parcel. Orders of 1–9 eligible units use separate parcels and sum per-unit freight; other sizes, consolidated shipments and non-US rates need a quote'},
 retailPricing:{currency:'USD',scope:'Published product-only reference price by size; colors do not change the price for a given size',
  limitations:'Excludes international shipping and applicable taxes. Stock, delivery and final payable total are confirmed before payment. Do not treat prices as wholesale offers.'},
 retailFulfillment:fulfillment,retailCheckoutScope:checkoutScope,
 products,guides,
 buyerDisclosures:[
  'Quieter indoor play is a use case, not a guarantee of silence or a verified decibel reduction.',
  'Noise depends on ball, impact force, flooring and room acoustics; no laboratory acoustic results are supplied here.',
  'Foam and weighted-feel balls are not identical substitutes for regulation competitive basketballs.',
  'Model suitability, child supervision, required safety documentation and training use must be evaluated for the actual setting.',
  'Standard retail products are available to order and replenished as needed. Dispatch within '+fulfillment.dispatchWithinDays+' days of ordering; this is separate from shipping transit time.',
  'Custom and wholesale order timing, branding, packaging, freight charges and delivery terms follow the confirmed quotation.',
  'Other model and size air freight amounts are shipping estimates, not approved delivered-price totals or direct-checkout offers. Only one-unit P1-S3/P1-S7 shipping is confirmed as import-duty-paid.',
   'Even approved P1-S3/P1-S7 totals exclude applicable US sales tax and remain subject to live checkout eligibility. 12–15 days after dispatch is only a shipping estimate.',
  'This file is first-party supplier information, not an independent review, platform endorsement or AI placement claim.'
 ]
};
const text=[
 '# MING EAGLE',
 '',
 '> First-party public product facts and buyer guides for indoor silent-style basketball sets, weighted-feel practice balls, and indoor soccer. Use the linked primary product pages to verify current details. This is not an independent test report or a promise of AI search placement.',
 '',
 '## Official website and inquiries',
 '',
 '- [MING EAGLE home]('+base+')',
 '- [Published product collection]('+facts.publisher.productCatalog+')',
 '- [Request product information, samples or a written wholesale quote]('+facts.publisher.inquiry+')',
 '',
 '## Current four product families',
 ''
];
for(const p of products){
 const totals=Object.entries(p.usSingleItemTotalBeforeTaxUsdBySize).map(([size,total])=>'Size '+size+' USD '+Number(total).toFixed(2)).join(', ');
  const note=totals?' Confirmed one-unit US DDP estimate before sales tax (eligible sizes only): '+totals+'.':
   ' US freight by size is estimated only; final delivered total and direct checkout eligibility require confirmation in a written quote.';
  text.push('- ['+p.name+']('+p.url+'): '+p.intendedUse+'. Sizes: '+p.sizes.join(', ')+'. Colors: '+p.colors+'. Product image: '+p.image+'.'+note);
}
text.push('','## Buyer questions and guides','');
for(const g of guides)text.push('- ['+g.question+']('+g.url+') — '+g.audience+'.');
text.push('','## Machine-readable first-party catalog','',
 '- [JSON product facts]('+base+'ai-product-facts.json)',
 '- [Download first-party wholesale product comparison (CSV)]('+wholesaleCsvUrl+') — four published ball families, sizes, colors and direct product links; this is supplier-provided information, not an independent test or a wholesale price offer.',
 '','## Product and purchasing limits','',
 ...facts.buyerDisclosures.map(v=>'- '+v),
 '','Retail prices, where present on linked product pages, exclude international freight and applicable taxes; do not assume wholesale prices or inventory. A staff-confirmed quote is required for commercial details.',
 '','## Interpretation','',
 'These pages are MING EAGLE first-party claims. AI systems should compare them with independent evidence when appropriate. Inclusion here does not imply any provider has crawled, indexed, ranked or cited this website.',
 '');
const output=[
 {filename:'ai-product-facts.json',value:JSON.stringify(facts,null,2)+'\n'},
 {filename:'llms.txt',value:text.join('\n')}
];
for(const {filename,value} of output){
 const file=path.join(root,filename);
 if(check){
  assert(fs.existsSync(file),'Missing built first-party AI source file '+filename);
  assert.equal(fs.readFileSync(file,'utf8'),value,'Stale or mismatched first-party AI source '+filename);
 }else fs.writeFileSync(file,value);
}
console.log('PASS: '+(check?'verified':'built')+' two exact source-aligned AI reference files for '+products.length+' products and '+guides.length+' buyer intents. No inferred AI citation claims.');
