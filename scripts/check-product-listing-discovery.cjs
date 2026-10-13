// Offline regression: visible product table and schema must match one source.
// Fail closed when product name, image, detail URL or row count is changed.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const root=path.resolve(process.argv[2]||'public');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'me-product-listing-'));
try{
 const master=JSON.parse(fs.readFileSync(path.join(root,'product-master.json'),'utf8'));
 const skus=[['p1','silent-basketball.html'],['p2','fabric-silent-basketball.html'],['p3','weighted-flocked-basketball.html'],['p4','silent-soccer.html']];
 for(const f of ['products.html','product-master.json','sitemap.xml',...skus.map(x=>x[1])])
  fs.copyFileSync(path.join(root,f),path.join(temp,f));
 fs.mkdirSync(path.join(temp,'assets'));
 for(const [key] of skus)fs.copyFileSync(path.join(root,master[key].hero),path.join(temp,master[key].hero));
 const run=()=>cp.spawnSync(process.execPath,['scripts/build-product-listing-discovery.cjs',temp],{encoding:'utf8'});
 let output=run();assert.equal(output.status,0,output.stderr||output.stdout);
 const file=path.join(temp,'products.html'),once=fs.readFileSync(file,'utf8');
 output=run();assert.equal(output.status,0,output.stderr||output.stdout);
 assert.equal(fs.readFileSync(file,'utf8'),once,'Product collection generation must be idempotent');
 const start='<!-- MING EAGLE PRODUCT COLLECTION SCHEMA START -->',end='<!-- MING EAGLE PRODUCT COLLECTION SCHEMA END -->';
 assert.equal(once.split(start).length,2,'Exactly one collection schema tag');
 assert.equal(once.split(end).length,2,'Exactly one collection closing tag');
 const block=once.split(start)[1].split(end)[0];
 const schema=JSON.parse(block.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1]||'null');
 assert.equal(schema['@type'],'ItemList');assert.equal(schema.url,'https://www.mingeagle.com/products.html');
 assert.equal(schema.numberOfItems,4);assert.equal(schema.itemListElement.length,4);
 assert(!JSON.stringify(schema).match(/aggregateRating|reviewCount|ratingValue|availability|price|shippingRate/i));
 const comparison=once.split('<section class="section comparisonSection" id="compare">')[1]?.split('</section>')[0]||'';
 const table=comparison.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1]||'';
 assert.equal((table.match(/<tr>/g)||[]).length,4,'Four visible comparison rows');
 skus.forEach(([id,page],i)=>{
  const list=schema.itemListElement[i],product=master[id];
  assert.equal(list.position,i+1);
  assert.equal(list.item.name,product.name);
  assert.equal(list.item.url,'https://www.mingeagle.com/'+page);
  assert.equal(list.item.image,'https://www.mingeagle.com/'+product.hero);
  assert.equal(list.item.brand.name,'MING EAGLE');
  assert(table.includes('<a href="'+page+'">'+product.name+'</a>'),'Comparison row must have readable static product deep link');
  assert(fs.readFileSync(path.join(root,'sitemap.xml'),'utf8').includes('<loc>'+list.item.url+'</loc>'));
 });
 const clone=fs.readFileSync(file,'utf8');
 const bad=JSON.parse(fs.readFileSync(path.join(temp,'product-master.json'),'utf8'));
 bad.p3.hero='assets/missing-fake-image.webp';
 fs.writeFileSync(path.join(temp,'product-master.json'),JSON.stringify(bad));
 output=run();assert.notEqual(output.status,0,'Missing product image must prevent shipping incorrect structured data');
 fs.copyFileSync(path.join(root,'product-master.json'),path.join(temp,'product-master.json'));
 fs.writeFileSync(file,clone.replace('<td><a href="silent-soccer.html">Flocked Silent Soccer Ball</a></td>','<td><a href="unknown.html">wrong card</a></td>'));
 output=run();assert.equal(output.status,0,'Build must correct drift using approved master');
 const fixed=fs.readFileSync(file,'utf8');
 assert(fixed.includes('<td><a href="silent-soccer.html">Flocked Silent Soccer Ball</a></td>'),'Correct source must repair incorrect display');
 assert(!fixed.includes('unknown.html'));
 console.log('PASS: 4 public product ItemList entries, four static comparison links, idempotent, no availability/price/rating fabrication; missing image stops build.');
}finally{fs.rmSync(temp,{recursive:true,force:true})}
