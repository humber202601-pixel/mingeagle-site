const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'us-pricing-site-'));
const products={p1:'silent-basketball.html',p2:'fabric-silent-basketball.html',
 p3:'weighted-flocked-basketball.html',p4:'silent-soccer.html'};
const files=['index.html','products.html',...Object.values(products),
 'retail-prices.json','us-single-parcel-shipping.json','retail-fulfillment-policy.json','product-master.json'];
try{
 for(const f of files)fs.copyFileSync(path.join('public',f),path.join(tmp,f));
 const prices=JSON.parse(fs.readFileSync(path.join(tmp,'retail-prices.json'),'utf8')).products;
 const shipping=JSON.parse(fs.readFileSync(path.join(tmp,'us-single-parcel-shipping.json'),'utf8'));
 const official={
  p1:{3:11.5,5:12,7:14},
  p2:{3:11.5,5:12,7:14},
  p3:{3:12,4:13,6:15,7:16},
  p4:{5:12}
 };
 assert.deepEqual(shipping.productSizeShippingUSD,official);
 assert.deepEqual(shipping.confirmedDdpSingleItems.map(x=>x.sku).sort(),['P1-S3','P1-S7']);
 assert(shipping.disclosures.some(x=>x.includes('$21.40')&&x.includes('import duties')));
 assert(shipping.disclosures.some(x=>x.includes('$28.90')&&x.includes('import duties')));
 const run=()=>execFileSync(process.execPath,['scripts/build-us-delivered-prices.cjs',tmp],{stdio:'pipe'});
 run();
 const actual={};
 for(const f of files.filter(x=>x.endsWith('.html'))){
  const s=fs.readFileSync(path.join(tmp,f),'utf8');
  actual[f]=s;
  assert.equal((s.match(/MING EAGLE US DELIVERED PRICES BEGIN/g)||[]).length,1,f);
  assert.equal((s.match(/MING EAGLE US DELIVERED PRICES END/g)||[]).length,1,f);
  assert.match(s,/estimated delivery 12–15 days after dispatch/i,f);
  assert.match(s,/not guaranteed/i,f);
  assert.match(s,/US state\/local sales tax is separate/i,f);
  assert.match(s,/US price \+ shipping|Product \+ US air shipping/i,f);
  assert(!/fabric-cover mini-hoop set starts at \$22\.40 delivered before tax/i.test(s),'Do not call an unconfirmed-duty SKU delivered');
  assert.match(s,/P1-S3 \(\$11\.50 delivery\)/,f);
  assert.match(s,/P1-S7 \(\$14 delivery\)/,f);
  assert.match(s,/import duties/i,f);
  assert.match(s,/each set ships in its own parcel/i,f);
  assert(!/free shipping|guaranteed delivery|in stock now/i.test(s),'No unverified fulfillment claim');
 }
 for(const [id,f] of Object.entries(products)){
  const s=actual[f],pr=prices[id],post=shipping.productSizeShippingUSD[id];
  for(const size of Object.keys(pr)){
   const amount='$'+(Math.round((pr[size]+post[size])*100)/100).toFixed(2);
   assert(s.includes(amount),f+' missing delivered amount '+size+' '+amount);
  }
  const block=s.match(/<!-- MING EAGLE US DELIVERED PRICES BEGIN -->([\s\S]*?)<!-- MING EAGLE US DELIVERED PRICES END -->/)?.[1]||'';
  const tbody=block.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1]||'';
  assert.equal((tbody.match(/<tr>/g)||[]).length,Object.keys(pr).length,f+' row count');
  assert(s.includes('id="us-single-parcel"'),f+' deep link');
 }
 const catalog=actual['products.html'];
 const usTable=catalog.match(/<!-- MING EAGLE US DELIVERED PRICES BEGIN -->([\s\S]*?)<!-- MING EAGLE US DELIVERED PRICES END -->/)?.[1]||'';
 const usRows=usTable.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1]||'';
 assert.equal((usRows.match(/<tr>/g)||[]).length,11);
 assert.equal((catalog.match(/<th scope="col">US total before tax<\/th>/g)||[]).length,1);
 for(const link of Object.values(products))assert(catalog.includes('href="'+link+'#us-single-parcel"'));
 assert(actual['index.html'].includes('from $21.40 shipped to the US'));
 run();
 for(const [filename,s] of Object.entries(actual))
  assert.equal(fs.readFileSync(path.join(tmp,filename),'utf8'),s,filename+' must be idempotent');
 const broken=JSON.parse(fs.readFileSync(path.join(tmp,'us-single-parcel-shipping.json'),'utf8'));
 delete broken.productSizeShippingUSD.p4['5'];
 fs.writeFileSync(path.join(tmp,'us-single-parcel-shipping.json'),JSON.stringify(broken));
 assert.throws(run,/Command failed|size mismatch/,'Fail closed if approved shipping SKU omitted');
 console.log('PASS: all 11 approved US one-item totals, homepage/catalog/product visibility, truthful ETA/disclaimer, verified SKU coverage and stable idempotent build.');
}finally{fs.rmSync(tmp,{recursive:true,force:true})}
