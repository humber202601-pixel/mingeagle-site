interface Env {
 MINGEAGLE_DB:D1Database;
 STRIPE_WEBHOOK_SECRET?:string;
}
type CheckoutSession={
 id?:string;client_reference_id?:string;payment_status?:string;status?:string;
 amount_total?:number;currency?:string;metadata?:{order_id?:string;order_reference?:string};
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
  if(!session?.id?.startsWith('cs_'))return invalid('Missing checkout session',409);
  const matched=await db.prepare(
   "SELECT order_id,amount,currency,status FROM payment_provider_sessions "+
   "WHERE provider='STRIPE' AND provider_intent_id=? LIMIT 1"
  ).bind(session.id).first<{order_id:string;amount:number;currency:string;status:string}>();
  // Out-of-order Stripe notification: retry until the session is saved.
  if(!matched)return invalid('Unknown checkout session',409);
  const order=await db.prepare(
   "SELECT id,reference,lead_id,company_id,contact_id,total,currency,payment_status "+
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
  const fullyPaid=received>=orderTotal;
  const overpaid=received>orderTotal;
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
  if(overpaid){
   await db.prepare(
    "INSERT INTO tasks (id,lead_id,company_id,contact_id,order_id,type,title,description,status,priority,due_at) "+
    "SELECT ?,?,?,?,?,'PAYMENT',?,?,'OPEN','URGENT',CURRENT_TIMESTAMP "+
    "WHERE NOT EXISTS(SELECT 1 FROM tasks WHERE order_id=? AND type='PAYMENT' AND title LIKE 'Review overpayment%' AND status IN ('OPEN','IN_PROGRESS'))"
   ).bind(crypto.randomUUID(),order.lead_id||null,order.company_id||null,order.contact_id||null,
    matched.order_id,'Review overpayment for '+String(order.reference),
    'Review duplicate Stripe/Airwallex payments and refund the excess.',matched.order_id).run();
  }
  await processed();
  return Response.json({ok:true,paymentStatus:fullyPaid?'PAID':'PARTIAL'});
 }catch(e){
  console.error('stripe_webhook_processing_error',{type:e instanceof Error?e.name:'unknown'});
  return invalid('Webhook processing failed',503);
 }
};
