// Build verified US one-item air-parcel price disclosures from approved SKU sources.
// Never treat this as a bulk-shipping quote or as a guaranteed delivery promise.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||'public');
const prices=JSON.parse(fs.readFileSync(path.join(root,'retail-prices.json'),'utf8'));
const post=JSON.parse(fs.readFileSync(path.join(root,'us-single-parcel-shipping.json'),'utf8'));
const fulfillment=JSON.parse(fs.readFileSync(path.join(root,'retail-fulfillment-policy.json'),'utf8'));
assert(Number.isSafeInteger(fulfillment.dispatchWithinDays)&&fulfillment.dispatchWithinDays>0,'Invalid merchant dispatch commitment');
const dispatch='Standard retail products are available to order with replenishment as needed. Dispatch within '+fulfillment.dispatchWithinDays+' days of ordering.';
const catalog=JSON.parse(fs.readFileSync(path.join(root,'product-master.json'),'utf8'));
assert.equal(prices.currency,'USD');assert.equal(post.currency,'USD');
assert.equal(post.destinationCountry,'US');assert.equal(post.shippingMethod,'air');
assert.equal(post.scope,'one_product_unit_per_parcel');
assert.deepEqual(post.estimatedDeliveryDays,{min:12,max:15,basis:'estimated_after_dispatch_not_guaranteed'});
assert.deepEqual(Object.keys(post.productSizeShippingUSD).sort(),Object.keys(prices.products).sort());
const pages={p1:'silent-basketball.html',p2:'fabric-silent-basketball.html',p3:'weighted-flocked-basketball.html',p4:'silent-soccer.html'};
const safe=t=>String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
const money=n=>'$'+(Math.round(n*100)/100).toFixed(2);
const list=[];
for(const [id,bySize] of Object.entries(prices.products)){
 assert.deepEqual(Object.keys(bySize).sort(),Object.keys(post.productSizeShippingUSD[id]).sort(),id+' shipping size mismatch');
 for(const [size,price] of Object.entries(bySize)){
  const shipping=post.productSizeShippingUSD[id][size];
  assert(Number.isFinite(price)&&price>0&&Math.abs(price*100-Math.round(price*100))<1e-7,'Invalid retail cents for '+id+size);
  assert(Number.isFinite(shipping)&&shipping>0&&Math.abs(shipping*100-Math.round(shipping*100))<1e-7,'Invalid US shipping cents for '+id+size);
  list.push({id,size,price,shipping,total:Math.round((price+shipping)*100)/100,name:catalog[id].name,page:pages[id]});
 }
}
assert.equal(list.length,11,'US parcel matrix must cover all 11 retail SKUs');
assert.deepEqual(post.confirmedDdpSingleItems.map(x=>[x.sku,x.shippingUSD]).sort(),
 [['P1-S3',11.5],['P1-S7',14]].sort(),'Only explicitly merchant-confirmed single-unit DDP tariffs');
for(const ddp of post.confirmedDdpSingleItems){
 const line=list.find(x=>x.id.toUpperCase()+'-S'+x.size===ddp.sku);
 assert(line&&line.shipping===ddp.shippingUSD&&ddp.origin==='CN'&&ddp.destination==='US'
  &&ddp.scope==='one-unit-only','DDP rate must match the public one-unit US shipping tariff');
}
const begin='<!-- MING EAGLE US DELIVERED PRICES BEGIN -->';
const end='<!-- MING EAGLE US DELIVERED PRICES END -->';
const cssBegin='<!-- MING EAGLE US DELIVERED CSS BEGIN -->';
const cssEnd='<!-- MING EAGLE US DELIVERED CSS END -->';
const style=cssBegin+'<style>.usPriceSummary{background:#fff9f3;border-block:1px solid #f1dfcd}.usPriceIntro{max-width:850px;line-height:1.65}.usPriceTableWrap{max-width:100%;overflow-x:auto}.usPriceTable{width:100%;border-collapse:collapse;min-width:520px;background:#fff;border-radius:12px}.usPriceTable th,.usPriceTable td{padding:12px 15px;border-bottom:1px solid #e7e9ed;text-align:left;vertical-align:middle;font-size:14px}.usPriceTable th{background:#f5f7fb;color:#374151;font-weight:700}.usPriceTable td strong{color:#1c6b46;font-size:16px}.usPriceTable a{color:#a54220;text-underline-offset:3px}.usPriceNote{font-size:13px;color:#475569;line-height:1.6;max-width:850px}.usPriceHero{font-size:16px;line-height:1.55;margin:16px 0 0}.usPriceHero strong{color:#127049;font-size:24px}.usPriceHero a{font-weight:700;text-decoration:underline}@media(max-width:650px){.usPriceTable th,.usPriceTable td{padding:10px 9px;font-size:12px}.usPriceTable td strong{font-size:14px}}</style>'+cssEnd;
const disclaimer=dispatch+' US single-item air small parcel from China; estimated delivery 12–15 days after dispatch, not guaranteed. Only the merchant-confirmed one-unit P1-S3 ($11.50 delivery) and P1-S7 ($14 delivery) rates include US import customs clearance and import duties, with no additional import duty due from the buyer. For 1–9 P1-S3/P1-S7 sets, each set ships in its own parcel and the listed single-unit shipping charges are added per set; parcels may arrive separately. Other SKUs and consolidated shipments require an import-duty-inclusive delivered-price confirmation. US state/local sales tax is separate; the final amount is shown at secure checkout before payment. Combined-parcel shipping requires a separate quote. From 10 items, request a quantity-based wholesale discount; sea freight agreement is required and delivery is estimated 25–30 days after dispatch, not guaranteed. Destinations outside the US require separate confirmation.';
function row(item,includeName){
 const link=item.page+'#us-single-parcel';
 return '<tr>'+(includeName?'<td><a href="'+link+'">'+safe(item.name)+'</a></td>':'')+
 '<td>Size '+item.size+'</td><td>'+money(item.price)+'</td><td>'+money(item.shipping)+'</td><td><strong>'+money(item.total)+'</strong></td>'+
 '<td><a class="usPriceChoose" href="'+item.page+'?size='+item.size+'#buy-now">Choose size, color &amp; add →</a></td></tr>';
}
function panel(items,{title,id,includeName}){
 const headers=(includeName?'<th scope="col">Product</th>':'')+'<th scope="col">Size</th><th scope="col">Product</th><th scope="col">US air parcel</th><th scope="col">Product + US air shipping</th><th scope="col">Add to cart</th>';
 return begin+'<section class="section usPriceSummary" id="'+id+'"><div class="wrap"><div class="eyebrow">TRANSPARENT USA SINGLE-ITEM PRICING</div><h2>'+title+'</h2><p class="usPriceIntro">For retail orders of 1–9 items, prices below are public USD prices; compare the product price and one-item small-parcel shipping to the US. A standard basketball set includes one silent ball plus a mini hoop; weighted balls and soccer balls are sold as specified on their product pages.</p><div class="usPriceTableWrap"><table class="usPriceTable"><thead><tr>'+headers+'</tr></thead><tbody>'+items.map(it=>row(it,includeName)).join('')+'</tbody></table></div><p class="usPriceNote">'+disclaimer+'</p><div class="actions"><a class="btn primary" href="'+(includeName?'#buy-p1':'#buy-now')+'">Select product size and color above</a><a class="btn" href="retail-cart.html">View shopping cart</a><a class="btn" href="inquiry.html?type=quote">Request wholesale quote (10+)</a></div></div></section>'+end;
}
function save(filename,fn){
 const file=path.join(root,filename);if(!fs.existsSync(file))throw Error('Missing page '+filename);
 let s=fs.readFileSync(file,'utf8');
 s=s.replace(/<!-- MING EAGLE US DELIVERED PRICES BEGIN -->[\s\S]*?<!-- MING EAGLE US DELIVERED PRICES END -->/g,'');
 s=s.replace(/<!-- MING EAGLE US DELIVERED CSS BEGIN -->[\s\S]*?<!-- MING EAGLE US DELIVERED CSS END -->/g,'');
 assert(s.includes('</head>')&&s.includes('</main>'),'Malformed HTML '+filename);
 s=s.replace('</head>',style+'</head>');
 s=fn(s);
 fs.writeFileSync(file,s);
}
for(const [id,filename] of Object.entries(pages)){
 const chosen=list.filter(i=>i.id===id);
 save(filename,s=>{
  const open=s.indexOf('<section class="productHero">'),close=s.indexOf('</section>',open);
  if(open<0||close<0)throw Error('Missing product hero on '+filename);
  return s.slice(0,close+10)+panel(chosen,{title:'US price + shipping benchmark for one '+safe(catalog[id].name),id:'us-single-parcel',includeName:false})+s.slice(close+10);
 });
}
save('products.html',s=>{
 const x=s.indexOf('<section class="section comparisonSection"');
 if(x<0)throw Error('No catalog comparison');
 return s.slice(0,x)+panel(list,{title:'Compare 11 USA single-item price + shipping benchmarks',id:'us-delivered-prices',includeName:true})+s.slice(x);
});
save('index.html',s=>{
 const productSection=s.indexOf('<section class="section">',s.indexOf('<main'));
 if(productSection<0)throw Error('No homepage product section');
 const banner=begin+'<section class="section usPriceSummary" id="us-delivered-prices"><div class="wrap"><div class="eyebrow">USA HOME PLAY · 1 BALL + MINI HOOP</div><h2>Quiet indoor basketball sets from '+money(21.4)+' shipped to the US, before tax</h2><p class="usPriceIntro">The 3-size flocked basketball set starts at '+money(9.9)+' plus '+money(11.5)+' single-item air small-parcel shipping. Expected delivery: around 12–15 days after dispatch (estimate, not guaranteed). The fabric-cover mini-hoop set is '+money(10.9)+' product + '+money(11.5)+' single-item air shipping = '+money(22.4)+' before US sales tax; import-duty treatment must be confirmed before purchase. Standard retail products dispatch within '+fulfillment.dispatchWithinDays+' days of ordering. Final freight, taxes and order terms are confirmed before payment.</p><p class="usPriceNote">'+disclaimer+'</p><div class="actions"><a class="btn primary" href="products.html#us-delivered-prices">Compare 11 US price + shipping benchmarks</a><a class="btn" href="silent-basketball.html#us-single-parcel">See the ball + hoop set</a></div></div></section>'+end;
 return s.slice(0,productSection)+banner+s.slice(productSection);
});
console.log('PASS: one-item US shipping 12–15-day estimates rendered from 11 verified SKU prices on four product pages, catalog and home.');
