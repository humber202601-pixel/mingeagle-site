import {QUOTE_PUBLIC_TOKEN_PREDICATE} from '../../../../lib/quote-public-token';
interface Env {
  MINGEAGLE_DB: D1Database;
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}


export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.MINGEAGLE_DB) return Response.json({ ok: false, error: 'Database is not configured.' }, { status: 503 });
  const token = new URL(request.url).searchParams.get('token') || '';
  if (!/^[a-f0-9]{60,80}$/i.test(token)) return Response.json({ ok: false, error: 'Invalid token.' }, { status: 400 });

  try {
    const db = env.MINGEAGLE_DB;
    const hash = await sha256(token);
    const order = await db.prepare(`SELECT
        o.id, o.reference, o.status, o.payment_status, o.total, o.currency,
        (SELECT COALESCE(SUM(p.amount),0) FROM payments p WHERE p.order_id=o.id AND p.status='RECEIVED') AS amount_received,
        (SELECT pps.status FROM payment_provider_sessions pps WHERE pps.order_id=o.id AND pps.provider='AIRWALLEX' ORDER BY datetime(pps.updated_at) DESC, datetime(pps.created_at) DESC LIMIT 1) AS provider_status,
        (SELECT pps.updated_at FROM payment_provider_sessions pps WHERE pps.order_id=o.id AND pps.provider='AIRWALLEX' ORDER BY datetime(pps.updated_at) DESC, datetime(pps.created_at) DESC LIMIT 1) AS provider_updated_at
      FROM quotes q
      JOIN orders o ON o.quote_id=q.id
      WHERE ${QUOTE_PUBLIC_TOKEN_PREDICATE}
      ORDER BY datetime(o.created_at) DESC
      LIMIT 1`).bind(hash, hash).first<Record<string, unknown>>();

    if (!order) return Response.json({ ok: false, error: 'Order not found.' }, { status: 404 });
    const total = Number(order.total || 0);
    const received = Number(order.amount_received || 0);
    return Response.json({
      ok: true,
      orderReference: String(order.reference || ''),
      orderStatus: String(order.status || ''),
      paymentStatus: String(order.payment_status || ''),
      providerStatus: String(order.provider_status || ''),
      providerUpdatedAt: order.provider_updated_at || null,
      currency: String(order.currency || 'USD'),
      total,
      received,
      outstanding: Math.max(0, Number((total - received).toFixed(2))),
    }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    console.error('airwallex_payment_status_failed', error);
    return Response.json({ ok: false, error: 'Unable to load payment status.' }, { status: 500 });
  }
};
