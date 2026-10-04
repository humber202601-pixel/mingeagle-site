interface Env {
  MINGEAGLE_DB: D1Database;
}

type Input = { quoteId?: string };

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.MINGEAGLE_DB) return Response.json({ ok: false, error: 'Database is not configured.' }, { status: 503 });

  try {
    const { quoteId = '' } = await request.json() as Input;
    if (!quoteId) return Response.json({ ok: false, error: 'Quote id is required.' }, { status: 400 });

    const db = env.MINGEAGLE_DB;
    const quote = await db.prepare(`SELECT id, reference, status, lead_id, company_id, contact_id, valid_until
      FROM quotes WHERE id = ? LIMIT 1`).bind(quoteId).first<{
        id: string; reference: string; status: string; lead_id: string | null; company_id: string | null; contact_id: string | null; valid_until: string | null;
      }>();

    if (!quote) return Response.json({ ok: false, error: 'Quote not found.' }, { status: 404 });
    if (['ACCEPTED','CONVERTED','DECLINED','EXPIRED'].includes(quote.status)) {
      return Response.json({ ok: false, error: `Quote cannot be sent from status ${quote.status}.` }, { status: 409 });
    }

    const token = `${crypto.randomUUID().replaceAll('-', '')}${crypto.randomUUID().replaceAll('-', '')}`;
    const tokenHash = await sha256(token);

    await db.prepare(`UPDATE quotes
      SET status='SENT', public_token_hash=?, sent_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
      WHERE id=?`).bind(tokenHash, quote.id).run();

    if (quote.lead_id) {
      await db.prepare(`UPDATE leads SET status='QUOTE', next_best_action=?, next_action_at=datetime('now','+3 days'), updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .bind(`Follow up quote ${quote.reference}`, quote.lead_id).run();
    }

    await db.prepare(`INSERT INTO activities (id, entity_type, entity_id, activity_type, title, description, metadata_json)
      VALUES (?, 'QUOTE', ?, 'QUOTE_SENT', 'Quote sent', ?, ?)`)
      .bind(crypto.randomUUID(), quote.id, `${quote.reference} customer link generated`, JSON.stringify({ reference: quote.reference })).run();

    return Response.json({ ok: true, reference: quote.reference, publicPath: `/quote/${token}` });
  } catch (error) {
    console.error('quote_send_failed', error);
    return Response.json({ ok: false, error: 'Unable to send quote.' }, { status: 500 });
  }
};
