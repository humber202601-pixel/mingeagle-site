const assert=require('node:assert/strict'),fs=require('node:fs'),
 path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'me-creator-build-py-'));
try{
 const pub=path.join(temp,'public');fs.mkdirSync(pub);
 for(const filename of ['inquiry.html','index.html','custom-logo.css','robots.txt'])
  fs.copyFileSync(path.join('public',filename),path.join(pub,filename));
 const run=()=>cp.execFileSync('python',[path.resolve('scripts/build-conversion.py')],{cwd:temp,encoding:'utf8'});
 run();
 const once=fs.readFileSync(path.join(pub,'inquiry.html'),'utf8');
 for(const file of ['forms-core.js','inquiry.js'])
  assert(once.includes(file+'?v=20261016-b2b-rfq1'),file+' must remain new on inquiry form');
 const direct=fs.readFileSync(path.join(pub,'index.html'),'utf8');
 assert(direct.includes('forms-core.js?v=20261010-turnstile-v30'),
  'Other site pages must retain existing working contact script version');
 run();assert.equal(fs.readFileSync(path.join(pub,'inquiry.html'),'utf8'),once,'Repeated normalizer must not regress cache token');
 console.log('PASS: old contact generator never overwrites creator-journey inquiry JS versions and remains idempotent.');
}finally{fs.rmSync(temp,{recursive:true,force:true})}
