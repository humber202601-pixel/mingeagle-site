import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createHmac} from 'node:crypto';
const load=async file=>{const b=await build({entryPoints:[file],bundle:true,write:false,platform:'node',format:'esm',logLevel:'silent'});return import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'))};
const {onRequestPost:check}=await load('functions/api/payments/stripe/launch-check.ts');
const {onRequestPost:webhook}=await load('functions/api/payments/stripe/webhook.ts');
const base='https://app.mingeagle.com',token='synthetic-owner-access-'.repeat(3);
const env={STRIPE_MODE:'live',STRIPE_SECRET_KEY:'rk_live_synthetic_only',STRIPE_LAUNCH_CHECK_ENABLED:'true',
 STRIPE_LAUNCH_CHECK_TOKEN:token,STRIPE_LAUNCH_CHECK_EXPIRES_AT:new Date(Date.now()+3600000).toISOString()};
const request=(action,origin=base,access=token)=>new Request(base+'/api/payments/stripe/launch-check',
 {method:'POST',headers:{origin,'content-type':'application/json','x-mingeagle-launch-token':access},body:JSON.stringify({action})});
const saved=globalThis.fetch;let calls=0;
globalThis.fetch=async()=>{calls++;throw Error('No provider calls for closed checks')};
try{
 for(const patch of [{STRIPE_MODE:'test'},{STRIPE_SECRET_KEY:'rk_test_synthetic_only'},
  {STRIPE_LAUNCH_CHECK_ENABLED:'false'},{STRIPE_LAUNCH_CHECK_EXPIRES_AT:'2000-01-01'},
  {TEST_ENVIRONMENT:'preview'},{STRIPE_LAUNCH_CHECK_TOKEN:''}])
  assert.equal((await check({request:request('inspect'),env:{...env,...patch}})).status,404);
 assert.equal((await check({request:request('inspect',base,'bad'),env})).status,404);
 assert.equal((await check({request:request('inspect','https://example.invalid'),env})).status,404);
 assert.equal(calls,0);
 for(const action of ['probe-checkout','setup-webhook','disable-previous-webhook'])
  assert.equal((await check({request:request(action),env:{...env,STRIPE_LAUNCH_READ_ONLY:'true'}})).status,405);
 assert.equal(calls,0,'Read-only tax inspection must not permit provider writes');
 let created=0,expired=0;
 globalThis.fetch=async(url,init)=>{
  calls++;assert.equal(init.redirect,'manual');assert.equal(new Headers(init.headers).get('stripe-version'),'2026-09-30.endive');
  if(url.endsWith('/account'))return Response.json({charges_enabled:true,payouts_enabled:true,country:'US',
   email:'private@example.invalid',id:'acct_private_synthetic',requirements:{currently_due:[]}});
  if(url.endsWith('/tax/settings'))return Response.json({status:'active',livemode:true,
   head_office:{address:{country:'US',state:'CA',line1:'PRIVATE_ADDRESS_NOT_FOR_OUTPUT',postal_code:'90012'}},
   defaults:{tax_code:'txcd_synthetic',tax_behavior:'exclusive'}});
  if(url.endsWith('/tax/registrations?status=active&limit=100'))return Response.json({has_more:false,data:[{
   id:'taxreg_PRIVATE_NOT_FOR_OUTPUT',country:'US',status:'active',livemode:true,country_options:{us:{state:'CA',type:'state_sales_tax'}},active_from:1,expires_at:null}]});
  if(url.endsWith('/webhook_endpoints?limit=100'))return Response.json({data:[{id:'we_fixture',status:'enabled',livemode:true,
   url:base+'/api/payments/stripe/webhook',enabled_events:['checkout.session.expired'],secret:'whsec_private_not_for_output'},
   {id:'we_unrelated',url:'https://another-business.invalid/private'}]});
  if(url.endsWith('/checkout/sessions?limit=1'))return Response.json({data:[{customer_details:{email:'private@example.invalid'}}]});
  if(url.includes('/events?'))return Response.json({data:[{id:'evt_live_probe',livemode:true,data:{object:{id:'cs_live_fixture'}}}]});
  if(url.endsWith('/checkout/sessions')){
   created++;const form=new URLSearchParams(init.body);
   assert.equal(form.get('line_items[0][price_data][unit_amount]'),'2140');
   assert.equal(form.get('metadata[purpose]'),'MING_EAGLE_LAUNCH_PROBE_NO_PAYMENT');
   return Response.json({id:'cs_live_fixture',livemode:true,status:'open',amount_total:2140,currency:'usd',url:'https://checkout.stripe.com/pay/private'});
  }
  if(url.endsWith('/cs_live_fixture/expire')){expired++;return Response.json({id:'cs_live_fixture',status:'expired'});}
  throw Error('Unexpected provider path');
 };
 const inspected=await (await check({request:request('inspect'),env})).json();
 assert.equal(inspected.account.chargesEnabled,true);assert.equal(inspected.matchingWebhooks.length,1);
 for(const secret of ['private@example.invalid','acct_private_synthetic','whsec_private_not_for_output',env.STRIPE_SECRET_KEY])
  assert(!JSON.stringify(inspected).includes(secret));
 const tax=await (await check({request:request('inspect-tax'),env:{...env,STRIPE_LAUNCH_READ_ONLY:'true'}})).json();
 assert.equal(tax.settings.status,'active');assert.equal(tax.registrations.complete,true);
 assert.equal(tax.registrations.active[0].state,'CA');
 assert(!JSON.stringify(tax).includes('PRIVATE_ADDRESS_NOT_FOR_OUTPUT'));
 assert(!JSON.stringify(tax).includes('taxreg_PRIVATE_NOT_FOR_OUTPUT'));
 const probe=await (await check({request:request('probe-checkout'),env})).json();
 assert.equal(probe.ok,true);assert.equal(probe.sessionStatus,'expired');assert.equal(probe.providerEventId,'evt_live_probe');
 assert.equal(created,1);assert.equal(expired,1);assert(!JSON.stringify(probe).includes('checkout.stripe.com'));
 let dbWrites=0;
 const db={prepare(sql){assert(sql.includes('payment_webhook_events'),'A launch expiry must never read or write orders, receipts or fulfillment');
  return {bind(){return this},async first(){return null},async run(){dbWrites++;return {success:true}}};}};
 const secret='whsec_synthetic_probe_signature',event={id:'evt_live_probe',type:'checkout.session.expired',livemode:true,
  data:{object:{id:'cs_live_fixture',client_reference_id:'ME-LAUNCH-CHECK-NOT-AN-ORDER',metadata:{purpose:'MING_EAGLE_LAUNCH_PROBE_NO_PAYMENT'}}}};
 const raw=JSON.stringify(event),now=Math.floor(Date.now()/1000),sig=createHmac('sha256',secret).update(now+'.'+raw).digest('hex');
 const accepted=await webhook({env:{MINGEAGLE_DB:db,STRIPE_MODE:'live',STRIPE_WEBHOOK_SECRET:secret},request:new Request(base+'/api/payments/stripe/webhook',
  {method:'POST',headers:{'stripe-signature':'t='+now+',v1='+sig},body:raw})});
 assert.equal((await accepted.json()).launchProbe,true);assert.equal(dbWrites,2);
 console.log('PASS: private live-mode launch checks fail closed, redact account/key data, create then expire unpaid probe, and signed probe expiry never creates a CRM order/payment/task.');
}finally{globalThis.fetch=saved}
