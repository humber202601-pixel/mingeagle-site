import assert from 'node:assert/strict';
import {build} from 'esbuild';
const output=await build({entryPoints:['functions/api/payments/stripe/launch-check.ts'],bundle:true,write:false,platform:'node',format:'esm',logLevel:'silent'});
const {onRequestPost:check}=await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));
const origin='https://app.mingeagle.com',token='synthetic-owner-probe-'.repeat(3);
const env={STRIPE_MODE:'live',STRIPE_SECRET_KEY:'rk_live_synthetic_only',STRIPE_LAUNCH_CHECK_ENABLED:'true',STRIPE_LAUNCH_CHECK_TOKEN:token,STRIPE_LAUNCH_CHECK_EXPIRES_AT:new Date(Date.now()+3600000).toISOString(),STRIPE_LAUNCH_AUTOMATIC_TAX_PROBE_ONLY:'true'};
const req=action=>new Request(origin+'/api/payments/stripe/launch-check',{method:'POST',headers:{origin,'content-type':'application/json','x-mingeagle-launch-token':token},body:JSON.stringify({action})});
const saved=globalThis.fetch;let calls=0,customers=0,sessions=0,expired=0,removed=0;
let failure='',nonce='';
globalThis.fetch=async(url,init)=>{
 calls++;assert.equal(init.redirect,'manual');
 if(url.endsWith('/tax/settings'))return Response.json({status:'active',livemode:true,defaults:{tax_code:'txcd_99999999',tax_behavior:'exclusive'},head_office:{address:{country:'US',state:'KY',city:'Private City',line1:'PRIVATE_ADDRESS',postal_code:'40000'}}});
 const p=new URLSearchParams(init.body);
 if(url.endsWith('/customers')){
  customers++;assert.equal(p.get('tax_exempt'),'none');assert.equal(p.get('tax[validate_location]'),'immediately');assert.equal(p.get('shipping[address][line1]'),'PRIVATE_ADDRESS');
  nonce=p.get('metadata[diagnostic_nonce]');
  if(failure==='customer')return Response.json({error:{type:'permission_error',code:'permission_denied'}},{status:403});
  return Response.json({id:'cus_diagnostic',livemode:true,tax:{location:{country:'US',state:'KY'}},metadata:{purpose:p.get('metadata[purpose]'),diagnostic_nonce:nonce}});
 }
 if(url.endsWith('/checkout/sessions')){
  sessions++;assert.equal(p.get('automatic_tax[enabled]'),'true');assert.equal(p.get('customer'),'cus_diagnostic');assert.equal(p.get('metadata[order_id]'),null);assert.equal(p.get('client_reference_id'),'ME-LAUNCH-CHECK-NOT-AN-ORDER');
  assert.equal(p.get('line_items[0][price_data][product_data][tax_code]'),'txcd_99999999');assert.equal(p.get('line_items[1][price_data][product_data][tax_code]'),'txcd_92010001');
  return Response.json({id:'cs_live_diagnostic',livemode:true,customer:'cus_diagnostic',status:'open',currency:'usd',amount_total:2140,automatic_tax:{enabled:true,status:failure==='tax'?'requires_location_inputs':'complete'},total_details:{amount_tax:0},url:'https://checkout.stripe.com/PRIVATE_PAYABLE_URL'});
 }
 if(url.endsWith('/cs_live_diagnostic/expire')){expired++;return Response.json({status:'expired'});}
 if(url.endsWith('/customers/cus_diagnostic')){assert.equal(init.method,'DELETE');removed++;return Response.json({deleted:true});}
 throw Error('Unexpected provider path '+url);
};
try{
 for(const action of ['probe-checkout','setup-webhook','configure-tax-defaults','disable-previous-webhook','inspect'])
  assert.equal((await check({env,request:req(action)})).status,405);
 for(const patch of [{STRIPE_LAUNCH_AUTOMATIC_TAX_PROBE_ONLY:'false'},{STRIPE_LAUNCH_READ_ONLY:'true'},{STRIPE_LAUNCH_TAX_ONLY:'true'}])
  assert.equal((await check({env:{...env,...patch},request:req('probe-automatic-tax')})).status,405);
 assert.equal(calls,0,'Scope restrictions apply before all provider operations');
 const result=await check({env,request:req('probe-automatic-tax')});assert.equal(result.status,200,await result.clone().text());
 const value=await result.json();assert.equal(value.ok,true);assert.equal(value.sessionExpired,true);assert.equal(value.customerDeleted,true);
 for(const secret of ['PRIVATE_ADDRESS','PRIVATE_PAYABLE_URL',env.STRIPE_SECRET_KEY,nonce])assert(!JSON.stringify(value).includes(secret));
 assert.equal(customers,1);assert.equal(sessions,1);assert.equal(expired,1);assert.equal(removed,1);
 failure='customer';
 const denied=await check({env,request:req('probe-automatic-tax')});assert.equal(denied.status,502);assert.equal((await denied.json()).stage,'customer_create');assert.equal(sessions,1);assert.equal(removed,1,'No deletion if no diagnostic customer was created');
 failure='tax';
 const incomplete=await check({env,request:req('probe-automatic-tax')});assert.equal(incomplete.status,502);assert.equal((await incomplete.json()).stage,'automatic_tax_session');assert.equal(expired,2);assert.equal(removed,2,'Failed calculations also expire their session and remove only the diagnostic customer');
 console.log('PASS: owner-scoped automatic-tax diagnostic creates and expires an unpaid session, cleans up its diagnostic customer, exposes no address/URL/key and cannot alter registrations, defaults or webhooks.');
}finally{globalThis.fetch=saved}
