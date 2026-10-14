import {stripeApi, stripeCheckoutReadiness, stripeSessionMatchesMode, type StripeEnv} from '../../../_shared/stripe';
import {noSalesTaxCollectionRequired,type RetailTaxEnv} from '../../../../lib/retail-tax-policy';
import {oneItemUsAirParcel} from '../../../../lib/us-small-parcel';

interface Env extends StripeEnv,RetailTaxEnv {
  MINGEAGLE_DB: D1Database;
  STRIPE_TAX_POLICY_APPROVED?:string;
  RETAIL_CHECKOUT_ENABLED?:string;
  RETAIL_STOCK_FULFILLMENT_APPROVED?:string;
  RETAIL_TAX_POLICY_APPROVED?:string;
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
   "q.status AS quote_status,q.valid_until,q.reference AS quote_reference,ct.email AS email,"+
   "(SELECT COALESCE(SUM(amount),0) FROM payments WHERE order_id=o.id AND status='RECEIVED') AS received "+
   "FROM quotes q JOIN orders o ON o.quote_id=q.id LEFT JOIN contacts ct ON ct.id=o.contact_id "+
   "WHERE q.public_token_hash=? OR EXISTS (SELECT 1 FROM quote_public_links l "+
   "WHERE l.quote_id=q.id AND l.token_hash=? AND l.revoked_at IS NULL) "+
   "ORDER BY o.created_at DESC LIMIT 1"
  ).bind(hash,hash).first<RecordRow>();
  if(!order)return fail('Order not found.',404);
  if(['CANCELLED','REFUNDED'].includes(String(order.status)))return fail('Order is not payable.',409);
  const isRetail=String(order.reference).startsWith('ME-RO-');
  if(isRetail&&env.RETAIL_CHECKOUT_ENABLED!=='true')
   return fail('Direct retail payment is not activated.',503);
  if(isRetail&&(env.RETAIL_STOCK_FULFILLMENT_APPROVED!=='true'||env.RETAIL_TAX_POLICY_APPROVED!=='true'))
   return fail('Retail stock, shipping and tax approval is required.',503);
  if(isRetail){
   let ship:{state?:string;country?:string};
   try{ship=JSON.parse(String(order.shipping_address||'null'))}catch{return fail('Retail shipping address requires review.',409)}
   const state=String(ship?.state||'').toUpperCase();
   if(ship?.country!=='US'||!noSalesTaxCollectionRequired(env,state))
    return fail('This delivery state has not been approved for zero sales-tax collection.',409);
   const orderItems=await db.prepare('SELECT description,quantity,unit_price FROM order_items WHERE order_id=?')
    .bind(String(order.id)).all<{description:string;quantity:number;unit_price:number}>();
   const items=orderItems.results||[];
   const sku=/^([A-Z0-9-]+) \/ /.exec(String(items[0]?.description||''))?.[1]||'';
   const confirmed=oneItemUsAirParcel(sku,'US','air',Number(items[0]?.quantity));
   if(items.length!==1||!confirmed?.ddpConfirmed||Number(items[0].quantity)!==1||
      Math.round(Number(items[0].unit_price)*100)!==Math.round(confirmed.productUSD*100)||
      Math.round(Number(order.subtotal)*100)!==Math.round(confirmed.productUSD*100)||
      Math.round(Number(order.shipping)*100)!==Math.round(confirmed.shippingUSD*100)||
      Math.round(Number(order.tax)*100)!==0||Math.round(Number(order.discount)*100)!==0)
    return fail('Duty-paid delivery is not verified for the requested products.',409);
  }
  if(!isRetail&&!['ACCEPTED','CONVERTED'].includes(String(order.quote_status)))
   return fail('Please accept the quotation before paying.',409);
  const received=cents(order.received);
  const total=cents(order.total),due=total-received;
  if(String(order.payment_status)==='PAID'||due<=0)return fail('Already paid.',409);
  if(!Number.isSafeInteger(due)||due<50||due>10000000||String(order.currency).toUpperCase()!=='USD')
   return fail('Invalid payment amount or currency.',409);
  if(received>0)return fail('Part-paid orders require an updated payment link from MING EAGLE.',409);
  const components=[cents(Number(order.subtotal)-Number(order.discount)),cents(order.shipping),cents(order.tax)];
  if(components.some(x=>!Number.isSafeInteger(x)||x<0)||components.reduce((a,b)=>a+b,0)!==due)
   return fail('Order total does not reconcile.',409);

  // Stripe idempotency protects concurrent browser clicks for this order/amount.
  // Retrieve a previous session if still open; never trust a return URL from the browser.
  const old=await db.prepare(
   "SELECT provider_intent_id FROM payment_provider_sessions "+
   "WHERE order_id=? AND provider='STRIPE' AND amount=? AND currency='USD' "+
   "AND status IN ('OPEN','PENDING') ORDER BY created_at DESC LIMIT 1"
  ).bind(String(order.id),due/100).first<{provider_intent_id:string}>();
  if(old?.provider_intent_id){
   if(!stripeSessionMatchesMode(old.provider_intent_id,env.STRIPE_MODE))
    return fail('Existing checkout session does not match the configured Stripe mode.',409);
   const previous=await stripeApi(env,'checkout/sessions/'+encodeURIComponent(old.provider_intent_id));
   if(previous.ok){
    const last=await previous.json() as {status?:string;payment_status?:string;url?:string};
    if(last.payment_status==='paid')return fail('Payment is processing confirmation. Do not pay twice.',409);
    if(last.status==='open'&&typeof last.url==='string'&&new URL(last.url).hostname==='checkout.stripe.com')
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
  // Customer shipping address was confirmed and checked against a state tax policy
  // when the D1 order was created. Do not let Stripe collect a second, potentially
  // different delivery state after the fixed price and tax decision are recorded.
  if(isRetail)form.set('custom_text[submit][message]',
   'Delivery will be made to the US shipping address on your MING EAGLE order. The seller covers confirmed import duties for this item; US sales tax is reviewed separately.');
  if(typeof order.email==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(order.email))
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
   form.set('line_items['+index+'][quantity]','1');
   index++;
  }
  // Stable for concurrent requests; rotated daily so expired sessions can be replaced.
  const day=Math.floor(Date.now()/86400000);
  const requestKey='mingeagle-'+String(order.id)+'-'+String(due)+'-'+String(day);
  const response=await stripeApi(env,'checkout/sessions',{
   method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','idempotency-key':requestKey},
   body:form.toString()
  });
  if(!response.ok){console.error('stripe_checkout_create_failed',{status:response.status});return fail('Checkout could not be started.',502)}
  const session=await response.json() as {id?:string;url?:string;amount_total?:number;currency?:string;status?:string};
  if(!stripeSessionMatchesMode(session.id,env.STRIPE_MODE)||!session.url||
     session.amount_total!==due||session.currency!=='usd'||
     new URL(session.url).hostname!=='checkout.stripe.com')
   return fail('Provider returned an invalid checkout session.',502);
  await db.prepare(
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
