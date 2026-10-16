// Compare the buyer-accepted quote's exact merchandise snapshot to its order.
// A matching aggregate subtotal alone does not authorize swapping one SKU,
// variant, description, quantity, or discounted line for another.
export type PayableLineSnapshot = {
 product_id?:unknown;variant_id?:unknown;description?:unknown;
 quantity?:unknown;unit_price?:unknown;line_total?:unknown;
};
function amountCents(value:unknown):number|null {
 if(value===null||value===undefined||typeof value==='boolean'||String(value).trim()==='')return null;
 const n=Number(value),c=Math.round(n*100);
 return Number.isFinite(n)&&Number.isSafeInteger(c)&&Math.abs(n*100-c)<0.00001&&c>=0?c:null;
}
function normalizedLine(row:PayableLineSnapshot):{key:string;total:number}|null{
 const qty=Number(row.quantity),unit=amountCents(row.unit_price),line=amountCents(row.line_total);
 const description=typeof row.description==='string'?row.description:'';
 if(!Number.isSafeInteger(qty)||qty<1||qty>1000000||unit===null||unit<1||
  line===null||line!==qty*unit||description.trim()!==description||description.length<1||description.length>1000)
  return null;
 const product=row.product_id==null?null:String(row.product_id),
  variant=row.variant_id==null?null:String(row.variant_id);
 return {key:JSON.stringify([product,variant,description,qty,unit,line]),total:line};
}
export function acceptedB2bItemSnapshotMatches(
 quoteItems:PayableLineSnapshot[]|null|undefined,orderItems:PayableLineSnapshot[]|null|undefined,
 quoteSubtotal:unknown,orderSubtotal:unknown
):boolean {
 if(!Array.isArray(quoteItems)||!Array.isArray(orderItems)||!quoteItems.length||
  quoteItems.length!==orderItems.length||quoteItems.length>100)return false;
 const expected=amountCents(quoteSubtotal),actual=amountCents(orderSubtotal);
 if(expected===null||actual===null||expected!==actual)return false;
 const normalize=(items:PayableLineSnapshot[])=>{
  let sum=0;const keys:string[]=[];
  for(const item of items){
   const line=normalizedLine(item);if(!line)return null;
   sum+=line.total;if(!Number.isSafeInteger(sum))return null;
   keys.push(line.key);
  }
  return {sum,keys:keys.sort()};
 };
 const a=normalize(quoteItems),b=normalize(orderItems);
 return Boolean(a&&b&&a.sum===expected&&b.sum===actual&&
  a.keys.length===b.keys.length&&a.keys.every((k,i)=>k===b.keys[i]));
}
