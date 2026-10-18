'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve('public');
const read=n=>fs.readFileSync(path.join(root,n),'utf8');
const school=read('for-schools.html'),academy=read('for-coaches.html'),procurement=read('procurement.html');
const sitemap=read('sitemap.xml');
const checks=[
 ['for-schools.html',school,'school-bulk-rfq-worksheet'],
 ['for-coaches.html',academy,'academy-bulk-planning'],
 ['procurement.html',procurement,'public-buyer-route']
];
for(const [name,html,anchor] of checks){
 assert.equal((html.match(new RegExp('id="'+anchor+'"','g'))||[]).length,1,'Missing or duplicate buyer resource: '+name);
 assert(html.includes('https://www.mingeagle.com/'+name),'Public canonical or content missing '+name);
 const lastmod=(name==='procurement.html'||name==='for-schools.html')?'2026-10-18':'2026-10-17';
 assert(sitemap.includes('<loc>https://www.mingeagle.com/'+name+'</loc><lastmod>'+lastmod+'</lastmod>'),
  'Evidence-backed sitemap date missing: '+name);
 assert(html.includes('inquiry.html?type=quote&amp;customer='),'No direct B2B inquiry CTA: '+name);
 assert(html.includes('<h2'),'Buyer resource must be a crawlable heading: '+name);
 assert(!/guaranteed delivery|government approved supplier|90% quieter|independently certified|free shipping guaranteed/i.test(
    html.slice(html.indexOf('id="'+anchor+'"'),html.indexOf('</main>'))),
  'Unverified sales claim in new B2B buyer resource: '+name);
}
assert(school.includes('Copy-ready message for your purchasing team'),'School RFQ worksheet must be shareable');
assert(school.includes('no independently measured decibel reduction is claimed'),
 'School buyer advice must not invent acoustic measurements');
assert(school.includes('applicable sales tax')&&school.includes('import duties'),
 'US sales tax must be identified separately from customs and import duties');
assert(academy.includes('for-schools.html#school-bulk-rfq-worksheet'),
 'Academy has direct link into school purchasing worksheet');
assert(procurement.includes('for-schools.html#school-bulk-rfq-worksheet'),
 'Institutional page has direct link into school purchasing worksheet');
assert(school.includes('procurement.html#rfq-checklist'),
 'School buying page returns reader to procurement terms');
const prospecting=fs.readFileSync('docs/marketing/us-b2b-prospecting-sprint-2026-10-17.md','utf8');
for(const url of [
 'https://www.ymca.org/find-your-y','https://www.bgca.org/get-involved/find-a-club/',
 'https://procurement.lausd.org/apps/pages/Vendor-Services','https://sam.gov/entity-registration'
])assert(prospecting.includes(url),'Public official prospect channel missing: '+url);
assert(prospecting.includes('no outreach has been sent'),
 'Outreach kit must not misrepresent research as direct prospect engagement');
console.log('PASS: school/academy/procurement SEO worksheet cross-links, official prospect sources and honest RFQ conversion CTAs.');
