import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
const built=await build({entryPoints:['functions/api/admin/order-action.ts'],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
const {onRequestPost}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
let writes=0,queries=0,simulatedPaymentStatus='UNPAID';
const db={
 prepare(sql){
  const query=String(sql),stmt={
   args:[],
   bind(...args){this.args=args;return this},
   async first(){
    queries++;
    if(query.includes('FROM orders WHERE reference='))return {id:'order-1',reference:'ORDER-1',quote_id:null,lead_id:null,company_id:null,contact_id:null,status:'PAYMENT_PENDING',payment_status:simulatedPaymentStatus,total:50,currency:'USD'};
    if(query.includes('COALESCE(SUM(amount)'))return {value:0};
    if(query.includes('FROM payments')&&query.includes('provider_reference='))return this.args[1]==='TRANSFER-USED'?{id:'existing-payment'}:null;
    throw Error('Unexpected SELECT: '+query.slice(0,95));
   },
   async run(){writes++;return {success:true,meta:{changes:1}}}
  };return stmt;
 }
};
const invoke=async(input,legacy=false)=>{
 const request=new Request('https://test.example/api/admin/order-action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({orderReference:'ORDER-1',action:'MARK_PAID',paymentMethod:'BANK_TRANSFER',paymentReference:'TRANSFER-001',amount:10,...input})});
 const response=await onRequestPost({request,env:{MINGEAGLE_DB:db,...(legacy?{LEGACY_OFFLINE_RECEIPT_ENTRY_ENABLED:'true'}:{})}});
 return {status:response.status,body:await response.json()};
};
// Stripe-only production mode must not accept manual receipt writes even with plausible evidence.
const blocked=await invoke({fundsReceivedConfirmed:true,paymentReference:'TRANSFER-NEW'});
assert.equal(blocked.status,403);
assert.equal(blocked.body.code,'STRIPE_ONLY_PAYMENTS');
assert.equal(writes,0,'Stripe-only mode must not write manual payment records');
simulatedPaymentStatus='REFUNDED';
const closed=await invoke({fundsReceivedConfirmed:true,paymentReference:'NEVER-RECORD-REFUND'},true);
assert.equal(closed.status,409);
assert.match(closed.body.error,/Refunded orders cannot be marked paid/);
assert.equal(writes,0,'Refunded order must not be reopened by manual receipt');
simulatedPaymentStatus='UNPAID';
const noConfirm=await invoke({fundsReceivedConfirmed:false},true);
assert.equal(noConfirm.status,400);
assert.match(noConfirm.body.error,/Confirm actual funds receipt/);
assert.equal(writes,0,'Missing independent funds confirmation cannot create a payment');
const noEvidence=await invoke({fundsReceivedConfirmed:true,paymentReference:''},true);
assert.equal(noEvidence.status,400);
assert.match(noEvidence.body.error,/receipt or bank reference/);
assert.equal(writes,0,'No bank reference means no ledger write');
const noOnlineManual=await invoke({fundsReceivedConfirmed:true,paymentMethod:'ONLINE_PAYMENT'},true);
assert.equal(noOnlineManual.status,400);
assert.match(noOnlineManual.body.error,/Online payments must be reconciled/);
assert.equal(writes,0,'Cannot duplicate processor Webhook entries as offline payments');
const duplicate=await invoke({fundsReceivedConfirmed:true,paymentReference:'TRANSFER-USED'},true);
assert.equal(duplicate.status,409);
assert.match(duplicate.body.error,/already been recorded/);
assert.equal(writes,0,'Duplicate receipt must not mark funds as received again');
const valid=await invoke({fundsReceivedConfirmed:true,paymentReference:'TRANSFER-NEW'},true);
assert.equal(valid.status,200);
assert.equal(valid.body.order.payment_status,'PARTIAL','A verified partial deposit must not mark a whole order PAID');
assert.equal(valid.body.payment.outstanding,40);
assert(writes>0,'Fully validated manual receipt is allowed to enter ledger');
assert(queries>0);
const ui=readFileSync('src/OrderManager.tsx','utf8');
assert(ui.includes('仅通过 Stripe 确认在线收款'),'Admin should explain Stripe-only workflow');
assert(!ui.includes('paymentSubmit('),'Normal admin must not call manual mark-paid');
assert(!ui.includes('action: \'MARK_PAID\''),'No UI fallback to manual paid');
const quoteUi=readFileSync('src/QuoteBuilder.tsx','utf8');
assert(quoteUi.includes('defaultValue="Full amount payable by secure Stripe card checkout'),'New wholesale quote defaults to Stripe');
console.log('PASS: Stripe-only production blocks manual receipts; guarded historical reconciliation still validates proof, duplicates and partial payments.');
