import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const temp=mkdtempSync(join(tmpdir(),'production-health-'));
try{
  await build({entryPoints:['functions/api/admin/production-health.ts'],
    outfile:join(temp,'health.mjs'),bundle:true,platform:'node',format:'esm',logLevel:'silent'});
  const api=await import(pathToFileURL(join(temp,'health.mjs')));
  const sqlite=new DatabaseSync(':memory:');
  let queries=0,writes=0;
  const db={prepare(sql){
    queries++;
    if(/^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP)/i.test(sql))writes++;
    const fn=(args=[])=>({
      bind(...values){return fn(values)},
      async first(){return sqlite.prepare(sql).get(...args)||null},
      async all(){return {results:sqlite.prepare(sql).all(...args)}},
    });return fn();
  }};
  const load=async(extra={})=>{
    queries=0;writes=0;
    const response=await api.onRequestGet({env:{MINGEAGLE_DB:db,...extra}});
    return {status:response.status,data:await response.json(),queries,writes};
  };
  const empty=await load();
  assert.equal(empty.status,200);
  assert.equal(empty.data.discovery,null);
  assert.equal(empty.data.inquiries,null);
  assert.equal(empty.data.hubspot.credentialConfigured,false);
  assert.equal(empty.data.quota.actualD1RowsRead,null);
  assert.equal(empty.writes,0,'read-only checks cannot run DDL or modify data');
  assert(empty.queries<=12,'health dashboard should use few D1 queries');
  sqlite.exec(`CREATE TABLE scheduler_heartbeat(id TEXT PRIMARY KEY,cron TEXT,last_seen_at TEXT);
    INSERT INTO scheduler_heartbeat VALUES('DISCOVERY','* * * * *',CURRENT_TIMESTAMP);
    INSERT INTO scheduler_heartbeat VALUES('HUBSPOT_RECOVERY','0 * * * *',CURRENT_TIMESTAMP);
    CREATE TABLE hubspot_inquiry_recovery_state(id TEXT PRIMARY KEY,offset INTEGER,imported_total INTEGER,last_synced_at TEXT);
    INSERT INTO hubspot_inquiry_recovery_state VALUES('public-form',4,7,CURRENT_TIMESTAMP);
    CREATE TABLE discovery_auto_runs(id TEXT PRIMARY KEY,status TEXT,phase TEXT,updated_at TEXT,created_at TEXT,completed_at TEXT,steps_completed INTEGER);
    INSERT INTO discovery_auto_runs VALUES('fixture','COMPLETED','DONE',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,18);
    CREATE TABLE discovery_auto_items(run_id TEXT,kind TEXT,status TEXT,item_key TEXT);
    INSERT INTO discovery_auto_items VALUES('fixture','SOURCE','DONE','WEB:0');
    INSERT INTO discovery_auto_items VALUES('fixture','SOURCE','REVIEW','SOCIAL:0');
    INSERT INTO discovery_auto_items VALUES('fixture','CANDIDATE','DONE','cand1');
    INSERT INTO discovery_auto_items VALUES('fixture','CANDIDATE','DONE','cand2');
    CREATE TABLE discovery_candidates(id TEXT PRIMARY KEY,crm_lead_id TEXT);
    INSERT INTO discovery_candidates VALUES('cand1','real-lead');
    INSERT INTO discovery_candidates VALUES('cand2',NULL);
    CREATE TABLE inquiries(id TEXT PRIMARY KEY,status TEXT,created_at TEXT);
    INSERT INTO inquiries VALUES('inquiry-test','NEW',CURRENT_TIMESTAMP);`);
  const filled=await load({HUBSPOT_PRIVATE_APP_TOKEN:'test-only-secret'});
  assert.equal(filled.status,200,JSON.stringify(filled.data));
  assert.equal(filled.data.hubspot.credentialConfigured,true);
  assert.equal(filled.data.hubspot.importedTotal,7);
  assert.equal(filled.data.hubspot.nextOffset,4);
  assert.equal(filled.data.discovery.sources,2);
  assert.equal(filled.data.discovery.sourceFailures,1);
  assert.equal(filled.data.discovery.candidates,2);
  assert.equal(filled.data.discovery.imported,1,'actual CRM foreign key determines imported count');
  assert.equal(filled.data.inquiries.last24h,1);
  assert.equal(filled.data.scheduler.length,2);
  assert.equal(filled.data.quota.actualD1RowsWritten,null);
  assert.equal(filled.writes,0,'no database writes from dashboard');
  assert(filled.queries<=12,'all D1 checks must remain bounded');
  const serialized=JSON.stringify(filled.data);
  assert(!serialized.includes('test-only-secret'),'HubSpot credentials cannot leak to API');
  assert(!serialized.includes('real-lead')&&!serialized.includes('inquiry-test'),'no customer record IDs in aggregate status');
  assert.equal((await api.onRequestGet({env:{}})).status,503);
  console.log('PASS: read-only live health telemetry, optional-table handling, actual CRM import count, HubSpot credential status, Cron trigger observations, safe unknown D1 quota and no leaked customer IDs.');
}finally{rmSync(temp,{recursive:true,force:true})}
