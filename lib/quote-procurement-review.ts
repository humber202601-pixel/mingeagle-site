import {confirmedQuantity,usdCents} from './quote-totals';
import {assessRfqPurchaseCosts,internalSkuForRfq,type ApprovedCostRow,type RfqSupplierLine} from './rfq-cost-review';

// This is a supplier SKU/size *cost floor*, not an accurate landed/gross margin.
// Manual customer discount is assumed proportional across merchandise lines;
// there is no freight/tax reduction in the cost basis.
export type QuotationLine={description:string;quantity:number|string;unitPrice:number|string};
export type QuoteProcurementResult={
  ok:boolean; issues:string[]; matched:number; unverified:number;
  discountReviewed:boolean; note:string;
  // Product-family/size purchase-cost baseline only: excludes confirmed color,
  // packaging, freight, customs, duties, fees, return exposure and tax.
  baselineMerchandiseCostCents:number|null;netMerchandiseBeforeDeliveryCents:number;
};
export function quoteLineSku(description:string):string|null{
  const match=/^(.+?) \| No\. ([3-7]) \| ([^\n|]{1,100})$/.exec(description.trim());
  if(!match)return null;
  return internalSkuForRfq({product:match[1],size:match[2]});
}
const parse=(description:string,quantity:number):RfqSupplierLine=>{
  const match=/^(.+?) \| No\. ([3-7]) \| ([^\n|]{1,100})$/.exec(description.trim());
  return match?{product:match[1],size:match[2],color:match[3],quantity}
    :{product:'',size:'',color:'',quantity};
};
export async function verifyQuoteProcurement(
  db:D1Database, lines:QuotationLine[], discountUSD:number|string,
  currency:string,utcDate:string,
):Promise<QuoteProcurementResult>{
  if(!Array.isArray(lines)||!lines.length||lines.length>20)throw Error('INVALID_QUOTE_LINES');
  const skus=[...new Set(lines.map(l=>quoteLineSku(String(l.description||''))).filter((x):x is string=>!!x))];
  const quantities=lines.map(l=>confirmedQuantity(l.quantity));
  const prices=lines.map(l=>usdCents(l.unitPrice,100000,true));
  const subtotalCents=prices.reduce((sum,price,i)=>sum+price*quantities[i],0);
  if(!Number.isSafeInteger(subtotalCents)||subtotalCents<1)throw Error('INVALID_QUOTE_SUBTOTAL');
  const discountCents=usdCents(discountUSD,1000000000,false);
  if(discountCents>=subtotalCents)throw Error('INVALID_QUOTE_DISCOUNT');
  if(!skus.length)return {ok:true,issues:[],matched:0,unverified:lines.length,
    discountReviewed:false,note:'No SKU-size supplier price match. Manual review still required.',
    baselineMerchandiseCostCents:null,netMerchandiseBeforeDeliveryCents:subtotalCents-discountCents};
  if(currency!=='USD')return {ok:false,issues:['SKU_COST_CURRENCY_NOT_USD'],matched:0,
    unverified:lines.length,discountReviewed:false,note:'USD purchase cost cannot be compared to foreign-currency quotations.',
    baselineMerchandiseCostCents:null,netMerchandiseBeforeDeliveryCents:subtotalCents-discountCents};
  // A catalog failure must block release/edit; never silently treat a failed
  // supplier database query as zero supplier costs.
  const res=await db.prepare(`SELECT sku,status,currency,moq,case_pack,effective_on,expires_on,tiers_json,version
    FROM supplier_purchase_terms WHERE sku IN (${skus.map(()=>'?').join(',')})`).bind(...skus).all<ApprovedCostRow>();
  if(!Array.isArray(res.results))throw Error('SUPPLIER_COST_LOOKUP_FAILED');
  const check=assessRfqPurchaseCosts(lines.map((line,i)=>parse(String(line.description||''),quantities[i])),
    prices,res.results,utcDate);
  const issues=[...check.issues];
  // A whole-quote discount can undercut supplier cost even if each displayed
  // unit price exceeds purchase cost. Compare exact integer products via BigInt.
  for(let i=0;i<check.rows.length;i++){
    const row=check.rows[i];
    if(row.state!=='APPROVED_BASELINE'||row.unitCostCents===null)continue;
    if(BigInt(prices[i])*BigInt(subtotalCents-discountCents)
      <=BigInt(row.unitCostCents)*BigInt(subtotalCents)){
      issues.push('LINE_'+(i+1)+'_DISCOUNTED_BELOW_COST');
    }
  }
  // Never calculate a seemingly complete gross margin from partial or
  // invalid purchasing sources. A valid approved SKU/size cost basis still
  // cannot certify a specific color, packaging, DDP shipment or Stripe fees.
  const completeBasis=check.ok&&check.unverifiedLines===0&&check.rows.length===lines.length
    &&check.rows.every(row=>row.state==='APPROVED_BASELINE'&&
      Number.isSafeInteger(row.unitCostCents)&&Number(row.unitCostCents)>0);
  const estimatedCost=completeBasis
    ?check.rows.reduce((sum,row,i)=>sum+Number(row.unitCostCents)*quantities[i],0):null;
  const baselineMerchandiseCostCents=estimatedCost!==null&&Number.isSafeInteger(estimatedCost)
    ?estimatedCost:null;
  return {ok:issues.length===0,issues:[...new Set(issues)],
    matched:check.approvedLines,unverified:check.unverifiedLines,
    discountReviewed:check.approvedLines>0&&discountCents>0,
    baselineMerchandiseCostCents,netMerchandiseBeforeDeliveryCents:subtotalCents-discountCents,
    note:'Procurement cost checks exclude color-specific supplier variants, packaging, duties, processing fees and freight. Not a margin calculation.'};
}
