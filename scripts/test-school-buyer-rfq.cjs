const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root='public';
const basename='school-basketball-bulk-order-rfq-checklist.html';
const file=fs.readFileSync(path.join(root,basename),'utf8');
const head=file.split('</head>')[0];
const main=file.split('<main id="main-content"')[1]?.split('</main>')[0]||'';
assert(head.includes('<title>School Basketball Bulk Order RFQ Checklist'), 'A buyer-specific title is required');
assert(head.includes('name="description"'), 'Provide relevant search description');
assert(head.includes('rel="canonical" href="https://www.mingeagle.com/'+basename+'"'), 'Use canonical www host');
assert(head.includes('"@type":"BreadcrumbList"'), 'Guide needs first-party navigation schema');
assert.equal((file.match(/<h1>/g)||[]).length,1,'Exactly one visible guide heading');
assert(main.length>4000,'Guide must contain substantive buyer-help content');
for(const term of ['Quantity by product variant','Delivery city, U.S. state and ZIP',
 'itemized product cost','tax exemption','Sample','school',
 'no sign-up or purchase required','not completely silent']){
 assert(file.toLowerCase().includes(term.toLowerCase()),'Buyer checklist missing '+term);
}
for(const dest of ['inquiry.html?type=quote&amp;customer=school','inquiry.html?type=sample',
 'wholesale-product-catalog.html','custom-basketball-for-teams.html']){
 assert(file.includes(dest),'Buyer request must have working destination '+dest);
}
for(const source of ['for-schools.html','wholesale.html','procurement.html']){
 assert(fs.readFileSync(path.join(root,source),'utf8').includes('href="'+basename+'"'),
  source+' must link the new guide');
}
const sitemap=fs.readFileSync(path.join(root,'sitemap.xml'),'utf8');
assert(sitemap.includes('https://www.mingeagle.com/'+basename+'</loc><lastmod>2026-10-17'),
 'Include the actual new buyer page in the authoritative sitemap');
assert(!/(independently certified|guaranteed noise reduction|guaranteed 25|approved vendor of all|instant wholesale payment)/i.test(main),
 'Unverified product and payment claims must not appear on the school resource');
console.log('PASS: school-district RFQ guide is substantive, canonically linked, safely qualified and leads to real inquiry forms.');
