// Fail release when a published sitemap page declares a conflicting canonical.
// Reads REAL static HTML, not just whether a link exists in a template.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||'public');
const base='https://www.mingeagle.com/';
const sitemap=fs.readFileSync(path.join(root,'sitemap.xml'),'utf8');
const urls=[...sitemap.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(x=>x[1]);
assert.equal(urls.length,26,'Approved public catalog currently has 25 canonical pages');
assert.equal(new Set(urls).size,urls.length,'Sitemap cannot contain duplicate canonical URLs');
const robots=fs.readFileSync(path.join(root,'robots.txt'),'utf8');
assert(robots.includes('Sitemap: '+base+'sitemap.xml'));
for(const url of urls){
 assert(url.startsWith(base),'All public URLs require canonical HTTPS www host');
 const pathname=url.slice(base.length);
 assert(pathname===''||/^[a-z0-9-]+\.html$/.test(pathname),'Only approved clean public HTML URLs in sitemap');
 const filename=pathname||'index.html';
 const html=fs.readFileSync(path.join(root,filename),'utf8');
 const head=html.split(/<\/head>/i)[0];
 assert(/<head(?:\s[^>]*)?>/i.test(head),'Head not present: '+filename);
 const canonicalTags=[...head.matchAll(/<link\b[^>]*\brel=(["'])canonical\1[^>]*>/gi)].map(m=>m[0]);
 assert.equal(canonicalTags.length,1,'Exactly one canonical is mandatory for '+filename);
 const urlValue=canonicalTags[0].match(/\bhref=(["'])([^"']+)\1/i)?.[2];
 assert.equal(urlValue,url,'Canonical does not equal sitemap entry: '+filename);
 assert(!/https:\/\/mingeagle\.com(?:\/|["'])/i.test(head),'Legacy apex host found in metadata/structured data: '+filename);
 for(const token of ['og:url','twitter:url']){
  const tag=head.match(new RegExp('<meta\\b(?=[^>]*(?:name|property)=(["\x27])'+token+'\\1)[^>]*>','i'))?.[0];
  if(tag){const content=tag.match(/\bcontent=(["'])([^"']+)\1/i)?.[2];assert.equal(content,url,'Social URL must match canonical on '+filename)}
 }
 const scripts=[...head.matchAll(/<script\b[^>]*type=(["'])application\/ld\+json\1[^>]*>([\s\S]*?)<\/script>/gi)];
 for(const script of scripts){
  const obj=JSON.parse(script[2]);
  const walk=(value)=>{
   if(typeof value==='string'){
    assert(!/https:\/\/mingeagle\.com\//i.test(value),'Legacy apex URL in JSON-LD for '+filename);
   }else if(Array.isArray(value))value.forEach(walk);
   else if(value&&typeof value==='object')Object.values(value).forEach(walk);
  };
  walk(obj);
  if(obj['@type']==='ProductGroup'){
   assert.equal(obj.url,url,'ProductGroup primary URL must match canonical');
   for(const item of obj.hasVariant||[]){
    assert.equal(item.url,url,'Product variant URL must match canonical');
    assert.equal(item.offers?.url,url,'Variant purchase destination must match canonical');
   }
  }
 }
}
console.log('PASS: '+urls.length+' public HTML canonicals equal www HTTPS sitemap URLs; no apex metadata or ProductGroup URL mismatch.');
