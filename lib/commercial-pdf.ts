import {quoteTotals,usdCents} from './quote-totals';

export type CommercialDocKind='quotation'|'pi';
export type DocLine={description:string;quantity:number;unit_price:number;line_total:number};
export type DocAmounts={reference:string;currency:string;subtotal:number;discount:number;shipping:number;tax:number;total:number;
 payment_terms:string|null;shipping_terms:string|null;notes:string|null;valid_until:string|null;created_at:string;
 sent_at?:string|null};
export type CommercialDocument={kind:CommercialDocKind;quote:DocAmounts;rows:DocLine[];
 buyer:string;contact:string;orderReference?:string;orderDate?:string|null};
const PAGE_W=595,PAGE_H=842,LEFT=43,RIGHT=552;
const money=(v:number)=>'USD '+v.toFixed(2);
const clean=(value:unknown,max=500)=>String(value??'').normalize('NFKD')
 .replace(/[\u0300-\u036f]/g,'').replace(/[\u2012-\u2015]/g,'-')
 .replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"')
 .replace(/[^\x20-\x7E]/g,'?').slice(0,max);
const esc=(s:string)=>clean(s).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
const wrap=(s:string,max=72)=>{
 const out:string[]=[];
 for(const paragraph of clean(s,2000).split(/\s*\n\s*/)){
  const words=paragraph.split(/\s+/).filter(Boolean);
  if(!words.length){out.push('');continue}
  let line='';
  for(let word of words){
   while(word.length>max){if(line){out.push(line);line=''}out.push(word.slice(0,max));word=word.slice(max)}
   if(!line){line=word;continue}
   if(line.length+word.length+1>max){out.push(line);line=word}else line+=' '+word;
  }
  if(line)out.push(line);
 }
 return out;
};
export function validateCommercialDocument(doc:CommercialDocument){
 if(doc.quote.currency!=='USD')throw Error('DOCUMENT_USD_ONLY');
 if(!doc.rows.length||doc.rows.length>20)throw Error('INVALID_DOCUMENT_ITEMS');
 const totals=quoteTotals(doc.rows.map(r=>({quantity:r.quantity,unitPrice:r.unit_price})),
  doc.quote.shipping,doc.quote.discount,doc.quote.tax);
 for(let i=0;i<doc.rows.length;i++){
  if(Math.abs(totals.lineCents[i]-usdCents(doc.rows[i].line_total))>1)
   throw Error('DOCUMENT_LINE_AMOUNT_MISMATCH');
 }
 if(Math.abs(totals.subtotalCents-usdCents(doc.quote.subtotal))>1
  ||Math.abs(totals.totalCents-usdCents(doc.quote.total))>1)
  throw Error('DOCUMENT_TOTAL_MISMATCH');
 if(doc.kind==='pi'&&(!doc.orderReference||!doc.orderDate))throw Error('PI_REQUIRES_CONFIRMED_ORDER');
 return totals;
}
// Server-side PDF 1.4 writer: no third-party API, images, scripts, links or
// auto-mail actions. All content is ASCII-escaped and financial figures checked.
// A4; per-page column headings; automatic continuation and footer page numbering.
export function renderCommercialPdf(doc:CommercialDocument):Uint8Array{
 const totals=validateCommercialDocument(doc);
 const pages:string[][]=[];let ops:string[]=[],y=0;
 const text=(x:number,atY:number,s:string,size=9,bold=false)=>{
  ops.push('BT /'+(bold?'F2':'F1')+' '+size+' Tf 1 0 0 1 '+x.toFixed(1)+' '+atY.toFixed(1)+' Tm ('+esc(s)+') Tj ET');
 };
 const line=(x1:number,y1:number,x2:number,y2:number)=>{
  ops.push('0.79 0.83 0.88 RG 0.6 w '+x1.toFixed(1)+' '+y1.toFixed(1)+' m '+x2.toFixed(1)+' '+y2.toFixed(1)+' l S');
 };
 const sectionHeader=()=>{
  ops.push('0.07 0.13 0.23 rg '+LEFT+' 756 509 44 re f');
  ops.push('1 1 1 rg');
  text(LEFT+15,773,'MING EAGLE',19,true);
  text(405,773,doc.kind==='pi'?'PROFORMA INVOICE':'QUOTATION',12,true);
  ops.push('0 0 0 rg');
  y=730;
  text(LEFT,y,'MING EAGLE COMMERCE LLC',11,true);y-=16;
  text(LEFT,y,'www.mingeagle.com  |  mingeaglecommerce@gmail.com',8);
  const label=doc.kind==='pi'?'PI reference':'Quote reference';
  text(LEFT,y-26,label+': '+(doc.kind==='pi'?'PI-'+doc.orderReference:'QT-'+doc.quote.reference),9,true);
  text(LEFT,y-41,'Source quote: '+doc.quote.reference,8);
  text(LEFT,y-55,'Revision: '+(doc.quote.reference.match(/-R(\d+)$/)?.[1]||'Original')+'  |  Currency: USD',8);
  text(LEFT,y-69,'Document date: '+clean(doc.kind==='pi'?doc.orderDate:doc.quote.sent_at||doc.quote.created_at).slice(0,10),8);
  text(LEFT,y-83,'Quote validity: '+clean(doc.quote.valid_until||'Not specified').slice(0,10),8);
  y-=107;
  line(LEFT,y,RIGHT,y);y-=17;
  text(LEFT,y,'PREPARED FOR',8,true);y-=14;
  for(const name of wrap(doc.buyer||'Customer name not provided',75).slice(0,2)){text(LEFT,y,name,9);y-=13}
  if(doc.contact&&doc.contact!==doc.buyer){text(LEFT,y,clean(doc.contact,80),8);y-=14}
  y-=9;
  line(LEFT,y,RIGHT,y);y-=20;
 };
 const tableHeading=()=>{
  ops.push('0.94 0.96 0.98 rg '+LEFT+' '+(y-10)+' 509 25 re f');ops.push('0 0 0 rg');
  text(LEFT+7,y-1,'DESCRIPTION',9,true);
  text(379,y-1,'QTY',9,true);text(432,y-1,'UNIT (USD)',9,true);text(507,y-1,'AMOUNT',9,true);
  y-=31;
 };
 const newPage=()=>{if(ops.length)pages.push(ops);ops=[];sectionHeader();tableHeading()};
 const safeSpace=(required:number)=>{if(y-required<95)newPage()};
 newPage();
 for(let i=0;i<doc.rows.length;i++){
  const r=doc.rows[i],desc=wrap(r.description,50).slice(0,5);
  const height=Math.max(22,desc.length*13+8);
  safeSpace(height);
  text(LEFT+7,y,String(i+1).padStart(2,'0')+'  '+(desc[0]||'Item'),8.8);
  for(let j=1;j<desc.length;j++)text(LEFT+26,y-j*13,desc[j],8.5);
  text(379,y,String(r.quantity),9);
  text(432,y,r.unit_price.toFixed(2),9);
  text(507,y,r.line_total.toFixed(2),9);
  y-=height;line(LEFT,y+2,RIGHT,y+2);y-=8;
 }
 safeSpace(155);
 y-=7;
 const totalsList:[string,string][]=[
  ['Merchandise subtotal',money(totals.subtotal)],
  ['Discount','-'+money(totals.discount)],
  ['Shipping',money(totals.shipping)],
  ['Tax',money(totals.tax)],
  ['TOTAL PAYABLE',money(totals.total)],
 ];
 for(let i=0;i<totalsList.length;i++){
  const [label,amount]=totalsList[i];
  if(i===4){line(330,y+12,RIGHT,y+12);y-=2}
  text(333,y,label,i===4?10:9,i===4);
  text(481,y,amount,i===4?10:9,i===4);
  y-=18;
 }
 const details=[
  ['PAYMENT TERMS',doc.quote.payment_terms||'To be confirmed by seller before payment.'],
  ['SHIPPING / DELIVERY TERMS',doc.quote.shipping_terms||'Subject to seller confirmation.'],
 ];
 if(doc.quote.notes&&!/^Wholesale draft\./i.test(doc.quote.notes.trim()))
  details.push(['CUSTOMER NOTES',doc.quote.notes]);
 if(doc.kind==='pi'){
  details.push(['PROFORMA STATUS','Issued from an accepted CRM order. Not a tax invoice, payment receipt, or proof of dispatch.']);
  details.push(['PAYMENT INSTRUCTIONS','No bank account or payment destination is specified in this document. Confirm separately through an authorized MING EAGLE channel.']);
 }else details.push(['QUOTATION STATUS','Exported from an approved, customer-released CRM quotation. Not a payment request or tax invoice.']);
 for(const [label,desc] of details){
  const lines=wrap(desc,104).slice(0,8);
  safeSpace(25+lines.length*13);
  text(LEFT,y,label,8.5,true);y-=15;
  for(const val of lines){text(LEFT,y,val,8);y-=12}
  y-=12;
 }
 pages.push(ops);
 // Fixed stable indirect object IDs. No JavaScript or external resources.
 const objects:string[]=['','<< /Type /Catalog /Pages 2 0 R >>','', 
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'];
 const pageRefs:number[]=[];
 for(let i=0;i<pages.length;i++){
  const pageOps=pages[i];
  pageOps.push('0.5 0.55 0.6 RG 0.6 w 43 60 m 552 60 l S');
  pageOps.push('0 0 0 rg');
  pageOps.push('BT /F1 8 Tf 1 0 0 1 43 45 Tm (MING EAGLE COMMERCE LLC - INTERNAL ADMIN EXPORT) Tj ET');
  pageOps.push('BT /F1 8 Tf 1 0 0 1 490 45 Tm (Page '+(i+1)+' / '+pages.length+') Tj ET');
  const stream=pageOps.join('\n')+'\n';
  const content=objects.push('<< /Length '+stream.length+' >>\nstream\n'+stream+'endstream');
  const page=objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+PAGE_W+' '+PAGE_H+'] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents '+content+' 0 R >>');
  pageRefs.push(page);
 }
 objects[2]='<< /Type /Pages /Kids ['+pageRefs.map(n=>n+' 0 R').join(' ')+'] /Count '+pages.length+' >>';
 let pdf='%PDF-1.4\n',offsets=[0];
 for(let id=1;id<objects.length;id++){
  offsets[id]=pdf.length;
  pdf+=id+' 0 obj\n'+objects[id]+'\nendobj\n';
 }
 const xref=pdf.length;
 pdf+='xref\n0 '+objects.length+'\n0000000000 65535 f \n';
 for(let id=1;id<objects.length;id++)pdf+=String(offsets[id]).padStart(10,'0')+' 00000 n \n';
 pdf+='trailer\n<< /Size '+objects.length+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';
 return new TextEncoder().encode(pdf);
}
