import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
const source=await build({entryPoints:['lib/retail-tax-policy.ts'],bundle:true,write:false,platform:'node',format:'esm',logLevel:'silent'});
const {remoteStartupFactsCurrent,reviewedZeroTaxStates,remoteStartupWithinLimits}=await import('data:text/javascript;base64,'+Buffer.from(source.outputFiles[0].text).toString('base64'));
const now=new Date('2026-10-14T16:00:00Z');
const facts={basis:'REMOTE_SELLER_STARTUP',source:'OWNER_FACTUAL_DECLARATION',confirmed_on:'2026-10-14',reference:'SYNTHETIC_OWNER_FACTS_ONLY',fulfillment_country:'CN',no_us_business_presence:true,us_direct_marketplace_related_sales_usd:0,us_direct_marketplace_related_orders:0};
const env={RETAIL_REMOTE_STARTUP_FACTS_JSON:JSON.stringify(facts)};
assert.equal(remoteStartupFactsCurrent(env,now),true);
const states=reviewedZeroTaxStates(env,now);
assert.equal(states.size,51);
for(const state of ['CA','TX','NY','KY','AK','HI','DC'])assert(states.has(state));
assert(!states.has('PR')&&!states.has('ZZ'));
for(const change of [{source:'INFERRED'},{no_us_business_presence:false},{us_direct_marketplace_related_sales_usd:1},{us_direct_marketplace_related_orders:1},{fulfillment_country:'US'},{confirmed_on:'2026-11-01'},{confirmed_on:'2026-08-01'}])assert.equal(remoteStartupFactsCurrent({RETAIL_REMOTE_STARTUP_FACTS_JSON:JSON.stringify({...facts,...change})},now),false,JSON.stringify(change));
assert.equal(remoteStartupFactsCurrent({},now),false,'General authorization cannot fill missing merchant facts');
const sql=new DatabaseSync(':memory:');
sql.exec(`CREATE TABLE orders(id TEXT PRIMARY KEY,reference TEXT,status TEXT,payment_status TEXT,currency TEXT,total REAL,quote_id TEXT);CREATE TABLE quotes(id TEXT PRIMARY KEY,valid_until TEXT,notes TEXT);CREATE TABLE payments(order_id TEXT,status TEXT);CREATE TABLE retail_checkout_requests(request_id TEXT PRIMARY KEY,order_id TEXT,quote_id TEXT);`);
sql.exec(readFileSync('migrations/0014_remote_startup_collection_guard.sql','utf8'));
const db={prepare(q){return {async first(){return sql.prepare(q).get()||null}}}};
assert.equal(await remoteStartupWithinLimits(db,2140,1),true);
assert.equal(await remoteStartupWithinLimits({prepare(){throw Error('unavailable')}},2140,1),false);
assert.equal(await remoteStartupWithinLimits(db,-1,1),false);
const reserve=(id,total)=>{
 sql.exec('BEGIN');
 try{
  sql.prepare("INSERT INTO quotes VALUES (?,datetime('now','+7 days'),'REMOTE_STARTUP: synthetic fixture')").run(id);
  sql.prepare("INSERT INTO orders VALUES (?,?,'PAYMENT_PENDING','UNPAID','USD',?,?)").run(id,'ME-RO-'+id,total,id);
  sql.prepare('INSERT INTO retail_checkout_requests VALUES (?,?,?)').run(id,id,id);
  sql.exec('COMMIT');
 }catch(e){sql.exec('ROLLBACK');throw e}
};
reserve('first',49980);
assert.equal(await remoteStartupWithinLimits(db,2140,1),false);
assert.throws(()=>reserve('over-gross',21.4),/REMOTE_STARTUP_REVIEW_REQUIRED/);
assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM orders WHERE id='over-gross'").get().n,0,'Over-limit batch rolls back the order');
sql.exec('DELETE FROM retail_checkout_requests;DELETE FROM orders;DELETE FROM quotes;');
for(let i=0;i<150;i++)reserve('n'+i,21.4);
assert.equal(await remoteStartupWithinLimits(db,0,0),true,'Existing reserved order can pay');
assert.equal(await remoteStartupWithinLimits(db,2140,1),false,'New reservation cannot exceed the order ceiling');
assert.throws(()=>reserve('over-count',21.4),/REMOTE_STARTUP_REVIEW_REQUIRED/);
assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM orders').get().n,150);
// Refunds retain gross sales history; expired unpaid reservations are released.
sql.exec("INSERT INTO payments VALUES ('n0','REFUNDED');UPDATE orders SET payment_status='REFUNDED',status='REFUNDED' WHERE id='n0';UPDATE quotes SET valid_until=datetime('now','-1 day') WHERE id<>'n0';");
assert.equal(await remoteStartupWithinLimits(db,2140,1),true);
sql.exec("UPDATE orders SET currency='EUR' WHERE id='n0';");
assert.equal(await remoteStartupWithinLimits(db,2140,1),false,'Unknown currency cannot hide outside payment volume');
sql.close();
console.log('PASS: nationwide startup requires explicit current owner facts; real SQLite reserves pending totals atomically and rejects gross/count overruns, stale facts and missing records.');
