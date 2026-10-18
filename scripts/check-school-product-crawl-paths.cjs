// Protect contextual, crawlable links from already indexed school procurement
// resources to the four canonical first-party product specifications.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(process.argv[2]||'public');
const school=fs.readFileSync(path.join(root,'for-schools.html'),'utf8');
const rfq=fs.readFileSync(path.join(root,'school-basketball-bulk-order-rfq-checklist.html'),'utf8');
const sitemap=fs.readFileSync(path.join(root,'sitemap.xml'),'utf8');
const master=JSON.parse(fs.readFileSync(path.join(root,'product-master.json'),'utf8'));
const models=[
 ['p1','silent-basketball.html','Flocked Silent Basketball','Soft-touch flocked basketball set'],
 ['p2','fabric-silent-basketball.html','Fabric-Cover Silent Basketball','Fabric-cover silent basketball set'],
 ['p3','weighted-flocked-basketball.html','Weighted Flocked Silent Basketball','Weighted flocked basketball'],
 ['p4','silent-soccer.html','Flocked Silent Indoor Soccer Ball','Flocked indoor soccer ball']
];
assert.equal(Object.keys(master).length,4);
const table=school.split('<h2>CHOOSE THE RIGHT MODEL FOR THE PROGRAM.</h2>')[1]?.split('</table>')[0];
assert(table,'School product selection table absent');
const source=rfq.split('<h2 id="buyer-fit">1. Match the ball to the activity</h2>')[1]?.split('</section>')[0];
assert(source,'School RFQ choice section absent');
for(const [key,file,schoolLabel,rfqLabel] of models){
 assert(master[key]&&fs.existsSync(path.join(root,file)),'Source model / product file missing: '+key);
 const canonical='https://www.mingeagle.com/'+file;
 assert(sitemap.includes('<loc>'+canonical+'</loc>'),'Detail URL must be in canonical sitemap '+file);
 const detail=fs.readFileSync(path.join(root,file),'utf8');
 assert(detail.split('</head>')[0].includes('rel="canonical" href="'+canonical+'"'),'Detail canonical mismatch '+file);
 assert(table.includes('<a href="'+file+'">'+schoolLabel+'</a>'),'School table must link the model directly '+key);
 const article=source.split('<h3>'+rfqLabel+'</h3>')[1]?.split('</article>')[0];
 assert(article&&article.includes('<a href="'+file+'">Check MING EAGLE\'s published model specifications</a>'),'RFQ must deep-link model context '+key);
 assert(!/price\s*guarantee|certified\s*(?:safe|quiet)|guaranteed\s*silent/i.test(article),'Do not promise untested attributes');
}
assert(school.includes('href="inquiry.html?type=quote"'),'Buyer quote path must remain');
assert(rfq.includes('href="inquiry.html?type=quote&amp;customer=school"'),'School RFQ path must remain');
console.log('PASS: four first-party models directly linked from two indexed school resources, exact www canonicals and unaltered RFQ/quote paths.');
