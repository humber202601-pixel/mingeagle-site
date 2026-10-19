// MING EAGLE: verify public B2B growth resource and conversion routes.
// Static validation only; no form submission, network, sales or marketing claims.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const pages={
 camp:fs.readFileSync('public/basketball-camp-equipment-supplier.html','utf8'),
 school:fs.readFileSync('public/for-schools.html','utf8'),
 sitemap:fs.readFileSync('public/sitemap.xml','utf8'),
 template:fs.readFileSync('public/camp-school-rfq-checklist.txt','utf8')
};
for(const p of [pages.camp,pages.school]){
 assert(p.includes('href="camp-school-rfq-checklist.txt" download'),
  'Camp and school pages need a free downloadable planning resource');
 assert(p.includes('inquiry.html?type=quote'),
  'Every educational buyer path must still lead to the B2B RFQ form');
 assert(!/\b(guaranteed\s+(delivery|soundproof)|\d+%\s+(noise|sound)\s+reduction|certified\s+(sound|noise)\s+reduction)\b/i.test(p),
  'Do not publish unverified noise claims or fulfillment guarantees');
}
assert(pages.camp.includes('id="camp-bulk-rfq-checklist"'));
assert(pages.camp.includes('id="take-home-ball-sessions"'),
 'Existing camp educational guidance must be preserved');
assert(pages.school.includes('id="school-bulk-rfq-worksheet"'));
assert(pages.school.includes('id="free-school-session"'),
 'Existing school PE resource must be preserved');
assert(pages.camp.includes('href="for-schools.html#free-school-session"'),
 'Camps must link to the useful first-party school resource');
assert(pages.school.includes('href="basketball-camp-equipment-supplier.html#camp-bulk-rfq-checklist"'),
 'Schools need the companion camp buyer path');
assert(pages.template.includes('This checklist may be copied and shared'));
assert(pages.template.includes('10+ units follow wholesale quotation'));
assert(pages.template.includes('Applicable US sales-tax treatment'));
assert(pages.template.includes('not a guaranteed delivery commitment'));
for(const page of ['for-schools.html','basketball-camp-equipment-supplier.html']){
 const lastmod=page==='for-schools.html'?'2026-10-18':'2026-10-19';
 assert(pages.sitemap.includes('<loc>https://www.mingeagle.com/'+page+'</loc><lastmod>'+lastmod+'</lastmod>'),
  'Meaningfully revised buyer pages require evidence-backed lastmod');
}
assert(!pages.sitemap.includes('camp-school-rfq-checklist.txt'),
 'Text checklist is a download, not an indexable HTML sitemap page');
console.log('PASS: camp and school free RFQ resource, crosslinks, quote capture and truthful commercial limits.');
