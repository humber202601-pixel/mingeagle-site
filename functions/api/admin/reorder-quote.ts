interface Env {
  MINGEAGLE_DB: D1Database;
}

type Input = { orderReference?: string };

const clean = (value: unknown, max = 160) => typeof value === 'string' ? value.trim().slice(0, max) : '';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.MINGEAGLE_DB) return Response.json({ ok: false, error: 'Database is not configured.' }, { status: 503 });

  try {
    const input = await request.json() as Input;
    const orderReference = clean(input.orderReference);
    if (!orderReference) return Response.json({ ok: false, error: 'Order reference is required.' }, { status: 400 });

    const db = env.MINGEAGLE_DB;
    const order = await db.prepare(`SELECT id, reference, lead_id, company_id, contact_id, currency, subtotal, discount, shipping, tax, total, status
      FROM orders WHERE reference=? LIMIT 1`).bind(orderReference).first<Record<string, unknown>>();
    if (!order) return Response.json({ ok: false, error: 'Order not found.' }, { status: 404 });
    if (String(order.status) === 'CANCELLED') return Response.json({ ok: false, error: 'Cancelled orders cannot be used for reorder.' }, { status: 409 });

    const items = await db.prepare(`SELECT product_id, variant_id, description, quantity, unit_price, line_total
      FROM order_items WHERE order_id=? ORDER BY id`).bind(String(order.id)).all<Record<string, unknown>>();
    if (!items.results.length) return Response.json({ ok: false, error: 'Order has no line items.' }, { status: 409 });

    const quoteId = crypto.randomUUID();
    const reference = `ME-Q-${Date.now().toString(36).toUpperCase()}`;
    const subtotal = items.results.reduce((sum, item) => sum + Number(item.line_total || 0), 0);
    const shipping = Number(order.shipping || 0);
    const discount = 0;
    const tax = 0;
    const total = Math.max(0, subtotal + shipping);

    await db.prepare(`INSERT INTO quotes (
      id, reference, lead_id, company_id, contact_id, status, currency,
      subtotal, discount, shipping, tax, total, payment_terms, shipping_terms, notes, valid_until
    ) VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','+14 days'))`)
      .bind(
        quoteId,
        reference,
        order.lead_id || null,
        order.company_id || null,
        order.contact_id || null,
        String(order.currency || 'USD'),
        subtotal,
        discount,
        shipping,
        tax,
        total,
        'Please review payment terms before sending.',
        'Please review shipping terms before sending.',
        `Reorder draft based on ${orderReference}`,
      ).run();

    for (const item of items.results) {
      await db.prepare(`INSERT INTO quote_items (id, quote_id, product_id, variant_id, description, quantity, unit_price, line_total, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          crypto.randomUUID(), quoteId,
          item.product_id || null,
          item.variant_id || null,
          String(item.description || 'MING EAGLE products'),
          Number(item.quantity || 0),
          Number(item.unit_price || 0),
          Number(item.line_total || 0),
          items.results.indexOf(item),
        ).run();
    }

    if (order.lead_id) {
      await db.prepare(`UPDATE leads SET status='QUOTE', next_best_action=?, next_action_at=datetime('now','+1 day'), updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .bind(`Review reorder quote ${reference}`, String(order.lead_id)).run();
    }

    await db.prepare(`INSERT INTO tasks (id, lead_id, company_id, contact_id, order_id, type, title, description, status, priority, due_at)
      VALUES (?, ?, ?, ?, ?, 'REORDER', ?, ?, 'OPEN', 'HIGH', datetime('now','+1 day'))`)
      .bind(
        crypto.randomUUID(), order.lead_id || null, order.company_id || null, order.contact_id || null, String(order.id),
        `Review reorder quote ${reference}`,
        `Reorder quote draft created from ${orderReference}. Review quantity, price and shipping before sending.`,
      ).run();

    await db.prepare(`INSERT INTO activities (id, entity_type, entity_id, activity_type, title, description, metadata_json)
      VALUES (?, 'QUOTE', ?, 'REORDER_QUOTE_CREATED', 'Reorder quote draft created', ?, ?)`)
      .bind(
        crypto.randomUUID(), quoteId,
        `${reference} created from historical order ${orderReference}`,
        JSON.stringify({ reference, orderReference, subtotal, shipping, total }),
      ).run();

    return Response.json({ ok: true, quote: { id: quoteId, reference, status: 'DRAFT', total, currency: String(order.currency || 'USD') } }, { status: 201 });
  } catch (error) {
    console.error('reorder_quote_failed', error);
    return Response.json({ ok: false, error: 'Unable to create reorder quote.' }, { status: 500 });
  }
};
