import {quoteTotals} from '../../../lib/quote-totals';
interface Env {
  MINGEAGLE_DB: D1Database;
}

type Input = { orderReference?: string };
type SourceOrder = {
  id:string; reference:string; lead_id:string|null;company_id:string|null;contact_id:string|null;
  currency:string;subtotal:number;discount:number;shipping:number;tax:number;total:number;
  status:string;payment_status:string;
};
type SourceItem = {
  product_id:string|null;variant_id:string|null;description:string;
  quantity:number;unit_price:number;line_total:number;
};
const clean = (value: unknown, max = 160) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const reply=(v:object,s=200)=>Response.json(v,{status:s,headers:{'cache-control':'private, no-store'}});

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.MINGEAGLE_DB) return reply({ok:false,error:'Database is not configured.'},503);
  let orderReference='';
  try{const input=await request.json() as Input;orderReference=clean(input?.orderReference);}
  catch{return reply({ok:false,error:'Invalid request JSON.'},400);}
  if(!orderReference)return reply({ok:false,error:'Order reference is required.'},400);
  const db=env.MINGEAGLE_DB;
  try {
    const order=await db.prepare(`SELECT id,reference,lead_id,company_id,contact_id,currency,subtotal,discount,shipping,tax,total,status,payment_status
      FROM orders WHERE reference=? LIMIT 1`).bind(orderReference).first<SourceOrder>();
    if(!order)return reply({ok:false,error:'Order not found.'},404);
    // Only a genuinely paid delivered/completed order is eligible as a
    // reorder source. Historical unpaid bank-payment orders are not eligible.
    if(order.payment_status!=='PAID'||!['DELIVERED','COMPLETED'].includes(order.status))
      return reply({ok:false,code:'REORDER_SOURCE_NOT_ELIGIBLE',
        error:'Only fully paid and delivered/completed orders can generate a repeat-purchase draft.'},409);
    if(String(order.currency)!=='USD')
      return reply({ok:false,code:'REORDER_CURRENCY_REVIEW',
        error:'Reorder currency needs manual review before drafting.'},409);
    // An old PAID label / completed shipment is not proof of Stripe receipt.
    // This endpoint creates a new lead task and changes funnel state, so
    // verify that its historical source is fully reconciled first.
    const sourceEvidence=await db.prepare(`SELECT
      (SELECT COALESCE(SUM(p.amount),0) FROM payments p
        JOIN payment_provider_sessions s ON s.order_id=p.order_id
          AND s.provider='STRIPE' AND s.provider_intent_id=p.provider_reference
          AND s.status='SUCCEEDED'
        WHERE p.order_id=? AND p.provider='STRIPE' AND p.currency='USD'
          AND p.status='RECEIVED') AS stripe_verified_received,
      (SELECT COALESCE(SUM(p.amount),0) FROM payments p
        WHERE p.order_id=? AND p.status='RECEIVED') AS all_received,
      (SELECT COUNT(*) FROM tasks t WHERE t.order_id=? AND t.type='PAYMENT'
        AND t.status IN ('OPEN','IN_PROGRESS') AND
        (t.title LIKE 'Review disputed Stripe receipts%'
          OR t.title LIKE 'Review payment on closed order%')) AS active_payment_reviews`
    ).bind(order.id,order.id,order.id).first<{
      stripe_verified_received:number;all_received:number;active_payment_reviews:number
    }>();
    const orderTotal=Number(order.total);
    if(!Number.isFinite(orderTotal)||orderTotal<=0||
       Math.abs(Number(sourceEvidence?.stripe_verified_received||0)-orderTotal)>0.005||
       Math.abs(Number(sourceEvidence?.all_received||0)-orderTotal)>0.005||
       Number(sourceEvidence?.active_payment_reviews||0)>0)
      return reply({ok:false,code:'REORDER_PAYMENT_EVIDENCE_REQUIRED',
        error:'The historical paid order still needs payment reconciliation before it may create a repeat-order draft. You can prepare an independent new quotation instead.'},409);

    const source=await db.prepare(`SELECT product_id,variant_id,description,quantity,unit_price,line_total
      FROM order_items WHERE order_id=? ORDER BY id`).bind(order.id).all<SourceItem>();
    const rows=source.results||[];
    // Repricing is mandatory; this snapshot is reference data, not verified
    // supplier costs, current shipping charges or a customer-ready quotation.
    let calculated:ReturnType<typeof quoteTotals>;
    try{
      calculated=quoteTotals(rows.map(r=>({quantity:r.quantity,unitPrice:r.unit_price})),order.shipping,0,0);
      if(rows.some((r,i)=>!r.description?.trim()||calculated.lineCents[i]!==Math.round(Number(r.line_total)*100)))
        throw Error('ORDER_ITEMS_MISMATCH');
    }catch{
      return reply({ok:false,code:'REORDER_SOURCE_AMOUNTS_INVALID',
        error:'Historical order lines cannot be reconciled; manually review before preparing a new quotation.'},409);
    }

    const quoteId=crypto.randomUUID();
    const reference=`ME-Q-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0,8).toUpperCase()}`;
    // notes is buyer-visible. Keep staff-only sourcing checks in the REORDER task.
    const note=null;
    const statements:D1PreparedStatement[]=[
      db.prepare(`INSERT INTO quotes (
        id,reference,lead_id,company_id,contact_id,status,currency,
        subtotal,discount,shipping,tax,total,payment_terms,shipping_terms,notes,valid_until
      ) VALUES (?,?,?,?,?,'DRAFT','USD',?,?,?,?,?,?,?, ?,datetime('now','+14 days'))`)
       .bind(quoteId,reference,order.lead_id,order.company_id,order.contact_id,
        calculated.subtotal,0,calculated.shipping,0,calculated.total,
        'Full amount payable by secure Stripe card checkout after both parties accept this quotation.',
        'Shipping terms to be confirmed before sending.',note),
      ...rows.map((item,i)=>db.prepare(`INSERT INTO quote_items
        (id,quote_id,product_id,variant_id,description,quantity,unit_price,line_total,sort_order)
        VALUES (?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),quoteId,
        item.product_id,item.variant_id,item.description,calculated.lines[i].quantity,
        calculated.lines[i].unitCents/100,calculated.lineCents[i]/100,i)),
    ];
    if(order.lead_id)statements.push(db.prepare(`UPDATE leads
      SET status='QUOTE', next_best_action=?, next_action_at=datetime('now','+1 day'),
      updated_at=CURRENT_TIMESTAMP WHERE id=?`)
     .bind(`Review reorder quote ${reference}`,order.lead_id));
    statements.push(
      db.prepare(`INSERT INTO tasks
        (id,lead_id,company_id,contact_id,order_id,type,title,description,status,priority,due_at)
        VALUES (?,?,?,?,?,'REORDER',?,?,'OPEN','HIGH',datetime('now','+1 day'))`)
       .bind(crypto.randomUUID(),order.lead_id,order.company_id,order.contact_id,order.id,
        `Review reorder quote ${reference}`,
        `Draft from ${orderReference}. Recheck supplier cost, quantity, DDP freight, US sales tax, state and Stripe terms before sending.`),
      db.prepare(`INSERT INTO activities
        (id,entity_type,entity_id,activity_type,title,description,metadata_json)
        VALUES (?,'QUOTE',?,'REORDER_QUOTE_CREATED','Reorder quote draft created',?,?)`)
       .bind(crypto.randomUUID(),quoteId,`${reference} draft from completed order ${orderReference}`,
        JSON.stringify({reference,orderReference,subtotal:calculated.subtotal,shipping:calculated.shipping,total:calculated.total,sourceRequiresReprice:true}))
    );
    // A failed line, task or activity must roll back the entire draft.
    // Cloudflare D1 batch executes these statements transactionally.
    const result=await db.batch(statements);
    if(result.length!==statements.length||result.some((r,i)=>!r.success||(i===0&&Number(r.meta?.changes)!==1)))
      throw Error('REORDER_TRANSACTION_UNCONFIRMED');
    return reply({ok:true,quote:{id:quoteId,reference,status:'DRAFT',
      total:calculated.total,currency:'USD',requiresReview:true}},201);
  } catch(error) {
    console.error('reorder_quote_failed');
    return reply({ok:false,error:'Unable to create a complete reorder draft. No partial quote is accepted; refresh the quote list before retrying.'},503);
  }
};
