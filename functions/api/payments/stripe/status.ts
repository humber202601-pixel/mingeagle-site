import {QUOTE_PUBLIC_TOKEN_PREDICATE} from '../../../../lib/quote-public-token';
interface Env {MINGEAGLE_DB:D1Database}
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store','referrer-policy':'no-referrer'}});
export const onRequestGet:PagesFunction<Env>=async({request,env})=>{
 const token=new URL(request.url).searchParams.get('token')||'';
 if(!/^[a-f0-9]{64}$/i.test(token))return json({ok:false,error:'Invalid order link.'},400);
 if(!env.MINGEAGLE_DB)return json({ok:false,error:'Order database unavailable.'},503);
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
 const hash=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
 try{
  const order=await env.MINGEAGLE_DB.prepare(`SELECT o.reference,o.status,o.payment_status,o.total,o.currency,
   (SELECT COALESCE(SUM(p.amount),0) FROM payments p WHERE p.order_id=o.id AND p.status='RECEIVED') AS received,
   (SELECT COALESCE(SUM(p.amount),0) FROM payments p
     JOIN payment_provider_sessions s ON s.order_id=p.order_id AND s.provider='STRIPE'
      AND s.provider_intent_id=p.provider_reference AND s.status='SUCCEEDED'
     WHERE p.order_id=o.id AND p.provider='STRIPE' AND p.currency='USD'
      AND p.status='RECEIVED') AS stripe_verified_received,
   (SELECT COALESCE(SUM(p.amount),0) FROM payments p WHERE p.order_id=o.id
     AND p.status='RECEIVED' AND (p.provider IS NULL OR upper(p.provider)<>'STRIPE'))
      AS historical_other_received,
   (SELECT COUNT(*) FROM tasks t WHERE t.order_id=o.id AND t.type='PAYMENT'
    AND t.status IN ('OPEN','IN_PROGRESS')
    AND (t.title LIKE 'Review disputed Stripe receipts%'
      OR t.title LIKE 'Review payment on closed order%')) AS active_payment_review_count,
   (SELECT p.status FROM payment_provider_sessions p WHERE p.order_id=o.id AND p.provider='STRIPE' ORDER BY p.updated_at DESC,p.created_at DESC LIMIT 1) AS provider_status
   FROM quotes q JOIN orders o ON o.quote_id=q.id
   WHERE ${QUOTE_PUBLIC_TOKEN_PREDICATE}
   ORDER BY o.created_at DESC LIMIT 1`).bind(hash,hash).first<Record<string,unknown>>();
  if(!order)return json({ok:false,error:'Order not found.'},404);
  const total=Number(order.total),received=Number(order.received);
  const verifiedStripe=Number(order.stripe_verified_received||0),
    historicalOther=Number(order.historical_other_received||0);
  const providerStatus=String(order.provider_status||'').toUpperCase();
  const status=String(order.payment_status||'').toUpperCase();
  // New receipts must be reconciled across channels instead of using order
  // PAID alone as proof of a Stripe settlement. This is read-only evidence.
  const requiresManualReview=
    Number(order.active_payment_review_count || 0)>0 ||
    (verifiedStripe>0&&historicalOther>0) ||
    received>total+0.005 ||
    (providerStatus==='SUCCEEDED'&&status!=='PAID') ||
    // A historical PAID ledger flag alone is not provider-confirmed receipt.
    // Even with no Stripe session, or with a legitimate other-channel payment,
    // the buyer-facing status must ask staff to reconcile rather than
    // describing this order as cleared for fulfilment.
    (status==='PAID'&&(!Number.isFinite(total)||total<=0||
      verifiedStripe+0.005<total||historicalOther>0));
  return json({ok:true,provider:'STRIPE',orderReference:order.reference,orderStatus:order.status,
   paymentStatus:order.payment_status,providerStatus:order.provider_status||'',currency:order.currency,
   total,received,outstanding:Math.max(0,Math.round((total-received)*100)/100),
   stripeVerifiedReceived:Math.round(verifiedStripe*100)/100,
   historicalOtherReceived:Math.round(historicalOther*100)/100,
   requiresManualReview,
   paymentEvidence:requiresManualReview?'MANUAL_RECONCILIATION':
      verifiedStripe+0.005>=total&&status==='PAID'?'STRIPE_VERIFIED':
      historicalOther>0?'LEGACY_OR_OTHER':'AWAITING_STRIPE'});
 }catch{return json({ok:false,error:'Payment status temporarily unavailable.'},503)}
};
