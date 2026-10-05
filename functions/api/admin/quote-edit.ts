interface Env {
  MINGEAGLE_DB: D1Database;
}

type Row = Record<string, unknown>;

type EditItem = {
  id?: string;
  description?: string;
  quantity?: number | string;
  unitPrice?: number | string;
};

type EditInput = {
  quoteId?: string;
  items?: EditItem[];
  shipping?: number | string;
  discount?: number | string;
  validUntil?: string;
  paymentTerms?: string;
  shippingTerms?: string;
  notes?: string;
};

const clean = (value: unknown, max = 3000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const num = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.MINGEAGLE_DB) return Response.json({ ok: false, error: 'Database is not configured.' }, { status: 503 });

  const quoteId = clean(new URL(request.url).searchParams.get('quoteId'), 120);
  if (!quoteId) return Response.json({ ok: false, error: 'Quote id is required.' }, { status: 400 });

  try {
    const quote = await env.MINGEAGLE_DB.prepare(`SELECT id, reference, status, currency, subtotal, discount, shipping, tax, total,
      payment_terms, shipping_terms, notes, valid_until
      FROM quotes WHERE id=? LIMIT 1`).bind(quoteId).first<Row>();
    if (!quote) return Response.json({ ok: false, error: 'Quote not found.' }, { status: 404 });

    const items = await env.MINGEAGLE_DB.prepare(`SELECT id, description, quantity, unit_price, line_total, sort_order
      FROM quote_items WHERE quote_id=? ORDER BY sort_order, id`).bind(quoteId).all<Row>();

    return Response.json({ ok: true, quote, items: items.results || [] });
  } catch (error) {
    console.error('quote_edit_load_failed', error);
    return Response.json({ ok: false, error: 'Unable to load quote.' }, { status: 500 });
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.MINGEAGLE_DB) return Response.json({ ok: false, error: 'Database is not configured.' }, { status: 503 });

  try {
    const input = await request.json() as EditInput;
    const quoteId = clean(input.quoteId, 120);
    if (!quoteId) return Response.json({ ok: false, error: 'Quote id is required.' }, { status: 400 });

    const db = env.MINGEAGLE_DB;
    const quote = await db.prepare(`SELECT id, reference, status, currency FROM quotes WHERE id=? LIMIT 1`)
      .bind(quoteId).first<Row>();
    if (!quote) return Response.json({ ok: false, error: 'Quote not found.' }, { status: 404 });
    if (String(quote.status) !== 'DRAFT') {
      return Response.json({ ok: false, error: 'Only DRAFT quotations can be edited. Create a new revision if the customer has already received this quote.' }, { status: 409 });
    }

    const existingItems = await db.prepare(`SELECT id FROM quote_items WHERE quote_id=? ORDER BY sort_order, id`).bind(quoteId).all<{ id: string }>();
    const existingIds = new Set((existingItems.results || []).map(item => item.id));
    const incoming = Array.isArray(input.items) ? input.items : [];
    if (!incoming.length) return Response.json({ ok: false, error: 'At least one quote item is required.' }, { status: 400 });

    let subtotal = 0;
    const normalized = incoming.map((item, index) => {
      const id = clean(item.id, 120);
      if (!id || !existingIds.has(id)) throw new Error('Quote item mismatch. Refresh the quote and try again.');
      const description = clean(item.description, 500) || 'MING EAGLE Silent Ball products';
      const quantity = Math.max(1, Math.round(num(item.quantity, 1)));
      const unitPrice = Math.max(0, num(item.unitPrice, 0));
      const lineTotal = quantity * unitPrice;
      subtotal += lineTotal;
      return { id, description, quantity, unitPrice, lineTotal, sortOrder: index };
    });

    if (normalized.length !== existingIds.size) {
      return Response.json({ ok: false, error: 'All existing quote items must be included when editing.' }, { status: 400 });
    }

    const shipping = Math.max(0, num(input.shipping, 0));
    const discount = Math.max(0, num(input.discount, 0));
    const total = Math.max(0, subtotal - discount + shipping);
    const paymentTerms = clean(input.paymentTerms, 500) || 'Payment terms to be confirmed before sending.';
    const shippingTerms = clean(input.shippingTerms, 500) || 'Shipping terms to be confirmed before sending.';
    const notes = clean(input.notes, 3000) || null;
    const validUntil = clean(input.validUntil, 40);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) {
      return Response.json({ ok: false, error: 'Valid until date is required.' }, { status: 400 });
    }

    for (const item of normalized) {
      await db.prepare(`UPDATE quote_items SET description=?, quantity=?, unit_price=?, line_total=?, sort_order=? WHERE id=? AND quote_id=?`)
        .bind(item.description, item.quantity, item.unitPrice, item.lineTotal, item.sortOrder, item.id, quoteId).run();
    }

    await db.prepare(`UPDATE quotes SET subtotal=?, discount=?, shipping=?, total=?, payment_terms=?, shipping_terms=?, notes=?, valid_until=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(subtotal, discount, shipping, total, paymentTerms, shippingTerms, notes, `${validUntil} 23:59:59`, quoteId).run();

    await db.prepare(`INSERT INTO activities (id, entity_type, entity_id, activity_type, title, description, metadata_json)
      VALUES (?, 'QUOTE', ?, 'QUOTE_DRAFT_UPDATED', 'Quote draft updated', ?, ?)`)
      .bind(crypto.randomUUID(), quoteId, `${String(quote.reference)} draft commercial terms updated`, JSON.stringify({ subtotal, discount, shipping, total, items: normalized.length })).run();

    return Response.json({ ok: true, quote: { id: quoteId, reference: quote.reference, status: 'DRAFT', currency: quote.currency || 'USD', subtotal, discount, shipping, total, validUntil } });
  } catch (error) {
    console.error('quote_edit_save_failed', error);
    return Response.json({ ok: false, error: error instanceof Error ? error.message : 'Unable to update quote.' }, { status: 500 });
  }
};
