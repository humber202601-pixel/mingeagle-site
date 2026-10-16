import {stripeCheckoutTermsSupported} from '../../../lib/b2b-quote-terms';
import {QUOTE_PUBLIC_TOKEN_PREDICATE} from '../../../lib/quote-public-token';
import {quoteTermsIssues} from '../../../lib/b2b-quote-terms';
interface Env {
  MINGEAGLE_DB: D1Database;
}

type Row = Record<string, unknown>;

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}


async function getQuote(db: D1Database, token: string) {
  const hash = await sha256(token);
  return db.prepare(`SELECT
      q.id, q.reference, q.status, q.currency, q.subtotal, q.discount, q.shipping, q.tax, q.total,
      q.payment_terms, q.shipping_terms, q.notes, q.valid_until, q.sent_at, q.first_viewed_at, q.accepted_at,
      q.lead_id, q.inquiry_id, q.company_id, q.contact_id,
      COALESCE(c.name, ct.full_name, 'Customer') AS customer,
      ct.full_name AS contact_name, ct.email AS contact_email,
      CASE
        WHEN q.valid_until IS NULL THEN 0
        -- A date-only quote is valid through 23:59:59 UTC on the shown date,
        -- matching quoteTermsIssues, rather than expiring at 00:00 that day.
        WHEN LENGTH(TRIM(q.valid_until))=10 AND date(q.valid_until)<date('now') THEN 1
        -- Explicit time-bearing expiry keeps its precise UTC cutoff.
        WHEN LENGTH(TRIM(q.valid_until))<>10 AND datetime(q.valid_until)<datetime('now') THEN 1
        ELSE 0 END AS is_expired
    FROM quotes q
    LEFT JOIN companies c ON c.id=q.company_id
    LEFT JOIN contacts ct ON ct.id=q.contact_id
    WHERE ${QUOTE_PUBLIC_TOKEN_PREDICATE}
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
    const body = await request.json().catch(() => ({})) as { action?: string; shippingAddress?: unknown };
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
    // A seller-issued quote is not buyer-acceptable until commercial terms
    // are complete and valid. Do not create an unpaid order from a draft
    // disguised as SENT, and do not rely solely on a later payment gate.
    if (!String(quote.sent_at || '').trim()) {
      return Response.json({ ok: false, error: 'This quotation has not been formally issued. Please request an updated quote.' }, { status: 409 });
    }
    const incompleteTerms = quoteTermsIssues({
      payment_terms: quote.payment_terms,
      shipping_terms: quote.shipping_terms,
      valid_until: quote.valid_until,
    });
    if (incompleteTerms.length) {
      return Response.json({ ok: false, error: 'Payment, shipping or quote validity terms need seller confirmation before acceptance.' }, { status: 409 });
    }


    // Legacy bank-transfer quotes may still be viewable, but new orders may
    // not be accepted against terms with no enabled payment provider.
    if(!stripeCheckoutTermsSupported(quote.payment_terms))
      return Response.json({ok:false,code:'STRIPE_ONLY_QUOTE_TERMS',
        error:'This quotation cannot be accepted with its former payment terms. Please request a revised Stripe Checkout quotation from MING EAGLE.'},{status:409});

    // Stripe-bound orders require an explicit buyer-confirmed delivery state
    // to prevent freight and sales tax decisions from silently changing.
    let shippingAddress:Record<string,string>|null=null;
    if(stripeCheckoutTermsSupported(quote.payment_terms)){
      const raw=body.shippingAddress;
      if(!raw||typeof raw!=='object'||Array.isArray(raw))
        return Response.json({ok:false,error:'Confirm the delivery address before accepting this Stripe quotation.'},{status:409});
      const entry=raw as Record<string,unknown>;
      const line1=String(entry.line1||'').trim(),city=String(entry.city||'').trim(),
        state=String(entry.state||'').trim().toUpperCase(),postalCode=String(entry.postalCode||'').trim(),
        country=String(entry.country||'').trim().toUpperCase();
      if(country!=='US'||!/^[A-Z]{2}$/.test(state)||line1.length<5||line1.length>180||
         city.length<2||city.length>100||!/^[0-9]{5}(?:-[0-9]{4})?$/.test(postalCode))
        return Response.json({ok:false,error:'Valid US shipping street, city, state and ZIP code are required.'},{status:409});
      if(String(quote.shipping_terms||'').toUpperCase().match(/SHIP-TO STATE:\s*([A-Z]{2})(?![A-Z])/)?.[1]!==state)
        return Response.json({ok:false,error:'Ship-to state differs from the seller quotation. Request a revised freight quotation first.'},{status:409});
      shippingAddress={line1,city,state,postalCode,country};
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
    const orderReference = `ME-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0,8).toUpperCase()}`;

    const orderInsert = db.prepare(`INSERT INTO orders (
        id, reference, quote_id, lead_id, company_id, contact_id, status, currency,
        subtotal, discount, shipping, tax, total, payment_status, shipping_address, customer_notes, confirmed_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'PAYMENT_PENDING', ?, ?, ?, ?, ?, ?, 'UNPAID', ?, ?, CURRENT_TIMESTAMP)`)
      .bind(orderId, orderReference, quoteId,
        quote.lead_id ? String(quote.lead_id) : null,
        quote.company_id ? String(quote.company_id) : null,
        quote.contact_id ? String(quote.contact_id) : null,
        String(quote.currency || 'USD'), Number(quote.subtotal || 0), Number(quote.discount || 0),
        Number(quote.shipping || 0), Number(quote.tax || 0), Number(quote.total || 0),
        shippingAddress?JSON.stringify(shippingAddress):null,
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
    // Buyer confirmation, order items, quote conversion, payment follow-up
    // and staff audit are a single transaction. A late task/activity error
    // may not leave a real order created while the browser reports failure.
    const operationBatch:D1PreparedStatement[]=[orderInsert,...itemInserts,converted];
    if(quote.lead_id)operationBatch.push(
      db.prepare(`UPDATE leads SET status='NEGOTIATION',
        next_best_action='Confirm payment and fulfillment',
        next_action_at=datetime('now','+1 day'),updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .bind(String(quote.lead_id))
    );
    operationBatch.push(
      db.prepare(`INSERT INTO tasks
        (id,lead_id,company_id,contact_id,order_id,type,title,description,status,priority,due_at)
        VALUES (?,?,?,?,?,'PAYMENT',?,?,'OPEN','HIGH',datetime('now','+1 day'))`)
        .bind(crypto.randomUUID(),quote.lead_id||null,quote.company_id||null,
          quote.contact_id||null,orderId,`Confirm Stripe payment for ${orderReference}`,
          `Buyer accepted ${String(quote.reference)}. Only a verified Stripe Webhook confirms payment; do not mark PAID manually.`),
      db.prepare(`INSERT INTO activities
        (id,entity_type,entity_id,activity_type,title,description,metadata_json)
        VALUES (?,'ORDER',?,'QUOTE_ACCEPTED','Quote accepted and order created',?,?)`)
        .bind(crypto.randomUUID(),orderId,
          `${String(quote.reference)} accepted; ${orderReference} created`,
          JSON.stringify({quoteReference:quote.reference,orderReference}))
    );
    try {
      const committed=await db.batch(operationBatch);
      if(committed.length!==operationBatch.length||
         committed.some(row=>!row.success))throw Error('QUOTE_ACCEPTANCE_TRANSACTION_UNCONFIRMED');
    } catch (insertError) {
      // A separate request may have created this order first. Only return
      // the actual persisted order from that concurrent acceptance.
      const raced=await getOrder(db,quoteId);
      if(raced)return Response.json({ok:true,accepted:true,order:raced});
      throw insertError;
    }
    return Response.json({ ok: true, accepted: true, order: { id: orderId, reference: orderReference, status: 'PAYMENT_PENDING', payment_status: 'UNPAID' } }, { status: 201 });
  } catch (error) {
    console.error('public_quote_accept_failed', error);
    return Response.json({ ok: false, error: 'Unable to accept quote right now.' }, { status: 500 });
  }
};
