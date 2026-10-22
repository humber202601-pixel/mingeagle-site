const assert=require('node:assert/strict'),fs=require('node:fs'),
 os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),vm=require('node:vm');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'me-creator-sales-'));
try{
 for(const p of ['scripts/build-creator-to-product.cjs','public/inquiry.js','public/retail-buy.js','public/forms-core.js'])
  cp.execFileSync(process.execPath,['--check',p]);
 for(const p of ['videos.html','creator-videos.json','product-master.json'])
  fs.copyFileSync('public/'+p,path.join(dir,p));
 const run=()=>cp.execFileSync(process.execPath,['scripts/build-creator-to-product.cjs',dir],{encoding:'utf8'});
 assert(run().includes('16 actual creator clips'));
 const once=fs.readFileSync(path.join(dir,'videos.html'),'utf8');
 run();
 assert.equal(fs.readFileSync(path.join(dir,'videos.html'),'utf8'),once,'Creator CTA builder must be idempotent');
 const videos=JSON.parse(fs.readFileSync('public/creator-videos.json','utf8'));
 const ids=new Set([...once.matchAll(/silent-basketball\.html\?demo=(V0(?:0[1-9]|1[0-6]))#buy-now/g)].map(m=>m[1]));
 assert.equal(ids.size,16,'All 16 actual creator links must reach size/color chooser');
 for(const v of videos.videos){
  assert(ids.has(v.code),v.code+' not linked to exact original video');
  assert(once.includes('/'+v.video_id),'Existing original creator video iframe missing '+v.code);
 }
 assert.equal((once.match(/MING EAGLE VIDEO PURCHASE SUMMARY BEGIN/g)||[]).length,1);
 assert(once.includes('not evidence of viewing or purchase'));
 assert(once.includes('Payment is not yet enabled'));
 assert(!once.includes('See our fabric-cover creator clips'));
 const product=fs.readFileSync('public/silent-basketball.html','utf8');
 const inquiryPage=fs.readFileSync('public/inquiry.html','utf8');
 assert(product.includes('retail-buy.js?v=20261020-scope1'));
 assert(inquiryPage.includes('forms-core.js?v=20261019-usstate1'));
 assert(inquiryPage.includes('inquiry.js?v=20261022-b2brfq1'));
 const buy=fs.readFileSync('public/retail-buy.js','utf8');
 assert(buy.includes('mingeagle_video_to_product_v1'));
 assert(buy.includes("productId==='p1'"),'Other product pages must not inherit demonstration context');
 const inquiry=fs.readFileSync('public/inquiry.js','utf8');
 const begin=inquiry.indexOf('function creatorVideoContext(){');
 const end=inquiry.indexOf('function read(){',begin);
 assert(begin>0&&end>begin);
 const scope=inquiry.slice(begin,end);
 function simulate(snapshot,chosen='p1',now=Date.now()){
  let stored=snapshot;const window={};
  const selected=chosen?[{closest:()=>({dataset:{product:chosen}})}]:[];
  const sandbox={sessionStorage:{
   getItem(){return stored},
   removeItem(){stored=null}
  },Date:{now:()=>now},Number,JSON,form:{querySelectorAll:()=>selected}};
  vm.runInNewContext(scope+'window.code=creatorVideoContext();window.clear=clearCreatorContext;', {...sandbox,window});
  return {code:window.code,clear:window.clear,getStored:()=>stored};
 }
 const t=Date.now(),stored=(code,at)=>JSON.stringify({code,at});
 assert.equal(simulate(stored('V005',t), 'p1',t).code,'V005');
 assert.equal(simulate(stored('V016',t), 'p1',t).code,'V016');
 assert.equal(simulate(stored('V017',t), 'p1',t).code,'');
 assert.equal(simulate(stored('V005',t), 'p2',t).code,'','Do not claim other models have this creator video');
 assert.equal(simulate(stored('V005',t-31*60*1000),'p1',t).code,'','Expired navigation context');
 assert.equal(simulate(stored('V005',t+10),'p1',t).code,'','Future timestamps rejected');
 const cleared=simulate(stored('V005',t),'p1',t);
 cleared.clear();assert.equal(cleared.getStored(),null);
 const core=require('../public/forms-core.js');
 const request={reference:'ME-20261014-0123ABCD',requestType:'Wholesale quote',
  firstname:'Test',email:'example@example.test',message:'Test',creatorVideoCode:'V005'};
 const ctx={pageUri:'https://www.mingeagle.com/inquiry.html',landingPage:'https://www.mingeagle.com/silent-basketball.html',campaign:''};
 assert.equal(core.crmPayload(request,ctx).creatorVideoCode,'V005');
 assert.equal(core.crmPayload({...request,creatorVideoCode:'V017'},ctx).creatorVideoCode,'');
 assert(!JSON.stringify(core.crmPayload(request,ctx)).includes('mingeagle_video_to_product_v1'),
  'Storage key must not be sent to CRM');
 console.log('PASS: 16 curated creator links, one real product, no fake video views, 30-minute/variant scoped handoff, valid customer-submitted CRM code and idempotent build.');
}finally{fs.rmSync(dir,{recursive:true,force:true})}
