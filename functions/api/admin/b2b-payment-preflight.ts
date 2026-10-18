// Admin-only, read-only B2B order / Stripe readiness. This is a diagnostic,
// not authorization to charge or to assert state sales-tax compliance.
// /api/admin/_middleware.ts already requires the owner access key.
import {acceptedB2bQuotePayable} from '../../../lib/b2b-stripe-eligibility';
import {stripeCheckoutTermsSupported} from '../../../lib/b2b-quote-terms';
import {acceptedB2bItemSnapshotMatches} from '../../../lib/b2b-line-snapshot';
import {isUsDeliveryState} from '../../../lib/us-delivery-states';
import {stripeCheckoutReadiness,type StripeEnv} from '../../_shared/stripe';

interface Env extends StripeEnv {
 MINGEAGLE_DB?:D1Database;
 STRIPE_TAX_POLICY_APPROVED?:string;
 STRIPE_RETAIL_ONLY_ENABLED?:string;
 STRIPE_B2B_CHECKOUT_ENABLED?:string;
 STRIPE_B2B_TAX_POLICY_APPROVED?:string;
 STRIPE_B2B_APPROVED_US_STATES?:string;
}
type R=Record<string,unknown>;
const response=(body:Record<string,unknown>,code=200)=>Response.json(body,{status:code,headers:{
 'cache-control':'private, no-store','x-content-type-options':'nosniff',
 'referrer-policy':'no-referrer',
}});
const cents=(v:unknown)=>typeof v==='number'||typeof v==='string'
 ?Math.round(Number(v)*100):NaN;
const equalsMoney=(a:unknown,b:unknown)=>Number.isSafeInteger(cents(a))&&
 Number.isSafeInteger(cents(b))&&cents(a)===cents(b);
const approvedStates=(s:string)=>new Set(s.split(',').map(x=>x.trim().toUpperCase())
 .filter(x=>isUsDeliveryState(x)));
function addressState(value:unknown):string|null{
 let addr:R;
 try{addr=JSON.parse(String(value||'null')) as R}catch{return null}
 if(!addr||typeof addr!=='object'||Array.isArray(addr))return null;
 const state=String(addr.state||'');
 if(addr.country!=='US'||!isUsDeliveryState(state)||
  String(addr.city||'').trim().length<2||
  String(addr.postalCode||addr.postal_code||'').trim().length<5||
  String(addr.line1||addr.address1||'').trim().length<5)return null;
 return state;
}
export function reviewB2bStripeOrder(row:R,quoteLines:R[],orderLines:R[],env:Env){
 const blockers:string[]=[];
 const add=(code:string)=>{if(!blockers.includes(code))blockers.push(code)};
 const payment=stripeCheckoutReadiness(env);
 if(!payment.checkoutReady||payment.mode!=='live'||env.STRIPE_TAX_POLICY_APPROVED!=='true'||
  env.STRIPE_RETAIL_ONLY_ENABLED==='true'||env.STRIPE_B2B_CHECKOUT_ENABLED!=='true'||
  env.STRIPE_B2B_TAX_POLICY_APPROVED!=='true')add('LIVE_B2B_STRIPE_CONFIG_NOT_READY');
 if(row.order_status==='CANCELLED'||row.order_status==='REFUNDED'||row.order_status==='COMPLETED'||
  row.order_status==='VOID')add('CLOSED_ORDER_NO_NEW_CHECKOUT');
 if(row.payment_status==='PAID'){
  add('ALREADY_MARKED_PAID_NO_NEW_CHECKOUT');
  if(Number(row.stripe_settled_receipts||0)<Number(row.order_total||0)-0.005)
   add('PAID_NOT_FULLY_RECONCILED_VIA_STRIPE');
 }else if(!['UNPAID','PARTIAL'].includes(String(row.payment_status||'')))
  add('PAYMENT_STATUS_NOT_ELIGIBLE');
 if(Number(row.active_payment_reviews||0)>0)add('OPEN_STRIPE_RECONCILIATION_REVIEW');
 if(!stripeCheckoutTermsSupported(row.payment_terms))add('QUOTE_STRIPE_TERMS_MISSING');
 if(!acceptedB2bQuotePayable({
  status:row.quote_status,sent_at:row.quote_sent_at,accepted_at:row.quote_accepted_at,
  payment_terms:row.payment_terms,shipping_terms:row.shipping_terms,valid_until:row.valid_until
 }))add('QUOTE_ACCEPTANCE_OR_VALIDITY_NOT_PAYABLE');
 const state=addressState(row.shipping_address);
 if(!state)add('COMPLETE_US_DELIVERY_ADDRESS_REQUIRED');
 const quotedState=String(row.shipping_terms||'').toUpperCase()
  .match(/SHIP-TO STATE:\s*([A-Z]{2})(?![A-Z])/)?.[1]||null;
 if(!state||quotedState!==state)add('ACCEPTED_QUOTE_SHIP_STATE_MISMATCH');
 if(!state||!approvedStates(String(env.STRIPE_B2B_APPROVED_US_STATES||'')).has(state))
  add('DESTINATION_NOT_IN_APPROVED_B2B_SCOPE');
 if(!String(row.tax_basis||'').trim())add('SALES_TAX_BASIS_NOT_DOCUMENTED');
 if(!equalsMoney(row.order_subtotal,row.quote_subtotal)||
  !equalsMoney(row.order_discount,row.quote_discount)||
  !equalsMoney(row.order_shipping,row.quote_shipping)||
  !equalsMoney(row.order_tax,row.quote_tax)||
  !equalsMoney(row.order_total,row.quote_total)||
  String(row.order_currency||'').toUpperCase()!==String(row.quote_currency||'').toUpperCase())
  add('ACCEPTED_QUOTE_AMOUNT_CHANGED');
 if(!acceptedB2bItemSnapshotMatches(quoteLines,orderLines,row.quote_subtotal,row.order_subtotal))
  add('ACCEPTED_QUOTE_ITEMS_CHANGED_OR_MISSING');
 const received=cents(row.total_received||0),total=cents(row.order_total);
 const due=total-received;
 if(!Number.isSafeInteger(due)||due<50||due>10000000||
  String(row.order_currency||'').toUpperCase()!=='USD')add('PAYMENT_AMOUNT_OR_CURRENCY_INVALID');
 if(received>0&&row.payment_status!=='PAID')add('PARTIAL_RECEIPT_NEEDS_MANUAL_REVIEW');
 const components=[cents(row.order_subtotal)-cents(row.order_discount),
  cents(row.order_shipping),cents(row.order_tax)];
 if(components.some(x=>!Number.isSafeInteger(x)||x<0)||
   components.reduce((a,b)=>a+b,0)!==total)add('ORDER_TOTAL_NOT_RECONCILED');
 if(!Number.isSafeInteger(Number(row.wholesale_units))||Number(row.wholesale_units)<10)
  add('NOT_WHOLESALE_QUANTITY');
 const verifiedSettled=Number(row.stripe_settled_receipts||0)>=Number(row.order_total||0)-0.005 &&
  Number(row.stripe_session_count||0)>0;
 return {
  reference:String(row.order_reference||''),
  orderStatus:String(row.order_status||'UNKNOWN'),
  paymentStatus:String(row.payment_status||'UNKNOWN'),
  wholesaleUnits:Number(row.wholesale_units||0),
  stripeCheckoutSessions:Number(row.stripe_session_count||0),
  stripePaymentReconciled:row.payment_status==='PAID'&&verifiedSettled,
  codeChecksPassed:blockers.length===0,
  blockers,
  manualSalesTaxDeterminationStillRequired:true,
  nextAction:row.payment_status==='PAID'
   ?'VERIFY_EXISTING_PAYMENT_EVIDENCE_NO_NEW_CHARGE'
   :blockers.some(x=>/QUOTE|TAX_BASIS|SHIP_STATE/.test(x))
     ?'PREPARE_NEW_REVIEWED_QUOTE_AND_REOBTAIN_BUYER_ACCEPTANCE'
     :blockers.length?'MANUAL_ORDER_AND_STRIPE_REVIEW':'FINAL_MANUAL_TAX_AND_CHARGE_APPROVAL'
 };
}

export const onRequestGet:PagesFunction<Env>=async({env})=>{
 const db=env.MINGEAGLE_DB;
 if(!db)return response({ok:false,code:'D1_UNAVAILABLE'},503);
 try{
  // Deliberately do not select names, emails, full addresses or token hashes.
  // Count is bounded to 51 records and never alters the orders.
  const rows=await db.prepare(`
   SELECT o.id AS order_id,o.reference AS order_reference,o.status AS order_status,
    o.payment_status,o.shipping_address,o.currency AS order_currency,
    o.subtotal AS order_subtotal,o.discount AS order_discount,
    o.shipping AS order_shipping,o.tax AS order_tax,o.total AS order_total,
    q.id AS quote_id,q.status AS quote_status,q.sent_at AS quote_sent_at,
    q.accepted_at AS quote_accepted_at,q.payment_terms,q.shipping_terms,q.tax_basis,
    q.valid_until,q.currency AS quote_currency,q.subtotal AS quote_subtotal,
    q.discount AS quote_discount,q.shipping AS quote_shipping,q.tax AS quote_tax,
    q.total AS quote_total,
    (SELECT COALESCE(SUM(quantity),0) FROM quote_items WHERE quote_id=q.id) AS wholesale_units,
    (SELECT COALESCE(SUM(amount),0) FROM payments WHERE order_id=o.id AND status='RECEIVED') AS total_received,
    (SELECT COUNT(*) FROM payment_provider_sessions s WHERE s.order_id=o.id AND s.provider='STRIPE') AS stripe_session_count,
    (SELECT COALESCE(SUM(p.amount),0) FROM payments p
      JOIN payment_provider_sessions s ON s.provider_intent_id=p.provider_reference
       AND s.order_id=p.order_id AND s.provider='STRIPE' AND s.status='SUCCEEDED'
      WHERE p.order_id=o.id AND p.provider='STRIPE' AND p.status='RECEIVED' AND p.currency='USD') AS stripe_settled_receipts,
    (SELECT COUNT(*) FROM tasks t WHERE t.order_id=o.id AND t.type='PAYMENT'
      AND t.status IN ('OPEN','IN_PROGRESS') AND
      (t.title LIKE 'Review disputed Stripe receipts%' OR t.title LIKE 'Review payment on closed order%')) AS active_payment_reviews
   FROM orders o JOIN quotes q ON q.id=o.quote_id
   WHERE EXISTS(SELECT 1 FROM quote_items qi WHERE qi.quote_id=o.quote_id
     GROUP BY qi.quote_id HAVING SUM(qi.quantity)>=10)
   ORDER BY o.created_at DESC LIMIT 51`).all<R>();
  if(!rows.success||!Array.isArray(rows.results))throw Error('Unverified database query');
  const batch=rows.results.slice(0,50);
  const output=[];
  for(const row of batch){
   const [ql,ol]=await Promise.all([
    db.prepare('SELECT product_id,variant_id,description,quantity,unit_price,line_total FROM quote_items WHERE quote_id=?')
     .bind(String(row.quote_id)).all<R>(),
    db.prepare('SELECT product_id,variant_id,description,quantity,unit_price,line_total FROM order_items WHERE order_id=?')
     .bind(String(row.order_id)).all<R>(),
   ]);
   output.push(reviewB2bStripeOrder(row,ql.success?ql.results:[],ol.success?ol.results:[],env));
  }
  return response({ok:true,checkedAtUTC:new Date().toISOString(),
   scope:'ADMIN_READ_ONLY_B2B_ORDER_PAYMENT_PREFLIGHT',
   audited:output.length,hasMore:rows.results.length>50,
   codeChecksPassed:output.filter(x=>x.codeChecksPassed).length,
   quoteRevisionRequired:output.filter(x=>x.nextAction==='PREPARE_NEW_REVIEWED_QUOTE_AND_REOBTAIN_BUYER_ACCEPTANCE').length,
   stripeFullyReconciled:output.filter(x=>x.stripePaymentReconciled).length,
   orders:output,
   caveats:[
    'Read-only checks cannot prove destination sales-tax collection requirements, registration or exemption.',
    'A code-ready order is not authorization to charge before independent seller tax and commercial review.',
    'Historical PAID labels without matching completed Stripe sessions and RECEIVED funds are not Stripe payment proof.',
    'Do not edit buyer-accepted quotes or invent tax evidence; issue a newly reviewed quote and obtain acceptance.'
   ]});
 }catch{
  return response({ok:false,code:'B2B_PAYMENT_PREFLIGHT_UNAVAILABLE',
   note:'Cannot verify wholesale order readiness; leave charge and fulfillment disabled until manual review.'},503);
 }
};
