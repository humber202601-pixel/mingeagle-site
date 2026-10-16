import {requiresClosedOrderPaymentReview} from '../../../../lib/closed-order-payment';
import {stripeSessionMatchesMode} from '../../../_shared/stripe';
import {automaticTaxAmount} from '../../../_shared/retail-stripe-tax';

interface Env {
 MINGEAGLE_DB:D1Database;
 STRIPE_WEBHOOK_SECRET?:string;
 STRIPE_MODE?:string;
}
type CheckoutSession={
 id?:string;client_reference_id?:string;payment_link?:string|null;payment_status?:string;status?:string;
 amount_total?:number;currency?:string;customer?:string;automatic_tax?:{enabled?:boolean;status?:string};
 total_details?:{amount_tax?:number};metadata?:{order_id?:string;order_reference?:string;purpose?:string;charge?:string;tax_mode?:string;tax_state?:string};
};
type Event={id?:string;type?:string;data?:{object?:CheckoutSession}};
const invalid=(reason:string,status=400)=>new Response(reason,{status,headers:{'cache-control':'no-store'}});
function constantTimeEqual(a:string,b:string){
 if(a.length!==b.length)return false;
 let difference=0;for(let i=0;i<a.length;i++)difference|=a.charCodeAt(i)^b.charCodeAt(i);
 return difference===0;
}
export async function verifyStripeSignature(body:string,header:string,secret:string,now=Date.now()){
 if(!secret.startsWith('whsec_'))return false;
 const entries=header.split(',').map(x=>x.trim());
 const timestamp=entries.find(x=>x.startsWith('t='))?.slice(2);
 const candidates=entries.filter(x=>x.startsWith('v1=')).map(x=>x.slice(3).toLowerCase());
 if(!timestamp||!candidates.length||!/^\d+$/.test(timestamp))return false;
 if(Math.abs(now-Number(timestamp)*1000)>300000)return false;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),
  {name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature=await crypto.subtle.sign('HMAC',key,
  new TextEncoder().encode(timestamp+'.'+body));
 const expected=Array.from(new Uint8Array(signature)).map(x=>x.toString(16).padStart(2,'0')).join('');
 return candidates.some(x=>constantTimeEqual(x,expected));
}
export const onRequestPost:PagesFunction<Env>=async({request,env})=>{
 if(!env.MINGEAGLE_DB)return invalid('Database unavailable',503);
 const secret=String(env.STRIPE_WEBHOOK_SECRET||'');
 if(!secret)return invalid('Webhook not configured',503);
 const raw=await request.text();
 if(raw.length>250000)return invalid('Payload too large',413);
 if(!await verifyStripeSignature(raw,request.headers.get('stripe-signature')||'',secret))
  return invalid('Invalid Stripe signature',401);
 let event:Event;
 try{event=JSON.parse(raw)}catch{return invalid('Invalid JSON')}
 if(!event.id||!event.type)return invalid('Invalid event',400);
 const db=env.MINGEAGLE_DB;
 const handled=new Set(['checkout.session.completed','checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed','checkout.session.expired']);
 try{
  await db.prepare("INSERT OR IGNORE INTO payment_webhook_events(provider,event_id,event_name) VALUES ('STRIPE',?,?)")
   .bind(event.id,event.type).run();
  const entry=await db.prepare("SELECT processed_at FROM payment_webhook_events WHERE provider='STRIPE' AND event_id=?")
   .bind(event.id).first<{processed_at:string|null}>();
  if(entry?.processed_at)return Response.json({ok:true,duplicate:true});
  async function processed(){
   await db.prepare("UPDATE payment_webhook_events SET processed_at=CURRENT_TIMESTAMP WHERE provider='STRIPE' AND event_id=?")
    .bind(event.id).run();
  }
  if(!handled.has(event.type)){await processed();return Response.json({ok:true,ignored:true})}
  const session=event.data?.object;
  if(!session?.id||!stripeSessionMatchesMode(session.id,env.STRIPE_MODE))
   return invalid('Checkout session mode mismatch',409);
  // The authenticated launch probe creates and expires an unpaid provider
  // session, never a CRM order. A real signed expiry can prove live delivery
  // without inventing payment or fulfillment records.
  if(event.type==='checkout.session.expired'&&session.client_reference_id==='ME-LAUNCH-CHECK-NOT-AN-ORDER'
    &&session.metadata?.purpose==='MING_EAGLE_LAUNCH_PROBE_NO_PAYMENT'&&!session.metadata.order_id){
   await processed();return Response.json({ok:true,ignored:true,launchProbe:true});
  }
  // Owner-approved one-off live $0.50 connectivity payment came through a
  // standalone Stripe Payment Link, not our order-specific Checkout API.
  // Acknowledge only this precisely identified signed test event, so Stripe
  // does not retry forever. Never create a CRM order/payment or fulfilment.
  if(event.type==='checkout.session.completed' &&
     env.STRIPE_MODE==='live' &&
     session.payment_link==='plink_1UR4X56ggh6j2Fv09VrTJNum' &&
     !session.client_reference_id &&
     !session.metadata?.order_id && !session.metadata?.order_reference &&
     session.metadata?.purpose==='live_payment_verification_20261016_3' &&
     session.metadata?.charge==='USER_REQUESTED_050_USD' &&
     session.payment_status==='paid' &&
     session.currency?.toLowerCase()==='usd' && session.amount_total===50){
    await processed();
    return Response.json({ok:true,ignored:true,standaloneLiveVerification:true});
  }
  const matched=await db.prepare(
   "SELECT order_id,amount,currency,status,tax_mode,base_amount_cents,tax_amount_cents,tax_state,tax_customer_id FROM payment_provider_sessions "+
   "WHERE provider='STRIPE' AND provider_intent_id=? LIMIT 1"
  ).bind(session.id).first<{order_id:string;amount:number;currency:string;status:string;tax_mode?:string;
   base_amount_cents?:number;tax_amount_cents?:number;tax_state?:string;tax_customer_id?:string}>();
  // Out-of-order Stripe notification: retry until the session is saved.
  if(!matched)return invalid('Unknown checkout session',409);
  const order=await db.prepare(
   "SELECT id,reference,lead_id,company_id,contact_id,total,currency,payment_status,subtotal,discount,shipping,tax,shipping_address,status,quote_id "+
   "FROM orders WHERE id=? LIMIT 1"
  ).bind(matched.order_id).first<Record<string,unknown>>();
  if(!order)return invalid('Order missing',409);
  if(session.client_reference_id!==order.reference||
     session.metadata?.order_id!==order.id||
     session.metadata?.order_reference!==order.reference)
   return invalid('Order identity mismatch',409);
  const status=event.type==='checkout.session.expired'?'EXPIRED':
   event.type==='checkout.session.async_payment_failed'?'FAILED':
   session.payment_status==='paid'?'SUCCEEDED':'PENDING';
  if(status==='SUCCEEDED'){
   const expected=Math.round(Number(matched.amount)*100);
   if(session.currency?.toLowerCase()!=='usd'||matched.currency.toUpperCase()!=='USD'||
      !Number.isSafeInteger(session.amount_total)||expected!==session.amount_total)
    return invalid('Payment amount or currency mismatch',409);
   if(matched.tax_mode==='STRIPE_AUTOMATIC'){
    const base=Math.round((Number(order.subtotal)-Number(order.discount)+Number(order.shipping))*100);
    let address:{state?:string;country?:string};
    try{address=JSON.parse(String(order.shipping_address||'null'))}catch{return invalid('Tax address missing',409)}
    if(!Number.isSafeInteger(base)||
     matched.base_amount_cents!==base||automaticTaxAmount(session,base)!==matched.tax_amount_cents||
     session.metadata?.tax_mode!=='STRIPE_AUTOMATIC'||session.metadata.tax_state!==matched.tax_state||
     address?.state!==matched.tax_state||address?.country!=='US'||session.customer!==matched.tax_customer_id)
     return invalid('Automatic tax confirmation mismatch',409);
    if(!requiresClosedOrderPaymentReview(order)){
    const totals=await db.batch([
     db.prepare('UPDATE orders SET tax=?,total=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
      .bind(Number(matched.tax_amount_cents)/100,expected/100,matched.order_id),
     db.prepare("UPDATE quotes SET tax=?,total=?,notes='Stripe-confirmed sales tax for the order delivery address',updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .bind(Number(matched.tax_amount_cents)/100,expected/100,String(order.quote_id))
    ]);
    if(totals.length!==2||totals.some(r=>!r.success)||totals.some(r=>Number(r.meta?.changes)!==1))
     return invalid('Tax totals could not be recorded',503);
    order.total=expected/100;
    }
   }else if(session.metadata?.tax_mode==='STRIPE_AUTOMATIC'||session.automatic_tax?.enabled===true)
    return invalid('Unexpected automatic tax session',409);
  }
  await db.prepare("UPDATE payment_provider_sessions "+
   "SET status=CASE WHEN status='SUCCEEDED' THEN status ELSE ? END,updated_at=CURRENT_TIMESTAMP "+
   "WHERE provider='STRIPE' AND provider_intent_id=?")
   .bind(status,session.id).run();

  if(status!=='SUCCEEDED'){
   await processed();
   return Response.json({ok:true,awaitingPayment:status==='PENDING'});
  }
  const amount=Number(matched.amount);
  // Idempotency: provider/reference unique index already created in migration 0003.
  const inserted=await db.prepare(
   "INSERT OR IGNORE INTO payments "+
   "(id,order_id,method,provider,provider_reference,amount,currency,status,received_at,notes) "+
   "VALUES (?,?,'ONLINE_PAYMENT','STRIPE',?,?,'USD','RECEIVED',CURRENT_TIMESTAMP,?)"
  ).bind(crypto.randomUUID(),matched.order_id,session.id,amount,
    'Stripe verified Checkout session '+String(event.id)).run();
  const totals=await db.prepare(
   "SELECT COALESCE(SUM(amount),0) AS received FROM payments WHERE order_id=? AND status='RECEIVED'"
  ).bind(matched.order_id).first<{received:number}>();
  const received=Math.round(Number(totals?.received||0)*100);
  const orderTotal=Math.round(Number(order.total||0)*100);
  // Record a verified late payment, but NEVER reopen a cancelled/refunded
  // order or schedule fulfillment. A human must reconcile/refund it.
  if(requiresClosedOrderPaymentReview(order)){
   await db.prepare(
    "INSERT INTO tasks(id,lead_id,company_id,contact_id,order_id,type,title,description,status,priority,due_at) "+
    "SELECT ?,?,?,?,?,'PAYMENT',?,?,'OPEN','URGENT',CURRENT_TIMESTAMP "+
    "WHERE NOT EXISTS(SELECT 1 FROM tasks WHERE order_id=? AND type='PAYMENT' "+
    "AND title LIKE 'Review payment on closed order%' AND status IN ('OPEN','IN_PROGRESS'))"
   ).bind(crypto.randomUUID(),order.lead_id||null,order.company_id||null,order.contact_id||null,
    matched.order_id,'Review payment on closed order '+String(order.reference),
    'Stripe reports settled funds for a cancelled or refunded order. Verify processor settlement, refund and fulfillment hold. Do not ship.',matched.order_id).run();
   if(Number(inserted.meta?.changes||0)>0)await db.prepare(
    "INSERT INTO activities(id,entity_type,entity_id,activity_type,title,description,metadata_json) "+
    "VALUES(?,'ORDER',?,'PAYMENT_CLOSED_ORDER_REVIEW',?,?,?)"
   ).bind(crypto.randomUUID(),matched.order_id,'Payment on cancelled/refunded order needs review',
    'Verified Stripe receipt recorded; automatic fulfillment blocked.',
    JSON.stringify({provider:'STRIPE',sessionId:session.id,eventId:event.id})).run();
   await processed();
   return Response.json({ok:true,requiresManualReview:true,fulfillmentBlocked:true});
  }
  // An authenticated Stripe event is evidence of a receipt, but manual
  // bank/legacy receipts cannot be combined with it to authorize shipping.
  // A second settlement beyond the quoted total must also be reviewed.
  const nonStripeReceipts=await db.prepare(
    "SELECT COUNT(*) AS entries FROM payments WHERE order_id=? AND status='RECEIVED' "+
    "AND (provider IS NULL OR upper(provider)<>'STRIPE')"
  ).bind(matched.order_id).first<{entries:number}>();
  const fullyPaid=received>=orderTotal;
  const overpaid=received>orderTotal;
  const mixedReceipts=Number(nonStripeReceipts?.entries||0)>0;
  const alreadyMarkedPaid=String(order.payment_status||'').toUpperCase()==='PAID';
  const newlyRecorded=Number(inserted.meta?.changes||0)>0;
  if(mixedReceipts||overpaid||(alreadyMarkedPaid&&newlyRecorded)){
   const reason=mixedReceipts
    ?'Mixed Stripe and historical/manual received payments'
    :overpaid?'Stripe-related receipts exceed the agreed order total'
    :'Another Stripe receipt was recorded after the order had been marked paid';
   await db.prepare(
    "INSERT INTO tasks(id,lead_id,company_id,contact_id,order_id,type,title,description,status,priority,due_at) "+
    "SELECT ?,?,?,?,?,'PAYMENT',?,?,'OPEN','URGENT',CURRENT_TIMESTAMP "+
    "WHERE NOT EXISTS(SELECT 1 FROM tasks WHERE order_id=? AND type='PAYMENT' "+
    "AND title LIKE 'Review disputed Stripe receipts%' AND status IN ('OPEN','IN_PROGRESS'))"
   ).bind(crypto.randomUUID(),order.lead_id||null,order.company_id||null,
     order.contact_id||null,matched.order_id,
     'Review disputed Stripe receipts for '+String(order.reference),
     reason+'. Confirm with Stripe Dashboard and the original sales records. Hold automatic fulfillment and avoid duplicate charges/refunds.',matched.order_id).run();
   if(newlyRecorded)await db.prepare(
    "INSERT INTO activities(id,entity_type,entity_id,activity_type,title,description,metadata_json) "+
    "VALUES(?,'ORDER',?,'PAYMENT_RECONCILIATION_REQUIRED',?,?,?)"
   ).bind(crypto.randomUUID(),matched.order_id,'Stripe payment needs manual reconciliation',
    reason+'. Verified Stripe receipt saved; fulfillment not automatically released.',
    JSON.stringify({provider:'STRIPE',sessionId:session.id,eventId:event.id,
      mixedReceipts,overpaid,alreadyMarkedPaid})).run();
   // Preserve any existing PAID/REFUNDED status for audit, but do not
   // convert a previously UNPAID order to PAID from mixed receipts.
   await processed();
   return Response.json({ok:true,requiresManualReview:true,fulfillmentBlocked:true,
     paymentStatus:String(order.payment_status)});
  }
  if(fullyPaid){
   await db.prepare(
    "UPDATE orders SET payment_status='PAID',"+
    "status=CASE WHEN status IN ('DRAFT','CONFIRMED','PAYMENT_PENDING') THEN 'PAID' ELSE status END,"+
    "paid_at=COALESCE(paid_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=?"
   ).bind(matched.order_id).run();
   await db.prepare(
    "UPDATE tasks SET status='DONE',completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP "+
    "WHERE order_id=? AND type='PAYMENT' AND status IN ('OPEN','IN_PROGRESS')"
   ).bind(matched.order_id).run();
   await db.prepare(
    "INSERT INTO tasks (id,lead_id,company_id,contact_id,order_id,type,title,description,status,priority,due_at) "+
    "SELECT ?,?,?,?,?,'FULFILLMENT',?,?,'OPEN','HIGH',datetime('now','+1 day') "+
    "WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE order_id=? AND type='FULFILLMENT' AND status IN ('OPEN','IN_PROGRESS'))"
   ).bind(crypto.randomUUID(),order.lead_id||null,order.company_id||null,order.contact_id||null,
    matched.order_id,'Start processing '+String(order.reference),
    'Stripe payment confirmed. Prepare fulfillment.',matched.order_id).run();
   if(order.lead_id)await db.prepare(
    "UPDATE leads SET status='WON',next_best_action='Start fulfillment',"+
    "next_action_at=datetime('now','+1 day'),updated_at=CURRENT_TIMESTAMP WHERE id=?"
   ).bind(order.lead_id).run();
  }else{
   await db.prepare(
    "UPDATE orders SET payment_status='PARTIAL',status='PAYMENT_PENDING',updated_at=CURRENT_TIMESTAMP WHERE id=?"
   ).bind(matched.order_id).run();
  }
  if(Number(inserted.meta?.changes||0)>0){
   await db.prepare(
    "INSERT INTO activities(id,entity_type,entity_id,activity_type,title,description,metadata_json) "+
    "VALUES(?,'ORDER',?,'PAYMENT_RECEIVED',?,?,?)"
   ).bind(crypto.randomUUID(),matched.order_id,'Stripe payment confirmed',
    String(order.reference)+' '+amount.toFixed(2)+' USD',
    JSON.stringify({provider:'STRIPE',sessionId:session.id,eventId:event.id})).run();
  }
  await processed();
  return Response.json({ok:true,paymentStatus:fullyPaid?'PAID':'PARTIAL'});
 }catch(e){
  console.error('stripe_webhook_processing_error',{type:e instanceof Error?e.name:'unknown'});
  return invalid('Webhook processing failed',503);
 }
};
