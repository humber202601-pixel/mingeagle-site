import {QUOTE_PUBLIC_TOKEN_PREDICATE} from '../../../../lib/quote-public-token';
import {stripeApi, stripeCheckoutReadiness, stripeSessionMatchesMode, type StripeEnv} from '../../../_shared/stripe';
import {retailTaxTreatment,reviewedStripeTaxStates,remoteStartupState,remoteStartupWithinLimits,type RetailTaxEnv} from '../../../../lib/retail-tax-policy';
import {registeredStripeTaxState,fixedTaxCustomer,automaticTaxAmount,type DeliveryAddress} from '../../../_shared/retail-stripe-tax';
import {separateUnitUsAirParcels} from '../../../../lib/us-small-parcel';
import {requiresClosedOrderPaymentReview} from '../../../../lib/closed-order-payment';
import {acceptedB2bQuotePayable} from '../../../../lib/b2b-stripe-eligibility';
import {acceptedB2bItemSnapshotMatches} from '../../../../lib/b2b-line-snapshot';

interface Env extends StripeEnv,RetailTaxEnv {
  MINGEAGLE_DB: D1Database;
  STRIPE_TAX_POLICY_APPROVED?:string;
  RETAIL_CHECKOUT_ENABLED?:string;
  RETAIL_STOCK_FULFILLMENT_APPROVED?:string;
  RETAIL_TAX_POLICY_APPROVED?:string;
  STRIPE_RETAIL_ONLY_ENABLED?:string;
  STRIPE_B2B_CHECKOUT_ENABLED?:string;
  STRIPE_B2B_TAX_POLICY_APPROVED?:string;
  STRIPE_B2B_APPROVED_US_STATES?:string;
}
type RecordRow=Record<string,unknown>;
const fail=(message:string,status=400)=>Response.json({ok:false,error:message},{status,headers:{'cache-control':'no-store'}});
async function tokenHash(token:string){
 const raw=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
 return Array.from(new Uint8Array(raw)).map(n=>n.toString(16).padStart(2,'0')).join('');
}
const cents=(value:unknown)=>Math.round(Number(value)*100);
export const onRequestPost:PagesFunction<Env>=async({request,env})=>{
 // Never query customer records or Stripe until signed webhook + tax approval exist.
 if(!stripeCheckoutReadiness(env).checkoutReady || env.STRIPE_TAX_POLICY_APPROVED!=='true')
  return fail('Secure Stripe checkout is not activated yet.',503);
 if(!env.MINGEAGLE_DB)return fail('Order database unavailable.',503);
 const url=new URL(request.url);
 if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin)return fail('Invalid origin.',403);
 if(request.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json')return fail('JSON required.',415);
 const body=await request.json().catch(()=>null) as {token?:unknown}|null;
 const token=typeof body?.token==='string'?body.token:'';
 if(!/^[0-9a-f]{64}$/i.test(token))return fail('Invalid secure order link.',400);
 const db=env.MINGEAGLE_DB;
 try{
  const hash=await tokenHash(token);
  const order=await db.prepare(
   "SELECT o.id,o.reference,o.status,o.payment_status,o.total,o.subtotal,o.discount,o.shipping,o.tax,o.currency,o.shipping_address,"+
   "q.status AS quote_status,q.sent_at AS quote_sent_at,q.accepted_at AS quote_accepted_at,"+
   "q.payment_terms AS quote_payment_terms,q.shipping_terms AS quote_shipping_terms,"+
   "q.valid_until,q.tax_basis,q.reference AS quote_reference,q.subtotal AS quote_subtotal,"+
   "q.discount AS quote_discount,q.shipping AS quote_shipping,q.tax AS quote_tax,"+
   "q.total AS quote_total,q.currency AS quote_currency,o.quote_id,ct.email AS email,"+
   "(SELECT COALESCE(SUM(amount),0) FROM payments WHERE order_id=o.id AND status='RECEIVED') AS received "+
   "FROM quotes q JOIN orders o ON o.quote_id=q.id LEFT JOIN contacts ct ON ct.id=o.contact_id "+
   "WHERE "+QUOTE_PUBLIC_TOKEN_PREDICATE+" "+
   "ORDER BY o.created_at DESC LIMIT 1"
  ).bind(hash,hash).first<RecordRow>();
  if(!order)return fail('Order not found.',404);
  if(requiresClosedOrderPaymentReview(order)||String(order.status).toUpperCase()==='REFUNDED')
   return fail('Closed or refunded orders cannot accept new payments.',409);
  const isRetail=String(order.reference).startsWith('ME-RO-');
  if(!isRetail&&(env.STRIPE_RETAIL_ONLY_ENABLED==='true'||env.STRIPE_B2B_CHECKOUT_ENABLED!=='true'))
   return fail('Online payment currently supports approved retail orders only. Contact MING EAGLE for this quotation.',503);
  if(!isRetail&&env.STRIPE_B2B_TAX_POLICY_APPROVED!=='true')
   return fail('Wholesale tax treatment requires separate business-order review before Stripe collection.',503);
  if(isRetail&&env.RETAIL_CHECKOUT_ENABLED!=='true')
   return fail('Direct retail payment is not activated.',503);
  if(isRetail&&(env.RETAIL_STOCK_FULFILLMENT_APPROVED!=='true'||env.RETAIL_TAX_POLICY_APPROVED!=='true'))
   return fail('Retail stock, shipping and tax approval is required.',503);
  let taxMode:'FIXED'|'STRIPE_AUTOMATIC'='FIXED';
  let shippingAddress:DeliveryAddress={};
  if(isRetail){
   let ship:DeliveryAddress;
   try{ship=JSON.parse(String(order.shipping_address||'null'))}catch{return fail('Retail shipping address requires review.',409)}
   const state=String(ship?.state||'').toUpperCase();
   const treatment=retailTaxTreatment(env,state);
   if(ship?.country!=='US'||!treatment)
    return fail('Secure payment for this delivery state is awaiting tax configuration.',409);
   taxMode=treatment;shippingAddress={...ship,state};
   if(remoteStartupState(env,state)&&!await remoteStartupWithinLimits(db))
    return fail('Please contact MING EAGLE to confirm the final order terms before paying.',409);
   const orderItems=await db.prepare('SELECT description,quantity,unit_price FROM order_items WHERE order_id=?')
    .bind(String(order.id)).all<{description:string;quantity:number;unit_price:number}>();
   const items=orderItems.results||[];
   const confirmed=separateUnitUsAirParcels(items.map(item=>({
    sku:/^([A-Z0-9-]+) \/ /.exec(String(item.description||''))?.[1]||'',quantity:Number(item.quantity)
   })),'US','air');
   if(!confirmed?.ddpConfirmed||items.some((item,i)=>
      Math.round(Number(item.unit_price)*100)!==Math.round(confirmed.lines[i].unitPriceUSD*100))||
      Math.round(Number(order.subtotal)*100)!==Math.round(confirmed.productsUSD*100)||
      Math.round(Number(order.shipping)*100)!==Math.round(confirmed.shippingUSD*100)||
      Math.round(Number(order.tax)*100)!==0||Math.round(Number(order.discount)*100)!==0)
    return fail('Duty-paid delivery is not verified for the requested products.',409);
  }
  if(!isRetail){
   // Explicitly accepted card/Stripe terms prevent charging a bank-transfer
   // quotation through a payment channel the customer never agreed to.
   if(!/\bstripe\b/i.test(String(order.quote_payment_terms||'')))
    return fail('Accepted wholesale quotation must explicitly authorize Stripe card payment.',409);
   let ship:Record<string,unknown>;
   try{ship=JSON.parse(String(order.shipping_address||'null'))}catch{return fail('Confirmed wholesale delivery address is required before Stripe payment.',409)}
   if(!ship||typeof ship!=='object'||ship.country!=='US'||!/^[A-Z]{2}$/.test(String(ship.state||''))||
      String(ship.city||'').trim().length<2||
      String(ship.postalCode||ship.postal_code||'').trim().length<5||
      String(ship.line1||ship.address1||'').trim().length<5)
    return fail('Confirm the full US delivery destination and quote freight before wholesale card payment.',409);
   const state=String(ship.state),quotedDelivery=String(order.quote_shipping_terms||'').toUpperCase();
   if(quotedDelivery.match(/SHIP-TO STATE:\s*([A-Z]{2})(?![A-Z])/)?.[1]!==state)
    return fail('Delivery state differs from the buyer-accepted freight quotation. Request a corrected quote.',409);
   const approved=(env.STRIPE_B2B_APPROVED_US_STATES||'')
     .split(',').map(x=>x.trim().toUpperCase()).filter(x=>/^[A-Z]{2}$/.test(x));
   if(!approved.includes(state))
    return fail('Business-order sales tax review for this delivery state is not yet authorized.',409);
   // Nationwide B2B is allowed only against the seller's explicit quote.
   // The quoted tax amount may be zero only when the documented tax basis supports
   // non-collection or a valid exemption/resale treatment. We never infer zero tax.
  }
  if(!isRetail&&!String(order.tax_basis||'').trim())
   return fail('Wholesale quotation is missing its documented sales-tax basis.',409);
  if(!isRetail&&!acceptedB2bQuotePayable({
   status:order.quote_status,sent_at:order.quote_sent_at,accepted_at:order.quote_accepted_at,
   payment_terms:order.quote_payment_terms,shipping_terms:order.quote_shipping_terms,
   valid_until:order.valid_until
  }))return fail('Wholesale quote requires confirmed seller terms and buyer acceptance before Stripe payment.',409);
  // The accepted quote is the buyer's authorization: do not charge a later,
  // silently edited order total, shipping or tax amount under the old quote.
  if(!isRetail){
   const monetaryFields=[
    ['subtotal','quote_subtotal'],['discount','quote_discount'],['shipping','quote_shipping'],
    ['tax','quote_tax'],['total','quote_total']
   ] as const;
   const quoteMatchesOrder=String(order.quote_currency||'').toUpperCase()===String(order.currency||'').toUpperCase()&&
    monetaryFields.every(([orderField,quoteField])=>{
     const a=order[orderField],b=order[quoteField];
     return a!==null&&a!==undefined&&b!==null&&b!==undefined&&
      Number.isFinite(Number(a))&&Number.isFinite(Number(b))&&cents(a)===cents(b);
    });
   if(!quoteMatchesOrder)return fail('Approved wholesale quote differs from order amounts. Please issue and accept a revised quote before payment.',409);
   // The total alone is insufficient: a different product/size can keep the
   // same subtotal. Compare every buyer-approved quote item with its order copy,
   // including quantity, SKU/variant, description, price and extended amount.
   // Read-only validation happens before any Stripe call or payment-session write.
   const quoteLines=await db.prepare(
    'SELECT product_id,variant_id,description,quantity,unit_price,line_total FROM quote_items WHERE quote_id=?'
   ).bind(String(order.quote_id)).all();
   const orderLines=await db.prepare(
    'SELECT product_id,variant_id,description,quantity,unit_price,line_total FROM order_items WHERE order_id=?'
   ).bind(String(order.id)).all();
   if(!quoteLines.success||!orderLines.success||
      !acceptedB2bItemSnapshotMatches(quoteLines.results,orderLines.results,order.quote_subtotal,order.subtotal))
    return fail('Wholesale order items differ from the accepted quotation. A corrected quotation must be approved before payment.',409);

  }
  const received=cents(order.received);
  const total=cents(order.total),due=total-received;
  if(String(order.payment_status)==='PAID'||due<=0)return fail('Already paid.',409);
  if(!Number.isSafeInteger(due)||due<50||due>10000000||String(order.currency).toUpperCase()!=='USD')
   return fail('Invalid payment amount or currency.',409);
  if(received>0)return fail('Part-paid orders require an updated payment link from MING EAGLE.',409);
  const components=[cents(Number(order.subtotal)-Number(order.discount)),cents(order.shipping),cents(order.tax)];
  if(components.some(x=>!Number.isSafeInteger(x)||x<0)||components.reduce((a,b)=>a+b,0)!==due)
   return fail('Order total does not reconcile.',409);
  if(taxMode==='STRIPE_AUTOMATIC'&&reviewedStripeTaxStates(env).has(shippingAddress.state!)&&
   !await registeredStripeTaxState(env,shippingAddress.state!))
   return fail('Secure payment for this delivery state is awaiting tax configuration.',409);

  // Stripe idempotency protects concurrent browser clicks for this order/amount.
  // Retrieve a previous session if still open; never trust a return URL from the browser.
  const old=await db.prepare(taxMode==='STRIPE_AUTOMATIC'?
   "SELECT provider_intent_id,tax_amount_cents,tax_customer_id FROM payment_provider_sessions WHERE order_id=? AND provider='STRIPE' "+
   "AND base_amount_cents=? AND tax_mode='STRIPE_AUTOMATIC' AND currency='USD' "+
   "AND status IN ('OPEN','PENDING') ORDER BY created_at DESC LIMIT 1":
   "SELECT provider_intent_id FROM payment_provider_sessions "+
   "WHERE order_id=? AND provider='STRIPE' AND amount=? AND currency='USD' "+
   "AND status IN ('OPEN','PENDING') ORDER BY created_at DESC LIMIT 1"
  ).bind(String(order.id),taxMode==='STRIPE_AUTOMATIC'?due:due/100).first<{provider_intent_id:string;tax_amount_cents?:number;tax_customer_id?:string}>();
  if(old?.provider_intent_id){
   if(!stripeSessionMatchesMode(old.provider_intent_id,env.STRIPE_MODE))
    return fail('Existing checkout session does not match the configured Stripe mode.',409);
   const previous=await stripeApi(env,'checkout/sessions/'+encodeURIComponent(old.provider_intent_id));
   if(previous.ok){
    const last=await previous.json() as {status?:string;payment_status?:string;url?:string;amount_total?:number;
     currency?:string;customer?:string;client_reference_id?:string;automatic_tax?:{enabled?:boolean;status?:string};total_details?:{amount_tax?:number};metadata?:{tax_state?:string;tax_mode?:string;order_id?:string;order_reference?:string}};
    if(last.payment_status==='paid')return fail('Payment is processing confirmation. Do not pay twice.',409);
    if(last.status==='complete')return fail('Payment has been submitted and is awaiting provider confirmation. Do not pay twice.',409);
    if(taxMode==='STRIPE_AUTOMATIC'&&(automaticTaxAmount(last,due)!==old.tax_amount_cents||
     last.customer!==old.tax_customer_id||last.metadata?.tax_state!==shippingAddress.state||
     last.metadata?.tax_mode!==taxMode||last.metadata?.order_id!==String(order.id)||
     last.metadata?.order_reference!==String(order.reference)||last.client_reference_id!==String(order.reference)))
     return fail('Previous payment session requires tax review.',409);
    // Querying D1 by order/amount is not enough to reuse an old provider
    // Checkout URL. Verify the actual Stripe session identity and amount,
    // including a prior session from a fixed-tax B2B quotation.
    if(taxMode==='FIXED'&&last.status==='open'&&(
      last.amount_total!==due||String(last.currency||'').toLowerCase()!=='usd'||
      last.client_reference_id!==String(order.reference)||
      last.metadata?.order_id!==String(order.id)||
      last.metadata?.order_reference!==String(order.reference)||
      last.automatic_tax?.enabled===true
    ))return fail('Existing Stripe Checkout does not match the approved order. Contact MING EAGLE for review.',409);
    if(last.status==='open'&&typeof last.url==='string'&&new URL(last.url).hostname==='checkout.stripe.com'&&new URL(last.url).protocol==='https:')
     return Response.json({ok:true,url:last.url,reused:true},{headers:{'cache-control':'no-store'}});
   }
  }
  const form=new URLSearchParams();
  form.set('mode','payment');
  // Current Stripe Checkout selects enabled methods from Dashboard settings.
  form.set('client_reference_id',String(order.reference));
  form.set('success_url',url.origin+'/quote/'+token+'?payment_return=1&session_id={CHECKOUT_SESSION_ID}');
  form.set('cancel_url',url.origin+'/quote/'+token+'?payment_cancel=1');
  form.set('metadata[order_id]',String(order.id));
  form.set('metadata[order_reference]',String(order.reference));
  form.set('metadata[source]','MING_EAGLE_STRIPE_CHECKOUT');
  form.set('billing_address_collection','required');
  let taxCustomer:string|undefined;
  if(taxMode==='STRIPE_AUTOMATIC'){
   taxCustomer=await fixedTaxCustomer(env,String(order.id),shippingAddress);
   form.set('customer',taxCustomer);form.set('automatic_tax[enabled]','true');
   form.set('metadata[tax_mode]',taxMode);form.set('metadata[tax_state]',shippingAddress.state!);
  }
  // Customer shipping address was confirmed and checked against a state tax policy
  // when the D1 order was created. Do not let Stripe collect a second, potentially
  // different delivery state after the fixed price and tax decision are recorded.
  if(isRetail)form.set('custom_text[submit][message]',
   'Delivery will be made to the US shipping address on your MING EAGLE order. Each set ships as a separate one-unit parcel with import duties included. Parcels may arrive separately. Final US sales tax is shown before payment.');
  if(!taxCustomer&&typeof order.email==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(order.email))
   form.set('customer_email',order.email);
  let index=0;
  for(const [name,amount] of [
   ['MING EAGLE products (order '+String(order.reference)+')',components[0]],
   ['Delivery and handling',components[1]],
   ['Applicable sales tax',components[2]]
  ] as [string,number][]){
   if(amount<=0)continue;
   form.set('line_items['+index+'][price_data][currency]','usd');
   form.set('line_items['+index+'][price_data][unit_amount]',String(amount));
   form.set('line_items['+index+'][price_data][product_data][name]',name);
   if(taxMode==='STRIPE_AUTOMATIC'){
    form.set('line_items['+index+'][price_data][tax_behavior]','exclusive');
    form.set('line_items['+index+'][price_data][product_data][tax_code]',index===0?'txcd_99999999':'txcd_92010001');
   }
   form.set('line_items['+index+'][quantity]','1');
   index++;
  }
  // Stable for concurrent requests; rotated daily so expired sessions can be replaced.
  const day=Math.floor(Date.now()/86400000);
  const requestKey='mingeagle-'+String(order.id)+'-'+String(due)+'-'+String(day)+(taxMode==='STRIPE_AUTOMATIC'?'-tax-v1':'');
  const response=await stripeApi(env,'checkout/sessions',{
   method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','idempotency-key':requestKey},
   body:form.toString()
  });
  if(!response.ok){console.error('stripe_checkout_create_failed',{status:response.status});return fail('Checkout could not be started.',502)}
  const session=await response.json() as {id?:string;url?:string;amount_total?:number;currency?:string;status?:string;
   customer?:string;automatic_tax?:{enabled?:boolean;status?:string};total_details?:{amount_tax?:number}};
  const salesTax=taxMode==='STRIPE_AUTOMATIC'?automaticTaxAmount(session,due):0;
  if(!stripeSessionMatchesMode(session.id,env.STRIPE_MODE)||!session.url||
     salesTax===null||session.amount_total!==due+Number(salesTax)||session.currency!=='usd'||
     (taxMode==='STRIPE_AUTOMATIC'&&session.customer!==taxCustomer)||
     (new URL(session.url).hostname!=='checkout.stripe.com'||new URL(session.url).protocol!=='https:'))
   return fail('Provider returned an invalid checkout session.',502);
  if(taxMode==='STRIPE_AUTOMATIC')await db.prepare(
   "INSERT OR IGNORE INTO payment_provider_sessions "+
   "(id,order_id,provider,provider_intent_id,request_id,amount,currency,status,tax_mode,base_amount_cents,tax_amount_cents,tax_state,tax_customer_id) "+
   "VALUES (?,?,'STRIPE',?,?,?,'USD','OPEN','STRIPE_AUTOMATIC',?,?,?,?)"
  ).bind(crypto.randomUUID(),String(order.id),session.id,requestKey,(due+Number(salesTax))/100,
   due,salesTax,shippingAddress.state!,taxCustomer!).run();
  else await db.prepare(
   "INSERT OR IGNORE INTO payment_provider_sessions "+
   "(id,order_id,provider,provider_intent_id,request_id,amount,currency,status) "+
   "VALUES (?,?,'STRIPE',?,?,?,'USD','OPEN')"
  ).bind(crypto.randomUUID(),String(order.id),session.id,requestKey,due/100).run();
  const stored=await db.prepare(
   "SELECT order_id FROM payment_provider_sessions WHERE provider='STRIPE' AND provider_intent_id=?"
  ).bind(session.id).first<{order_id:string}>();
  if(stored?.order_id!==String(order.id))return fail('Checkout session could not be recorded.',503);
  return Response.json({ok:true,url:session.url},{headers:{'cache-control':'no-store'}});
 }catch(e){
  console.error('stripe_checkout_error',{type:e instanceof Error?e.name:'unknown'});
  return fail('Secure checkout is temporarily unavailable.',503);
 }
};
