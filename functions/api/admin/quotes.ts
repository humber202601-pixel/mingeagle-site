interface Env {
  MINGEAGLE_DB: D1Database;
}

type QuoteInput = {
  inquiryReference?: string;
  description?: string;
  quantity?: number | string;
  unitPrice?: number | string;
  shipping?: number | string;
  discount?: number | string;
  validDays?: number | string;
  paymentTerms?: string;
  shippingTerms?: string;
  notes?: string;
};

const clean = (value: unknown, max = 1000) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

const num = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.MINGEAGLE_DB) {
    return Response.json({ ok: false, error: 'Database is not configured.' }, { status: 503 });
  }

  try {
    const input = await request.json() as QuoteInput;
    const inquiryReference = clean(input.inquiryReference, 120);
    const description = clean(input.description, 500) || 'MING EAGLE Silent Basketball products';
    const quantity = Math.max(1, Math.round(num(input.quantity, 1)));
    const unitPrice = num(input.unitPrice, 0);
    const shipping = Math.max(0, num(input.shipping, 0));
    const discount = Math.max(0, num(input.discount, 0));
    const validDays = Math.min(90, Math.max(1, Math.round(num(input.validDays, 14))));
    const paymentTerms = clean(input.paymentTerms, 500) || 'Payment terms to be confirmed before sending.';
    const shippingTerms = clean(input.shippingTerms, 500) || 'Shipping terms to be confirmed before sending.';
    const notes = clean(input.notes, 3000);

    if (!inquiryReference) {
      return Response.json({ ok: false, error: 'Inquiry reference is required.' }, { status: 400 });
    }
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      return Response.json({ ok: false, error: 'Unit price must be greater than 0 before creating a quote draft.' }, { status: 400 });
    }

    const db = env.MINGEAGLE_DB;
    const inquiry = await db.prepare(`SELECT id, lead_id, company_id, contact_id, status
      FROM inquiries WHERE reference = ? LIMIT 1`).bind(inquiryReference).first<{
        id: string; lead_id: string | null; company_id: string | null; contact_id: string | null; status: string;
      }>();

    if (!inquiry) {
      return Response.json({ ok: false, error: 'Inquiry not found.' }, { status: 404 });
    }
    if (inquiry.status === 'CLOSED') {
      return Response.json({ ok: false, error: 'This inquiry is closed.' }, { status: 409 });
    }
    if (inquiry.status === 'QUOTED') {
      const existing = await db.prepare(`SELECT reference, status FROM quotes WHERE inquiry_id=? ORDER BY datetime(created_at) DESC LIMIT 1`)
        .bind(inquiry.id).first<{ reference: string; status: string }>();
      return Response.json({
        ok: false,
        error: existing?.reference
          ? `Inquiry already has quote ${existing.reference}. Edit it or create a revision instead of creating a duplicate.`
          : 'Inquiry has already been quoted. Use the existing quote or create a revision.',
      }, { status: 409 });
    }

    const quoteId = crypto.randomUUID();
    const quoteItemId = crypto.randomUUID();
    const lineTotal = quantity * unitPrice;
    const subtotal = lineTotal;
    const total = Math.max(0, subtotal - discount + shipping);
    const reference = `ME-Q-${Date.now().toString(36).toUpperCase()}`;

    await db.prepare(`INSERT INTO quotes (
      id, reference, lead_id, inquiry_id, company_id, contact_id, status, currency,
      subtotal, discount, shipping, tax, total, payment_terms, shipping_terms, notes,
      valid_until
    ) VALUES (?, ?, ?, ?, ?, ?, 'DRAFT', 'USD', ?, ?, ?, 0, ?, ?, ?, ?, datetime('now', ?))`)
      .bind(
        quoteId,
        reference,
        inquiry.lead_id,
        inquiry.id,
        inquiry.company_id,
        inquiry.contact_id,
        subtotal,
        discount,
        shipping,
        total,
        paymentTerms,
        shippingTerms,
        notes || null,
        `+${validDays} days`,
      ).run();

    await db.prepare(`INSERT INTO quote_items (
      id, quote_id, description, quantity, unit_price, line_total, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, 0)`)
      .bind(quoteItemId, quoteId, description, quantity, unitPrice, lineTotal).run();

    await db.prepare(`UPDATE inquiries SET status = 'QUOTED', updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(inquiry.id).run();

    if (inquiry.lead_id) {
      await db.prepare(`UPDATE leads SET status = 'QUOTE', next_best_action = ?, next_action_at = datetime('now', '+1 day'), updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .bind(`Review and send quote ${reference}`, inquiry.lead_id).run();
    }

    const openTask = inquiry.lead_id
      ? await db.prepare(`SELECT id FROM tasks WHERE lead_id=? AND status IN ('OPEN','IN_PROGRESS') AND title LIKE 'Prepare customer quotation%' ORDER BY created_at DESC LIMIT 1`)
          .bind(inquiry.lead_id).first<{ id: string }>()
      : null;
    if (openTask?.id) {
      await db.prepare(`UPDATE tasks SET status='DONE', completed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(openTask.id).run();
    }

    await db.prepare(`INSERT INTO tasks (
      id, lead_id, company_id, contact_id, type, title, description, status, priority, due_at
    ) VALUES (?, ?, ?, ?, 'FOLLOW_UP', ?, ?, 'OPEN', 'HIGH', datetime('now', '+1 day'))`)
      .bind(
        crypto.randomUUID(), inquiry.lead_id, inquiry.company_id, inquiry.contact_id,
        `Review and send quote ${reference}`,
        `Draft quote created from ${inquiryReference}. Review commercial terms before sending.`,
      ).run();

    await db.prepare(`INSERT INTO activities (
      id, entity_type, entity_id, activity_type, title, description, metadata_json
    ) VALUES (?, 'QUOTE', ?, 'QUOTE_DRAFT_CREATED', ?, ?, ?)`)
      .bind(
        crypto.randomUUID(), quoteId, 'Quote draft created', `${reference} created from ${inquiryReference}`,
        JSON.stringify({ reference, inquiryReference, total, quantity, unitPrice }),
      ).run();

    return Response.json({
      ok: true,
      reference,
      quoteId,
      status: 'DRAFT',
      total,
      currency: 'USD',
    }, { status: 201 });
  } catch (error) {
    console.error('quote_create_failed', error);
    return Response.json({ ok: false, error: 'Unable to create quote.' }, { status: 500 });
  }
};