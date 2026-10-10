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

async function ensureTables(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS payment_provider_sessions (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'AIRWALLEX',
    provider_intent_id TEXT NOT NULL UNIQUE,
    request_id TEXT NOT NULL UNIQUE,
    amount REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    status TEXT NOT NULL DEFAULT 'REQUIRES_PAYMENT_METHOD',
    client_secret TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS payment_webhook_events (
    provider TEXT NOT NULL,
    event_id TEXT NOT NULL,
    event_name TEXT NOT NULL,
    received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at TEXT,
    PRIMARY KEY (provider, event_id)
  )`).run();
  await db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_reference_unique
    ON payments(provider, provider_reference)
    WHERE provider IS NOT NULL AND provider_reference IS NOT NULL`).run();
}

async function addActivity(db: D1Database, orderId: string, type: string, title: string, description: string, metadata: Record<string, unknown>) {
  await db.prepare(`INSERT INTO activities (id, entity_type, entity_id, activity_type, title, description, metadata_json)
    VALUES (?, 'ORDER', ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), orderId, type, title, description, JSON.stringify(metadata)).run();
}

async function markEventProcessed(db: D1Database, eventId: string) {
  await db.prepare(`UPDATE payment_webhook_events SET processed_at=CURRENT_TIMESTAMP WHERE provider='AIRWALLEX' AND event_id=?`)
    .bind(eventId).run();
}

function mappedStatus(eventName: string, objectStatus: unknown) {
  const apiStatus = String(objectStatus || '').toUpperCase();
  if (apiStatus) return apiStatus;
  const map: Record<string, string> = {
    'payment_intent.pending': 'PENDING',
    'payment_intent.pending_review': 'PENDING_REVIEW',
    'payment_intent.requires_customer_action': 'REQUIRES_CUSTOMER_ACTION',
    'payment_intent.requires_payment_method': 'REQUIRES_PAYMENT_METHOD',
    'payment_intent.payment_failed': 'PAYMENT_FAILED',
    'payment_intent.cancelled': 'CANCELLED',
    'payment_intent.succeeded': 'SUCCEEDED',
  };
  return map[eventName] || eventName.toUpperCase();
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

  const eventId = String(event.id || '').trim();
  const eventName = String(event.name || '').trim();
  if (!eventId || !eventName) return Response.json({ ok: true, ignored: true, reason: 'missing_event_identity' });

  const relevantEvents = new Set([
    'payment_intent.requires_payment_method',
    'payment_intent.requires_customer_action',
    'payment_intent.pending',
    'payment_intent.pending_review',
    'payment_intent.payment_failed',
    'payment_intent.cancelled',
    'payment_intent.succeeded',
  ]);

  try {
    const db = env.MINGEAGLE_DB;
    await ensureTables(db);

    await db.prepare(`INSERT OR IGNORE INTO payment_webhook_events(provider, event_id, event_name)
      VALUES ('AIRWALLEX', ?, ?)`).bind(eventId, eventName).run();
    const existingEvent = await db.prepare(`SELECT processed_at FROM payment_webhook_events WHERE provider='AIRWALLEX' AND event_id=?`)
      .bind(eventId).first<{ processed_at?: string }>();
    if (existingEvent?.processed_at) return Response.json({ ok: true, duplicate: true });

    if (!relevantEvents.has(eventName)) {
      await markEventProcessed(db, eventId);
      return Response.json({ ok: true, ignored: true });
    }

    const object = event.data?.object || {};
    const orderReference = String(object.merchant_order_id || '').trim();
    const providerReference = String(object.id || '').trim();
    const providerStatus = mappedStatus(eventName, object.status);
    const currency = String(object.currency || 'USD').toUpperCase();
    const captured = Number(object.captured_amount || 0);
    const amount = Number((captured > 0 ? captured : Number(object.amount || 0)).toFixed(2));

    if (!orderReference || !providerReference) {
      console.error('airwallex_webhook_missing_payment_fields', { eventId, orderReference, providerReference, eventName });
      await markEventProcessed(db, eventId);
      return Response.json({ ok: true, ignored: true, reason: 'missing_payment_fields' });
    }

    const order = await db.prepare(`SELECT id, reference, lead_id, company_id, contact_id, status, payment_status, total, currency
      FROM orders WHERE reference=? LIMIT 1`).bind(orderReference).first<Record<string, unknown>>();
    if (!order) {
      console.error('airwallex_webhook_order_not_found', { eventId, orderReference, providerReference });
      await markEventProcessed(db, eventId);
      return Response.json({ ok: true, ignored: true, reason: 'order_not_found' });
    }

    const orderId = String(order.id);
    const orderCurrency = String(order.currency || 'USD').toUpperCase();
    if (currency !== orderCurrency) {
      console.error('airwallex_webhook_currency_mismatch', { eventId, orderReference, currency, orderCurrency });
      await markEventProcessed(db, eventId);
      return Response.json({ ok: true, ignored: true, reason: 'currency_mismatch' });
    }

    // Only reconcile a signed provider event against a PaymentIntent that this
    // server created for this exact order. Merchant order metadata alone is not
    // sufficient to identify a payable transaction.
    const session = await db.prepare(`SELECT order_id, amount, currency FROM payment_provider_sessions
      WHERE provider='AIRWALLEX' AND provider_intent_id=? LIMIT 1`)
      .bind(providerReference).first<{ order_id:string; amount:number; currency:string }>();
    if (!session || String(session.order_id) !== orderId ||
        String(session.currency || '').toUpperCase() !== currency) {
      console.error('airwallex_webhook_unmatched_intent', { eventId, orderReference, providerReference });
      // Keep event unprocessed so legitimate out-of-order delivery can retry.
      return new Response('Unrecognized payment intent for order', { status: 409 });
    }
    if (eventName === 'payment_intent.succeeded' &&
        (!Number.isFinite(amount) || Math.abs(amount - Number(session.amount)) > 0.01)) {
      console.error('airwallex_webhook_amount_mismatch', { eventId, orderReference, providerReference });
      return new Response('Payment intent amount mismatch', { status: 409 });
    }

    await db.prepare(`UPDATE payment_provider_sessions\n      SET status=CASE WHEN status='SUCCEEDED' THEN status ELSE ? END, updated_at=CURRENT_TIMESTAMP\n      WHERE provider='AIRWALLEX' AND provider_intent_id=?`)
      .bind(providerStatus, providerReference).run();

    const metadata = { eventId, eventName, providerReference, providerStatus, amount, currency };

    if (eventName === 'payment_intent.succeeded') {
      if (amount <= 0) {
        console.error('airwallex_webhook_invalid_amount', metadata);
        return new Response('Invalid payment amount', { status: 500 });
      }

      const before = await db.prepare(`SELECT COALESCE(SUM(amount),0) AS received
        FROM payments WHERE order_id=? AND status='RECEIVED'`).bind(orderId).first<{ received: number }>();
      const beforeReceived = Number(before?.received || 0);

      const inserted = await db.prepare(`INSERT OR IGNORE INTO payments
        (id, order_id, method, provider, provider_reference, amount, currency, status, received_at, notes)
        VALUES (?, ?, 'ONLINE_PAYMENT', 'AIRWALLEX', ?, ?, ?, 'RECEIVED', CURRENT_TIMESTAMP, ?)`)
        .bind(
          crypto.randomUUID(), orderId, providerReference, amount, currency,
          `Airwallex payment_intent.succeeded · ${eventId}`,
        ).run();

      const totals = await db.prepare(`SELECT COALESCE(SUM(amount),0) AS received
        FROM payments WHERE order_id=? AND status='RECEIVED'`).bind(orderId).first<{ received: number }>();
      const receivedTotal = Number(totals?.received || 0);
      const orderTotal = Number(order.total || 0);
      const fullyPaid = receivedTotal + 0.005 >= orderTotal;
      const overpaid = receivedTotal > orderTotal + 0.005;
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
            ...metadata,
            receivedBefore: beforeReceived,
            receivedTotal,
            orderTotal,
          });
        }
        if (overpaid) {
          await db.prepare(`INSERT INTO tasks (id, lead_id, company_id, contact_id, order_id, type, title, description, status, priority, due_at)
            SELECT ?, ?, ?, ?, ?, 'PAYMENT', ?, ?, 'OPEN', 'URGENT', CURRENT_TIMESTAMP
            WHERE NOT EXISTS (
              SELECT 1 FROM tasks WHERE order_id=? AND type='PAYMENT' AND status IN ('OPEN','IN_PROGRESS') AND title LIKE 'Review overpayment%'
            )`)
            .bind(
              crypto.randomUUID(), leadId, companyId, contactId, orderId,
              `Review overpayment for ${orderReference}`,
              `${currency} ${receivedTotal.toFixed(2)} received against order total ${currency} ${orderTotal.toFixed(2)}. Review and refund any excess if required.`,
              orderId,
            ).run();
        }
      } else {
        await db.prepare(`UPDATE orders SET payment_status='PARTIAL', status='PAYMENT_PENDING', updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(orderId).run();
        await db.prepare(`UPDATE tasks SET description=?, updated_at=CURRENT_TIMESTAMP
          WHERE order_id=? AND type='PAYMENT' AND status IN ('OPEN','IN_PROGRESS')`)
          .bind(`Partial Airwallex payment received. ${currency} ${receivedTotal.toFixed(2)} of ${orderTotal.toFixed(2)} received.`, orderId).run();
        if (Number(inserted.meta?.changes || 0) > 0) {
          await addActivity(db, orderId, 'PAYMENT_PARTIAL', 'Partial Airwallex payment received', `${orderReference} received a partial online payment`, {
            ...metadata,
            receivedBefore: beforeReceived,
            receivedTotal,
            orderTotal,
          });
        }
      }

      await markEventProcessed(db, eventId);
      return Response.json({ ok: true, orderReference, paymentStatus: fullyPaid ? 'PAID' : 'PARTIAL' });
    }

    // Late/duplicate failure or pending notifications must not downgrade an already paid order.\n    if (String(order.payment_status) === 'PAID') {\n      await markEventProcessed(db, eventId);\n      return Response.json({ ok: true, ignored: true, reason: 'order_already_paid' });\n    }\n\n    if (eventName === 'payment_intent.pending' || eventName === 'payment_intent.pending_review') {
      await db.prepare(`UPDATE orders SET status='PAYMENT_PENDING', updated_at=CURRENT_TIMESTAMP WHERE id=? AND payment_status!='PAID'`).bind(orderId).run();
      await addActivity(db, orderId, 'PAYMENT_PENDING', 'Airwallex payment is processing', `${orderReference} payment is ${providerStatus.toLowerCase().replace(/_/g, ' ')}`, metadata);
    } else if (eventName === 'payment_intent.requires_customer_action') {
      await addActivity(db, orderId, 'PAYMENT_ACTION_REQUIRED', 'Customer action required for payment', `${orderReference} requires additional customer authentication or action`, metadata);
    } else if (eventName === 'payment_intent.payment_failed') {
      await addActivity(db, orderId, 'PAYMENT_FAILED', 'Airwallex payment failed', `${orderReference} payment attempt failed; customer may retry`, metadata);
      await db.prepare(`UPDATE tasks SET description=?, updated_at=CURRENT_TIMESTAMP
        WHERE order_id=? AND type='PAYMENT' AND status IN ('OPEN','IN_PROGRESS')`)
        .bind('Airwallex payment attempt failed. Customer can retry online payment or use bank transfer.', orderId).run();
    } else if (eventName === 'payment_intent.cancelled') {
      await addActivity(db, orderId, 'PAYMENT_CANCELLED', 'Airwallex payment cancelled', `${orderReference} payment intent was cancelled`, metadata);
    }

    await markEventProcessed(db, eventId);
    return Response.json({ ok: true, orderReference, paymentIntentStatus: providerStatus });
  } catch (error) {
    console.error('airwallex_webhook_processing_failed', error);
    return new Response('Webhook processing failed', { status: 500 });
  }
};
