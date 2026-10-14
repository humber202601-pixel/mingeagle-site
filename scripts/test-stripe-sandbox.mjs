import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
async function load(path){
 const bundled=await build({entryPoints:[path],bundle:true,write:false,
  platform:'node',format:'esm',target:'es2022',logLevel:'silent'});
 return import('data:text/javascript;base64,'+
  Buffer.from(bundled.outputFiles[0].text).toString('base64'));
}
const {onRequestPost:handler}=await load('functions/api/payments/stripe/sandbox.ts');
const {onRequest:middleware}=await load('functions/_middleware.ts');
// Run the actual Pages middleware and handler together: a handler-only test
// missed the preview allowlist that prevented all real sandbox button clicks.
const onRequestPost=({request,env})=>middleware({request,env,
 next:()=>handler({request,env})});
const base='https://fix-preview.mingeagle-site.pages.dev';
const token='p'.repeat(48);
const env={TEST_ENVIRONMENT:'preview',STRIPE_MODE:'test',
 STRIPE_SANDBOX_ENABLED:'true',STRIPE_SECRET_KEY:'sk_test_synthetic_for_ci_only',
 STRIPE_SANDBOX_ACCESS_TOKEN:token};
const request=(sku='P1-S3',provided=token,origin=base,headers={})=>
 new Request(base+'/api/payments/stripe/sandbox',{method:'POST',
 headers:{'content-type':'application/json','origin':origin,
 'x-mingeagle-sandbox-token':provided,...headers},body:JSON.stringify({sku})});
const saved=globalThis.fetch;
let network=0;
try{
 globalThis.fetch=async()=>{network++;throw Error('A closed sandbox must never call Stripe')};
 for(const [path,method] of [
  ['/api/payments/stripe/create','POST'],
  ['/api/payments/stripe/webhook','POST'],
  ['/api/retail/checkout','POST'],
  ['/api/payments/stripe/sandbox','DELETE'],
  ['/api/payments/stripe/sandbox/extra','POST'],
 ]){
  const blocked=await middleware({env,request:new Request(base+path,{method}),
   next:()=>{throw Error('Unrelated preview mutation reached its handler')}});
  assert.equal(blocked.status,403);
  assert.equal((await blocked.json()).code,'PREVIEW_OPERATION_DISABLED');
 }
 for(const [testEnv,reason] of [
  [{...env,TEST_ENVIRONMENT:''},'no preview marker'],
  [{...env,STRIPE_MODE:'live',STRIPE_SECRET_KEY:'rk_live_synthetic'},'live mode'],
  [{...env,STRIPE_SECRET_KEY:'rk_live_synthetic'},'live key'],
  [{...env,STRIPE_SANDBOX_ENABLED:'false'},'disabled'],
  [{...env,STRIPE_SECRET_KEY:''},'missing key'],
  [{...env,STRIPE_SANDBOX_ACCESS_TOKEN:''},'missing admin token'],
 ]){
  const res=await onRequestPost({request:request(),env:testEnv});
  assert([404,503].includes(res.status),reason);
 }
 assert.equal((await onRequestPost({request:new Request('https://app.mingeagle.com/api/payments/stripe/sandbox',{
  method:'POST',headers:{origin:'https://app.mingeagle.com','content-type':'application/json',
   'x-mingeagle-sandbox-token':token},body:JSON.stringify({sku:'P1-S3'})}),env})).status,404,
  'Production hostname must never create a test-session exception');
 assert.equal((await onRequestPost({request:request('P1-S3','bad'),env})).status,403);
 assert.equal((await onRequestPost({request:request('P1-S3',token,'https://evil.example'),env})).status,403);
 assert.equal((await onRequestPost({request:request('P1-S5'),env})).status,400,
  'Unapproved DDP size must not create even test session');
 assert.equal((await onRequestPost({request:request('P1-S3',token,base,
  {'content-type':'text/plain'}),env})).status,415);
 assert.equal(network,0,'All disabled or malicious cases must stay offline');

 let override=null;
 globalThis.fetch=async(url,init)=>{
  network++;
  assert.equal(url,'https://api.stripe.com/v1/checkout/sessions');
  assert.equal(init.method,'POST');
  assert.equal(init.headers.authorization,'Bearer sk_test_synthetic_for_ci_only');
  const params=new URLSearchParams(init.body);
  assert.equal(params.get('mode'),'payment');
  assert.equal(params.get('automatic_tax[enabled]'),'false');
  assert.equal(params.get('line_items[0][quantity]'),'1');
  assert.equal(params.get('line_items[1][quantity]'),'1');
  assert(params.get('success_url').startsWith(base+'/stripe-sandbox.html'));
  assert.equal(params.get('metadata[sandbox_no_order]'),'true');
  const goods=Number(params.get('line_items[0][price_data][unit_amount]'));
  const shipping=Number(params.get('line_items[1][price_data][unit_amount]'));
  assert([[990,1150],[1490,1400]].some(([a,b])=>a===goods&&b===shipping),
   'Only merchant-approved DDP amounts may reach Stripe');
  return Response.json({id:override?.id||'cs_test_sandboxabc',
   amount_total:override?.amount??goods+shipping,
   currency:'usd',url:override?.url||'https://checkout.stripe.com/c/pay/cs_test_sandboxabc'});
 };
 for(const [sku,total] of [['P1-S3',21.4],['P1-S7',28.9]]){
  const result=await onRequestPost({request:request(sku),env});
  assert.equal(result.status,200,await result.clone().text());
  const data=await result.json();
  assert.equal(data.ok,true);assert.equal(data.mode,'test');
  assert.equal(data.totalUSD,total);
  assert.equal(data.url,'https://checkout.stripe.com/c/pay/cs_test_sandboxabc');
  assert(!JSON.stringify(data).includes(token));
 }
 override={id:'cs_live_wrongmode'};
 assert.equal((await onRequestPost({request:request(),env})).status,502,'Cross-mode provider must be rejected');
 override={amount:999};
 assert.equal((await onRequestPost({request:request(),env})).status,502,'Incorrect server-total must fail');
 override={url:'https://checkout.stripe.com.evil.example/c/pay/abc'};
 assert.equal((await onRequestPost({request:request(),env})).status,502,'Non-Stripe host must fail');
 const ui=readFileSync('public/stripe-sandbox.html','utf8');
 assert(ui.includes('noindex,nofollow')&&ui.includes('TEST ONLY'));
 assert(ui.includes('x-mingeagle-sandbox-token'));
 assert(ui.includes('No MING EAGLE order')||ui.includes('never creates MING EAGLE CRM orders'));
 assert.equal(network,5,'Two valid test attempts and three invalid provider outputs');
 console.log('PASS: Pages middleware permits only sandbox POST; authenticated test Checkout $21.40/$28.90, production/live and unrelated preview mutations blocked.');
}finally{globalThis.fetch=saved}
