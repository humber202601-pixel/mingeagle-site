// Verify a first-party supplier introduction uses only published product facts.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(process.argv[2]||'public');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const intro=read('wholesale-supplier-introduction.txt');
const master=JSON.parse(read('product-master.json'));
const paths={p1:'silent-basketball.html',p2:'fabric-silent-basketball.html',p3:'weighted-flocked-basketball.html',p4:'silent-soccer.html'};
assert.deepEqual(Object.keys(master).sort(),['p1','p2','p3','p4']);
assert(intro.includes('MING EAGLE COMMERCE LLC')&&intro.includes('https://www.mingeagle.com/'));
assert(intro.includes('first-party')||intro.includes('FIRST-PARTY'));
assert(intro.includes('This is supplier-authored background information'));
for(const [key,page] of Object.entries(paths)){
 const p=master[key];
 for(const v of [p.name,p.sizes,p.colors,'https://www.mingeagle.com/'+page]){
  assert(intro.includes(v),'Supplier kit missing first-party value '+key+' / '+v);
 }
 assert(fs.existsSync(path.join(root,page)));
}
for(const x of ['wholesale-product-facts.csv','school-basketball-bulk-order-rfq-checklist.html','inquiry.html']){
 assert(fs.existsSync(path.join(root,x)));
 assert(intro.includes('https://www.mingeagle.com/'+x));
}
for(const s of ['not a delivery promise','not a formal price offer','No independently verified decibel reduction','China-origin direct shipment','10+ units','Stripe','tax']){
 assert(intro.toLowerCase().includes(s.toLowerCase()),'Missing accurate qualification: '+s);
}
assert(!/\b(?:[1-9]\d*)\s*(?:dB|decibels)\b/i.test(intro),'No fabricated measured acoustic performance');
assert(!/\b(?:approved government supplier|certified noise reduction|official school vendor)\b/i.test(intro),'Cannot claim unknown approvals');
for(const page of ['wholesale.html','wholesale-product-catalog.html']){
 const html=read(page);
 assert.equal((html.match(/href="wholesale-supplier-introduction\.txt" download/g)||[]).length,1,'Supplier kit must be linked exactly once from '+page);
 assert(html.indexOf('wholesale-supplier-introduction.txt')<html.indexOf('</main>'),'Download link must appear in page main');
 assert(html.includes('href="inquiry.html?type=quote"')||html.includes('href="inquiry.html?type=quote&amp;'),'Existing quote path must remain '+page);
}
console.log('PASS: first-party vendor introduction grounded in 4 models, download paths and risk disclosures; no invented prices, certifications or approvals.');
