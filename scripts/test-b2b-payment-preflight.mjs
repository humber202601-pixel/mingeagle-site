import assert from 'node:assert/strict';
import {build} from 'esbuild';
const result=await build({entryPoints:['functions/api/admin/b2b-payment-preflight.ts'],
 bundle:true,write:false,platform:'node',format:'esm',logLevel:'silent'});
const {reviewB2bStripeOrder,onRequestGet}=await import('data:text/javascript;base64,'+
 Buffer.from(result.outputFiles[0].text).toString('base64'));
const env={
 STRIPE_MODE:'live',STRIPE_SECRET_KEY:'rk_live_synthetic_payments_not_really_usable',
 STRIPE_WEBHOOK_SECRET:'whsec_synthetic_no_external_webhook',
 STRIPE_CHECKOUT_ENABLED:'true',STRIPE_TAX_POLICY_APPROVED:'true',
 STRIPE_RETAIL_ONLY_ENABLED:'false',STRIPE_B2B_CHECKOUT_ENABLED:'true',
 STRIPE_B2B_TAX_POLICY_APPROVED:'true',STRIPE_B2B_APPROVED_US_STATES:'TX,OR',
};
const q=[{product_id:null,variant_id:null,description:'Flocked Silent Basketball Set | No. 7 | Orange',
 quantity:10,unit_price:15,line_total:150}];
const row={
 order_id:'private-order-id',quote_id:'private-quote-id',order_reference:'ME-BO-REVIEW-001',
 order_status:'PAYMENT_PENDING',payment_status:'UNPAID',shipping_address:JSON.stringify({
  country:'US',state:'TX',city:'Austin',postalCode:'78701',line1:'123 Synthetic Lane'}),
 order_currency:'USD',order_subtotal:150,order_discount:0,order_shipping:30,
 order_tax:0,order_total:180,quote_status:'CONVERTED',
 quote_sent_at:'2026-10-15 12:00:00',quote_accepted_at:'2026-10-15 12:30:00',
 payment_terms:'Full amount payable by Stripe card checkout',
 shipping_terms:'DDP sea freight 25–30 days; Ship-to state: TX',
 tax_basis:'SYNTHETIC TEST: documented seller review; requires independent real legal tax review',
 valid_until:'2099-12-31',quote_currency:'USD',quote_subtotal:150,
 quote_discount:0,quote_shipping:30,quote_tax:0,quote_total:180,
 wholesale_units:10,total_received:0,stripe_session_count:0,stripe_settled_receipts:0,
 active_payment_reviews:0
};
const good=reviewB2bStripeOrder(row,q,q,env);
assert.equal(good.codeChecksPassed,true,JSON.stringify(good.blockers));
assert.equal(good.stripePaymentReconciled,false,'Passing code checks is not proof of Stripe settlement');
assert.equal(good.manualSalesTaxDeterminationStillRequired,true);
assert.equal(good.nextAction,'FINAL_MANUAL_TAX_AND_CHARGE_APPROVAL');
const historic=reviewB2bStripeOrder({...row,
 tax_basis:null,payment_terms:'Payment terms to be confirmed before sending.',
 shipping_terms:'DDP freight TBD',shipping_address:null,
 order_total:190,order_subtotal:160,wholesale_units:10},q,q,env);
for(const code of ['QUOTE_STRIPE_TERMS_MISSING','QUOTE_ACCEPTANCE_OR_VALIDITY_NOT_PAYABLE',
 'COMPLETE_US_DELIVERY_ADDRESS_REQUIRED','ACCEPTED_QUOTE_SHIP_STATE_MISMATCH',
 'SALES_TAX_BASIS_NOT_DOCUMENTED','ACCEPTED_QUOTE_AMOUNT_CHANGED',
 'ACCEPTED_QUOTE_ITEMS_CHANGED_OR_MISSING'])assert(historic.blockers.includes(code),code);
assert.equal(historic.nextAction,'PREPARE_NEW_REVIEWED_QUOTE_AND_REOBTAIN_BUYER_ACCEPTANCE');
const alreadyPaid=reviewB2bStripeOrder({...row,payment_status:'PAID',
 total_received:180,stripe_session_count:0,stripe_settled_receipts:0},q,q,env);
assert(alreadyPaid.blockers.includes('ALREADY_MARKED_PAID_NO_NEW_CHECKOUT'));
assert(alreadyPaid.blockers.includes('PAID_NOT_FULLY_RECONCILED_VIA_STRIPE'));
assert.equal(alreadyPaid.nextAction,'VERIFY_EXISTING_PAYMENT_EVIDENCE_NO_NEW_CHARGE');
const validPaid=reviewB2bStripeOrder({...row,payment_status:'PAID',
 total_received:180,stripe_session_count:1,stripe_settled_receipts:180},q,q,env);
assert.equal(validPaid.stripePaymentReconciled,true);
const unpaidPartial=reviewB2bStripeOrder({...row,total_received:5},q,q,env);
assert(unpaidPartial.blockers.includes('PARTIAL_RECEIPT_NEEDS_MANUAL_REVIEW'));
const badState=reviewB2bStripeOrder({...row,shipping_address:JSON.stringify({
 country:'US',state:'CA',city:'Pasadena',postalCode:'91101',line1:'123 Example Street'})},q,q,env);
assert(badState.blockers.includes('ACCEPTED_QUOTE_SHIP_STATE_MISMATCH'));
assert(badState.blockers.includes('DESTINATION_NOT_IN_APPROVED_B2B_SCOPE'));
const invalidConfig=reviewB2bStripeOrder(row,q,q,{...env,STRIPE_CHECKOUT_ENABLED:'false'});
assert(invalidConfig.blockers.includes('LIVE_B2B_STRIPE_CONFIG_NOT_READY'));
const modifiedItems=reviewB2bStripeOrder(row,q,[{...q[0],description:'Weighted Basketball'}],env);
assert(modifiedItems.blockers.includes('ACCEPTED_QUOTE_ITEMS_CHANGED_OR_MISSING'));
const closed=reviewB2bStripeOrder({...row,order_status:'CANCELLED'},q,q,env);
assert(closed.blockers.includes('CLOSED_ORDER_NO_NEW_CHECKOUT'));
const fakeDb={prepare(sql){
 assert(/^\s*SELECT\b/i.test(sql),'No database writes allowed');
 if(sql.includes('FROM orders o JOIN quotes q ON q.id=o.quote_id'))
  return {async all(){return {success:true,results:[row,{...row,order_id:'old-paid',order_reference:'ME-BO-REVIEW-002',
   payment_status:'PAID',stripe_session_count:0,total_received:180,tax_basis:null,payment_terms:null,
   shipping_address:null,shipping_terms:null},
   {...row,order_id:'unpaid-review-test',order_reference:'ME-BO-REVIEW-003',
    payment_status:'UNPAID',tax_basis:null,shipping_address:null,shipping_terms:null}]}}};
 if(sql.includes('FROM quote_items WHERE quote_id=?'))
  return {bind(){return {async all(){return {success:true,results:q}}}}};
 if(sql.includes('FROM order_items WHERE order_id=?'))
  return {bind(){return {async all(){return {success:true,results:q}}}}};
 throw Error('Unexpected SQL');
}};
const response=await onRequestGet({env:{...env,MINGEAGLE_DB:fakeDb}});
assert.equal(response.status,200);
assert.equal(response.headers.get('cache-control'),'private, no-store');
const report=await response.json();
assert.equal(report.audited,3);
assert.equal(report.codeChecksPassed,1);
assert.equal(report.pendingOrderReview.awaitingPayment,2);
assert.equal(report.pendingOrderReview.missingDeliveryAddress,1);
assert.equal(report.pendingOrderReview.missingSalesTaxBasis,1);
assert.equal(report.pendingOrderReview.quoteRevisionRequired,1);
assert.equal(report.pendingOrderReview.codeReadyButManualApprovalRequired,1);
assert.equal(report.stripeFullyReconciled,0);
assert.equal(report.orders.length,3);
assert.equal(report.orders[1].paymentStatus,'PAID');
assert.equal(report.orders[1].stripePaymentReconciled,false);
assert(!JSON.stringify(report).includes('private-order-id'));
assert(!JSON.stringify(report).includes('Synthetic Lane'));
assert(!JSON.stringify(report).includes('synthetic_payments'));
assert.equal((await onRequestGet({env:{...env,MINGEAGLE_DB:null}})).status,503);

// The admin portal must actually expose the secured production audit via navigation;
// a compiled but unreachable component does not count as deployed UI.
import {readFileSync} from 'node:fs';
const adminSource=readFileSync('src/AdminApp.tsx','utf8');
const readinessSource=readFileSync('src/ReadinessPanel.tsx','utf8');
assert(adminSource.includes("import ReadinessPanel from './ReadinessPanel';"));
assert(adminSource.includes("'/app/readiness'"));
assert(adminSource.includes("page === 'readiness'"));
assert(adminSource.includes('<ReadinessPanel accessKey={key}/>'));
assert(readinessSource.includes('/api/admin/b2b-payment-preflight'));
assert(readinessSource.includes('<WholesalePaymentPreflight accessKey={accessKey} refresh={refresh}/>'));
assert(readinessSource.includes('data.pendingOrderReview.missingDeliveryAddress'));
assert(readinessSource.includes('data.pendingOrderReview.missingSalesTaxBasis'));
assert(readinessSource.includes('历史已付款订单不纳入催补资料统计'));

console.log('PASS: B2B admin preflight identifies legacy missing terms and tax basis, preserves buyer-approved snapshots, separates config from paid receipts, only reads D1, and is reachable from the admin navigation.');
