// Validate the actual built HTML crawl graph, not JavaScript-only navigation.
// Sitemap inclusion alone does not guarantee Google, Bing, or AI indexing.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||'public');
const host='https://www.mingeagle.com/';
const sitemap=fs.readFileSync(path.join(root,'sitemap.xml'),'utf8');
const urls=[...sitemap.matchAll(/<loc>\s*(https:\/\/www\.mingeagle\.com\/[^<\s]*)\s*<\/loc>/g)].map(m=>m[1]);
assert.equal(urls.length,26,'Public sitemap expected 25 approved URLs; update benchmarks if pages change');
const byUrl=new Map();
const paths=new Set();
function route(href,base){
 try{
  const u=new URL(href,host+base.replace(/^\//,''));
  if(u.hostname!=='www.mingeagle.com'||u.protocol!=='https:'||u.username||u.password||u.port)return null;
  const p=u.pathname==='/index.html'?'/':u.pathname;
  return p;
 }catch{return null}
}
for(const url of urls){
 const routePath=route(url,'/');
 assert(routePath!==null&&/^\/(?:[a-z0-9-]+\.html)?$/.test(routePath),'Only canonical public HTML may be in sitemap: '+url);
 assert(!paths.has(routePath),'Duplicate canonical sitemap URL '+routePath);
 paths.add(routePath);
 const filename=routePath==='/'?'index.html':routePath.slice(1);
 assert(fs.existsSync(path.join(root,filename)),'Sitemap page file not in release: '+filename);
 const raw=fs.readFileSync(path.join(root,filename),'utf8');
 const html=raw.replace(/<!--[\s\S]*?-->/g,'')
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'');
 const outgoing=new Set();
 for(const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*(["'])([^"']+)\1/gi)){
  const dest=route(m[2],routePath);
  if(dest)outgoing.add(dest);
 }
 byUrl.set(routePath,outgoing);
}
assert(paths.has('/'));
assert(paths.has('/procurement.html'),'Institutional procurement page must be indexed');
const inlinks=new Map([...paths].map(p=>[p,new Set()]));
for(const [source,targets] of byUrl){
 for(const dest of targets)if(paths.has(dest))inlinks.get(dest).add(source);
}
const seen=new Set(['/']),queue=['/'];
while(queue.length){
 const current=queue.shift();
 for(const url of byUrl.get(current)||[]){
  if(paths.has(url)&&!seen.has(url)){seen.add(url);queue.push(url)}
 }
}
const unreachable=[...paths].filter(p=>!seen.has(p));
assert.deepEqual(unreachable,[],'Indexable sitemap pages not reachable from homepage with plain anchor HTML: '+unreachable.join(', '));
for(const p of paths)if(p!=='/')assert(inlinks.get(p).size>0,'Orphan public page '+p);
const kids='/quiet-indoor-sports-for-kids.html',school='/indoor-school-sports-equipment-guide.html';
assert(inlinks.get(kids)?.has('/silent-basketball.html'),'Indexed basketball SKU must link to quiet kids activity guide');
assert(inlinks.get(school)?.has('/wholesale.html'),'Indexed wholesale page must link to school buying guide');
assert(inlinks.get(kids)?.has('/'),'Homepage must link to quiet kids guide');
assert(inlinks.get(school)?.has('/'),'Homepage must link to school equipment guide');
console.log('PASS: '+paths.size+' canonical public sitemap pages reachable from homepage via real static HTML anchors; both GEO buyer guides directly linked by indexed source pages.');
