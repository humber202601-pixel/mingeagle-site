import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';

// Execute the real handlers in workerd. Node fetch mocks alone accepted
// redirect:"error", masking the exception thrown by deployed Cloudflare Pages.
const output=await build({stdin:{contents:`
 import {onRequestPost} from './functions/api/payments/stripe/sandbox.ts';
 import {onRequest} from './functions/_middleware.ts';
 import {stripeApi} from './functions/_shared/stripe.ts';
 export default {async fetch(request,env){
  if(new URL(request.url).pathname==='/runtime/shared'){
   try{return await stripeApi(env,'checkout/sessions',{method:'POST',body:'mode=payment'});}
   catch{return Response.json({ok:false},{status:503});}
  }
  return onRequest({request,env,next:()=>onRequestPost({request,env})});
 }};`,resolveDir:process.cwd(),sourcefile:'stripe-runtime-worker.ts'},
 bundle:true,write:false,platform:'browser',format:'esm',target:'es2022',logLevel:'silent'});
const token='synthetic-runtime-token-'.repeat(3);
let calls=0,redirect=false;
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:output.outputFiles[0].text,
 compatibilityDate:'2026-10-04',bindings:{TEST_ENVIRONMENT:'preview',STRIPE_MODE:'test',
 STRIPE_SECRET_KEY:'sk_test_synthetic_runtime_only',STRIPE_SANDBOX_ENABLED:'true',
 STRIPE_SANDBOX_ACCESS_TOKEN:token,STRIPE_CHECKOUT_ENABLED:'true',
 STRIPE_WEBHOOK_SECRET:'whsec_synthetic_runtime_only'},
 outboundService:async request=>{
  calls++;
  assert.equal(request.url,'https://api.stripe.com/v1/checkout/sessions');
  assert.equal(request.headers.get('authorization'),'Bearer sk_test_synthetic_runtime_only');
  if(redirect)return new Response(null,{status:302,headers:{location:'https://evil.example/trap'}});
  const body=new URLSearchParams(await request.text());
  const total=Number(body.get('line_items[0][price_data][unit_amount]'))+
   Number(body.get('line_items[1][price_data][unit_amount]'));
  return Response.json({id:'cs_test_workerd',url:'https://checkout.stripe.com/c/pay/cs_test_workerd',
   currency:'usd',amount_total:total});
 }}));
const base='https://runtime.mingeagle-site.pages.dev';
const options=sku=>({method:'POST',headers:{origin:base,'content-type':'application/json',
 'x-mingeagle-sandbox-token':token},body:JSON.stringify({sku})});
try{
 for(const [sku,total] of [['P1-S3',21.4],['P1-S7',28.9]]){
  const result=await mf.dispatchFetch(base+'/api/payments/stripe/sandbox',options(sku));
  assert.equal(result.status,200,await result.clone().text());
  assert.equal((await result.json()).totalUSD,total);
 }
 const shared=await mf.dispatchFetch(base+'/runtime/shared',{method:'POST'});
 assert.equal(shared.status,200,'Shared Stripe client must also execute successfully in workerd');
 redirect=true;
 const sandboxRedirect=await mf.dispatchFetch(base+'/api/payments/stripe/sandbox',options('P1-S3'));
 assert.equal(sandboxRedirect.status,502);
 const sharedRedirect=await mf.dispatchFetch(base+'/runtime/shared',{method:'POST'});
 assert.equal(sharedRedirect.status,503);
 assert.equal(calls,5,'Redirect responses must never cause a second request or forward credentials');
 console.log('PASS: real Cloudflare workerd middleware, sandbox and shared Stripe client; both exact prices and no credential-forwarding redirects.');
}finally{await mf.dispose()}
