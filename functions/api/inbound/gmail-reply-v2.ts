import { verifyInboundKey } from '../../_shared/inbound-auth';
import { classifyReply, type ReplyClassification } from '../../_shared/reply-classifier';

interface Env {
  MINGEAGLE_DB: D1Database;
  INBOUND_REPLY_KEY?: string;
}

type InboundPayload = {
  fromEmail?: string;
  fromName?: string;
  subject?: string;
  body?: string;
  gmailMessageId?: string;
  gmailThreadId?: string;
  receivedAt?: string;
};

const clean = (value: unknown, max = 5000) => typeof value === 'string' ? value.trim().slice(0, max) : '';

async function createOrRefreshReplyTask(db: D1Database, params: {
  leadId: string;
  companyId: string | null;
  contactId: string | null;
  classification: ReplyClassification;
}) {
  const c = params.classification;
  if (!c.taskTitle) return null;
  const existing = await db.prepare(`SELECT id FROM tasks
    WHERE lead_id=? AND type='REPLY_ACTION' AND status IN ('OPEN','IN_PROGRESS') LIMIT 1`)
    .bind(params.leadId).first<{ id: string }>();
  if (existing?.id) {
    await db.prepare(`UPDATE tasks SET title=?, description=?, priority=?, due_at=datetime('now','+1 day'), updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(c.taskTitle, c.taskDescription, c.priority, existing.id).run();
    return existing.id;
  }
  const id = crypto.randomUUID();
  await db.prepare(`INSERT INTO tasks (id, lead_id, company_id, contact_id, type, title, description, status, priority, due_at)
    VALUES (?, ?, ?, ?, 'REPLY_ACTION', ?, ?, 'OPEN', ?, datetime('now','+1 day'))`)
    .bind(id, params.leadId, params.companyId, params.contactId, c.taskTitle, c.taskDescription, c.priority).run();
  return id;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.MINGEAGLE_DB) return Response.json({ ok: false, error: 'Database is not configured.' }, { status: 503 });
  const supplied = request.headers.get('x-inbound-key') || '';
  if (!(await verifyInboundKey(env.MINGEAGLE_DB, env.INBOUND_REPLY_KEY, supplied))) {
    return Response.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const input = await request.json() as InboundPayload;
    const fromEmail = clean(input.fromEmail, 320).toLowerCase();
    const subject = clean(input.subject, 500) || null;
    const body = clean(input.body, 12000);
    const gmailMessageId = clean(input.gmailMessageId, 300);
    const gmailThreadId = clean(input.gmailThreadId, 300);
    const receivedAt = clean(input.receivedAt, 100) || new Date().toISOString();

    if (!fromEmail || !fromEmail.includes('@') || !body || !gmailMessageId) {
      return Response.json({ ok: false, error: 'fromEmail, body and gmailMessageId are required.' }, { status: 400 });
    }
    if (fromEmail === 'mingeaglecommerce@gmail.com') {
      return Response.json({ ok: true, ignored: true, reason: 'self_message' });
    }

    const db = env.MINGEAGLE_DB;
    const duplicate = await db.prepare(`SELECT id, lead_id FROM messages WHERE external_id=? LIMIT 1`)
      .bind(gmailMessageId).first<{ id: string; lead_id: string | null }>();
    if (duplicate?.id) {
      return Response.json({ ok: true, duplicate: true, messageId: duplicate.id, leadId: duplicate.lead_id || null });
    }

    const match = await db.prepare(`SELECT
        ct.id AS contact_id, ct.company_id,
        l.id AS lead_id, l.status AS lead_status
      FROM contacts ct
      JOIN leads l ON l.primary_contact_id=ct.id
      WHERE lower(ct.email)=lower(?)
        AND l.status NOT IN ('LOST','NOT_FIT')
      ORDER BY datetime(l.updated_at) DESC, datetime(l.created_at) DESC
      LIMIT 1`)
      .bind(fromEmail).first<Record<string, unknown>>();

    if (!match?.lead_id) {
      return Response.json({ ok: true, ignored: true, reason: 'email_not_in_crm', fromEmail });
    }

    const leadId = String(match.lead_id);
    const contactId = match.contact_id ? String(match.contact_id) : null;
    const companyId = match.company_id ? String(match.company_id) : null;
    const classification = classifyReply(body);
    const crmMessageId = crypto.randomUUID();

    await db.prepare(`INSERT INTO messages
      (id, lead_id, company_id, contact_id, channel, direction, subject, body, intent, external_id, sent_at)
      VALUES (?, ?, ?, ?, 'EMAIL', 'INBOUND', ?, ?, ?, ?, ?)`)
      .bind(crmMessageId, leadId, companyId, contactId, subject, body, classification.intent, gmailMessageId, receivedAt).run();

    await db.prepare(`UPDATE leads SET status=?, last_contact_at=?, next_best_action=?,
      next_action_at=${classification.taskTitle ? "datetime('now','+1 day')" : 'NULL'}, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(classification.leadStatus, receivedAt, classification.nextBestAction, leadId).run();

    await db.prepare(`UPDATE tasks SET status='DONE', completed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
      WHERE lead_id=? AND type='OUTREACH_FOLLOW_UP' AND status IN ('OPEN','IN_PROGRESS')`).bind(leadId).run();

    await db.prepare(`UPDATE email_queue SET status='SKIPPED',
      last_error='Customer replied; automatic follow-up stopped.', updated_at=CURRENT_TIMESTAMP
      WHERE lead_id=? AND status IN ('READY','REVIEW_REQUIRED','FAILED')`).bind(leadId).run().catch(() => undefined);

    if (classification.intent === 'DO_NOT_CONTACT' && contactId) {
      await db.prepare(`UPDATE contacts SET do_not_contact=1, updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(contactId).run();
    }

    if (classification.taskTitle) {
      await createOrRefreshReplyTask(db, { leadId, companyId, contactId, classification });
    } else {
      await db.prepare(`UPDATE tasks SET status='CANCELLED', completed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
        WHERE lead_id=? AND status IN ('OPEN','IN_PROGRESS') AND type IN ('REPLY_ACTION','OUTREACH_FOLLOW_UP')`).bind(leadId).run();
    }

    await db.prepare(`INSERT INTO activities (id, entity_type, entity_id, activity_type, title, description, metadata_json)
      VALUES (?, 'LEAD', ?, 'MESSAGE_INBOUND', 'Customer Gmail reply imported automatically', ?, ?)`)
      .bind(
        crypto.randomUUID(), leadId,
        `EMAIL from ${fromEmail}: ${body.slice(0, 300)}`,
        JSON.stringify({ crmMessageId, gmailMessageId, gmailThreadId: gmailThreadId || null, intent: classification.intent, leadStatus: classification.leadStatus, suggestedReply: classification.suggestedReply }),
      ).run();

    return Response.json({
      ok: true,
      imported: true,
      leadId,
      contactId,
      crmMessageId,
      intent: classification.intent,
      leadStatus: classification.leadStatus,
      nextBestAction: classification.nextBestAction,
      suggestedReply: classification.suggestedReply,
    }, { status: 201 });
  } catch (error) {
    console.error('gmail_inbound_reply_v2_failed', error);
    return Response.json({ ok: false, error: 'Unable to import Gmail reply.' }, { status: 500 });
  }
};
