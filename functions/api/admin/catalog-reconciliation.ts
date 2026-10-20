interface Env { MINGEAGLE_DB: D1Database; ADMIN_ACCESS_KEY?: string }
type MissingLine = {
  order_reference:string; order_status:string; payment_status:string; currency:string;
  order_total:number; item_id:string; description:string; quantity:number;
  unit_price:number; line_total:number;
}
type CatalogVariant = {
  product_sku:string; product_name:string; product_status:string;
  variant_sku:string; variant_name:string; size:string|null; color:string|null;
  retail_price:number|null;
}
const reply=(value:object,status=200)=>Response.json(value,{status,headers:{'cache-control':'private, no-store'}});

async function sameSecret(a:string,b:string){
  const enc=new TextEncoder();
  const [ha,hb]=await Promise.all([crypto.subtle.digest('SHA-256',enc.encode(a)),crypto.subtle.digest('SHA-256',enc.encode(b))]);
  const x=new Uint8Array(ha),y=new Uint8Array(hb);let diff=0;
  for(let i=0;i<x.length;i++)diff|=x[i]^y[i];
  return diff===0;
}

// Read-only report. It deliberately never guesses product/variant matches and
// never mutates historical orders, quote records, or payment evidence.
export const onRequestGet:PagesFunction<Env>=async({request,env})=>{
  const expected=env.ADMIN_ACCESS_KEY||'';
  const supplied=request.headers.get('x-admin-key')||'';
  if(!expected||!supplied||!await sameSecret(supplied,expected))
    return reply({ok:false,error:'Unauthorized.'},401);
  if(!env.MINGEAGLE_DB)return reply({ok:false,error:'Database is not configured.'},503);
  try{
    const [missing,catalog]=await Promise.all([
      env.MINGEAGLE_DB.prepare(`SELECT o.reference AS order_reference,o.status AS order_status,
        o.payment_status,o.currency,o.total AS order_total,i.id AS item_id,
        i.description,i.quantity,i.unit_price,i.line_total
        FROM orders o JOIN order_items i ON i.order_id=o.id
        WHERE i.product_id IS NULL OR i.variant_id IS NULL
        ORDER BY o.created_at ASC,o.reference,i.id`).all<MissingLine>(),
      env.MINGEAGLE_DB.prepare(`SELECT p.sku AS product_sku,p.name AS product_name,
        p.status AS product_status,v.variant_sku,v.name AS variant_name,
        v.size,v.color,v.retail_price
        FROM products p JOIN product_variants v ON v.product_id=p.id
        WHERE p.status='ACTIVE' AND v.active=1
        ORDER BY p.sort_order,p.sku,CAST(v.size AS INTEGER),v.color`).all<CatalogVariant>()
    ]);
    const rows=missing.results||[],variants=catalog.results||[];
    return reply({ok:true,readOnly:true,automaticMatching:false,
      summary:{unlinkedLines:rows.length,unlinkedOrders:new Set(rows.map(x=>x.order_reference)).size,
        activeCatalogVariants:variants.length},
      missingLines:rows.map(x=>({...x,reviewRequired:true,
        qaOrTest:/QA TEST|DO NOT SEND|TEST ORDER/i.test(x.description),
        candidateVariants:[]})),
      catalog:variants,
      guidance:'Select a product and variant only after checking the original purchase record or buyer-confirmed specification. This endpoint does not save associations, create quotes, send email, or initiate payment.'});
  }catch(error){
    console.error('admin_catalog_reconciliation_report_failed',error);
    return reply({ok:false,error:'Unable to load the read-only catalog reconciliation report.'},503);
  }
};
