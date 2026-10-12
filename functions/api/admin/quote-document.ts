import {renderCommercialPdf,type DocAmounts,type DocLine,type CommercialDocKind} from '../../../lib/commercial-pdf';
interface Env{MINGEAGLE_DB?:D1Database}
type QuoteRow=DocAmounts&{id:string;status:string;sent_at:string|null;buyer:string|null;contact:string|null};
type OrderRow=DocAmounts&{id:string;status:string;payment_status:string;created_at:string};
const error=(message:string,status:number)=>Response.json({ok:false,error:message},{status,headers:{'cache-control':'no-store'}});
const validId=(s:string)=>/^[a-zA-Z0-9-]{4,120}$/.test(s);
export const onRequestGet:PagesFunction<Env>=async({request,env})=>{
 const db=env.MINGEAGLE_DB;if(!db)return error('Database unavailable.',503);
 const url=new URL(request.url),quoteId=url.searchParams.get('quoteId')||'',
   kind=url.searchParams.get('kind') as CommercialDocKind|null;
 if(!validId(quoteId)||!['quotation','pi'].includes(kind||''))return error('A valid quotation id and document type are required.',400);
 try{
  // Export is intentionally read-only: no quote approval, payments, emails,
  // customer tokens or document serial counters can be created here.
  const quote=await db.prepare(`SELECT q.id,q.reference,q.status,q.currency,q.subtotal,q.discount,q.shipping,q.tax,q.total,
    q.payment_terms,q.shipping_terms,q.notes,q.valid_until,q.created_at,q.sent_at,
    COALESCE(c.name,'') AS buyer,COALESCE(ct.full_name,'') AS contact
    FROM quotes q LEFT JOIN companies c ON c.id=q.company_id
    LEFT JOIN contacts ct ON ct.id=q.contact_id WHERE q.id=? LIMIT 1`).bind(quoteId).first<QuoteRow>();
  if(!quote)return error('Quote not found.',404);
  if(!['SENT','VIEWED','ACCEPTED','CONVERTED'].includes(quote.status))
   return error('Only released quotations can be exported. Draft and withdrawn quotes must not be issued.',409);
  let data:DocAmounts=quote,rows:DocLine[]=[],orderReference:string|undefined,orderDate:string|null=null;
  if(kind==='pi'){
   if(!['ACCEPTED','CONVERTED'].includes(quote.status))
    return error('A proforma invoice requires a customer-accepted quotation and linked order.',409);
   const order=await db.prepare(`SELECT id,reference,status,payment_status,currency,subtotal,discount,shipping,tax,total,created_at
     FROM orders WHERE quote_id=? ORDER BY created_at DESC LIMIT 1`).bind(quoteId).first<OrderRow>();
   if(!order||order.status==='CANCELLED')return error('No active customer-confirmed order exists for this proforma invoice.',409);
   const orderLines=await db.prepare(`SELECT description,quantity,unit_price,line_total FROM order_items
      WHERE order_id=? ORDER BY rowid LIMIT 25`).bind(order.id).all<DocLine>();
   if(!orderLines.results?.length||orderLines.results.length>20)return error('Order lines require manual reconciliation before exporting a proforma.',409);
   data={...quote,...order,payment_terms:quote.payment_terms,shipping_terms:quote.shipping_terms,
    notes:quote.notes,valid_until:quote.valid_until,sent_at:quote.sent_at};
   rows=orderLines.results;orderReference=order.reference;orderDate=order.created_at;
  }else{
   const itemRows=await db.prepare(`SELECT description,quantity,unit_price,line_total FROM quote_items
      WHERE quote_id=? ORDER BY sort_order,id LIMIT 25`).bind(quoteId).all<DocLine>();
   rows=itemRows.results||[];
  }
  const pdf=renderCommercialPdf({kind,quote:data,rows,buyer:quote.buyer||quote.contact||'Customer (legal name to be confirmed)',
    contact:quote.contact||'',orderReference,orderDate});
  const safeReference=String(kind==='pi'?orderReference:quote.reference).replace(/[^A-Za-z0-9-]/g,'-').slice(0,100);
  return new Response(pdf.buffer.slice(pdf.byteOffset,pdf.byteOffset+pdf.byteLength) as ArrayBuffer,{
   status:200,headers:{
    'content-type':'application/pdf','content-disposition':`attachment; filename="MING-EAGLE-${kind==='pi'?'Proforma-Invoice':'Quotation'}-${safeReference}.pdf"`,
    'cache-control':'private, no-store','x-content-type-options':'nosniff'
   }
  });
 }catch(e){
  // Do not log buyer data, pricing or raw provider payloads in error logs.
  const issue=e instanceof Error?e.message:'INVALID_DOCUMENT';
  if(/^(INVALID_|DOCUMENT_|PI_REQUIRES)/.test(issue))return error('Recorded commercial totals or line details require manual reconciliation before PDF issue.',409);
  console.error('commercial_document_render_failed');
  return error('Could not generate commercial document.',503);
 }
};
