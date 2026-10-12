import {SKU_LABELS} from './supplier-pricing';

// A source catalog only covers product family + size, NOT color/custom packaging.
// The result is a purchase-cost FLOOR advisory for internal review, not full gross
// margin, landed cost, freight, tax, or a guarantee of an identical vendor variant.
export type RfqSupplierLine={product:string;size:string;color:string;quantity:number};
export type ApprovedCostRow={sku:string;status:string;currency:string;moq:number;case_pack:number;
 effective_on:string;expires_on:string;tiers_json:string;version:number};
const productIds:Record<string,string>={
 'Flocked Silent Basketball Set':'P1',
 'Fabric-Cover Silent Basketball Set':'P2',
 'Weighted Flocked Silent Basketball':'P3',
 'Flocked Silent Soccer Ball':'P4',
};
export function internalSkuForRfq(line:Pick<RfqSupplierLine,'product'|'size'>):string|null{
 const prefix=productIds[line.product],sku=prefix+'-S'+line.size;
 return prefix&&Object.prototype.hasOwnProperty.call(SKU_LABELS,sku)?sku:null;
}
export type CostAssessment={
 ok:boolean;issues:string[];approvedLines:number;unverifiedLines:number;
 rows:Array<{sku:string|null;state:'APPROVED_BASELINE'|'UNVERIFIED'|'STALE'|'INVALID';
  unitCostCents:number|null;supplierVersion:number|null;unitContributionCents:number|null;
  contributionPct:number|null;reason:string}>;
};
export function assessRfqPurchaseCosts(
  lines:RfqSupplierLine[],unitSellCents:number[],supplierRows:ApprovedCostRow[],utcDate:string,
):CostAssessment{
 const issues:string[]=[];const detail:CostAssessment['rows']=[];
 if(lines.length!==unitSellCents.length||lines.length<1||lines.length>20)
  return {ok:false,issues:['INVALID_LINES'],approvedLines:0,unverifiedLines:0,rows:[]};
 const catalog=new Map(supplierRows.map(x=>[x.sku,x]));
 for(let i=0;i<lines.length;i++){
  const l=lines[i],sku=internalSkuForRfq(l);
  const base={sku,unitCostCents:null,supplierVersion:null,unitContributionCents:null,
    contributionPct:null,reason:'Await supplier source or variant review'};
  const row=sku?catalog.get(sku):undefined;
  if(!sku||!row||row.status!=='APPROVED'){
   detail.push({...base,state:'UNVERIFIED'});continue;
  }
  if(row.effective_on>utcDate||row.expires_on<utcDate){
   detail.push({...base,state:'STALE',reason:'Approved source is outside validity window'});continue;
  }
  if(row.currency!=='USD'||!Number.isSafeInteger(row.version)||row.version<1||
     !Number.isSafeInteger(row.moq)||row.moq<1||!Number.isSafeInteger(row.case_pack)||row.case_pack<1){
   issues.push('LINE_'+(i+1)+'_INVALID_COST_SOURCE');
   detail.push({...base,state:'INVALID',reason:'Invalid approved supplier source'});continue;
  }
  let tiers:unknown;
  try{tiers=JSON.parse(row.tiers_json)}catch{tiers=null}
  if(!Array.isArray(tiers)||tiers.length<1||tiers.length>12||
   tiers.some((x,j)=>!x||typeof x!=='object'||!Number.isSafeInteger(x.minimumQuantity)||
    !Number.isSafeInteger(x.purchaseCents)||x.purchaseCents<1||
    (j===0&&x.minimumQuantity!==row.moq)||
    (j>0&&x.minimumQuantity<=tiers[j-1].minimumQuantity))){
   issues.push('LINE_'+(i+1)+'_INVALID_COST_TIERS');
   detail.push({...base,state:'INVALID',reason:'Malformed approved purchasing tiers'});continue;
  }
  if(l.quantity<row.moq)issues.push('LINE_'+(i+1)+'_BELOW_APPROVED_MOQ');
  if(l.quantity%row.case_pack!==0)issues.push('LINE_'+(i+1)+'_NOT_APPROVED_CASE_MULTIPLE');
  const applicable=tiers.filter(t=>t.minimumQuantity<=l.quantity).at(-1);
  if(!applicable){
   issues.push('LINE_'+(i+1)+'_NO_APPLICABLE_TIER');
   detail.push({...base,state:'INVALID',reason:'No applicable supplier cost tier'});continue;
  }
  const cost=applicable.purchaseCents,sell=unitSellCents[i];
  if(!Number.isSafeInteger(sell)||sell<1||sell<=cost)
   issues.push('LINE_'+(i+1)+'_AT_OR_BELOW_APPROVED_COST');
  const delta=sell-cost;
  detail.push({sku,state:'APPROVED_BASELINE',unitCostCents:cost,supplierVersion:row.version,
    unitContributionCents:delta,contributionPct:Number((delta/sell*100).toFixed(2)),
    reason:'SKU family and size only; verify color, packing, freight, taxes and fees before approval'});
 }
 return {ok:issues.length===0,issues,approvedLines:detail.filter(x=>x.state==='APPROVED_BASELINE').length,
  unverifiedLines:detail.filter(x=>x.state!=='APPROVED_BASELINE').length,rows:detail};
}
