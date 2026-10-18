// Real editorial content and internal link acceptance checks for B2B SEO.
const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const root=process.argv[2]||'public';
const html=fs.readFileSync(path.join(root,'procurement.html'),'utf8');
const sitemap=fs.readFileSync(path.join(root,'sitemap.xml'),'utf8');
const section=html.match(/<!-- MING EAGLE PROCUREMENT BUYER ANSWERS 20261018 BEGIN -->([\s\S]*?)<!-- MING EAGLE PROCUREMENT BUYER ANSWERS 20261018 END -->/)?.[1];
assert(section,'Procurement question block missing');
assert(html.indexOf('PROCUREMENT BUYER ANSWERS 20261018 BEGIN')<html.indexOf('</main>'),'Buyer content must be in page main');
assert(html.includes('rel="canonical" href="https://www.mingeagle.com/procurement.html"'));
assert(html.includes('"dateModified":"2026-10-18"'));
for(const phrase of ['What should a school or public recreation buyer ask','What minimum order quantity qualifies',
 'Can a school review a sample','How are sea freight, import duties and US sales tax handled',
 'Can MING EAGLE accept a school or municipal purchase order',
 'What information makes a buyer-ready request for quotation',
 'not a guaranteed delivery promise','does not mean that MING EAGLE is registered',
 'do not provide regulation rebound','does not automatically']) {
 assert(section.includes(phrase),'Required nuanced sourcing answer missing: '+phrase);
}
assert.equal((section.match(/<h3>/g)||[]).length,6);
const links=[...section.matchAll(/href="([^"]+)"/g)].map(m=>m[1]);
const meaningful=['silent-basketball.html','fabric-silent-basketball.html',
 'weighted-flocked-basketball.html','wholesale-product-catalog.html',
 'school-basketball-bulk-order-rfq-checklist.html','for-schools.html',
 'silent-basketball-bulk-buying-guide.html'];
for(const link of meaningful){
 assert(links.includes(link),'Missing product or institution information path '+link);
 assert(fs.existsSync(path.join(root,link)),'Missing target page '+link);
}
assert(links.some(x=>x.includes('inquiry.html?type=quote')),'Missing usable inquiry path');
assert(!/guaranteed.{0,30}(?:silence|sound|dB|decibels)/i.test(section),'Never invent noise guarantees');
assert(!/approved supplier to (?:all|any) (?:states|schools|governments)/i.test(section));
assert(sitemap.includes('<loc>https://www.mingeagle.com/procurement.html</loc><lastmod>2026-10-18</lastmod>'));
console.log('PASS: one source-accurate institutional procurement FAQ, six actionable answers, seven crawlable buyer links, no fake certification or lab noise figures; updated sitemap evidence.');
