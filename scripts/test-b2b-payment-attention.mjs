import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transform} from 'esbuild';
const src=readFileSync('src/b2bPaymentAttention.ts','utf8');
const js=(await transform(src,{loader:'ts',format:'esm',target:'es2022'})).code;
const {pendingPaymentReviews,requiresPaymentReview}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const orders=[
 {id:'paid',reference:'Q-PAID',status:'COMPLETED',payment_status:'PAID',paid_at:'2026-10-15 10:00:00'},
 {id:'unpaid',reference:'Q-UNPAID',status:'PAYMENT_PENDING',payment_status:'UNPAID',paid_at:null},
 {id:'unpaid2',reference:'Q-PENDING2',status:'PAYMENT_PENDING',payment_status:'UNPAID'},
 {id:'bad',reference:'Q-REVIEW',status:'COMPLETED',payment_status:'UNPAID'},
 {id:'no-evidence',reference:'Q-NOTIME',status:'CONFIRMED',payment_status:'PAID',paid_at:null},
 {id:'cancelled',reference:'Q-CANCELLED',status:'CANCELLED',payment_status:'UNPAID'}
];
const snapshot=JSON.stringify(orders);
const result=pendingPaymentReviews(orders);
assert.deepEqual(result.map(o=>o.id),['unpaid2','unpaid','no-evidence','bad'],'Sort payment-pending records ahead of reconciliation exceptions');
assert.equal(JSON.stringify(orders),snapshot,'Never mutate or reconcile payment state in a display helper');
assert(!result.some(o=>o.id==='paid'||o.id==='cancelled'),'Paid and cancelled orders must not produce reminders');
assert.equal(requiresPaymentReview({status:'COMPLETED',payment_status:'PAID',paid_at:null}),true,'A paid marker without evidence timestamp needs review');
const dashboard=readFileSync('src/AdminApp.tsx','utf8');
const data=readFileSync('functions/api/admin/data.ts','utf8');
assert(dashboard.includes('pendingPaymentReviews(data.orders)'),'CRM homepage must derive attention from existing orders');
assert(dashboard.includes('待核实收款订单'));
assert(dashboard.includes('报价转订单不代表货款到账'));
assert(dashboard.includes('查看订单')&&dashboard.includes('to="/app/orders"'));
assert(dashboard.includes('此提醒不会自动联系客户或改变付款状态'));
assert(!src.includes('fetch('),'Payment review helper must not contact providers or customers');
assert(/o\.payment_status/.test(data)&&/o\.paid_at/.test(data)&&/o\.reference/.test(data),'Read API must expose enough order evidence for payment checks');
console.log('PASS: CRM dashboard distinguishes converted quotes from payment-confirmed orders; unpaid and anomalous records trigger read-only, manual review.');
