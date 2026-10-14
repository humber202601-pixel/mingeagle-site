import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID,createHmac} from 'node:crypto';
import {build} from 'esbuild';
const load=async path=>{const r=await build({entryPoints:[path],bundle:true,write:false,platform:'node',format:'esm',logLevel:'silent'});return import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'))};
const {onRequestPost:acceptance}=await load('functions/api/payments/stripe/acceptance.ts');
const {onRequestPost:webhook}=await load('functions/api/payments/stripe/acceptance-webhook.ts');
const {onRequestGet:status}=await load('functions/api/payments/stripe/status.ts');
const {onRequestGet:quotePage}=await load('functions/quote/[token].ts');
const {onRequestPost:createCheckout}=await load('functions/api/payments/stripe/create.ts');
const {testCheckoutEnv}=await load('functions/_shared/stripe-acceptance.ts');
const sqlite=new DatabaseSync(':memory:');
for(const file of readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync('migrations/'+file,'utf8'));
sqlite.exec("CREATE TABLE stripe_acceptance_environment(id TEXT PRIMARY KEY,marker TEXT);CREATE TABLE stripe_acceptance_runs(run_id TEXT PRIMARY KEY,sku TEXT,order_id TEXT UNIQUE,quote_id TEXT UNIQUE);");
const marker='synthetic-isolated-marker-'.repeat(3),token='synthetic-test-access-'.repeat(3);
sqlite.prepare("INSERT INTO stripe_acceptance_environment VALUES ('test-only',?)").run(marker);
let reads=0,writes=0,network=0;
const db={prepare(sql){const s={args:[],bind(...args){this.args=args;return this},async first(){reads++;return sqlite.prepare(sql).get(...this.args)||null},async all(){reads++;return {success:true,results:sqlite.prepare(sql).all(...this.args)}},async run(){writes++;const r=sqlite.prepare(sql).run(...this.args);return {success:true,meta:{changes:Number(r.changes)}}}};return s},async batch(ss){sqlite.exec('BEGIN');try{const r=[];for(const s of ss)r.push(await s.run());sqlite.exec('COMMIT');return r}catch(e){sqlite.exec('ROLLBACK');throw e}}};
const base='https://test-stripe-order-20261014.mingeagle-site.pages.dev';
const env={MINGEAGLE_DB:db,TEST_ENVIRONMENT:'preview',STRIPE_MODE:'test',
 STRIPE_SECRET_KEY:'sk_test_synthetic_acceptance_only',STRIPE_WEBHOOK_SECRET:'whsec_synthetic_acceptance_only',
 STRIPE_SANDBOX_ACCESS_TOKEN:token,STRIPE_ACCEPTANCE_DB_MARKER:marker,STRIPE_ACCEPTANCE_ENABLED:'true',
 STRIPE_ACCEPTANCE_EXPIRES_AT:new Date(Date.now()+3600000).toISOString(),OUTBOUND_EMAIL_DISABLED:'true'};
const request=(body,origin=base,provided=token)=>new Request(base+'/api/payments/stripe/acceptance',
 {method:'POST',headers:{origin,'content-type':'application/json','x-mingeagle-sandbox-token':provided},body:JSON.stringify(body)});
const saved=globalThis.fetch;const sessions=new Map();
globalThis.fetch=async(url,init)=>{
 network++;assert.equal(new Headers(init.headers).get('stripe-version'),'2026-09-30.endive');assert.equal(init.redirect,'manual');
 if(url.endsWith('/webhook_endpoints'))return Response.json({id:'we_synthetic',livemode:false,
  secret:env.STRIPE_WEBHOOK_SECRET,url:base+'/api/payments/stripe/acceptance-webhook'});
 if(init.method!=='POST')return Response.json(sessions.get(url.split('/').at(-1)));
 assert.equal(url,'https://api.stripe.com/v1/checkout/sessions');
 const p=new URLSearchParams(init.body),id='cs_test_'+String(sessions.size+1);
 const value={id,livemode:false,status:'open',payment_status:'unpaid',currency:'usd',
  url:'https://checkout.stripe.com/c/pay/'+id,
  amount_total:Number(p.get('line_items[0][price_data][unit_amount]'))+Number(p.get('line_items[1][price_data][unit_amount]')),
  client_reference_id:p.get('client_reference_id'),metadata:{order_id:p.get('metadata[order_id]'),order_reference:p.get('metadata[order_reference]')}};
 sessions.set(id,value);return Response.json(value);
};
const signed=(event,wrong=false)=>{
 const raw=JSON.stringify(event),now=Math.floor(Date.now()/1000);
 const sig=createHmac('sha256',env.STRIPE_WEBHOOK_SECRET).update(now+'.'+raw).digest('hex');
 return new Request(base+'/api/payments/stripe/acceptance-webhook',{method:'POST',body:raw,
  headers:{'stripe-signature':'t='+now+',v1='+(wrong?'bad':sig)}});
};
try{
 for(const patch of [{TEST_ENVIRONMENT:''},{STRIPE_MODE:'live'},{STRIPE_SECRET_KEY:'rk_live_synthetic'},
  {STRIPE_ACCEPTANCE_ENABLED:'false'},{STRIPE_ACCEPTANCE_EXPIRES_AT:'2000-01-01'}, {OUTBOUND_EMAIL_DISABLED:'false'}])
  assert.equal((await acceptance({request:request({action:'setup-webhook'}),env:{...env,...patch}})).status,404);
 assert.equal((await acceptance({request:request({action:'setup-webhook'},base,'bad'),env})).status,403);
 assert.equal(reads+writes+network,0,'Closed or unauthorized environments must not read D1 or call Stripe');
 assert.equal((await acceptance({request:request({action:'setup-webhook'}),env:{...env,STRIPE_ACCEPTANCE_DB_MARKER:'wrong'.repeat(12)}})).status,503);
 assert.equal(network,0,'A production/wrong database binding must fail before provider calls');
 assert.equal((await acceptance({request:request({action:'setup-webhook'}),env})).status,200);
 const runId=randomUUID(),created=await acceptance({request:request({action:'create',sku:'P1-S3',runId}),env});
 assert.equal(created.status,200,await created.clone().text());const checkout=await created.json();
 assert.equal(checkout.totalUSD,21.4);assert(checkout.orderReference.startsWith('ME-RO-TEST-'));
 const quoteToken=new URL(checkout.orderPage).pathname.split('/').at(-1);
 const old=sessions.get('cs_test_1'),writesBeforePending=writes;
 old.status='complete';
 const pending=await createCheckout({env:testCheckoutEnv(env),request:new Request(base+'/api/payments/stripe/create',
  {method:'POST',headers:{origin:base,'content-type':'application/json'},body:JSON.stringify({token:quoteToken})})});
 assert.equal(pending.status,409,'A completed but unpaid asynchronous session must not create another payment');
 assert.equal(sessions.size,1);assert.equal(writes,writesBeforePending);
 old.status='open';
 const session=sessions.get('cs_test_1'),event={id:'evt_synthetic_acceptance',type:'checkout.session.completed',livemode:false,data:{object:{...session,status:'complete',payment_status:'paid'}}};
 const writesBefore=writes,readsBefore=reads;
 assert.equal((await webhook({request:signed(event,true),env})).status,401);
 assert.equal(writes,writesBefore);assert.equal(reads,readsBefore,'Invalid callback signatures must not access D1');
 const crossMode=await webhook({request:signed({...event,livemode:true}),env});assert.equal(crossMode.status,409);
 assert.equal(writes,writesBefore);
 const wrongAmount={...event,id:'evt_bad_amount',data:{object:{...event.data.object,amount_total:2141}}};
 assert.equal((await webhook({request:signed(wrongAmount),env})).status,409);
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM payments').get().n,0);
 const paid=await webhook({request:signed(event),env});assert.equal(paid.status,200,await paid.clone().text());
 assert.equal((await paid.json()).paymentStatus,'PAID');
 const replay=await webhook({request:signed(event),env});assert.equal((await replay.json()).duplicate,true);
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM payments').get().n,1);
 assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM tasks WHERE type='FULFILLMENT'").get().n,1);
 const writesBeforeStatus=writes;
 const orderStatus=await status({request:new Request(base+'/api/payments/stripe/status?token='+quoteToken),env});
 const data=await orderStatus.json();assert.equal(data.paymentStatus,'PAID');assert.equal(data.providerStatus,'SUCCEEDED');assert.equal(data.outstanding,0);assert.equal(writes,writesBeforeStatus,'Polling Stripe status must be read-only');
 assert.equal((await status({request:new Request(base+'/api/payments/stripe/status?token='+'f'.repeat(64)),env})).status,404);
 const page=await quotePage({request:new Request(checkout.orderPage+'?payment_return=1&session_id=cs_test_1'),env:testCheckoutEnv(env),params:{token:quoteToken}});
 assert.equal(page.status,200);const html=await page.text();assert(html.includes('Payment received in full.'));
 assert(html.includes("has('session_id')?'stripe':'airwallex'"));assert(!html.includes('when Airwallex confirms the payment'));
 console.log('PASS: real SQLite test order → provider session → signed callback → PAID, one receipt/task on replay; Stripe-specific read-only status and quote page.');
}finally{globalThis.fetch=saved;sqlite.close()}
