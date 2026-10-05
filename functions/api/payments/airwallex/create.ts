import { airwallexApiBase, airwallexSdkEnv, getAirwallexAccessToken, type AirwallexEnv } from '../../../_shared/airwallex';

interface Env extends AirwallexEnv {
  MINGEAGLE_DB: D1Database;
}

type Row = Record<string, unknown>;

type PaymentSession = {
  provider_intent_id?: string;
  request_id?: string;
  amount?: number;
  currency?: string;
  status?: string;
  client_secret?: string;
  updated_at?: string;
};

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function ensureTables(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS quote_public_links (
    id TEXT PRIMARY KEY,
    quote_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at TEXT
  )`).run();
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
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_payment_provider_sessions_order
    ON payment_provider_sessions(order_id, created_at DESC)`).run();
}

async function findOrderFromQuoteToken(db: D1Database, token: string) {
  await ensureTables(db);
  const hash = await sha256(token);
  return db.prepare(`SELECT
      o.id, o.reference, o.status, o.payment_status, o.total, o.currency,
      q.id AS quote_id, q.reference AS quote_reference,
      COALESCE(ct.email, '') AS contact_email,
      COALESCE(ct.full_name, '') AS contact_name,
      (SELECT COALESCE(SUM(p.amount),0) FROM payments p WHERE p.order_id=o.id AND p.status='RECEIVED') AS amount_received
    FROM quotes q
    JOIN orders o ON o.quote_id=q.id
    LEFT JOIN contacts ct ON ct.id=o.contact_id
    WHERE q.public_token_hash=?
       OR EXISTS (
         SELECT 1 FROM quote_public_links qpl
         WHERE qpl.quote_id=q.id AND qpl.token_hash=? AND qpl.revoked_at IS NULL
       )
    ORDER BY o.created_at DESC
    LIMIT 1`).bind(hash, hash).first<Row>();
}

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return {};
  if (parts.length === 1) return { first_name: parts[0] };
  return { first_name: parts[0], last_name: parts.slice(1).join(' ') };
}

async function latestReusableSession(db: D1Database, orderId: string, amount: number, currency: string) {
  return db.prepare(`SELECT provider_intent_id, request_id, amount, currency, status, client_secret, updated_at
    FROM payment_provider_sessions
    WHERE order_id=? AND provider='AIRWALLEX' AND amount=? AND currency=?
      AND datetime(updated_at) >= datetime('now','-2 hours')
      AND status IN ('REQUIRES_PAYMENT_METHOD','REQUIRES_CUSTOMER_ACTION','PENDING','PENDING_REVIEW')
    ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC
    LIMIT 1`).bind(orderId, amount, currency).first<PaymentSession>();
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.MINGEAGLE_DB) return Response.json({ ok: false, error: 'Database is not configured.' }, { status: 503 });
  if (!env.AIRWALLEX_CLIENT_ID || !env.AIRWALLEX_API_KEY) {
    return Response.json({ ok: false, error: 'Airwallex checkout is not configured yet.' }, { status: 503 });
  }

  const originHeader = request.headers.get('origin');
  const requestOrigin = new URL(request.url).origin;
  if (originHeader && originHeader !== requestOrigin) {
    return Response.json({ ok: false, error: 'Invalid request origin.' }, { status: 403 });
  }

  try {
    const input = await request.json().catch(() => ({})) as { token?: string };
    const token = String(input.token || '').trim();
    if (!/^[a-f0-9]{60,80}$/i.test(token)) {
      return Response.json({ ok: false, error: 'Secure quote token is invalid.' }, { status: 400 });
    }

    const db = env.MINGEAGLE_DB;
    const order = await findOrderFromQuoteToken(db, token);
    if (!order) return Response.json({ ok: false, error: 'Order not found for this quote.' }, { status: 404 });
    if (String(order.status) === 'CANCELLED') return Response.json({ ok: false, error: 'This order has been cancelled.' }, { status: 409 });

    const total = Number(order.total || 0);
    const received = Number(order.amount_received || 0);
    const outstanding = Math.max(0, total - received);
    if (String(order.payment_status) === 'PAID' || outstanding <= 0.005) {
      return Response.json({ ok: false, error: 'This order is already paid in full.' }, { status: 409 });
    }

    const origin = new URL(request.url).origin;
    const successUrl = `${origin}/quote/${encodeURIComponent(token)}?payment_return=1`;
    const orderReference = String(order.reference);
    const orderId = String(order.id);
    const currency = String(order.currency || 'USD').toUpperCase();
    const amount = Number(outstanding.toFixed(2));
    const fullName = String(order.contact_name || '').trim();
    const email = String(order.contact_email || '').trim();

    const reusable = await latestReusableSession(db, orderId, amount, currency);
    if (reusable?.provider_intent_id) {
      const status = String(reusable.status || 'REQUIRES_PAYMENT_METHOD').toUpperCase();
      if (['PENDING','PENDING_REVIEW'].includes(status)) {
        return Response.json({
          ok: true,
          pending: true,
          status,
          intentId: reusable.provider_intent_id,
          currency,
          amount,
          orderReference,
        });
      }
      if (reusable.client_secret) {
        return Response.json({
          ok: true,
          reused: true,
          intentId: reusable.provider_intent_id,
          clientSecret: reusable.client_secret,
          currency,
          amount,
          orderReference,
          sdkEnv: airwallexSdkEnv(env),
          countryCode: 'US',
          successUrl,
          shopperEmail: email || undefined,
          shopperName: fullName || undefined,
        });
      }
    }

    const requestId = crypto.randomUUID();
    const accessToken = await getAirwallexAccessToken(env);
    const apiBase = airwallexApiBase(env);
    const customer = email || fullName ? { email: email || undefined, ...splitName(fullName) } : undefined;

    const response = await fetch(`${apiBase}/api/v1/pa/payment_intents/create`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        request_id: requestId,
        amount,
        currency,
        merchant_order_id: orderReference,
        return_url: successUrl,
        merchant_website_url: 'https://www.mingeagle.com/',
        customer,
        descriptor: 'MING EAGLE',
        metadata: {
          order_reference: orderReference,
          quote_reference: String(order.quote_reference || ''),
          payment_reference: `PAY-${orderReference}`,
          source: 'MING_EAGLE_SECURE_QUOTE',
        },
      }),
    });

    const body = await response.json().catch(() => ({})) as {
      id?: string;
      client_secret?: string;
      status?: string;
      message?: string;
      code?: string;
      error?: string;
    };
    if (!response.ok || !body.id || !body.client_secret) {
      const reason = body.message || body.error || body.code || `Airwallex PaymentIntent failed (${response.status}).`;
      console.error('airwallex_payment_intent_failed', { status: response.status, reason, orderReference });
      return Response.json({ ok: false, error: reason }, { status: 502 });
    }

    const providerStatus = String(body.status || 'REQUIRES_PAYMENT_METHOD').toUpperCase();
    await db.prepare(`INSERT INTO payment_provider_sessions
      (id, order_id, provider, provider_intent_id, request_id, amount, currency, status, client_secret)
      VALUES (?, ?, 'AIRWALLEX', ?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), orderId, body.id, requestId, amount, currency, providerStatus, body.client_secret).run();

    await db.prepare(`INSERT INTO activities (id, entity_type, entity_id, activity_type, title, description, metadata_json)
      VALUES (?, 'ORDER', ?, 'AIRWALLEX_CHECKOUT_STARTED', 'Airwallex checkout started', ?, ?)`)
      .bind(
        crypto.randomUUID(), orderId,
        `${orderReference} checkout created for ${currency} ${amount.toFixed(2)}`,
        JSON.stringify({ paymentIntentId: body.id, amount, currency, requestId, status: providerStatus }),
      ).run();

    return Response.json({
      ok: true,
      intentId: body.id,
      clientSecret: body.client_secret,
      currency,
      amount,
      orderReference,
      sdkEnv: airwallexSdkEnv(env),
      countryCode: 'US',
      successUrl,
      shopperEmail: email || undefined,
      shopperName: fullName || undefined,
    });
  } catch (error) {
    console.error('airwallex_checkout_create_failed', error);
    return Response.json({ ok: false, error: error instanceof Error ? error.message : 'Unable to start secure payment.' }, { status: 500 });
  }
};
