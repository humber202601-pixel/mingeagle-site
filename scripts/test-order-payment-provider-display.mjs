import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

const adminSql=readFileSync('functions/api/admin/data.ts','utf8');
const ui=readFileSync('src/OrderManager.tsx','utf8');
assert(adminSql.includes('AS online_payment_provider'),'The CRM must expose the payment provider, not guess it');
assert(!adminSql.includes("pps.provider='AIRWALLEX'"),'Online payment sessions must not be restricted to a legacy provider');

const names=['online_payment_provider','online_payment_status','online_payment_intent_id','online_payment_updated_at'];
const db=new DatabaseSync(':memory:');
db.exec(`CREATE TABLE orders(id TEXT PRIMARY KEY);
CREATE TABLE payment_provider_sessions(order_id TEXT,provider TEXT,status TEXT,provider_intent_id TEXT,updated_at TEXT,created_at TEXT);
INSERT INTO orders VALUES ('order-1'),('order-2'),('order-3');
INSERT INTO payment_provider_sessions VALUES ('order-1','AIRWALLEX','PENDING','aw-id','2026-10-12 10:00:00','2026-10-12 10:00:00');
INSERT INTO payment_provider_sessions VALUES ('order-1','STRIPE','SUCCEEDED','str-id','2026-10-15 10:00:00','2026-10-15 10:00:00');
INSERT INTO payment_provider_sessions VALUES ('order-2','AIRWALLEX','PENDING_REVIEW','aw-only','2026-10-14 10:00:00','2026-10-14 10:00:00');`);
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
db.close();
assert(ui.includes("channel==='STRIPE'||channel==='AIRWALLEX'"),'Known providers are mapped by recorded identifier');
assert(ui.includes("method==='ONLINE_PAYMENT'"),'Unidentified online payment is not silently attributed to Airwallex');
assert(ui.includes('线上支付服务商（未记录）'));
assert(ui.includes('paymentProviderLabel(onlineProvider)'));
assert(ui.includes('支付服务商报告成功（仍需核实订单入账）'));
assert(ui.includes('仅通过 Stripe 确认在线收款'),'Normal admin actions must not simulate payment confirmation');
assert(!ui.includes('paymentSubmit('),'Legacy manual payment form is intentionally hidden');
assert(!ui.includes('Airwallex 在线付款由 Webhook 自动入账'),'Cannot promise a particular payment channel for new orders');
assert(!ui.includes("<strong>Airwallex 在线支付："),'Online status must use a bound provider');
console.log('PASS: admin payment session source and order UI stay provider-specific without implying cash settlement.');
