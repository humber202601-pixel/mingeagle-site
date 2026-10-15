import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const tmp=mkdtempSync(join(tmpdir(),'airwallex-gate-'));
const originalFetch=globalThis.fetch;
try{
 async function load(input,name){
  const out=join(tmp,name+'.mjs');
  await build({entryPoints:[input],outfile:out,bundle:true,platform:'node',format:'esm',logLevel:'silent'});
  return import(pathToFileURL(out));
 }
 const {airwallexCheckoutReadiness}=await load('functions/_shared/airwallex.ts','shared');
 const {onRequestPost}=await load('functions/api/payments/airwallex/create.ts','create');
 const {onRequestGet}=await load('functions/api/payments/status.ts','status');
 const complete={
  AIRWALLEX_CHECKOUT_ENABLED:'true',
  AIRWALLEX_ENV:'sandbox',
  AIRWALLEX_CLIENT_ID:'synthetic-client',
  AIRWALLEX_API_KEY:'synthetic-key',
  AIRWALLEX_WEBHOOK_SECRET:'synthetic-signed-webhook'
 };
 assert.equal(airwallexCheckoutReadiness(complete).checkoutReady,false,'Stripe-only payment policy overrides stale enabled credentials');
 const missing=[
  {}, {...complete,AIRWALLEX_CHECKOUT_ENABLED:'false'},
  {...complete,AIRWALLEX_CHECKOUT_ENABLED:undefined},
  {...complete,AIRWALLEX_ENV:undefined},
  {...complete,AIRWALLEX_ENV:'demo'},
  {...complete,AIRWALLEX_CLIENT_ID:''},
  {...complete,AIRWALLEX_API_KEY:'  '},
  {...complete,AIRWALLEX_WEBHOOK_SECRET:undefined},
  {...complete,AIRWALLEX_WEBHOOK_SECRET:'  '}
 ];
 let external=0,dbReads=0,dbWrites=0;
 globalThis.fetch=async()=>{external++;throw Error('Network must not be used while checkout is not ready');};
 const db={prepare(sql){if(/^\s*(INSERT|UPDATE|CREATE|DELETE|ALTER|DROP)/i.test(sql))dbWrites++;else dbReads++;throw Error('No D1 access allowed before payment readiness');}};
 for(const env of missing){
  assert.equal(airwallexCheckoutReadiness(env).checkoutReady,false);
  const response=await onRequestPost({env:{...env,MINGEAGLE_DB:db},
   request:new Request('https://app.mingeagle.com/api/payments/airwallex/create',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({token:'a'.repeat(64)})
   })});
  assert.equal(response.status,410,'Airwallex online gateway is retired for all configurations');
  assert.equal((await response.json()).ok,false);
  assert.equal(response.headers.get('cache-control'),'no-store');
  const publicStatus=await onRequestGet({env});
  const data=await publicStatus.json();
  assert.equal(data.airwallex.checkoutReady,false);
  assert.equal(data.airwallex.environment,env.AIRWALLEX_ENV==='sandbox'?'sandbox':null);
  assert(!JSON.stringify(data).includes('synthetic-'),'No payment credentials must be exposed');
 }
 const forcedDisabled=await onRequestPost({env:{...complete,MINGEAGLE_DB:db},
  request:new Request('https://app.mingeagle.com/api/payments/airwallex/create',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:'a'.repeat(64)})})});
 assert.equal(forcedDisabled.status,410,'Even complete old Airwallex credentials cannot create an online checkout');
 assert.equal((await forcedDisabled.json()).ok,false);
 const enabled=await onRequestGet({env:complete});
 const ready=(await enabled.json()).airwallex;
 assert.equal(ready.checkoutReady,false);
 assert.equal(ready.checkoutRequested,false);
 assert.equal(ready.webhookConfigured,true);
 assert.equal(ready.environment,'sandbox');
 assert(!JSON.stringify(ready).includes('synthetic-'));
 assert.equal(airwallexCheckoutReadiness({...complete,AIRWALLEX_ENV:'prod'}).checkoutReady,false);
 assert.equal(external,0,'Fail-closed payment gate must never contact provider');
 assert.equal(dbReads,0);assert.equal(dbWrites,0);
 console.log('PASS: Stripe-only checkout policy blocks legacy Airwallex gateway even with configured credentials; no provider calls, D1 access or credential leakage.');
}finally{globalThis.fetch=originalFetch;rmSync(tmp,{recursive:true,force:true});}
