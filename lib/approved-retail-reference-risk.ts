import retailReference from '../public/retail-prices.json';

// Public product-size price comparison only. A purchasing tier can apply at a
// wholesale MOQ, not necessarily to a one-unit sample; this is a warning and
// never an automatic retail price change or accounting margin calculation.
type SupplierRow={sku:string;currency:string;moq:number;tiers_json:string};
export function approvedRetailReferenceRisk(rows:SupplierRow[]){
 const refs=retailReference.products as Record<string,Record<string,number>>;
 let comparable=0,belowOrEqual=0,unmatched=0;
 const affectedSkus:string[]=[];
 for(const row of rows){
  const m=/^P([1-4])-S([3-7])$/.exec(String(row.sku||''));
  const retail=m?refs['p'+m[1]]?.[m[2]]:null;
  let raw:unknown;
  try{raw=JSON.parse(row.tiers_json)}catch{raw=null}
  const tiers=Array.isArray(raw)?raw:null;
  const first=tiers?.[0] as {minimumQuantity?:unknown;purchaseCents?:unknown}|undefined;
  const minimum=Number(first?.minimumQuantity),cost=Number(first?.purchaseCents);
  if(row.currency!=='USD'||!Number.isSafeInteger(row.moq)||row.moq<1||
    typeof retail!=='number'||!Number.isFinite(retail)||retail<=0||
    !tiers?.length||!Number.isSafeInteger(minimum)||minimum!==row.moq||
    !Number.isSafeInteger(cost)||cost<=0){
   unmatched++;continue;
  }
  comparable++;
  if(Math.round(retail*100)<=cost){
   belowOrEqual++;affectedSkus.push(String(row.sku));
  }
 }
 return {comparable,atOrBelowSourceUnitCost:belowOrEqual,unmatched,
  affectedSkus};
}
