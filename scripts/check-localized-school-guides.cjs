// Five truly translated school/academy pages, not language-switch-only shells.
// Google hreflang: each alternate must include itself and reciprocate all peers.
// Four localized URLs live in a separate sitemap; primary sitemap now includes the institutional procurement page.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||'public'),base='https://www.mingeagle.com/';
const map={
 en:'indoor-school-sports-equipment-guide.html',
 de:'school-sports-equipment-de.html',
 fr:'school-sports-equipment-fr.html',
 es:'school-sports-equipment-es.html',
 pt:'school-sports-equipment-pt.html'
};
const files=Object.values(map),officialMap=new Map(Object.entries(map).map(([k,v])=>[k,base+v]));
officialMap.set('x-default',base+map.en);
const original=fs.readFileSync(path.join(root,'sitemap.xml'),'utf8');
const localized=fs.readFileSync(path.join(root,'sitemap-localized.xml'),'utf8');
const originalUrls=[...original.matchAll(/<loc>([^<]+)<\/loc>/g)].map(x=>x[1]);
const localizedUrls=[...localized.matchAll(/<loc>([^<]+)<\/loc>/g)].map(x=>x[1]);
assert.equal(originalUrls.length,27,'Current canonical public buyer URLs must stay on their own sitemap');
assert.equal(localizedUrls.length,4,'New sitemap contains exactly four actual translated buyer guides');
assert.deepEqual(localizedUrls,files.slice(1).map(x=>base+x),'Localized sitemap order and URLs must match all four pages');
for(const url of localizedUrls){
 assert(!originalUrls.includes(url),'Duplicated sitemap entry for '+url);
 assert(localized.includes('<loc>'+url+'</loc><lastmod>2026-10-13</lastmod>'),'Each localized page truly published today');
}
const robots=fs.readFileSync(path.join(root,'robots.txt'),'utf8');
for(const sitemap of ['sitemap.xml','sitemap-localized.xml'])
 assert(robots.includes('Sitemap: '+base+sitemap),'Both discoverable XML maps must be in robots');
const data=[];
for(const [lang,filename] of Object.entries(map)){
 const html=fs.readFileSync(path.join(root,filename),'utf8');
 const head=html.split(/<\/head>/i)[0];
 const body=html.split(/<body>/i)[1]||'';
 const canon=[...head.matchAll(/<link\b[^>]*rel=(["'])canonical\1[^>]*>/gi)];
 assert.equal(canon.length,1,'Only one canonical is valid for '+filename);
 assert.equal(canon[0][0].match(/\bhref=(["'])([^"']+)\1/i)?.[2],base+filename,'Each language must be self-canonical '+filename);
 assert(new RegExp('<html lang="'+lang+'">','i').test(html),'Explicit correct page language: '+filename);
 const alts=[...head.matchAll(/<link\b[^>]*rel="alternate"[^>]*>/gi)].map(m=>({
  lang:m[0].match(/\bhreflang="([^"]+)"/i)?.[1],
  href:m[0].match(/\bhref="([^"]+)"/i)?.[1]
 }));
 assert.equal(alts.length,officialMap.size,'Six complete reciprocal hreflang labels required for '+filename);
 const used=new Set();
 for(const alt of alts){
  assert(officialMap.has(alt.lang),'Unexpected language variant in '+filename);
  assert(!used.has(alt.lang),'Duplicate alternate variant '+alt.lang);
  used.add(alt.lang);
  assert.equal(alt.href,officialMap.get(alt.lang),'Not reciprocal or wrong canonical '+alt.lang);
 }
 assert.deepEqual([...used].sort(),[...officialMap.keys()].sort());
 const links=[...body.matchAll(/<a\b[^>]*href="([^"]+)"/gi)].map(m=>m[1]);
 const filenames=files.filter(name=>name!==filename);
 for(const name of filenames)assert(links.includes(name),'Visible language switcher missing peer '+name+' from '+filename);
 for(const product of ['silent-basketball.html','fabric-silent-basketball.html','weighted-flocked-basketball.html','silent-soccer.html'])
  assert(links.includes(product),'Missing true model-specific first-party product link '+product+' from '+filename);
 for(const link of ['products.html','inquiry.html','wholesale.html','quiet-indoor-sports-for-kids.html'])
  assert(links.includes(link),'Missing relevant conversion or take-home guide '+link+' from '+filename);
 assert((html.match(/<h1\b/gi)||[]).length===1,'Exactly one h1 in '+filename);
 const sections=[...body.matchAll(lang==='en'?/<section\b[^>]*class="guide-section"[^>]*>/gi:/<section\b[^>]*class="card"[^>]*>/gi)].length;
 assert(sections>=6,'Each locale must have at least six substantive original buyer topic sections '+filename);
 const text=body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
 assert(text.split(/\s+/).length>=300,'This is only a thin translated shell, not a useful complete guide: '+filename);
 assert(/sample|Muster|échantillon|muestra|amostra/i.test(text),'Sample evaluation guidance missing: '+filename);
 assert(/noise|Geräusch|bruit|ruido|ruído/i.test(text),'Noise limitation must be explicit: '+filename);
 assert(!/guaranteed silent|\b\d+\s*dB\b|\b\d+% quieter|certified safe for every age/i.test(text),'Unverified marketing claim '+filename);
 const title=head.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.replace(/&amp;/g,'&');
 assert(title&&title.length<=60,'Search title should stay within the compact snippet target: '+filename);
 const meta=head.match(/<meta name="description" content="([^"]+)"/i)?.[1];
 assert(meta&&meta.length>=80&&meta.length<=160,'Localized meta description should fit a concise search snippet: '+filename);
 const ogTitle=head.match(/<meta property="og:title" content="([^"]+)"/i)?.[1]?.replace(/&amp;/g,'&');
 const ogDescription=head.match(/<meta property="og:description" content="([^"]+)"/i)?.[1];
 const twitterTitle=head.match(/<meta name="twitter:title" content="([^"]+)"/i)?.[1]?.replace(/&amp;/g,'&');
 const twitterDescription=head.match(/<meta name="twitter:description" content="([^"]+)"/i)?.[1];
 const imageUrl=base+'assets/hero-flocked-silent-basketball-set.webp?v=20261007-1';
 assert.equal(ogTitle,title,'Social title must match search title: '+filename);
 assert.equal(twitterTitle,title,'Twitter title must match search title: '+filename);
 assert.equal(ogDescription,meta,'Open Graph description must match search description: '+filename);
 assert.equal(twitterDescription,meta,'Twitter description must match search description: '+filename);
 assert.equal(head.match(/<meta property="og:image"/gi)?.length,1,'One Open Graph image required: '+filename);
 assert.equal(head.match(/<meta name="twitter:image"/gi)?.length,1,'One Twitter image required: '+filename);
 assert.equal(head.match(/<meta name="twitter:card" content="summary_large_image"/gi)?.length,1,'One large-image social card required: '+filename);
 assert.equal(head.match(/<meta property="og:image" content="([^"]+)"/i)?.[1],imageUrl,'Social image must be the published product image: '+filename);
 assert.equal(head.match(/<meta name="twitter:image" content="([^"]+)"/i)?.[1],imageUrl,'Twitter image must be the published product image: '+filename);
 assert(new RegExp('<img\\b[^>]*src="assets/hero-flocked-silent-basketball-set\\.webp\\?v=20261007-1"[^>]*alt="[^"]+"').test(body),'Relevant product image with descriptive alt text required: '+filename);
 const jsons=[...head.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
 assert.equal(jsons.length,1,'One factual Article JSON-LD per localized document: '+filename);
 const ld=JSON.parse(jsons[0][1]);
 const article=ld['@type']==='Article'?ld:ld['@graph']?.find(x=>x['@type']==='Article');
 assert(article&&article.inLanguage===lang,'Structured language must equal visible document language '+filename);
 assert.equal(article.image,base+'assets/hero-flocked-silent-basketball-set.webp?v=20261007-1','Article must reference the relevant image actually shown on the page: '+filename);
 assert.equal(article.mainEntityOfPage,base+filename,'Article main page must be this localized URL');
 assert.equal(article.publisher.name,'MING EAGLE');
 if(lang!=='en'){
  assert(!body.includes('<section class="guide-section">'),'Translated page must have genuinely translated sections, not pasted English body');
  assert(!/lang="en"[^>]*><h1/i.test(body));
 }
 data.push({lang,words:text.split(/\s+/).length,sections});
}
const seen=new Set(originalUrls.concat(localizedUrls));
assert.equal(seen.size,31,'27 canonical public + 4 translated URLs require 31 distinct public URLs');
const english=fs.readFileSync(path.join(root,map.en),'utf8');
assert(!english.includes('<meta http-equiv="refresh"'),'Never auto redirect language alternatives');
console.log('PASS: 31 distinct public URLs across 2 sitemaps; four substantial multilingual pages with 6 reciprocal hreflangs each, self-canonicals, native-language content, first-party product/quote links and honest disclaimers.');
