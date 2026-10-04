interface Env {
  MINGEAGLE_DB: D1Database;
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

const clean = (value: unknown, max = 500) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const num = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

async function addActivity(db: D1Database, orderId: string, type: string, title: string, description: string, metadata: Record<string, unknown> = {}) {
  await db.prepare(`INSERT INTO activities (id, entity_type, entity_id, activity_type, title, description, metadata_json)
    VALUES (?, 'ORDER', ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), orderId, type, title, description, JSON.stringify(metadata)).run();
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

    if (status === 'CANCELLED') return Response.json({ ok: false, error: 'Cancelled orders cannot be updated.' }, { status: 409 });

    if (action === 'MARK_PAID') {
      if (paymentStatus === 'PAID') return Response.json({ ok: true, unchanged: true, order: { reference: orderReference, status, payment_status: paymentStatus } });
      const amount = Math.max(0, num(input.amount, Number(order.total || 0)));
      const method = clean(input.paymentMethod, 120) || 'BANK_TRANSFER';
      const providerReference = clean(input.paymentReference, 240) || null;
      if (amount <= 0) return Response.json({ ok: false, error: 'Payment amount must be greater than zero.' }, { status: 400 });

      await db.prepare(`INSERT INTO payments (id, order_id, method, provider_reference, amount, currency, status, received_at, notes)
        VALUES (?, ?, ?, ?, ?, ?, 'RECEIVED', CURRENT_TIMESTAMP, ?)`)
        .bind(crypto.randomUUID(), orderId, method, providerReference, amount, String(order.currency || 'USD'), `Payment confirmed for ${orderReference}`).run();
      await db.prepare(`UPDATE orders SET payment_status='PAID', status='PAID', paid_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(orderId).run();
      await db.prepare(`UPDATE tasks SET status='DONE', completed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND type='PAYMENT' AND status IN ('OPEN','IN_PROGRESS')`).bind(orderId).run();
      await db.prepare(`INSERT INTO tasks (id, lead_id, company_id, contact_id, order_id, type, title, description, status, priority, due_at)
        VALUES (?, ?, ?, ?, ?, 'FULFILLMENT', ?, ?, 'OPEN', 'HIGH', datetime('now','+1 day'))`)
        .bind(crypto.randomUUID(), leadId, companyId, contactId, orderId, `Start processing ${orderReference}`, 'Payment received. Prepare the order for fulfillment.').run();
      if (leadId) await db.prepare(`UPDATE leads SET status='WON', next_best_action='Start fulfillment', next_action_at=datetime('now','+1 day'), updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(leadId).run();
      if (companyId) await db.prepare(`UPDATE companies SET status='CUSTOMER', updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(companyId).run();
      await addActivity(db, orderId, 'PAYMENT_RECEIVED', 'Payment received', `${orderReference} marked paid`, { amount, method, providerReference });
      return Response.json({ ok: true, order: { reference: orderReference, status: 'PAID', payment_status: 'PAID' } });
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
      return Response.json({ ok: true, order: { reference: orderReference, status: 'SHIPPED', payment_status: paymentStatus }, shipment: { carrier, service, trackingNumber, trackingUrl, status: 'SHIPPED' } });
    }

    if (action === 'DELIVER') {
      if (!['SHIPPED','DELIVERED'].includes(status)) return Response.json({ ok: false, error: `Order cannot be delivered from status ${status}.` }, { status: 409 });
      const shipment = await db.prepare(`SELECT id FROM shipments WHERE order_id=? ORDER BY created_at DESC LIMIT 1`).bind(orderId).first<{ id: string }>();
      if (!shipment) return Response.json({ ok: false, error: 'No shipment is attached to this order.' }, { status: 409 });
      await db.prepare(`UPDATE shipments SET status='DELIVERED', delivered_at=COALESCE(delivered_at,CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(shipment.id).run();
      await db.prepare(`UPDATE orders SET status='DELIVERED', updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(orderId).run();
      await db.prepare(`UPDATE tasks SET status='DONE', completed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND type='DELIVERY_CHECK' AND status IN ('OPEN','IN_PROGRESS')`).bind(orderId).run();
      await db.prepare(`INSERT INTO tasks (id, lead_id, company_id, contact_id, order_id, type, title, description, status, priority, due_at)
        VALUES (?, ?, ?, ?, ?, 'REORDER', ?, ?, 'OPEN', 'MEDIUM', datetime('now','+45 days'))`)
        .bind(crypto.randomUUID(), leadId, companyId, contactId, orderId, `Reorder follow-up ${orderReference}`, 'Check customer satisfaction and ask about replenishment or a repeat order.').run();
      if (leadId) await db.prepare(`UPDATE leads SET next_best_action='Reorder follow-up', next_action_at=datetime('now','+45 days'), updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(leadId).run();
      await addActivity(db, orderId, 'ORDER_DELIVERED', 'Order delivered', `${orderReference} marked delivered`);
      return Response.json({ ok: true, order: { reference: orderReference, status: 'DELIVERED', payment_status: paymentStatus } });
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
