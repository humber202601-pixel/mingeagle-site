const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),os=require('node:os'),path=require('node:path');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'direct-rfq-'));
try{
 fs.copyFileSync('public/products.html',path.join(tmp,'products.html'));
 fs.copyFileSync('public/inquiry.html',path.join(tmp,'inquiry.html'));
 const run=()=>cp.execFileSync(process.execPath,['scripts/build-product-direct-rfq.cjs',tmp]);
 run();const first=fs.readFileSync(path.join(tmp,'products.html'),'utf8');run();
 const html=fs.readFileSync(path.join(tmp,'products.html'),'utf8');
 assert.equal(html,first,'Direct RFQ generation must be idempotent');
 const cards=[...html.matchAll(/<article class="pcard">[\s\S]*?<\/article>/gi)].map(x=>x[0]);
 assert.equal(cards.length,4,'Product catalog must contain exactly four verified cards');
 const names=['Flocked Silent Basketball Set','Fabric-Cover Silent Basketball Set','Weighted Flocked Silent Basketball','Flocked Silent Soccer Ball'];
 cards.forEach((card,i)=>{
  assert.equal((card.match(/MING EAGLE DIRECT RFQ BEGIN/g)||[]).length,1);
  const target='inquiry.html?type=quote&amp;product='+encodeURIComponent(names[i]);
  assert(card.includes('href="'+target+'"'),'Direct RFQ must preselect exact approved product');
  assert(card.includes('data-i18n="nav.quote"'),'CTA must remain translatable');
  assert(card.includes('View product'),'product detail destination must remain intact');
  assert(!/token=|amount=|total=/i.test(target),'No bearer tokens, payment amounts or pricing claims');
 });
 console.log('PASS: four product-specific direct RFQ CTAs, translation, idempotence and safe inquiry-only intent.');
}finally{fs.rmSync(tmp,{recursive:true,force:true})}
