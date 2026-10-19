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
  const canonical=(s.match(/<link\b[^>]*rel=["']canonical["'][^>]*>/i)||[])[0]?.match(/href=["']([^"']+)/)?.[1];
  assert.equal(canonical,'https://www.mingeagle.com/'+(f==='index.html'?'':f),f+' must never revert from canonical www to apex');
  assert(!s.includes('aggregateRating'),'cannot publish unverified ratings');
  const title=s.match(/<title>([^<]*)<\/title>/i)?.[1]||'';
  assert(title.includes('MING EAGLE')&&title.length>30);
  if(/^(?:silent-basketball|fabric-silent-basketball|weighted-flocked-basketball|silent-soccer)\.html$/.test(f)){
   const description=s.match(/<meta name="description" content="([^"]*)"/i)?.[1]||'';
   const ogTitle=s.match(/<meta property="og:title" content="([^"]*)"/i)?.[1]||null;
   const ogDescription=s.match(/<meta property="og:description" content="([^"]*)"/i)?.[1]||null;
   const twitterTitle=s.match(/<meta name="twitter:title" content="([^"]*)"/i)?.[1]||null;
   const twitterDescription=s.match(/<meta name="twitter:description" content="([^"]*)"/i)?.[1]||null;
   assert(description.length>70&&!description.includes('MING EAGLE sporting goods, quieter indoor play'),f+' needs a unique product description');
   assert.equal(ogTitle,title,f+' Open Graph title must match the generated page title');
   assert.equal(ogDescription,description,f+' Open Graph description must match the generated page description');
   assert.equal(twitterTitle,title,f+' Twitter title must match the generated page title');
   assert.equal(twitterDescription,description,f+' Twitter description must match the generated page description');
   assert.equal((s.match(/<meta\b[^>]*name="robots"/gi)||[]).length,1,f+' must have exactly one robots directive');
  }
  if(/basketball\.html|silent-soccer\.html/.test(f)){
   const block=s.match(/<script type="application\/ld\+json">([^<]*)<\/script>/);
   assert(block,f+' needs grounded schema');
   const obj=JSON.parse(block[1]);assert.equal(obj['@type'],'ProductGroup');
   assert(obj.hasVariant.length>=1);
   assert.equal(obj.url,'https://www.mingeagle.com/'+f,'ProductGroup URL uses official HTTPS www host');
   for(const v of obj.hasVariant){assert(v.offers.price>0);assert.equal(v.offers.priceCurrency,'USD');assert.equal(v.url,obj.url);assert.equal(v.offers.url,obj.url)}
   assert(obj.image.every(i=>/^https:\/\/(?:www\.)?mingeagle\.com\/assets\//.test(i)));
   assert(!obj.aggregateRating);
  }
 }
 const homepage=first['index.html'];
 const organization=JSON.parse(homepage.match(/<script type="application\/ld\+json">([^<]*)<\/script>/)?.[1]||'{}');
 assert.equal(organization['@type'],'Organization');
 assert.equal(organization.name,'MING EAGLE COMMERCE LLC');
 assert(!organization.address,'registered-agent address is not an invented customer-facing premises');
 const accounts=JSON.parse(fs.readFileSync('docs/marketing/brand-accounts.json','utf8')).accounts;
 const profiles=['facebook','pinterest','youtube'].map(network=>accounts.find(a=>a.network===network)?.publicUrl);
 assert(profiles.every(Boolean),'all linked brand profiles must have a recorded public URL');
 assert.deepEqual(organization.sameAs,profiles,'brand schema must use only the three verified official profiles');
 const socialNav=homepage.match(/<nav\b[^>]*id="official-social-profiles"[^>]*>[\s\S]*?<\/nav>/)?.[0];
 assert(socialNav,'homepage needs a visible official-profile follow entry');
 const socialLinks=[...socialNav.matchAll(/<a\b([^>]+)>/g)];
 assert.deepEqual(socialLinks.map(m=>m[1].match(/href="([^"]+)"/)?.[1]),profiles);
 for(const [,attrs] of socialLinks){assert(/target="_blank"/.test(attrs));assert(/rel="noopener noreferrer"/.test(attrs));}
 // Each acquisition page must retain exactly one identical follow navigation.
 for(const f of files){
  const navs=[...first[f].matchAll(/<nav\b[^>]*id="official-social-profiles"[^>]*>[\s\S]*?<\/nav>/g)];
  assert.equal(navs.length,1,f+' must have exactly one social navigation');
  assert.equal(navs[0][0],socialNav,f+' must use the reviewed official account links');
  assert(first[f].includes('styles.css?v=20261015-social2'),f+' must load current follow-button styles');
 }
 const productFooter=first['weighted-flocked-basketball.html'].match(/<footer\b[\s\S]*?<\/footer>/)?.[0]||'';
 assert(productFooter.includes('product=Weighted%20Flocked%20Silent%20Basketball'),'adding follow links must preserve product-specific quote attribution');
 assert(/Wholesale/.test(first['wholesale.html'])&&/Academies/.test(first['for-coaches.html']));
 const sitemap=fs.readFileSync('public/sitemap.xml','utf8');
 const robots=fs.readFileSync('public/robots.txt','utf8');
 assert(robots.includes('Sitemap: https://www.mingeagle.com/sitemap.xml'));
 for(const f of files)assert(sitemap.includes(f==='index.html'?'https://www.mingeagle.com/':'https://www.mingeagle.com/'+f),'sitemap must include '+f);
 console.log('PASS: nine real website pages SEO metadata, five factual JSON-LD records, stable build, existing canonical/sitemap, real supplied prices and no invented reviews or false US physical office.');
}finally{fs.rmSync(tmp,{recursive:true,force:true})}
