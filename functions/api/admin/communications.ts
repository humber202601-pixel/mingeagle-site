import { applyReplySalesAction, type ReplySalesAction } from '../../_shared/reply-sales-actions';

interface Env {
  MINGEAGLE_DB: D1Database;
}

type MessageInput = {
  leadId?: string;
  channel?: 'EMAIL' | 'WHATSAPP' | 'PHONE' | 'WEBSITE' | 'OTHER';
  direction?: 'INBOUND' | 'OUTBOUND';
  subject?: string;
  body?: string;
};

const clean = (value: unknown, max = 5000) => typeof value === 'string' ? value.trim().slice(0, max) : '';

function classifyReply(body: string) {
  const text = body.toLowerCase();
  const has = (...words: string[]) => words.some(word => text.includes(word));

  if (has('unsubscribe', 'remove me', 'stop emailing', 'do not contact', "don't contact", 'opt out')) {
    return {
      intent: 'DO_NOT_CONTACT',
      leadStatus: 'DO_NOT_CONTACT',
      nextBestAction: 'Do not contact',
      taskTitle: '',
      taskDescription: '',
      priority: 'LOW',
      suggestedReply: 'Understood. We will not contact you again. Thank you for letting us know.',
    };
  }
  if (has('not interested', 'no thanks', 'no thank you', 'not for us', 'pass for now', 'not a fit')) {
    return {
      intent: 'NOT_INTERESTED',
      leadStatus: 'NOT_INTERESTED',
      nextBestAction: 'No further sales follow-up',
      taskTitle: '',
      taskDescription: '',
      priority: 'LOW',
      suggestedReply: 'Thank you for letting us know. We appreciate your time, and we will keep the door open if your needs change in the future.',
    };
  }
  if (has('sample', 'try one', 'try it', 'test one', 'demo')) {
    return {
      intent: 'SAMPLE_INTEREST',
      leadStatus: 'SAMPLE',
      nextBestAction: 'Confirm sample requirements and shipping details',
      taskTitle: 'Confirm sample request',
      taskDescription: 'Customer mentioned a sample or product trial. Confirm quantity, shipping address and sample terms.',
      priority: 'HIGH',
      suggestedReply: 'Thanks for your interest. We can discuss a sample. Please send the preferred ball size/quantity and your shipping ZIP code, and we will confirm the best sample option and delivery cost.',
    };
  }
  if (has('quote', 'quotation', 'price', 'pricing', 'cost', 'how much', 'wholesale')) {
    return {
      intent: 'PRICE_QUOTE',
      leadStatus: 'QUOTE',
      nextBestAction: 'Prepare pricing or quotation',
      taskTitle: 'Prepare customer quotation',
      taskDescription: 'Customer asked about pricing or a quotation. Confirm quantity, configuration and destination before quoting.',
      priority: 'HIGH',
      suggestedReply: 'Absolutely. We can prepare a wholesale quote. Please confirm the quantity you are considering and the delivery ZIP code. If you need a logo or custom configuration, please include that as well.',
    };
  }
  if (has('discount', 'better price', 'best price', 'payment terms', 'shipping terms', 'lead time', 'delivery time', 'negotiate', 'negotiation')) {
    return {
      intent: 'NEGOTIATION',
      leadStatus: 'NEGOTIATION',
      nextBestAction: 'Respond to commercial questions and close the order',
      taskTitle: 'Respond to commercial questions',
      taskDescription: 'Customer is discussing price, payment, shipping or lead time. Review terms and respond.',
      priority: 'HIGH',
      suggestedReply: 'Thanks — I can review the commercial terms with you. Please confirm the target quantity and delivery location, and I will check the best available price, shipping option and lead time.',
    };
  }
  if (has('interested', 'sounds good', 'yes', 'let us try', "let's try", 'want to buy', 'place an order', 'ready to order')) {
    return {
      intent: 'INTERESTED',
      leadStatus: 'INTERESTED',
      nextBestAction: 'Confirm buying requirements and move to sample or quote',
      taskTitle: 'Follow up interested customer',
      taskDescription: 'Customer expressed positive buying intent. Confirm quantity, use case and delivery location.',
      priority: 'HIGH',
      suggestedReply: 'Great, thank you. To recommend the best option, please confirm the quantity you are considering and your delivery ZIP code. We can then confirm pricing and the fastest next step.',
    };
  }

  return {
    intent: 'GENERAL_REPLY',
    leadStatus: 'REPLIED',
    nextBestAction: 'Review customer reply and respond',
    taskTitle: 'Reply to customer message',
    taskDescription: 'Customer replied. Review the message and send the appropriate response.',
    priority: 'MEDIUM',
    suggestedReply: 'Thank you for your reply. I would be happy to help. Please share any quantity, product or delivery requirements you have, and I will confirm the best next step.',
  };
}

async function createOpenTask(db: D1Database, params: {
  leadId: string;
  companyId: string | null;
  contactId: string | null;
  type: string;
  title: string;
  description: string;
  priority: string;
  dueExpression: string;
}) {
  const existing = await db.prepare(`SELECT id FROM tasks
    WHERE lead_id=? AND type=? AND status IN ('OPEN','IN_PROGRESS') LIMIT 1`)
    .bind(params.leadId, params.type).first<{ id: string }>();
  if (existing?.id) {
    await db.prepare(`UPDATE tasks SET title=?, description=?, priority=?, due_at=datetime('now', ?), updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(params.title, params.description, params.priority, params.dueExpression, existing.id).run();
    return existing.id;
  }
  const id = crypto.randomUUID();
  await db.prepare(`INSERT INTO tasks (id, lead_id, company_id, contact_id, type, title, description, status, priority, due_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, datetime('now', ?))`)
    .bind(id, params.leadId, params.companyId, params.contactId, params.type, params.title, params.description, params.priority, params.dueExpression).run();
  return id;
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  if (!env.MINGEAGLE_DB) return Response.json({ ok: false, error: 'Database is not configured.' }, { status: 503 });
  try {
    const db = env.MINGEAGLE_DB;
    const [targets, messages] = await Promise.all([
      db.prepare(`SELECT
        l.id AS lead_id, l.status AS lead_status, l.lead_score, l.product_interest, l.last_contact_at, l.next_action_at,
        c.id AS company_id, COALESCE(c.name, 'Individual buyer') AS company,
        ct.id AS contact_id, COALESCE(ct.full_name, ct.email, 'Unknown contact') AS contact,
        ct.first_name, ct.email, ct.phone, ct.whatsapp, ct.do_not_contact,
        (SELECT direction FROM messages m WHERE m.lead_id=l.id ORDER BY m.sent_at DESC, m.created_at DESC LIMIT 1) AS last_direction,
        (SELECT sent_at FROM messages m WHERE m.lead_id=l.id ORDER BY m.sent_at DESC, m.created_at DESC LIMIT 1) AS last_message_at,
        (SELECT reference FROM inquiries i WHERE i.lead_id=l.id AND i.status<>'CLOSED' ORDER BY datetime(i.updated_at) DESC LIMIT 1) AS inquiry_reference,
        (SELECT estimated_quantity FROM inquiries i WHERE i.lead_id=l.id AND i.status<>'CLOSED' ORDER BY datetime(i.updated_at) DESC LIMIT 1) AS inquiry_quantity,
        (SELECT reference FROM samples s WHERE s.lead_id=l.id AND s.status NOT IN ('CONVERTED','CLOSED') ORDER BY datetime(s.updated_at) DESC LIMIT 1) AS sample_reference,
        (SELECT status FROM samples s WHERE s.lead_id=l.id AND s.status NOT IN ('CONVERTED','CLOSED') ORDER BY datetime(s.updated_at) DESC LIMIT 1) AS sample_status
      FROM leads l
      LEFT JOIN companies c ON c.id=l.company_id
      LEFT JOIN contacts ct ON ct.id=l.primary_contact_id
      WHERE l.status NOT IN ('LOST','NOT_FIT')
      ORDER BY ct.do_not_contact ASC, l.lead_score DESC, l.created_at DESC
      LIMIT 300`).all(),
      db.prepare(`SELECT m.id, m.lead_id, m.company_id, m.contact_id, m.channel, m.direction, m.subject, m.body, m.intent, m.sent_at,
        COALESCE(c.name,'Individual buyer') AS company, COALESCE(ct.full_name,ct.email,'Unknown contact') AS contact
      FROM messages m
      LEFT JOIN companies c ON c.id=m.company_id
      LEFT JOIN contacts ct ON ct.id=m.contact_id
      ORDER BY m.sent_at DESC, m.created_at DESC LIMIT 300`).all(),
    ]);
    return Response.json({ ok: true, targets: targets.results, messages: messages.results });
  } catch (error) {
    console.error('communications_load_failed', error);
    return Response.json({ ok: false, error: 'Unable to load communications.' }, { status: 500 });
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.MINGEAGLE_DB) return Response.json({ ok: false, error: 'Database is not configured.' }, { status: 503 });
  try {
    const input = await request.json() as MessageInput;
    const leadId = clean(input.leadId, 100);
    const channel = input.channel || 'EMAIL';
    const direction = input.direction || 'OUTBOUND';
    const subject = clean(input.subject, 500) || null;
    const body = clean(input.body, 8000);
    if (!leadId || !body) return Response.json({ ok: false, error: 'Lead and message body are required.' }, { status: 400 });
    if (!['EMAIL','WHATSAPP','PHONE','WEBSITE','OTHER'].includes(channel)) return Response.json({ ok: false, error: 'Unsupported channel.' }, { status: 400 });
    if (!['INBOUND','OUTBOUND'].includes(direction)) return Response.json({ ok: false, error: 'Unsupported direction.' }, { status: 400 });

    const db = env.MINGEAGLE_DB;
    const lead = await db.prepare(`SELECT l.id, l.status, l.company_id, l.primary_contact_id,
      ct.do_not_contact FROM leads l LEFT JOIN contacts ct ON ct.id=l.primary_contact_id WHERE l.id=? LIMIT 1`)
      .bind(leadId).first<Record<string, unknown>>();
    if (!lead) return Response.json({ ok: false, error: 'Lead not found.' }, { status: 404 });

    const companyId = lead.company_id ? String(lead.company_id) : null;
    const contactId = lead.primary_contact_id ? String(lead.primary_contact_id) : null;
    if (direction === 'OUTBOUND' && Number(lead.do_not_contact || 0) === 1) {
      return Response.json({ ok: false, error: 'This contact is marked DO NOT CONTACT.' }, { status: 409 });
    }

    const classification = direction === 'INBOUND' ? classifyReply(body) : null;
    const messageId = crypto.randomUUID();
    await db.prepare(`INSERT INTO messages (id, lead_id, company_id, contact_id, channel, direction, subject, body, intent, sent_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`)
      .bind(messageId, leadId, companyId, contactId, channel, direction, subject, body, classification?.intent || 'OUTREACH').run();

    let salesAction: ReplySalesAction = { kind: 'NONE' };

    if (direction === 'OUTBOUND') {
      const currentStatus = String(lead.status || '');
      const nextStatus = ['DISCOVERED','ANALYZED','QUALIFIED','ENRICHING','READY_TO_CONTACT'].includes(currentStatus) ? 'CONTACTED' : currentStatus;
      await db.prepare(`UPDATE leads SET status=?, last_contact_at=CURRENT_TIMESTAMP,
        next_best_action='Wait for reply / follow up', next_action_at=datetime('now','+3 days'), updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .bind(nextStatus, leadId).run();
      await createOpenTask(db, {
        leadId, companyId, contactId, type: 'OUTREACH_FOLLOW_UP',
        title: 'Follow up outreach', description: 'No reply yet. Follow up if the customer has not responded.', priority: 'MEDIUM', dueExpression: '+3 days',
      });
    } else if (classification) {
      await db.prepare(`UPDATE leads SET status=?, last_contact_at=CURRENT_TIMESTAMP, next_best_action=?,
        next_action_at=${classification.taskTitle ? "datetime('now','+1 day')" : 'NULL'}, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .bind(classification.leadStatus, classification.nextBestAction, leadId).run();

      await db.prepare(`UPDATE tasks SET status='DONE', completed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
        WHERE lead_id=? AND type='OUTREACH_FOLLOW_UP' AND status IN ('OPEN','IN_PROGRESS')`).bind(leadId).run();

      if (classification.intent === 'DO_NOT_CONTACT' && contactId) {
        await db.prepare(`UPDATE contacts SET do_not_contact=1, updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(contactId).run();
      }
      if (classification.taskTitle) {
        await createOpenTask(db, {
          leadId, companyId, contactId, type: 'REPLY_ACTION', title: classification.taskTitle,
          description: classification.taskDescription, priority: classification.priority, dueExpression: '+1 day',
        });
      } else {
        await db.prepare(`UPDATE tasks SET status='CANCELLED', completed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
          WHERE lead_id=? AND status IN ('OPEN','IN_PROGRESS') AND type IN ('REPLY_ACTION','OUTREACH_FOLLOW_UP')`).bind(leadId).run();
      }

      salesAction = await applyReplySalesAction(db, {
        leadId, companyId, contactId, intent: classification.intent, body, messageId,
      });

      if (salesAction.kind === 'QUOTE_INQUIRY') {
        const title = salesAction.quantity
          ? `Prepare customer quotation · ${salesAction.quantity} units · ${salesAction.reference}`
          : `Prepare customer quotation · ${salesAction.reference}`;
        await db.prepare(`UPDATE tasks SET title=?, description=?, priority='HIGH', due_at=datetime('now','+1 day'), updated_at=CURRENT_TIMESTAMP
          WHERE lead_id=? AND type='REPLY_ACTION' AND status IN ('OPEN','IN_PROGRESS')`)
          .bind(title, `Pricing request converted to inquiry ${salesAction.reference}. Review quantity, unit price, shipping and terms before sending any quotation.`, leadId).run();
      } else if (salesAction.kind === 'SAMPLE_REQUEST') {
        await db.prepare(`UPDATE tasks SET title=?, description=?, priority='HIGH', due_at=datetime('now','+1 day'), updated_at=CURRENT_TIMESTAMP
          WHERE lead_id=? AND type='REPLY_ACTION' AND status IN ('OPEN','IN_PROGRESS')`)
          .bind(`Review sample request · ${salesAction.reference}`, `Sample request ${salesAction.reference} was created automatically. Confirm product, quantity, shipping ZIP/address and sample/payment terms before making any commitment.`, leadId).run();
      }
    }

    await db.prepare(`INSERT INTO activities (id, entity_type, entity_id, activity_type, title, description, metadata_json)
      VALUES (?, 'LEAD', ?, ?, ?, ?, ?)`)
      .bind(
        crypto.randomUUID(), leadId,
        direction === 'INBOUND' ? 'MESSAGE_INBOUND' : 'MESSAGE_OUTBOUND',
        direction === 'INBOUND' ? 'Customer reply logged' : 'Outbound message logged',
        `${channel}: ${body.slice(0, 300)}`,
        JSON.stringify({ messageId, channel, direction, intent: classification?.intent || 'OUTREACH', salesAction }),
      ).run();

    return Response.json({
      ok: true,
      messageId,
      intent: classification?.intent || 'OUTREACH',
      leadStatus: classification?.leadStatus || null,
      suggestedReply: classification?.suggestedReply || null,
      nextBestAction: classification?.nextBestAction || 'Wait for reply / follow up',
      salesAction,
    }, { status: 201 });
  } catch (error) {
    console.error('communications_save_failed', error);
    return Response.json({ ok: false, error: 'Unable to save communication.' }, { status: 500 });
  }
};