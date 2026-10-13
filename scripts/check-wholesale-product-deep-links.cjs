// An indexed wholesale catalog should lead to each corresponding product detail page.
// Only static anchor links count. No client script/UTM, shopping/feed claims or fake stock.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||'public');
const doc=fs.readFileSync(path.join(root,'wholesale-product-catalog.html'),'utf8');
const master=JSON.parse(fs.readFileSync(path.join(root,'product-master.json'),'utf8'));
const items=[['p1','silent-basketball.html'],['p2','fabric-silent-basketball.html'],['p3','weighted-flocked-basketball.html'],['p4','silent-soccer.html']];
const articles=[...doc.matchAll(/<article class="product">([\s\S]*?)<\/article>/g)].map(m=>m[1]);
assert.equal(articles.length,4,'Catalog must show four real product cards');
for(let i=0;i<items.length;i++){
 const [key,page]=items[i],article=articles[i],name=master[key].name;
 assert(article.includes('<h2>'+name+'</h2>'),'Catalog product card name not aligned to master '+key);
 const links=[...article.matchAll(/<a\b[^>]*href="([a-z0-9-]+\.html)"[^>]*>/g)].map(m=>m[1]);
 assert(links.includes(page),'Catalog card missing crawlable static deep link to '+page);
 const staticLink='<a href="'+page+'">Read '+name+' product details and intended-use guidance</a>';
 assert(article.includes(staticLink),'Catalog card must provide clear descriptive anchor text matching actual SKU');
 assert(fs.existsSync(path.join(root,page)),'SKU destination missing '+page);
 for(const other of items)if(other[1]!==page)assert(!links.includes(other[1]),'Catalog card cross-linked wrong product '+other[1]);
 assert(!/\b(?:guaranteed silent|100% noise free|verified decibel|AI-recommended)\b/i.test(article),'Unverified claims inside product cards');
}
const sitemap=fs.readFileSync(path.join(root,'sitemap.xml'),'utf8');
for(const [,page] of items)assert(sitemap.includes('<loc>https://www.mingeagle.com/'+page+'</loc>'),'SKU must be public sitemapped');
console.log('PASS: all four indexed wholesale cards link directly to matching public product specifications.');
