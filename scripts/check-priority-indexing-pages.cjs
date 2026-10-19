const assert=require('node:assert/strict'),fs=require('node:fs');
function assertSearchSnippetLength(filename,head){
 const title=(head.match(/<title(?:\\s[^>]*)?>([\\s\\S]*?)<\\/title>/i)?.[1]||'').replace(/&amp;/g,'&').trim();
 const description=(head.match(/<meta\\b(?=[^>]*\\bname=["']description["'])[^>]*\\bcontent=["']([^"']*)["']/i)?.[1]||'').replace(/&amp;/g,'&').trim();
 assert(title.length>0&&title.length<=60,filename+' title should be 1–60 characters; got '+title.length);
 assert(description.length>0&&description.length<=160,filename+' meta description should be 1–160 characters; got '+description.length);
}
const pages={
 'products.html':['Quiet Basketball Sets & Indoor Soccer Balls','fabric-silent-basketball.html','Compare the actual indoor-play models'],
 'fabric-silent-basketball.html':['Fabric-Cover Silent Basketball Set & Mini Hoop','silent-basketball.html','What is different about the fabric-cover ball?'],
 'videos.html':['16 Silent Basketball Creator Videos','silent-basketball.html','What do the creator demonstrations actually show?']
};
const headDescriptions=new Set();
for(const [filename,[title,dest,heading]] of Object.entries(pages)){
 const s=fs.readFileSync('public/'+filename,'utf8');
 const head=s.split('</head>')[0];
 assertSearchSnippetLength(filename,head);
 const encodedTitle=title.replace(/&/g,'&amp;');
 assert(head.includes('<title>'+title+' | MING EAGLE</title>')||head.includes('<title>'+encodedTitle+' | MING EAGLE</title>'),filename+' needs unique title');
 const desc=head.match(/<meta[^>]*name="description"[^>]*>/)?.[0];
 assert(desc&&desc.includes('content=')&&!desc.includes('sporting goods, quieter indoor play, wholesale and community stories'),filename+' must have relevant description');
 headDescriptions.add(desc);
 assert(s.includes('rel="canonical" href="https://www.mingeagle.com/'+filename+'"'));
 assert(s.includes('<!-- MING EAGLE PRIORITY BUYER CONTEXT -->'));
 assert(s.includes('<h2>'+heading+'</h2>'));
 assert(s.includes('href="'+dest+'"'));
 assert(s.includes('No independent laboratory sound measurements'));
 assert(s.indexOf('PRIORITY BUYER CONTEXT')<s.lastIndexOf('</main>'));
}
assert.equal(headDescriptions.size,3);
const video=fs.readFileSync('public/videos.html','utf8');
assert(video.includes('16 creator clips')||video.includes('six creators'));
assert(video.includes('TikTok')&&video.includes('show the flocked foam basketball'));
assert(!/"@type"\s*:\s*"VideoObject"/.test(video),'Do not invent per-video structured data without stable metadata');
const catalog=fs.readFileSync('public/products.html','utf8');
for(const model of ['silent-basketball.html','fabric-silent-basketball.html','weighted-flocked-basketball.html','silent-soccer.html'])assert(catalog.includes('href="'+model+'"'),'Catalog must link each model');
const wholesaleCatalog=fs.readFileSync('public/wholesale-product-catalog.html','utf8');
const wholesaleCatalogHead=wholesaleCatalog.split('</head>')[0];
assert(wholesaleCatalogHead.includes('<title>Silent Ball Wholesale Catalog &amp; Specs | MING EAGLE</title>'),'wholesale product catalog needs concise title');
assertSearchSnippetLength('wholesale-product-catalog.html',wholesaleCatalogHead);
const fabric=fs.readFileSync('public/fabric-silent-basketball.html','utf8');
assert(fabric.includes('orange or green in sizes 3, 5 and 7'));


for(const [filename,url,title] of [
 ['wholesale.html','https://www.mingeagle.com/wholesale.html','Wholesale Sports Equipment for Schools, Institutions & Business | MING EAGLE'],
 ['procurement.html','https://www.mingeagle.com/procurement.html','Institutional Sports Equipment Procurement | MING EAGLE']
]){
 const html=fs.readFileSync('public/'+filename,'utf8'),head=html.split('</head>')[0];
 assertSearchSnippetLength(filename,head);
 assert.equal((head.match(/<meta[^>]*name="robots"/g)||[]).length,1,filename+' must have one robots directive');
 assert(head.includes('<meta name="description" content="'),filename+' needs a page-specific meta description');
 assert(head.includes('<meta property="og:title"'),filename+' needs Open Graph title');
 assert(head.includes('<meta property="og:description"'),filename+' needs Open Graph description');
 assert(head.includes('<meta property="og:url" content="'+url+'"'),filename+' needs canonical Open Graph URL');
 const blocks=[...head.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
 const graph=blocks.map(x=>JSON.parse(x[1])).flatMap(x=>x['@graph']||[x]);
 assert(graph.some(x=>x['@type']==='WebPage'&&x.url===url&&x.name===title),filename+' needs page-specific WebPage schema');
 const crumb=graph.find(x=>x['@type']==='BreadcrumbList'&&x['@id']===url+'#breadcrumb');
 assert(crumb&&crumb.itemListElement?.length===2,filename+' needs a two-step canonical breadcrumb');
 assert(graph.some(x=>x['@type']==='Organization'&&x.url==='https://www.mingeagle.com/'),filename+' needs the verified brand organization entity');
}
const productMeta=[
 ['silent-basketball.html','https://www.mingeagle.com/silent-basketball.html','Flocked Silent Basketball Set with Mini Hoop | MING EAGLE',"Explore MING EAGLE's flocked basketball set for quieter indoor practice, with sizes 3, 5 and 7. Compare colors, mini-hoop details, sample shipping and bulk quotes."],
 ['fabric-silent-basketball.html','https://www.mingeagle.com/fabric-silent-basketball.html','Fabric-Cover Silent Basketball Set & Mini Hoop | MING EAGLE','Explore a fabric-cover silent basketball set with adhesive mini hoop. Sizes 3, 5 and 7 in orange or green; compare the surface and request a quote.'],
 ['weighted-flocked-basketball.html','https://www.mingeagle.com/weighted-flocked-basketball.html','Weighted Silent Basketball for Indoor Drills | MING EAGLE',"Explore the weighted flocked basketball for indoor practice in sizes 3, 4, 6 and 7. Compare colors, product details and wholesale quote options."],
 ['silent-soccer.html','https://www.mingeagle.com/silent-soccer.html','Flocked Silent Soccer Ball for Indoor Play | MING EAGLE',"Size 5 flocked indoor soccer ball for quieter small-space footwork. Explore five colorways, product details, sample shipping and institutional quotes."]
];
for(const [filename,url,title,description] of productMeta){
 const head=fs.readFileSync('public/'+filename,'utf8').split('</head>')[0];
 assertSearchSnippetLength(filename,head);
 assert(head.includes('<meta name="description" content="'+description.replace(/&/g,'&amp;')+'"')||head.includes('<meta name="description" content="'+description+'"'),filename+' needs a unique source description');
 assert(!head.includes('MING EAGLE sporting goods, quieter indoor play, wholesale and community stories.'),filename+' must not use the generic site description');
 assert.equal((head.match(/<meta[^>]*name="robots"/g)||[]).length,1,filename+' must have exactly one index directive');
 assert(head.includes('<meta property="og:title"'),filename+' needs an Open Graph title');
 assert(head.includes('<meta property="og:description"'),filename+' needs an Open Graph description');
 assert(head.includes('<meta property="og:url" content="'+url+'"'),filename+' OG URL must match canonical');
 assert(head.includes('<meta name="twitter:title"'),filename+' needs a Twitter title');
 assert(head.includes('<meta name="twitter:description"'),filename+' needs a Twitter description');
}

for(const filename of ['for-coaches.html','for-schools.html']){
 const head=fs.readFileSync('public/'+filename,'utf8').split('</head>')[0];
 assertSearchSnippetLength(filename,head);
}
console.log('PASS: buyer-guide and product-page metadata, structured data, crawlable model links and truthful video limitations.');
