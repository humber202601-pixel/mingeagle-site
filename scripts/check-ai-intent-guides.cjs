// Release gate for people-first answer-engine discovery content.
// Only public static content. Never claims AI placement, fake testimonials or
// independent noise reduction test results.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(process.argv[2]||'public');
const pages=[
 'quiet-indoor-sports-for-kids.html',
 'indoor-school-sports-equipment-guide.html'
];
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const base='https://www.mingeagle.com/';
const sitemap=read('sitemap.xml'),robots=read('robots.txt');
for(const name of pages){
 const source=read(name),url=base+name;
 assert.match(source,/<html lang="en">/);
 assert.match(source,/<main id="main"/);
 assert.equal((source.match(/<h1\b/g)||[]).length,1,name+' must have exactly one heading');
 assert.match(source,/<meta name="robots" content="index,follow/);
 assert(source.includes('<link rel="canonical" href="'+url+'">'),'Canonical must match www live host');
 assert(sitemap.includes('<loc>'+url+'</loc>'),'Sitemap must include the new page');
 assert.match(source,/not (an independent laboratory assessment|a universal replacement|a certified decibel reduction|a representation|a first recommendation)/i);
 assert(!/aggregateRating|reviewCount|ratingValue|decibel reduction of \d+|\d+% quieter|guaranteed silent|certified safe for/i.test(source),'No fabricated rating, test results or safety certifications');
 const scripts=[...source.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
 assert.equal(scripts.length,1,'Exactly one grounded JSON-LD graph required');
 const ld=JSON.parse(scripts[0][1]);
 assert.equal(ld['@context'],'https://schema.org');
 const article=ld['@graph'].find(n=>n['@type']==='Article');
 const crumbs=ld['@graph'].find(n=>n['@type']==='BreadcrumbList');
 assert.equal(article.mainEntityOfPage,url);
 assert.equal(article.author.name,'MING EAGLE');
 assert.equal(article.inLanguage,'en');
 assert.equal(crumbs.itemListElement.at(-1).item,url);
 assert(!('offers' in article),'No invented pricing');
 const anchors=[...source.matchAll(/href="([a-z0-9-]+\.html)"/g)].map(m=>m[1]);
 assert(anchors.length>=9,'Need real crawlable product and inquiry links');
 for(const href of anchors)assert(fs.existsSync(path.join(root,href)),name+' has broken link '+href);
}
for(const [source,target] of [
 ['index.html','quiet-indoor-sports-for-kids.html'],
 ['silent-basketball.html','quiet-indoor-sports-for-kids.html'],
 ['index.html','indoor-school-sports-equipment-guide.html'],
 ['learn.html','quiet-indoor-sports-for-kids.html'],
 ['learn.html','indoor-school-sports-equipment-guide.html'],
 ['for-schools.html','indoor-school-sports-equipment-guide.html'],
 ['for-coaches.html','indoor-school-sports-equipment-guide.html'],
 ['silent-basketball-for-apartments.html','quiet-indoor-sports-for-kids.html']
]){
 const html=read(source);
 assert(html.includes('href="'+target+'"'),source+' must link to '+target+' in visible HTML');
}
for(const ua of ['Googlebot','Bingbot','OAI-SearchBot','PerplexityBot','Claude-SearchBot','Claude-User']){
 assert(new RegExp('User-agent: '+ua+'\\s+Allow: /').test(robots),'Crawler rule missing: '+ua);
}
assert(robots.includes('Sitemap: '+base+'sitemap.xml'));
console.log('PASS: two user-intent buyer guides, site-safe JSON-LD, robots/search crawlers, canonical URLs, sitemap and seven validated in-site entry points.');
