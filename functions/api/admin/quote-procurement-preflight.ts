// Admin-only read-only preflight. The existing quote-send route remains the
// final decision gate and recalculates procurement immediately before release.
import {verifyQuoteProcurement} from '../../../lib/quote-procurement-review';
import {quoteTermsIssues} from '../../../lib/b2b-quote-terms';
interface Env{MINGEAGLE_DB?:D1Database}
type Quote={id:string;reference:string;status:string;currency:string|null;discount:number|null;payment_terms:string|null;shipping_terms:string|null;valid_until:string|null};
type Item={description:string;quantity:number;unit_price:number};
const reply=(data:Record<string,unknown>,status=200)=>Response.json(data,{status,headers:{'cache-control':'private, no-store'}});
export const onRequestGet:PagesFunction<Env>=async({request,env})=>{
 const db=env.MINGEAGLE_DB;if(!db)return reply({ok:false,error:'CRM database unavailable'},503);
 const quoteId=new URL(request.url).searchParams.get('quoteId')||'';
 if(!/^[A-Za-z0-9_-]{3,128}$/.test(quoteId))return reply({ok:false,error:'Invalid quotation identifier'},400);
 try{
  const quote=await db.prepare('SELECT id,reference,status,currency,discount,payment_terms,shipping_terms,valid_until FROM quotes WHERE id=? LIMIT 1').bind(quoteId).first<Quote>();
  if(!quote)return reply({ok:false,error:'Quotation not found'},404);
  const result=await db.prepare('SELECT description,quantity,unit_price FROM quote_items WHERE quote_id=? ORDER BY sort_order,id').bind(quote.id).all<Item>();
  if(!Array.isArray(result.results))throw Error('Missing quotation lines');
  const review=await verifyQuoteProcurement(db,result.results.map(r=>({description:r.description,quantity:r.quantity,unitPrice:r.unit_price})),
   quote.discount??0,String(quote.currency||'USD'),new Date().toISOString().slice(0,10));
  const termsIssues=quoteTermsIssues(quote);
  return reply({ok:true,quoteReference:quote.reference,quoteStatus:quote.status,
   review:{safeForManualRelease:review.ok&&termsIssues.length===0&&['DRAFT','SENT','VIEWED'].includes(quote.status),
    issues:[...review.issues,...termsIssues],approvedSkuBaselines:review.matched,
    unverifiedSkuBaselines:review.unverified,
    supplierConfirmationRequired:review.unverified>0,
    note:review.note,
    caveat:'Approved SKU-size purchasing baselines are not landed costs, profit margins, tax, duty, freight or color/packaging validation. This read-only check does not send or approve a quotation.'}});
 }catch{return reply({ok:false,error:'Procurement preflight unavailable; do not assume unverified sourcing is approved'},503)}
};
