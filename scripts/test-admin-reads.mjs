import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
const temp=mkdtempSync(join(tmpdir(),'admin-reads-'));
try{
 for(const [name,entry]of [['auth','functions/api/admin/_middleware.ts'],['outer','functions/_middleware.ts']])await build({entryPoints:[entry],outfile:join(temp,name+'.mjs'),bundle:true,platform:'node',format:'esm',logLevel:'silent'});
 const auth=await import(pathToFileURL(join(temp,'auth.mjs'))),outer=await import(pathToFileURL(join(temp,'outer.mjs'))),sqlite=new DatabaseSync(':memory:');let writes=0;
 const db = {
  prepare(sql) {
   function statement(args = []) {
    return {
     bind(...values) { return statement(values); },
     async first() { return sqlite.prepare(sql).get(...args) || null; },
     async run() {
      if (/^INSERT/i.test(sql)) writes++;
      return {meta: sqlite.prepare(sql).run(...args)};
     }
    };
   }
   return statement();
  }
 };
 let calls=0;const request=key=>new Request('https://test.example/api/admin/data',{headers:{'x-admin-key':key,'CF-Connecting-IP':'192.0.2.1'}});
 const context=key=>({request:request(key),env:{ADMIN_ACCESS_KEY:'fixture',MINGEAGLE_DB:db},next:async()=>{calls++;return Response.json({ok:true})}});
 for(let i=0;i<20;i++)assert.equal((await auth.onRequest(context('fixture'))).status,200);
 assert.equal(writes,0,'successful refreshes do not insert auth history');assert.equal(calls,20);
 for(let i=0;i<8;i++)assert.equal((await auth.onRequest(context('wrong'))).status,401);
 assert.equal((await auth.onRequest(context('fixture'))).status,429,'correct key does not bypass the existing lockout');
 sqlite.exec("UPDATE admin_auth_attempts SET created_at=datetime('now','-16 minutes')");
 assert.equal((await auth.onRequest(context('fixture'))).status,200);assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM admin_auth_attempts').get().n,8,'expired attempts cannot force repeated cleanup scans');
 const plan=sqlite.prepare("EXPLAIN QUERY PLAN SELECT COUNT(*) FROM (SELECT 1 FROM admin_auth_attempts WHERE ip_hash=? AND success=0 AND created_at>=datetime('now','-15 minutes') LIMIT 8)").all('fixture');assert(plan.some(x=>x.detail.includes('idx_admin_auth_failures')),'failure lookup uses covering index');
 const quota=await outer.onRequest({next:async()=>{throw new Error("D1_ERROR: Your account has exceeded D1's maximum number of rows read per day.")}});assert.equal(quota.status,503);const body=await quota.json();assert.equal(body.code,'DATABASE_DAILY_LIMIT');assert.equal(new Date(body.resetAt).getUTCHours(),0);assert.equal(quota.headers.get('cache-control'),'no-store');
 console.log('PASS: zero successful-auth inserts, persistent lockout, indexed and bounded failure lookup, no cleanup on polling, structured quota response and UTC reset.');
}finally{rmSync(temp,{recursive:true,force:true})}
