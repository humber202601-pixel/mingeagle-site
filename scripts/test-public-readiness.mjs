import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const dir=mkdtempSync(join(tmpdir(),'public-readiness-'));
try {
 await build({entryPoints:['functions/api/health.ts'],outfile:join(dir,'health.mjs'),bundle:true,platform:'node',format:'esm',logLevel:'silent'});
 const api=await import(pathToFileURL(join(dir,'health.mjs')));
 const sqlite=new DatabaseSync(':memory:');
 let reads=0;
 const db={prepare(sql){
   assert(/^\s*SELECT\b/i.test(sql),'Health check must be strictly read-only SQL');
   reads++;
   const stmt=sqlite.prepare(sql);
   return {
     async first(){return stmt.get()||null},
     async all(){return {results:stmt.all()}},
   };
 }};
 const hit=async(env={MINGEAGLE_DB:db})=>{const r=await api.onRequestGet({env});return {status:r.status,headers:r.headers,body:await r.json()}};
 let r=await hit({});
 assert.equal(r.status,503);
 assert.equal(r.body.databaseBinding,false);
 assert.equal(r.body.databaseReadOk,false);
 assert(!JSON.stringify(r.body).includes('sqlite'),'No raw errors in response');
 r=await hit();
 assert.equal(r.status,503,'Missing heartbeat schema must not claim healthy scheduler');
 assert.equal(r.body.databaseReadOk,true,'SELECT 1 confirms actual D1 connectivity');
 assert.equal(r.body.schedulerReadOk,false);
 sqlite.exec('CREATE TABLE scheduler_heartbeat(id TEXT PRIMARY KEY,cron TEXT,last_seen_at TEXT)');
 const put=(id,minutes)=>sqlite.prepare("INSERT OR REPLACE INTO scheduler_heartbeat VALUES (?, 'cron',datetime('now', ?))").run(id,'-'+minutes+' minutes');
 put('DISCOVERY',3);put('HUBSPOT_RECOVERY',42);put('FOLLOWUP',1380);
 r=await hit();
 assert.equal(r.status,200,JSON.stringify(r.body));
 assert.equal(r.body.ok,true);
 assert.equal(r.body.databaseReadOk,true);
 assert.equal(r.body.schedulerReadOk,true);
 assert.equal(r.body.scheduler.discovery,'healthy');
 assert.equal(r.body.scheduler.hubspotRecovery,'healthy');
 assert.equal(r.body.scheduler.dailyFollowup,'healthy');
 assert.equal(r.headers.get('cache-control'),'no-store, max-age=0');
 assert(!JSON.stringify(r.body).includes('last_seen_at'),'No raw operational timestamps exposed');
 assert(!JSON.stringify(r.body).includes('MINGEAGLE_DB'),'No binding names exposed');
 assert(reads<=7,'Readiness probe should use only 2 bounded SELECT statements per invocation');
 put('DISCOVERY',31);
 r=await hit();
 assert.equal(r.status,503);
 assert.equal(r.body.scheduler.discovery,'stale');
 put('DISCOVERY',3);
 put('HUBSPOT_RECOVERY',106);
 r=await hit();
 assert.equal(r.body.scheduler.hubspotRecovery,'stale');
 put('HUBSPOT_RECOVERY',10);
 put('FOLLOWUP',1591);
 r=await hit();
 assert.equal(r.body.scheduler.dailyFollowup,'stale');
 sqlite.close();
 const failing={prepare(){throw Error('sensitive-private-DB-failure')}};
 r=await hit({MINGEAGLE_DB:failing});
 assert.equal(r.status,503);
 assert.equal(r.body.databaseReadOk,false);
 assert(!JSON.stringify(r.body).includes('sensitive-private'),'Never expose raw D1 errors');
 console.log('PASS: public readiness requires actual read, three bounded Cron heartbeats and no SQL writes, secrets or customer data.');
}finally {rmSync(dir,{recursive:true,force:true});}
