/**
 * Checkout intent identity belongs to the user's browser session, not to the
 * payments ledger. Only SKU, variant, quantity and a random UUID are stored:
 * no name, email, delivery address, customer token or card information.
 */
export type CheckoutEntry={sku:string;color:string;quantity:number};
export type IntentStore={getItem(k:string):string|null;setItem(k:string,v:string):void;removeItem(k:string):void};
const PREFIX='mingeagle_checkout_intent_v1_';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function checkoutIntentKey(lines:CheckoutEntry[]):string{
  const canonical=[...lines].map(x=>[x.sku,x.color,x.quantity])
    .sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  // A stable, noncryptographic key for sessionStorage partitioning only.
  // The actual requestId is a fresh cryptographic UUID.
  const value=JSON.stringify(canonical);
  let hash=2166136261;
  for(let i=0;i<value.length;i++){
    hash^=value.charCodeAt(i);
    hash=Math.imul(hash,16777619);
  }
  return PREFIX+(hash>>>0).toString(16).padStart(8,'0');
}
export function checkoutIntentId(lines:CheckoutEntry[],store:IntentStore|null,generate:()=>string):string{
  const key=checkoutIntentKey(lines);
  try{
    const existing=store?.getItem(key);
    if(existing&&UUID.test(existing))return existing;
  }catch{/* storage may be disabled; checkout still works within current page */}
  const fresh=generate();
  if(!UUID.test(fresh))throw Error('Invalid checkout request reference');
  try{store?.setItem(key,fresh)}catch{/* use in-memory request identity */}
  return fresh;
}
export function clearCheckoutIntent(lines:CheckoutEntry[],store:IntentStore|null):void{
  try{store?.removeItem(checkoutIntentKey(lines))}catch{/* optional */}
}
export function checkoutSupportUrl(requestId:string):string{
  if(!UUID.test(requestId))throw Error('Invalid checkout reference');
  const subject='MING EAGLE sample checkout review '+requestId;
  const body='Please help me locate a sample checkout request. Checkout request reference: '+requestId
    +'\nI have not confirmed whether an order was created or payment was completed. Please verify before making another order.';
  return 'mailto:mingeaglecommerce@gmail.com?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
}
