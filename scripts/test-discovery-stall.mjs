import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const tmp=mkdtempSync(join(tmpdir(),'mingeagle-stall-'));
const originalFetch=globalThis.fetch;
try{
  await build({entryPoints:['functions/api/admin/discovery-auto-v1.ts','src/discovery-stall.ts'],
    outdir:tmp,platform:'node',format:'esm',bundle:true,logLevel:'silent',outExtension:{'.js':'.mjs'}});
  const api=await import(pathToFileURL(join(tmp,'functions/api/admin/discovery-auto-v1.mjs')));
  const {discoveryStall}=await import(pathToFileURL(join(tmp,'src/discovery-stall.mjs')));
  const clock=Date.parse('2026-10-10T09:00:00Z');
  const input={run:{status:'RUNNING',created_at:'2026-10-10 08:00:00',last_progress_at:'2026-10-10 08:52:00'},
    workerBusy:false,progress:{waiting:43,processing:1}};
  const stalled=discoveryStall(input,clock);
  assert.equal(stalled.stale,true);
  assert.equal(stalled.canRecover,true);
  assert.equal(stalled.elapsedMinutes,8);
  assert.equal(stalled.waiting,43);
  assert.equal(discoveryStall({...input,workerBusy:true},clock).canRecover,false,
    'do not ask user to steal a live worker lease');
  assert.equal(discoveryStall({...input,run:{...input.run,last_progress_at:'2026-10-10 08:59:00'}},clock).stale,false);
  assert.equal(discoveryStall({...input,run:{...input.run,status:'PAUSED'}},clock).stale,false);
  assert.equal(discoveryStall({...input,progress:{waiting:0,processing:0}},clock).stale,false);
  assert.equal(discoveryStall({...input,run:{...input.run,last_progress_at:null}},clock).stale,true,
    'legacy active runs still reveal age using their created time');
  assert.equal(discoveryStall({run:{status:'RUNNING'},progress:{waiting:1}},clock).status,'UNKNOWN',
    'unknown clock should not report falsely confirmed stall');

  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(readFileSync('migrations/0001_core.sql','utf8'));
  const db={prepare(sql){
    const statement=(values=[])=>({
      sql,values,bind(...args){return statement(args)},
      async first(){return sqlite.prepare(sql).get(...values)||null},
      async all(){return {results:sqlite.prepare(sql).all(...values)}},
      async run(){const result=sqlite.prepare(sql).run(...values);return {success:true,meta:{changes:Number(result.changes)}}},
    });return statement();
  },async batch(items){
    sqlite.exec('BEGIN');
    try{const values=await Promise.all(items.map(async item=>sqlite.prepare(item.sql).run(...item.values)));
      sqlite.exec('COMMIT');return values.map(r=>({success:true,meta:{changes:Number(r.changes)}}));}
    catch(e){sqlite.exec('ROLLBACK');throw e;}
  }};
  const env={MINGEAGLE_DB:db};
  const context={work:[],waitUntil(p){this.work.push(p)}};
  const post=async(body)=>{
    const response=await api.onRequestPost({request:new Request('https://app.mingeagle.com/api/admin/discovery-auto-v1',{
      method:'POST',headers:{'content-type':'application/json','x-admin-key':'test-admin'},
      body:JSON.stringify(body)}),env,waitUntil:p=>context.waitUntil(p)});
    return {status:response.status,data:await response.json()};
  };
  const started=await post({action:'START',stateCode:'TX',customerType:'BASKETBALL_TRAINING',city:'Dallas',targetCount:20,batches:1});
  assert.equal(started.status,200,JSON.stringify(started.data));
  const id=started.data.run.id;
  assert(sqlite.prepare('PRAGMA table_info(discovery_auto_runs)').all().some(c=>c.name==='last_progress_at'),
    'the new progress clock field is created in the existing schema migration');
  sqlite.prepare("UPDATE discovery_auto_items SET status='DONE' WHERE run_id=? AND item_key='FACEBOOK:0'").run(id);
  sqlite.prepare("UPDATE discovery_auto_runs SET steps_completed=56,last_progress_at=datetime('now','-7 minutes'),updated_at=CURRENT_TIMESTAMP WHERE id=?").run(id);
  // An already confirmed CRM lead must survive manual recovery.
  sqlite.exec("INSERT INTO companies(id,name) VALUES('company-kept','Confirmed Academy')");
  sqlite.exec("INSERT INTO leads(id,company_id,source) VALUES('lead-kept','company-kept','DISCOVERY')");
  sqlite.exec("INSERT INTO discovery_candidates(id,source_key,name,customer_type,city,state_region,website,source_url,crm_lead_id) VALUES('confirmed-candidate','web:confirmed.example','Confirmed Academy','BASKETBALL_TRAINING','Dallas','TX','https://confirmed.example','https://confirmed.example','lead-kept')");
  sqlite.prepare("INSERT INTO discovery_auto_items(run_id,kind,item_key,status) VALUES(?,'CANDIDATE','confirmed-candidate','DONE')").run(id);
  const getResponse=await api.onRequestGet({request:new Request('https://app.mingeagle.com/api/admin/discovery-auto-v1?runId='+id),env});
  const snapshot=await getResponse.json();
  assert.equal(snapshot.run.steps_completed,56);
  assert(snapshot.run.last_progress_at);
  assert.equal(snapshot.progress.processing,0);
  assert(snapshot.progress.waiting>0);
  assert.equal(snapshot.progress.unresolved,0);
  assert.equal(snapshot.counts.find(r=>r.kind==='CANDIDATE'&&r.status==='DONE').confirmed,1);

  sqlite.prepare("UPDATE discovery_auto_runs SET lease_token='other-worker',lease_until=datetime('now','+60 seconds') WHERE id=?").run(id);
  const locked=await post({action:'RECOVER',runId:id});
  assert.equal(locked.status,200);
  assert.equal(locked.data.accepted,false);
  assert.match(locked.data.recoveryNote,/任务锁/);
  assert.equal(context.work.length,0);
  assert.equal(sqlite.prepare('SELECT steps_completed AS n FROM discovery_auto_runs WHERE id=?').get(id).n,56);

  // Fake only the internal step API; do not call real public providers.
  let stepRequests=0;
  globalThis.fetch=async url=>{
    assert(new URL(String(url)).pathname.endsWith('/discovery-auto-step-v1'));
    stepRequests++;
    return Response.json({ok:true,found:0});
  };
  sqlite.prepare("UPDATE discovery_auto_runs SET lease_until=datetime('now','-2 minutes') WHERE id=?").run(id);
  const recovery=await post({action:'RECOVER',runId:id});
  assert.equal(recovery.status,200,JSON.stringify(recovery.data));
  assert.equal(recovery.data.accepted,true);
  assert.match(recovery.data.recoveryNote,/不会清除已入库客户/);
  assert.equal(context.work.length,1);
  await Promise.all(context.work.splice(0));
  assert(stepRequests>0,'a genuinely expired worker lease restarts a bounded batch');
  assert(sqlite.prepare('SELECT steps_completed AS n FROM discovery_auto_runs WHERE id=?').get(id).n>56);
  assert.equal(sqlite.prepare("SELECT status FROM discovery_auto_items WHERE run_id=? AND kind='CANDIDATE' AND item_key='confirmed-candidate'").get(id).status,'DONE');
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM leads WHERE id='lead-kept'").get().n,1,
    'recovery is never an archive, cleanup or lead deletion');
  assert.equal((await post({action:'RECOVER',runId:'unknown'})).status,409);
  sqlite.prepare("UPDATE discovery_auto_runs SET status='PAUSED' WHERE id=?").run(id);
  assert.equal((await post({action:'RECOVER',runId:id})).status,409);

  const ui=readFileSync('src/AutoDiscovery.tsx','utf8');
  assert(ui.includes("stall.canRecover")&&ui.includes("action('RECOVER')"));
  assert(ui.includes('run.last_progress_at')&&ui.includes('data.progress?.waiting'));
  assert(ui.includes('setInterval(()=>setClockNow(Date.now()),30000)'),
    'stalled view must update even without new backend progress');
  console.log('PASS: 5-minute actual-step stall detection, no false active-lease recovery, explicit recover after expired lease, preserved finished work/CRM customer, accurate queue counts and live status UI.');
}finally{
  globalThis.fetch=originalFetch;
  rmSync(tmp,{recursive:true,force:true});
}
