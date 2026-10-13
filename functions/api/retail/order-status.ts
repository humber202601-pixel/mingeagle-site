interface Env {MINGEAGLE_DB:D1Database}
const fail=(msg:string,status=400)=>Response.json({ok:false,error:msg},{status,headers:{'cache-control':'no-store'}});
export const onRequestGet:PagesFunction<Env>=async({request,env})=>{
 const id=new URL(request.url).searchParams.get('requestId')||'';
 if(!/^[a-f0-9-]{36}$/i.test(id))return fail('Invalid order request ID');
 if(!env.MINGEAGLE_DB)return fail('Order records unavailable',503);
 try{
 const x=await env.MINGEAGLE_DB.prepare("SELECT r.order_reference,o.payment_status,o.status FROM retail_checkout_requests r JOIN orders o ON o.id=r.order_id WHERE r.request_id=?")
  .bind(id).first<{order_reference:string;payment_status:string;status:string}>();
 if(!x)return fail('Order not found',404);
 return Response.json({ok:true,orderReference:x.order_reference,paymentStatus:x.payment_status,orderStatus:x.status},
  {headers:{'cache-control':'private, no-store','access-control-allow-origin':'https://www.mingeagle.com','vary':'Origin'}});
 }catch{return fail('Order status temporarily unavailable',503)}
};
