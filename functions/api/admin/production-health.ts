// Read-only production acceptance snapshot. No fake provider counts, no new
// D1 tables, no database migrations or customer-level identifiers exposed.
// This API is protected by the existing /api/admin/_middleware.ts.
interface Env{MINGEAGLE_DB?:D1Database;HUBSPOT_PRIVATE_APP_TOKEN?:string;TURNSTILE_ENABLED?:string;TURNSTILE_SITE_KEY?:string;TURNSTILE_SECRET_KEY?:string;}
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
     'discovery_auto_items','discovery_candidates','inquiries','leads','hubspot_recovery_job_status','hubspot_recovery_batch_summary',
     'hubspot_submission_inventory_audit','hubspot_submission_quality_audit')`)
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
  const recoveryJob=include(tables,'hubspot_recovery_job_status')
    ?await db.prepare(`SELECT last_attempt_at,last_success_at,last_status,last_http_status,
        consecutive_failures FROM hubspot_recovery_job_status WHERE id='hourly'`)
       .first<{last_attempt_at:string;last_success_at:string|null;last_status:string;
         last_http_status:number|null;consecutive_failures:number}>():null;
  const recoveryBatch=include(tables,'hubspot_recovery_batch_summary')
    ?await db.prepare(`SELECT last_completed_at,processed,imported,reused,skipped,
        has_more,next_offset FROM hubspot_recovery_batch_summary WHERE id='hourly'`)
       .first<{last_completed_at:string;processed:number;imported:number;reused:number;
         skipped:number;has_more:number;next_offset:number}>():null;
  const hubspotAudit=include(tables,'hubspot_submission_inventory_audit')
    ?await db.prepare(`SELECT checked_at,count_two,has_more_two,count_fifty,
       has_more_fifty,offset_two,offset_fifty,total_two,total_fifty
       FROM hubspot_submission_inventory_audit WHERE id='public-form'`)
       .first<{checked_at:string;count_two:number;has_more_two:number|null;
         count_fifty:number;has_more_fifty:number|null;offset_two:number|null;
         offset_fifty:number|null;total_two:number|null;total_fifty:number|null}>():null;
  const quality=include(tables,'hubspot_submission_quality_audit')
    ?await db.prepare(`SELECT checked_at,scanned_count,eligible_count,rejected_count,reasons_json
      FROM hubspot_submission_quality_audit WHERE id='public-form'`)
      .first<{checked_at:string;scanned_count:number;eligible_count:number;
        rejected_count:number;reasons_json:string}>():null;
  const allowedReasonCodes=[
    'ELIGIBLE','NO_FORM_FIELDS','INVALID_INQUIRY_REFERENCE','CONSENT_NOT_GRANTED',
    'MISSING_IDENTITY','UNSUPPORTED_REQUEST_TYPE','MISSING_COUNTRY',
  ];
  let qualityReasons:Record<string,number>|null=null;
  if(quality){
    try{
      const parsed=JSON.parse(quality.reasons_json) as unknown;
      if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed)){
        const values=parsed as Record<string,unknown>;
        if(Object.keys(values).length===allowedReasonCodes.length
           &&allowedReasonCodes.every(k=>Number.isSafeInteger(values[k])&&Number(values[k])>=0)
           &&allowedReasonCodes.reduce((sum,k)=>sum+Number(values[k]),0)===quality.scanned_count
           &&Number(values.ELIGIBLE)===quality.eligible_count
           &&quality.eligible_count+quality.rejected_count===quality.scanned_count){
           qualityReasons=Object.fromEntries(allowedReasonCodes.map(k=>[k,Number(values[k])]));
        }
      }
    }catch{/* Invalid historical metadata remains unavailable; never zero */}
  }
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
  // Aggregate reconciliation only; do not select or expose contact details.
  // An unavailable leads table means the relation is unverified, not healthy.
  const inquiry=include(tables,'inquiries')
    ?await db.prepare(include(tables,'leads')
      ?`SELECT COUNT(*) AS total,
         SUM(CASE WHEN i.created_at>=datetime('now','-1 day') THEN 1 ELSE 0 END) AS last24h,
         SUM(CASE WHEN i.status='NEW' THEN 1 ELSE 0 END) AS newCount,
         SUM(CASE WHEN i.status='NEW' AND i.created_at<datetime('now','-4 hours') THEN 1 ELSE 0 END) AS newOver4h,
         SUM(CASE WHEN i.status='NEW' AND i.created_at<datetime('now','-1 day') THEN 1 ELSE 0 END) AS newOver24h,
         SUM(CASE WHEN i.status='REVIEWING' AND i.created_at<datetime('now','-1 day') THEN 1 ELSE 0 END) AS reviewingOver24h,
         SUM(CASE WHEN i.lead_id IS NULL OR l.id IS NULL THEN 1 ELSE 0 END) AS orphanLeadLinks,
         MAX(i.created_at) AS latestAt
         FROM inquiries i LEFT JOIN leads l ON l.id=i.lead_id`
      :`SELECT COUNT(*) AS total,
         SUM(CASE WHEN created_at>=datetime('now','-1 day') THEN 1 ELSE 0 END) AS last24h,
         SUM(CASE WHEN status='NEW' THEN 1 ELSE 0 END) AS newCount,
         SUM(CASE WHEN status='NEW' AND created_at<datetime('now','-4 hours') THEN 1 ELSE 0 END) AS newOver4h,
         SUM(CASE WHEN status='NEW' AND created_at<datetime('now','-1 day') THEN 1 ELSE 0 END) AS newOver24h,
         SUM(CASE WHEN status='REVIEWING' AND created_at<datetime('now','-1 day') THEN 1 ELSE 0 END) AS reviewingOver24h,
         MAX(created_at) AS latestAt FROM inquiries`).first<Row>():null;
  const lastHubspotSync=String(recovery?.last_synced_at||'');
  const lastHubspotMs=Date.parse(lastHubspotSync.replace(' ','T')+'Z');
  const recoveryAgeMs=Date.now()-lastHubspotMs;
  const hubspotRecoveryStatus=!env.HUBSPOT_PRIVATE_APP_TOKEN?'DISABLED'
    :!lastHubspotSync||!Number.isFinite(lastHubspotMs)?'NEVER_SUCCEEDED'
    :recoveryAgeMs < -5*60000||recoveryAgeMs > 3*60*60000?'STALE':'HEALTHY';
  const sourceTotal=stages.filter(x=>x.kind==='SOURCE').reduce((n,x)=>n+num(x.count),0);
  const sourceFailures=stages.filter(x=>x.kind==='SOURCE'&&['FAILED','REVIEW'].includes(x.status))
    .reduce((n,x)=>n+num(x.count),0);
  const candidates=stages.filter(x=>x.kind==='CANDIDATE')
    .reduce((n,x)=>n+num(x.count),0);
  return json({
    ok:true,generatedAt:new Date().toISOString(),
    scheduler,turnstile:{
      configured:Boolean(env.TURNSTILE_SITE_KEY&&env.TURNSTILE_SECRET_KEY),
      enabled:(env.TURNSTILE_ENABLED==='1'||env.TURNSTILE_ENABLED==='true')
        &&Boolean(env.TURNSTILE_SITE_KEY&&env.TURNSTILE_SECRET_KEY),
      misconfigured:(env.TURNSTILE_ENABLED==='1'||env.TURNSTILE_ENABLED==='true')
        &&!Boolean(env.TURNSTILE_SITE_KEY&&env.TURNSTILE_SECRET_KEY),
    },hubspot:{
      credentialConfigured:Boolean(env.HUBSPOT_PRIVATE_APP_TOKEN),
      lastSuccessfulPageAt:recovery?.last_synced_at||null,
      importedTotal:recovery?num(recovery.imported_total):null,
      nextOffset:recovery?num(recovery.offset):null,
      stateKnown:Boolean(recovery),
      status:hubspotRecoveryStatus,
      job:recoveryJob?{
        lastAttemptAt:recoveryJob.last_attempt_at,
        lastSuccessAt:recoveryJob.last_success_at,
        status:recoveryJob.last_status,
        httpStatus:recoveryJob.last_http_status,
        consecutiveFailures:num(recoveryJob.consecutive_failures),
      }:null,
      lastBatch:recoveryBatch?{
        completedAt:recoveryBatch.last_completed_at,
        processed:num(recoveryBatch.processed),imported:num(recoveryBatch.imported),
        reused:num(recoveryBatch.reused),skipped:num(recoveryBatch.skipped),
        hasMore:Boolean(recoveryBatch.has_more),nextOffset:num(recoveryBatch.next_offset),
      }:null,
      inventoryAudit:hubspotAudit?{
        checkedAt:hubspotAudit.checked_at,
        limit2Count:num(hubspotAudit.count_two),
        limit2HasMore:hubspotAudit.has_more_two===null?null:Boolean(hubspotAudit.has_more_two),
        limit50Count:num(hubspotAudit.count_fifty),
        limit50HasMore:hubspotAudit.has_more_fifty===null?null:Boolean(hubspotAudit.has_more_fifty),
        limit2Offset:hubspotAudit.offset_two,
        limit50Offset:hubspotAudit.offset_fifty,
        limit2Total:hubspotAudit.total_two,
        limit50Total:hubspotAudit.total_fifty,
      }:null,
      qualityAudit:quality&&qualityReasons?{
        checkedAt:quality.checked_at,
        scanned:num(quality.scanned_count),eligible:num(quality.eligible_count),
        excluded:num(quality.rejected_count),reasons:qualityReasons,
        scope:'First 50 HubSpot submissions; eligible is not the same as CRM imported.',
      }:null,
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
    inquiries:inquiry?{total:num(inquiry.total),last24h:num(inquiry.last24h),newCount:num(inquiry.newCount),
      newOver4h:num(inquiry.newOver4h),newOver24h:num(inquiry.newOver24h),
      reviewingOver24h:num(inquiry.reviewingOver24h),
      orphanLeadLinks:include(tables,'leads')?num(inquiry.orphanLeadLinks):null,
      latestAt:inquiry.latestAt||null}:null,
    // D1 query metrics are NOT available from the database binding. Show
    // unknown until the Cloudflare Analytics API is configured explicitly.
    quota:{actualD1RowsRead:null,actualD1RowsWritten:null,
      trackingConfigured:false,scope:'Cloudflare Analytics not connected'},
    limitations:['Cron heartbeat only indicates trigger invocation, not successful work.',
      'HubSpot submission count is unknown without authenticated provider access.',
      'Missing HubSpot recovery credentials disable backup ingestion even when Cron heartbeats are fresh.',
      'D1 read/write usage must be verified in Cloudflare Analytics.'],
  });
 }catch(e){
  console.error('production_health_failed',e);
  return json({ok:false,error:'Production checks unavailable. Verify database availability and daily quota.'},503);
 }
};
