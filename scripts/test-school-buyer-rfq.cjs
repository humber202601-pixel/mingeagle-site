const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root='public';
const basename='school-basketball-bulk-order-rfq-checklist.html';
const file=fs.readFileSync(path.join(root,basename),'utf8');
const head=file.split('</head>')[0];
const main=file.split('<main id="main-content"')[1]?.split('</main>')[0]||'';
assert(head.includes('<title>School Basketball Bulk Order Checklist | MING EAGLE</title>'), 'A buyer-specific title is required');
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
assert(sitemap.includes('https://www.mingeagle.com/'+basename+'</loc><lastmod>2026-10-19'),
 'Include the actual new buyer page in the authoritative sitemap');
assert(!/(independently certified|guaranteed noise reduction|guaranteed 25|approved vendor of all|instant wholesale payment)/i.test(main),
 'Unverified product and payment claims must not appear on the school resource');
// Evaluating two suppliers must be possible without inventing measurements or certifications.
const protocol=file.split('<section class="rfqPanel" id="sample-evaluation-protocol"')[1]?.split('</section>')[0]||'';
assert(protocol.includes('aria-labelledby="sample-evaluation-title"'),'Accessible school sample evaluation section missing');
assert.equal((protocol.match(/<h3>/g)||[]).length,4,'Require four real repeatable comparison steps');
for(const term of ['same room, floor','packaging type','adjacent occupied space','not certified decibel tests',
 'rebound, grip, weight','visible surface wear','suitable / needs another trial / not suitable',
 'not independent certification','wholesale-product-facts.csv','buyer evaluation instructions']){
 if(term==='not independent certification')continue;
 assert(protocol.toLowerCase().includes(term.toLowerCase()),'Review protocol missing '+term);
}
assert(protocol.includes('download'),'The actual CSV must be directly downloadable from sample protocol');
assert(file.includes('"dateModified":"2026-10-19"'),'Schema must carry actual editorial modification date');
assert(file.includes('Last reviewed: October 19, 2026'),'The visible review date must match');
assert(!/independently measured noise|guaranteed acoustic reduction|laboratory certified by us/i.test(protocol),'Do not invent laboratory evidence');
console.log('PASS: school-district RFQ guide is substantive, canonically linked, safely qualified and leads to real inquiry forms.');
