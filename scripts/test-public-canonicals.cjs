const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const src='public',tmp=fs.mkdtempSync(path.join(os.tmpdir(),'me-canonical-'));
try{
 const urls=[...fs.readFileSync(path.join(src,'sitemap.xml'),'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(x=>x[1]);
 for(const url of urls){
  const filename=url.replace('https://www.mingeagle.com/','')||'index.html';
  fs.copyFileSync(path.join(src,filename),path.join(tmp,filename));
 }
 for(const filename of ['sitemap.xml','robots.txt'])fs.copyFileSync(path.join(src,filename),path.join(tmp,filename));
 const run=()=>cp.spawnSync(process.execPath,['scripts/check-public-canonicals.cjs',tmp],{encoding:'utf8'});
 let r=run();assert.equal(r.status,0,r.stderr||r.stdout);
 const wholesale=path.join(tmp,'wholesale.html'),initial=fs.readFileSync(wholesale,'utf8');
 fs.writeFileSync(wholesale,initial.replace('href="https://www.mingeagle.com/wholesale.html"','href="https://mingeagle.com/wholesale.html"'));
 r=run();assert.notEqual(r.status,0,'Apex canonical must stop deployment');
 fs.writeFileSync(wholesale,initial);
 const basketball=path.join(tmp,'silent-basketball.html'),p0=fs.readFileSync(basketball,'utf8');
 const jsonLd='<script type="application/ld+json">'+JSON.stringify({'@context':'https://schema.org','@type':'ProductGroup',url:'https://www.mingeagle.com/silent-basketball.html',hasVariant:[{url:'https://www.mingeagle.com/silent-basketball.html',offers:{url:'https://mingeagle.com/silent-basketball.html'}}]})+'</script>';
 fs.writeFileSync(basketball,p0.replace('</head>',jsonLd+'</head>'));
 r=run();assert.notEqual(r.status,0,'Legacy ProductGroup offer URLs must fail');
 fs.writeFileSync(basketball,p0);
 const sitemap=path.join(tmp,'sitemap.xml'),s0=fs.readFileSync(sitemap,'utf8');
 fs.writeFileSync(sitemap,s0.replace('https://www.mingeagle.com/wholesale.html','https://mingeagle.com/wholesale.html'));
 r=run();assert.notEqual(r.status,0,'Apex sitemap URLs must fail');
 fs.writeFileSync(sitemap,s0);
 r=run();assert.equal(r.status,0,r.stderr||r.stdout);
 console.log('PASS: 26-page canonical integrity; apex HTML and offer schema and sitemap drift fail closed; baseline recovers cleanly.');
}finally{fs.rmSync(tmp,{recursive:true,force:true})}
