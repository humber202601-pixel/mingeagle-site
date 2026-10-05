interface Env {
  MINGEAGLE_DB: D1Database;
  GMAIL_CLIENT_ID?: string;
  GMAIL_CLIENT_SECRET?: string;
  GMAIL_REFRESH_TOKEN?: string;
  GMAIL_FROM?: string;
}

type Input = { quoteId?: string; sendEmail?: boolean };

type QuoteRow = {
  id: string;
  reference: string;
  status: string;
  lead_id: string | null;
  company_id: string | null;
  contact_id: string | null;
  valid_until: string | null;
  total: number;
  currency: string | null;
  public_token_hash: string | null;
  contact_email: string | null;
  contact_name: string | null;
  company_name: string | null;
  do_not_contact: number | null;
  lead_status: string | null;
};

const clean = (value: unknown, max = 1000) => typeof value === 'string' ? value.trim().slice(0, max) : '';

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function ensureQuoteLinks(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS quote_public_links (
    id TEXT PRIMARY KEY,
    quote_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at TEXT
  )`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_quote_public_links_quote ON quote_public_links(quote_id, created_at DESC)`).run();
}

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

function money(value: unknown, currency: unknown) {
  return `${String(currency || 'USD')} ${Number(value || 0).toFixed(2)}`;
}

function greeting(quote: QuoteRow) {
  const name = clean(quote.contact_name, 120);
  if (name && !name.includes('@')) {
    const first = name.split(/\s+/)[0].replace(/[^A-Za-z'’-]/g, '');
    if (first) return `Hi ${first},`;
  }
  const company = clean(quote.company_name, 160);
  return company ? `Hello ${company} team,` : 'Hello,';
}

async function refreshGmailToken(env: Env) {
  const clientId = env.GMAIL_CLIENT_ID || '';
  const clientSecret = env.GMAIL_CLIENT_SECRET || '';
  const refreshToken = env.GMAIL_REFRESH_TOKEN || '';
  if (!clientId || !clientSecret || !refreshToken) throw new Error('Gmail OAuth is not fully configured.');

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
  });
  const body = await response.json() as { access_token?: string; error?: string; error_description?: string };
  if (!response.ok || !body.access_token) throw new Error(body.error_description || body.error || 'Unable to refresh Gmail access token.');
  return body.access_token;
}

async function sendQuoteEmail(env: Env, quote: QuoteRow, url: string) {
  const to = clean(quote.contact_email, 320);
  if (!to || !to.includes('@')) throw new Error('This customer does not have a valid email address.');
  if (Number(quote.do_not_contact || 0) === 1 || quote.lead_status === 'DO_NOT_CONTACT') {
    throw new Error('This contact is marked DO NOT CONTACT.');
  }

  const token = await refreshGmailToken(env);
  const from = clean(env.GMAIL_FROM || 'mingeaglecommerce@gmail.com', 320);
  const subject = `MING EAGLE quotation ${quote.reference}`;
  const body = `${greeting(quote)}\n\nThank you for your interest in MING EAGLE. We prepared quotation ${quote.reference} for your review.\n\nQuotation total: ${money(quote.total, quote.currency)}\n\nPlease review the full quotation and terms here:\n${url}\n\nIf you have any questions about quantity, shipping, lead time or payment terms, just reply to this email and I will help update the quotation.\n\nBest regards,\nMING EAGLE\nwww.mingeagle.com`;
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

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ raw: base64Url(new TextEncoder().encode(rawText)) }),
  });
  const sent = await response.json() as { id?: string; threadId?: string; error?: { message?: string } };
  if (!response.ok || !sent.id) throw new Error(sent.error?.message || 'Gmail API send failed.');
  return { to, subject, body, gmailMessageId: sent.id, gmailThreadId: sent.threadId || null };
}

async function upsertQuoteFollowUpTask(db: D1Database, quote: QuoteRow) {
  if (!quote.lead_id) return;
  const existing = await db.prepare(`SELECT id FROM tasks WHERE lead_id=? AND type='QUOTE_FOLLOW_UP' AND status IN ('OPEN','IN_PROGRESS') LIMIT 1`)
    .bind(quote.lead_id).first<{ id: string }>();
  const title = `Follow up quote ${quote.reference}`;
  const description = `Quotation ${quote.reference} was emailed to the customer. Follow up if the customer has not replied or viewed it.`;
  if (existing?.id) {
    await db.prepare(`UPDATE tasks SET title=?, description=?, priority='HIGH', due_at=datetime('now','+3 days'), updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(title, description, existing.id).run();
    return;
  }
  await db.prepare(`INSERT INTO tasks (id, lead_id, company_id, contact_id, type, title, description, status, priority, due_at)
    VALUES (?, ?, ?, ?, 'QUOTE_FOLLOW_UP', ?, ?, 'OPEN', 'HIGH', datetime('now','+3 days'))`)
    .bind(crypto.randomUUID(), quote.lead_id, quote.company_id, quote.contact_id, title, description).run();
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.MINGEAGLE_DB) return Response.json({ ok: false, error: 'Database is not configured.' }, { status: 503 });

  try {
    const { quoteId = '', sendEmail = false } = await request.json() as Input;
    if (!quoteId) return Response.json({ ok: false, error: 'Quote id is required.' }, { status: 400 });

    const db = env.MINGEAGLE_DB;
    await ensureQuoteLinks(db);

    const quote = await db.prepare(`SELECT
      q.id, q.reference, q.status, q.lead_id, q.company_id, q.contact_id, q.valid_until, q.total, q.currency, q.public_token_hash,
      ct.email AS contact_email, ct.full_name AS contact_name, COALESCE(c.name,'') AS company_name,
      COALESCE(ct.do_not_contact,0) AS do_not_contact, l.status AS lead_status
      FROM quotes q
      LEFT JOIN contacts ct ON ct.id=q.contact_id
      LEFT JOIN companies c ON c.id=q.company_id
      LEFT JOIN leads l ON l.id=q.lead_id
      WHERE q.id = ? LIMIT 1`).bind(quoteId).first<QuoteRow>();

    if (!quote) return Response.json({ ok: false, error: 'Quote not found.' }, { status: 404 });
    if (['ACCEPTED','CONVERTED','DECLINED','EXPIRED'].includes(quote.status)) {
      return Response.json({ ok: false, error: `Quote cannot be sent from status ${quote.status}.` }, { status: 409 });
    }

    const pricedItems = await db.prepare(`SELECT COUNT(*) AS value
      FROM quote_items WHERE quote_id=? AND quantity > 0 AND unit_price > 0 AND line_total > 0`)
      .bind(quote.id).first<{ value: number }>();

    if (Number(quote.total || 0) <= 0 || Number(pricedItems?.value || 0) <= 0) {
      return Response.json({
        ok: false,
        error: 'Quote has no valid price. Enter a unit price greater than 0 and review the total before generating a customer link.',
      }, { status: 409 });
    }

    if (quote.public_token_hash) {
      await db.prepare(`INSERT OR IGNORE INTO quote_public_links (id, quote_id, token_hash)
        VALUES (?, ?, ?)`)
        .bind(crypto.randomUUID(), quote.id, quote.public_token_hash).run();
    }

    const token = `${crypto.randomUUID().replaceAll('-', '')}${crypto.randomUUID().replaceAll('-', '')}`;
    const tokenHash = await sha256(token);
    const linkId = crypto.randomUUID();
    const publicPath = `/quote/${token}`;
    const absoluteUrl = `${new URL(request.url).origin}${publicPath}`;

    await db.prepare(`INSERT INTO quote_public_links (id, quote_id, token_hash)
      VALUES (?, ?, ?)`)
      .bind(linkId, quote.id, tokenHash).run();

    let emailResult: Awaited<ReturnType<typeof sendQuoteEmail>> | null = null;
    if (sendEmail) {
      try {
        emailResult = await sendQuoteEmail(env, quote, absoluteUrl);
      } catch (error) {
        await db.prepare(`UPDATE quote_public_links SET revoked_at=CURRENT_TIMESTAMP WHERE id=?`).bind(linkId).run().catch(() => undefined);
        const message = error instanceof Error ? error.message : 'Unable to send quotation email.';
        return Response.json({ ok: false, error: message }, { status: 502 });
      }
    }

    await db.prepare(`UPDATE quotes
      SET status='SENT', public_token_hash=?, sent_at=COALESCE(sent_at,CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP
      WHERE id=?`).bind(tokenHash, quote.id).run();

    if (quote.lead_id) {
      await db.prepare(`UPDATE leads SET status='QUOTE', last_contact_at=CASE WHEN ?=1 THEN CURRENT_TIMESTAMP ELSE last_contact_at END,
        next_best_action=?, next_action_at=datetime('now','+3 days'), updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .bind(sendEmail ? 1 : 0, `Follow up quote ${quote.reference}`, quote.lead_id).run();
    }

    if (emailResult && quote.lead_id) {
      await db.prepare(`INSERT INTO messages (id, lead_id, company_id, contact_id, channel, direction, subject, body, intent, external_id, sent_at)
        VALUES (?, ?, ?, ?, 'EMAIL', 'OUTBOUND', ?, ?, 'QUOTE_SENT', ?, CURRENT_TIMESTAMP)`)
        .bind(
          crypto.randomUUID(), quote.lead_id, quote.company_id, quote.contact_id,
          emailResult.subject, emailResult.body, emailResult.gmailMessageId,
        ).run();
      await upsertQuoteFollowUpTask(db, quote);
    }

    await db.prepare(`INSERT INTO activities (id, entity_type, entity_id, activity_type, title, description, metadata_json)
      VALUES (?, 'QUOTE', ?, ?, ?, ?, ?)`)
      .bind(
        crypto.randomUUID(),
        quote.id,
        emailResult ? 'QUOTE_EMAIL_SENT' : 'QUOTE_LINK_GENERATED',
        emailResult ? 'Quote emailed to customer' : 'Quote customer link generated',
        emailResult ? `${quote.reference} emailed to ${emailResult.to}` : `${quote.reference} customer link generated`,
        JSON.stringify({
          reference: quote.reference,
          total: quote.total,
          publicPath,
          emailed: Boolean(emailResult),
          gmailMessageId: emailResult?.gmailMessageId || null,
          gmailThreadId: emailResult?.gmailThreadId || null,
          previousLinksRemainValid: true,
        }),
      ).run();

    return Response.json({
      ok: true,
      reference: quote.reference,
      publicPath,
      emailed: Boolean(emailResult),
      to: emailResult?.to || null,
      gmailMessageId: emailResult?.gmailMessageId || null,
      gmailThreadId: emailResult?.gmailThreadId || null,
    });
  } catch (error) {
    console.error('quote_send_failed', error);
    return Response.json({ ok: false, error: error instanceof Error ? error.message : 'Unable to send quote.' }, { status: 500 });
  }
};