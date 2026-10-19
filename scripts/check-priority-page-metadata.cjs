const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(process.argv[2]||'public');
const base='https://www.mingeagle.com/';
const pages=[
 'basketball-camp-equipment-supplier.html',
 'custom-basketball-for-teams.html',
 'for-coaches.html',
 'custom-logo.html',
 'inquiry.html'
];
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const types=node=>Array.isArray(node?.['@type'])?node['@type']:[node?.['@type']];
function schemaNodes(html,name){
 const out=[];
 for(const [,raw] of html.matchAll(/<script\\b[^>]*type=["']application\\/ld\\+json["'][^>]*>([\\s\\S]*?)<\\/script>/gi)){
  const data=JSON.parse(raw);
  const walk=node=>{if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(walk);return;}out.push(node);Object.values(node).forEach(walk);};
  walk(data);
 }
 assert(out.length>0,name+' must contain valid JSON-LD');
 return out;
}
for(const name of pages){
 const html=read(name),url=base+name;
 const titles=[...html.matchAll(/<title>([\\s\\S]*?)<\\/title>/gi)];
 const descriptions=[...html.matchAll(/<meta\\b(?=[^>]*\\bname=["']description["'])[^>]*\\bcontent=["']([^"']*)["'][^>]*>/gi)];
 assert.equal(titles.length,1,name+' must have one title');
 assert.equal(descriptions.length,1,name+' must have one description');
 const title=titles[0][1].replace(/&amp;/g,'&').trim();
 const description=descriptions[0][1].replace(/&amp;/g,'&').trim();
 assert(title.length>20&&title.length<=60,name+' title length '+title.length+' must be 21–60 characters');
 assert(description.length>60&&description.length<=160,name+' description length '+description.length+' must be 61–160 characters');
 const canonicalTag=html.match(/<link\\b[^>]*rel=["']canonical["'][^>]*>/i)?.[0]||'';
 assert.equal(canonicalTag.match(/href=["']([^"']+)["']/i)?.[1],url,name+' canonical must use the official www HTTPS URL');
 const nodes=schemaNodes(html,name);
 assert(nodes.some(n=>String(n.url||n.mainEntityOfPage||'').includes(url)||JSON.stringify(n).includes(url)),name+' JSON-LD must reference its canonical URL');
 if(name==='basketball-camp-equipment-supplier.html'){
  const ogTitle=html.match(/<meta\\b(?=[^>]*property=["']og:title["'])[^>]*content=["']([^"']*)["'][^>]*>/i)?.[1];
  const ogDesc=html.match(/<meta\\b(?=[^>]*property=["']og:description["'])[^>]*content=["']([^"']*)["'][^>]*>/i)?.[1];
  assert.equal(ogTitle,title,'Camp guide Open Graph title must match page title');
  assert.equal(ogDesc,description,'Camp guide Open Graph description must match page description');
  const webPage=nodes.find(n=>types(n).includes('WebPage'));
  assert.equal(webPage?.name,title);assert.equal(webPage?.description,description);
 }
 if(name==='custom-basketball-for-teams.html'){
  const article=nodes.find(n=>types(n).includes('Article'));
  assert(article&&article.mainEntityOfPage===url,'Team buying guide must retain its Article schema');
 }
 if(name==='for-coaches.html'){
  const page=nodes.find(n=>types(n).includes('WebPage'));
  assert.equal(page?.name,title);assert.equal(page?.description,description);
 }
 if(name==='custom-logo.html'){
  const page=nodes.find(n=>types(n).includes('WebPage'));
  assert.equal(page?.name,title);assert.equal(page?.description,description);
 }
 if(name==='inquiry.html'){
  const page=nodes.find(n=>types(n).includes('ContactPage'));
  assert.equal(page?.url,url);assert.equal(page?.mainEntity?.email,'mingeaglecommerce@gmail.com');
  for(const [,tag] of html.matchAll(/<img\\b[^>]*>/gi))assert.match(tag,/\\balt=["'][^"']+["']/i,'Every inquiry product image needs non-empty alt text');
 }
}
console.log('PASS: priority B2B pages have concise titles/descriptions, www canonicals, valid page-specific structured data and accessible inquiry imagery.');
