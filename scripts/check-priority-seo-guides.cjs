'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../public');
const base='https://www.mingeagle.com/';
const campImage=base+'assets/hero-flocked-silent-basketball-set.webp?v=20261007-1';
const guideImage=base+'assets/guide-set-studio-v3.webp';
function load(filename){
 const html=fs.readFileSync(path.join(root,filename),'utf8');
 const end=html.toLowerCase().indexOf('</head>');
 assert(end>=0,'Missing head in '+filename);
 return {html,head:html.slice(0,end+7),body:html.slice(end+7)};
}
function meta(head,attr,name){
 const tag=[...head.matchAll(/<meta\b[^>]*>/gi)].map(m=>m[0]).find(t=>new RegExp('\\b'+attr+'=["\']'+name+'["\']','i').test(t));
 return tag?.match(/\bcontent=["']([^"']*)["']/i)?.[1]??null;
}
function schemas(head){
 return [...head.matchAll(/<script\b(?=[^>]*type=["']application\/ld\+json["'])[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>JSON.parse(m[1]));
}
function flatten(value,out=[]){
 if(Array.isArray(value)){value.forEach(v=>flatten(v,out));return out;}
 if(value&&typeof value==='object'){
  if(value['@type'])out.push(value);
  Object.values(value).forEach(v=>{if(v&&typeof v==='object')flatten(v,out);});
 }
 return out;
}
function titleAndDescription(filename,titleExpected,descriptionExpected){
 const {head}=load(filename);
 const title=head.match(/<title>([\s\S]*?)<\/title>/i)?.[1];
 const description=meta(head,'name','description');
 assert.equal(title,titleExpected,'Search title changed unexpectedly on '+filename);
 assert(title.replace(/&amp;/g,'&').length<=60,'Search title should fit a concise snippet: '+filename);
 assert.equal(description,descriptionExpected,'Search description changed unexpectedly on '+filename);
 assert(description.length<=160,'Search description should fit a concise snippet: '+filename);
 assert.equal(meta(head,'property','og:title'),title,'Open Graph title must match search title: '+filename);
 assert.equal(meta(head,'name','twitter:title'),title,'Twitter title must match search title: '+filename);
 assert.equal(meta(head,'property','og:description'),description,'Open Graph description must match search description: '+filename);
 assert.equal(meta(head,'name','twitter:description'),description,'Twitter description must match search description: '+filename);
 assert.equal(meta(head,'property','og:url'),base+filename,'Open Graph URL must match canonical: '+filename);
 assert.equal(meta(head,'property','og:image'),meta(head,'name','twitter:image'),'Social image tags must agree: '+filename);
 assert.equal((head.match(/rel=["']canonical["']/gi)||[]).length,1,'Exactly one canonical required: '+filename);
 assert.equal(head.match(/<link\b[^>]*rel=["']canonical["'][^>]*>/i)?.[0].match(/href=["']([^"']+)["']/i)?.[1],base+filename,'Self canonical required: '+filename);
}
{
 const filename='basketball-camp-equipment-supplier.html';
 const {head,body}=load(filename);
 const title='Basketball Camp Equipment Supplier | MING EAGLE';
 const description='Plan silent basketball purchases for youth camps and academies. Compare sizes, request samples, customization and a bulk shipping quote.';
 titleAndDescription(filename,title,description);
 assert.equal(meta(head,'property','og:image'),campImage,'Social image must use the real first-party product image');
 assert.equal(meta(head,'property','og:image:alt'),'Flocked silent basketball set with mini hoop for supervised youth camp drills');
 assert(/<img\b[^>]*src=["']assets\/hero-flocked-silent-basketball-set\.webp\?v=20261007-1["'][^>]*alt=["']Flocked silent basketball set with mini hoop for supervised youth camp drills["']/.test(body),'Visible product image must have accurate alt text');
 assert.equal((body.match(/<h1\b/gi)||[]).length,1,'Camp buyer guide must have one H1');
 const nodes=schemas(head).flatMap(s=>flatten(s));
 const page=nodes.find(n=>n['@type']==='WebPage'&&n.url===base+filename);
 assert(page,'Camp buyer guide WebPage schema is required');
 assert.equal(page.primaryImageOfPage?.url,campImage,'WebPage primary image must match visible image and social previews');
}
{
 const filename='silent-basketball-guide.html';
 const {head,body}=load(filename);
 const title='Silent Basketball Setup &amp; Care Guide | MING EAGLE';
 const description='Learn how to install the mini hoop, prepare flocked or fabric-cover silent basketballs, clean the soft cover and use the set safely indoors.';
 titleAndDescription(filename,title,description);
 assert.equal(meta(head,'property','og:image'),guideImage,'Guide social image must match the existing lead image');
 assert(body.includes('src="assets/guide-set-studio-v3.webp"'),'Guide lead image must remain visible');
 const nodes=schemas(head).flatMap(s=>flatten(s));
 const articles=nodes.filter(n=>n['@type']==='Article'&&n.mainEntityOfPage?.['@id']===base+filename);
 assert.equal(articles.length,1,'Exactly one Article schema for the setup guide');
 const article=articles[0];
 assert.equal(article.headline,'Silent Basketball Setup & Care Guide | MING EAGLE');
 assert.equal(article.description,description);
 assert.equal(article.datePublished,'2026-10-06','Publication date must match the page first added to the public repository');
 assert.equal(article.dateModified,'2026-10-19','Modification date must match the verified lastmod and editorial update');
 assert(article.image?.includes(guideImage),'Article schema image must match the existing lead image');
 assert.equal(article.inLanguage,'en');
 assert.equal(article.author?.name,'MING EAGLE');
 assert.equal(article.publisher?.url,base);
}
console.log('PASS: priority B2B guide snippets, canonical/social metadata, visible images and matching structured data.');
