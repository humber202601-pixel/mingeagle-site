const assert=require('node:assert/strict'),fs=require('node:fs');
const catalog=fs.readFileSync('public/wholesale-product-catalog.html','utf8');
const form=fs.readFileSync('public/inquiry.html','utf8');
const logic=fs.readFileSync('public/inquiry.js','utf8');
const names=['Flocked Silent Basketball Set','Fabric-Cover Silent Basketball Set','Weighted Flocked Silent Basketball','Flocked Silent Soccer Ball'];
for(const name of names){
 assert(form.includes('value="'+name+'"'),'Inquiry checkbox missing: '+name);
 assert(catalog.includes('type=quote&amp;product='+encodeURIComponent(name)),'Missing quote deep link for '+name);
 assert(catalog.includes('type=sample&amp;product='+encodeURIComponent(name)),'Missing sample deep link for '+name);
}
assert(logic.includes("cb.value===q.get('product')"),'Form should preselect exact product query parameter');
assert.equal((catalog.match(/class="catalog-product-actions"/g)||[]).length,4);
console.log('PASS: each catalog product carries its existing exact inquiry checkbox identity to quote/sample form.');
