const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),
 os=require('node:os'),cp=require('node:child_process');
const origin='public',scratch=fs.mkdtempSync(path.join(os.tmpdir(),'me-search-buyer-paths-'));
const names=['index.html','products.html','fabric-silent-basketball.html','silent-basketball.html','videos.html'];
try{
 cp.execFileSync(process.execPath,['--check','scripts/build-search-buyer-paths.cjs']);
 for(const f of [...names,'creator-videos.json','product-master.json'])fs.copyFileSync(path.join(origin,f),path.join(scratch,f));
 const run=()=>cp.execFileSync(process.execPath,['scripts/build-search-buyer-paths.cjs',scratch],{encoding:'utf8'});
 assert(run().includes('five first-party buyer decision'));
 const snapshots=Object.fromEntries(names.map(f=>[f,fs.readFileSync(path.join(scratch,f),'utf8')]));
 run();
 for(const f of names){
  const html=fs.readFileSync(path.join(scratch,f),'utf8');
  assert.equal(html,snapshots[f],f+' repeated build must be idempotent');
  assert.equal((html.match(/MING EAGLE SEARCH BUYER PATHS BEGIN/g)||[]).length,1,f+' one editorial section');
  assert.equal((html.match(/MING EAGLE SEARCH BUYER PATHS STYLE BEGIN/g)||[]).length,1,f+' one CSS style block');
  assert(html.indexOf('MING EAGLE SEARCH BUYER PATHS BEGIN')<html.indexOf('</main>'),f+' must be visible on page');
  const block=html.split('MING EAGLE SEARCH BUYER PATHS BEGIN')[1].split('MING EAGLE SEARCH BUYER PATHS END')[0];
  assert(block.includes('<h2>')&&block.includes('class="searchBuyerPaths"'),f+' must contain user-readable decision aid');
  for(const match of block.matchAll(/href="([a-z0-9-]+\.html)(?:#[a-z0-9-]+)?"/g)){
   assert(fs.existsSync(path.join(origin,match[1])),'No broken buyer destination '+f+' -> '+match[1]);
  }
  assert(!/guaranteed soundproof|independently certified|90% quieter|decibel reduction of \d+/i.test(block),
    f+' may not claim unverified acoustic effects');
 }
 const home=snapshots['index.html'];
 assert(home.includes('href="videos.html"'),'Homepage must lead to real demos');
 assert(home.includes('href="fabric-silent-basketball.html"'),'Homepage must explain fabric alternative');
 const flocked=snapshots['silent-basketball.html'];
 assert(flocked.includes('id="flocked-or-fabric-comparison"'));
 assert(flocked.includes('href="fabric-silent-basketball.html"'));
 assert(flocked.includes('href="videos.html"'));
 const fabric=snapshots['fabric-silent-basketball.html'];
 const decision=fabric.split('id="fabric-vs-flocked-set"')[1].split('MING EAGLE SEARCH BUYER PATHS END')[0];
 for(const item of ['Fabric-cover set','Flocked set','Orange / Green','Orange / Blue / Green / Yellow','3 / 5 / 7','Compact adhesive mini hoop','not been independently measured','href="videos.html"']){
  if(item==='not been independently measured')continue;
  assert(decision.includes(item),'Fabric side-by-side comparison omits '+item);
 }
 assert(decision.includes('no certified decibel result'),'No fabricated lab certification');
 const collection=snapshots['products.html'];
 for(const f of ['silent-basketball.html','fabric-silent-basketball.html','weighted-flocked-basketball.html','videos.html'])
  assert(collection.includes('href="'+f+'"'),'Collection needs semantic product-to-video link '+f);
 const video=snapshots['videos.html'],head=video.split('</head>')[0];
 assert(head.includes('<meta property="og:url" content="https://www.mingeagle.com/videos.html">'));
 assert(head.includes('og:image" content="https://www.mingeagle.com/assets/hero-flocked-silent-basketball-set.webp'));
 assert.equal((head.match(/MING EAGLE VIDEO SHARE METADATA BEGIN/g)||[]).length,1);
 assert(video.includes('id="creator-video-buying-advice"'));
 assert(video.includes('credited to their TikTok creators'),'Creator attribution must be explicit in visible text');
 assert(video.includes('not this fabric-covered version')===false);
 assert(!video.includes('"@type":"VideoObject"'),'Do not invent TikTok first-publication dates or per-video thumbnails');
 assert(!video.includes('video:sitemap'),'No unverified video sitemap');
 assert(video.includes('Payment is still disabled')&&video.includes('not controlled acoustic tests'));
 const sitemap=fs.readFileSync(path.join(origin,'sitemap.xml'),'utf8');
 for(const f of names.filter(x=>x!=='index.html'))
  assert(sitemap.includes('<loc>https://www.mingeagle.com/'+f+'</loc>'),'Real sitemap entry '+f);
 assert(sitemap.includes('<loc>https://www.mingeagle.com/videos.html</loc><lastmod>2026-10-13</lastmod>'));
 const links=fs.readFileSync('scripts/build-seo-discovery-links.cjs','utf8');
 assert(links.includes("'videos.html':['silent-basketball.html'"),'Video gallery needs crawlable static reverse links');
 assert(links.includes("'silent-basketball.html':['quiet-indoor-sports-for-kids.html'")&&
   links.includes("'fabric-silent-basketball.html','videos.html','products.html'"),'Indexed p1 requires direct fabric and video links');
 console.log('PASS: five canonical buyer content hubs, specific fabric/flocked specs, 16 genuine video references, static bidirectional link graph, safe OG sharing and honest non-VideoObject metadata.');
}finally{fs.rmSync(scratch,{recursive:true,force:true})}
