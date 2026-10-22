'use strict';
// This is a truthfulness/availability guard for an OPEN comparison method,
// not evidence that testing, publication by third parties or endorsement occurred.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(process.argv[2]||'public');
const protocol='indoor-ball-sample-comparison-protocol.txt';
const log='indoor-ball-trial-blank.csv';
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const method=read(protocol),csv=read(log),urls=[protocol,log];
assert(method.startsWith('MING EAGLE | CONTROLLED INDOOR BALL SAMPLE COMPARISON'));
for(const phrase of [
 'does not contain product test results',
 'not required',
 'at least three valid repetitions',
 'record only their subjective response',
 'not evidence of code compliance or a certified reduction',
 'Do not include student names',
 'not a test or endorsement'
]){
 assert(method.toLowerCase().includes(phrase.toLowerCase()),'Missing responsible review limitation: '+phrase);
}
for(const source of [
 'https://www.cdc.gov/niosh/topics/noise/app.html',
 'https://www.cdc.gov/niosh/noise/prevent/understand.html',
 'https://acousticstoday.org/wp-content/uploads/2019/10/THE-ACOUSTICS-OF-FLOORS-IN-CONDOMINIUMS-Marshall-Long.pdf'
])assert(method.includes(source),'Missing background source '+source);
const rows=csv.replace(/\r/g,'').trimEnd().split('\n');
const columns=rows[0].split(',');
assert(columns.length>=20,'Missing method/limitations columns');
assert(rows.length>=5,'A reusable trial log needs multiple blank rows');
for(const row of rows.slice(1)){
 const cells=row.split(',');
 assert.equal(cells.length,columns.length,'Every blank log row must have the correct number of fields');
 assert(cells.every(v=>v==='""'),'Do not prefill any result, review, customer data or measured sound value');
}
const guide=read('indoor-school-sports-equipment-guide.html');
const school=read('school-basketball-bulk-order-rfq-checklist.html');
for(const page of [guide,school]){
 for(const resource of urls){
  assert(page.includes('href="'+resource+'" download'),'Free asset link missing from existing procurement guide: '+resource);
 }
 assert(!/([0-9]+[ ]*dB|[0-9]+% quieter)/i.test(page),'No unsupported measured claim on guides');
}
assert(guide.includes('id="reproducible-sample-trial"'),'Existing school guide must show visible protocol summary');
assert(guide.includes('https://www.cdc.gov/niosh/topics/noise/app.html'),'NIOSH source must be linked');
const sitemap=read('sitemap.xml');
for(const page of ['indoor-school-sports-equipment-guide.html','school-basketball-bulk-order-rfq-checklist.html']){
 assert(sitemap.includes('<loc>https://www.mingeagle.com/'+page+'</loc><lastmod>2026-10-22</lastmod>'),'Meaningful page update needs correct lastmod: '+page);
}
for(const resource of urls)assert(!sitemap.includes(resource),'TXT/CSV assets are not indexable HTML buyer pages');
console.log('PASS: Open, reproducible trial protocol and truly blank CSV are linked on two existing buyer guides, with honest evidence limits and sitemap dates.');
