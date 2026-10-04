interface Env {
  MINGEAGLE_DB: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  if (!env.MINGEAGLE_DB) {
    return Response.json({ ok: false, error: 'Database is not configured.' }, { status: 503 });
  }

  const db = env.MINGEAGLE_DB;

  try {
    const [
      leadCount,
      inquiryCount,
      quoteCount,
      orderCount,
      leads,
      inquiries,
      companies,
      contacts,
      quotes,
      orders,
      tasks,
      activities,
      pipeline,
    ] = await Promise.all([
      db.prepare("SELECT COUNT(*) AS value FROM leads WHERE created_at >= datetime('now','-7 days')").first<{ value: number }>(),
      db.prepare("SELECT COUNT(*) AS value FROM inquiries WHERE status IN ('NEW','REVIEWING')").first<{ value: number }>(),
      db.prepare("SELECT COUNT(*) AS value FROM quotes WHERE status IN ('SENT','VIEWED')").first<{ value: number }>(),
      db.prepare("SELECT COUNT(*) AS value FROM orders WHERE status NOT IN ('COMPLETED','CANCELLED')").first<{ value: number }>(),
      db.prepare(`SELECT
        l.id, COALESCE(c.name, 'Individual buyer') AS company,
        COALESCE(ct.full_name, ct.email, 'Unknown contact') AS contact,
        l.lead_score, l.status, l.next_best_action, l.next_action_at, l.created_at
        FROM leads l
        LEFT JOIN companies c ON c.id = l.company_id
        LEFT JOIN contacts ct ON ct.id = l.primary_contact_id
        ORDER BY l.created_at DESC LIMIT 100`).all(),
      db.prepare(`SELECT
        i.id, i.reference, COALESCE(c.name, ct.full_name, ct.email, 'Unknown') AS customer,
        i.request_type, i.estimated_quantity, i.status, i.created_at
        FROM inquiries i
        LEFT JOIN companies c ON c.id = i.company_id
        LEFT JOIN contacts ct ON ct.id = i.contact_id
        ORDER BY i.created_at DESC LIMIT 100`).all(),
      db.prepare(`SELECT id, name, customer_type, country, state_region, city, status, created_at
        FROM companies ORDER BY created_at DESC LIMIT 100`).all(),
      db.prepare(`SELECT ct.id, ct.full_name, COALESCE(c.name,'—') AS company,
        ct.title, ct.email, ct.email_type, ct.email_verified, ct.phone, ct.whatsapp, ct.do_not_contact, ct.created_at
        FROM contacts ct LEFT JOIN companies c ON c.id = ct.company_id
        ORDER BY ct.created_at DESC LIMIT 100`).all(),
      db.prepare(`SELECT q.id, q.reference, COALESCE(c.name, ct.full_name, ct.email, 'Unknown') AS customer,
        q.total, q.currency, q.status, q.valid_until, q.sent_at, q.first_viewed_at, q.accepted_at, q.created_at
        FROM quotes q
        LEFT JOIN companies c ON c.id = q.company_id
        LEFT JOIN contacts ct ON ct.id = q.contact_id
        ORDER BY q.created_at DESC LIMIT 100`).all(),
      db.prepare(`SELECT o.id, o.reference, o.quote_id, COALESCE(c.name, ct.full_name, ct.email, 'Unknown') AS customer,
        o.total, o.currency, o.status, o.payment_status,
        (SELECT COALESCE(SUM(p.amount),0) FROM payments p WHERE p.order_id=o.id AND p.status='RECEIVED') AS amount_received,
        o.paid_at, o.confirmed_at, o.completed_at,
        (SELECT carrier FROM shipments s WHERE s.order_id=o.id ORDER BY s.created_at DESC LIMIT 1) AS carrier,
        (SELECT service FROM shipments s WHERE s.order_id=o.id ORDER BY s.created_at DESC LIMIT 1) AS service,
        (SELECT tracking_number FROM shipments s WHERE s.order_id=o.id ORDER BY s.created_at DESC LIMIT 1) AS tracking_number,
        (SELECT tracking_url FROM shipments s WHERE s.order_id=o.id ORDER BY s.created_at DESC LIMIT 1) AS tracking_url,
        (SELECT status FROM shipments s WHERE s.order_id=o.id ORDER BY s.created_at DESC LIMIT 1) AS shipment_status,
        (SELECT shipped_at FROM shipments s WHERE s.order_id=o.id ORDER BY s.created_at DESC LIMIT 1) AS shipped_at,
        (SELECT delivered_at FROM shipments s WHERE s.order_id=o.id ORDER BY s.created_at DESC LIMIT 1) AS delivered_at,
        o.created_at
        FROM orders o
        LEFT JOIN companies c ON c.id = o.company_id
        LEFT JOIN contacts ct ON ct.id = o.contact_id
        ORDER BY o.created_at DESC LIMIT 100`).all(),
      db.prepare(`SELECT t.id, t.title, t.description, t.priority, t.due_at, t.status,
        COALESCE(c.name, ct.full_name, 'General') AS related_to, t.created_at
        FROM tasks t
        LEFT JOIN companies c ON c.id = t.company_id
        LEFT JOIN contacts ct ON ct.id = t.contact_id
        WHERE t.status IN ('OPEN','IN_PROGRESS')
        ORDER BY CASE t.priority WHEN 'URGENT' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END,
                 COALESCE(t.due_at, '9999-12-31') ASC
        LIMIT 50`).all(),
      db.prepare(`SELECT activity_type, title, description, created_at
        FROM activities ORDER BY created_at DESC LIMIT 20`).all(),
      db.prepare(`SELECT status, COUNT(*) AS value FROM leads GROUP BY status ORDER BY value DESC`).all(),
    ]);

    return Response.json({
      ok: true,
      metrics: {
        newLeads: Number(leadCount?.value || 0),
        openInquiries: Number(inquiryCount?.value || 0),
        quotesWaiting: Number(quoteCount?.value || 0),
        activeOrders: Number(orderCount?.value || 0),
      },
      leads: leads.results,
      inquiries: inquiries.results,
      companies: companies.results,
      contacts: contacts.results,
      quotes: quotes.results,
      orders: orders.results,
      tasks: tasks.results,
      activities: activities.results,
      pipeline: pipeline.results,
    });
  } catch (error) {
    console.error('admin_data_failed', error);
    return Response.json({ ok: false, error: 'Unable to load admin data.' }, { status: 500 });
  }
};
