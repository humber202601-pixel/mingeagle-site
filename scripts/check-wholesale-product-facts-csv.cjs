// Public buyer PDF/CSV? Only CSV is exported; this verifies real first-party
// evidence and the four source links. No third-party endorsement is asserted.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const cp=require('node:child_process'),os=require('node:os');
const root=path.resolve('public');
cp.execFileSync(process.execPath,['scripts/build-wholesale-product-facts-csv.cjs','--check'],{stdio:'pipe'});
const csv=fs.readFileSync(path.join(root,'wholesale-product-facts.csv'),'utf8');
assert(csv.endsWith('\r\n'),'CSV must use CRLF line endings');
const lines=csv.trimEnd().split('\r\n');
assert.equal(lines.length,5,'Exactly one header plus four genuine product families');
function parse(line){
 let pos=0;const fields=[];
 while(pos<line.length){
  assert.equal(line[pos],'"','Every CSV cell must be quoted');
  pos++;let value='',closed=false;
  while(pos<line.length){
   if(line[pos]==='"'){
    if(line[pos+1]==='"'){value+='"';pos+=2;continue}
    pos++;closed=true;break;
   }
   value+=line[pos++];
  }
  assert(closed,'Unclosed CSV field');fields.push(value);
  if(pos<line.length){assert.equal(line[pos],',');pos++;}
 }
 return fields;
}
const header=parse(lines[0]);
assert.deepEqual(header,['product_family_id','product_family','listed_sizes','listed_colors',
 'product_details_url','intended_use','verification_status','commercial_terms']);
const master=JSON.parse(fs.readFileSync(path.join(root,'product-master.json'),'utf8'));
const facts=JSON.parse(fs.readFileSync(path.join(root,'ai-product-facts.json'),'utf8'));
const ids=new Set();
for(const line of lines.slice(1)){
 const row=parse(line);assert.equal(row.length,header.length);
 const [id,name,sizes,colors,url,use,proof,terms]=row;
 assert(!ids.has(id),'Duplicate product');ids.add(id);
 const model=master[id],fact=facts.products.find(p=>p.id===id);
 assert(model&&fact,'Unsourced product');
 assert.equal(name,model.name);assert.equal(colors,model.colors);
 assert.equal(sizes,fact.sizes.join(' / '));assert.equal(url,fact.url);assert.equal(use,fact.intendedUse);
 assert(proof.includes('First-party published model'));
 assert(terms.includes('Quote required for quantity 10+'));
 assert(terms.includes('no certification or sound-level guarantee'));
 assert(fs.existsSync(path.join(root,url.split('/').pop())),'Missing product detail file');
}
assert.deepEqual([...ids].sort(),Object.keys(master).sort());
for(const file of ['wholesale-product-catalog.html','for-schools.html','procurement.html','wholesale.html']){
 const s=fs.readFileSync(path.join(root,file),'utf8');
 assert(s.includes('href="wholesale-product-facts.csv"'),'No customer-visible CSV download on '+file);
 assert(s.includes('download'),'Buyer should be able to download CSV from '+file);
 const sitemap=fs.readFileSync(path.join(root,'sitemap.xml'),'utf8');
 assert(sitemap.includes('<loc>https://www.mingeagle.com/'+file+'</loc><lastmod>2026-10-18</lastmod>'),
  'Only evidence-backed changed pages should get fresh sitemap dates: '+file);
}
// Negative fixture: source drift must break publication instead of silently
// giving procurement teams a stale CSV.
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'me-buyer-csv-'));
try{
 for(const f of ['product-master.json','ai-product-facts.json','wholesale-product-facts.csv',
  ...facts.products.map(p=>p.url.split('/').pop())])
  fs.copyFileSync(path.join(root,f),path.join(tmp,f));
 const altered=JSON.parse(fs.readFileSync(path.join(tmp,'product-master.json'),'utf8'));
 altered.p2.colors='Changed / Unsourced';
 fs.writeFileSync(path.join(tmp,'product-master.json'),JSON.stringify(altered));
 assert.throws(()=>cp.execFileSync(process.execPath,
   ['scripts/build-wholesale-product-facts-csv.cjs','--check',tmp],{stdio:'pipe'}));
}finally{fs.rmSync(tmp,{recursive:true,force:true})}
console.log('PASS: four source-matched product families in downloadable CSV, accessible from four purchasing pages, evidence-backed sitemap dates and fail-closed drift checks.');
