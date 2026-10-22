import {quoteTotals, confirmedQuantity, usdCents} from '../../../lib/quote-totals';
import {ensureRetailApprovals} from './quote-retail-approval';
import {verifyQuoteProcurement,quoteLineSku} from '../../../lib/quote-procurement-review';
import {STRIPE_AUTOMATIC_TAX_NOTE,usesStripeAutomaticTaxQuote} from '../../../lib/stripe-automatic-tax-quote';
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
  taxUSD?: number|string;
  taxBasis?: string;
};

const clean = (value: unknown, max = 3000) => typeof value === 'string' ? value.trim().slice(0, max) : '';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.MINGEAGLE_DB) return Response.json({ ok: false, error: 'Database is not configured.' }, { status: 503 });

  const quoteId = clean(new URL(request.url).searchParams.get('quoteId'), 120);
  if (!quoteId) return Response.json({ ok: false, error: 'Quote id is required.' }, { status: 400 });

  try {
    const quote = await env.MINGEAGLE_DB.prepare(`SELECT id, reference, status, currency, subtotal, discount, shipping, tax, total, tax_basis,
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
    const quote = await db.prepare(`SELECT id, reference, status, currency, tax FROM quotes WHERE id=? LIMIT 1`)
      .bind(quoteId).first<Row>();
    if (!quote) return Response.json({ ok: false, error: 'Quote not found.' }, { status: 404 });
    if (String(quote.status) !== 'DRAFT') {
      return Response.json({ ok: false, error: 'Only DRAFT quotations can be edited. Create a new revision if the customer has already received this quote.' }, { status: 409 });
    }

    const existingItems = await db.prepare(`SELECT id,description FROM quote_items WHERE quote_id=? ORDER BY sort_order, id`).bind(quoteId).all<{ id: string;description:string }>();
    const existingIds = new Set((existingItems.results || []).map(item => item.id));
    const incoming = Array.isArray(input.items) ? input.items : [];
    if (!incoming.length) return Response.json({ ok: false, error: 'At least one quote item is required.' }, { status: 400 });

    const seenIds = new Set<string>();
    const normalized = incoming.map((item, index) => {
      const id = clean(item.id, 120);
      if (!id || !existingIds.has(id) || seenIds.has(id)) throw new Error('Quote item mismatch. Refresh the quote and try again.');
      seenIds.add(id);
      const description = clean(item.description, 500) || 'MING EAGLE Silent Basketball products';
      const quantity = confirmedQuantity(item.quantity);
      const unitPrice = usdCents(item.unitPrice, 100000, true) / 100;
      const lineTotal = quantity * usdCents(item.unitPrice, 100000, true) / 100;
      return { id, description, quantity, unitPrice, lineTotal, sortOrder: index };
    });

    if (normalized.length !== existingIds.size) {
      return Response.json({ ok: false, error: 'All existing quote items must be included when editing.' }, { status: 400 });
    }

    const existingSkuById=new Map((existingItems.results||[]).map(row=>[row.id,quoteLineSku(String(row.description||''))]));
    // A previously recognized supplier SKU may not be hidden by editing the
    // description into arbitrary text without reclassifying the quote.
    if(normalized.some(row=>existingSkuById.get(row.id)&&!quoteLineSku(row.description)))
      return Response.json({ok:false,error:'Previously identified SKU cannot be removed from quote description without manual commercial reclassification.'},{status:409});
    const taxUSD = input.taxUSD === undefined ? Number(quote.tax ?? 0) : Number(input.taxUSD);
    const taxBasis = clean(input.taxBasis, 1000);
    const automaticTax = usesStripeAutomaticTaxQuote(taxBasis);
    if (!Number.isFinite(taxUSD) || taxUSD < 0) throw new Error('INVALID_TAX');
    if (!taxBasis) throw new Error('TAX_BASIS_REQUIRED');
    if (automaticTax && Math.round(taxUSD * 100) !== 0) throw new Error('AUTOMATIC_TAX_AMOUNT_MUST_BE_ZERO');
    const calculation = quoteTotals(normalized, input.shipping, input.discount ?? 0, taxUSD);
    let costReview:Awaited<ReturnType<typeof verifyQuoteProcurement>>;
    try{
      costReview=await verifyQuoteProcurement(db,normalized.map(x=>({
        description:x.description,quantity:x.quantity,unitPrice:x.unitPrice
      })),calculation.discount,String(quote.currency||'USD'),new Date().toISOString().slice(0,10));
    }catch{
      return Response.json({ok:false,error:'Supplier cost review is temporarily unavailable. No quote changes saved.'},{status:503});
    }
    if(!costReview.ok)return Response.json({ok:false,error:'Supplier purchase floor review blocked draft update: '+costReview.issues.join(', ')+'. Check supplier cost, discount and MOQ before saving.'},{status:409});
    const {subtotal, shipping, discount, total} = calculation;
    const paymentTerms = clean(input.paymentTerms, 500) || 'Payment terms to be confirmed before sending.';
    const shippingTerms = clean(input.shippingTerms, 500) || 'Shipping terms to be confirmed before sending.';
    const notes = automaticTax ? STRIPE_AUTOMATIC_TAX_NOTE : clean(input.notes, 3000) || null;
    const validUntil = clean(input.validUntil, 40);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) {
      return Response.json({ ok: false, error: 'Valid until date is required.' }, { status: 400 });
    }

    await ensureRetailApprovals(db);
    const updates = normalized.flatMap(item => [
      db.prepare(`DELETE FROM quote_retail_approvals WHERE quote_id=? AND item_id=? AND (approved_description<>? OR approved_unit_price<>? OR approved_quantity<>?)`)
        .bind(quoteId,item.id,item.description,item.unitPrice,item.quantity),
      db.prepare(`UPDATE quote_items SET description=?, quantity=?, unit_price=?, line_total=?, sort_order=? WHERE id=? AND quote_id=?`)
        .bind(item.description,item.quantity,item.unitPrice,item.lineTotal,item.sortOrder,item.id,quoteId)
    ]);
    updates.push(db.prepare(`UPDATE quotes SET subtotal=?, discount=?, shipping=?, tax=?, total=?, payment_terms=?, shipping_terms=?, notes=?, tax_basis=?, valid_until=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(subtotal, discount, shipping, calculation.tax, total, paymentTerms, shippingTerms, notes, taxBasis, `${validUntil} 23:59:59`, quoteId));
    updates.push(db.prepare(`INSERT INTO activities (id, entity_type, entity_id, activity_type, title, description, metadata_json)
      VALUES (?, 'QUOTE', ?, 'QUOTE_DRAFT_UPDATED', 'Quote draft updated', ?, ?)`)
      .bind(crypto.randomUUID(), quoteId, `${String(quote.reference)} draft commercial terms updated`, JSON.stringify({ subtotal, discount, shipping, total, items: normalized.length })));
    await db.batch(updates);

    return Response.json({ ok: true, quote: { id: quoteId, reference: quote.reference, status: 'DRAFT', currency: quote.currency || 'USD', subtotal, discount, shipping, tax:calculation.tax, total, validUntil },
      procurementReview:{matched:costReview.matched,unverified:costReview.unverified,
        scope:'Internal purchasing SKU/size reference, not full landed margin.'} });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update quote.';
    const status = /must be greater than 0|mismatch|included|INVALID_|DISCOUNT_EXCEEDS_SUBTOTAL|AUTOMATIC_TAX_AMOUNT_MUST_BE_ZERO/i.test(message) ? 400 : 500;
    if(status===500)console.error('quote_edit_save_failed', error);
    return Response.json({ ok: false, error: message }, { status });
  }
};
