interface Env { MINGEAGLE_DB: D1Database }

type Input = {
  sampleId?: string;
  status?: string;
  shippingAddress?: string;
  carrier?: string;
  trackingNumber?: string;
  costAmount?: number | string | null;
  currency?: string;
};

type Row = Record<string, unknown>;

const clean = (value: unknown, max = 1000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const allowedStatus = new Set(['REQUESTED','APPROVED','PAYMENT_PENDING','PREPARING','SHIPPED','DELIVERED','FOLLOW_UP','CONVERTED','CLOSED']);

function followUpExpression(status: string) {
  if (status === 'SHIPPED') return '+7 days';
  if (status === 'DELIVERED') return '+3 days';
  if (status === 'FOLLOW_UP') return '+1 day';
  return '';
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  if (!env.MINGEAGLE_DB) return Response.json({ ok:false, error:'Database is not configured.' }, { status:503 });
  try {
    const rows = await env.MINGEAGLE_DB.prepare(`SELECT
      s.id, s.reference, s.lead_id, s.inquiry_id, s.company_id, s.contact_id, s.product_id,
      s.quantity, s.status, s.shipping_address, s.carrier, s.tracking_number, s.cost_amount, s.currency,
      s.follow_up_at, s.created_at, s.updated_at,
      COALESCE(c.name, ct.full_name, ct.email, 'Unknown customer') AS customer,
      ct.email, ct.phone, ct.whatsapp,
      l.status AS lead_status
      FROM samples s
      LEFT JOIN leads l ON l.id=s.lead_id
      LEFT JOIN companies c ON c.id=s.company_id
      LEFT JOIN contacts ct ON ct.id=s.contact_id
      ORDER BY CASE s.status WHEN 'REQUESTED' THEN 0 WHEN 'APPROVED' THEN 1 WHEN 'PAYMENT_PENDING' THEN 2 WHEN 'PREPARING' THEN 3 WHEN 'SHIPPED' THEN 4 WHEN 'DELIVERED' THEN 5 WHEN 'FOLLOW_UP' THEN 6 ELSE 7 END,
        datetime(s.updated_at) DESC
      LIMIT 200`).all<Row>();
    return Response.json({ ok:true, samples:rows.results });
  } catch (error) {
    console.error('samples_load_failed', error);
    return Response.json({ ok:false, error:'Unable to load sample requests.' }, { status:500 });
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.MINGEAGLE_DB) return Response.json({ ok:false, error:'Database is not configured.' }, { status:503 });
  try {
    const input = await request.json() as Input;
    const sampleId = clean(input.sampleId, 120);
    if (!sampleId) return Response.json({ ok:false, error:'sampleId is required.' }, { status:400 });

    const db = env.MINGEAGLE_DB;
    const current = await db.prepare(`SELECT * FROM samples WHERE id=? LIMIT 1`).bind(sampleId).first<Row>();
    if (!current) return Response.json({ ok:false, error:'Sample request not found.' }, { status:404 });

    const requestedStatus = clean(input.status, 40).toUpperCase();
    const status = requestedStatus ? requestedStatus : String(current.status || 'REQUESTED');
    if (!allowedStatus.has(status)) return Response.json({ ok:false, error:'Unsupported sample status.' }, { status:400 });

    const shippingAddress = input.shippingAddress === undefined ? clean(current.shipping_address, 1000) : clean(input.shippingAddress, 1000);
    const carrier = input.carrier === undefined ? clean(current.carrier, 160) : clean(input.carrier, 160);
    const trackingNumber = input.trackingNumber === undefined ? clean(current.tracking_number, 200) : clean(input.trackingNumber, 200);
    const currency = clean(input.currency === undefined ? current.currency : input.currency, 10).toUpperCase() || 'USD';
    let costAmount: number | null = current.cost_amount === null || current.cost_amount === undefined ? null : Number(current.cost_amount);
    if (input.costAmount !== undefined) {
      const parsed = Number(input.costAmount);
      costAmount = Number.isFinite(parsed) && parsed >= 0 ? Number(parsed.toFixed(2)) : null;
    }
    const followExpr = followUpExpression(status);

    await db.prepare(`UPDATE samples SET
      status=?, shipping_address=?, carrier=?, tracking_number=?, cost_amount=?, currency=?,
      follow_up_at=CASE WHEN ?<>'' THEN datetime('now', ?) ELSE follow_up_at END,
      updated_at=CURRENT_TIMESTAMP
      WHERE id=?`)
      .bind(status, shippingAddress || null, carrier || null, trackingNumber || null, costAmount, currency, followExpr, followExpr, sampleId).run();

    const leadId = current.lead_id ? String(current.lead_id) : '';
    if (leadId) {
      if (status === 'CONVERTED') {
        await db.prepare(`UPDATE leads SET status='INTERESTED', next_best_action='Prepare wholesale quote after sample conversion', next_action_at=datetime('now','+1 day'), updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(leadId).run();
      } else if (status !== 'CLOSED') {
        const nextAction = status === 'DELIVERED' || status === 'FOLLOW_UP'
          ? `Follow up sample feedback · ${String(current.reference)}`
          : `Manage sample request · ${String(current.reference)} · ${status}`;
        await db.prepare(`UPDATE leads SET status='SAMPLE', next_best_action=?, next_action_at=CASE WHEN ?<>'' THEN datetime('now', ?) ELSE next_action_at END, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
          .bind(nextAction, followExpr, followExpr, leadId).run();
      }

      await db.prepare(`INSERT INTO activities (id, entity_type, entity_id, activity_type, title, description, metadata_json)
        VALUES (?, 'LEAD', ?, 'SAMPLE_UPDATED', 'Sample request updated', ?, ?)`)
        .bind(
          crypto.randomUUID(), leadId,
          `${String(current.reference)} · ${status}`,
          JSON.stringify({ sampleId, reference:current.reference, status, carrier:carrier || null, trackingNumber:trackingNumber || null, costAmount, currency }),
        ).run();
    }

    return Response.json({ ok:true, sampleId, reference:String(current.reference), status });
  } catch (error) {
    console.error('samples_update_failed', error);
    return Response.json({ ok:false, error:error instanceof Error ? error.message : 'Unable to update sample request.' }, { status:500 });
  }
};