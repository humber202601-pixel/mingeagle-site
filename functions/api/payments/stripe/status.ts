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
   (SELECT p.status FROM payment_provider_sessions p WHERE p.order_id=o.id AND p.provider='STRIPE' ORDER BY p.updated_at DESC,p.created_at DESC LIMIT 1) AS provider_status
   FROM quotes q JOIN orders o ON o.quote_id=q.id
   WHERE q.public_token_hash=? OR EXISTS (SELECT 1 FROM quote_public_links l WHERE l.quote_id=q.id AND l.token_hash=? AND l.revoked_at IS NULL)
   ORDER BY o.created_at DESC LIMIT 1`).bind(hash,hash).first<Record<string,unknown>>();
  if(!order)return json({ok:false,error:'Order not found.'},404);
  const total=Number(order.total),received=Number(order.received);
  return json({ok:true,provider:'STRIPE',orderReference:order.reference,orderStatus:order.status,
   paymentStatus:order.payment_status,providerStatus:order.provider_status||'',currency:order.currency,
   total,received,outstanding:Math.max(0,Math.round((total-received)*100)/100)});
 }catch{return json({ok:false,error:'Payment status temporarily unavailable.'},503)}
};
