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
 assert(once.includes('forms-core.js?v=20261019-usstate1'),'forms-core.js must retain its current cache key');
 assert(once.includes('inquiry.js?v=20261022-b2brfq1'),'inquiry.js must refresh after confirmed-lead tracking changes');
 const direct=fs.readFileSync(path.join(pub,'index.html'),'utf8');
 assert(direct.includes('forms-core.js?v=20261010-turnstile-v30'),
  'Other site pages must retain existing working contact script version');
 run();assert.equal(fs.readFileSync(path.join(pub,'inquiry.html'),'utf8'),once,'Repeated normalizer must not regress cache token');
 console.log('PASS: old contact generator never overwrites creator-journey inquiry JS versions and remains idempotent.');
}finally{fs.rmSync(temp,{recursive:true,force:true})}
