// Read-only production acceptance snapshot. No fake provider counts, no new
// D1 tables, no database migrations or customer-level identifiers exposed.
// This API is protected by the existing /api/admin/_middleware.ts.
interface Env{MINGEAGLE_DB?:D1Database;HUBSPOT_PRIVATE_APP_TOKEN?:string;}
type Row=Record<string,unknown>;
const num=(v:unknown)=>Math.max(0,Number(v)||0);
const json=(value:Record<string,unknown>,code=200)=>Response.json(value,{status:code,headers:{'cache-control':'no-store'}});
const include=(set:Set<string>,name:string)=>set.has(name);
export const onRequestGet:PagesFunction<Env>=async({env})=>{
 const db=env.MINGEAGLE_DB;
 if(!db)return json({ok:false,error:'D1 binding is missing.'},503);
 try{
  const present=await db.prepare(`SELECT name FROM sqlite_master
    WHERE type='table' AND name IN
    ('scheduler_heartbeat','hubspot_inquiry_recovery_state','discovery_auto_runs',
     'discovery_auto_items','discovery_candidates','inquiries','leads')`)
    .all<{name:string}>();
  const tables=new Set(present.results.map(x=>x.name));
  const scheduler=include(tables,'scheduler_heartbeat')
    ?(await db.prepare(`SELECT id,cron,last_seen_at FROM scheduler_heartbeat
      WHERE id IN ('FOLLOWUP','DISCOVERY','HUBSPOT_RECOVERY')
      ORDER BY id LIMIT 3`).all<{id:string;cron:string;last_seen_at:string}>()).results:[];
  const recovery=include(tables,'hubspot_inquiry_recovery_state')
    ?await db.prepare(`SELECT offset,imported_total,last_synced_at
       FROM hubspot_inquiry_recovery_state WHERE id='public-form'`)
       .first<{offset:number;imported_total:number;last_synced_at:string|null}>():null;
  const run=include(tables,'discovery_auto_runs')
    ?await db.prepare(`SELECT id,status,phase,updated_at,created_at,
      completed_at,steps_completed FROM discovery_auto_runs
      ORDER BY created_at DESC LIMIT 1`)
      .first<Row>():null;
  let stages:Array<{kind:string;status:string;count:number}>=[];
  let resultSummary:Row|null=null;
  if(run&&include(tables,'discovery_auto_items')){
    stages=(await db.prepare(`SELECT kind,status,COUNT(*) AS count FROM discovery_auto_items
       WHERE run_id=? GROUP BY kind,status`).bind(String(run.id))
       .all<{kind:string;status:string;count:number}>()).results;
    // Count imported records only when the actual CRM lead foreign key exists,
    // never infer it from a success-looking browser status.
    if(include(tables,'discovery_candidates')){
      resultSummary=await db.prepare(`SELECT COUNT(DISTINCT c.crm_lead_id) AS imported
        FROM discovery_auto_items i
        JOIN discovery_candidates c ON c.id=i.item_key
        WHERE i.run_id=? AND i.kind='CANDIDATE'
        AND i.status='DONE' AND c.crm_lead_id IS NOT NULL`)
        .bind(String(run.id)).first<Row>();
    }
  }
  const inquiry=include(tables,'inquiries')
    ?await db.prepare(`SELECT COUNT(*) AS total,
       SUM(CASE WHEN created_at>=datetime('now','-1 day') THEN 1 ELSE 0 END) AS last24h,
       SUM(CASE WHEN status='NEW' THEN 1 ELSE 0 END) AS newCount
       FROM inquiries`).first<Row>():null;
  const sourceTotal=stages.filter(x=>x.kind==='SOURCE').reduce((n,x)=>n+num(x.count),0);
  const sourceFailures=stages.filter(x=>x.kind==='SOURCE'&&['FAILED','REVIEW'].includes(x.status))
    .reduce((n,x)=>n+num(x.count),0);
  const candidates=stages.filter(x=>x.kind==='CANDIDATE')
    .reduce((n,x)=>n+num(x.count),0);
  return json({
    ok:true,generatedAt:new Date().toISOString(),
    scheduler,hubspot:{
      credentialConfigured:Boolean(env.HUBSPOT_PRIVATE_APP_TOKEN),
      lastSuccessfulPageAt:recovery?.last_synced_at||null,
      importedTotal:recovery?num(recovery.imported_total):null,
      nextOffset:recovery?num(recovery.offset):null,
      stateKnown:Boolean(recovery),
      // A cron heartbeat proves invocation, not provider fetch success.
      actualHubspotSubmissions:null,
    },
    discovery:run?{
      status:String(run.status),phase:String(run.phase||''),
      updatedAt:String(run.updated_at||''),createdAt:String(run.created_at||''),
      completedAt:run.completed_at?String(run.completed_at):null,
      stepsCompleted:num(run.steps_completed),sources:sourceTotal,
      sourceFailures,candidates,imported:resultSummary?num(resultSummary.imported):null,
      stages,
    }:null,
    inquiries:inquiry?{total:num(inquiry.total),last24h:num(inquiry.last24h),newCount:num(inquiry.newCount)}:null,
    // D1 query metrics are NOT available from the database binding. Show
    // unknown until the Cloudflare Analytics API is configured explicitly.
    quota:{actualD1RowsRead:null,actualD1RowsWritten:null,
      trackingConfigured:false,scope:'Cloudflare Analytics not connected'},
    limitations:['Cron heartbeat only indicates trigger invocation, not successful work.',
      'HubSpot submission count is unknown without authenticated provider access.',
      'D1 read/write usage must be verified in Cloudflare Analytics.'],
  });
 }catch(e){
  console.error('production_health_failed',e);
  return json({ok:false,error:'Production checks unavailable. Verify database availability and daily quota.'},503);
 }
};
