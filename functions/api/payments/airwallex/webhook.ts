interface Env {
  MINGEAGLE_DB: D1Database;
  AIRWALLEX_WEBHOOK_SECRET?: string;
}

type AirwallexEvent = {
  id?: string;
  name?: string;
  created_at?: string;
  data?: {
    object?: Record<string, unknown>;
  };
};

function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

async function validSignature(secret: string, timestamp: string, rawBody: string, signature: string) {
  if (!secret || !timestamp || !signature) return false;
  const timestampMs = Number(timestamp);
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 15 * 60_000) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}${rawBody}`));
  return constantTimeEqual(bytesToHex(digest).toLowerCase(), signature.trim().toLowerCase());
}

async function addActivity(db: D1Database, orderId: string, type: string, title: string, description: string, metadata: Record<string, unknown>) {
  await db.prepare(`INSERT INTO activities (id, entity_type, entity_id, activity_type, title, description, metadata_json)
    VALUES (?, 'ORDER', ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), orderId, type, title, description, JSON.stringify(metadata)).run();
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.MINGEAGLE_DB) return new Response('Database unavailable', { status: 503 });
  const secret = String(env.AIRWALLEX_WEBHOOK_SECRET || '').trim();
  if (!secret) return new Response('Webhook secret is not configured', { status: 503 });

  const rawBody = await request.text();
  const timestamp = request.headers.get('x-timestamp') || '';
  const signature = request.headers.get('x-signature') || '';
  if (!await validSignature(secret, timestamp, rawBody, signature)) {
    console.warn('airwallex_webhook_signature_invalid');
    return new Response('Invalid signature', { status: 401 });
  }

  let event: AirwallexEvent;
  try {
    event = JSON.parse(rawBody) as AirwallexEvent;
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  if (event.name !== 'payment_intent.succeeded') {
    return Response.json({ ok: true, ignored: true });
  }

  try {
    const object = event.data?.object || {};
    const orderReference = String(object.merchant_order_id || '').trim();
    const providerReference = String(object.id || '').trim();
    const currency = String(object.currency || 'USD').toUpperCase();
    const captured = Number(object.captured_amount || 0);
    const amount = Number((captured > 0 ? captured : Number(object.amount || 0)).toFixed(2));

    if (!orderReference || !providerReference || amount <= 0) {
      console.error('airwallex_webhook_missing_payment_fields', { eventId: event.id, orderReference, providerReference, amount });
      return Response.json({ ok: true, ignored: true, reason: 'missing_payment_fields' });
    }

    const db = env.MINGEAGLE_DB;
    const order = await db.prepare(`SELECT id, reference, lead_id, company_id, contact_id, status, payment_status, total, currency
      FROM orders WHERE reference=? LIMIT 1`).bind(orderReference).first<Record<string, unknown>>();
    if (!order) {
      console.error('airwallex_webhook_order_not_found', { eventId: event.id, orderReference, providerReference });
      return Response.json({ ok: true, ignored: true, reason: 'order_not_found' });
    }

    const orderId = String(order.id);
    const orderCurrency = String(order.currency || 'USD').toUpperCase();
    if (currency !== orderCurrency) {
      console.error('airwallex_webhook_currency_mismatch', { eventId: event.id, orderReference, currency, orderCurrency });
      return Response.json({ ok: true, ignored: true, reason: 'currency_mismatch' });
    }

    await db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_reference_unique
      ON payments(provider, provider_reference)
      WHERE provider IS NOT NULL AND provider_reference IS NOT NULL`).run();

    const inserted = await db.prepare(`INSERT OR IGNORE INTO payments
      (id, order_id, method, provider, provider_reference, amount, currency, status, received_at, notes)
      VALUES (?, ?, 'ONLINE_PAYMENT', 'AIRWALLEX', ?, ?, ?, 'RECEIVED', CURRENT_TIMESTAMP, ?)`)
      .bind(
        crypto.randomUUID(), orderId, providerReference, amount, currency,
        `Airwallex payment_intent.succeeded${event.id ? ` · ${event.id}` : ''}`,
      ).run();

    const totals = await db.prepare(`SELECT COALESCE(SUM(amount),0) AS received
      FROM payments WHERE order_id=? AND status='RECEIVED'`).bind(orderId).first<{ received: number }>();
    const receivedTotal = Number(totals?.received || 0);
    const orderTotal = Number(order.total || 0);
    const fullyPaid = receivedTotal + 0.005 >= orderTotal;
    const leadId = order.lead_id ? String(order.lead_id) : null;
    const companyId = order.company_id ? String(order.company_id) : null;
    const contactId = order.contact_id ? String(order.contact_id) : null;

    if (fullyPaid) {
      await db.prepare(`UPDATE orders
        SET payment_status='PAID',
            status=CASE WHEN status IN ('DRAFT','CONFIRMED','PAYMENT_PENDING') THEN 'PAID' ELSE status END,
            paid_at=COALESCE(paid_at,CURRENT_TIMESTAMP),
            updated_at=CURRENT_TIMESTAMP
        WHERE id=?`).bind(orderId).run();
      await db.prepare(`UPDATE tasks SET status='DONE', completed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
        WHERE order_id=? AND type='PAYMENT' AND status IN ('OPEN','IN_PROGRESS')`).bind(orderId).run();
      await db.prepare(`INSERT INTO tasks (id, lead_id, company_id, contact_id, order_id, type, title, description, status, priority, due_at)
        SELECT ?, ?, ?, ?, ?, 'FULFILLMENT', ?, ?, 'OPEN', 'HIGH', datetime('now','+1 day')
        WHERE NOT EXISTS (
          SELECT 1 FROM tasks WHERE order_id=? AND type='FULFILLMENT' AND status IN ('OPEN','IN_PROGRESS')
        )`)
        .bind(
          crypto.randomUUID(), leadId, companyId, contactId, orderId,
          `Start processing ${orderReference}`, 'Online payment completed through Airwallex. Prepare the order for fulfillment.', orderId,
        ).run();
      if (leadId) {
        await db.prepare(`UPDATE leads SET status='WON', next_best_action='Start fulfillment', next_action_at=datetime('now','+1 day'), updated_at=CURRENT_TIMESTAMP WHERE id=?`)
          .bind(leadId).run();
      }
      if (companyId) {
        await db.prepare(`UPDATE companies SET status='CUSTOMER', updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(companyId).run();
      }
      if (Number(inserted.meta?.changes || 0) > 0) {
        await addActivity(db, orderId, 'PAYMENT_RECEIVED', 'Airwallex payment completed', `${orderReference} is fully paid`, {
          eventId: event.id || null,
          providerReference,
          amount,
          currency,
          receivedTotal,
          orderTotal,
        });
      }
    } else {
      await db.prepare(`UPDATE orders SET payment_status='PARTIAL', status='PAYMENT_PENDING', updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(orderId).run();
      await db.prepare(`UPDATE tasks SET description=?, updated_at=CURRENT_TIMESTAMP
        WHERE order_id=? AND type='PAYMENT' AND status IN ('OPEN','IN_PROGRESS')`)
        .bind(`Partial Airwallex payment received. ${currency} ${receivedTotal.toFixed(2)} of ${orderTotal.toFixed(2)} received.`, orderId).run();
      if (Number(inserted.meta?.changes || 0) > 0) {
        await addActivity(db, orderId, 'PAYMENT_PARTIAL', 'Partial Airwallex payment received', `${orderReference} received a partial online payment`, {
          eventId: event.id || null,
          providerReference,
          amount,
          currency,
          receivedTotal,
          orderTotal,
        });
      }
    }

    return Response.json({ ok: true, orderReference, paymentStatus: fullyPaid ? 'PAID' : 'PARTIAL' });
  } catch (error) {
    console.error('airwallex_webhook_processing_failed', error);
    return new Response('Webhook processing failed', { status: 500 });
  }
};
