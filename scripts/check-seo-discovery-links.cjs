const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'seo-discovery-'));
try{
 const names=['index.html','products.html','wholesale.html','learn.html','silent-basketball-guide.html','inquiry.html','fabric-silent-basketball.html','weighted-flocked-basketball.html','silent-soccer.html','silent-basketball-bulk-buying-guide.html'];
 const all=fs.readdirSync('public').filter(x=>x.endsWith('.html'));
 for(const f of all)fs.copyFileSync(path.join('public',f),path.join(tmp,f));
 const go=()=>cp.execFileSync(process.execPath,['scripts/build-seo-discovery-links.cjs',tmp]);
 go();const once=names.map(f=>fs.readFileSync(path.join(tmp,f),'utf8'));go();
 for(let i=0;i<names.length;i++){
  const s=fs.readFileSync(path.join(tmp,names[i]),'utf8');
  assert.equal(s,once[i],names[i]+' should be idempotent');
  assert.equal((s.match(/MING EAGLE SEO DISCOVERY LINKS BEGIN/g)||[]).length,1);
  const part=s.split('MING EAGLE SEO DISCOVERY LINKS BEGIN')[1].split('MING EAGLE SEO DISCOVERY LINKS END')[0];
  const links=[...part.matchAll(/href="([a-z0-9-]+\.html)"/g)].map(x=>x[1]);
  assert(links.length>=3);
  for(const href of links)assert(fs.existsSync(path.join(tmp,href)),href+' must exist');
  assert(!part.includes('target="_blank"'));
 }
 const homepage=once[0];
 for(const f of ['products.html','inquiry.html','weighted-flocked-basketball.html','silent-soccer.html'])assert(homepage.includes('href="'+f+'"'));
 console.log('PASS: linked first-page discovery, no broken destinations or duplicate content, idempotent generation.');
}finally{fs.rmSync(tmp,{recursive:true,force:true})}
