import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

const adminSql=readFileSync('functions/api/admin/data.ts','utf8');
const ui=readFileSync('src/OrderManager.tsx','utf8');
assert(adminSql.includes('AS online_payment_provider'),'The CRM must expose the payment provider, not guess it');
assert(adminSql.includes('AS quote_payment_route')&&adminSql.includes('LEFT JOIN quotes q ON q.id=o.quote_id'),
 'Outstanding order list must carry original quote payment route without a write');
assert(adminSql.includes("'NON_STRIPE'"),'Legacy bank-route signal must be explicit');
assert(!adminSql.includes("pps.provider='AIRWALLEX'"),'Online payment sessions must not be restricted to a legacy provider');

const names=['online_payment_provider','online_payment_status','online_payment_intent_id','online_payment_updated_at'];
const db=new DatabaseSync(':memory:');
db.exec(`CREATE TABLE orders(id TEXT PRIMARY KEY);
CREATE TABLE payment_provider_sessions(order_id TEXT,provider TEXT,status TEXT,provider_intent_id TEXT,updated_at TEXT,created_at TEXT);
CREATE TABLE tasks(order_id TEXT,type TEXT,title TEXT,status TEXT);
INSERT INTO orders VALUES ('order-1'),('order-2'),('order-3');
INSERT INTO payment_provider_sessions VALUES ('order-1','AIRWALLEX','PENDING','aw-id','2026-10-12 10:00:00','2026-10-12 10:00:00');
INSERT INTO payment_provider_sessions VALUES ('order-1','STRIPE','SUCCEEDED','str-id','2026-10-15 10:00:00','2026-10-15 10:00:00');
INSERT INTO payment_provider_sessions VALUES ('order-2','AIRWALLEX','PENDING_REVIEW','aw-only','2026-10-14 10:00:00','2026-10-14 10:00:00');
INSERT INTO tasks VALUES ('order-1','PAYMENT','Review disputed Stripe receipts for synthetic order','OPEN');
INSERT INTO tasks VALUES ('order-1','PAYMENT','Review disputed Stripe receipts older task','DONE');
INSERT INTO tasks VALUES ('order-2','FULFILLMENT','Review disputed Stripe receipts irrelevant fulfillment','OPEN');
INSERT INTO tasks VALUES ('order-2','PAYMENT','Review payment on closed order synthetic','IN_PROGRESS');
INSERT INTO tasks VALUES ('order-3','PAYMENT','Ordinary unpaid payment reminder','OPEN');`);
const fields={online_payment_provider:'provider',online_payment_status:'status',online_payment_intent_id:'provider_intent_id',online_payment_updated_at:'updated_at'};
const extracted=names.map(name=>{
 const re=new RegExp('\\((SELECT pps\\.'+fields[name]+' FROM payment_provider_sessions pps WHERE pps\\.order_id=o\\.id[\\s\\S]*?LIMIT 1)\\) AS '+name);
 const match=adminSql.match(re);
 assert(match,'Missing scalar query: '+name);
 return '('+match[1]+') AS '+name;
});
const entries=db.prepare('SELECT o.id,'+extracted.join(',')+' FROM orders o ORDER BY o.id').all();
assert.deepEqual(entries.map(row=>[row.online_payment_provider,row.online_payment_status]),[
 ['STRIPE','SUCCEEDED'],['AIRWALLEX','PENDING_REVIEW'],[null,null]
],'Newest known provider is displayed without inventing payment activity');
assert.equal(entries[0].online_payment_intent_id,'str-id');
const reviewMatch=adminSql.match(/\((SELECT COUNT\(\*\) FROM tasks t WHERE t\.order_id=o\.id[\s\S]*?)\) AS active_payment_review_count/);
assert(reviewMatch,'CRM must expose active Stripe payment review count');
const flagged=db.prepare('SELECT o.id,('+reviewMatch[1]+') AS active_payment_review_count FROM orders o ORDER BY o.id').all();
assert.deepEqual(flagged.map(x=>x.active_payment_review_count),[1,1,0],
 'Count open/in-progress Stripe reconciliation only, ignoring completed tasks and ordinary payment reminders');
const privateQuote=readFileSync('functions/api/quote/[token].ts','utf8');
const publicReview=privateQuote.match(/\((SELECT COUNT\(\*\) FROM tasks t WHERE t\.order_id=o\.id[\s\S]*?)\) AS active_payment_review_count/);
assert(publicReview,'Private quote JSON must expose the same active payment review guard as staff API');
const publicReviewCounts=db.prepare('SELECT o.id,('+publicReview[1]+') AS active_payment_review_count FROM orders o ORDER BY o.id').all();
assert.deepEqual(publicReviewCounts.map(x=>x.active_payment_review_count),[1,1,0],
 'A customer may not see a generic PAID banner when Stripe review tasks are still open');
db.close();
const reactQuote=readFileSync('src/CustomerQuote.tsx','utf8');
assert(reactQuote.includes('const paymentHeld=Number(order?.active_payment_review_count||0)>0'),
 'React quote must fail closed during active disputed Stripe receipt review');
assert(reactQuote.includes('const checkoutReadyForOrder=Boolean(order&&'),
 'React quote must use order-channel payment readiness');
assert(reactQuote.includes('payment?.stripe?.b2bConfigurationReady'),
 'Wholesale must require the separate B2B tax and checkout policy gates');
assert(reactQuote.includes('payment?.stripe?.retailConfigurationReady'),
 'Retail sample checkout must use retail readiness, not wholesale flags');
assert(!reactQuote.includes('order&&payment?.stripe?.checkoutReady?'),
 'Global Stripe flag may not advertise an unapproved order as payable');
assert(reactQuote.includes('paymentHeld?<p role="alert"'),
 'Buyer must see manual reconciliation warning before any generic PAID success banner');
assert(reactQuote.includes('!checkoutReadyForOrder||paymentHeld||closedOrder'),
 'Direct React click handler cannot bypass hidden payment controls');
assert(ui.includes("channel==='STRIPE'||channel==='AIRWALLEX'"),'Known providers are mapped by recorded identifier');
assert(ui.includes("method==='ONLINE_PAYMENT'"),'Unidentified online payment is not silently attributed to Airwallex');
assert(ui.includes('线上支付服务商（未记录）'));
assert(ui.includes('paymentProviderLabel(onlineProvider)'));
assert(ui.includes('支付服务商报告成功（仍需核实订单入账）'));
assert(ui.includes('仅通过 Stripe 确认在线收款'),'Normal admin actions must not simulate payment confirmation');
assert(ui.includes('Stripe 收款异常待核对 · 暂停履约及订单完成'),'Admin must disclose full lifecycle payment hold');
assert(ui.includes('const paymentHeld = Number(order.active_payment_review_count || 0) > 0'),
 'Admin hold must use live server-calculated review count');
for(const target of ['PAID','PROCESSING','READY_TO_SHIP'])
 assert(ui.includes("paymentStatus === 'PAID' && !paymentHeld && status === '"+target+"'"),
 'Unsafe fulfillment control must remain hidden under active receipt review: '+target);
assert(ui.includes('!paymentHeld && <button className="button small"')&&ui.includes("runAction(reference, 'DELIVER')"),
 'Post-shipment delivery confirmation must be hidden during Stripe review');
assert(ui.includes("status === 'DELIVERED' && !paymentHeld")&&ui.includes("runAction(reference, 'COMPLETE')"),
 'Order completion and reorder actions must not be presented under an active review');
assert(ui.includes("status === 'COMPLETED' && !paymentHeld"),
 'Completed order reorder shortcut must be suppressed during payment review');
assert(ui.includes('Boolean(order.tracking_url)'),
 'Tracking visibility must remain available while admin buttons are held');
assert(ui.includes("quote_payment_route,'UNKNOWN'")&&ui.includes('需重新报价：旧付款条款不支持 Stripe'),
 'Unpayable legacy orders require a distinct staff warning');
assert(ui.includes('href="/app/quotes"'),'Staff need a direct route to prepare a new accepted quote');
assert(!ui.includes('paymentSubmit('),'Legacy manual payment form is intentionally hidden');
assert(!ui.includes('Airwallex 在线付款由 Webhook 自动入账'),'Cannot promise a particular payment channel for new orders');
assert(!ui.includes("<strong>Airwallex 在线支付："),'Online status must use a bound provider');
console.log('PASS: admin payment session source and order UI stay provider-specific without implying cash settlement.');
