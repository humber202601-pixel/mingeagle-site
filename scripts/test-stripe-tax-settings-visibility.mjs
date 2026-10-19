import assert from 'node:assert/strict';
import {build} from 'esbuild';
const built=await build({entryPoints:['functions/api/admin/stripe-tax-settings.ts'],
 bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
const {onRequestGet}=await import('data:text/javascript;base64,'+
 Buffer.from(built.outputFiles[0].text).toString('base64'));
const live={STRIPE_MODE:'live',STRIPE_SECRET_KEY:'sk_live_synthetic_only_no_real_calls',
 STRIPE_WEBHOOK_SECRET:'whsec_synthetic_only_no_real_calls',STRIPE_CHECKOUT_ENABLED:'true'};
const orig=globalThis.fetch;let calls=0;
try{
 globalThis.fetch=async()=>{calls++;throw Error('Should not call when not ready')};
 for(const env of [{...live,STRIPE_SECRET_KEY:''},{...live,STRIPE_MODE:'test'},{...live,STRIPE_WEBHOOK_SECRET:''}]){
  const r=await onRequestGet({env});assert.equal(r.status,503);assert.equal((await r.json()).ok,false);
 }
 assert.equal(calls,0);
 globalThis.fetch=async(url,opts)=>{
  calls++;assert.equal(url,'https://api.stripe.com/v1/tax/settings');
  assert.equal(opts.redirect,'manual');
  assert.equal(opts.headers.get('stripe-version'),'2026-09-30.endive');
  assert.equal(opts.headers.get('authorization'),'Bearer '+live.STRIPE_SECRET_KEY);
  return Response.json({object:'tax.settings',livemode:true,status:'active',
   defaults:{tax_behavior:'exclusive',tax_code:'txcd_99999999'},
   head_office:{address:{line1:'212 N. 2nd St. STE 100',line2:null,city:'Richmond',
    state:'KY',postal_code:'40475',country:'US'}}});
 };
 let r=await onRequestGet({env:live}),result=await r.json();
 assert.equal(r.status,200);assert.equal(result.status,'active');assert.equal(result.livemode,true);
 assert.equal(result.headOffice.address.state,'KY');assert.equal(result.headOffice.address.city,'Richmond');
 assert.equal(result.defaultTaxBehavior,'exclusive');assert.equal(result.defaultTaxCode,'txcd_99999999');
 assert.match(result.caveat,/do not prove government registration/i);
 assert(!JSON.stringify(result).includes(live.STRIPE_SECRET_KEY));
 globalThis.fetch=async()=>new Response('Forbidden',{status:403});
 r=await onRequestGet({env:live});assert.equal(r.status,502);
 assert.equal((await r.json()).headOffice,undefined);
 globalThis.fetch=async()=>Response.json({object:'tax.settings',livemode:false,status:'active'});
 r=await onRequestGet({env:live});assert.equal(r.status,502);
 globalThis.fetch=async()=>Response.json({object:'tax.settings',livemode:true,status:'pending',
  defaults:{tax_code:'txcd_99999999'},head_office:{address:{state:'KY',country:'US'}}});
 r=await onRequestGet({env:live});result=await r.json();
 assert.equal(r.status,200);assert.equal(result.status,'pending');
 assert.equal(result.headOffice.address.state,'KY');
 globalThis.fetch=async()=>{throw Error('synthetic network fault')};
 r=await onRequestGet({env:live});assert.equal(r.status,502);
 assert.equal((await r.json()).headOffice,undefined);
 console.log('PASS: read-only Live Stripe Tax settings display status and sanitized head-office location; unavailable or non-Live responses never look verified.');
}finally{globalThis.fetch=orig}
