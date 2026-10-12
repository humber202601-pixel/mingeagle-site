import {usdCents} from './quote-totals';

export const SKU_LABELS:Record<string,string>={
  'P1-S3':'Flocked Silent Basketball Set · No. 3',
  'P1-S5':'Flocked Silent Basketball Set · No. 5',
  'P1-S7':'Flocked Silent Basketball Set · No. 7',
  'P2-S3':'Fabric-Cover Silent Basketball Set · No. 3',
  'P2-S5':'Fabric-Cover Silent Basketball Set · No. 5',
  'P2-S7':'Fabric-Cover Silent Basketball Set · No. 7',
  'P3-S3':'Weighted Flocked Silent Basketball · No. 3',
  'P3-S4':'Weighted Flocked Silent Basketball · No. 4',
  'P3-S6':'Weighted Flocked Silent Basketball · No. 6',
  'P3-S7':'Weighted Flocked Silent Basketball · No. 7',
  'P4-S5':'Flocked Silent Soccer Ball · No. 5',
};
export type Tier={minimumQuantity:number;purchaseCents:number};
export type SupplierTerms={
  sku:string;supplierName:string;supplierSku:string;moq:number;casePack:number;
  tiers:Tier[];sourceNote:string;effectiveOn:string;expiresOn:string;
};
const positiveInt=(v:unknown)=>{
  if(typeof v!=='string'&&typeof v!=='number')throw Error('INVALID_INTEGER');
  const raw=String(v).trim();
  if(!/^[1-9]\d{0,5}$/.test(raw))throw Error('INVALID_INTEGER');
  const result=Number(raw);
  if(result>100000)throw Error('INVALID_INTEGER');
  return result;
};
const isoDate=(v:unknown)=>{
  const s=String(v||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s))throw Error('INVALID_DATE');
  const date=new Date(s+'T00:00:00Z');
  if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==s)throw Error('INVALID_DATE');
  return s;
};
export function normalizeSupplierTerms(value:unknown):SupplierTerms{
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('INVALID_TERMS');
  const x=value as Record<string,unknown>,sku=String(x.sku||'').trim().toUpperCase();
  if(!Object.prototype.hasOwnProperty.call(SKU_LABELS,sku))throw Error('INVALID_SKU');
  const supplierName=String(x.supplierName||'').trim(),supplierSku=String(x.supplierSku||'').trim(),
    sourceNote=String(x.sourceNote||'').trim();
  if(supplierName.length<2||supplierName.length>120||supplierSku.length>80||
    sourceNote.length<8||sourceNote.length>500)throw Error('SOURCE_REQUIRED');
  const moq=positiveInt(x.moq),casePack=positiveInt(x.casePack);
  const effectiveOn=isoDate(x.effectiveOn),expiresOn=isoDate(x.expiresOn);
  if(effectiveOn>expiresOn)throw Error('INVALID_DATE_RANGE');
  const prices=x.tiers;
  if(!Array.isArray(prices)||prices.length>12)throw Error('INVALID_TIERS');
  let last=0;
  const tiers:Tier[]=prices.map((a,i)=>{
    if(!a||typeof a!=='object'||Array.isArray(a))throw Error('INVALID_TIER');
    const row=a as Record<string,unknown>;
    const minimumQuantity=positiveInt(row.minimumQuantity);
    // Decimal purchase USD values are inputs, not amount derived from retail catalog.
    const purchaseCents=usdCents(row.unitCostUSD,100000,true);
    if((i===0&&minimumQuantity!==moq)||(i>0&&minimumQuantity<=last))throw Error('INVALID_TIER_ORDER');
    last=minimumQuantity;
    return {minimumQuantity,purchaseCents};
  });
  return {sku,supplierName,supplierSku,moq,casePack,tiers,sourceNote,effectiveOn,expiresOn};
}
export function mayApproveSupplierTerms(data:SupplierTerms,nowISO:string):boolean{
  return data.tiers.length>0&&data.expiresOn>=nowISO&&data.effectiveOn<=nowISO;
}
