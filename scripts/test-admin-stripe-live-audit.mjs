import assert from 'node:assert/strict';
import {build} from 'esbuild';
const load=async file=>{
 const result=await build({entryPoints:[file],bundle:true,write:false,platform:'node',format:'esm',logLevel:'silent'});
 return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
};
const {onRequestGet:inspect}=await load('functions/api/admin/stripe-live-audit.ts');
const original=globalThis.fetch;
const env={STRIPE_MODE:'live',STRIPE_CHECKOUT_ENABLED:'true',
 STRIPE_SECRET_KEY:'rk_live_synthetic_audit_key_that_must_never_leak',
 STRIPE_WEBHOOK_SECRET:'whsec_synthetic_audit_signature_that_must_never_leak',
 MINGEAGLE_DB:{prepare(sql){
  assert(sql.startsWith('SELECT COUNT(*)'), 'Owner audit must only SELECT aggregate webhook counts');
  assert(sql.includes("FROM payment_webhook_events WHERE provider='STRIPE'"));
  return {async first(){return {total:6,processed:3,unprocessed:3}}};
 }}};
const providerEvents={data:[
 {id:'evt_secret_1',type:'checkout.session.expired',pending_webhooks:1,data:{object:{customer_email:'secret@example.invalid'}}},
 {id:'evt_secret_2',type:'checkout.session.expired',pending_webhooks:1},
 {id:'evt_secret_3',type:'checkout.session.expired',pending_webhooks:1}
],has_more:false};
try{
 let calls=[];
 globalThis.fetch=async(url,init)=>{
  calls.push({url,method:init?.method||'GET',headers:new Headers(init?.headers)});
  if(url.endsWith('/events?delivery_success=false&limit=100'))return Response.json(providerEvents);
  if(url.endsWith('/tax/registrations?status=active&limit=100'))return Response.json({data:[],has_more:false});
  throw Error('Unexpected provider call');
 };
 const result=await inspect({env});
 assert.equal(result.status,200);
 assert.equal(result.headers.get('cache-control'),'private, no-store');
 const b=await result.json();
 assert.equal(b.providerDataVerified,true);
 assert.equal(b.provider.events.status,'VERIFIED_STRIPE_SNAPSHOT');
 assert.equal(b.provider.events.pendingAtLeast,3);
 assert.equal(b.provider.events.pendingExpiredAtLeast,3);
 assert.equal(b.provider.events.hasMore,false);
 assert.equal(b.provider.activeTaxRegistrations.activeUsCount,0);
 assert.equal(b.localWebhookLedger.unprocessed,3);
 assert.equal(calls.length,2);
 for(const c of calls){
  assert.equal(c.method,'GET');
  assert.equal(c.headers.get('stripe-version'),'2026-09-30.endive');
  assert.equal(c.headers.get('authorization'),'Bearer '+env.STRIPE_SECRET_KEY);
 }
 for(const secret of ['evt_secret_1','secret@example.invalid',env.STRIPE_SECRET_KEY,env.STRIPE_WEBHOOK_SECRET])
  assert(!JSON.stringify(b).includes(secret),'No provider secrets or customer identifiers in admin audit');
 // A partial provider response must stay partial, not be reported as a complete zero.
 globalThis.fetch=async(url)=>url.includes('/events?')
  ?Response.json({data:[],has_more:true})
  :new Response('Stripe temporarily unavailable',{status:503});
 const incomplete=await (await inspect({env})).json();
 assert.equal(incomplete.provider.events.hasMore,true);
 assert.equal(incomplete.provider.activeTaxRegistrations.status,'UNKNOWN');
 assert.equal(incomplete.provider.activeTaxRegistrations.activeUsCount,null);
 assert.equal(incomplete.providerDataVerified,false);
 // Malformed provider data and inaccessible D1 are unknown, not false success.
 globalThis.fetch=async(url)=>Response.json({data:'invalid',has_more:false});
 const unavailable=await (await inspect({env:{...env,MINGEAGLE_DB:{prepare(){throw Error('schema unavailable')}}}})).json();
 assert.equal(unavailable.provider.events.status,'UNKNOWN');
 assert.equal(unavailable.provider.activeTaxRegistrations.status,'UNKNOWN');
 assert.equal(unavailable.localWebhookLedger.status,'UNKNOWN');
 let blockedCalls=0;
 globalThis.fetch=async()=>{blockedCalls++;throw Error('Provider should not be contacted');};
 const disabled=await inspect({env:{...env,STRIPE_CHECKOUT_ENABLED:'false'}});
 assert.equal(disabled.status,503);
 assert.equal(blockedCalls,0);
 console.log('PASS: authenticated-only live provider audit reads Stripe events/tax states and D1 aggregates without writes, secrets or false-zero reports.');
}finally{globalThis.fetch=original}
