const assert=require('node:assert/strict'),fs=require('node:fs'),
 path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const origin=path.resolve('public');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'me-buyer-answers-'));
const files=['products.html','silent-basketball.html','fabric-silent-basketball.html',
 'weighted-flocked-basketball.html','silent-soccer.html'];
const master=JSON.parse(fs.readFileSync(path.join(origin,'product-master.json'),'utf8'));
const prices=JSON.parse(fs.readFileSync(path.join(origin,'retail-prices.json'),'utf8'));
const shipping=JSON.parse(fs.readFileSync(path.join(origin,'us-single-parcel-shipping.json'),'utf8'));
const catalog={p1:files[1],p2:files[2],p3:files[3],p4:files[4]};
try{
 cp.execFileSync(process.execPath,['--check','scripts/build-product-buyer-answers.cjs']);
 for(const name of [...files,'product-master.json','retail-prices.json','us-single-parcel-shipping.json',
  'silent-basketball-for-apartments.html','quiet-indoor-sports-for-kids.html',
  'for-coaches.html','wholesale.html','inquiry.html','retail-cart.html'])
  fs.copyFileSync(path.join(origin,name),path.join(temp,name));
 fs.mkdirSync(path.join(temp,'assets'));
 for(const m of Object.values(master))
  fs.copyFileSync(path.join(origin,m.hero),path.join(temp,m.hero));
 const build=()=>cp.execFileSync(process.execPath,['scripts/build-product-buyer-answers.cjs',temp],{encoding:'utf8'});
 build();
 const first=new Map(files.map(name=>[name,fs.readFileSync(path.join(temp,name),'utf8')]));
 build();
 for(const name of files){
  const html=fs.readFileSync(path.join(temp,name),'utf8');
  assert.equal(html,first.get(name),'Idempotent buyer markup '+name);
  assert.equal(html.split('MING EAGLE VERIFIED BUYER ANSWERS BEGIN').length,2);
  assert.equal(html.split('MING EAGLE SOCIAL PRODUCT PREVIEW BEGIN').length,2);
  assert(html.includes('<section class="buyerAnswers"'));
  assert(html.includes('when the cart confirms payment availability')&&html.includes('Choose your US delivery state at checkout'));
  assert(html.includes('not guaranteed')||html.includes('not guaranteed'));
  const canonical='https://www.mingeagle.com/'+name;
  const head=html.split('</head>')[0];
  assert(head.includes('<meta property="og:url" content="'+canonical+'">'));
  assert(head.includes('<meta name="twitter:card" content="summary_large_image">'));
  assert(head.includes('<meta property="og:image" content="https://www.mingeagle.com/assets/'));
  const shareImages=[...head.matchAll(/property="og:image" content="([^"]+)"/g)];
  assert.equal(shareImages.length,1);
  const file=shareImages[0][1].replace('https://www.mingeagle.com/','');
  assert(fs.existsSync(path.join(temp,file)),'Real product image exists '+name);
  assert(html.indexOf('buyer-product-answers')<html.lastIndexOf('</main>'));
  assert(!/independent laboratory tested|95% quieter|noise reduction \d+ dB|guaranteed delivery/i.test(html));
 }
 for(const [id,name] of Object.entries(catalog)){
  const html=first.get(name),sizes=Object.keys(prices.products[id]);
  assert.equal((html.match(/US one-item estimate/g)||[]).length,sizes.length,
   'All verified sizes have distinct direct purchase-preselection link');
  for(const size of sizes){
   const v=prices.products[id][size]+shipping.productSizeShippingUSD[id][size];
   const total='$'+v.toFixed(2);
   assert(html.includes(name+'?size='+size+'#buy-now'),name+' size selection must be usable');
   assert(html.includes(total+' US one-item estimate'),name+' must use verified product+shipping source');
  }
  assert(!/availability=InStock|aggregateRating|ratingValue|stars out of five/i.test(html));
 }
 const collection=first.get('products.html');
 for(const page of Object.values(catalog))assert(collection.includes('href="'+page+'"'));
 assert(collection.includes('which quiet indoor sports ball')||collection.includes('Which quiet indoor sports ball'));
 console.log('PASS: product collection and all four pages have truthful practical questions, original images, 11 US price + freight static size links, correct canonical social previews and idempotent builds.');
}finally{fs.rmSync(temp,{recursive:true,force:true})}
