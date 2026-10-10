interface Env {
  MINGEAGLE_DB: D1Database;
}

type Row = Record<string, unknown>;

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function ensureQuoteLinks(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS quote_public_links (
    id TEXT PRIMARY KEY,
    quote_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at TEXT
  )`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_quote_public_links_quote ON quote_public_links(quote_id, created_at DESC)`).run();
}

async function getQuote(db: D1Database, token: string) {
  await ensureQuoteLinks(db);
  const hash = await sha256(token);
  return db.prepare(`SELECT
      q.id, q.reference, q.status, q.currency, q.subtotal, q.discount, q.shipping, q.tax, q.total,
      q.payment_terms, q.shipping_terms, q.notes, q.valid_until, q.sent_at, q.first_viewed_at, q.accepted_at,
      q.lead_id, q.inquiry_id, q.company_id, q.contact_id,
      COALESCE(c.name, ct.full_name, 'Customer') AS customer,
      ct.full_name AS contact_name, ct.email AS contact_email,
      CASE WHEN q.valid_until IS NOT NULL AND datetime(q.valid_until) < datetime('now') THEN 1 ELSE 0 END AS is_expired
    FROM quotes q
    LEFT JOIN companies c ON c.id=q.company_id
    LEFT JOIN contacts ct ON ct.id=q.contact_id
    WHERE q.public_token_hash=?
       OR EXISTS (
         SELECT 1 FROM quote_public_links qpl
         WHERE qpl.quote_id=q.id AND qpl.token_hash=? AND qpl.revoked_at IS NULL
       )
    LIMIT 1`).bind(hash, hash).first<Row>();
}

async function getOrder(db: D1Database, quoteId: string) {
  return db.prepare(`SELECT o.id, o.reference, o.status, o.payment_status,
      (SELECT carrier FROM shipments s WHERE s.order_id=o.id ORDER BY s.created_at DESC LIMIT 1) AS carrier,
      (SELECT service FROM shipments s WHERE s.order_id=o.id ORDER BY s.created_at DESC LIMIT 1) AS service,
      (SELECT tracking_number FROM shipments s WHERE s.order_id=o.id ORDER BY s.created_at DESC LIMIT 1) AS tracking_number,
      (SELECT tracking_url FROM shipments s WHERE s.order_id=o.id ORDER BY s.created_at DESC LIMIT 1) AS tracking_url,
      (SELECT status FROM shipments s WHERE s.order_id=o.id ORDER BY s.created_at DESC LIMIT 1) AS shipment_status,
      (SELECT shipped_at FROM shipments s WHERE s.order_id=o.id ORDER BY s.created_at DESC LIMIT 1) AS shipped_at,
      (SELECT delivered_at FROM shipments s WHERE s.order_id=o.id ORDER BY s.created_at DESC LIMIT 1) AS delivered_at
    FROM orders o WHERE o.quote_id=? ORDER BY o.created_at DESC LIMIT 1`).bind(quoteId).first<Row>();
}

export const onRequestGet: PagesFunction<Env> = async ({ params, env }) => {
  if (!env.MINGEAGLE_DB) return Response.json({ ok: false, error: 'Database is not configured.' }, { status: 503 });
  const token = String(params.token || '');
  if (token.length < 40) return Response.json({ ok: false, error: 'Quote link is invalid.' }, { status: 404 });

  try {
    const db = env.MINGEAGLE_DB;
    const quote = await getQuote(db, token);
    if (!quote) return Response.json({ ok: false, error: 'Quote not found.' }, { status: 404 });

    if (Number(quote.is_expired) === 1 && !['ACCEPTED','CONVERTED'].includes(String(quote.status))) {
      if (String(quote.status) !== 'EXPIRED') {
        await db.prepare(`UPDATE quotes SET status='EXPIRED', updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(String(quote.id)).run();
        quote.status = 'EXPIRED';
      }
    } else if (String(quote.status) === 'SENT') {
      await db.prepare(`UPDATE quotes SET status='VIEWED', first_viewed_at=COALESCE(first_viewed_at,CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .bind(String(quote.id)).run();
      quote.status = 'VIEWED';
      quote.first_viewed_at = quote.first_viewed_at || new Date().toISOString();
      await db.prepare(`INSERT INTO activities (id, entity_type, entity_id, activity_type, title, description)
        VALUES (?, 'QUOTE', ?, 'QUOTE_VIEWED', 'Quote viewed', ?)`)
        .bind(crypto.randomUUID(), String(quote.id), `${String(quote.reference)} viewed by customer`).run();
    }

    const items = await db.prepare(`SELECT description, quantity, unit_price, line_total, sort_order
      FROM quote_items WHERE quote_id=? ORDER BY sort_order, id`).bind(String(quote.id)).all();
    const existingOrder = await getOrder(db, String(quote.id));

    return Response.json({ ok: true, quote, items: items.results, order: existingOrder || null });
  } catch (error) {
    console.error('public_quote_load_failed', error);
    return Response.json({ ok: false, error: 'Unable to load quote.' }, { status: 500 });
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, params, env }) => {
  if (!env.MINGEAGLE_DB) return Response.json({ ok: false, error: 'Database is not configured.' }, { status: 503 });
  const token = String(params.token || '');
  if (token.length < 40) return Response.json({ ok: false, error: 'Quote link is invalid.' }, { status: 404 });

  const origin = request.headers.get('origin');
  const requestOrigin = new URL(request.url).origin;
  if (origin && origin !== requestOrigin) return Response.json({ ok: false, error: 'Invalid request origin.' }, { status: 403 });

  try {
    const body = await request.json().catch(() => ({})) as { action?: string };
    if (body.action !== 'accept') return Response.json({ ok: false, error: 'Unsupported action.' }, { status: 400 });

    const db = env.MINGEAGLE_DB;
    const quote = await getQuote(db, token);
    if (!quote) return Response.json({ ok: false, error: 'Quote not found.' }, { status: 404 });

    const quoteId = String(quote.id);
    const status = String(quote.status);
    if (Number(quote.is_expired) === 1 || status === 'EXPIRED') {
      await db.prepare(`UPDATE quotes SET status='EXPIRED', updated_at=CURRENT_TIMESTAMP WHERE id=? AND status NOT IN ('ACCEPTED','CONVERTED')`).bind(quoteId).run();
      return Response.json({ ok: false, error: 'This quote has expired. Please request an updated quote.' }, { status: 409 });
    }
    if (status === 'DECLINED') return Response.json({ ok: false, error: 'This quote is no longer available.' }, { status: 409 });
    if (Number(quote.total || 0) <= 0) {
      return Response.json({ ok: false, error: 'This quotation has no valid price and cannot be accepted. Please request a corrected quotation.' }, { status: 409 });
    }

    await db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_quote_unique ON orders(quote_id) WHERE quote_id IS NOT NULL`).run();
    const existing = await getOrder(db, quoteId);
    if (existing) {
      await db.prepare(`UPDATE quotes SET status='CONVERTED', accepted_at=COALESCE(accepted_at,CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(quoteId).run();
      return Response.json({ ok: true, accepted: true, order: existing });
    }

    if (!['SENT','VIEWED'].includes(status)) {
      return Response.json({ ok: false, error: `Quote cannot be accepted from status ${status}.` }, { status: 409 });
    }

    const items = await db.prepare(`SELECT product_id, variant_id, description, quantity, unit_price, line_total FROM quote_items WHERE quote_id=? ORDER BY sort_order, id`)
      .bind(quoteId).all<Row>();
    if (!items.results.length) return Response.json({ ok: false, error: 'Quote has no line items.' }, { status: 409 });
    // Never create an order from a partially priced or inconsistent quote.
    const validItems = items.results.every(item => {
      const qty = Number(item.quantity), unit = Number(item.unit_price), line = Number(item.line_total);
      return Number.isSafeInteger(qty) && qty > 0 &&
        Number.isFinite(unit) && unit > 0 && Number.isFinite(line) && line > 0 &&
        Math.abs(Math.round(qty * unit * 100) - Math.round(line * 100)) <= 1;
    });
    const quotedSubtotal = Number(quote.subtotal), discount = Number(quote.discount || 0),
      shipping = Number(quote.shipping || 0), tax = Number(quote.tax || 0), total = Number(quote.total);
    const computedSubtotalCents = items.results.reduce((sum,item) => sum + Math.round(Number(item.line_total) * 100), 0);
    const computedTotalCents = computedSubtotalCents - Math.round(discount * 100) +
      Math.round(shipping * 100) + Math.round(tax * 100);
    if (!validItems || ![quotedSubtotal, discount, shipping, tax, total].every(Number.isFinite) ||
        discount < 0 || shipping < 0 || tax < 0 || total <= 0 ||
        Math.abs(computedSubtotalCents - Math.round(quotedSubtotal * 100)) > 1 ||
        Math.abs(computedTotalCents - Math.round(total * 100)) > 2) {
      return Response.json({ ok:false, error:'Quotation totals or item amounts do not reconcile. Please request a corrected quotation.' }, { status:409 });
    }

    const orderId = crypto.randomUUID();
    const orderReference = `ME-${Date.now().toString(36).toUpperCase()}`;

    // Commit the order, every order item, and the quotation state together.
    // A failure must not leave a payable order missing its items.
    const orderInsert = db.prepare(`INSERT INTO orders (
        id, reference, quote_id, lead_id, company_id, contact_id, status, currency,
        subtotal, discount, shipping, tax, total, payment_status, customer_notes, confirmed_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'PAYMENT_PENDING', ?, ?, ?, ?, ?, ?, 'UNPAID', ?, CURRENT_TIMESTAMP)`)
      .bind(orderId, orderReference, quoteId,
        quote.lead_id ? String(quote.lead_id) : null,
        quote.company_id ? String(quote.company_id) : null,
        quote.contact_id ? String(quote.contact_id) : null,
        String(quote.currency || 'USD'), Number(quote.subtotal || 0), Number(quote.discount || 0),
        Number(quote.shipping || 0), Number(quote.tax || 0), Number(quote.total || 0),
        `Accepted from quote ${String(quote.reference)}`);
    const itemInserts = items.results.map(item => db.prepare(`INSERT INTO order_items
        (id, order_id, product_id, variant_id, description, quantity, unit_price, line_total)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), orderId,
        item.product_id ? String(item.product_id) : null,
        item.variant_id ? String(item.variant_id) : null,
        String(item.description || 'MING EAGLE products'), Number(item.quantity || 0),
        Number(item.unit_price || 0), Number(item.line_total || 0)));
    const converted = db.prepare(`UPDATE quotes SET status='CONVERTED', accepted_at=CURRENT_TIMESTAMP,
        updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('SENT','VIEWED')`).bind(quoteId);
    try {
      await db.batch([orderInsert, ...itemInserts, converted]);
    } catch (insertError) {
      const raced = await getOrder(db, quoteId);
      if (raced) return Response.json({ ok: true, accepted: true, order: raced });
      throw insertError;
    }
    if (quote.lead_id) {
      await db.prepare(`UPDATE leads SET status='NEGOTIATION', next_best_action='Confirm payment and fulfillment', next_action_at=datetime('now','+1 day'), updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .bind(String(quote.lead_id)).run();
    }
    await db.prepare(`INSERT INTO tasks (id, lead_id, company_id, contact_id, order_id, type, title, description, status, priority, due_at)
      VALUES (?, ?, ?, ?, ?, 'PAYMENT', ?, ?, 'OPEN', 'HIGH', datetime('now','+1 day'))`)
      .bind(
        crypto.randomUUID(), quote.lead_id || null, quote.company_id || null, quote.contact_id || null, orderId,
        `Confirm payment for ${orderReference}`, `Customer accepted ${String(quote.reference)}. Confirm payment method and receipt.`,
      ).run();
    await db.prepare(`INSERT INTO activities (id, entity_type, entity_id, activity_type, title, description, metadata_json)
      VALUES (?, 'ORDER', ?, 'QUOTE_ACCEPTED', 'Quote accepted and order created', ?, ?)`)
      .bind(crypto.randomUUID(), orderId, `${String(quote.reference)} accepted; ${orderReference} created`, JSON.stringify({ quoteReference: quote.reference, orderReference })).run();

    return Response.json({ ok: true, accepted: true, order: { id: orderId, reference: orderReference, status: 'PAYMENT_PENDING', payment_status: 'UNPAID' } }, { status: 201 });
  } catch (error) {
    console.error('public_quote_accept_failed', error);
    return Response.json({ ok: false, error: 'Unable to accept quote right now.' }, { status: 500 });
  }
};
