interface Env {
  MINGEAGLE_DB: D1Database;
  INBOUND_REPLY_KEY?: string;
}

type InboundPayload = {
  test?: boolean;
  fromEmail?: string;
  fromName?: string;
  subject?: string;
  body?: string;
  gmailMessageId?: string;
  gmailThreadId?: string;
  receivedAt?: string;
};

type Classification = {
  intent: string;
  leadStatus: string;
  nextBestAction: string;
  taskTitle: string;
  taskDescription: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  suggestedReply: string;
};

const clean = (value: unknown, max = 5000) => typeof value === 'string' ? value.trim().slice(0, max) : '';

function normalizeEmail(value: unknown) {
  return clean(value, 320).toLowerCase();
}

async function digest(value: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return new Uint8Array(hash);
}

async function sameSecret(a: string, b: string) {
  const [left, right] = await Promise.all([digest(a), digest(b)]);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

function classifyReply(body: string): Classification {
  const text = body.toLowerCase();
  const has = (...words: string[]) => words.some(word => text.includes(word));

  if (has('unsubscribe', 'remove me', 'stop emailing', 'do not contact', "don't contact", 'opt out', '取消订阅', '不要联系')) {
    return {
      intent: 'DO_NOT_CONTACT', leadStatus: 'DO_NOT_CONTACT', nextBestAction: 'Do not contact',
      taskTitle: '', taskDescription: '', priority: 'LOW',
      suggestedReply: 'Understood. We will not contact you again. Thank you for letting us know.',
    };
  }
  if (has('not interested', 'no thanks', 'no thank you', 'not for us', 'pass for now', 'not a fit', '不感兴趣')) {
    return {
      intent: 'NOT_INTERESTED', leadStatus: 'NOT_INTERESTED', nextBestAction: 'No further sales follow-up',
      taskTitle: '', taskDescription: '', priority: 'LOW',
      suggestedReply: 'Thank you for letting us know. We appreciate your time, and we will keep the door open if your needs change in the future.',
    };
  }
  if (has('sample', 'try one', 'try it', 'test one', 'demo', '样品', '试用')) {
    return {
      intent: 'SAMPLE_INTEREST', leadStatus: 'SAMPLE', nextBestAction: 'Confirm sample requirements and shipping details',
      taskTitle: 'Confirm sample request',
      taskDescription: 'Customer mentioned a sample or product trial. Confirm quantity, shipping address and sample terms.',
      priority: 'HIGH',
      suggestedReply: 'Thanks for your interest. We can discuss a sample. Please send the preferred ball size/quantity and your shipping ZIP code, and we will confirm the best sample option and delivery cost.',
    };
  }
  if (has('quote', 'quotation', 'price', 'pricing', 'cost', 'how much', 'wholesale', '报价', '价格', '批发')) {
    return {
      intent: 'PRICE_QUOTE', leadStatus: 'QUOTE', nextBestAction: 'Prepare pricing or quotation',
      taskTitle: 'Prepare customer quotation',
      taskDescription: 'Customer asked about pricing or a quotation. Confirm quantity, configuration and destination before quoting.',
      priority: 'HIGH',
      suggestedReply: 'Absolutely. We can prepare a wholesale quote. Please confirm the quantity you are considering and the delivery ZIP code. If you need a logo or custom configuration, please include that as well.',
    };
  }
  if (has('discount', 'better price', 'best price', 'payment terms', 'shipping terms', 'lead time', 'delivery time', 'negotiate', 'negotiation', '折扣', '交期', '付款条件')) {
    return {
      intent: 'NEGOTIATION', leadStatus: 'NEGOTIATION', nextBestAction: 'Respond to commercial questions and close the order',
      taskTitle: 'Respond to commercial questions',
      taskDescription: 'Customer is discussing price, payment, shipping or lead time. Review terms and respond.',
      priority: 'HIGH',
      suggestedReply: 'Thanks — I can review the commercial terms with you. Please confirm the target quantity and delivery location, and I will check the best available price, shipping option and lead time.',
    };
  }
  if (has('interested', 'sounds good', 'yes', 'let us try', "let's try", 'want to buy', 'place an order', 'ready to order', '感兴趣', '想购买', '下单')) {
    return {
      intent: 'INTERESTED', leadStatus: 'INTERESTED', nextBestAction: 'Confirm buying requirements and move to sample or quote',
      taskTitle: 'Follow up interested customer',
      taskDescription: 'Customer expressed positive buying intent. Confirm quantity, use case and delivery location.',
      priority: 'HIGH',
      suggestedReply: 'Great, thank you. To recommend the best option, please confirm the quantity you are considering and your delivery ZIP code. We can then confirm pricing and the fastest next step.',
    };
  }

  return {
    intent: 'GENERAL_REPLY', leadStatus: 'REPLIED', nextBestAction: 'Review customer reply and respond',
    taskTitle: 'Reply to customer message',
    taskDescription: 'Customer replied. Review the message and send the appropriate response.',
    priority: 'MEDIUM',
    suggestedReply: 'Thank you for your reply. I would be happy to help. Please share any quantity, product or delivery requirements you have, and I will confirm the best next step.',
  };
}

async function createOrRefreshReplyTask(db: D1Database, params: {
  leadId: string;
  companyId: string | null;
  contactId: string | null;
  classification: Classification;
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

export const onRequestOptions: PagesFunction<Env> = async () => new Response(null, { status: 204 });

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.MINGEAGLE_DB) return Response.json({ ok: false, error: 'Database is not configured.' }, { status: 503 });
  const configured = env.INBOUND_REPLY_KEY || '';
  const supplied = request.headers.get('x-inbound-key') || '';
  if (!configured || !supplied || !(await sameSecret(configured, supplied))) {
    return Response.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const input = await request.json() as InboundPayload;
    if (input.test === true) {
      return Response.json({ ok: true, connected: true, service: 'MING EAGLE Gmail inbound reply bridge' });
    }

    const fromEmail = normalizeEmail(input.fromEmail);
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
        ct.id AS contact_id, ct.company_id, COALESCE(ct.do_not_contact,0) AS do_not_contact,
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
        JSON.stringify({
          crmMessageId,
          gmailMessageId,
          gmailThreadId: gmailThreadId || null,
          intent: classification.intent,
          leadStatus: classification.leadStatus,
          suggestedReply: classification.suggestedReply,
        }),
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
    console.error('gmail_inbound_reply_failed', error);
    return Response.json({ ok: false, error: 'Unable to import Gmail reply.' }, { status: 500 });
  }
};
