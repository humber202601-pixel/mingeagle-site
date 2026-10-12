import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
const temp=mkdtempSync(join(tmpdir(),'supplier-pricing-'));
const previous=globalThis.fetch;
try{
 await build({entryPoints:['functions/api/admin/supplier-pricing.ts'],outfile:join(temp,'api.mjs'),
   bundle:true,platform:'node',format:'esm',logLevel:'silent'});
 await build({entryPoints:['functions/api/admin/_middleware.ts'],outfile:join(temp,'auth.mjs'),
   bundle:true,platform:'node',format:'esm',logLevel:'silent'});
 const api=await import(pathToFileURL(join(temp,'api.mjs')));
 const auth=await import(pathToFileURL(join(temp,'auth.mjs')));
 const sqlite=new DatabaseSync(':memory:');
 const db={
  prepare(sql){const stmt=(params=[])=>({
    bind(...args){return stmt(args)},
    async all(){return {results:sqlite.prepare(sql).all(...params)}},
    async first(){return sqlite.prepare(sql).get(...params)||null},
    async run(){const v=sqlite.prepare(sql).run(...params);return {success:true,meta:{changes:Number(v.changes)}}},
  });return stmt()},
  async batch(cmds){sqlite.exec('BEGIN');try{const res=[];for(const c of cmds)res.push(await c.run());sqlite.exec('COMMIT');return res}
  catch(e){sqlite.exec('ROLLBACK');throw e}},
 };
 const env={MINGEAGLE_DB:db,ADMIN_ACCESS_KEY:'test-only-admin'};
 const makeReq=(method,body,access=true)=>new Request('https://app.mingeagle.com/api/admin/supplier-pricing',{
  method,headers:{...(method==='POST'?{'content-type':'application/json'}:{}),
   ...(access?{'x-admin-key':'test-only-admin'}:{})},
  ...(method==='POST'?{body:JSON.stringify(body)}:{}),
 });
 const invoke=async(method,body,access=true)=>{
  const request=makeReq(method,body,access);
  const r=await auth.onRequest({request,env,next:()=>method==='POST'
    ?api.onRequestPost({request,env}):api.onRequestGet({request,env})});
  return {status:r.status,json:await r.json()};
 };
 const before=await invoke('GET');
 assert.equal(before.status,503,'Unapplied migration must be an explicit unavailable state');
 sqlite.exec(readFileSync('migrations/0005_supplier_purchase_terms.sql','utf8'));
 const none=await invoke('GET');
 assert.equal(none.status,200);assert.deepEqual(none.json.terms,[]);
 const costRows=()=>sqlite.prepare('SELECT COUNT(*) AS n FROM supplier_purchase_terms').get().n;
 const auditRows=()=>sqlite.prepare('SELECT COUNT(*) AS n FROM supplier_purchase_audit').get().n;
 const source='Synthetic internal procurement quotation reference TEST-123, independently verified';
 const doc={action:'SAVE_DRAFT',sku:'P1-S5',expectedVersion:0,
  supplierName:'Synthetic supplier',supplierSku:'TEST-P1S5-B',
  moq:100,casePack:20,effectiveOn:'2026-10-01',expiresOn:'2099-12-31',
  sourceNote:source,
  tiers:[{minimumQuantity:100,unitCostUSD:'4.25'},{minimumQuantity:500,unitCostUSD:'3.90'}],
 };
 const unauthorized=await invoke('POST',doc,false);
 assert.equal(unauthorized.status,401,'Admin-only endpoint must reject no-key caller');
 assert.equal(costRows(),0);
 for(const [patch,reason] of [
  [{sku:'INVALID'},'Invalid SKU'],
  [{moq:0},'INVALID_INTEGER'],
  [{casePack:'2.5'},'INVALID_INTEGER'],
  [{tiers:[{minimumQuantity:50,unitCostUSD:'4.25'}]},'INVALID_TIER_ORDER'],
  [{tiers:[{minimumQuantity:100,unitCostUSD:'4.255'}]},'INVALID_MONEY'],
  [{tiers:[{minimumQuantity:100,unitCostUSD:'4.25'},{minimumQuantity:100,unitCostUSD:'3.9'}]},'INVALID_TIER_ORDER'],
  [{effectiveOn:'2026-02-30'},'INVALID_DATE'],
  [{expiresOn:'2026-01-01'},'INVALID_DATE_RANGE'],
  [{sourceNote:''},'SOURCE_REQUIRED'],
 ]){
  const reply=await invoke('POST',{...doc,...patch});
  assert.equal(reply.status,400,reason+' '+JSON.stringify(reply.json));
  assert.match(reply.json.error,new RegExp(reason));
  assert.equal(costRows(),0);
  assert.equal(auditRows(),0);
 }
 let result=await invoke('POST',doc);
 assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.json.version,1);
 assert.equal(result.json.status,'DRAFT');assert.equal(costRows(),1);assert.equal(auditRows(),1);
 let info=(await invoke('GET')).json;
 assert.equal(info.terms[0].tiers[0].purchaseCents,425);
 assert.equal(info.terms[0].tiers[1].purchaseCents,390);
 assert(!JSON.stringify(info).includes('test-only-admin'));
 result=await invoke('POST',doc);
 assert.equal(result.status,409,'Stale revision must be rejected');
 assert.equal(auditRows(),1);
 result=await invoke('POST',{action:'APPROVE',sku:'P1-S5',expectedVersion:1});
 assert.equal(result.status,400,'Approval requires explicit confirmation');
 result=await invoke('POST',{action:'APPROVE',sku:'P1-S5',expectedVersion:1,confirmed:true});
 assert.equal(result.status,200,JSON.stringify(result));
 assert.equal(result.json.status,'APPROVED');assert.equal(result.json.version,2);
 assert.equal(auditRows(),2);
 result=await invoke('POST',{action:'APPROVE',sku:'P1-S5',expectedVersion:2,confirmed:true});
 assert.equal(result.status,409,'Already approved item cannot be approved repeatedly');
 result=await invoke('POST',{...doc,expectedVersion:2,tiers:[{minimumQuantity:100,unitCostUSD:'4.00'}]});
 assert.equal(result.status,200);assert.equal(result.json.status,'DRAFT');
 info=(await invoke('GET')).json;
 assert.equal(info.terms[0].approvedAt,null,'Changes must revoke prior approval');
 assert.equal(info.terms[0].tiers[0].purchaseCents,400);
 assert.equal(info.terms[0].version,3);
 result=await invoke('POST',{action:'DISABLE',sku:'P1-S5',expectedVersion:3,confirmed:true});
 assert.equal(result.status,200);assert.equal(result.json.status,'DISABLED');
 assert.equal(auditRows(),4);
 result=await invoke('POST',{action:'APPROVE',sku:'P1-S5',expectedVersion:4,confirmed:true});
 assert.equal(result.status,409,'Disabled records require a newly reviewed draft');
 result=await invoke('POST',{...doc,expectedVersion:4,expiresOn:'2020-01-01',effectiveOn:'2019-01-01'});
 assert.equal(result.status,200);
 result=await invoke('POST',{action:'APPROVE',sku:'P1-S5',expectedVersion:5,confirmed:true});
 assert.equal(result.status,409,'Expired supplier terms cannot be approved');
 assert.equal(costRows(),1);assert.equal(auditRows(),5);
 const ordered=sqlite.prepare('SELECT action,version FROM supplier_purchase_audit ORDER BY version').all();
 assert.deepEqual(ordered.map(r=>r.action),['SAVE_DRAFT','APPROVE','SAVE_DRAFT','DISABLE','SAVE_DRAFT']);
 assert.deepEqual(ordered.map(r=>r.version),[1,2,3,4,5]);
 console.log('PASS: migration required, admin-only, validated USD source, tier ordering, no fictional price seeding, revision conflict, explicit approval, review reset, expiry lock, disabled state, durable audit and safe costs.');
 sqlite.close();
}finally{globalThis.fetch=previous;rmSync(temp,{recursive:true,force:true})}
