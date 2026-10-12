interface Env {
  MINGEAGLE_DB: D1Database;
  ADMIN_ACCESS_KEY?: string;
  HUBSPOT_RECOVERY_SERVICE_KEY?: string;
  AUTO_EMAIL_ENABLED?: string;
}

type DueLead = Record<string, unknown>;
type AutomationSettings = {
  enabled: boolean;
  maxPerRun: number;
  maxPerLead: number;
};

const EMAIL_QUEUE_API = 'https://app.mingeagle.com/api/admin/email-queue';
const DEFAULT_MAX_AUTO_SEND_PER_RUN = 5;
const DEFAULT_MAX_AUTO_SEND_PER_LEAD = 3;

function taskFor(status: string, reference: string, daysSinceContact: number) {
  if (status === 'WON') return {
    type: 'REORDER',
    title: `复购跟进 · ${reference}`,
    description: '客户已完成历史订单，复购周期已到。请审核复购邮件草稿并确认是否发送。',
    priority: 'MEDIUM',
  };
  if (status === 'CONTACTED') {
    const stage = daysSinceContact >= 14 ? '最终跟进' : daysSinceContact >= 7 ? '第二次跟进' : '第一次跟进';
    return {
      type: 'OUTREACH_FOLLOW_UP',
      title: `${stage} · ${reference}`,
      description: `客户尚未回复。距离最近联系约 ${Math.max(0, Math.floor(daysSinceContact))} 天，请进行礼貌跟进。`,
      priority: daysSinceContact >= 7 ? 'HIGH' : 'MEDIUM',
    };
  }
  if (status === 'QUOTE') return { type: 'QUOTE_FOLLOW_UP', title: `跟进报价 · ${reference}`, description: '客户处于报价阶段，请确认是否有价格、交付或付款问题需要处理。', priority: 'HIGH' };
  if (status === 'SAMPLE') return { type: 'SAMPLE_FOLLOW_UP', title: `跟进样品 · ${reference}`, description: '客户处于样品阶段，请确认样品安排、物流或试用反馈。', priority: 'HIGH' };
  if (status === 'NEGOTIATION') return { type: 'SALES_FOLLOW_UP', title: `继续商务洽谈 · ${reference}`, description: '客户处于洽谈阶段，请推进价格、付款、物流或成交确认。', priority: 'HIGH' };
  if (status === 'INTERESTED') return { type: 'SALES_FOLLOW_UP', title: `推进意向客户 · ${reference}`, description: '客户已经表达兴趣，请确认数量、配置和目的地，并推进样品或报价。', priority: 'HIGH' };
  if (status === 'REPLIED') return { type: 'REPLY_ACTION', title: `处理客户回复 · ${reference}`, description: '客户已有回复，请检查沟通记录并完成下一步回复。', priority: 'MEDIUM' };
  return { type: 'FOLLOW_UP', title: `销售跟进 · ${reference}`, description: '请检查该客户的下一步销售动作。', priority: 'MEDIUM' };
}

async function ensureEmailQueue(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS email_queue (
    id TEXT PRIMARY KEY,
    lead_id TEXT NOT NULL,
    company_id TEXT,
    contact_id TEXT,
    email TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    queue_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED',
    auto_eligible INTEGER NOT NULL DEFAULT 0,
    source_status TEXT,
    scheduled_for TEXT,
    dedupe_key TEXT NOT NULL UNIQUE,
    last_error TEXT,
    sent_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_queue_status_schedule ON email_queue(status, scheduled_for)`).run();
}

async function getAutomationSettings(db: D1Database): Promise<AutomationSettings> {
  await db.prepare(`CREATE TABLE IF NOT EXISTS automation_settings (
    id TEXT PRIMARY KEY,
    auto_email_enabled INTEGER NOT NULL DEFAULT 1,
    max_auto_send_per_run INTEGER NOT NULL DEFAULT 5,
    max_auto_send_per_lead INTEGER NOT NULL DEFAULT 3,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await db.prepare(`INSERT OR IGNORE INTO automation_settings
    (id, auto_email_enabled, max_auto_send_per_run, max_auto_send_per_lead)
    VALUES ('default', 1, 5, 3)`).run();
  const row = await db.prepare(`SELECT auto_email_enabled, max_auto_send_per_run, max_auto_send_per_lead
    FROM automation_settings WHERE id='default'`).first<Record<string, unknown>>();
  return {
    enabled: Number(row?.auto_email_enabled || 0) === 1,
    maxPerRun: Math.min(20, Math.max(1, Number(row?.max_auto_send_per_run || DEFAULT_MAX_AUTO_SEND_PER_RUN))),
    maxPerLead: Math.min(5, Math.max(1, Number(row?.max_auto_send_per_lead || DEFAULT_MAX_AUTO_SEND_PER_LEAD))),
  };
}

function firstName(row: DueLead) {
  const value = String(row.first_name || '').trim() || String(row.contact || '').trim().split(' ')[0];
  return value || 'there';
}

function emailTemplate(row: DueLead) {
  const status = String(row.status || '');
  const name = firstName(row);
  const company = String(row.company || 'your organization');
  const days = Math.max(0, Math.floor(Number(row.days_since_contact || 0)));

  if (status === 'WON') return {
    type: 'REORDER_FOLLOW_UP', subject: 'Ready for a restock? — MING EAGLE',
    body: `Hi ${name},\n\nI hope everything has been going well with your MING EAGLE order. I wanted to check whether ${company} may need a restock or another batch of silent ball products.\n\nIf you are planning a repeat order, just reply with the approximate quantity and delivery location. I can prepare an updated quotation for you.\n\nBest regards,\nMING EAGLE`,
  };
  if (status === 'QUOTE') return {
    type: 'QUOTE_FOLLOW_UP', subject: 'Following up on your MING EAGLE quote',
    body: `Hi ${name},\n\nI wanted to follow up on the MING EAGLE quotation we shared. Please let me know if you have any questions about pricing, shipping, lead time or payment terms. We can review the order configuration before confirmation.\n\nBest regards,\nMING EAGLE`,
  };
  if (status === 'SAMPLE') return {
    type: 'SAMPLE_FOLLOW_UP', subject: 'MING EAGLE sample follow-up',
    body: `Hi ${name},\n\nI’m following up on the sample discussion. Please let me know if you need help with the sample arrangement, shipping details or product feedback. We can also prepare wholesale pricing when you are ready.\n\nBest regards,\nMING EAGLE`,
  };
  if (status === 'NEGOTIATION') return {
    type: 'NEGOTIATION_FOLLOW_UP', subject: 'Following up on commercial terms — MING EAGLE',
    body: `Hi ${name},\n\nI’m following up on our discussion. If you still need anything clarified around price, shipping, lead time or payment terms, please let me know and I’ll review the best available option.\n\nBest regards,\nMING EAGLE`,
  };
  if (status === 'INTERESTED') return {
    type: 'INTEREST_FOLLOW_UP', subject: 'Next step for MING EAGLE silent basketball',
    body: `Hi ${name},\n\nThanks again for your interest in our silent basketball products. To move forward, please send the approximate quantity and delivery ZIP code and I can confirm the best pricing and next step.\n\nBest regards,\nMING EAGLE`,
  };

  const stage = days >= 14 ? 'FINAL' : days >= 7 ? 'SECOND' : 'FIRST';
  return {
    type: `OUTREACH_${stage}_FOLLOW_UP`,
    subject: stage === 'FINAL' ? 'Final check-in — MING EAGLE silent basketball' : 'Following up — MING EAGLE silent basketball',
    body: stage === 'FINAL'
      ? `Hi ${name},\n\nOne final check-in regarding our silent basketball products for ${company}. If this is not relevant right now, no problem. If you would like wholesale pricing or a sample option later, feel free to reply anytime.\n\nBest regards,\nMING EAGLE`
      : `Hi ${name},\n\nJust following up on my previous message about our silent basketball products. If this could fit ${company}, I can send simple wholesale pricing based on your expected quantity and delivery location.\n\nWould it be useful if I sent pricing for 20, 50 and 100 units?\n\nBest regards,\nMING EAGLE`,
  };
}

async function queueDueEmails(db: D1Database, due: DueLead[]) {
  await ensureEmailQueue(db);
  let queued = 0;
  for (const row of due) {
    const email = String(row.email || '').trim();
    if (!email.includes('@') || String(row.status) === 'REPLIED') continue;
    const tmpl = emailTemplate(row);
    const leadId = String(row.id);
    const nextAt = String(row.next_action_at || 'now');
    const dedupe = `${leadId}|${String(row.status)}|${nextAt}|${tmpl.type}`;
    const isReorder = String(row.status) === 'WON';
    const autoEligible = isReorder ? 0 : (Number(row.auto_eligible || 0) === 1 ? 1 : 0);
    const status = isReorder ? 'REVIEW_REQUIRED' : (autoEligible ? 'READY' : 'REVIEW_REQUIRED');
    const result = await db.prepare(`INSERT OR IGNORE INTO email_queue
      (id, lead_id, company_id, contact_id, email, subject, body, queue_type, status, auto_eligible, source_status, scheduled_for, dedupe_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        crypto.randomUUID(), leadId,
        row.company_id ? String(row.company_id) : null,
        row.primary_contact_id ? String(row.primary_contact_id) : null,
        email, tmpl.subject, tmpl.body, tmpl.type, status, autoEligible, String(row.status), nextAt, dedupe,
      ).run();
    if ((result.meta?.changes || 0) > 0) queued += 1;
  }
  return queued;
}

async function autoSendReadyEmails(env: Env, settings: AutomationSettings) {
  const masterEnabled = String(env.AUTO_EMAIL_ENABLED || '').toLowerCase() === 'true';
  const enabled = masterEnabled && settings.enabled;
  const adminKey = env.ADMIN_ACCESS_KEY || '';
  if (!enabled || !adminKey) {
    return { enabled, masterEnabled, configured: Boolean(adminKey), reviewed: 0, sent: 0, manualReview: 0, failed: 0 };
  }

  const db = env.MINGEAGLE_DB;
  await ensureEmailQueue(db);
  const ready = await db.prepare(`SELECT id, lead_id
    FROM email_queue
    WHERE status='READY'
      AND auto_eligible=1
      AND datetime(COALESCE(scheduled_for,created_at)) <= datetime('now')
    ORDER BY datetime(COALESCE(scheduled_for,created_at)) ASC
    LIMIT ?`).bind(settings.maxPerRun).all<{ id: string; lead_id: string }>();

  let sent = 0;
  let manualReview = 0;
  let failed = 0;

  for (const item of ready.results) {
    const prior = await db.prepare(`SELECT COUNT(*) AS count FROM email_queue
      WHERE lead_id=? AND auto_eligible=1 AND status='SENT'`).bind(item.lead_id).first<{ count: number }>();
    if (Number(prior?.count || 0) >= settings.maxPerLead) {
      await db.prepare(`UPDATE email_queue
        SET status='REVIEW_REQUIRED', last_error='Automatic follow-up limit reached; manual review required.', updated_at=CURRENT_TIMESTAMP
        WHERE id=? AND status='READY'`).bind(item.id).run();
      await db.prepare(`INSERT INTO activities (id, entity_type, entity_id, activity_type, title, description)
        VALUES (?, 'LEAD', ?, 'AUTOMATION_REVIEW_REQUIRED', 'Automatic email limit reached', 'Automatic follow-up limit reached. Manual review is required before further outreach.')`)
        .bind(crypto.randomUUID(), item.lead_id).run();
      manualReview += 1;
      continue;
    }

    try {
      const response = await fetch(EMAIL_QUEUE_API, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-key': adminKey,
          'user-agent': 'MING-EAGLE-Followup-Scheduler/1.0',
        },
        body: JSON.stringify({ action: 'SEND', queueId: item.id }),
      });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || `Email API returned ${response.status}`);
      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Automatic email send failed.';
      await db.prepare(`UPDATE email_queue SET status='FAILED', last_error=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND status<>'SENT'`)
        .bind(message.slice(0, 1000), item.id).run();
      failed += 1;
    }
  }

  return { enabled: true, masterEnabled: true, configured: true, reviewed: ready.results.length, sent, manualReview, failed };
}

async function runSweep(env: Env) {
  const db = env.MINGEAGLE_DB;
  const settings = await getAutomationSettings(db);
  const due = await db.prepare(`SELECT
      l.id, l.status, l.source, l.company_id, l.primary_contact_id, l.last_contact_at, l.next_action_at,
      COALESCE(c.name, ct.full_name, ct.email, 'Lead') AS reference,
      COALESCE(c.name, 'Individual buyer') AS company,
      COALESCE(ct.full_name, ct.email, 'Customer') AS contact,
      ct.first_name, ct.email,
      COALESCE((julianday('now') - julianday(l.last_contact_at)), 0) AS days_since_contact,
      COALESCE(ct.do_not_contact,0) AS do_not_contact,
      CASE WHEN
        l.source='WEBSITE'
        OR l.status IN ('INTERESTED','SAMPLE','QUOTE','NEGOTIATION')
        OR EXISTS(SELECT 1 FROM inquiries i WHERE i.lead_id=l.id)
        OR EXISTS(SELECT 1 FROM samples s WHERE s.lead_id=l.id)
        OR EXISTS(SELECT 1 FROM quotes q WHERE q.lead_id=l.id)
        OR EXISTS(SELECT 1 FROM orders o WHERE o.lead_id=l.id)
      THEN 1 ELSE 0 END AS auto_eligible
    FROM leads l
    LEFT JOIN companies c ON c.id=l.company_id
    LEFT JOIN contacts ct ON ct.id=l.primary_contact_id
    WHERE l.next_action_at IS NOT NULL
      AND datetime(l.next_action_at) <= datetime('now')
      AND l.status IN ('CONTACTED','REPLIED','INTERESTED','SAMPLE','QUOTE','NEGOTIATION','WON')
      AND COALESCE(ct.do_not_contact,0)=0
    ORDER BY l.next_action_at ASC
    LIMIT 200`).all<DueLead>();

  const queued = await queueDueEmails(db, due.results);
  const autoEmail = await autoSendReadyEmails(env, settings);

  let created = 0;
  for (const row of due.results) {
    const leadId = String(row.id);
    const isReorder = String(row.status) === 'WON';
    const autoEligible = !isReorder && Number(row.auto_eligible || 0) === 1;
    const autoMode = String(env.AUTO_EMAIL_ENABLED || '').toLowerCase() === 'true' && Boolean(env.ADMIN_ACCESS_KEY) && settings.enabled;

    if (autoMode && autoEligible && String(row.status) !== 'REPLIED') continue;

    const open = await db.prepare(`SELECT id FROM tasks WHERE lead_id=? AND status IN ('OPEN','IN_PROGRESS') LIMIT 1`).bind(leadId).first<{ id: string }>();
    if (open?.id) continue;

    const task = taskFor(String(row.status), String(row.reference || 'Lead'), Number(row.days_since_contact || 0));
    await db.prepare(`INSERT INTO tasks (id, lead_id, company_id, contact_id, type, title, description, status, priority, due_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, CURRENT_TIMESTAMP)`)
      .bind(
        crypto.randomUUID(), leadId,
        row.company_id ? String(row.company_id) : null,
        row.primary_contact_id ? String(row.primary_contact_id) : null,
        task.type, task.title, task.description, task.priority,
      ).run();

    await db.prepare(`UPDATE leads SET next_best_action=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(task.title, leadId).run();
    await db.prepare(`INSERT INTO activities (id, entity_type, entity_id, activity_type, title, description)
      VALUES (?, 'LEAD', ?, 'AUTOMATION_FOLLOW_UP', 'Automatic follow-up task created', ?)`)
      .bind(crypto.randomUUID(), leadId, task.title).run();
    created += 1;
  }

  return {
    reviewed: due.results.length,
    tasksCreated: created,
    emailsQueued: queued,
    settings,
    autoEmail,
  };
}

// At most one persisted heartbeat per cron in 15 minutes. Deployment
// success does not establish that Cloudflare is actually invoking Cron Triggers.
// No customer/contact data or email is written by this passive monitor.
let heartbeatTableReady: Promise<void> | undefined;
async function recordHeartbeat(env: Env, cron: string) {
  try {
    if (!heartbeatTableReady) heartbeatTableReady = env.MINGEAGLE_DB.prepare(`CREATE TABLE IF NOT EXISTS scheduler_heartbeat (
      id TEXT PRIMARY KEY,
      cron TEXT NOT NULL,
      last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`).run().then(() => undefined).catch(error => { heartbeatTableReady = undefined; throw error; });
    await heartbeatTableReady;
    const id = cron === '0 13 * * *' ? 'FOLLOWUP' : cron === '0 * * * *' ? 'HUBSPOT_RECOVERY' : 'DISCOVERY';
    await env.MINGEAGLE_DB.prepare(`INSERT INTO scheduler_heartbeat (id,cron,last_seen_at)
      VALUES (?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
      cron=excluded.cron,last_seen_at=CURRENT_TIMESTAMP
      WHERE scheduler_heartbeat.last_seen_at <= datetime('now','-15 minutes')`).bind(id,cron).run();
  } catch (error) {
    console.error('scheduler_heartbeat_failed', error);
  }
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const job = _event.cron === '0 13 * * *' ? runSweep(env) : _event.cron === '0 * * * *' ? runHubspotRecovery(env) : continueDiscovery(env);
    ctx.waitUntil(Promise.all([recordHeartbeat(env,_event.cron),job]).then(() => undefined));
  },
  async fetch() {
    return Response.json({
      ok: true,
      service: 'MING EAGLE follow-up scheduler',
      mode: 'cron-only',
      automationControl: 'D1 automation_settings + Cloudflare master switch',
    });
  },
};

// Continue only existing discovery jobs; this route never queues or sends outreach.
async function continueDiscovery(env:Env){
  if(!env.ADMIN_ACCESS_KEY)return;
  // The partial active-run index makes idle checks independent of job history.
  // Do not call authenticated API routes (and write auth history) when idle.
  try {
    const active = await env.MINGEAGLE_DB.prepare(`SELECT id FROM discovery_auto_runs WHERE status IN ('RUNNING','PAUSED') LIMIT 1`).first<{id:string}>();
    if (!active) return;
    const running = await env.MINGEAGLE_DB.prepare(`SELECT status FROM discovery_auto_runs WHERE id=?`).bind(active.id).first<{status:string}>();
    if (running?.status !== 'RUNNING') return;
  } catch { return; }
  for(let step=0;step<12;step++){
    try{const r=await fetch('https://app.mingeagle.com/api/admin/discovery-auto-v1',{
      method:'POST',headers:{'content-type':'application/json','x-admin-key':env.ADMIN_ACCESS_KEY},body:JSON.stringify({action:'TICK'}),signal:AbortSignal.timeout(25000)});
    if(!/json/i.test(r.headers.get('content-type')||''))break;
    const data=await r.json() as {ok?:boolean;idle?:boolean;workerBusy?:boolean;run?:{status:string}};
    if(!r.ok||!data.ok||data.idle||data.workerBusy||data.run?.status!=='RUNNING')break;
    }catch{break;}
  }
}

// One row of coarse operational metadata per scheduler. No PII, secrets, provider
// response bodies, inquiry IDs or message content is stored in this table.
type HubspotJobResult = 'SUCCEEDED' | 'SKIPPED_NO_WORKER_KEY' |
  'SKIPPED_NO_PROVIDER_KEY' | 'AUTH_FAILED' | 'API_FAILED' | 'NETWORK_FAILED';
async function recordHubspotJob(env:Env,status:HubspotJobResult,httpStatus:number|null=null){
  try {
    const db=env.MINGEAGLE_DB;
    await db.prepare(`CREATE TABLE IF NOT EXISTS hubspot_recovery_job_status (
      id TEXT PRIMARY KEY,
      last_attempt_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_success_at TEXT,
      last_status TEXT NOT NULL,
      last_http_status INTEGER,
      consecutive_failures INTEGER NOT NULL DEFAULT 0
    )`).run();
    await db.prepare(`INSERT INTO hubspot_recovery_job_status
      (id,last_attempt_at,last_success_at,last_status,last_http_status,consecutive_failures)
      VALUES ('hourly',CURRENT_TIMESTAMP,
        CASE WHEN ?='SUCCEEDED' THEN CURRENT_TIMESTAMP ELSE NULL END,
        ?,?,
        CASE WHEN ?='SUCCEEDED' OR ? LIKE 'SKIPPED%' THEN 0 ELSE 1 END)
      ON CONFLICT(id) DO UPDATE SET
        last_attempt_at=CURRENT_TIMESTAMP,
        last_success_at=CASE WHEN excluded.last_status='SUCCEEDED'
          THEN CURRENT_TIMESTAMP ELSE hubspot_recovery_job_status.last_success_at END,
        last_status=excluded.last_status,
        last_http_status=excluded.last_http_status,
        consecutive_failures=CASE WHEN excluded.last_status='SUCCEEDED' THEN 0
          WHEN excluded.last_status LIKE 'SKIPPED%' THEN hubspot_recovery_job_status.consecutive_failures
          ELSE hubspot_recovery_job_status.consecutive_failures+1 END
    `).bind(status,status,httpStatus,status,status).run();
  } catch(error) {
    console.error('hubspot_recovery_job_status_write_failed',error);
  }
}

// Report only aggregate outcome counts for the latest confirmed remote page.
// This deliberately holds no customer identities or submission payloads.
type RecoveryBatch = {
  processed:number; imported:number; reused:number; skipped:number;
  hasMore:boolean; nextOffset:number;
};
function validBatch(data:unknown):data is RecoveryBatch {
  if(!data||typeof data!=='object')return false;
  const x=data as Record<string,unknown>;
  const keys=['processed','imported','reused','skipped','nextOffset'];
  if(!keys.every(k=>Number.isSafeInteger(x[k])&&Number(x[k])>=0))return false;
  if(typeof x.hasMore!=='boolean'||Number(x.processed)>2)return false;
  return Number(x.imported)+Number(x.reused)+Number(x.skipped)===Number(x.processed);
}
async function recordHubspotBatch(env:Env,batch:RecoveryBatch){
  try {
    const db=env.MINGEAGLE_DB;
    await db.prepare(`CREATE TABLE IF NOT EXISTS hubspot_recovery_batch_summary(
      id TEXT PRIMARY KEY,
      last_completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      processed INTEGER NOT NULL,imported INTEGER NOT NULL,
      reused INTEGER NOT NULL,skipped INTEGER NOT NULL,
      has_more INTEGER NOT NULL,next_offset INTEGER NOT NULL
    )`).run();
    await db.prepare(`INSERT INTO hubspot_recovery_batch_summary
      (id,last_completed_at,processed,imported,reused,skipped,has_more,next_offset)
      VALUES('hourly',CURRENT_TIMESTAMP,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET
        last_completed_at=CURRENT_TIMESTAMP,
        processed=excluded.processed,imported=excluded.imported,
        reused=excluded.reused,skipped=excluded.skipped,
        has_more=excluded.has_more,next_offset=excluded.next_offset
    `).bind(batch.processed,batch.imported,batch.reused,batch.skipped,
      batch.hasMore?1:0,batch.nextOffset).run();
  }catch{console.error('hubspot_recovery_batch_summary_write_failed');}
}

// A diagnostic is read-only, runs at most once daily and never alters the
// recovery cursor or the last confirmed import outcome.
type AuditPage={count:number;hasMore:boolean|null;offset:number|null;total:number|null};
type AuditReason='ELIGIBLE'|'NO_FORM_FIELDS'|'INVALID_INQUIRY_REFERENCE'|
  'CONSENT_NOT_GRANTED'|'MISSING_IDENTITY'|'UNSUPPORTED_REQUEST_TYPE'|'MISSING_COUNTRY';
const auditReasonKeys:AuditReason[]=[
 'ELIGIBLE','NO_FORM_FIELDS','INVALID_INQUIRY_REFERENCE',
 'CONSENT_NOT_GRANTED','MISSING_IDENTITY','UNSUPPORTED_REQUEST_TYPE','MISSING_COUNTRY'
];
type AuditClassification={scanned:number;eligible:number;excluded:number;
 reasons:Record<AuditReason,number>};
type AuditResponse={ok:true;inventory:{limit2:AuditPage;limit50:AuditPage};
 classification:AuditClassification};
function validAuditClassification(a:unknown,numberScanned:number):a is AuditClassification{
 if(!a||typeof a!=='object')return false;
 const c=a as Record<string,unknown>,r=c.reasons;
 if(!Number.isSafeInteger(c.scanned)||c.scanned!==numberScanned||
    !Number.isSafeInteger(c.eligible)||!Number.isSafeInteger(c.excluded)||
    Number(c.eligible)<0||Number(c.excluded)<0||
    Number(c.eligible)+Number(c.excluded)!==numberScanned||
    !r||typeof r!=='object')return false;
 const reasons=r as Record<string,unknown>;
 if(Object.keys(reasons).length!==auditReasonKeys.length)return false;
 if(!auditReasonKeys.every(k=>Number.isSafeInteger(reasons[k])&&Number(reasons[k])>=0))return false;
 return auditReasonKeys.reduce((sum,k)=>sum+Number(reasons[k]),0)===numberScanned
    &&Number(reasons.ELIGIBLE)===Number(c.eligible);
}
const validAuditPage=(x:unknown,limit:number):x is AuditPage=>{
  if(!x||typeof x!=='object')return false;
  const p=x as Record<string,unknown>;
  return Number.isSafeInteger(p.count)&&Number(p.count)>=0&&Number(p.count)<=limit
    &&(p.hasMore===null||typeof p.hasMore==='boolean')
    &&(p.offset===null||(Number.isSafeInteger(p.offset)&&Number(p.offset)>=0))
    &&(p.total===null||(Number.isSafeInteger(p.total)&&Number(p.total)>=0));
};
async function auditHubspotInventory(env:Env){
  try {
    const db=env.MINGEAGLE_DB;
    await db.prepare(`CREATE TABLE IF NOT EXISTS hubspot_submission_inventory_audit(
      id TEXT PRIMARY KEY,checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      count_two INTEGER NOT NULL,has_more_two INTEGER,
      count_fifty INTEGER NOT NULL,has_more_fifty INTEGER,
      offset_two INTEGER,offset_fifty INTEGER,total_two INTEGER,total_fifty INTEGER
    )`).run();
    const last=await db.prepare(`SELECT checked_at FROM hubspot_submission_inventory_audit
      WHERE id='public-form'`).first<{checked_at:string}>();
    if(last?.checked_at){
      const ms=Date.parse(last.checked_at.replace(' ','T')+'Z');
      if(Number.isFinite(ms)&&Date.now()-ms<86400000&&Date.now()>=ms)return;
    }
    const r=await fetch('https://app.mingeagle.com/api/admin/hubspot-inquiry-recovery',{
      method:'POST',headers:{'content-type':'application/json',
        'x-hubspot-recovery-key':env.HUBSPOT_RECOVERY_SERVICE_KEY||''},
      body:JSON.stringify({action:'AUDIT'}),signal:AbortSignal.timeout(29000),
    });
    if(!r.ok){console.error('hubspot_inventory_audit_http_failed',r.status);return}
    const x=await r.json().catch(()=>null) as AuditResponse|null;
    if(x?.ok!==true||!validAuditPage(x.inventory?.limit2,2)
      ||!validAuditPage(x.inventory?.limit50,50)
      ||!validAuditClassification(x.classification,x.inventory.limit50.count)){
      console.error('hubspot_inventory_audit_invalid_response');return;
    }
    const one=x.inventory.limit2,two=x.inventory.limit50;
    const asInt=(b:boolean|null)=>b===null?null:b?1:0;
    await db.prepare(`INSERT INTO hubspot_submission_inventory_audit
      (id,checked_at,count_two,has_more_two,count_fifty,has_more_fifty,
       offset_two,offset_fifty,total_two,total_fifty)
      VALUES('public-form',CURRENT_TIMESTAMP,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET checked_at=CURRENT_TIMESTAMP,
       count_two=excluded.count_two,has_more_two=excluded.has_more_two,
       count_fifty=excluded.count_fifty,has_more_fifty=excluded.has_more_fifty,
       offset_two=excluded.offset_two,offset_fifty=excluded.offset_fifty,
       total_two=excluded.total_two,total_fifty=excluded.total_fifty`)
      .bind(one.count,asInt(one.hasMore),two.count,asInt(two.hasMore),
        one.offset,two.offset,one.total,two.total).run();
    // One privacy-safe aggregate row for the most recent provider audit:
    // fixed reason codes and counts, no inquiry ID, email, phone or payload.
    await db.prepare(`CREATE TABLE IF NOT EXISTS hubspot_submission_quality_audit (
      id TEXT PRIMARY KEY,checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      scanned_count INTEGER NOT NULL,eligible_count INTEGER NOT NULL,rejected_count INTEGER NOT NULL,
      reasons_json TEXT NOT NULL
    )`).run();
    const c=x.classification;
    await db.prepare(`INSERT INTO hubspot_submission_quality_audit
      (id,checked_at,scanned_count,eligible_count,rejected_count,reasons_json)
      VALUES('public-form',CURRENT_TIMESTAMP,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET checked_at=CURRENT_TIMESTAMP,
      scanned_count=excluded.scanned_count,eligible_count=excluded.eligible_count,
      rejected_count=excluded.rejected_count,reasons_json=excluded.reasons_json`)
      .bind(c.scanned,c.eligible,c.excluded,JSON.stringify(c.reasons)).run();
  }catch{console.error('hubspot_inventory_audit_failed')}
}

// Run a bounded, admin-protected HubSpot backup replay once an hour.
// Report skipped requests separately from confirmed successful synchronization.
async function runHubspotRecovery(env:Env){
  if(!env.HUBSPOT_RECOVERY_SERVICE_KEY) {
    await recordHubspotJob(env,'SKIPPED_NO_WORKER_KEY');
    return;
  }
  try {
    const response=await fetch('https://app.mingeagle.com/api/admin/hubspot-inquiry-recovery',{
      method:'POST',
      headers:{'content-type':'application/json','x-hubspot-recovery-key':env.HUBSPOT_RECOVERY_SERVICE_KEY},
      body:JSON.stringify({action:'SYNC'}),
      signal:AbortSignal.timeout(25000)});
    const result=await response.json().catch(()=>null) as (RecoveryBatch&{ok?:boolean;configured?:boolean;disabled?:boolean})|null;
    const status:HubspotJobResult=!response.ok
      ? (response.status===401||response.status===403?'AUTH_FAILED':'API_FAILED')
      : result?.ok===true&&result.configured===true&&validBatch(result)?'SUCCEEDED'
      : result?.disabled===true&&result.configured===false?'SKIPPED_NO_PROVIDER_KEY'
      :'API_FAILED';
    await recordHubspotJob(env,status,response.status);
    if(status==='SUCCEEDED'&&result&&validBatch(result)){
      await recordHubspotBatch(env,result);
      await auditHubspotInventory(env);
    }
    if(status==='AUTH_FAILED'||status==='API_FAILED')
      console.error('hubspot_recovery_tick_failed',{status:response.status});
  } catch(error) {
    console.error('hubspot_recovery_tick_error',error);
    await recordHubspotJob(env,'NETWORK_FAILED');
  }
}
