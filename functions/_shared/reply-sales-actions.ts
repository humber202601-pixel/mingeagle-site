type ReplySalesParams = {
  leadId: string;
  companyId: string | null;
  contactId: string | null;
  intent: string;
  body: string;
  messageId?: string | null;
};

export type ReplySalesAction = {
  kind: 'QUOTE_INQUIRY' | 'SAMPLE_REQUEST' | 'NONE';
  reference?: string;
  quantity?: number | null;
  postalCode?: string | null;
  created?: boolean;
};

const clean = (value: unknown, max = 12000) => typeof value === 'string' ? value.trim().slice(0, max) : '';

export function extractReplyQuantity(value: unknown) {
  const text = clean(value).replace(/,/g, '');
  const patterns = [
    /(?:for|need|want|order|buy|pricing\s+for|quote\s+for|quantity\s*(?:is|:)?|qty\s*(?:is|:)?)\s+(\d{1,6})\s*(?:units?|pcs?|pieces?|balls?|sets?)?/i,
    /(\d{1,6})\s*(?:units?|pcs?|pieces?|balls?|sets?)/i,
    /数量\s*[:：]?\s*(\d{1,6})/i,
    /(\d{1,6})\s*(?:个|件|套|只)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const quantity = Number(match[1]);
    if (Number.isFinite(quantity) && quantity > 0 && quantity <= 100000) return Math.round(quantity);
  }
  return null;
}

export function extractUsPostalCode(value: unknown) {
  const text = clean(value);
  const patterns = [
    /(?:zip|zip\s*code|postal\s*code)\s*(?:is|:|#)?\s*(\d{5})(?:-(\d{4}))?/i,
    /(?:ship|shipping|deliver|delivery|send)\s+(?:to|zip|postal(?:\s*code)?)?\s*[:#-]?\s*(\d{5})(?:-(\d{4}))?/i,
    /(?:destination|location)\s*(?:is|:)?\s*(\d{5})(?:-(\d{4}))?/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    return match[2] ? `${match[1]}-${match[2]}` : match[1];
  }
  return null;
}

async function prepareQuoteInquiry(db: D1Database, params: ReplySalesParams): Promise<ReplySalesAction> {
  const lead = await db.prepare(`SELECT l.product_interest, COALESCE(c.customer_type,'') AS customer_type
    FROM leads l LEFT JOIN companies c ON c.id=l.company_id WHERE l.id=? LIMIT 1`)
    .bind(params.leadId).first<Record<string, unknown>>();
  const quantity = extractReplyQuantity(params.body);
  const postalCode = extractUsPostalCode(params.body);
  let inquiry = await db.prepare(`SELECT id, reference, status FROM inquiries
    WHERE lead_id=? AND status<>'CLOSED'
    ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC LIMIT 1`)
    .bind(params.leadId).first<Record<string, unknown>>();
  let created = false;

  if (!inquiry) {
    const id = crypto.randomUUID();
    const reference = `MEQ-${Date.now().toString(36).toUpperCase()}`;
    await db.prepare(`INSERT INTO inquiries (
      id, reference, lead_id, company_id, contact_id, request_type, customer_type,
      product_interest, estimated_quantity, shipping_country, shipping_postal_code, message, status
    ) VALUES (?, ?, ?, ?, ?, 'WHOLESALE', ?, ?, ?, 'US', ?, ?, 'QUALIFIED')`)
      .bind(
        id, reference, params.leadId, params.companyId, params.contactId,
        clean(lead?.customer_type, 100) || null,
        clean(lead?.product_interest, 100) || 'SILENT_BALL',
        quantity ? String(quantity) : null,
        postalCode,
        clean(params.body, 8000) || 'Created automatically from a customer pricing reply.',
      ).run();
    inquiry = { id, reference, status: 'QUALIFIED' };
    created = true;
  } else {
    const currentStatus = clean(inquiry.status, 50);
    const nextStatus = currentStatus === 'QUOTED' ? 'QUOTED' : 'QUALIFIED';
    await db.prepare(`UPDATE inquiries SET
      estimated_quantity=COALESCE(?, estimated_quantity),
      shipping_country=COALESCE(shipping_country, 'US'),
      shipping_postal_code=COALESCE(?, shipping_postal_code),
      message=CASE WHEN ?<>'' THEN ? ELSE message END,
      status=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?`)
      .bind(
        quantity ? String(quantity) : null,
        postalCode,
        clean(params.body, 8000), clean(params.body, 8000), nextStatus, String(inquiry.id),
      ).run();
  }

  const reference = String(inquiry.reference);
  const details = [quantity ? `${quantity} units` : '', postalCode ? `ZIP ${postalCode}` : ''].filter(Boolean).join(' · ');
  const nextAction = `Prepare quotation · ${reference}${details ? ` · ${details}` : ''}`;
  await db.prepare(`UPDATE leads SET status='QUOTE', next_best_action=?, next_action_at=datetime('now','+1 day'), updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .bind(nextAction, params.leadId).run();
  await db.prepare(`INSERT INTO activities (id, entity_type, entity_id, activity_type, title, description, metadata_json)
    VALUES (?, 'LEAD', ?, 'AUTO_QUOTE_INQUIRY', 'Pricing reply converted to quote inquiry', ?, ?)`)
    .bind(
      crypto.randomUUID(), params.leadId,
      `${reference}${details ? ` · ${details}` : ''}`,
      JSON.stringify({ reference, quantity, postalCode, created, sourceMessageId: params.messageId || null }),
    ).run();

  return { kind: 'QUOTE_INQUIRY', reference, quantity, postalCode, created };
}

async function prepareSampleRequest(db: D1Database, params: ReplySalesParams): Promise<ReplySalesAction> {
  const quantity = extractReplyQuantity(params.body) || 1;
  let sample = await db.prepare(`SELECT id, reference, status, quantity FROM samples
    WHERE lead_id=? AND status NOT IN ('CONVERTED','CLOSED')
    ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC LIMIT 1`)
    .bind(params.leadId).first<Record<string, unknown>>();
  let created = false;

  if (!sample) {
    const id = crypto.randomUUID();
    const reference = `MES-${Date.now().toString(36).toUpperCase()}`;
    await db.prepare(`INSERT INTO samples (
      id, reference, lead_id, company_id, contact_id, quantity, status, follow_up_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'REQUESTED', datetime('now','+1 day'))`)
      .bind(id, reference, params.leadId, params.companyId, params.contactId, quantity).run();
    sample = { id, reference, status: 'REQUESTED', quantity };
    created = true;
  } else {
    await db.prepare(`UPDATE samples SET quantity=CASE WHEN ? > quantity THEN ? ELSE quantity END,
      follow_up_at=datetime('now','+1 day'), updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(quantity, quantity, String(sample.id)).run();
  }

  const reference = String(sample.reference);
  const nextAction = `Review sample request · ${reference}`;
  await db.prepare(`UPDATE leads SET status='SAMPLE', next_best_action=?, next_action_at=datetime('now','+1 day'), updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .bind(nextAction, params.leadId).run();
  await db.prepare(`INSERT INTO activities (id, entity_type, entity_id, activity_type, title, description, metadata_json)
    VALUES (?, 'LEAD', ?, 'AUTO_SAMPLE_REQUEST', 'Sample interest converted to sample request', ?, ?)`)
    .bind(
      crypto.randomUUID(), params.leadId,
      `${reference} · requested quantity ${quantity}`,
      JSON.stringify({ reference, quantity, created, sourceMessageId: params.messageId || null }),
    ).run();

  return { kind: 'SAMPLE_REQUEST', reference, quantity, created };
}

export async function applyReplySalesAction(db: D1Database, params: ReplySalesParams): Promise<ReplySalesAction> {
  if (params.intent === 'PRICE_QUOTE' || params.intent === 'NEGOTIATION') {
    return prepareQuoteInquiry(db, params);
  }
  if (params.intent === 'SAMPLE_INTEREST') {
    return prepareSampleRequest(db, params);
  }
  return { kind: 'NONE' };
}
