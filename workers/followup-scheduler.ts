interface Env {
  MINGEAGLE_DB: D1Database;
  ADMIN_ACCESS_KEY?: string;
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

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    if (_event.cron === '0 13 * * *') ctx.waitUntil(runSweep(env));
    else ctx.waitUntil(continueDiscovery(env));
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
