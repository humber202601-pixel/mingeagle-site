// Admin-only read-only preflight. The existing quote-send route remains the
// final decision gate and recalculates procurement immediately before release.
import {verifyQuoteProcurement} from '../../../lib/quote-procurement-review';
import {quoteTermsIssues,stripeCheckoutTermsSupported} from '../../../lib/b2b-quote-terms';
import {quoteTotals} from '../../../lib/quote-totals';
import {quoteReleaseFingerprint} from '../../../lib/b2b-quote-release-fingerprint';
import {isUsDeliveryState} from '../../../lib/us-delivery-states';
interface Env{MINGEAGLE_DB?:D1Database}
type Quote={id:string;reference:string;status:string;currency:string|null;subtotal:number;discount:number|null;shipping:number;tax:number;total:number;tax_basis:string|null;payment_terms:string|null;shipping_terms:string|null;valid_until:string|null};
type Item={id:string;product_id:string|null;variant_id:string|null;sort_order:number;description:string;quantity:number;unit_price:number;line_total:number};
const reply=(data:Record<string,unknown>,status=200)=>Response.json(data,{status,headers:{'cache-control':'private, no-store'}});
export const onRequestGet:PagesFunction<Env>=async({request,env})=>{
 const db=env.MINGEAGLE_DB;if(!db)return reply({ok:false,error:'CRM database unavailable'},503);
 const quoteId=new URL(request.url).searchParams.get('quoteId')||'';
 if(!/^[A-Za-z0-9_-]{3,128}$/.test(quoteId))return reply({ok:false,error:'Invalid quotation identifier'},400);
 try{
  const quote=await db.prepare('SELECT id,reference,status,currency,subtotal,discount,shipping,tax,total,tax_basis,payment_terms,shipping_terms,valid_until FROM quotes WHERE id=? LIMIT 1').bind(quoteId).first<Quote>();
  if(!quote)return reply({ok:false,error:'Quotation not found'},404);
  const result=await db.prepare('SELECT id,product_id,variant_id,sort_order,description,quantity,unit_price,line_total FROM quote_items WHERE quote_id=? ORDER BY sort_order,id').bind(quote.id).all<Item>();
  if(!Array.isArray(result.results))throw Error('Missing quotation lines');
  const review=await verifyQuoteProcurement(db,result.results.map(r=>({description:r.description,quantity:r.quantity,unitPrice:r.unit_price})),
   quote.discount??0,String(quote.currency||'USD'),new Date().toISOString().slice(0,10));
  const termsIssues=quoteTermsIssues(quote);
  // The preview must surface the same Stripe-only payment rule enforced at
  // quote release, before staff asks a buyer to accept an unpayable quotation.
  if(!stripeCheckoutTermsSupported(quote.payment_terms))termsIssues.push('STRIPE_ONLY_QUOTE_TERMS');
  // Match the authoritative quote-send check for seller-confirmed US
  // destination and sales-tax basis before declaring a quote releasable.
  // A UI preview is never the final authorization boundary.
  if(stripeCheckoutTermsSupported(quote.payment_terms)){
   const state=String(quote.shipping_terms||'').toUpperCase()
    .match(/SHIP-TO STATE:\s*([A-Z]{2})(?![A-Z])/)?.[1];
   if(!isUsDeliveryState(state)||!String(quote.tax_basis||'').trim()||
     !Number.isFinite(Number(quote.tax))||Number(quote.tax)<0)
    termsIssues.push('B2B_STRIPE_QUOTE_NOT_PAYABLE');
  }
  const wholesaleUnits=result.results.reduce((sum,item)=>sum+Number(item.quantity||0),0);
  const computed=quoteTotals(result.results.map(r=>({quantity:r.quantity,unitPrice:r.unit_price})),
   quote.shipping??0,quote.discount??0,quote.tax??0);
  const amountMatchesQuote=quote.currency==='USD'
    &&result.results.every((row,i)=>Number.isFinite(Number(row.line_total))&&
      computed.lineCents[i]===Math.round(Number(row.line_total)*100))
    &&computed.subtotalCents===Math.round(Number(quote.subtotal)*100)
    &&computed.totalCents===Math.round(Number(quote.total)*100);
  const issues=[...review.issues,...termsIssues,...(!amountMatchesQuote?['QUOTE_TOTALS_MISMATCH']:[])];
  // IMPORTANT: This is only an SKU/size product-cost floor; shipping charge
  // and sales tax are NOT profit, and operational costs remain unknown.
  const baseline=amountMatchesQuote?review.baselineMerchandiseCostCents:null;
  const difference=baseline===null?null:(computed.subtotalCents-computed.discountCents-baseline);
  const quoteFingerprint=await quoteReleaseFingerprint(quote,result.results);
  const commercialChecksPassed=review.ok&&issues.length===0&&['DRAFT','SENT','VIEWED'].includes(quote.status);
  // This GET is read-only and cannot verify the six-cost release proof that staff
  // must submit with the subsequent POST. Do not advertise wholesale quotes as
  // fully releasable merely because their commercial terms passed preflight.
  const remainingReleaseGates=[
   ...(wholesaleUnits>=10?['LANDED_COST_PROOF_REQUIRED']:[]),
   ...(review.unverified>0?['SUPPLIER_COST_ACK_REQUIRED']:[])
  ];
  return reply({ok:true,quoteReference:quote.reference,quoteStatus:quote.status,quoteFingerprint,
   review:{requiresLandedCostReview:wholesaleUnits>=10,commercialChecksPassed,
    safeForManualRelease:commercialChecksPassed&&remainingReleaseGates.length===0,
    remainingReleaseGates,
    issues,approvedSkuBaselines:review.matched,
    unverifiedSkuBaselines:review.unverified,
    supplierConfirmationRequired:review.unverified>0,
    commercialEstimate:{
      basis:baseline===null?'NOT_CALCULABLE':'SKU_SIZE_COST_FLOOR_ONLY',
      netMerchandiseUSD:(computed.subtotalCents-computed.discountCents)/100,
      approvedFactoryCostBaselineUSD:baseline===null?null:baseline/100,
      merchandiseDifferenceBeforeOtherCostsUSD:difference===null?null:difference/100,
      shippingCollectedUSD:computed.shipping, salesTaxCollectedUSD:computed.tax,
      totalQuotedUSD:computed.total,
      isGrossProfit:false,
      missingProof:['Color and packaging-specific purchase pricing','Actual freight and destination handling','Customs and import duties','Stripe payment/FX fees','Returns, replacements and other costs']
    },
    note:review.note,
    caveat:'Approved SKU-size purchasing baselines are not landed costs, profit margins, tax, duty, freight or color/packaging validation. This read-only check does not send or approve a quotation.'}});
 }catch{return reply({ok:false,error:'Procurement preflight unavailable; do not assume unverified sourcing is approved'},503)}
};
