// Build a neutral, shareable procurement CSV from the published first-party
// product facts. No wholesale prices, endorsements, credentials or unverified
// acoustic claims. CSV is a buyer resource, not evidence of AI citations.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(process.argv.find((x,i)=>i>=2&&!x.startsWith('--'))||'public');
const check=process.argv.includes('--check');
const master=JSON.parse(fs.readFileSync(path.join(root,'product-master.json'),'utf8'));
const facts=JSON.parse(fs.readFileSync(path.join(root,'ai-product-facts.json'),'utf8'));
assert.equal(facts.documentType,'first-party-public-product-facts');
assert.equal(facts.publisher.website,'https://www.mingeagle.com/');
assert.deepEqual(Object.keys(master).sort(),['p1','p2','p3','p4']);
assert.deepEqual(facts.products.map(p=>p.id).sort(),Object.keys(master).sort());
const columns=['product_family_id','product_family','listed_sizes','listed_colors',
 'product_details_url','intended_use','verification_status','commercial_terms'];
const recordFields=(p)=>{
 const m=master[p.id];
 assert(m&&p.name===m.name&&p.colors===m.colors,'Master mismatch '+p.id);
 const sizes=[...m.sizes.matchAll(/No\.\s*(\d+)/g)].map(x=>'No. '+x[1]);
 assert.deepEqual(p.sizes,sizes,'Size mismatch '+p.id);
 assert(/^https:\/\/www\.mingeagle\.com\/[a-z0-9-]+\.html$/.test(p.url),'Invalid product URL');
 assert(fs.existsSync(path.join(root,p.url.split('/').pop())),'Missing published product page');
 assert(typeof p.intendedUse==='string'&&p.intendedUse.length>25);
 return [p.id,p.name,p.sizes.join(' / '),p.colors,p.url,p.intendedUse,
  'First-party published model details; confirm availability and age/activity suitability with seller',
  'Quote required for quantity 10+, pricing, shipment, branding and applicable taxes; no certification or sound-level guarantee'];
};
const csvCell=value=>{
 const s=String(value);
 // Protect buyers opening CSV in spreadsheet software: no formula-starting values.
 assert(!/^[\s]*[=+\-@]/.test(s),'Spreadsheet formula-like field not allowed');
 assert(!/[\u0000-\u001f]/.test(s),'Control character not allowed');
 return '"'+s.replace(/"/g,'""')+'"';
};
const csv=[columns,...facts.products.map(recordFields)]
 .map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
const filename=path.join(root,'wholesale-product-facts.csv');
if(check){
 assert(fs.existsSync(filename),'Built public buyer CSV missing');
 assert.equal(fs.readFileSync(filename,'utf8'),csv,'CSV has drifted from approved product source');
}else fs.writeFileSync(filename,csv,'utf8');
console.log('PASS: four first-party wholesale product families with source-matched sizes/colors, safe CSV, official product links and no invented wholesale prices or claims.');
