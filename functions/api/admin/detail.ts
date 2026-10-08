interface Env {
  MINGEAGLE_DB: D1Database;
}

type DetailType = 'company' | 'inquiry' | 'lead';

type Row = Record<string, unknown>;

async function getTimeline(db: D1Database, type: DetailType, id: string, leadId?: string | null, companyId?: string | null, inquiryId?: string | null) {
  if (type === 'company') {
    return db.prepare(`SELECT activity_type, title, description, created_at, entity_type, entity_id
      FROM activities
      WHERE (entity_type='COMPANY' AND entity_id=?)
         OR (entity_type='LEAD' AND entity_id IN (SELECT id FROM leads WHERE company_id=?))
         OR (entity_type='QUOTE' AND entity_id IN (SELECT id FROM quotes WHERE company_id=?))
         OR (entity_type='ORDER' AND entity_id IN (SELECT id FROM orders WHERE company_id=?))
      ORDER BY created_at DESC LIMIT 200`)
      .bind(id, id, id, id).all();
  }

  if (type === 'inquiry') {
    return db.prepare(`SELECT activity_type, title, description, created_at, entity_type, entity_id
      FROM activities
      WHERE (entity_type='INQUIRY' AND entity_id=?)
         OR (entity_type='LEAD' AND entity_id=?)
         OR (entity_type='QUOTE' AND entity_id IN (SELECT id FROM quotes WHERE inquiry_id=?))
         OR (entity_type='ORDER' AND entity_id IN (SELECT id FROM orders WHERE quote_id IN (SELECT id FROM quotes WHERE inquiry_id=?)))
      ORDER BY created_at DESC LIMIT 200`)
      .bind(id, leadId || '', id, id).all();
  }

  return db.prepare(`SELECT activity_type, title, description, created_at, entity_type, entity_id
    FROM activities
    WHERE (entity_type='LEAD' AND entity_id=?)
       OR (entity_type='QUOTE' AND entity_id IN (SELECT id FROM quotes WHERE lead_id=?))
       OR (entity_type='ORDER' AND entity_id IN (SELECT id FROM orders WHERE lead_id=?))
    ORDER BY created_at DESC LIMIT 200`)
    .bind(id, id, id).all();
}

function buildScoreExplanation(lead: Row, inquiry: Row | null) {
  const score = Number(lead.lead_score || 0);
  const items: Array<{ label: string; points?: number; value?: string }> = [];

  if (String(lead.source || '').toUpperCase() === 'WEBSITE' && inquiry) {
    const requestType = String(inquiry.request_type || 'WHOLESALE').toUpperCase();
    const quantity = Number(inquiry.estimated_quantity || 0);
    items.push({ label: requestType === 'SAMPLE' ? '样品申请基础分' : '批发询盘基础分', points: requestType === 'SAMPLE' ? 72 : 62 });
    if (quantity >= 20) items.push({ label: '预计数量 ≥ 20', points: 5 });
    if (quantity >= 100) items.push({ label: '预计数量 ≥ 100', points: 8 });
    if (quantity >= 500) items.push({ label: '预计数量 ≥ 500', points: 5 });
    if (inquiry.company_id) items.push({ label: '提供公司 / 机构信息', points: 5 });
    if (['Academy','Coach / trainer','Retailer','Camp / program','Distributor'].includes(String(inquiry.customer_type || ''))) {
      items.push({ label: '商业客户类型匹配', points: 6 });
    }
  } else {
    items.push({ label: '当前评分', value: `${score} 分` });
    items.push({ label: '来源', value: String(lead.source || '未知') });
  }

  return {
    total: score,
    contactQuality: Number(lead.contact_quality_score || 0),
    potentialValue: Number(lead.potential_value || 0),
    closeProbability: Number(lead.close_probability || 0),
    opportunityScore: Number(lead.opportunity_score || 0),
    items,
  };
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.MINGEAGLE_DB) return Response.json({ ok: false, error: 'Database is not configured.' }, { status: 503 });

  const url = new URL(request.url);
  const type = String(url.searchParams.get('type') || '') as DetailType;
  const id = String(url.searchParams.get('id') || '').trim();
  if (!['company','inquiry','lead'].includes(type) || !id) {
    return Response.json({ ok: false, error: 'Valid detail type and id are required.' }, { status: 400 });
  }

  const db = env.MINGEAGLE_DB;

  try {
    if (type === 'company') {
      const company = await db.prepare(`SELECT * FROM companies WHERE id=? LIMIT 1`).bind(id).first<Row>();
      if (!company) return Response.json({ ok: false, error: 'Company not found.' }, { status: 404 });

      const [contacts, leads, inquiries, quotes, orders, tasks, messages, timeline] = await Promise.all([
        db.prepare(`SELECT * FROM contacts WHERE company_id=? ORDER BY is_primary DESC, created_at DESC`).bind(id).all(),
        db.prepare(`SELECT id, source, source_detail, status, product_interest, lead_score, contact_quality_score, potential_value, close_probability, opportunity_score, next_best_action, next_action_at, created_at FROM leads WHERE company_id=? ORDER BY created_at DESC`).bind(id).all(),
        db.prepare(`SELECT id, reference, request_type, customer_type, product_interest, estimated_quantity, shipping_country, shipping_city, shipping_postal_code, message, status, created_at FROM inquiries WHERE company_id=? ORDER BY created_at DESC`).bind(id).all(),
        db.prepare(`SELECT id, reference, total, currency, status, valid_until, sent_at, first_viewed_at, accepted_at, created_at FROM quotes WHERE company_id=? ORDER BY created_at DESC`).bind(id).all(),
        db.prepare(`SELECT o.id, o.reference, o.total, o.currency, o.status, o.payment_status, o.created_at,
          COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.order_id=o.id AND p.status='RECEIVED'),0) AS amount_received,
          (SELECT carrier FROM shipments s WHERE s.order_id=o.id ORDER BY s.created_at DESC LIMIT 1) AS carrier,
          (SELECT tracking_number FROM shipments s WHERE s.order_id=o.id ORDER BY s.created_at DESC LIMIT 1) AS tracking_number
          FROM orders o WHERE o.company_id=? ORDER BY o.created_at DESC`).bind(id).all(),
        db.prepare(`SELECT id, type, title, description, status, priority, due_at, completed_at, created_at FROM tasks WHERE company_id=? ORDER BY created_at DESC LIMIT 100`).bind(id).all(),
        db.prepare(`SELECT id, channel, direction, subject, body, intent, sent_at FROM messages WHERE company_id=? ORDER BY sent_at DESC LIMIT 100`).bind(id).all(),
        getTimeline(db, type, id),
      ]);

      return Response.json({ ok: true, type, record: company, contacts: contacts.results, leads: leads.results, inquiries: inquiries.results, quotes: quotes.results, orders: orders.results, tasks: tasks.results, messages: messages.results, timeline: timeline.results });
    }

    if (type === 'inquiry') {
      const inquiry = await db.prepare(`SELECT i.*, c.name AS company_name, c.status AS company_status,
        ct.full_name AS contact_name, ct.email AS contact_email, ct.phone AS contact_phone, ct.whatsapp AS contact_whatsapp
        FROM inquiries i
        LEFT JOIN companies c ON c.id=i.company_id
        LEFT JOIN contacts ct ON ct.id=i.contact_id
        WHERE i.id=? LIMIT 1`).bind(id).first<Row>();
      if (!inquiry) return Response.json({ ok: false, error: 'Inquiry not found.' }, { status: 404 });

      const leadId = inquiry.lead_id ? String(inquiry.lead_id) : null;
      const [lead, quotes, orders, tasks, messages, timeline] = await Promise.all([
        leadId ? db.prepare(`SELECT * FROM leads WHERE id=? LIMIT 1`).bind(leadId).first<Row>() : Promise.resolve(null),
        db.prepare(`SELECT id, reference, total, currency, status, valid_until, sent_at, first_viewed_at, accepted_at, created_at FROM quotes WHERE inquiry_id=? ORDER BY created_at DESC`).bind(id).all(),
        db.prepare(`SELECT o.id, o.reference, o.total, o.currency, o.status, o.payment_status, o.created_at FROM orders o WHERE o.quote_id IN (SELECT id FROM quotes WHERE inquiry_id=?) ORDER BY o.created_at DESC`).bind(id).all(),
        leadId ? db.prepare(`SELECT id, type, title, description, status, priority, due_at, completed_at, created_at FROM tasks WHERE lead_id=? ORDER BY created_at DESC LIMIT 100`).bind(leadId).all() : Promise.resolve({ results: [] }),
        leadId ? db.prepare(`SELECT id, channel, direction, subject, body, intent, sent_at FROM messages WHERE lead_id=? ORDER BY sent_at DESC LIMIT 100`).bind(leadId).all() : Promise.resolve({ results: [] }),
        getTimeline(db, type, id, leadId, inquiry.company_id ? String(inquiry.company_id) : null, id),
      ]);

      return Response.json({ ok: true, type, record: inquiry, lead, score: lead ? buildScoreExplanation(lead, inquiry) : null, quotes: quotes.results, orders: orders.results, tasks: tasks.results, messages: messages.results, timeline: timeline.results });
    }

    const lead = await db.prepare(`SELECT l.*, c.name AS company_name, c.customer_type, c.country, c.city, c.state_region, c.address, c.website, ct.title AS contact_title, ct.linkedin_url, ct.instagram_url,
      ct.full_name AS contact_name, ct.email AS contact_email, ct.phone AS contact_phone, ct.whatsapp AS contact_whatsapp
      FROM leads l
      LEFT JOIN companies c ON c.id=l.company_id
      LEFT JOIN contacts ct ON ct.id=l.primary_contact_id
      WHERE l.id=? LIMIT 1`).bind(id).first<Row>();
    if (!lead) return Response.json({ ok: false, error: 'Lead not found.' }, { status: 404 });

    const inquiry = await db.prepare(`SELECT * FROM inquiries WHERE lead_id=? ORDER BY created_at DESC LIMIT 1`).bind(id).first<Row>();
    const [inquiries, quotes, orders, tasks, messages, evidence, timeline] = await Promise.all([
      db.prepare(`SELECT id, reference, request_type, estimated_quantity, message, status, created_at FROM inquiries WHERE lead_id=? ORDER BY created_at DESC`).bind(id).all(),
      db.prepare(`SELECT id, reference, total, currency, status, valid_until, created_at FROM quotes WHERE lead_id=? ORDER BY created_at DESC`).bind(id).all(),
      db.prepare(`SELECT id, reference, total, currency, status, payment_status, created_at FROM orders WHERE lead_id=? ORDER BY created_at DESC`).bind(id).all(),
      db.prepare(`SELECT id, type, title, description, status, priority, due_at, completed_at, created_at FROM tasks WHERE lead_id=? ORDER BY created_at DESC LIMIT 100`).bind(id).all(),
      db.prepare(`SELECT id, channel, direction, subject, body, intent, sent_at FROM messages WHERE lead_id=? ORDER BY sent_at DESC LIMIT 100`).bind(id).all(),
      db.prepare(`SELECT field_name, value, source_url, evidence_text, confidence, captured_at FROM lead_evidence WHERE lead_id=? ORDER BY captured_at DESC`).bind(id).all(),
      getTimeline(db, type, id),
    ]);

    return Response.json({ ok: true, type, record: lead, inquiry: inquiry || null, score: buildScoreExplanation(lead, inquiry || null), inquiries: inquiries.results, quotes: quotes.results, orders: orders.results, tasks: tasks.results, messages: messages.results, evidence: evidence.results, timeline: timeline.results });
  } catch (error) {
    console.error('admin_detail_failed', error);
    return Response.json({ ok: false, error: 'Unable to load detail.' }, { status: 500 });
  }
};
