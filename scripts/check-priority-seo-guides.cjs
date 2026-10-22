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
{
 const filename='quiet-indoor-sports-for-kids.html';
 const {head,body}=load(filename);
 const title='Quiet Indoor Sports for Kids | MING EAGLE';
 const description='Practical ideas for indoor basketball in apartments: compare soft balls, floor protection, safe play and realistic noise limits.';
 titleAndDescription(filename,title,description);
 const image=base+'assets/hero-flocked-silent-basketball-set.webp?v=20261007-1';
 assert.equal(meta(head,'property','og:image'),image,'Indoor play guide social image must be the real product image');
 assert(/<img\b[^>]*src=["']assets\/hero-flocked-silent-basketball-set\.webp\?v=20261007-1["'][^>]*alt=["']Flocked silent basketball set with mini hoop for supervised indoor play["']/.test(body),'Indoor play guide image must be visible with descriptive alt text');
 const nodes=schemas(head).flatMap(s=>flatten(s));
 const article=nodes.find(n=>n['@type']==='Article'&&n.mainEntityOfPage===base+filename);
 assert(article,'Indoor play guide Article schema is required');
 assert.equal(article.description,description);
 assert(article.image?.includes(image),'Article image must match the visible lead image');
 assert.equal(article.datePublished,'2026-10-13');
 assert.equal(article.dateModified,'2026-10-19');
}
{
 const filename='school-basketball-bulk-order-rfq-checklist.html';
 const {head,body}=load(filename);
 const title='School Basketball Bulk Order Checklist | MING EAGLE';
 const description='Free RFQ checklist for school PE and district buyers: plan samples, compare silent basketball options and request a written bulk quote.';
 titleAndDescription(filename,title,description);
 const image=base+'assets/hero-flocked-silent-basketball-set.webp?v=20261007-1';
 assert.equal(meta(head,'property','og:image'),image,'School RFQ social image must match the visible product image');
 assert.equal(meta(head,'property','og:image:alt'),'Flocked silent basketball set with mini hoop for school PE sample evaluation');
 assert(/<img\b[^>]*src=["']assets\/hero-flocked-silent-basketball-set\.webp\?v=20261007-1["'][^>]*alt=["']Flocked silent basketball set with mini hoop for school PE sample evaluation["']/.test(body),'School RFQ image must have meaningful alt text');
 const nodes=schemas(head).flatMap(s=>flatten(s));
 const page=nodes.find(n=>n['@type']==='WebPage'&&n.url===base+filename);
 assert(page,'School RFQ WebPage schema is required');
 assert.equal(page.description,description);
 assert.equal(page.primaryImageOfPage?.url,image,'School RFQ schema image must match the visible image');
 assert.equal(page.dateModified,'2026-10-22');
}
{
 const filename='inquiry.html';
 const {head,body}=load(filename);
 const title='Request a Wholesale Quote or Sample | MING EAGLE';
 const description='Request a wholesale quote or sample from MING EAGLE. Share product models, quantities, logo needs and destination for confirmed pricing and shipping options.';
 titleAndDescription(filename,title,description);
 const image=base+'assets/hero-flocked-silent-basketball-set.webp?v=20261007-1';
 assert.equal(meta(head,'property','og:image'),image,'Inquiry page preview must use the real product image');
 const images=[...body.matchAll(/<img\b[^>]*>/gi)].map(m=>m[0]);
 assert.equal(images.length,4,'Inquiry page should keep all four product option images');
 for(const img of images)assert(img.match(/\balt=["']([^"']+)["']/i)?.[1]?.trim(),'Each product option image needs meaningful alt text');
 const nodes=schemas(head).flatMap(s=>flatten(s));
 const page=nodes.find(n=>n['@type']==='WebPage'&&n.url===base+filename);
 assert(page,'Inquiry WebPage schema is required');
 assert.equal(page.description,description);
 assert.equal(page.primaryImageOfPage?.url,image);
 assert.equal(page.dateModified,'2026-10-19');
}

{
 const filename='silent-basketball-bulk-buying-guide.html';
 const {head,body}=load(filename);
 const title='Bulk Silent Basketball Buying Guide | MING EAGLE';
 const description='A purchasing checklist for retailers, schools and coaches ordering silent basketballs: product models, samples, custom logos, packing and shipping quotes.';
 titleAndDescription(filename,title,description);
 const image=base+'assets/hero-flocked-silent-basketball-set.webp?v=20261007-1';
 assert.equal(meta(head,'property','og:image'),image,'Bulk guide social image must use the real product image');
 assert(/<img\b[^>]*src=["']assets\/hero-flocked-silent-basketball-set\.webp\?v=20261007-1["'][^>]*alt=["']Flocked silent basketball set with mini hoop for wholesale sample evaluation["']/.test(body),'Bulk guide image must have meaningful alt text');
 assert(body.includes('src="site.js?v=20261020-i18n-sync2"'),'Bulk guide must use the approved locale bundle cache key');
 const nodes=schemas(head).flatMap(s=>flatten(s));
 const page=nodes.find(n=>n['@type']==='WebPage'&&n.url===base+filename);
 assert(page,'Bulk guide WebPage schema is required');
 assert.equal(page.name,title);
 assert.equal(page.description,description);
 assert.equal(page.dateModified,'2026-10-19');
 assert.equal(page.primaryImageOfPage?.url,image,'Bulk guide schema image must match the visible image');
}


{
 const sitemap=fs.readFileSync(path.join(root,'sitemap.xml'),'utf8');
 const llms=fs.readFileSync(path.join(root,'llms.txt'),'utf8');
 for(const url of [base+'custom-basketball-for-teams.html',base+'silent-basketball-vs-regular.html']){
  assert(sitemap.includes('<loc>'+url+'</loc>'),'Priority guide missing from sitemap: '+url);
  assert(llms.includes(url),'Priority guide missing from llms.txt: '+url);
 }
}

console.log('PASS: priority B2B guide snippets, canonical/social metadata, visible images and matching structured data.');
