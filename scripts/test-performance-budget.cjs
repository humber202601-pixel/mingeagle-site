const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const checker=path.resolve('scripts/check-performance-budget.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mingeagle-asset-budget-'));
const add=(p,n)=>{const full=path.join(root,p);fs.mkdirSync(path.dirname(full),{recursive:true});fs.writeFileSync(full,Buffer.alloc(n,97))};
try{
 for(const name of ['index.html','products.html','inquiry.html','custom-logo.html'])add(name,1000);
 add('assets/hero-flocked-test.webp',200000);
 add('assets/real-highlight-test.webp',200000);
 add('site.js',99000);add('custom-logo-model.js',475000);
 let result=cp.spawnSync(process.execPath,[checker,root],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 add('assets/hero-flocked-test.webp',350000);
 result=cp.spawnSync(process.execPath,[checker,root],{encoding:'utf8'});
 assert.notEqual(result.status,0,'oversize hero asset must fail');
 assert.match(result.stderr,/hero assets\/hero-flocked-test\.webp/);
 add('assets/hero-flocked-test.webp',200000);add('custom-logo-model.js',600000);
 result=cp.spawnSync(process.execPath,[checker,root],{encoding:'utf8'});
 assert.notEqual(result.status,0,'oversize JavaScript must fail');
 assert.match(result.stderr,/custom-logo-model\.js/);
 console.log('PASS: offline performance source budget accepts baseline and blocks oversized hero/JS regressions.');
}finally{fs.rmSync(root,{recursive:true,force:true})}
