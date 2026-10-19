// Keep sitemap modified dates conservative: explicit evidence-backed editorial
// updates only. Do not bump every URL to the release date or invent Google crawls.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const dir=path.resolve(process.argv[2]||'public');
const xml=fs.readFileSync(path.join(dir,'sitemap.xml'),'utf8');
const entries=[...xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>\s*<\/url>/g)].map(m=>({url:m[1],date:m[2]}));
const all=[...xml.matchAll(/<url>/g)].length;
assert.equal(entries.length,all,'Every sitemap URL needs one explicit verified lastmod');
assert.equal(entries.length,27,'Main sitemap must list the 27 live canonical buyer-facing pages');
const seen=new Set(),dates=new Map(),today=new Date().toISOString().slice(0,10);
for(const entry of entries){
 assert(!seen.has(entry.url),'Duplicate sitemap URL: '+entry.url);seen.add(entry.url);
 assert(entry.url.startsWith('https://www.mingeagle.com/'),'Use HTTPS www canonical URLs only');
 assert(/^20\d\d-\d\d-\d\d$/.test(entry.date),'lastmod needs YYYY-MM-DD');
 const date=new Date(entry.date+'T00:00:00Z');
 assert(!Number.isNaN(date.valueOf())&&date.toISOString().slice(0,10)===entry.date,'Malformed lastmod date '+entry.date);
 assert(entry.date<=today,'Cannot assert future content modification '+entry.date);
 const filename=entry.url.replace('https://www.mingeagle.com/','')||'index.html';
 assert(/^[a-z0-9-]+\.html$/.test(filename)&&fs.existsSync(path.join(dir,filename)),'Missing approved HTML page '+filename);
 dates.set(filename,entry.date);
}
const revised=['school-basketball-bulk-order-rfq-checklist.html','procurement.html','for-schools.html','wholesale.html','index.html','silent-basketball.html','silent-basketball-guide.html','fabric-silent-basketball.html','weighted-flocked-basketball.html','silent-soccer.html','products.html','wholesale-product-catalog.html','for-coaches.html','basketball-camp-equipment-supplier.html'];
for(const p of revised)assert(dates.get(p)>='2026-10-13','Meaningfully revised content cannot be represented by its obsolete 2026-10-12 sitemap lastmod: '+p);
for(const p of ['order-status.html']){
 assert.equal(dates.get(p),'2026-10-12','Do not rewrite untouched pages merely to appear fresh: '+p);
}
assert.equal(dates.get('index.html'),'2026-10-19','Homepage localization and B2B messaging update must carry the evidence-backed 2026-10-19 lastmod');
assert.equal(dates.get('custom-logo.html'),'2026-10-18','Revised custom-logo B2B buyer FAQ must carry real 2026-10-18 lastmod');
assert.equal(dates.get('videos.html'),'2026-10-13','Genuine video gallery editorial update needs evidence-backed sitemap lastmod');
console.log('PASS: 27 unique www canonical URLs, evidenced lastmod dates and preserved untouched page dates.');
