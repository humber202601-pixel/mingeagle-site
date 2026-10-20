interface Env { MINGEAGLE_DB?: D1Database; ADMIN_ACCESS_KEY?: string }
type Input={orderReference?:string;itemId?:string;variantSku?:string;confirmOriginalEvidence?:boolean};
type Row=Record<string,unknown>;
const reply=(v:object,status=200)=>Response.json(v,{status,headers:{'cache-control':'private, no-store'}});
async function sameSecret(a:string,b:string){
 const enc=new TextEncoder();const [ha,hb]=await Promise.all([crypto.subtle.digest('SHA-256',enc.encode(a)),crypto.subtle.digest('SHA-256',enc.encode(b))]);
 const x=new Uint8Array(ha),y=new Uint8Array(hb);let diff=0;for(let i=0;i<x.length;i++)diff|=x[i]^y[i];return diff===0;
}
export const onRequestPost:PagesFunction<Env>=async({request,env})=>{
 const expected=env.ADMIN_ACCESS_KEY||'',supplied=request.headers.get('x-admin-key')||'';
 if(!expected||!supplied||!await sameSecret(supplied,expected))return reply({ok:false,error:'Unauthorized.'},401);
 if(!env.MINGEAGLE_DB)return reply({ok:false,error:'Database is not configured.'},503);
 const input=await request.json().catch(()=>null) as Input|null;
 const orderReference=String(input?.orderReference||'').trim(),itemId=String(input?.itemId||'').trim(),variantSku=String(input?.variantSku||'').trim();
 if(!orderReference||!itemId||!variantSku)return reply({ok:false,error:'Order, line item and variant SKU are required.'},400);
 if(input?.confirmOriginalEvidence!==true)return reply({ok:false,error:'Explicit confirmation of original buyer/purchase evidence is required.'},400);
 const db=env.MINGEAGLE_DB;
 try{
  const source=await db.prepare(`SELECT o.id AS order_id,o.reference,o.status,o.payment_status,i.id AS item_id,i.product_id,i.variant_id,i.description,i.quantity,i.unit_price,i.line_total
    FROM orders o JOIN order_items i ON i.order_id=o.id WHERE o.reference=? AND i.id=? LIMIT 1`).bind(orderReference,itemId).first<Row>();
  if(!source)return reply({ok:false,error:'Order line not found.'},404);
  if(source.product_id||source.variant_id)return reply({ok:false,error:'This line already has a product/variant association; overwrite is blocked.'},409);
  const variant=await db.prepare(`SELECT v.id AS variant_id,v.variant_sku,v.name AS variant_name,v.size,v.color,v.active,p.id AS product_id,p.sku AS product_sku,p.name AS product_name,p.status AS product_status
   FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.variant_sku=? LIMIT 1`).bind(variantSku).first<Row>();
  if(!variant||variant.active!==1||variant.product_status!=='ACTIVE')return reply({ok:false,error:'Selected variant is missing or inactive.'},409);
  const marker=/QA TEST|DO NOT SEND|TEST ORDER/i.test(String(source.description||''));
  if(marker)return reply({ok:false,error:'QA/test order lines cannot be associated through the customer recovery workflow.'},409);
  await db.prepare(`CREATE TABLE IF NOT EXISTS order_item_catalog_audit(
    id TEXT PRIMARY KEY,order_id TEXT NOT NULL,order_item_id TEXT NOT NULL,
    order_reference TEXT NOT NULL,previous_product_id TEXT,previous_variant_id TEXT,
    new_product_id TEXT NOT NULL,new_variant_id TEXT NOT NULL,
    source_description TEXT NOT NULL,source_quantity INTEGER NOT NULL,
    source_unit_price REAL NOT NULL,source_line_total REAL NOT NULL,
    confirmed_original_evidence INTEGER NOT NULL CHECK(confirmed_original_evidence=1),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
  const auditId=crypto.randomUUID();
  const result=await db.batch([
   db.prepare(`INSERT INTO order_item_catalog_audit(id,order_id,order_item_id,order_reference,previous_product_id,previous_variant_id,new_product_id,new_variant_id,source_description,source_quantity,source_unit_price,source_line_total,confirmed_original_evidence)
    SELECT ?,o.id,i.id,o.reference,i.product_id,i.variant_id,?,?,i.description,i.quantity,i.unit_price,i.line_total,1
    FROM orders o JOIN order_items i ON i.order_id=o.id
    WHERE o.id=? AND i.id=? AND i.product_id IS NULL AND i.variant_id IS NULL
    AND NOT EXISTS(SELECT 1 FROM order_item_catalog_audit a WHERE a.order_item_id=i.id)`).bind(auditId,String(variant.product_id),String(variant.variant_id),String(source.order_id),itemId),
   db.prepare(`UPDATE order_items SET product_id=?,variant_id=?
    WHERE id=? AND order_id=? AND product_id IS NULL AND variant_id IS NULL
    AND EXISTS(SELECT 1 FROM order_item_catalog_audit a WHERE a.id=? AND a.order_item_id=order_items.id)`)
    .bind(String(variant.product_id),String(variant.variant_id),itemId,String(source.order_id),auditId)
  ]);
  if(Number(result?.[0]?.meta?.changes||0)!==1||Number(result?.[1]?.meta?.changes||0)!==1)
    return reply({ok:false,error:'Association was not saved; the line may have changed. Reload the report and retry.'},409);
  return reply({ok:true,orderReference,itemId,variant:{productSku:variant.product_sku,productName:variant.product_name,variantSku:variant.variant_sku,variantName:variant.variant_name,size:variant.size,color:variant.color},financialSnapshotUnchanged:true,auditId},200);
 }catch(error){console.error('admin_order_item_catalog_match_failed',error);return reply({ok:false,error:'Unable to save catalog association safely.'},503);}
};
