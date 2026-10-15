// Read-only B2B order-payment attention. A converted quote, order row or
// payment provider session is not evidence of settled funds.
export type OrderSnapshot={
 id?:unknown; reference?:unknown; status?:unknown; payment_status?:unknown;
 paid_at?:unknown; amount_received?:unknown; [key:string]:unknown;
};
export function requiresPaymentReview(o:OrderSnapshot):boolean{
 const status=String(o.status||'').toUpperCase();
 const payment=String(o.payment_status||'').toUpperCase();
 if(['CANCELLED','REFUNDED','VOID'].includes(status))return false;
 if(status==='PAYMENT_PENDING')return true;
 // A PAID marker without a paid timestamp is a reconciliation exception.
 if(payment==='PAID'&&Boolean(o.paid_at))return false;
 return !['COMPLETED','CANCELLED'].includes(status)||payment!=='PAID'||!o.paid_at;
}
export function pendingPaymentReviews<T extends OrderSnapshot>(orders:T[]):T[]{
 return orders.filter(requiresPaymentReview).sort((a,b)=>{
  const rank=(o:OrderSnapshot)=>String(o.status||'').toUpperCase()==='PAYMENT_PENDING'?0:1;
  return rank(a)-rank(b)||String(a.reference||'').localeCompare(String(b.reference||''));
 });
}
