interface Env {
  MINGEAGLE_DB: D1Database;
}

type Input = { quoteId?: string };

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

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.MINGEAGLE_DB) return Response.json({ ok: false, error: 'Database is not configured.' }, { status: 503 });

  try {
    const { quoteId = '' } = await request.json() as Input;
    if (!quoteId) return Response.json({ ok: false, error: 'Quote id is required.' }, { status: 400 });

    const db = env.MINGEAGLE_DB;
    await ensureQuoteLinks(db);

    const quote = await db.prepare(`SELECT id, reference, status, lead_id, company_id, contact_id, valid_until, total, public_token_hash
      FROM quotes WHERE id = ? LIMIT 1`).bind(quoteId).first<{
        id: string;
        reference: string;
        status: string;
        lead_id: string | null;
        company_id: string | null;
        contact_id: string | null;
        valid_until: string | null;
        total: number;
        public_token_hash: string | null;
      }>();

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

    await db.prepare(`INSERT INTO quote_public_links (id, quote_id, token_hash)
      VALUES (?, ?, ?)`)
      .bind(crypto.randomUUID(), quote.id, tokenHash).run();

    await db.prepare(`UPDATE quotes
      SET status='SENT', public_token_hash=?, sent_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
      WHERE id=?`).bind(tokenHash, quote.id).run();

    if (quote.lead_id) {
      await db.prepare(`UPDATE leads SET status='QUOTE', next_best_action=?, next_action_at=datetime('now','+3 days'), updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .bind(`Follow up quote ${quote.reference}`, quote.lead_id).run();
    }

    await db.prepare(`INSERT INTO activities (id, entity_type, entity_id, activity_type, title, description, metadata_json)
      VALUES (?, 'QUOTE', ?, 'QUOTE_SENT', 'Quote sent', ?, ?)`)
      .bind(
        crypto.randomUUID(),
        quote.id,
        `${quote.reference} customer link generated`,
        JSON.stringify({ reference: quote.reference, total: quote.total, previousLinksRemainValid: true }),
      ).run();

    return Response.json({ ok: true, reference: quote.reference, publicPath: `/quote/${token}` });
  } catch (error) {
    console.error('quote_send_failed', error);
    return Response.json({ ok: false, error: 'Unable to send quote.' }, { status: 500 });
  }
};
