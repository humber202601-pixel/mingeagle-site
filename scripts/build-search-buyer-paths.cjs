// On-page editorial paths connecting the already indexed flocked set
// to less-discovered, distinct buyer pages. No ranking, sale or video claims.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||'public'),base='https://www.mingeagle.com/';
const models=JSON.parse(fs.readFileSync(path.join(root,'product-master.json'),'utf8'));
const videos=JSON.parse(fs.readFileSync(path.join(root,'creator-videos.json'),'utf8'));
assert.equal(videos.video_count,16);
assert.equal(videos.product,models.p1.name);
assert.equal(new Set(videos.videos.map(v=>v.creator)).size,6);
const namedPages=['index.html','products.html','fabric-silent-basketball.html','silent-basketball.html','videos.html'];
for(const p of namedPages)assert(fs.existsSync(path.join(root,p)),p+' missing');
const start='<!-- MING EAGLE SEARCH BUYER PATHS BEGIN -->',end='<!-- MING EAGLE SEARCH BUYER PATHS END -->';
const headStart='<!-- MING EAGLE VIDEO SHARE METADATA BEGIN -->',headEnd='<!-- MING EAGLE VIDEO SHARE METADATA END -->';
const baseStyle='<style>.searchBuyerPaths{padding:27px 0;background:#f7fafc;border-block:1px solid #e2e8f0;color:#17324c}.searchBuyerPaths .wrap{max-width:1100px}.searchBuyerPaths h2{font-size:clamp(21px,3vw,30px);line-height:1.3;margin:0 0 9px}.searchBuyerPaths p{font-size:14px;line-height:1.7;color:#475569;max-width:930px}.searchBuyerPaths .searchBuyerGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:17px}.searchBuyerPaths article{padding:16px;border:1px solid #dce4ed;border-radius:10px;background:white}.searchBuyerPaths article h3{margin:0 0 8px;font-size:17px}.searchBuyerPaths article p{font-size:13px;margin:0 0 9px}.searchBuyerPaths a{color:#17628c;font-weight:750;text-decoration:underline;text-underline-offset:3px}.searchBuyerPaths table{border-collapse:collapse;width:100%;min-width:430px;font-size:13px;text-align:left}.searchBuyerPaths th,.searchBuyerPaths td{padding:12px 13px;border:1px solid #dce4ed;vertical-align:top}.searchBuyerPaths th{background:#e8f1fa}.searchBuyerPaths .searchCompareScroller{max-width:100%;overflow:auto;margin:15px 0}.searchBuyerPaths .searchDisclaim{font-size:12px;color:#556778;margin-top:13px}@media(max-width:600px){.searchBuyerPaths{padding:22px 0}.searchBuyerPaths .wrap{padding-inline:16px}}</style>';
function clear(html,begin,finish){
 const a=html.includes(begin),b=html.includes(finish);
 assert.equal(a,b,'Partly present authored section '+begin);
 if(!a)return html;
 const from=html.indexOf(begin),to=html.indexOf(finish,from);
 assert(to>from,'Missing end marker');
 return html.slice(0,from)+html.slice(to+finish.length);
}
const shell=(id,title,intro,body)=>start+'<section class="searchBuyerPaths" id="'+id+'" lang="en"><div class="wrap"><h2>'+title+'</h2><p>'+intro+'</p>'+body+'</div></section>'+end;
const link=(href,description)=>'<a href="'+href+'">'+description+'</a>';
const cards=items=>'<div class="searchBuyerGrid">'+items.map(([title,body,dest,cta])=>
 '<article><h3>'+title+'</h3><p>'+body+'</p>'+link(dest,cta)+'</article>').join('')+'</div>';
const entries={
 'index.html':shell('real-indoor-product-demos','Compare real indoor-play products and creator demonstrations',
  'MING EAGLE offers distinct flocked and fabric-covered soft basketball sets, a weighted-feel practice model and indoor soccer. See the full specs before choosing.',
  cards([
   ['Compare all four models','Side-by-side product specifications and direct size/color selectors.', 'products.html','Compare indoor sports balls →'],
   ['See actual creator clips','16 third-party TikTok posts from six creators demonstrate the flocked basketball set only. They do not establish a tested decibel reduction.', 'videos.html','Open the creator video gallery →'],
   ['Looking for a fabric cover?','View the fabric-covered basketball and matching mini hoop in orange or green; not the same model as the video demonstrations.', 'fabric-silent-basketball.html','View fabric-cover set →']
  ])),
 'silent-basketball.html':shell('flocked-or-fabric-comparison','Flocked or fabric-covered silent basketball? See the difference.',
  'Both indoor ball sets include an adhesive mini hoop and come in sizes 3, 5 and 7. The flocked model is offered in four colors; the fabric-cover model offers orange and green. Neither can eliminate footstep noise or floor vibration.',
  cards([
   ['Compare the fabric-cover version','Its textile-style outer covering changes the surface feel. Sound improvement versus the flocked model has not been independently measured.', 'fabric-silent-basketball.html','Explore the fabric-covered set →'],
   ['Watch the actual flocked set','16 embedded TikTok creator clips are attributed to their original accounts. These show the flocked ball, not every product in the catalog.', 'videos.html','Watch flocked-set demonstrations →'],
   ['Compare all four models','Check hoop contents, sizes, colors and the corresponding buying process.', 'products.html','View all model specifications →']
  ])),
 'fabric-silent-basketball.html':shell('fabric-vs-flocked-set','Fabric cover vs flocked: choose by texture, colors and intended play.',
  'Two different soft, non-inflatable basketball-and-hoop sets are available. The key verified difference is the outer covering, not a proven acoustic rating.',
  '<div class="searchCompareScroller"><table><thead><tr><th>What matters</th><th>Fabric-cover set</th><th>Flocked set</th></tr></thead><tbody>'+
  '<tr><th>Touch and construction</th><td>Fabric-covered soft foam</td><td>Soft flocked foam surface</td></tr>'+
  '<tr><th>Ball sizes</th><td>3 / 5 / 7</td><td>3 / 5 / 7</td></tr>'+
  '<tr><th>Confirmed colors</th><td>Orange / Green</td><td>Orange / Blue / Green / Yellow</td></tr>'+
  '<tr><th>Included hoop</th><td>Compact adhesive mini hoop</td><td>Compact adhesive mini hoop</td></tr>'+
  '<tr><th>Noise claims</th><td>Quiet-touch, no certified decibel result</td><td>Quiet-touch, no certified decibel result</td></tr>'+
  '</tbody></table></div>'+
  '<p>Choose '+link('silent-basketball.html','the original flocked basketball set')+' to compare colors or '+link('products.html','all four distinct indoor ball models')+' to review alternatives. The '+link('videos.html','creator video gallery')+' demonstrates the flocked model only, not this fabric-covered version.</p>'+
  '<p class="searchDisclaim">The ball cannot remove walking, repeated bouncing or building-transmitted impact noise. Product choice should also consider mounting suitability and the room surface.</p>'),
 'products.html':shell('indoor-ball-selection-guide','Which indoor basketball set works for your family or program?',
  'Choose by real features instead of an unsupported claim that one soft ball is completely silent. Our basketball mini-hoop sets differ in surface feel and color options.',
  cards([
   ['For an apartment household','Compare the flocked foam ball and its included compact adhesive hoop. Controlled shooting games are generally more appropriate than hard floor bouncing.', 'silent-basketball.html','Flocked set details →'],
   ['For a different surface feel','Choose the fabric-covered soft foam ball and mini hoop in orange or green. We do not have comparative sound laboratory data.', 'fabric-silent-basketball.html','Fabric-cover set details →'],
   ['For training-style handling','Evaluate the weighted-feel ball with a coach before ordering, as it does not behave like an inflated regulation ball.', 'weighted-flocked-basketball.html','Weighted training ball →'],
   ['To see an existing product demonstrated','Original TikTok creators show the flocked set. Check each creator and the exact featured model, not generic demonstration claims.', 'videos.html','Real creator video gallery →']
  ])),
 'videos.html':shell('creator-video-buying-advice','What do these real TikTok videos actually demonstrate?',
  'All 16 curated posts are associated with the flocked silent basketball set and its compact hoop. These clips are creator content, not controlled acoustic tests, independent safety certification or evidence of customer purchase.',
  cards([
   ['Shop the demonstrated model','Select size 3, 5 or 7 and one of four confirmed colors before the cart or quote step. Online payment is still disabled.', 'silent-basketball.html#buy-now','Choose the flocked set →'],
   ['A different ball with a fabric cover','This alternative has a different surface feel and two confirmed colors. We do not claim these creator clips show the fabric-cover model.', 'fabric-silent-basketball.html','Review the fabric model →'],
   ['Comparing all indoor models','Check what each model includes and read realistic noise and shipping limitations before buying.', 'products.html','See all four products →']
  ])+
  '<p class="searchDisclaim">The video clips are hosted by and credited to their TikTok creators. Publication dates, per-video original thumbnails, watch counts and audio measurements are not independently verified by this site. We do not advertise this gallery as a Google video-rich-result watch page.</p>')
};
function inject(filename,block){
 const file=path.join(root,filename);
 let html=fs.readFileSync(file,'utf8');
 html=clear(html,start,end);
 assert(html.includes('<main')&&html.includes('</main>')&&html.includes('</head>'),filename+' invalid landmarks');
 const begin=html.indexOf('<main'),stop=html.indexOf('</section>',begin);
 assert(stop>begin&&stop<html.indexOf('</main>'),'Missing first hero section '+filename);
 html=html.slice(0,stop+'</section>'.length)+block+html.slice(stop+'</section>'.length);
 if(!html.includes('<!-- MING EAGLE SEARCH BUYER PATHS STYLE BEGIN -->')){
  html=html.replace('</head>','<!-- MING EAGLE SEARCH BUYER PATHS STYLE BEGIN -->'+baseStyle+'<!-- MING EAGLE SEARCH BUYER PATHS STYLE END --></head>');
 }
 if(filename==='videos.html'){
  html=clear(html,headStart,headEnd);
  // A truthful share preview is useful without manufacturing VideoObject's
  // required per-video publication dates, thumbnails or media bytes.
  const social=headStart+
   '<meta property="og:type" content="website">'+
   '<meta property="og:site_name" content="MING EAGLE">'+
   '<meta property="og:title" content="Real Flocked Silent Basketball Creator Videos | MING EAGLE">'+
   '<meta property="og:description" content="16 TikTok creator demonstrations of the Flocked Silent Basketball Set, attributed to six original creator accounts. See the exact model and hoop set.">'+
   '<meta property="og:url" content="'+base+'videos.html">'+
   '<meta property="og:image" content="'+base+models.p1.hero+'">'+
   '<meta property="og:image:alt" content="MING EAGLE Flocked Silent Basketball Set product image">'+
   '<meta name="twitter:card" content="summary_large_image">'+
   '<meta name="twitter:image" content="'+base+models.p1.hero+'">'+headEnd;
  html=html.replace('</head>',social+'</head>');
 }
 fs.writeFileSync(file,html);
}
for(const [file,block] of Object.entries(entries))inject(file,block);
console.log('PASS: five first-party buyer decision/navigation sections, 16 real creator context and a non-invented video-page social preview; no VideoObject without evidence.');
