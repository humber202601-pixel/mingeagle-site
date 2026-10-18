import assert from 'node:assert/strict';
import {build} from 'esbuild';
const built=await build({entryPoints:['functions/api/admin/stripe-tax-registrations.ts'],
 bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
const {onRequestGet}=await import('data:text/javascript;base64,'+
 Buffer.from(built.outputFiles[0].text).toString('base64'));
const live={STRIPE_MODE:'live',STRIPE_SECRET_KEY:'sk_live_synthetic_only_no_real_calls',
 STRIPE_WEBHOOK_SECRET:'whsec_synthetic_only_no_real_calls',STRIPE_CHECKOUT_ENABLED:'true'};
const orig=globalThis.fetch;let calls=0;
try{
 globalThis.fetch=async()=>{calls++;throw Error('Unconfigured cannot contact provider')};
 for(const env of [{...live,STRIPE_SECRET_KEY:''},{...live,STRIPE_MODE:'test'},{...live,STRIPE_WEBHOOK_SECRET:''}]){
  const r=await onRequestGet({env});assert.equal(r.status,503);assert.equal((await r.json()).ok,false);
 }
 assert.equal(calls,0);
 const page=(data,has_more=false)=>Response.json({object:'list',data,has_more});
 globalThis.fetch=async(url,opts)=>{
  calls++;
  assert.equal(url,'https://api.stripe.com/v1/tax/registrations?status=active&limit=100');
  assert.equal(opts.redirect,'manual');
  assert.equal(opts.headers.get('stripe-version'),'2026-09-30.endive');
  assert.equal(opts.headers.get('authorization'),'Bearer '+live.STRIPE_SECRET_KEY);
  return page([]);
 };
 let r=await onRequestGet({env:live}),result=await r.json();
 assert.equal(r.status,200);assert.equal(result.activeUsStateSalesTaxCount,0);
 assert.deepEqual(result.activeStates,[]);assert.equal(result.morePages,false);
 assert(!JSON.stringify(result).includes(live.STRIPE_SECRET_KEY));
 globalThis.fetch=async()=>page([
  {livemode:true,status:'active',country_options:{us:{state:'KY',type:'state_sales_tax'}}},
  {livemode:true,status:'active',country_options:{us:{state:'NY',type:'state_sales_tax'}}},
  {livemode:true,status:'active',country_options:{us:{state:'NY',type:'state_sales_tax'}}},
  {livemode:false,status:'active',country_options:{us:{state:'CA',type:'state_sales_tax'}}},
  {livemode:true,status:'pending',country_options:{us:{state:'TX',type:'state_sales_tax'}}},
  {livemode:true,status:'active',country_options:{us:{state:'WA',type:'other'}}}
 ],true);
 r=await onRequestGet({env:live});result=await r.json();
 assert.equal(r.status,200);assert.deepEqual(result.activeStates,['KY','NY']);
 assert.equal(result.activeUsStateSalesTaxCount,2);
 assert.equal(result.morePages,true,'Do not claim all pages checked with has_more true');
 globalThis.fetch=async()=>new Response('Forbidden',{status:403});
 r=await onRequestGet({env:live});result=await r.json();
 assert.equal(r.status,502);assert.equal(result.activeUsStateSalesTaxCount,undefined);
 globalThis.fetch=async()=>Response.json({data:[]});
 r=await onRequestGet({env:live});assert.equal(r.status,502);
 assert.equal((await r.json()).activeUsStateSalesTaxCount,undefined);
 globalThis.fetch=async()=>{throw Error('synthetic network fault')};
 r=await onRequestGet({env:live});assert.equal(r.status,502);
 assert.equal((await r.json()).activeUsStateSalesTaxCount,undefined);
 console.log('PASS: owner read-only Stripe Tax registration check distinguishes active Live jurisdictions and unavailable/paginated evidence.');
}finally{globalThis.fetch=orig}
