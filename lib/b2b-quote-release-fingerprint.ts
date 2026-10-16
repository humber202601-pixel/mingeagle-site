/**
 * Deterministic SHA-256 binding for the exact seller-reviewed buyer quotation.
 * This is a staleness/tamper check, NOT proof a supplier's assertion is true.
 * Both server-side preflight and authoritative quote release recompute it from
 * the current database; the browser cannot choose the expected fingerprint.
 */
type QuoteRecord={
 id?:unknown;reference?:unknown;currency?:unknown;subtotal?:unknown;discount?:unknown;
 shipping?:unknown;tax?:unknown;total?:unknown;tax_basis?:unknown;
 payment_terms?:unknown;shipping_terms?:unknown;valid_until?:unknown
};
type LineRecord={
 id?:unknown;product_id?:unknown;variant_id?:unknown;sort_order?:unknown;
 description?:unknown;quantity?:unknown;unit_price?:unknown;line_total?:unknown
};
const normalized=(x:unknown)=>x===undefined||x===null?null:String(x);
export async function quoteReleaseFingerprint(
 q:QuoteRecord,lines:LineRecord[]
):Promise<string>{
 if(!q||!Array.isArray(lines)||!lines.length||lines.length>20)
  throw Error('INVALID_QUOTE_SNAPSHOT');
 const canonical=JSON.stringify({version:1,
  quote:[
   q.id,q.reference,q.currency,q.subtotal,q.discount,q.shipping,q.tax,q.total,
   q.tax_basis,q.payment_terms,q.shipping_terms,q.valid_until
  ].map(normalized),
  items:lines.map(x=>[
   x.id,x.product_id,x.variant_id,x.sort_order,x.description,
   x.quantity,x.unit_price,x.line_total
  ].map(normalized))
 });
 const dig=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical));
 return Array.from(new Uint8Array(dig)).map(v=>v.toString(16).padStart(2,'0')).join('');
}
