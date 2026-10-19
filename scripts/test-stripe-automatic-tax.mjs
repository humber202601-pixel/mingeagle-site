import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID,createHmac} from 'node:crypto';
import {build} from 'esbuild';
const load=async path=>{const r=await build({entryPoints:[path],bundle:true,write:false,platform:'node',format:'esm',logLevel:'silent'});return import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'))};
const {onRequestGet:readiness}=await load('functions/api/retail/checkout-status.ts');
const {onRequestPost:retail}=await load('functions/api/retail/checkout.ts');
const {onRequestPost:checkout}=await load('functions/api/payments/stripe/create.ts');
const {onRequestPost:webhook}=await load('functions/api/payments/stripe/webhook.ts');
const {onRequestGet:quotePage}=await load('functions/quote/[token].ts');
const {onRequestGet:document}=await load('functions/api/admin/quote-document.ts');
const {retailTaxTreatment,reviewedRetailTaxStates,noSalesTaxCollectionRequired}=await load('lib/retail-tax-policy.ts');
const {US_DELIVERY_STATES}=await load('lib/us-delivery-states.ts');
const sql=new DatabaseSync(':memory:');
for(const f of readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('migrations/'+f,'utf8'));
const db={prepare(query){return {args:[],bind(...args){this.args=args;return this},async first(){return sql.prepare(query).get(...this.args)||null},async all(){return {success:true,results:sql.prepare(query).all(...this.args)}},async run(){const r=sql.prepare(query).run(...this.args);return {success:true,meta:{changes:Number(r.changes)}}}}},async batch(statements){sql.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());sql.exec('COMMIT');return r}catch(e){sql.exec('ROLLBACK');throw e}}};
const origin='https://app.mingeagle.com';
const policy={reviewed_on:new Date().toISOString().slice(0,10),review_reference:'SYNTHETIC_REVIEW_NOT_A_REAL_PERMIT',states:{CA:'COLLECT_WITH_STRIPE_TAX'},registration_references:{CA:'SYNTHETIC_REGISTERED_ENTITY_CA'}};
const env={MINGEAGLE_DB:db,STRIPE_MODE:'test',STRIPE_SECRET_KEY:'sk_test_synthetic_tax_only',STRIPE_WEBHOOK_SECRET:'whsec_synthetic_tax_only',STRIPE_CHECKOUT_ENABLED:'true',STRIPE_TAX_POLICY_APPROVED:'true',RETAIL_CHECKOUT_ENABLED:'true',RETAIL_STOCK_FULFILLMENT_APPROVED:'true',RETAIL_TAX_POLICY_APPROVED:'true',TURNSTILE_ENABLED:'true',TURNSTILE_SITE_KEY:'synthetic-site',TURNSTILE_SECRET_KEY:'synthetic-secret',RETAIL_US_TAX_POLICY_JSON:JSON.stringify(policy)};
assert.equal(retailTaxTreatment(env,'CA'),'STRIPE_AUTOMATIC');
assert.equal(retailTaxTreatment(env,'NY'),null);
assert.equal(retailTaxTreatment({...env,RETAIL_US_TAX_POLICY_JSON:JSON.stringify({...policy,registration_references:{}})},'CA'),null);
assert.equal(retailTaxTreatment({...env,RETAIL_US_TAX_POLICY_JSON:JSON.stringify({...policy,basis:'NO_GENERAL_SALES_USE_TAX'})},'CA'),null);
const fullPolicy={...policy,states:Object.fromEntries(Object.keys(US_DELIVERY_STATES).map(s=>[s,['OR','NH'].includes(s)?'NO_COLLECTION_REQUIRED':'COLLECT_WITH_STRIPE_TAX'])),registration_references:Object.fromEntries(Object.keys(US_DELIVERY_STATES).map(s=>[s,'SYNTHETIC_NOT_A_REAL_REGISTRATION_'.padEnd(180,'X')]))};
assert.equal(reviewedRetailTaxStates({...env,RETAIL_US_TAX_POLICY_JSON:JSON.stringify(fullPolicy)}).size,51,'A reviewed multi-state configuration can represent all 50 states and DC without losing the no-collection states');
const input={requestId:randomUUID(),country:'US',method:'air',lines:[{sku:'P1-S7',color:'Orange',quantity:1}],name:'Synthetic Buyer',email:'synthetic@example.invalid',phone:'+1 415 555 0100',street1:'1 Synthetic St',city:'San Francisco',state:'CA',postalCode:'94103',privacyAck:true,turnstileToken:'synthetic'};
const req=(path,body)=>new Request(origin+path,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
let registration=true,registrationLive=false,customerCalls=0,checkoutCalls=0,invalidTax=false,wrongLocation=false;
let activeSession,expectedState='CA',expectedZip='94103',salesTax=246,expectedBase=2890;
const saved=globalThis.fetch;
globalThis.fetch=async(url,init)=>{
 if(url==='https://challenges.cloudflare.com/turnstile/v0/siteverify')return Response.json({success:true,hostname:'app.mingeagle.com',action:'mingeagle_inquiry'});
 assert.equal(init.redirect,'manual');
 if(url.includes('/tax/registrations?'))return Response.json({data:registration?[{country:'US',status:'active',livemode:registrationLive,country_options:{us:{state:expectedState,type:'state_sales_tax'}}}]:[],has_more:false});
 const p=new URLSearchParams(init.body);
 if(url.endsWith('/customers')){
  customerCalls++;assert.equal(p.get('shipping[address][state]'),expectedState);assert.equal(p.get('shipping[address][postal_code]'),expectedZip);assert.equal(p.get('address[state]'),expectedState);assert.equal(p.get('tax_exempt'),'none');
  assert.equal(p.get('tax[validate_location]'),'immediately');assert.equal(p.get('expand[0]'),'tax');
  return Response.json({id:'cus_syntheticTax',livemode:false,tax:{location:{country:'US',state:wrongLocation?'NY':expectedState}}});
 }
 if(init.method!=='POST')return Response.json(activeSession);
 assert.equal(url,'https://api.stripe.com/v1/checkout/sessions');checkoutCalls++;
 assert.equal(p.get('automatic_tax[enabled]'),'true');assert.equal(p.get('customer'),'cus_syntheticTax');
 assert.equal(p.get('customer_email'),null);assert.equal(p.get('customer_update[shipping]'),null);assert.equal(p.get('customer_update[address]'),null);assert.equal(p.get('shipping_address_collection[allowed_countries][0]'),null);
 assert.equal(p.get('line_items[0][price_data][product_data][tax_code]'),'txcd_99999999');assert.equal(p.get('line_items[1][price_data][product_data][tax_code]'),'txcd_92010001');
 assert.equal(p.get('line_items[0][price_data][tax_behavior]'),'exclusive');
 const base=Number(p.get('line_items[0][price_data][unit_amount]'))+Number(p.get('line_items[1][price_data][unit_amount]'));
 assert.equal(base,expectedBase);
 activeSession={id:'cs_test_syntheticTax'+checkoutCalls,url:'https://checkout.stripe.com/c/pay/cs_test_syntheticTax'+checkoutCalls,status:'open',payment_status:'unpaid',customer:'cus_syntheticTax',currency:'usd',amount_total:expectedBase+salesTax,automatic_tax:{enabled:true,status:invalidTax?'requires_location_inputs':'complete'},total_details:{amount_tax:salesTax},client_reference_id:p.get('client_reference_id'),metadata:{order_id:p.get('metadata[order_id]'),order_reference:p.get('metadata[order_reference]'),tax_mode:p.get('metadata[tax_mode]'),tax_state:p.get('metadata[tax_state]')}};
 return Response.json(activeSession);
};
const sign=(id,patch={})=>{
 const raw=JSON.stringify({id,type:'checkout.session.completed',data:{object:{...activeSession,status:'complete',payment_status:'paid',...patch}}});
 const t=Math.floor(Date.now()/1000),sig=createHmac('sha256',env.STRIPE_WEBHOOK_SECRET).update(t+'.'+raw).digest('hex');
 return new Request(origin+'/api/payments/stripe/webhook',{method:'POST',body:raw,headers:{'stripe-signature':'t='+t+',v1='+sig}});
};
try{
 for(const [present,live] of [[false,false],[true,true]]){
  registration=present;registrationLive=live;
  assert.equal((await retail({env,request:req('/api/retail/checkout',input)})).status,409);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM orders').get().n,0);assert.equal(customerCalls+checkoutCalls,0);
 }
 registration=true;registrationLive=false;
 const created=await retail({env,request:req('/api/retail/checkout',input)});assert.equal(created.status,200,await created.clone().text());
 const result=await created.json(),token=new URL(result.paymentPage).pathname.split('/').at(-1);
 const order=sql.prepare('SELECT * FROM orders WHERE reference=?').get(result.orderReference);
 assert.equal((await document({env,request:new Request(origin+'/api/admin/quote-document?kind=quotation&quoteId='+order.quote_id)})).status,409,'A tax-pending amount is not issued as a final commercial document');
 const beforePage=await quotePage({env,params:{token},request:new Request(result.paymentPage)});
 const html=await beforePage.text();assert(html.includes('Total before sales tax'));assert(html.includes('Confirmed at secure payment'));assert(!html.includes('STRIPE_AUTOMATIC_TAX_PENDING:'));
 registration=false;
 assert.equal((await checkout({env,request:req('/api/payments/stripe/create',{token})})).status,409);assert.equal(customerCalls+checkoutCalls,0);
 registration=true;wrongLocation=true;
 assert.equal((await checkout({env,request:req('/api/payments/stripe/create',{token})})).status,503);assert.equal(checkoutCalls,0,'A ZIP resolving to another state cannot start Checkout');
 wrongLocation=false;invalidTax=true;
 assert.equal((await checkout({env,request:req('/api/payments/stripe/create',{token})})).status,502);assert.equal(sql.prepare('SELECT COUNT(*) n FROM payment_provider_sessions').get().n,0);
 invalidTax=false;
 const started=await checkout({env,request:req('/api/payments/stripe/create',{token})});assert.equal(started.status,200,await started.clone().text());
 const snapshot=sql.prepare('SELECT * FROM payment_provider_sessions').get();assert.equal(snapshot.amount,31.36);assert.equal(snapshot.base_amount_cents,2890);assert.equal(snapshot.tax_amount_cents,246);assert.equal(snapshot.tax_state,'CA');
 const calls=checkoutCalls;assert.equal((await checkout({env,request:req('/api/payments/stripe/create',{token})})).status,200);assert.equal(checkoutCalls,calls,'Open taxed sessions are reused');
 for(const [id,patch] of [['evt_tax_amount',{total_details:{amount_tax:245}}],['evt_customer',{customer:'cus_wrong'}],['evt_state',{metadata:{...activeSession.metadata,tax_state:'NY'}}],['evt_total',{amount_total:2890}],['evt_tax_incomplete',{automatic_tax:{enabled:true,status:'failed'}}]]){
  assert.equal((await webhook({env,request:sign(id,patch)})).status,409,id);assert.equal(sql.prepare('SELECT COUNT(*) n FROM payments').get().n,0);
 }
 const paid=await webhook({env,request:sign('evt_tax_paid')});assert.equal(paid.status,200,await paid.clone().text());assert.equal((await paid.json()).paymentStatus,'PAID');
 const finalOrder=sql.prepare('SELECT * FROM orders WHERE id=?').get(order.id),finalQuote=sql.prepare('SELECT * FROM quotes WHERE id=?').get(order.quote_id);
 assert.equal(finalOrder.total,31.36);assert.equal(finalOrder.tax,2.46);assert.equal(finalQuote.total,31.36);assert.equal(finalQuote.tax,2.46);
 assert.equal((await webhook({env,request:sign('evt_tax_paid')})).status,200);assert.equal((await webhook({env,request:sign('evt_tax_same_payment_new_event')})).status,200);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM payments').get().n,1);assert.equal(sql.prepare("SELECT COUNT(*) n FROM tasks WHERE type='FULFILLMENT'").get().n,1);
 const paidPage=await quotePage({env,params:{token},request:new Request(result.paymentPage)});const paidHtml=await paidPage.text();assert(paidHtml.includes('USD 31.36'));assert(paidHtml.includes('USD 2.46'));assert(!paidHtml.includes('Confirmed at secure payment'));
 const nationwideUnreviewed={...env,RETAIL_NATIONWIDE_STRIPE_TAX_ENABLED:'true',RETAIL_US_TAX_POLICY_JSON:'',RETAIL_REMOTE_STARTUP_FACTS_JSON:JSON.stringify({basis:'NEXUS_REVIEW_REQUIRED',reported_existing_us_sales:true,reported_us_return_agent_state:'KY'})};
 const unreviewedScope=await (await readiness({env:nationwideUnreviewed})).json();
 assert.equal(unreviewedScope.supportedStates.length,0,'The nationwide flag cannot manufacture state tax eligibility');
 assert.equal(unreviewedScope.retailCheckoutReady,false,'No reviewed tax states means direct checkout is not ready');
 assert.equal(retailTaxTreatment(nationwideUnreviewed,'NY'),null,'Unreviewed states must not enter automatic-tax checkout');
 assert.equal(noSalesTaxCollectionRequired(nationwideUnreviewed,'NY'),false,'Payment availability must not claim legal zero-tax eligibility');
 expectedState='NY';expectedZip='10001';salesTax=0;registration=false;
 const ordersBeforeUnreviewed=sql.prepare('SELECT COUNT(*) n FROM orders').get().n;
 const checkoutCallsBeforeUnreviewed=checkoutCalls;
 const unreviewedCreated=await retail({env:nationwideUnreviewed,request:req('/api/retail/checkout',{...input,requestId:randomUUID(),state:'NY',city:'New York',postalCode:expectedZip})});
 assert.equal(unreviewedCreated.status,409,await unreviewedCreated.clone().text());
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM orders').get().n,ordersBeforeUnreviewed,'Unreviewed state cannot create an order');
 assert.equal(checkoutCalls,checkoutCallsBeforeUnreviewed,'Unreviewed state cannot start Stripe Checkout');

 const nationwide={...env,RETAIL_NATIONWIDE_STRIPE_TAX_ENABLED:'true',RETAIL_US_TAX_POLICY_JSON:JSON.stringify(fullPolicy),RETAIL_REMOTE_STARTUP_FACTS_JSON:JSON.stringify({basis:'NEXUS_REVIEW_REQUIRED',reported_existing_us_sales:true,reported_us_return_agent_state:'KY'})};
 const scope=await (await readiness({env:nationwide})).json();assert.equal(scope.supportedStates.length,51);assert.equal(scope.retailCheckoutReady,true);
 assert.equal(noSalesTaxCollectionRequired(nationwide,'NY'),false,'Collection states must not be presented as zero-tax states');
 assert.equal(retailTaxTreatment(nationwide,'NY'),'STRIPE_AUTOMATIC','A reviewed state with a registration reference may use automatic tax');
 registration=true;registrationLive=false;
 const nationalCreated=await retail({env:nationwide,request:req('/api/retail/checkout',{...input,requestId:randomUUID(),state:'NY',city:'New York',postalCode:expectedZip})});
 assert.equal(nationalCreated.status,200,await nationalCreated.clone().text());const nationalOrder=await nationalCreated.json(),nationalToken=new URL(nationalOrder.paymentPage).pathname.split('/').at(-1);
 const nationalStarted=await checkout({env:nationwide,request:req('/api/payments/stripe/create',{token:nationalToken})});assert.equal(nationalStarted.status,200,await nationalStarted.clone().text());
 const nationalSnapshot=sql.prepare('SELECT * FROM payment_provider_sessions WHERE provider_intent_id=?').get(activeSession.id);assert.equal(nationalSnapshot.tax_mode,'STRIPE_AUTOMATIC');assert.equal(nationalSnapshot.amount,28.9);assert.equal(nationalSnapshot.tax_amount_cents,0);
 const nationalPaid=await webhook({env:nationwide,request:sign('evt_national_current_config')});assert.equal(nationalPaid.status,200,await nationalPaid.clone().text());assert.equal((await nationalPaid.json()).paymentStatus,'PAID');
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM payments').get().n,2);
 // Real SQLite basket → order → provider session → signed payment for 2–9 sets.
 for(const [lines,goods,freight] of [
  [[{sku:'P1-S7',quantity:2,color:'Orange'}],29.8,28],
  [[{sku:'P1-S3',quantity:1,color:'Blue'},{sku:'P1-S3',quantity:1,color:'Green'}],19.8,23],
  [[{sku:'P1-S3',quantity:1,color:'Yellow'},{sku:'P1-S7',quantity:1,color:'Blue'}],24.8,25.5],
  [[{sku:'P1-S7',quantity:9,color:'Green'}],134.1,126]
 ]){
  expectedBase=Math.round(goods*100)+Math.round(freight*100);
  const created=await retail({env:nationwide,request:req('/api/retail/checkout',{...input,requestId:randomUUID(),lines,state:'NY',city:'New York',postalCode:expectedZip,shippingUSD:0,total:0})});
  assert.equal(created.status,200,await created.clone().text());const basket=await created.json();
  assert.equal(Math.round(basket.totalBeforeTaxesUSD*100),expectedBase,'Client totals cannot change server repricing');
  const token=new URL(basket.paymentPage).pathname.split('/').at(-1);
  const order=sql.prepare('SELECT * FROM orders WHERE reference=?').get(basket.orderReference);
  assert.equal(order.subtotal,goods);assert.equal(order.shipping,freight);
  const rows=sql.prepare('SELECT * FROM order_items WHERE order_id=?').all(order.id);
  assert.equal(rows.length,lines.length);assert.equal(rows.reduce((n,x)=>n+x.quantity,0),lines.reduce((n,x)=>n+x.quantity,0));
  assert(sql.prepare('SELECT shipping_terms FROM quotes WHERE id=?').get(order.quote_id).shipping_terms.includes('separate one-unit parcels'));
  const calls=checkoutCalls;
  for(const [query,params,restore,restoreParams] of [
   ['UPDATE orders SET shipping=shipping-1 WHERE id=?',[order.id],'UPDATE orders SET shipping=? WHERE id=?',[freight,order.id]],
   ['UPDATE order_items SET unit_price=unit_price+1 WHERE id=?',[rows[0].id],'UPDATE order_items SET unit_price=? WHERE id=?',[rows[0].unit_price,rows[0].id]],
   ['UPDATE order_items SET quantity=10 WHERE id=?',[rows[0].id],'UPDATE order_items SET quantity=? WHERE id=?',[rows[0].quantity,rows[0].id]],
   ['UPDATE order_items SET description=? WHERE id=?',['P1-S5 / Orange Retail silent ball',rows[0].id],'UPDATE order_items SET description=? WHERE id=?',[rows[0].description,rows[0].id]]
  ]){
   sql.prepare(query).run(...params);
   assert.equal((await checkout({env:nationwide,request:req('/api/payments/stripe/create',{token})})).status,409,'Tampered or ineligible basket cannot start payment');
   assert.equal(checkoutCalls,calls);sql.prepare(restore).run(...restoreParams);
  }
  const started=await checkout({env:nationwide,request:req('/api/payments/stripe/create',{token})});assert.equal(started.status,200,await started.clone().text());
  const snapshot=sql.prepare('SELECT * FROM payment_provider_sessions WHERE order_id=?').get(order.id);assert.equal(snapshot.base_amount_cents,expectedBase);
  assert.equal((await checkout({env:nationwide,request:req('/api/payments/stripe/create',{token})})).status,200);assert.equal(checkoutCalls,calls+1,'Repeated click reuses this basket session');
  const event='evt_basket_'+checkoutCalls;
  assert.equal((await webhook({env:nationwide,request:sign(event)})).status,200);
  assert.equal((await webhook({env:nationwide,request:sign(event)})).status,200);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM payments WHERE order_id=?').get(order.id).n,1);
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM tasks WHERE order_id=? AND type='FULFILLMENT'").get(order.id).n,1);
 }
 const orderCount=sql.prepare('SELECT COUNT(*) n FROM orders').get().n;
 for(const lines of [
  [{sku:'P1-S7',quantity:9,color:'Orange'},{sku:'P1-S3',quantity:1,color:'Blue'}],
  [{sku:'P1-S3',quantity:1,color:'Orange'},{sku:'P1-S3',quantity:1,color:'Orange'}],
  [{sku:'P1-S3',quantity:1,color:'Orange'},{sku:'P1-S5',quantity:1,color:'Blue'}]
 ]){
  const response=await retail({env:nationwide,request:req('/api/retail/checkout',{...input,requestId:randomUUID(),lines,state:'NY',postalCode:expectedZip})});
  assert([400,409].includes(response.status),await response.clone().text());
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM orders').get().n,orderCount);
 }
 registration=false;
 assert.equal((await retail({env:{...env,RETAIL_NATIONWIDE_STRIPE_TAX_ENABLED:'true'},request:req('/api/retail/checkout',{...input,requestId:randomUUID()})})).status,409,'Nationwide payment cannot bypass an explicitly recorded collection obligation');
 console.log('PASS: actual SQLite order → registered tax state → fixed-address Checkout → signed taxed payment; exact tax totals, inactive/wrong-mode registration rejection and replay safety. Providers are isolated fixtures, no real permits or payments.');
}finally{globalThis.fetch=saved;sql.close()}
