import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID,createHash,createHmac} from 'node:crypto';
import {build} from 'esbuild';

const load=async path=>{
 const r=await build({entryPoints:[path],bundle:true,write:false,platform:'node',format:'esm',logLevel:'silent'});
 return import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'));
};
const {onRequestPost:checkout}=await load('functions/api/payments/stripe/create.ts');
const {onRequestPost:webhook}=await load('functions/api/payments/stripe/webhook.ts');
const {usesStripeAutomaticTaxQuote}=await load('lib/stripe-automatic-tax-quote.ts');
assert.equal(usesStripeAutomaticTaxQuote('STRIPE_AUTOMATIC_AT_CHECKOUT — Stripe Tax calculates applicable tax'),true);
assert.equal(usesStripeAutomaticTaxQuote('Manually reviewed tax basis'),false);

const sql=new DatabaseSync(':memory:');
for(const file of readdirSync('migrations').filter(x=>x.endsWith('.sql')).sort())
 sql.exec(readFileSync('migrations/'+file,'utf8'));
const db={
 prepare(query){
  const stmt={args:[],bind(...args){this.args=args;return this},
   async first(){return sql.prepare(query).get(...this.args)||null},
   async all(){return {success:true,results:sql.prepare(query).all(...this.args)}},
   async run(){const result=sql.prepare(query).run(...this.args);return {success:true,meta:{changes:Number(result.changes)}}}
  };
  return stmt;
 },
 async batch(statements){
  sql.exec('BEGIN');
  try{const out=[];for(const statement of statements)out.push(await statement.run());sql.exec('COMMIT');return out}
  catch(error){sql.exec('ROLLBACK');throw error}
 }
};

const origin='https://app.mingeagle.com';
const env={MINGEAGLE_DB:db,STRIPE_MODE:'test',
 STRIPE_SECRET_KEY:'sk_test_synthetic_b2b_auto_tax_only',
 STRIPE_WEBHOOK_SECRET:'whsec_synthetic_b2b_auto_tax_only',
 STRIPE_CHECKOUT_ENABLED:'true',STRIPE_TAX_POLICY_APPROVED:'true',
 STRIPE_RETAIL_ONLY_ENABLED:'false',STRIPE_B2B_CHECKOUT_ENABLED:'true',
 STRIPE_B2B_TAX_POLICY_APPROVED:'true',STRIPE_B2B_APPROVED_US_STATES:'TX,OR,NH'};
const quoteId=randomUUID(),orderId=randomUUID();
const orderReference='ME-B2B-AUTO-TAX-SYNTHETIC';
const bearer=randomUUID().replaceAll('-','')+randomUUID().replaceAll('-','');
const bearerHash=createHash('sha256').update(bearer).digest('hex');
const ship={line1:'123 Synthetic B2B Street',city:'Austin',state:'TX',postalCode:'78701',country:'US'};
const taxBasis='STRIPE_AUTOMATIC_AT_CHECKOUT — Stripe Tax calculates any applicable US sales tax at secure checkout using the buyer-confirmed delivery address.';
const taxNote='STRIPE_AUTOMATIC_TAX_PENDING: Final US sales tax and total are calculated by Stripe at secure checkout using the buyer-confirmed delivery address. Any applicable tax is added before payment.';

sql.prepare(`INSERT INTO quotes
 (id,reference,status,currency,subtotal,discount,shipping,tax,total,payment_terms,shipping_terms,
  valid_until,sent_at,accepted_at,tax_basis,notes,public_token_hash)
 VALUES (?,?,'CONVERTED','USD',150,0,30,0,180,?,
  'DDP sea freight 25–30 days; Ship-to state: TX',
  datetime('now','+14 days'),datetime('now','-1 day'),datetime('now','-1 hour'),?,?,?)`)
 .run(quoteId,'ME-Q-SYNTHETIC-AUTO-TAX',
  'Full amount payable by secure Stripe card checkout after both parties accept this quotation.',
  taxBasis,taxNote,bearerHash);
sql.prepare(`INSERT INTO orders
 (id,reference,quote_id,status,currency,subtotal,discount,shipping,tax,total,payment_status,shipping_address,customer_notes,confirmed_at)
 VALUES (?,? ,?,'PAYMENT_PENDING','USD',150,0,30,0,180,'UNPAID',?,?,CURRENT_TIMESTAMP)`)
 .run(orderId,orderReference,quoteId,JSON.stringify(ship),'Accepted synthetic quote for automatic-tax checkout test');
for(const line of [
 {product:'catalog-p1',variant:'variant-p1-s7-orange',description:'Flocked Silent Basketball Set | No. 7 | Orange',quantity:6,unit:15,total:90,sort:0},
 {product:'catalog-p2',variant:'variant-p2-s3-green',description:'Fabric Silent Basketball Set | No. 3 | Green',quantity:4,unit:15,total:60,sort:1}
]){
 sql.prepare(`INSERT INTO quote_items
  (id,quote_id,product_id,variant_id,description,quantity,unit_price,line_total,sort_order)
  VALUES (?,?,?,?,?,?,?,?,?)`)
  .run(randomUUID(),quoteId,line.product,line.variant,line.description,line.quantity,line.unit,line.total,line.sort);
 sql.prepare(`INSERT INTO order_items
  (id,order_id,product_id,variant_id,description,quantity,unit_price,line_total)
  VALUES (?,?,?,?,?,?,?,?)`)
  .run(randomUUID(),orderId,line.product,line.variant,line.description,line.quantity,line.unit,line.total);
}

let customerCalls=0,checkoutCalls=0;
let session;
const savedFetch=globalThis.fetch;
globalThis.fetch=async(url,init)=>{
 const endpoint=String(url);
 assert.equal(init.redirect,'manual','Stripe requests must not follow redirects');
 const params=new URLSearchParams(init.body||'');
 if(endpoint==='https://api.stripe.com/v1/customers'){
  customerCalls++;
  assert.equal(params.get('address[state]'),'TX');
  assert.equal(params.get('address[postal_code]'),'78701');
  assert.equal(params.get('shipping[address][state]'),'TX');
  assert.equal(params.get('tax[validate_location]'),'immediately');
  assert.equal(params.get('tax_exempt'),'none');
  return Response.json({id:'cus_testB2bAutoTax',livemode:false,
   tax:{location:{country:'US',state:'TX'}}});
 }
 if(endpoint==='https://api.stripe.com/v1/checkout/sessions'&&init.method==='POST'){
  checkoutCalls++;
  assert.equal(params.get('mode'),'payment');
  assert.equal(params.get('automatic_tax[enabled]'),'true');
  assert.equal(params.get('customer'),'cus_testB2bAutoTax');
  assert.equal(params.get('metadata[tax_mode]'),'STRIPE_AUTOMATIC');
  assert.equal(params.get('metadata[tax_state]'),'TX');
  assert.equal(params.get('line_items[0][price_data][tax_behavior]'),'exclusive');
  assert.equal(params.get('line_items[0][price_data][product_data][tax_code]'),'txcd_99999999');
  assert.equal(params.get('line_items[1][price_data][tax_behavior]'),'exclusive');
  assert.equal(params.get('line_items[1][price_data][product_data][tax_code]'),'txcd_92010001');
  const base=Number(params.get('line_items[0][price_data][unit_amount]'))*Number(params.get('line_items[0][quantity]'))+
   Number(params.get('line_items[1][price_data][unit_amount]'))*Number(params.get('line_items[1][quantity]'));
  assert.equal(base,18000,'Stripe Checkout merchandise and freight equal the accepted pre-tax quote');
  session={id:'cs_test_b2bAutoTax001',status:'open',payment_status:'unpaid',livemode:false,
   currency:'usd',amount_total:18450,customer:'cus_testB2bAutoTax',
   automatic_tax:{enabled:true,status:'complete'},total_details:{amount_tax:450},
   url:'https://checkout.stripe.com/c/pay/cs_test_b2bAutoTax001',
   client_reference_id:orderReference,
   metadata:{order_id:orderId,order_reference:orderReference,source:'MING_EAGLE_STRIPE_CHECKOUT',
    tax_mode:'STRIPE_AUTOMATIC',tax_state:'TX'}};
  return Response.json(session);
 }
 if(endpoint==='https://api.stripe.com/v1/checkout/sessions/cs_test_b2bAutoTax001')
  return Response.json(session);
 throw Error('Unexpected Stripe network call: '+endpoint);
};
const makeCheckout=()=>new Request(origin+'/api/payments/stripe/create',{
 method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({token:bearer})
});
const signedEvent=(eventId,payload,type='checkout.session.completed')=>{
 const raw=JSON.stringify({id:eventId,type,data:{object:payload}});
 const timestamp=Math.floor(Date.now()/1000);
 const signature=createHmac('sha256',env.STRIPE_WEBHOOK_SECRET).update(timestamp+'.'+raw).digest('hex');
 return new Request(origin+'/api/payments/stripe/webhook',{method:'POST',body:raw,
  headers:{'stripe-signature':'t='+timestamp+',v1='+signature}});
};
try{
 const started=await checkout({env,request:makeCheckout()});
 assert.equal(started.status,200,await started.clone().text());
 const result=await started.json();
 assert.equal(result.ok,true);
 assert.equal(sql.prepare('SELECT reference FROM orders WHERE id=?').get(orderId).reference,orderReference);
 assert.equal(result.reused,undefined);
 assert.match(result.url,/^https:\/\/checkout\.stripe\.com\//);
 assert.equal(customerCalls,1);
 assert.equal(checkoutCalls,1);
 const stored=sql.prepare(`SELECT * FROM payment_provider_sessions WHERE order_id=? AND provider='STRIPE'`).get(orderId);
 assert.equal(stored.status,'OPEN');
 assert.equal(stored.tax_mode,'STRIPE_AUTOMATIC');
 assert.equal(stored.base_amount_cents,18000);
 assert.equal(stored.tax_amount_cents,450);
 assert.equal(stored.tax_state,'TX');
 assert.equal(stored.tax_customer_id,'cus_testB2bAutoTax');
 assert.equal(stored.amount,184.5);

 const wrongTax={...session,status:'complete',payment_status:'paid',total_details:{amount_tax:449}};
 const bad=await webhook({env,request:signedEvent('evt_b2b_auto_wrong_tax',wrongTax)});
 assert.equal(bad.status,409,'Mismatched Stripe Tax amount must not mark the order paid');
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM payments WHERE order_id=?').get(orderId).n,0);
 assert.equal(sql.prepare('SELECT payment_status FROM orders WHERE id=?').get(orderId).payment_status,'UNPAID');

 const paidSession={...session,status:'complete',payment_status:'paid'};
 const paid=await webhook({env,request:signedEvent('evt_b2b_auto_paid',paidSession)});
 assert.equal(paid.status,200,await paid.clone().text());
 assert.equal((await paid.json()).paymentStatus,'PAID');
 const finalOrder=sql.prepare('SELECT tax,total,payment_status FROM orders WHERE id=?').get(orderId);
 const finalQuote=sql.prepare('SELECT tax,total,notes FROM quotes WHERE id=?').get(quoteId);
 assert.equal(finalOrder.tax,4.5);
 assert.equal(finalOrder.total,184.5);
 assert.equal(finalOrder.payment_status,'PAID');
 assert.equal(finalQuote.tax,4.5);
 assert.equal(finalQuote.total,184.5);
 assert.match(finalQuote.notes,/Stripe-confirmed sales tax/i);
 assert.equal(sql.prepare(`SELECT COUNT(*) n FROM payments WHERE order_id=? AND provider='STRIPE' AND status='RECEIVED'`).get(orderId).n,1);
 assert.equal(sql.prepare("SELECT COUNT(*) n FROM tasks WHERE order_id=? AND type='FULFILLMENT'").get(orderId).n,1);
 const duplicate=await webhook({env,request:signedEvent('evt_b2b_auto_paid',paidSession)});
 assert.equal(duplicate.status,200);
 assert.equal((await duplicate.json()).duplicate,true);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM payments WHERE order_id=?').get(orderId).n,1);
 assert.equal(sql.prepare("SELECT COUNT(*) n FROM tasks WHERE order_id=? AND type='FULFILLMENT'").get(orderId).n,1);
 const ordersBeforeDiagnostic=sql.prepare('SELECT COUNT(*) n FROM orders').get().n;
 const paymentsBeforeDiagnostic=sql.prepare('SELECT COUNT(*) n FROM payments').get().n;
 const tasksBeforeDiagnostic=sql.prepare('SELECT COUNT(*) n FROM tasks').get().n;
 env.STRIPE_MODE='live';
 const diagnostic={id:'cs_live_b1M55AMhDNYHZLQgGbgeWhvcTjGphLUXdcub0HHzsda4OMQOMVd1Xx9dVG',
  status:'expired',payment_status:'unpaid',amount_total:2140,currency:'usd',
  client_reference_id:'MINGEAGLE_AUTOMATIC_TAX_DIAGNOSTIC_NO_PAYMENT',
  metadata:{purpose:'MING_EAGLE_AUTOMATIC_TAX_DIAGNOSTIC_NO_PAYMENT',diagnostic_only:'true'}};
 const expired=await webhook({env,request:signedEvent('evt_live_auto_tax_diagnostic_expired',diagnostic,'checkout.session.expired')});
 assert.equal(expired.status,200,await expired.clone().text());
 assert.equal((await expired.json()).automaticTaxDiagnosticExpiry,true);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM orders').get().n,ordersBeforeDiagnostic);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM payments').get().n,paymentsBeforeDiagnostic);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM tasks').get().n,tasksBeforeDiagnostic);
 console.log('PASS: accepted B2B quote marked STRIPE_AUTOMATIC_AT_CHECKOUT → server-priced pre-tax amount → Stripe automatic-tax Checkout → signed tax/amount reconciliation → PAID once → one fulfillment task; unpaid Live diagnostic expiry is safely ignored without CRM writes.');
} finally {
 globalThis.fetch=savedFetch;
 sql.close();
}
