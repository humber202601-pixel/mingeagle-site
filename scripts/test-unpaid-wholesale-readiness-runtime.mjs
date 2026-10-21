import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
const bundled=await build({entryPoints:['functions/api/admin/unpaid-wholesale-requote-readiness.ts'],
 bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
const {onRequestGet}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const sqlite=new DatabaseSync(':memory:');
for(const file of readdirSync('migrations').filter(x=>x.endsWith('.sql')).sort())
 sqlite.exec(readFileSync('migrations/'+file,'utf8'));
const db={
 prepare(statement){return {sql:statement,args:[],bind(...args){this.args=args;return this;},
  async first(){return sqlite.prepare(this.sql).get(...this.args)||null},
  async all(){return {results:sqlite.prepare(this.sql).all(...this.args)}}};}
};
const call=async(ref,key='admin-test')=>{
 const request=new Request('https://app.test/api/admin/unpaid-wholesale-requote-readiness?orderReference='+encodeURIComponent(ref),
 {headers:{'x-admin-key':key}});
 const response=await onRequestGet({request,env:{MINGEAGLE_DB:db,ADMIN_ACCESS_KEY:'admin-test'}});
 return {status:response.status,body:await response.json()};
};
const fixture=(suffix,{orphan=false,status='PAYMENT_PENDING',payment='UNPAID',description='Flocked Silent Basketball | No. 7'}={})=>{
 const ref='ME-READ-'+suffix,oid='read-'+suffix,qid='read-q-'+suffix;
 if(!orphan)sqlite.prepare(`INSERT INTO quotes(id,reference,status,currency,subtotal,discount,shipping,tax,total,payment_terms,shipping_terms)
  VALUES(?,?,'CONVERTED','USD',150,0,30,0,180,'Stripe after approval','DDP')`).run(qid,'ME-Q-READ-'+suffix);
 sqlite.prepare(`INSERT INTO orders(id,reference,quote_id,status,payment_status,currency,subtotal,discount,shipping,tax,total)
  VALUES(?,?,?,?,?,'USD',150,0,30,0,180)`).run(oid,ref,orphan?null:qid,status,payment);
 sqlite.prepare(`INSERT INTO order_items(id,order_id,product_id,variant_id,description,quantity,unit_price,line_total)
  VALUES(?,?,?,?,?,10,15,150)`).run('read-line-'+suffix,oid,'catalog-p1','variant-p1-s7-orange',description);
 return {ref,oid,itemId:'read-line-'+suffix};
};
try{
 const before=sqlite.prepare('SELECT COUNT(*) AS n FROM quotes').get().n;
 const good=fixture('GOOD');
 assert.equal((await call(good.ref,'invalid')).status,401,'invalid admin secret must fail');
 const ok=await call(good.ref);
 assert.equal(ok.status,200,JSON.stringify(ok.body));
 assert.equal(ok.body.eligible,true,JSON.stringify(ok.body));
 assert.deepEqual(ok.body.reasonCodes,[]);
 assert.equal(ok.body.readOnly,true);
 assert.equal((await call('MISSING')).status,404);
 const paid=fixture('PAID',{status:'COMPLETED',payment:'PAID'});
 assert.ok((await call(paid.ref)).body.reasonCodes.includes('SOURCE_ORDER_NOT_SAFE_FOR_REQUOTE'));
 const test=fixture('QA',{description:'QA TEST - DO NOT SEND'});
 assert.ok((await call(test.ref)).body.reasonCodes.includes('SOURCE_TEST_ORDER_BLOCKED'));
 const unlinked=fixture('UNLINKED');
 sqlite.prepare('UPDATE order_items SET variant_id=NULL WHERE id=?').run(unlinked.itemId);
 assert.ok((await call(unlinked.ref)).body.reasonCodes.includes('SOURCE_PRODUCT_SNAPSHOT_REQUIRED'));
 const orphan=fixture('ORPHAN',{orphan:true});
 assert.ok((await call(orphan.ref)).body.reasonCodes.includes('SOURCE_CATALOG_EVIDENCE_REQUIRED'),
  'without a source quote a documented manual catalog audit must be required');
 const inconsistent=fixture('TOTAL');
 sqlite.prepare('UPDATE orders SET total=170 WHERE id=?').run(inconsistent.oid);
 assert.ok((await call(inconsistent.ref)).body.reasonCodes.includes('SOURCE_LINE_ITEMS_INVALID'));
 const recorded=fixture('RECORDED');
 sqlite.prepare(`INSERT INTO payments(id,order_id,method,amount,currency,status)
  VALUES('read-payment',?,'BANK_TRANSFER',1,'USD','PENDING')`).run(recorded.oid);
 assert.ok((await call(recorded.ref)).body.reasonCodes.includes('SOURCE_PAYMENT_REVIEW_REQUIRED'));
 const beforeLinkTable=sqlite.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='b2b_recovery_quote_links'").get().n;
 await call(good.ref);await call(orphan.ref);
 assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='b2b_recovery_quote_links'").get().n,beforeLinkTable,'GET must not even create the lazy recovery links table');
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM quotes').get().n,before+7,'GET cannot create quotes');
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM payments').get().n,1,'GET cannot create payments');
 assert.equal(sqlite.prepare('SELECT product_id,variant_id FROM order_items WHERE id=?').get(unlinked.itemId).variant_id,null);
 console.log('PASS: read-only recovery readiness diagnoses paid, QA, unlinked, undocumented, payment and finance blockers without writes');
}finally{sqlite.close();}
