// Per-line staff-supplied purchasing constraints. These numbers are not a
// supplier price list and must never be inferred from a storefront retail price.
export type QuantityConstraint = {moq?:unknown;casePack?:unknown};
export type RfqQuantityLine = {quantity:number};
export type QuantityCheck = {
  ok:boolean; errors:string[]; pending:number[]; verified:number[];
};
function parseOptionalPositiveInteger(value:unknown):number|null|'INVALID' {
  if(value===undefined||value===null||value==='')return null;
  if(typeof value!=='string'&&typeof value!=='number')return 'INVALID';
  const s=String(value).trim();
  if(!s)return null;
  if(!/^[1-9]\d{0,5}$/.test(s))return 'INVALID';
  const n=Number(s);
  return Number.isSafeInteger(n)&&n<=100000?n:'INVALID';
}
export function reviewRfqQuantityConstraints(
  lines:RfqQuantityLine[], constraints:QuantityConstraint[]|undefined,
):QuantityCheck{
  const errors:string[]=[];const pending:number[]=[];const verified:number[]=[];
  if(!Array.isArray(lines)||!lines.length||lines.length>20)return {ok:false,errors:['INVALID_LINES'],pending,verified};
  if(constraints!==undefined&&(!Array.isArray(constraints)||constraints.length!==lines.length)){
    return {ok:false,errors:['CONSTRAINT_LINE_COUNT_MISMATCH'],pending,verified};
  }
  for(let i=0;i<lines.length;i++){
    const q=lines[i]?.quantity;
    if(!Number.isSafeInteger(q)||q<1||q>100000){errors.push(`LINE_${i+1}_INVALID_QUANTITY`);continue}
    const constraint=constraints?.[i]??{};
    if(!constraint||typeof constraint!=='object'){errors.push(`LINE_${i+1}_INVALID_CONSTRAINT`);continue}
    const moq=parseOptionalPositiveInteger(constraint.moq);
    const pack=parseOptionalPositiveInteger(constraint.casePack);
    if(moq==='INVALID'){errors.push(`LINE_${i+1}_INVALID_MOQ`);continue}
    if(pack==='INVALID'){errors.push(`LINE_${i+1}_INVALID_CASE_PACK`);continue}
    if(moq===null||pack===null)pending.push(i+1);else verified.push(i+1);
    if(moq!==null&&q<moq)errors.push(`LINE_${i+1}_BELOW_MOQ`);
    if(pack!==null&&q%pack!==0)errors.push(`LINE_${i+1}_NOT_CASE_MULTIPLE`);
  }
  return {ok:errors.length===0,errors,pending,verified};
}
