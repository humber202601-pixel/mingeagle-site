interface Env {
  MINGEAGLE_DB: D1Database;
  GMAIL_CLIENT_ID?: string;
  GMAIL_CLIENT_SECRET?: string;
  GMAIL_REFRESH_TOKEN?: string;
  GMAIL_FROM?: string;
}

type OrderAction = 'MARK_PAID' | 'START_PROCESSING' | 'READY_TO_SHIP' | 'SHIP' | 'DELIVER' | 'COMPLETE';

type ActionInput = {
  orderReference?: string;
  action?: OrderAction;
  paymentMethod?: string;
  paymentReference?: string;
  amount?: number | string;
  carrier?: string;
  service?: string;
  trackingNumber?: string;
  trackingUrl?: string;
};

type EmailResult = { sent: boolean; skipped?: boolean; reason?: string; gmailMessageId?: string; to?: string; publicUrl?: string };

const clean = (value: unknown, max = 500) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const num = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const money = (value: unknown, currency = 'USD') => `${currency} ${Number(value || 0).toFixed(2)}`;

function base64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function encodedHeader(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `=?UTF-8?B?${btoa(binary)}?=`;
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function addActivity(db: D1Database, orderId: string, type: string, title: string, description: string, metadata: Record<string, unknown> = {}) {
  await db.prepare(`INSERT INTO activities (id, entity_type, entity_id, activity_type, title, description, metadata_json)
    VALUES (?, 'ORDER', ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), orderId, type, title, description, JSON.stringify(metadata)).run();
}

async function createSecureOrderUrl(db: D1Database, quoteId: string | null) {
  if (!quoteId) return null;
  await db.prepare(`CREATE TABLE IF NOT EXISTS quote_public_links (
    id TEXT PRIMARY KEY,
    quote_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at TEXT
  )`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_quote_public_links_quote ON quote_public_links(quote_id, created_at DESC)`).run();
  const token = `${crypto.randomUUID().replaceAll('-', '')}${crypto.randomUUID().replaceAll('-', '')}`;
  const hash = await sha256(token);
  await db.prepare(`INSERT INTO quote_public_links (id, quote_id, token_hash) VALUES (?, ?, ?)`)
    .bind(crypto.randomUUID(), quoteId, hash).run();
  return `https://app.mingeagle.com/quote/${token}`;
}

async function sendLifecycleEmail(
  env: Env,
  order: Record<string, unknown>,
  subject: string,
  bodyLines: string[],
  activityType: string,
): Promise<EmailResult> {
  const db = env.MINGEAGLE_DB;
  const contactId = order.contact_id ? String(order.contact_id) : null;
  const leadId = order.lead_id ? String(order.lead_id) : null;
  let contact: Record<string, unknown> | null = null;

  if (contactId) {
    contact = await db.prepare(`SELECT id, full_name, email, do_not_contact FROM contacts WHERE id=? LIMIT 1`).bind(contactId).first<Record<string, unknown>>();
  } else if (leadId) {
    contact = await db.prepare(`SELECT ct.id, ct.full_name, ct.email, ct.do_not_contact
      FROM leads l LEFT JOIN contacts ct ON ct.id=l.primary_contact_id WHERE l.id=? LIMIT 1`).bind(leadId).first<Record<string, unknown>>();
  }

  const to = clean(contact?.email, 320);
  if (!to || !to.includes('@')) return { sent: false, skipped: true, reason: 'Customer email is missing.' };
  if (Number(contact?.do_not_contact || 0) === 1) return { sent: false, skipped: true, reason: 'Contact is marked DO NOT CONTACT.' };

  const clientId = env.GMAIL_CLIENT_ID || '';
  const clientSecret = env.GMAIL_CLIENT_SECRET || '';
  const refreshToken = env.GMAIL_REFRESH_TOKEN || '';
  if (!clientId || !clientSecret || !refreshToken) return { sent: false, skipped: true, reason: 'Gmail OAuth is not fully configured.' };

  const publicUrl = await createSecureOrderUrl(db, order.quote_id ? String(order.quote_id) : null);
  const customerName = clean(contact?.full_name, 160) || 'there';
  const firstName = customerName.split(/\s+/)[0] || 'there';
  const body = [
    `Hi ${firstName},`,
    '',
    ...bodyLines,
    ...(publicUrl ? ['', 'You can review the latest order status here:', publicUrl] : []),
    '',
    'If you have any questions, simply reply to this email.',
    '',
    'Best regards,',
    'MING EAGLE',
  ].join('\n');

  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
    });
    const token = await tokenResponse.json() as { access_token?: string; error?: string; error_description?: string };
    if (!tokenResponse.ok || !token.access_token) throw new Error(token.error_description || token.error || 'Unable to refresh Gmail access token.');

    const from = clean(env.GMAIL_FROM || 'mingeaglecommerce@gmail.com', 320);
    const rawText = [
      `From: MING EAGLE <${from}>`,
      `To: ${to}`,
      `Subject: ${encodedHeader(subject)}`,
      `Reply-To: ${from}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      '',
      body,
    ].join('\r\n');

    const sendResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { authorization: `Bearer ${token.access_token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ raw: base64Url(new TextEncoder().encode(rawText)) }),
    });
    const sent = await sendResponse.json() as { id?: string; threadId?: string; error?: { message?: string } };
    if (!sendResponse.ok || !sent.id) throw new Error(sent.error?.message || 'Gmail API send failed.');

    await db.prepare(`INSERT INTO messages (id, lead_id, company_id, contact_id, channel, direction, subject, body, intent, sent_at)
      VALUES (?, ?, ?, ?, 'EMAIL', 'OUTBOUND', ?, ?, 'ORDER_UPDATE', CURRENT_TIMESTAMP)`)
      .bind(crypto.randomUUID(), leadId, order.company_id || null, contactId || contact?.id || null, subject, body).run();

    await addActivity(db, String(order.id), activityType, subject, `Automatic lifecycle email sent to ${to}`, {
      gmailMessageId: sent.id,
      gmailThreadId: sent.threadId || null,
      to,
      publicUrl,
    });
    return { sent: true, gmailMessageId: sent.id, to, publicUrl: publicUrl || undefined };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unable to send lifecycle email.';
    await addActivity(db, String(order.id), `${activityType}_FAILED`, 'Customer notification email failed', reason, { to, publicUrl });
    return { sent: false, reason, to, publicUrl: publicUrl || undefined };
  }
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.MINGEAGLE_DB) return Response.json({ ok: false, error: 'Database is not configured.' }, { status: 503 });

  try {
    const input = await request.json() as ActionInput;
    const orderReference = clean(input.orderReference, 120);
    const action = input.action;
    if (!orderReference || !action) return Response.json({ ok: false, error: 'Order reference and action are required.' }, { status: 400 });

    const db = env.MINGEAGLE_DB;
    const order = await db.prepare(`SELECT id, reference, quote_id, lead_id, company_id, contact_id, status, payment_status, total, currency
      FROM orders WHERE reference=? LIMIT 1`).bind(orderReference).first<Record<string, unknown>>();
    if (!order) return Response.json({ ok: false, error: 'Order not found.' }, { status: 404 });

    const orderId = String(order.id);
    const status = String(order.status);
    const paymentStatus = String(order.payment_status);
    const leadId = order.lead_id ? String(order.lead_id) : null;
    const companyId = order.company_id ? String(order.company_id) : null;
    const contactId = order.contact_id ? String(order.contact_id) : null;
    const currency = String(order.currency || 'USD');

    if (status === 'CANCELLED') return Response.json({ ok: false, error: 'Cancelled orders cannot be updated.' }, { status: 409 });

    if (action === 'MARK_PAID') {
      if (paymentStatus === 'PAID') return Response.json({ ok: true, unchanged: true, order: { reference: orderReference, status, payment_status: paymentStatus } });
      const total = Number(order.total || 0);
      const previous = await db.prepare(`SELECT COALESCE(SUM(amount),0) AS value FROM payments WHERE order_id=? AND status='RECEIVED'`)
        .bind(orderId).first<{ value: number }>();
      const receivedBefore = Number(previous?.value || 0);
      const outstanding = Math.max(0, total - receivedBefore);
      const amount = Math.max(0, num(input.amount, outstanding || total));
      const method = clean(input.paymentMethod, 120) || 'BANK_TRANSFER';
      const providerReference = clean(input.paymentReference, 240) || null;
      if (amount <= 0) return Response.json({ ok: false, error: 'Payment amount must be greater than zero.' }, { status: 400 });
      if (outstanding <= 0) return Response.json({ ok: false, error: 'This order has no outstanding balance.' }, { status: 409 });
      if (amount > outstanding + 0.005) {
        return Response.json({ ok: false, error: `Payment amount cannot exceed the outstanding balance ${currency} ${outstanding.toFixed(2)}.` }, { status: 409 });
      }

      await db.prepare(`INSERT INTO payments (id, order_id, method, provider_reference, amount, currency, status, received_at, notes)
        VALUES (?, ?, ?, ?, ?, ?, 'RECEIVED', CURRENT_TIMESTAMP, ?)`)
        .bind(crypto.randomUUID(), orderId, method, providerReference, amount, currency, `Payment confirmed for ${orderReference}`).run();

      const receivedTotal = receivedBefore + amount;
      const remaining = Math.max(0, total - receivedTotal);
      const fullyPaid = receivedTotal + 0.005 >= total;

      if (!fullyPaid) {
        await db.prepare(`UPDATE orders SET payment_status='PARTIAL', status='PAYMENT_PENDING', updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(orderId).run();
        await db.prepare(`UPDATE tasks SET description=?, updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND type='PAYMENT' AND status IN ('OPEN','IN_PROGRESS')`)
          .bind(`Partial payment received. ${currency} ${receivedTotal.toFixed(2)} of ${total.toFixed(2)} received.`, orderId).run();
        await addActivity(db, orderId, 'PAYMENT_PARTIAL', 'Partial payment received', `${orderReference} received a partial payment`, { amount, receivedTotal, total, method, providerReference });
        const email = await sendLifecycleEmail(env, order,
          `Payment received for MING EAGLE order ${orderReference}`,
          [
            `We have received your payment of ${money(amount, currency)} for order ${orderReference}.`,
            `Total received: ${money(receivedTotal, currency)}`,
            `Remaining balance: ${money(remaining, currency)}`,
            `Payment reference: PAY-${orderReference}`,
          ],
          'PAYMENT_EMAIL_SENT',
        );
        return Response.json({ ok: true, order: { reference: orderReference, status: 'PAYMENT_PENDING', payment_status: 'PARTIAL' }, payment: { amount, receivedTotal, outstanding: remaining }, email });
      }

      await db.prepare(`UPDATE orders SET payment_status='PAID', status='PAID', paid_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(orderId).run();
      await db.prepare(`UPDATE tasks SET status='DONE', completed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND type='PAYMENT' AND status IN ('OPEN','IN_PROGRESS')`).bind(orderId).run();
      await db.prepare(`INSERT INTO tasks (id, lead_id, company_id, contact_id, order_id, type, title, description, status, priority, due_at)
        VALUES (?, ?, ?, ?, ?, 'FULFILLMENT', ?, ?, 'OPEN', 'HIGH', datetime('now','+1 day'))`)
        .bind(crypto.randomUUID(), leadId, companyId, contactId, orderId, `Start processing ${orderReference}`, 'Payment completed. Prepare the order for fulfillment.').run();
      if (leadId) await db.prepare(`UPDATE leads SET status='WON', next_best_action='Start fulfillment', next_action_at=datetime('now','+1 day'), updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(leadId).run();
      if (companyId) await db.prepare(`UPDATE companies SET status='CUSTOMER', updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(companyId).run();
      await addActivity(db, orderId, 'PAYMENT_RECEIVED', 'Payment completed', `${orderReference} is fully paid`, { amount, receivedTotal, total, method, providerReference });
      const email = await sendLifecycleEmail(env, order,
        `Payment confirmed — MING EAGLE order ${orderReference}`,
        [
          `Thank you. We have received your payment for order ${orderReference}.`,
          `Amount received: ${money(amount, currency)}`,
          `Total received: ${money(receivedTotal, currency)}`,
          `Balance due: ${money(0, currency)}`,
          'Payment status: PAID IN FULL',
          '',
          'Your order will now move into processing.',
        ],
        'PAYMENT_EMAIL_SENT',
      );
      return Response.json({ ok: true, order: { reference: orderReference, status: 'PAID', payment_status: 'PAID' }, payment: { amount, receivedTotal, outstanding: 0 }, email });
    }

    if (action === 'START_PROCESSING') {
      if (paymentStatus !== 'PAID') return Response.json({ ok: false, error: 'Payment must be confirmed before processing.' }, { status: 409 });
      if (!['PAID','PROCESSING'].includes(status)) return Response.json({ ok: false, error: `Order cannot start processing from status ${status}.` }, { status: 409 });
      await db.prepare(`UPDATE orders SET status='PROCESSING', updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(orderId).run();
      await db.prepare(`UPDATE tasks SET status='DONE', completed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND type='FULFILLMENT' AND title LIKE 'Start processing%' AND status IN ('OPEN','IN_PROGRESS')`).bind(orderId).run();
      await db.prepare(`INSERT INTO tasks (id, lead_id, company_id, contact_id, order_id, type, title, description, status, priority, due_at)
        VALUES (?, ?, ?, ?, ?, 'FULFILLMENT', ?, ?, 'OPEN', 'MEDIUM', datetime('now','+2 days'))`)
        .bind(crypto.randomUUID(), leadId, companyId, contactId, orderId, `Prepare ${orderReference} for shipment`, 'Complete picking, packing and final shipment checks.').run();
      await addActivity(db, orderId, 'ORDER_PROCESSING', 'Order processing started', `${orderReference} moved to PROCESSING`);
      return Response.json({ ok: true, order: { reference: orderReference, status: 'PROCESSING', payment_status: paymentStatus } });
    }

    if (action === 'READY_TO_SHIP') {
      if (paymentStatus !== 'PAID') return Response.json({ ok: false, error: 'Payment must be confirmed before shipment.' }, { status: 409 });
      if (!['PAID','PROCESSING','READY_TO_SHIP'].includes(status)) return Response.json({ ok: false, error: `Order cannot be readied for shipment from status ${status}.` }, { status: 409 });
      await db.prepare(`UPDATE orders SET status='READY_TO_SHIP', updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(orderId).run();
      await db.prepare(`UPDATE tasks SET status='DONE', completed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND type='FULFILLMENT' AND status IN ('OPEN','IN_PROGRESS')`).bind(orderId).run();
      await db.prepare(`INSERT INTO tasks (id, lead_id, company_id, contact_id, order_id, type, title, description, status, priority, due_at)
        VALUES (?, ?, ?, ?, ?, 'FULFILLMENT', ?, ?, 'OPEN', 'HIGH', datetime('now','+1 day'))`)
        .bind(crypto.randomUUID(), leadId, companyId, contactId, orderId, `Ship ${orderReference}`, 'Add carrier and tracking number, then mark the order shipped.').run();
      await addActivity(db, orderId, 'READY_TO_SHIP', 'Order ready to ship', `${orderReference} moved to READY_TO_SHIP`);
      return Response.json({ ok: true, order: { reference: orderReference, status: 'READY_TO_SHIP', payment_status: paymentStatus } });
    }

    if (action === 'SHIP') {
      if (paymentStatus !== 'PAID') return Response.json({ ok: false, error: 'Payment must be confirmed before shipment.' }, { status: 409 });
      if (!['PAID','PROCESSING','READY_TO_SHIP','SHIPPED'].includes(status)) return Response.json({ ok: false, error: `Order cannot ship from status ${status}.` }, { status: 409 });
      const carrier = clean(input.carrier, 120);
      const service = clean(input.service, 120) || null;
      const trackingNumber = clean(input.trackingNumber, 240);
      const trackingUrl = clean(input.trackingUrl, 1000) || null;
      if (!carrier || !trackingNumber) return Response.json({ ok: false, error: 'Carrier and tracking number are required.' }, { status: 400 });
      if (trackingUrl && !/^https:\/\//i.test(trackingUrl)) return Response.json({ ok: false, error: 'Tracking URL must use https://.' }, { status: 400 });

      const existingShipment = await db.prepare(`SELECT id FROM shipments WHERE order_id=? ORDER BY created_at DESC LIMIT 1`).bind(orderId).first<{ id: string }>();
      if (existingShipment) {
        await db.prepare(`UPDATE shipments SET carrier=?, service=?, tracking_number=?, tracking_url=?, status='SHIPPED', shipped_at=COALESCE(shipped_at,CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP WHERE id=?`)
          .bind(carrier, service, trackingNumber, trackingUrl, existingShipment.id).run();
      } else {
        await db.prepare(`INSERT INTO shipments (id, order_id, carrier, service, tracking_number, tracking_url, status, shipped_at)
          VALUES (?, ?, ?, ?, ?, ?, 'SHIPPED', CURRENT_TIMESTAMP)`)
          .bind(crypto.randomUUID(), orderId, carrier, service, trackingNumber, trackingUrl).run();
      }
      await db.prepare(`UPDATE orders SET status='SHIPPED', updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(orderId).run();
      await db.prepare(`UPDATE tasks SET status='DONE', completed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND type='FULFILLMENT' AND status IN ('OPEN','IN_PROGRESS')`).bind(orderId).run();
      await db.prepare(`INSERT INTO tasks (id, lead_id, company_id, contact_id, order_id, type, title, description, status, priority, due_at)
        VALUES (?, ?, ?, ?, ?, 'DELIVERY_CHECK', ?, ?, 'OPEN', 'MEDIUM', datetime('now','+7 days'))`)
        .bind(crypto.randomUUID(), leadId, companyId, contactId, orderId, `Check delivery ${orderReference}`, `Verify delivery status for ${carrier} ${trackingNumber}.`).run();
      await addActivity(db, orderId, 'ORDER_SHIPPED', 'Order shipped', `${orderReference} shipped via ${carrier}`, { carrier, service, trackingNumber, trackingUrl });
      const email = await sendLifecycleEmail(env, order,
        `Your MING EAGLE order ${orderReference} has shipped`,
        [
          `Your order ${orderReference} has shipped.`,
          `Carrier: ${carrier}`,
          ...(service ? [`Service: ${service}`] : []),
          `Tracking number: ${trackingNumber}`,
          ...(trackingUrl ? [`Tracking: ${trackingUrl}`] : []),
        ],
        'SHIPMENT_EMAIL_SENT',
      );
      return Response.json({ ok: true, order: { reference: orderReference, status: 'SHIPPED', payment_status: paymentStatus }, shipment: { carrier, service, trackingNumber, trackingUrl, status: 'SHIPPED' }, email });
    }

    if (action === 'DELIVER') {
      if (!['SHIPPED','DELIVERED'].includes(status)) return Response.json({ ok: false, error: `Order cannot be delivered from status ${status}.` }, { status: 409 });
      const shipment = await db.prepare(`SELECT id, carrier, tracking_number FROM shipments WHERE order_id=? ORDER BY created_at DESC LIMIT 1`).bind(orderId).first<Record<string, unknown>>();
      if (!shipment) return Response.json({ ok: false, error: 'No shipment is attached to this order.' }, { status: 409 });
      await db.prepare(`UPDATE shipments SET status='DELIVERED', delivered_at=COALESCE(delivered_at,CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(String(shipment.id)).run();
      await db.prepare(`UPDATE orders SET status='DELIVERED', updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(orderId).run();
      await db.prepare(`UPDATE tasks SET status='DONE', completed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND type='DELIVERY_CHECK' AND status IN ('OPEN','IN_PROGRESS')`).bind(orderId).run();
      await db.prepare(`INSERT INTO tasks (id, lead_id, company_id, contact_id, order_id, type, title, description, status, priority, due_at)
        VALUES (?, ?, ?, ?, ?, 'REORDER', ?, ?, 'OPEN', 'MEDIUM', datetime('now','+45 days'))`)
        .bind(crypto.randomUUID(), leadId, companyId, contactId, orderId, `Reorder follow-up ${orderReference}`, 'Check customer satisfaction and ask about replenishment or a repeat order.').run();
      if (leadId) await db.prepare(`UPDATE leads SET next_best_action='Reorder follow-up', next_action_at=datetime('now','+45 days'), updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(leadId).run();
      await addActivity(db, orderId, 'ORDER_DELIVERED', 'Order delivered', `${orderReference} marked delivered`);
      const email = await sendLifecycleEmail(env, order,
        `Delivered — MING EAGLE order ${orderReference}`,
        [
          `Order ${orderReference} has been marked as delivered.`,
          ...(shipment.carrier ? [`Carrier: ${String(shipment.carrier)}`] : []),
          ...(shipment.tracking_number ? [`Tracking number: ${String(shipment.tracking_number)}`] : []),
          '',
          'We hope everything arrived in good condition. If there is any issue with your order, please reply to this email and we will help.',
        ],
        'DELIVERY_EMAIL_SENT',
      );
      return Response.json({ ok: true, order: { reference: orderReference, status: 'DELIVERED', payment_status: paymentStatus }, email });
    }

    if (action === 'COMPLETE') {
      if (!['DELIVERED','COMPLETED'].includes(status)) return Response.json({ ok: false, error: 'Only delivered orders can be completed.' }, { status: 409 });
      await db.prepare(`UPDATE orders SET status='COMPLETED', completed_at=COALESCE(completed_at,CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(orderId).run();
      await addActivity(db, orderId, 'ORDER_COMPLETED', 'Order completed', `${orderReference} moved to COMPLETED`);
      return Response.json({ ok: true, order: { reference: orderReference, status: 'COMPLETED', payment_status: paymentStatus } });
    }

    return Response.json({ ok: false, error: 'Unsupported order action.' }, { status: 400 });
  } catch (error) {
    console.error('order_action_failed', error);
    return Response.json({ ok: false, error: 'Unable to update the order.' }, { status: 500 });
  }
};