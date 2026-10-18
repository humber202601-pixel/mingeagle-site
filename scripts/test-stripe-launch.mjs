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
 for(const action of ['probe-checkout','setup-webhook','disable-previous-webhook','configure-tax-defaults'])
  assert.equal((await check({request:request(action),env:{...env,STRIPE_LAUNCH_READ_ONLY:'true'}})).status,405);
 assert.equal(calls,0,'Read-only tax inspection must not permit provider writes');
 for(const action of ['probe-checkout','setup-webhook','disable-previous-webhook'])
  assert.equal((await check({request:request(action),env:{...env,STRIPE_LAUNCH_TAX_ONLY:'true'}})).status,405);
 assert.equal(calls,0,'Tax-only scope must never permit a checkout or webhook write');
 let created=0,expired=0,taxDefaultWrites=0,taxCode='txcd_10000000',taxBehavior='inferred_by_currency';
 globalThis.fetch=async(url,init)=>{
  calls++;assert.equal(init.redirect,'manual');assert.equal(new Headers(init.headers).get('stripe-version'),'2026-09-30.endive');
  if(url.endsWith('/account'))return Response.json({charges_enabled:true,payouts_enabled:true,country:'US',
   email:'private@example.invalid',id:'acct_private_synthetic',requirements:{currently_due:[]}});
  if(url.endsWith('/tax/settings')){
   if(init.method==='POST'){
    const form=new URLSearchParams(init.body);
    assert.deepEqual([...form.keys()].sort(),['defaults[tax_behavior]','defaults[tax_code]']);
    assert.equal(form.get('defaults[tax_code]'),'txcd_99999999');
    assert.equal(form.get('defaults[tax_behavior]'),'exclusive');
    taxCode=form.get('defaults[tax_code]');taxBehavior=form.get('defaults[tax_behavior]');taxDefaultWrites++;
   }
   return Response.json({status:'active',livemode:true,
   head_office:{address:{country:'US',state:'CA',line1:'PRIVATE_ADDRESS_NOT_FOR_OUTPUT',postal_code:'90012'}},
   defaults:{tax_code:taxCode,tax_behavior:taxBehavior}});
  }
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
 const corrected=await (await check({request:request('configure-tax-defaults'),env:{...env,STRIPE_LAUNCH_TAX_ONLY:'true'}})).json();
 assert.equal(corrected.ok,true);assert.equal(corrected.taxCode,'txcd_99999999');assert.equal(corrected.taxBehavior,'exclusive');
 assert.equal(taxDefaultWrites,1,'Only one fixed settings update is allowed');
 const repeat=await (await check({request:request('configure-tax-defaults'),env:{...env,STRIPE_LAUNCH_TAX_ONLY:'true'}})).json();
 assert.equal(repeat.changed,false);assert.equal(taxDefaultWrites,1,'Repeated configuration must not write again');
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
 // Three owner-created unpaid diagnostic sessions expired after the original
 // launch checks. Stripe must receive 2xx acknowledgement without any CRM
 // order/payment/task mutations, but signed lookalikes must remain rejected.
 const diagnosticCases=[
  ['live_checkout_verification_20261016','USER_REQUESTED_050_USD',50],
  ['live_checkout_verification_20261016_2','USER_REQUESTED_050_USD',50],
  ['connectivity_verification_20261016','DO_NOT_PAY',100],
 ];
 let diagnosticWrites=0,orderReads=0;
 const diagnosticDb={prepare(sql){
  if(sql.includes('payment_webhook_events')){
   return {bind(){return this},async first(){return {processed_at:null}},async run(){diagnosticWrites++;return {success:true}}};
  }
  if(sql.includes('payment_provider_sessions')){
   orderReads++;return {bind(){return this},async first(){return null}};
  }
  throw Error('Diagnostic event must not access a CRM order/payment/task: '+sql);
 }};
 let diagCounter=0;
 const sendDiagnostic=async(event,patch={})=>{
  const eventText=JSON.stringify(event),ts=Math.floor(Date.now()/1000);
  const mac=createHmac('sha256',secret).update(ts+'.'+eventText).digest('hex');
  return webhook({env:{MINGEAGLE_DB:diagnosticDb,STRIPE_MODE:'live',STRIPE_WEBHOOK_SECRET:secret,...patch},
   request:new Request(base+'/api/payments/stripe/webhook',{method:'POST',
    headers:{'stripe-signature':'t='+ts+',v1='+mac},body:eventText})});
 };
 const diagnostic=(purpose,charge,amount)=>({id:'evt_test_diagnostic_'+(++diagCounter),
  type:'checkout.session.expired',data:{object:{id:'cs_live_synthetic_diagnostic_'+diagCounter,
   client_reference_id:null,payment_link:null,status:'expired',payment_status:'unpaid',
   amount_total:amount,currency:'usd',metadata:{purpose,charge}}}});
 for(const [purpose,charge,amount] of diagnosticCases){
  const event=diagnostic(purpose,charge,amount),before=diagnosticWrites;
  const response=await sendDiagnostic(event);
  assert.equal(response.status,200,'Known unpaid owner-only diagnostic expiration must be acknowledged: '+purpose);
  assert.equal((await response.json()).ownerConnectivityExpiry,true);
  assert.equal(diagnosticWrites,before+2,'Only webhook ledger insertion+processing should be written');
 }
 assert.equal(orderReads,0,'Known expiries must never read an order or provider session');
 const variants=[
  (e)=>{e.data.object.amount_total=60},
  (e)=>{e.data.object.metadata.purpose='unknown_customer_event'},
  (e)=>{e.data.object.metadata.order_id='real_customer_order'},
  (e)=>{e.data.object.metadata.order_reference='real_customer_reference'},
  (e)=>{e.data.object.payment_status='paid'},
  (e)=>{e.data.object.status='complete'},
  (e)=>{e.data.object.client_reference_id='B2B-ORDER-REFERENCE'},
  (e)=>{e.data.object.payment_link='plink_other'},
  (e)=>{e.type='checkout.session.completed'}
 ];
 for(const modify of variants){
  const e=diagnostic(...diagnosticCases[0]);
  modify(e);
  const response=await sendDiagnostic(e);
  assert.equal(response.status,409,'Modified diagnostic metadata or lifecycle cannot skip order reconciliation');
 }
 assert.equal(orderReads,variants.length,
  'Every lookalike must follow the normal unmatched Checkout session path');
 console.log('PASS: private live-mode launch checks fail closed, redact account/key data, create then expire unpaid probe, and signed probe expiry never creates a CRM order/payment/task.');
}finally{globalThis.fetch=saved}
