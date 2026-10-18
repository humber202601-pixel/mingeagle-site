// Verify user-initiated sharing links, without fabricated social publication.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(process.argv[2]||'public');
const pages=[
 ['school-basketball-bulk-order-rfq-checklist.html','share-school-rfq'],
 ['wholesale-product-catalog.html','wholesale-catalog-share-links']
];
for(const [file,id] of pages){
 const html=fs.readFileSync(path.join(root,file),'utf8');
 const url='https://www.mingeagle.com/'+file;
 const htmlHead=html.split('</head>')[0];
 assert(htmlHead.includes('rel="canonical" href="'+url+'"'),'Canonical missing or wrong '+file);
 assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,'Duplicate/missing share block '+file);
 const marker=html.indexOf('id="'+id+'"');
 assert(marker<html.indexOf('</main>')&&marker>html.indexOf('<main'),'Share controls must appear in main '+file);
 const expectedLinkedIn='https://www.linkedin.com/sharing/share-offsite/?url='+encodeURIComponent(url);
 const link='<a href="'+expectedLinkedIn+'" target="_blank" rel="noopener noreferrer">';
 assert(html.includes(link),'LinkedIn share must open an external user-initiated window with safe rel '+file);
 const links=[...html.matchAll(/href="(mailto:\?subject=[^"]+)"/g)].map(m=>m[1].replace(/&amp;/g,'&'));
 const mail=links.find(x=>x.includes(encodeURIComponent(url)));
 assert(mail,'Share by email must include a real canonical page link '+file);
 const params=new URL(mail.replace(/^mailto:/,'https://example.org/mail')).searchParams;
 assert(params.get('subject')&&params.get('body')?.includes(url),'Email handoff needs readable subject and destination '+file);
 assert(html.includes('href="wholesale-product-facts.csv" download'),'Keep shareable first-party CSV '+file);
 assert(fs.existsSync(path.join(root,'wholesale-product-facts.csv')),'Missing real buyer CSV');
 assert(html.includes('nothing is posted or emailed')||html.includes('never sends messages automatically'),'Share must not imply automatic publication '+file);
}
console.log('PASS: two real procurement resources have user-triggered LinkedIn/email sharing, correct canonical links, existing CSV and no fabricated posts.');
