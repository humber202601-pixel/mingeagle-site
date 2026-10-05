interface Env {
  MINGEAGLE_DB: D1Database;
}

type Input = {
  action?: 'PREPARE';
  leadId?: string;
  messageId?: string;
  quantity?: number | string;
};

type Row = Record<string, unknown>;

const clean = (value: unknown, max = 1000) => typeof value === 'string' ? value.trim().slice(0, max) : '';

function extractQuantity(value: unknown) {
  const text = clean(value, 12000).replace(/,/g, '');
  const patterns = [
    /(?:for|need|want|order|buy|pricing\s+for|quote\s+for)\s+(\d{1,6})\s*(?:units?|pcs?|pieces?|balls?|sets?)?/i,
    /(\d{1,6})\s*(?:units?|pcs?|pieces?|balls?|sets?)/i,
    /数量\s*[:：]?\s*(\d{1,6})/i,
    /(\d{1,6})\s*(?:个|件|套|只)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const value = Number(match[1]);
      if (Number.isFinite(value) && value > 0 && value <= 100000) return Math.round(value);
    }
  }
  return null;
}

function stripQuotedText(value: unknown) {
  let text = clean(value, 12000).replace(/\r/g, '').trim();
  const markers = [
    /\nOn[\s\S]{0,600}?wrote:\s*\n/i,
    /\nFrom:\s.+/i,
    /\n-----Original Message-----/i,
    /\n_{10,}/,
  ];
  let cut = text.length;
  for (const marker of markers) {
    const match = marker.exec(text);
    if (match && match.index < cut) cut = match.index;
  }
  return text.slice(0, cut).trim();
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  if (!env.MINGEAGLE_DB) return Response.json({ ok: false, error: 'Database is not configured.' }, { status: 503 });
  try {
    const rows = await env.MINGEAGLE_DB.prepare(`SELECT
        m.id AS message_id, m.lead_id, m.subject, m.body, m.intent, m.sent_at,
        l.status AS lead_status, l.lead_score,
        COALESCE(c.name,'Individual buyer') AS company,
        COALESCE(ct.full_name,ct.email,'Customer') AS contact,
        ct.email,
        (SELECT i.reference FROM inquiries i WHERE i.lead_id=l.id ORDER BY datetime(i.updated_at) DESC, datetime(i.created_at) DESC LIMIT 1) AS inquiry_reference,
        (SELECT i.estimated_quantity FROM inquiries i WHERE i.lead_id=l.id ORDER BY datetime(i.updated_at) DESC, datetime(i.created_at) DESC LIMIT 1) AS inquiry_quantity
      FROM messages m
      JOIN leads l ON l.id=m.lead_id
      LEFT JOIN companies c ON c.id=l.company_id
      LEFT JOIN contacts ct ON ct.id=l.primary_contact_id
      WHERE m.direction='INBOUND'
        AND m.channel='EMAIL'
        AND m.intent IN ('PRICE_QUOTE','INTERESTED','NEGOTIATION','SAMPLE_INTEREST')
        AND l.status NOT IN ('LOST','NOT_FIT','DO_NOT_CONTACT')
      ORDER BY datetime(m.sent_at) DESC, datetime(m.created_at) DESC
      LIMIT 100`).all<Row>();

    const suggestions = rows.results.map(row => {
      const customerText = stripQuotedText(row.body);
      return {
        ...row,
        customer_text: customerText,
        extracted_quantity: extractQuantity(customerText) || (row.inquiry_quantity ? Number(row.inquiry_quantity) || null : null),
      };
    });

    return Response.json({ ok: true, suggestions });
  } catch (error) {
    console.error('quote_assistant_load_failed', error);
    return Response.json({ ok: false, error: 'Unable to load quote suggestions.' }, { status: 500 });
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.MINGEAGLE_DB) return Response.json({ ok: false, error: 'Database is not configured.' }, { status: 503 });
  try {
    const input = await request.json() as Input;
    if ((input.action || 'PREPARE') !== 'PREPARE') return Response.json({ ok: false, error: 'Unsupported action.' }, { status: 400 });
    const leadId = clean(input.leadId, 100);
    const messageId = clean(input.messageId, 100);
    const quantityRaw = Number(input.quantity || 0);
    const quantity = Number.isFinite(quantityRaw) && quantityRaw > 0 ? Math.min(100000, Math.round(quantityRaw)) : null;
    if (!leadId) return Response.json({ ok: false, error: 'Lead is required.' }, { status: 400 });

    const db = env.MINGEAGLE_DB;
    const lead = await db.prepare(`SELECT l.id, l.company_id, l.primary_contact_id, l.product_interest,
        COALESCE(c.customer_type,'') AS customer_type,
        COALESCE(ct.email,'') AS email
      FROM leads l
      LEFT JOIN companies c ON c.id=l.company_id
      LEFT JOIN contacts ct ON ct.id=l.primary_contact_id
      WHERE l.id=? LIMIT 1`).bind(leadId).first<Row>();
    if (!lead) return Response.json({ ok: false, error: 'Lead not found.' }, { status: 404 });

    const sourceMessage = messageId
      ? await db.prepare(`SELECT body, subject FROM messages WHERE id=? AND lead_id=? LIMIT 1`).bind(messageId, leadId).first<Row>()
      : null;
    const customerText = stripQuotedText(sourceMessage?.body || '');
    const resolvedQuantity = quantity || extractQuantity(customerText);

    let inquiry = await db.prepare(`SELECT id, reference, status FROM inquiries
      WHERE lead_id=? AND status<>'CLOSED'
      ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC LIMIT 1`).bind(leadId).first<Row>();

    let created = false;
    if (!inquiry) {
      const inquiryId = crypto.randomUUID();
      const reference = `MEQ-${Date.now().toString(36).toUpperCase()}`;
      await db.prepare(`INSERT INTO inquiries (
          id, reference, lead_id, company_id, contact_id, request_type, customer_type,
          product_interest, estimated_quantity, message, status
        ) VALUES (?, ?, ?, ?, ?, 'WHOLESALE', ?, ?, ?, ?, 'QUALIFIED')`)
        .bind(
          inquiryId,
          reference,
          leadId,
          lead.company_id ? String(lead.company_id) : null,
          lead.primary_contact_id ? String(lead.primary_contact_id) : null,
          clean(lead.customer_type, 100) || null,
          clean(lead.product_interest, 100) || 'SILENT_BALL',
          resolvedQuantity ? String(resolvedQuantity) : null,
          customerText || 'Created from a customer email reply requesting pricing.',
        ).run();
      inquiry = { id: inquiryId, reference, status: 'QUALIFIED' };
      created = true;
    } else {
      const currentStatus = clean(inquiry.status, 50);
      const nextStatus = currentStatus === 'QUOTED' ? 'QUOTED' : 'QUALIFIED';
      await db.prepare(`UPDATE inquiries SET
          estimated_quantity=COALESCE(?, estimated_quantity),
          message=CASE WHEN ?<>'' THEN ? ELSE message END,
          status=?, updated_at=CURRENT_TIMESTAMP
        WHERE id=?`)
        .bind(
          resolvedQuantity ? String(resolvedQuantity) : null,
          customerText,
          customerText,
          nextStatus,
          String(inquiry.id),
        ).run();
    }

    const reference = String(inquiry.reference);
    const taskTitle = resolvedQuantity ? `Prepare customer quotation · ${resolvedQuantity} units` : 'Prepare customer quotation';
    await db.prepare(`UPDATE tasks SET title=?, description=?, priority='HIGH', due_at=datetime('now','+1 day'), updated_at=CURRENT_TIMESTAMP
      WHERE lead_id=? AND type='REPLY_ACTION' AND status IN ('OPEN','IN_PROGRESS')`)
      .bind(taskTitle, resolvedQuantity ? `Customer requested wholesale pricing for approximately ${resolvedQuantity} units. Review unit price, shipping and terms before sending.` : 'Customer requested pricing. Review quantity, unit price, shipping and terms before sending.', leadId).run();

    await db.prepare(`UPDATE leads SET status='QUOTE', next_best_action=?, next_action_at=datetime('now','+1 day'), updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(taskTitle, leadId).run();

    await db.prepare(`INSERT INTO activities (id, entity_type, entity_id, activity_type, title, description, metadata_json)
      VALUES (?, 'LEAD', ?, 'QUOTE_PREFILL_PREPARED', 'Quote assistant prepared inquiry', ?, ?)`)
      .bind(
        crypto.randomUUID(), leadId,
        `${reference}${resolvedQuantity ? ` · ${resolvedQuantity} units` : ''}`,
        JSON.stringify({ inquiryReference: reference, quantity: resolvedQuantity, messageId: messageId || null, created }),
      ).run();

    return Response.json({
      ok: true,
      inquiryReference: reference,
      quantity: resolvedQuantity,
      created,
      leadId,
      email: clean(lead.email, 320) || null,
    });
  } catch (error) {
    console.error('quote_assistant_prepare_failed', error);
    return Response.json({ ok: false, error: 'Unable to prepare quote inquiry.' }, { status: 500 });
  }
};
