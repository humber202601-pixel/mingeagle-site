import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const dir=mkdtempSync(join(tmpdir(),'scheduler-heartbeat-'));
try {
  await build({entryPoints:['workers/followup-scheduler.ts','functions/api/admin/automation-control.ts'],outdir:dir,bundle:true,platform:'node',format:'esm',outExtension:{'.js':'.mjs'},entryNames:'[name]',logLevel:'silent'});
  const worker=(await import(pathToFileURL(join(dir,'followup-scheduler.mjs')))).default;
  const api=await import(pathToFileURL(join(dir,'automation-control.mjs')));
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(readFileSync('migrations/0001_core.sql','utf8'));
  const db={prepare(sql){const stmt=(args=[])=>({
    bind(...values){return stmt(values)},
    async run(){return {meta:sqlite.prepare(sql).run(...args)}},
    async first(){return sqlite.prepare(sql).get(...args)||null},
    async all(){return {results:sqlite.prepare(sql).all(...args)}},
  });return stmt()}};
  const env={MINGEAGLE_DB:db};
  const context={waitUntil(promise){this.task=promise}};
  const read=async()=>{const response=await api.onRequestGet({env});assert.equal(response.status,200);return (await response.json()).scheduler};
  assert.equal((await read()).length,0,'unseen scheduler must not be reported as active');
  await worker.scheduled({cron:'* * * * *'},env,context);await context.task;
  const first=(await read()).find(x=>x.id==='DISCOVERY');
  assert(first?.last_seen_at,'actual cron trigger writes a discovery timestamp');
  const at=sqlite.prepare("SELECT last_seen_at FROM scheduler_heartbeat WHERE id='DISCOVERY'").get().last_seen_at;
  sqlite.prepare("UPDATE scheduler_heartbeat SET last_seen_at=datetime('now','-1 minute') WHERE id='DISCOVERY'").run();
  const suppressed=sqlite.prepare("SELECT last_seen_at FROM scheduler_heartbeat WHERE id='DISCOVERY'").get().last_seen_at;
  await worker.scheduled({cron:'* * * * *'},env,context);await context.task;
  assert.equal(sqlite.prepare("SELECT last_seen_at FROM scheduler_heartbeat WHERE id='DISCOVERY'").get().last_seen_at,suppressed,'heartbeat writes at most once every 15 minutes');
  assert.notEqual(suppressed,at);
  sqlite.prepare("UPDATE scheduler_heartbeat SET last_seen_at=datetime('now','-16 minutes') WHERE id='DISCOVERY'").run();
  await worker.scheduled({cron:'* * * * *'},env,context);await context.task;
  assert.notEqual(sqlite.prepare("SELECT last_seen_at FROM scheduler_heartbeat WHERE id='DISCOVERY'").get().last_seen_at,suppressed,'stale heartbeat refreshes');
  await worker.scheduled({cron:'0 13 * * *'},env,context);await context.task;
  const heartbeats=await read();
  assert.equal(heartbeats.length,2,'separate discovery and follow-up triggers');
  assert(heartbeats.some(x=>x.id==='FOLLOWUP'),'daily follow-up cron is observed without sending mail');
  // The first hourly tick has no worker credential: record a skip, never
  // contact the provider or create customer data.
  const originalFetch=globalThis.fetch;
  let remoteCalls=0;
  globalThis.fetch=async()=>{remoteCalls++;return Response.json({ok:true,configured:true})};
  try {
    await worker.scheduled({cron:'0 * * * *'},env,context);await context.task;
    let job=sqlite.prepare("SELECT * FROM hubspot_recovery_job_status WHERE id='hourly'").get();
    assert.equal(job.last_status,'SKIPPED_NO_WORKER_KEY');
    assert.equal(job.consecutive_failures,0);
    assert.equal(job.last_success_at,null);
    assert.equal(remoteCalls,0,'Missing admin secret must not call remote recovery API');

    const enabledEnv={...env,HUBSPOT_RECOVERY_SERVICE_KEY:'synthetic-service-key'};
    globalThis.fetch=async(url,options)=>{
      remoteCalls++;
      assert.equal(url,'https://app.mingeagle.com/api/admin/hubspot-inquiry-recovery');
      assert.equal(options.headers['x-hubspot-recovery-key'],'synthetic-service-key');
      assert(!('x-admin-key' in options.headers),'Scoped scheduler must never forward admin login credentials');
      return Response.json({ok:true,configured:false,disabled:true});
    };
    await worker.scheduled({cron:'0 * * * *'},enabledEnv,context);await context.task;
    job=sqlite.prepare("SELECT * FROM hubspot_recovery_job_status WHERE id='hourly'").get();
    assert.equal(job.last_status,'SKIPPED_NO_PROVIDER_KEY');
    assert.equal(job.last_success_at,null);
    assert.equal(job.consecutive_failures,0);

    globalThis.fetch=async()=>Response.json({ok:true,configured:true,processed:0,imported:0});
    await worker.scheduled({cron:'0 * * * *'},enabledEnv,context);await context.task;
    job=sqlite.prepare("SELECT * FROM hubspot_recovery_job_status WHERE id='hourly'").get();
    assert.equal(job.last_status,'SUCCEEDED');
    assert(job.last_success_at,'Only provider-confirmed success persists success timestamp');

    globalThis.fetch=async()=>Response.json({ok:false,error:'blocked'},{status:401});
    await worker.scheduled({cron:'0 * * * *'},enabledEnv,context);await context.task;
    job=sqlite.prepare("SELECT * FROM hubspot_recovery_job_status WHERE id='hourly'").get();
    assert.equal(job.last_status,'AUTH_FAILED');
    assert.equal(job.consecutive_failures,1);
    assert(job.last_success_at,'Failures must not erase last success');

    globalThis.fetch=async()=>{throw Error('Synthetic network failure')};
    await worker.scheduled({cron:'0 * * * *'},enabledEnv,context);await context.task;
    job=sqlite.prepare("SELECT * FROM hubspot_recovery_job_status WHERE id='hourly'").get();
    assert.equal(job.last_status,'NETWORK_FAILED');
    assert.equal(job.consecutive_failures,2);
    assert(job.last_success_at);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM hubspot_recovery_job_status").get().n,1);
  } finally {globalThis.fetch=originalFetch;}

  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM messages').get().n,0,'passive monitoring never sends customer messages');
  sqlite.close();
  console.log('PASS: real cron trigger evidence, never-reported-unseen state, 15-minute throttling, two independent schedules and zero outreach.');
} finally {rmSync(dir,{recursive:true,force:true})}
