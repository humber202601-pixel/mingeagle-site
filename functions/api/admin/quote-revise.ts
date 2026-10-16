import {quoteTotals} from '../../../lib/quote-totals';
interface Env {
  MINGEAGLE_DB: D1Database;
}

type Row = Record<string, unknown>;
type Input = { quoteId?: string };

const clean = (value: unknown, max = 160) => typeof value === 'string' ? value.trim().slice(0, max) : '';

async function ensureRevisionTable(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS quote_revision_links (
    id TEXT PRIMARY KEY,
    root_quote_id TEXT NOT NULL,
    source_quote_id TEXT NOT NULL,
    revised_quote_id TEXT NOT NULL UNIQUE,
    revision_number INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_quote_revision_root ON quote_revision_links(root_quote_id, revision_number)`).run();
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.MINGEAGLE_DB) return Response.json({ ok: false, error: 'Database is not configured.' }, { status: 503 });

  try {
    const input = await request.json() as Input;
    const quoteId = clean(input.quoteId, 120);
    if (!quoteId) return Response.json({ ok: false, error: 'Quote id is required.' }, { status: 400 });

    const db = env.MINGEAGLE_DB;
    await ensureRevisionTable(db);

    const source = await db.prepare(`SELECT id, reference, lead_id, inquiry_id, company_id, contact_id, status, currency,
      subtotal, discount, shipping, tax, total, tax_basis, payment_terms, shipping_terms, notes
      FROM quotes WHERE id=? LIMIT 1`).bind(quoteId).first<Row>();
    if (!source) return Response.json({ ok: false, error: 'Quote not found.' }, { status: 404 });

    const sourceStatus = String(source.status || '');
    if (sourceStatus === 'DRAFT') {
      return Response.json({ ok: false, error: 'This quotation is still a draft. Edit the existing draft instead of creating a revision.' }, { status: 409 });
    }
    if (['ACCEPTED','CONVERTED'].includes(sourceStatus)) {
      return Response.json({ ok: false, error: 'Accepted or converted quotations cannot be revised. Create a new quotation instead.' }, { status: 409 });
    }
    if (!['SENT','VIEWED','EXPIRED','DECLINED'].includes(sourceStatus)) {
      return Response.json({ ok: false, error: `Quote cannot be revised from status ${sourceStatus}.` }, { status: 409 });
    }

    const sourceItems = await db.prepare(`SELECT product_id, variant_id, description, quantity, unit_price, line_total, sort_order
      FROM quote_items WHERE quote_id=? ORDER BY sort_order, id`).bind(quoteId).all<Row>();
    if (!sourceItems.results.length) return Response.json({ ok: false, error: 'Quote has no line items.' }, { status: 409 });

    const sourceLink = await db.prepare(`SELECT root_quote_id, revision_number FROM quote_revision_links WHERE revised_quote_id=? LIMIT 1`)
      .bind(quoteId).first<{ root_quote_id: string; revision_number: number }>();
    const rootQuoteId = sourceLink?.root_quote_id || quoteId;
    const rootQuote = await db.prepare(`SELECT id, reference FROM quotes WHERE id=? LIMIT 1`).bind(rootQuoteId).first<{ id: string; reference: string }>();
    if (!rootQuote) return Response.json({ ok: false, error: 'Revision root quote not found.' }, { status: 409 });

    const maxRevision = await db.prepare(`SELECT COALESCE(MAX(revision_number),0) AS value FROM quote_revision_links WHERE root_quote_id=?`)
      .bind(rootQuoteId).first<{ value: number }>();
    let revisionNumber = Number(maxRevision?.value || 0) + 1;
    let reference = `${rootQuote.reference}-R${revisionNumber}`;

    while (await db.prepare(`SELECT 1 AS value FROM quotes WHERE reference=? LIMIT 1`).bind(reference).first()) {
      revisionNumber += 1;
      reference = `${rootQuote.reference}-R${revisionNumber}`;
    }


    // Refuse to clone financially inconsistent or unsupported legacy totals.
    // Every revision is still a DRAFT: copying old freight/tax amounts never
    // authorizes their reuse or proves that the supplier quote is current.
    let totals:ReturnType<typeof quoteTotals>;
    try{
      totals=quoteTotals(sourceItems.results.map(item=>({
        quantity:item.quantity,unitPrice:item.unit_price
      })),source.shipping??0,source.discount??0,source.tax??0);
      if(String(source.currency)!=='USD'||
        sourceItems.results.some((item,i)=>totals.lineCents[i]!==Math.round(Number(item.line_total)*100))||
        totals.subtotalCents!==Math.round(Number(source.subtotal)*100)||
        totals.totalCents!==Math.round(Number(source.total)*100))
        throw Error('INVALID_SOURCE_QUOTE');
    }catch{
      return Response.json({ok:false,code:'REVISION_SOURCE_TOTALS_INVALID',
        error:'The source quotation totals cannot be reconciled. Review amounts before issuing a revision.'},{status:409});
    }

    const newQuoteId=crypto.randomUUID();
    const draftNotes=`Revision draft from ${String(source.reference)}. Reconfirm current factory prices, quantity, destination, DDP freight, import duties and destination sales tax before publishing.`;
    const commands:D1PreparedStatement[]=[
      db.prepare(`INSERT INTO quotes (
        id,reference,lead_id,inquiry_id,company_id,contact_id,status,currency,
        subtotal,discount,shipping,tax,total,tax_basis,payment_terms,shipping_terms,notes,valid_until
      ) VALUES (?,?,?,?,?,?,'DRAFT','USD',?,?,?,?,?,NULL,?,?,?,datetime('now','+14 days'))`)
       .bind(newQuoteId,reference,source.lead_id||null,source.inquiry_id||null,
        source.company_id||null,source.contact_id||null,
        totals.subtotal,totals.discount,totals.shipping,totals.tax,totals.total,
        'Full amount payable by secure Stripe card checkout after both parties accept this quotation.',
        'Shipping terms to be confirmed before sending.',draftNotes),
      ...sourceItems.results.map(item=>db.prepare(`INSERT INTO quote_items
        (id,quote_id,product_id,variant_id,description,quantity,unit_price,line_total,sort_order)
        VALUES (?,?,?,?,?,?,?,?,?)`).bind(
         crypto.randomUUID(),newQuoteId,item.product_id||null,item.variant_id||null,
         String(item.description||'MING EAGLE products'),Number(item.quantity),
         Number(item.unit_price),Number(item.line_total),Number(item.sort_order||0)
        )),
      db.prepare(`INSERT INTO quote_revision_links
        (id,root_quote_id,source_quote_id,revised_quote_id,revision_number)
        VALUES (?,?,?,?,?)`).bind(crypto.randomUUID(),rootQuoteId,quoteId,newQuoteId,revisionNumber),
    ];

    if(['SENT','VIEWED'].includes(sourceStatus)){
      commands.push(db.prepare(`UPDATE quotes SET status='EXPIRED',updated_at=CURRENT_TIMESTAMP
        WHERE id=? AND status=?`).bind(quoteId,sourceStatus));
    }
    if(source.lead_id){
      commands.push(db.prepare(`UPDATE leads SET status='QUOTE',next_best_action=?,
        next_action_at=datetime('now','+1 day'),updated_at=CURRENT_TIMESTAMP WHERE id=?`)
       .bind(`Review revised quote ${reference}`,String(source.lead_id)));
    }
    commands.push(
      db.prepare(`INSERT INTO tasks
        (id,lead_id,company_id,contact_id,type,title,description,status,priority,due_at)
        VALUES (?,?,?,?,'FOLLOW_UP',?,?,'OPEN','HIGH',datetime('now','+1 day'))`)
       .bind(crypto.randomUUID(),source.lead_id||null,source.company_id||null,source.contact_id||null,
         `Review revised quote ${reference}`,
         `Revision ${revisionNumber} draft from ${String(source.reference)}. Reconfirm wholesale prices, Stripe payment terms, freight, customs duties and tax before sending.`),
      db.prepare(`INSERT INTO activities
        (id,entity_type,entity_id,activity_type,title,description,metadata_json)
        VALUES (?,'QUOTE',?,'QUOTE_REVISION_CREATED','Quote revision created',?,?)`)
       .bind(crypto.randomUUID(),newQuoteId,
         `${reference} created as revision ${revisionNumber} of ${String(rootQuote.reference)}`,
         JSON.stringify({rootQuoteId,sourceQuoteId:quoteId,sourceReference:source.reference,reference,revisionNumber})),
      db.prepare(`INSERT INTO activities
        (id,entity_type,entity_id,activity_type,title,description,metadata_json)
        VALUES (?,'QUOTE',?,'QUOTE_SUPERSEDED','Quote superseded by revision',?,?)`)
       .bind(crypto.randomUUID(),quoteId,
         `${String(source.reference)} superseded by ${reference}`,
         JSON.stringify({revisedQuoteId:newQuoteId,revisedReference:reference,revisionNumber}))
    );
    // D1 batch is a single transaction: no partially copied quote and no
    // premature source invalidation if a later audit/task insert fails.
    const outcome=await db.batch(commands);
    if(outcome.length!==commands.length||outcome.some(row=>!row.success))
      throw Error('QUOTE_REVISION_TRANSACTION_UNCONFIRMED');
        return Response.json({
      ok: true,
      source: { id: quoteId, reference: source.reference, status: ['SENT','VIEWED'].includes(sourceStatus) ? 'EXPIRED' : sourceStatus },
      quote: {
        id: newQuoteId,
        reference,
        status: 'DRAFT',
        currency: String(source.currency || 'USD'),
        total: totals.total,
        revisionNumber,
        sourceReference: source.reference,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('quote_revision_failed', error);
    return Response.json({ ok: false, error: 'Quote revision failed; no partial revision is accepted. Refresh the quote list before retrying.' }, { status: 503 });
  }
};
