/**
 * A signed late payment event is valid accounting evidence, not authorization
 * to reopen a previously cancelled order or to reverse a refund.
 */
export function requiresClosedOrderPaymentReview(order:{status?:unknown;payment_status?:unknown}):boolean{
  return String(order.status||'').toUpperCase()==='CANCELLED'
    ||String(order.payment_status||'').toUpperCase()==='REFUNDED';
}
