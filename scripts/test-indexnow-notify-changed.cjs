'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {entries,manifestFromStrings,pickChangedUrls,buildPayload,sourceFiles}=require('./indexnow-notify-changed.cjs');
const base='https://www.mingeagle.com';
const xml=(locs)=>'<?xml version="1.0"?><urlset>'+locs.map(([url,date])=>'<url><loc>'+url+'</loc><lastmod>'+date+'</lastmod></url>').join('')+'</urlset>';
const source=[
 [base+'/', '2026-10-12'],
 [base+'/products.html','2026-10-12'],
 [base+'/silent-basketball.html','2026-10-12'],
 [base+'/quiet-indoor-sports-for-kids.html','2026-10-12'],
 [base+'/school-sports-equipment-de.html','2026-10-12']
];
const old=manifestFromStrings([xml(source.slice(0,4)),xml(source.slice(4))]);
const changed=source.map(([u,d])=>[u,u.includes('products')?'2026-10-13':d]);
changed.push([base+'/school-sports-equipment-fr.html','2026-10-13']);
const now=manifestFromStrings([xml(changed.slice(0,4)),xml(changed.slice(4))]);
assert.equal(old.size,5);assert.equal(now.size,6);
const result=pickChangedUrls(['public/quiet-indoor-sports-for-kids.html','public/sitemap-localized.xml','public/sitemap.xml'],now,old);
assert.deepEqual(result,[base+'/products.html',base+'/quiet-indoor-sports-for-kids.html',base+'/school-sports-equipment-fr.html']);
assert.deepEqual(pickChangedUrls(['docs/AI_DISCOVERY_MEASUREMENT.md','scripts/check-indexnow-key.cjs','public/geo-source-capture.js'],now,old),[],
 'Docs, diagnostics and tracking scripts are not new SEO content');
assert.deepEqual(pickChangedUrls(['public/hello.html','public/private-key.txt'],now,old),[]);
assert.deepEqual(pickChangedUrls(['public/index.html'],now,old),[base+'/']);
const products=pickChangedUrls(['public/product-master.json'],now,old);
assert.deepEqual(products,[base+'/products.html',base+'/silent-basketball.html']);
assert.equal(pickChangedUrls(['scripts/build-seo-v37.cjs'],now,old).length,6);
assert.equal(pickChangedUrls(['public/sitemap-localized.xml'],now,old).length,2,'Date-changed product and newly added translated guide both count as modified');
const payload=buildPayload(result);
assert.equal(payload.host,'www.mingeagle.com');
assert.equal(payload.urlList.length,3);
assert.equal(payload.keyLocation,base+'/'+payload.key+'.txt');
assert.throws(()=>buildPayload([base+'/inquiry.html?token=hidden']),/Invalid IndexNow host/);
assert.throws(()=>buildPayload(['https://www.mingeagle.com.bad.test/private']),/Invalid IndexNow host/);
assert.throws(()=>buildPayload([]),/batch size/);
assert.throws(()=>entries(xml([['https://mingeagle.com/','2026-10-13']])),/Unsafe/);
assert.throws(()=>entries(xml([['https://www.mingeagle.com/private?token=private','2026-10-13']])),/Unsafe/);
assert.throws(()=>entries(xml([source[0],source[0]])),/Duplicate/);
assert.throws(()=>manifestFromStrings([xml([source[0]]),xml([source[0]])]),/duplicated/);
assert.throws(()=>sourceFiles('invalid-sha'),/preceding commit/);
// Verify the real deployment sitemap inventory is unique and stays within safe IndexNow bounds.
const deployed=manifestFromStrings(['public/sitemap.xml','public/sitemap-localized.xml'].map(p=>fs.readFileSync(p,'utf8')));
assert.equal(deployed.size,30,'Exactly 26 public pages + 4 native-language school guides');
for(const uri of deployed.keys()){
 const p=new URL(uri).pathname;
 assert(fs.existsSync(path.join('public',p==='/'?'index.html':p.slice(1))));
}
assert.deepEqual(pickChangedUrls(['scripts/test-indexnow-notify-changed.cjs'],deployed,new Map()),[]);
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'indexnow-notify-check-'));
try{
 const stdout=execFileSync(process.execPath,[path.resolve('scripts/indexnow-notify-changed.cjs')],{
  cwd:folder,encoding:'utf8',env:{...process.env,GITHUB_EVENT_NAME:'workflow_dispatch',INDEXNOW_BEFORE:'',GITHUB_STEP_SUMMARY:''}
 });
 assert.match(stdout,/SKIPPED/);
 const evidence=JSON.parse(fs.readFileSync(path.join(folder,'indexnow-deployment-evidence.json'),'utf8'));
 assert.equal(evidence.status,'SKIPPED');assert.deepEqual(evidence.urls,[]);
}finally{fs.rmSync(folder,{recursive:true,force:true})}
console.log('PASS: IndexNow notices only changed real pages, never private URLs; 29 sitemap assets, safe preview skip, no test network calls or false indexing claims.');
