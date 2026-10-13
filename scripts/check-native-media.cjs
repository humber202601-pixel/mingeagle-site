const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),cp=require('node:child_process');
const t=fs.mkdtempSync(path.join(os.tmpdir(),'media-hints-'));
try{
 const files=['index.html','products.html','silent-basketball.html','fabric-silent-basketball.html','weighted-flocked-basketball.html','silent-soccer.html','stories.html'];
 for(const f of files)fs.copyFileSync(path.join('public',f),path.join(t,f));
 const before=files.map(f=>fs.readFileSync(path.join(t,f),'utf8'));
 const run=()=>cp.execFileSync(process.execPath,['scripts/optimize-native-media.cjs',t]);
 run();const once=files.map(f=>fs.readFileSync(path.join(t,f),'utf8'));
 run();const twice=files.map(f=>fs.readFileSync(path.join(t,f),'utf8'));
 assert.deepEqual(twice,once,'native hints must be idempotent');
 files.forEach((f,i)=>{
  const oldTags=[...before[i].matchAll(/<img\b[^>]*>/gi)].map(m=>m[0]);
  const tags=[...once[i].matchAll(/<img\b[^>]*>/gi)].map(m=>m[0]);
  assert.equal(tags.length,oldTags.length);
  for(let j=0;j<tags.length;j++){
   assert(/decoding="async"/.test(tags[j]));
   assert(new RegExp('loading="'+(j===0?'eager':'lazy')+'"').test(tags[j]));
   const strip=x=>x.replace(/\s+loading="(?:eager|lazy)"|\s+decoding="async"/g,'');
   assert.equal(strip(tags[j]),strip(oldTags[j]),'source, alt and layout attrs must be untouched');
  }
 });
 console.log('PASS: eager first image, lazy subsequent images, preserved alt/src, idempotent.');
}finally{fs.rmSync(t,{recursive:true,force:true})}
// Adjacent public-media regression suite runs offline in PR checks as well.
cp.execFileSync(process.execPath,['scripts/check-performance-budget.cjs'],{stdio:'inherit'});
cp.execFileSync(process.execPath,['scripts/test-performance-budget.cjs'],{stdio:'inherit'});
