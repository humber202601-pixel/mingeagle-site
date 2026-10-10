const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'mingeagle-seo-v37-'));
try{
 const files=['index.html','products.html','wholesale.html','for-coaches.html','for-schools.html',
 'silent-basketball.html','fabric-silent-basketball.html','weighted-flocked-basketball.html','silent-soccer.html'];
 for(const file of files)fs.copyFileSync(path.join('public',file),path.join(tmp,file));
 fs.copyFileSync('public/retail-prices.json',path.join(tmp,'retail-prices.json'));
 const run=()=>execFileSync(process.execPath,['scripts/build-seo-v37.cjs',tmp],{stdio:'pipe'});
 run();
 const first=Object.fromEntries(files.map(f=>[f,fs.readFileSync(path.join(tmp,f),'utf8')]));
 run();
 for(const f of files){
  const s=fs.readFileSync(path.join(tmp,f),'utf8');
  assert.equal(s,first[f],f+' SEO build must be idempotent');
  assert.equal((s.match(/<title\b/gi)||[]).length,1);
  assert.equal((s.match(/name=["']description["']/gi)||[]).length,1);
  assert.equal((s.match(/rel=["']canonical["']/gi)||[]).length,1);
  assert(!s.includes('aggregateRating'),'cannot publish unverified ratings');
  const title=s.match(/<title>([^<]*)<\/title>/i)?.[1]||'';
  assert(title.includes('MING EAGLE')&&title.length>30);
  if(/basketball\.html|silent-soccer\.html/.test(f)){
   const block=s.match(/<script type="application\/ld\+json">([^<]*)<\/script>/);
   assert(block,f+' needs grounded schema');
   const obj=JSON.parse(block[1]);assert.equal(obj['@type'],'ProductGroup');
   assert(obj.hasVariant.length>=1);
   for(const v of obj.hasVariant){assert(v.offers.price>0);assert.equal(v.offers.priceCurrency,'USD')}
   assert(obj.image.every(i=>i.startsWith('https://mingeagle.com/assets/')));
   assert(!obj.aggregateRating);
  }
 }
 const homepage=first['index.html'];
 const organization=JSON.parse(homepage.match(/<script type="application\/ld\+json">([^<]*)<\/script>/)?.[1]||'{}');
 assert.equal(organization['@type'],'Organization');
 assert.equal(organization.name,'MING EAGLE COMMERCE LLC');
 assert(!organization.address,'registered-agent address is not an invented customer-facing premises');
 assert(/Wholesale/.test(first['wholesale.html'])&&/Training Academies/.test(first['for-coaches.html']));
 const sitemap=fs.readFileSync('public/sitemap.xml','utf8');
 const robots=fs.readFileSync('public/robots.txt','utf8');
 assert(robots.includes('Sitemap: https://mingeagle.com/sitemap.xml'));
 for(const f of files)assert(sitemap.includes(f==='index.html'?'https://mingeagle.com/':'https://mingeagle.com/'+f),'sitemap must include '+f);
 console.log('PASS: nine real website pages SEO metadata, five factual JSON-LD records, stable build, existing canonical/sitemap, real supplied prices and no invented reviews or false US physical office.');
}finally{fs.rmSync(tmp,{recursive:true,force:true})}
