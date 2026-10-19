// Check actual built source after the builders run, never claim an AI ranking.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(process.argv[2]||'public');
const file=name=>fs.readFileSync(path.join(root,name),'utf8');
const sitemap=file('sitemap.xml');
const pages=[
 {file:'custom-basketball-for-teams.html',kind:'Article',marker:'TEAM LOGO BUYER ANSWERS',
 title:'Custom logo silent basketballs for teams and schools',
 h2:'Where can schools and basketball clubs request custom-logo silent basketballs?',
 answers:5,links:['silent-basketball.html','weighted-flocked-basketball.html','fabric-silent-basketball.html','custom-logo.html','inquiry.html?type=quote&amp;customer=business','school-basketball-bulk-order-rfq-checklist.html'],
 evidence:['10 or more units','No universal logo-printing minimum','not certified regulation-match','visual mockup','no independent decibel-reduction']},
 {file:'for-schools.html',kind:'WebPage',marker:'SCHOOL BULK BUYER ANSWERS',
 title:'Basketballs for Schools | Indoor PE Bulk Orders & Samples | MING EAGLE',
 h2:'How should schools choose and order indoor basketballs for PE in bulk?',
 answers:4,links:['custom-basketball-for-teams.html','school-basketball-bulk-order-rfq-checklist.html','procurement.html','inquiry.html?type=quote&amp;customer=school'],
 evidence:['10 or more units','No measured acoustic rating','No government vendor approval']}
];
for(const p of pages){
 const s=file(p.file),head=s.split('</head>')[0];
 const start='<!-- MING EAGLE '+p.marker+' 20261018 BEGIN -->',
  end='<!-- MING EAGLE '+p.marker+' 20261018 END -->';
 assert.equal(s.split(start).length,2,p.file+' must have exactly one buyer answer block');
 assert.equal(s.split(end).length,2);
 const body=s.split(start)[1].split(end)[0];
 assert(s.indexOf(start)<s.indexOf('</main>'),'FAQ must be crawlable in main content');
 assert(body.includes('<h2>'+p.h2+'</h2>'),'Use direct, answered buyer question');
 assert.equal((body.match(/<h3>/g)||[]).length,p.answers,'Each answer must be visible and substantive');
 for(const url of p.links){
  assert(body.includes('href="'+url+'"'),'Internal link or inquiry path missing: '+url);
  if(/^[a-z-]+\.html$/.test(url))assert(fs.existsSync(path.join(root,url)),'Unknown local link '+url);
 }
 for(const claim of p.evidence)assert(body.includes(claim),'Reviewed buyer claim missing: '+claim);
 assert(!/guaranteed delivery|guaranteed noise reduction|official government supplier|independently certified|laboratory certified/i.test(body));
 assert(head.includes('<meta name="robots" content="index,follow')||head.includes('<meta name="robots" content="index,follow'),p.file+' must remain indexable');
 assert(head.includes('rel="canonical" href="https://www.mingeagle.com/'+p.file+'"'));
 const schemas=[...head.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>JSON.parse(m[1]));
 const nodes=schemas.flatMap(x=>x['@graph']||[x]);
 assert(nodes.some(x=>x['@type']===p.kind&&x.dateModified==='2026-10-18'),p.file+' schema must reflect real edit');
 assert(sitemap.includes('<loc>https://www.mingeagle.com/'+p.file+'</loc><lastmod>2026-10-18</lastmod>'),p.file+' sitemap date missing');
 assert(head.includes(p.title)||head.includes(p.title.replace(/&/g,'&amp;')),p.file+' title must explain the relevant buyer intent; production builders escape HTML ampersands');
}
const rootCopy=JSON.parse(fs.readFileSync('admin/learning-copy.json','utf8')).en;
assert.equal(rootCopy['team.0'],'Custom logo silent basketballs for teams and schools');
assert(rootCopy['team.1'].includes('10+ units'));
const seo=fs.readFileSync('scripts/build-seo-v37.cjs','utf8');
assert(seo.includes('School Basketballs for Indoor PE & Bulk Orders | MING EAGLE'));
console.log('PASS: updated school/logo answer-first content, two observed GSC query intents, real internal buyer links, schema/edit dates, no false performance or government claims.');
