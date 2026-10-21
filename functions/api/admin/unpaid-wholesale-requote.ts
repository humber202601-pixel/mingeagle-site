import {quoteTotals} from '../../../lib/quote-totals';
interface Env {MINGEAGLE_DB:D1Database}
type Input={orderReference?:string};
type Source={id:string;reference:string;quote_id:string|null;lead_id:string|null;
 company_id:string|null;contact_id:string|null;status:string;payment_status:string;
 currency:string;subtotal:number;discount:number;shipping:number;tax:number;total:number;quote_status:string|null};
type Line={product_id:string|null;variant_id:string|null;description:string;
 quantity:number;unit_price:number;line_total:number};
const reply=(v:object,s=200)=>Response.json(v,{status:s,headers:{'cache-control':'private, no-store'}});
const readExisting=async(db:D1Database,order:Source)=>{
 const child=await db.prepare(`SELECT q.id,q.reference,q.status,q.currency,q.total
   FROM b2b_recovery_quote_links l JOIN quotes q ON q.id=l.recovery_quote_id
   WHERE l.source_order_id=? LIMIT 1`).bind(order.id).first<Record<string,unknown>>();
 return child?reply({ok:true,reused:true,sourceOrderReference:order.reference,
  quote:{id:child.id,reference:child.reference,status:child.status,
   currency:child.currency,total:child.total,requiresReview:true}},200):null;
};
export const onRequestPost:PagesFunction<Env>=async({request,env})=>{
 if(!env.MINGEAGLE_DB)return reply({ok:false,error:'Database unavailable.'},503);
 const body=await request.json().catch(()=>null) as Input|null;
 const ref=typeof body?.orderReference==='string'?body.orderReference.trim().slice(0,160):'';
 if(!ref)return reply({ok:false,error:'Original order reference is required.'},400);
 const db=env.MINGEAGLE_DB;
 try{
  const order=await db.prepare(`SELECT o.id,o.reference,o.quote_id,o.lead_id,o.company_id,o.contact_id,
    o.status,o.payment_status,o.currency,o.subtotal,o.discount,o.shipping,o.tax,o.total,q.status AS quote_status
    FROM orders o LEFT JOIN quotes q ON q.id=o.quote_id
    WHERE o.reference=? LIMIT 1`).bind(ref).first<Source>();
  if(!order)return reply({ok:false,error:'Order not found.'},404);
  // Explicit QA/demo records must never enter the customer recovery workflow,
  // even when their totals and item rows reconcile. Keep them available for
  // audit, but require a separate deliberate cleanup/review path.
  const testMarker=await db.prepare(`SELECT 1 AS flagged FROM order_items
    WHERE order_id=? AND (UPPER(description) LIKE '%QA TEST%'
      OR UPPER(description) LIKE '%DO NOT SEND%'
      OR UPPER(description) LIKE '%TEST ORDER%') LIMIT 1`).bind(order.id).first<{flagged:number}>();
  if(testMarker)return reply({ok:false,code:'SOURCE_TEST_ORDER_BLOCKED',
    error:'This order is marked as a QA/test record and cannot be converted into a customer quotation. The historical order remains unchanged.'},409);
  // Some historical unpaid orders have no quote_id at all. They may only
  // produce a fresh, unapproved draft after line/finance reconciliation; no
  // buyer acceptance or original quote terms are inferred or copied.
  if(order.status!=='PAYMENT_PENDING'||order.payment_status!=='UNPAID'||
     order.currency!=='USD'||
     (order.quote_id!==null&&order.quote_status!=='CONVERTED')||
     !(Number(order.total)>0))
   return reply({ok:false,code:'SOURCE_ORDER_NOT_SAFE_FOR_REQUOTE',
    error:'Only unpaid, unfulfilled USD orders with reconciled items qualify. Any replacement remains a new draft requiring seller review and buyer acceptance.'},409);
  const evidence=await db.prepare(`SELECT
    (SELECT COUNT(*) FROM payments WHERE order_id=?) AS payment_rows,
    (SELECT COUNT(*) FROM payment_provider_sessions WHERE order_id=?) AS provider_sessions`)
   .bind(order.id,order.id).first<{payment_rows:number;provider_sessions:number}>();
  if(Number(evidence?.payment_rows||0)>0||Number(evidence?.provider_sessions||0)>0)
   return reply({ok:false,code:'SOURCE_PAYMENT_REVIEW_REQUIRED',
    error:'Original order has payment records or Stripe sessions. Reconcile these first; no duplicate quote draft has been created.'},409);
  const items=await db.prepare(`SELECT product_id,variant_id,description,quantity,unit_price,line_total
    FROM order_items WHERE order_id=? ORDER BY id`).bind(order.id).all<Line>();
  const rows=items.results||[];
  if(!rows.length||rows.reduce((n,x)=>n+Number(x.quantity||0),0)<10)
   return reply({ok:false,code:'SOURCE_NOT_WHOLESALE',
    error:'Only 10+ unit wholesale orders qualify for this recovery flow.'},409);
  // A historical description alone is not a reliable product identity. Every
  // line must resolve to an active catalog product; products with variants must
  // also resolve to an active variant belonging to that product.
  const productSnapshot=await db.prepare(`SELECT COUNT(*) AS invalid_lines FROM order_items i
    LEFT JOIN products p ON p.id=i.product_id
    LEFT JOIN product_variants v ON v.id=i.variant_id
    WHERE i.order_id=? AND (
      i.product_id IS NULL OR p.id IS NULL OR p.status<>'ACTIVE'
      OR (i.variant_id IS NOT NULL AND (v.id IS NULL OR v.product_id<>p.id OR v.active<>1))
      OR (i.variant_id IS NULL AND EXISTS(SELECT 1 FROM product_variants pv WHERE pv.product_id=p.id))
    )`).bind(order.id).first<{invalid_lines:number}>();
  if(Number(productSnapshot?.invalid_lines||0)>0)
   return reply({ok:false,code:'SOURCE_PRODUCT_SNAPSHOT_REQUIRED',
    error:'One or more historical order lines lack a valid active catalog product or required variant. Restore the product/variant association and review the original SKU before creating a replacement quotation.'},409);
  // Historical orphan orders (no surviving source quote) must not be recovered
  // solely from a chosen SKU: require the documented manual reconciliation trail.
  if(order.quote_id===null){
   const audit=await db.prepare(`SELECT COUNT(*) AS missing FROM order_items i
     WHERE i.order_id=? AND NOT EXISTS (
       SELECT 1 FROM order_item_catalog_audit a
       JOIN order_item_catalog_evidence e ON e.audit_id=a.id
       WHERE a.order_item_id=i.id AND a.new_product_id=i.product_id
       AND a.new_variant_id=i.variant_id AND length(trim(e.evidence_reference))>=12)`)
     .bind(order.id).first<{missing:number}>().catch(()=>null);
   if(!audit||Number(audit.missing)>0)
    return reply({ok:false,code:'SOURCE_CATALOG_EVIDENCE_REQUIRED',
      error:'Historical order lines require an audited SKU association and original buyer/purchase evidence before a replacement quote can be drafted.'},409);
  }
  let calc:ReturnType<typeof quoteTotals>;
  try{
   const lines=rows.map(x=>({quantity:x.quantity,unitPrice:x.unit_price}));
   const original=quoteTotals(lines,order.shipping,order.discount,order.tax);
   if(Math.abs(original.subtotal-Number(order.subtotal))>0.005||
     Math.abs(original.discount-Number(order.discount))>0.005||
     Math.abs(original.shipping-Number(order.shipping))>0.005||
     Math.abs(original.tax-Number(order.tax))>0.005||
     Math.abs(original.total-Number(order.total))>0.005||
     rows.some((x,i)=>!x.description?.trim()||
       Math.abs(original.lineCents[i]-Math.round(Number(x.line_total)*100))>0))
    throw Error('Unreconciled historical order');
   // Carry forward only reconciled item and freight snapshots. The replacement
   // draft intentionally drops old discounts and taxes until freshly reviewed.
   calc=quoteTotals(lines,order.shipping,0,0);
  }catch{
   return reply({ok:false,code:'SOURCE_LINE_ITEMS_INVALID',
    error:'Historical order items, discount, freight, tax and total do not reconcile. Perform a manual review before drafting.'},409);
  }
  // Lazy schema creation, only when explicitly requested by authenticated owner.
  await db.prepare(`CREATE TABLE IF NOT EXISTS b2b_recovery_quote_links(
    id TEXT PRIMARY KEY, source_order_id TEXT NOT NULL UNIQUE,
    recovery_quote_id TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
  const previous=await readExisting(db,order);
  if(previous)return previous;
  const quoteId=crypto.randomUUID();
  const reference='ME-Q-REC-'+Date.now().toString(36).toUpperCase()+'-'+crypto.randomUUID().slice(0,8).toUpperCase();
  const statements:D1PreparedStatement[]=[
   // A payment may complete concurrently. Re-check eligibility *within* the
   // atomic D1 batch; NOT NULL source_order_id aborts all later inserts.
   db.prepare(`INSERT INTO b2b_recovery_quote_links(id,source_order_id,recovery_quote_id)
     VALUES(?,(SELECT CASE WHEN o.status='PAYMENT_PENDING' AND o.payment_status='UNPAID'
       AND o.currency='USD' AND o.total>0
       AND (o.quote_id IS NULL OR q.status='CONVERTED')
       AND NOT EXISTS(SELECT 1 FROM payments p WHERE p.order_id=o.id)
       AND NOT EXISTS(SELECT 1 FROM payment_provider_sessions s WHERE s.order_id=o.id)
       AND NOT EXISTS(SELECT 1 FROM order_items i WHERE i.order_id=o.id AND (UPPER(i.description) LIKE '%QA TEST%' OR UPPER(i.description) LIKE '%DO NOT SEND%' OR UPPER(i.description) LIKE '%TEST ORDER%'))
       AND NOT EXISTS(SELECT 1 FROM order_items i LEFT JOIN products p ON p.id=i.product_id LEFT JOIN product_variants v ON v.id=i.variant_id WHERE i.order_id=o.id AND (i.product_id IS NULL OR p.id IS NULL OR p.status<>'ACTIVE' OR (i.variant_id IS NOT NULL AND (v.id IS NULL OR v.product_id<>p.id OR v.active<>1)) OR (i.variant_id IS NULL AND EXISTS(SELECT 1 FROM product_variants pv WHERE pv.product_id=p.id))))
${order.quote_id===null ? `AND NOT EXISTS(
         SELECT 1 FROM order_items i WHERE i.order_id=o.id AND NOT EXISTS(
           SELECT 1 FROM order_item_catalog_audit a
           JOIN order_item_catalog_evidence e ON e.audit_id=a.id
           WHERE a.order_item_id=i.id AND a.new_product_id=i.product_id
           AND a.new_variant_id=i.variant_id AND length(trim(e.evidence_reference))>=12))` : ''}
       THEN o.id ELSE NULL END
       FROM orders o LEFT JOIN quotes q ON q.id=o.quote_id WHERE o.id=?),?)`)
      .bind(crypto.randomUUID(),order.id,quoteId),
   db.prepare(`INSERT INTO quotes(
     id,reference,lead_id,company_id,contact_id,status,currency,
     subtotal,discount,shipping,tax,total,payment_terms,shipping_terms,notes,tax_basis,valid_until)
     VALUES(?,?,?,?,?,'DRAFT','USD',?,0,?,0,?,?,?,NULL,NULL,datetime('now','+14 days'))`)
      .bind(quoteId,reference,order.lead_id,order.company_id,order.contact_id,
       calc.subtotal,calc.shipping,calc.total,
       'Full amount payable by secure Stripe card checkout after the revised quotation is accepted.',
       'DDP shipping, destination state and transit time require fresh seller approval.'),
   ...rows.map((item,i)=>db.prepare(`INSERT INTO quote_items
       (id,quote_id,product_id,variant_id,description,quantity,unit_price,line_total,sort_order)
       VALUES(?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),quoteId,
        item.product_id,item.variant_id,item.description,calc.lines[i].quantity,
        calc.lines[i].unitCents/100,calc.lineCents[i]/100,i)),
   db.prepare(`INSERT INTO tasks(
      id,lead_id,company_id,contact_id,order_id,type,title,description,status,priority,due_at)
      VALUES(?,?,?,?,?,'FOLLOW_UP',?,?,'OPEN','HIGH',datetime('now','+1 day'))`)
    .bind(crypto.randomUUID(),order.lead_id,order.company_id,order.contact_id,order.id,
     'Recheck and issue replacement quote '+reference,
     'Original unpaid wholesale order '+order.reference+
     ': obtain buyer-confirmed US ship-to address, independent sales tax basis, current supplier price and DDP freight, then send a NEW quote for buyer acceptance. Do not recharge or alter the historical order.'),
   db.prepare(`INSERT INTO activities(
      id,entity_type,entity_id,activity_type,title,description,metadata_json)
      VALUES(?,'QUOTE',?,'UNPAID_ORDER_REQUOTE_DRAFT','Replacement quote review draft',?,?)`)
    .bind(crypto.randomUUID(),quoteId,
     reference+' draft from unpaid source '+order.reference,
     JSON.stringify({sourceOrderId:order.id,sourceReference:order.reference,
      oldOrderUnchanged:true,requiresSellerReview:true,originalShipmentIsOnlySnapshot:true}))
  ];
  try{
   const result=await db.batch(statements);
   if(result.length!==statements.length||result.some((x,i)=>!x.success||
     (i===0&&Number(x.meta?.changes)!==1)))
    throw Error('REQUOTE_TRANSACTION_NOT_CONFIRMED');
  }catch{
   const won=await readExisting(db,order);
   if(won)return won;
   return reply({ok:false,code:'REQUOTE_REVIEW_REQUIRED',
    error:'Order changed or draft could not be created atomically. Refresh payments and order status before retrying.'},409);
  }
  return reply({ok:true,reused:false,sourceOrderReference:order.reference,
    quote:{id:quoteId,reference,status:'DRAFT',currency:'USD',total:calc.total,
     requiresReview:true}},201);
 }catch(error){
  console.error('unpaid_wholesale_requote_failed',error);
  return reply({ok:false,error:'Unable to safely prepare a replacement draft. No customer payment or email was initiated.'},503);
 }
};
