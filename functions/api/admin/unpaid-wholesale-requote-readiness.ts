import {quoteTotals} from '../../../lib/quote-totals';
interface Env {MINGEAGLE_DB?:D1Database;ADMIN_ACCESS_KEY?:string}
type Order={id:string;reference:string;quote_id:string|null;status:string;payment_status:string;currency:string;subtotal:number;discount:number;shipping:number;tax:number;total:number;quote_status:string|null};
type Line={id:string;product_id:string|null;variant_id:string|null;description:string;quantity:number;unit_price:number;line_total:number;product_status:string|null;variant_active:number|null;variant_product_id:string|null;variant_count:number};
const reply=(v:object,status=200)=>Response.json(v,{status,headers:{'cache-control':'private, no-store'}});
async function secretEqual(a:string,b:string){
 const enc=new TextEncoder();const [x,y]=await Promise.all([crypto.subtle.digest('SHA-256',enc.encode(a)),crypto.subtle.digest('SHA-256',enc.encode(b))]);
 const u=new Uint8Array(x),v=new Uint8Array(y);let diff=0;for(let i=0;i<u.length;i++)diff|=u[i]^v[i];return diff===0;
}
// Read-only advisory. POST /unpaid-wholesale-requote remains authoritative and
// rechecks every financial, payment and association invariant before writing.
export const onRequestGet:PagesFunction<Env>=async({request,env})=>{
 const expected=env.ADMIN_ACCESS_KEY||'',provided=request.headers.get('x-admin-key')||'';
 if(!expected||!provided||!await secretEqual(expected,provided))return reply({ok:false,error:'Unauthorized.'},401);
 if(!env.MINGEAGLE_DB)return reply({ok:false,error:'Database unavailable.'},503);
 const ref=new URL(request.url).searchParams.get('orderReference')?.trim()||'';
 if(!ref||ref.length>160)return reply({ok:false,error:'Valid orderReference required.'},400);
 const db=env.MINGEAGLE_DB;
 try{
  const order=await db.prepare(`SELECT o.id,o.reference,o.quote_id,o.status,o.payment_status,o.currency,o.subtotal,o.discount,o.shipping,o.tax,o.total,q.status AS quote_status
   FROM orders o LEFT JOIN quotes q ON q.id=o.quote_id WHERE o.reference=? LIMIT 1`).bind(ref).first<Order>();
  if(!order)return reply({ok:false,error:'Order not found.'},404);
  const reasons:string[]=[];
  if(order.status!=='PAYMENT_PENDING'||order.payment_status!=='UNPAID'||order.currency!=='USD'||Number(order.total)<=0||
    (order.quote_id!==null&&order.quote_status!=='CONVERTED'))reasons.push('SOURCE_ORDER_NOT_SAFE_FOR_REQUOTE');
  const [payments,sessions,items]=await Promise.all([
   db.prepare('SELECT COUNT(*) AS n FROM payments WHERE order_id=?').bind(order.id).first<{n:number}>(),
   db.prepare('SELECT COUNT(*) AS n FROM payment_provider_sessions WHERE order_id=?').bind(order.id).first<{n:number}>(),
   db.prepare(`SELECT i.id,i.product_id,i.variant_id,i.description,i.quantity,i.unit_price,i.line_total,
     p.status AS product_status,v.active AS variant_active,v.product_id AS variant_product_id,
     (SELECT COUNT(*) FROM product_variants pv WHERE pv.product_id=i.product_id) AS variant_count
     FROM order_items i LEFT JOIN products p ON p.id=i.product_id
     LEFT JOIN product_variants v ON v.id=i.variant_id WHERE i.order_id=? ORDER BY i.id`).bind(order.id).all<Line>()
  ]);
  if(Number(payments?.n||0)>0||Number(sessions?.n||0)>0)reasons.push('SOURCE_PAYMENT_REVIEW_REQUIRED');
  const rows=items.results||[],quantity=rows.reduce((n,x)=>n+Number(x.quantity||0),0);
  if(!rows.length||quantity<10)reasons.push('SOURCE_NOT_WHOLESALE');
  if(rows.some(x=>/QA TEST|DO NOT SEND|TEST ORDER/i.test(x.description)))reasons.push('SOURCE_TEST_ORDER_BLOCKED');
  const unlinked=rows.filter(x=>!x.product_id||x.product_status!=='ACTIVE'||
    (x.variant_id?(x.variant_active!==1||x.variant_product_id!==x.product_id):x.variant_count>0));
  if(unlinked.length)reasons.push('SOURCE_PRODUCT_SNAPSHOT_REQUIRED');
  if(order.quote_id===null&&rows.length){
   const evidence=await db.prepare(`SELECT COUNT(*) AS n FROM order_items i
      WHERE i.order_id=? AND NOT EXISTS (
       SELECT 1 FROM order_item_catalog_audit a
       JOIN order_item_catalog_evidence e ON e.audit_id=a.id
       WHERE a.order_item_id=i.id AND a.new_product_id=i.product_id AND a.new_variant_id=i.variant_id
       AND length(trim(e.evidence_reference))>=12)`).bind(order.id).first<{n:number}>().catch(()=>null);
   if(!evidence||Number(evidence.n)>0)reasons.push('SOURCE_CATALOG_EVIDENCE_REQUIRED');
  }
  try{
   const snapshot=quoteTotals(rows.map(x=>({quantity:x.quantity,unitPrice:x.unit_price})),order.shipping,order.discount,order.tax);
   if(snapshot.lineCents.some((n,i)=>n!==Math.round(Number(rows[i].line_total)*100)||!rows[i].description?.trim())||
      Math.abs(snapshot.subtotal-Number(order.subtotal))>0.005||
      Math.abs(snapshot.total-Number(order.total))>0.005)throw Error('Mismatch');
  }catch{reasons.push('SOURCE_LINE_ITEMS_INVALID');}
  let existingDraft:string|null=null;
  try{
   const row=await db.prepare(`SELECT q.reference FROM b2b_recovery_quote_links l JOIN quotes q ON q.id=l.recovery_quote_id
      WHERE l.source_order_id=? LIMIT 1`).bind(order.id).first<{reference:string}>();
   existingDraft=row?.reference||null;
  }catch{ /* Legacy databases may not have a recovery link table yet. */ }
  return reply({ok:true,readOnly:true,advisory:true,orderReference:order.reference,
   eligible:reasons.length===0,reasonCodes:reasons,unlinkedLines:unlinked.length,
   itemLines:rows.length,units:quantity,hasExistingDraft:Boolean(existingDraft),existingDraft,
   guidance:'Only a live POST performs final atomic checks. No quote, payment or order was modified.'});
 }catch(error){console.error('admin_wholesale_recovery_readiness_failed',error);return reply({ok:false,error:'Unable to inspect historical order readiness.'},503);}
};
