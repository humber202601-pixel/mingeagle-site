const assert=require('node:assert/strict'),fs=require('node:fs');
const pages={
 'products.html':['Compare Quiet Indoor Basketball Sets & Soccer Balls','fabric-silent-basketball.html','Compare the actual indoor-play models'],
 'fabric-silent-basketball.html':['Fabric-Cover Soft Silent Basketball & Mini Hoop Set','silent-basketball.html','What is different about the fabric-cover ball?'],
 'videos.html':['16 Real Flocked Silent Basketball Creator Videos','silent-basketball.html','What do the creator demonstrations actually show?']
};
const headDescriptions=new Set();
for(const [filename,[title,dest,heading]] of Object.entries(pages)){
 const s=fs.readFileSync('public/'+filename,'utf8');
 const head=s.split('</head>')[0];
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
const fabric=fs.readFileSync('public/fabric-silent-basketball.html','utf8');
assert(fabric.includes('orange or green in sizes 3, 5 and 7'));

for(const [filename,url,title] of [
 ['wholesale.html','https://www.mingeagle.com/wholesale.html','Wholesale Sports Equipment for Schools, Institutions & Business | MING EAGLE'],
 ['procurement.html','https://www.mingeagle.com/procurement.html','Institutional & Public-Sector Sports Equipment Procurement | MING EAGLE']
]){
 const html=fs.readFileSync('public/'+filename,'utf8'),head=html.split('</head>')[0];
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

console.log('PASS: three page-specific titles, unique descriptions, crawlable model links and truthful video limitations.');
