const assert=require('node:assert/strict'),fs=require('node:fs');
const catalog=fs.readFileSync('public/wholesale-product-catalog.html','utf8');
const form=fs.readFileSync('public/inquiry.html','utf8');
const logic=fs.readFileSync('public/inquiry.js','utf8');
const master=JSON.parse(fs.readFileSync('public/product-master.json','utf8'));
const names=['Flocked Silent Basketball Set','Fabric-Cover Silent Basketball Set','Weighted Flocked Silent Basketball','Flocked Silent Soccer Ball'];
for(const name of names){
 assert(form.includes('value="'+name+'"'),'Inquiry checkbox missing: '+name);
 assert(catalog.includes(name),'Product absent from catalog: '+name);
}
assert(logic.includes("cb.value===q.get('product')"),'Form should preselect exact product query parameter');
assert.equal((catalog.match(/class="catalog-product-actions"/g)||[]).length,4);
for(const cls of ['catalog-size','catalog-color','catalog-qty','catalog-quote','catalog-sample'])assert.equal((catalog.match(new RegExp('class="[^"]*\\b'+cls+'\\b[^"]*"','g'))||[]).length,4,'Missing catalog selector '+cls);
assert(catalog.includes("new URLSearchParams({product:name,size:"),'Selections must be sent to inquiry URL');
assert(logic.includes("const color=q.get('color'),units=q.get('units')"),'Inquiry must prefill color and units');
for(const product of Object.values(master)){
 assert([...catalog.matchAll(/<img[^>]*src="([^"]+)"/g)].some(m=>m[1].split('?')[0]===product.hero),'Catalog must use approved hero: '+product.name);
 assert(fs.existsSync('public/'+product.hero),'Approved hero missing: '+product.hero);
 const bytes=fs.readFileSync('public/'+product.hero);
 assert.equal(bytes.toString('ascii',0,4),'RIFF','Hero must be RIFF WebP: '+product.hero);
 assert.equal(bytes.toString('ascii',8,12),'WEBP','Hero must be WebP: '+product.hero);
 assert.equal(bytes.readUInt32LE(4)+8,bytes.length,'Hero incomplete: '+product.hero);
}
const images=[...catalog.matchAll(/<img[^>]*src="([^"]+)"/g)].map(m=>m[1]);
assert.equal(images.length,4,'Catalog must show precisely four approved product images');
assert(images.every(src=>Object.values(master).some(p=>p.hero===src.split('?')[0])),'Catalog contains an unapproved or external product image');

console.log('PASS: each catalog product carries its existing exact inquiry checkbox identity to quote/sample form.');
