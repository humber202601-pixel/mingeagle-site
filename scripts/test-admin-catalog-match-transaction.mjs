import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';

const bundle=await build({entryPoints:['functions/api/admin/order-item-catalog-match.ts'],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
const {onRequestPost}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const sql=new DatabaseSync(':memory:');
sql.exec(readFileSync('migrations/0001_core.sql','utf8'));
sql.exec(readFileSync('migrations/0017_seed_canonical_product_catalog.sql','utf8'));
const catalog=sql.prepare("SELECT v.id AS variant_id,v.variant_sku,p.id AS product_id FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.active=1 ORDER BY v.variant_sku LIMIT 1").get();
assert.ok(catalog?.variant_sku);
const createOrder=(ref,status='PAYMENT_PENDING',payment='UNPAID',description='Historic Silent Basketball')=>{
 const orderId='o-'+ref,itemId='line-'+ref;
 sql.prepare("INSERT INTO orders(id,reference,status,payment_status,currency,subtotal,shipping,tax,total) VALUES(?,?,?,?,'USD',170,0,0,170)").run(orderId,ref,status,payment);
 sql.prepare("INSERT INTO order_items(id,order_id,description,quantity,unit_price,line_total) VALUES(?,?,?,10,17,170)").run(itemId,orderId,description);
 return {ref,itemId,orderId};
};
const adapter={
 prepare(statement){return {sql:statement,args:[],bind(...args){this.args=args;return this;},
 async first(){return sql.prepare(this.sql).get(...this.args)||null},
 async run(){const r=sql.prepare(this.sql).run(...this.args);return {success:true,meta:{changes:Number(r.changes)}}}};},
 async batch(statements){sql.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());sql.exec('COMMIT');return result}catch(error){sql.exec('ROLLBACK');throw error}}
};
async function call(order,{key='test-secret',evidence='Buyer approval email dated 2026-10-21',confirmed=true,sku=catalog.variant_sku}={}){
 const request=new Request('https://app.test/api/admin/order-item-catalog-match',{method:'POST',
 headers:{'content-type':'application/json','x-admin-key':key},
 body:JSON.stringify({orderReference:order.ref,itemId:order.itemId,variantSku:sku,evidenceReference:evidence,confirmOriginalEvidence:confirmed})});
 const response=await onRequestPost({request,env:{ADMIN_ACCESS_KEY:'test-secret',MINGEAGLE_DB:adapter}});
 return {status:response.status,body:await response.json()};
}
const source=createOrder('ME-INTEGRATION-UNPAID');
let before=sql.prepare("SELECT * FROM orders WHERE id=?").get(source.orderId);
assert.equal((await call(source,{key:'wrong'})).status,401,'wrong admin credentials rejected');
assert.equal((await call(source,{evidence:'too short'})).status,400,'missing meaningful evidence rejected');
assert.equal((await call(source,{confirmed:false})).status,400,'buyer evidence requires manual confirmation');
assert.equal((await call(source,{sku:'NO-SUCH-SKU'})).status,409,'unknown catalog SKU rejected');
let result=await call(source);
assert.equal(result.status,200,JSON.stringify(result.body));
assert.equal(result.body.financialSnapshotUnchanged,true);
const updated=sql.prepare("SELECT * FROM orders WHERE id=?").get(source.orderId);
assert.deepEqual(updated,before,'original order and payment snapshot remain unchanged');
const item=sql.prepare("SELECT * FROM order_items WHERE id=?").get(source.itemId);
assert.equal(item.product_id,catalog.product_id);
assert.equal(item.variant_id,catalog.variant_id);
assert.equal(item.quantity,10);
assert.equal(item.unit_price,17);
assert.equal(item.line_total,170);
assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM order_item_catalog_audit").get().n,1);
assert.equal(sql.prepare("SELECT evidence_reference FROM order_item_catalog_evidence").get().evidence_reference,'Buyer approval email dated 2026-10-21');
assert.equal((await call(source)).status,409,'duplicate submission cannot overwrite association');
assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM order_item_catalog_audit").get().n,1,'duplicate leaves one audit');

const paid=createOrder('ME-INTEGRATION-PAID','COMPLETED','PAID');
assert.equal((await call(paid)).status,409,'completed paid order cannot be linked');
const qa=createOrder('ME-INTEGRATION-QA','PAYMENT_PENDING','UNPAID','QA TEST - DO NOT SEND');
assert.equal((await call(qa)).status,409,'QA order cannot be linked');
const rollback=createOrder('ME-INTEGRATION-ROLLBACK');
sql.exec("CREATE TRIGGER fail_evidence BEFORE INSERT ON order_item_catalog_evidence WHEN NEW.order_item_id='line-ME-INTEGRATION-ROLLBACK' BEGIN SELECT RAISE(ABORT,'synthetic evidence failure');END");
assert.equal((await call(rollback)).status,503,'late evidence failure returns error');
assert.equal(sql.prepare('SELECT product_id FROM order_items WHERE id=?').get(rollback.itemId).product_id,null,'atomic failure restores unlinked line');
assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM order_item_catalog_audit WHERE order_item_id=?').get(rollback.itemId).n,0,'atomic failure rolls back audit');
assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM order_item_catalog_evidence WHERE order_item_id=?').get(rollback.itemId).n,0);
assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM quotes').get().n,0,'matching does not create quotes');
assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM payments').get().n,0,'matching does not create payment records');
sql.close();
console.log('PASS: audited manual catalog association is authorized, evidence-gated, atomic, idempotent and financially read-only');
