import {useEffect,useState,type FormEvent} from 'react';
import {useInquiryTurnstile} from './useInquiryTurnstile';

type Entry={sku:string;quantity:number;color:string};
const colors:Record<string,string[]>={
 P1:['Orange','Blue','Green','Yellow'],P2:['Orange','Green'],
 P3:['Orange','Brown','Black','Aqua Blue'],
 P4:['Black/White','Black/Green','Black/Red','Yellow/Green','Black/Gold']
};
type Ready={ok?:boolean;retailCheckoutReady?:boolean;notice?:string;supportedStates?:string[];eligibleSkus?:string[];maxDirectCheckoutUnits?:number};
const valid=/^(?:P1-S[357]|P2-S[357]|P3-S[3467]|P4-S5)$/;
const catalog:Record<string,string>={P1:'Flocked Silent Basketball Set',P2:'Fabric-Cover Silent Basketball Set',P3:'Weighted Flocked Silent Basketball',P4:'Flocked Silent Soccer Ball'};
function readCart():Entry[]{
 try{
  const encoded=new URL(window.location.href).searchParams.get('cart')||'';
  if(encoded.length>1500)return [];
  const rows=JSON.parse(encoded) as unknown;
  if(!Array.isArray(rows)||!rows.length||rows.length>9)return [];
  let n=0;const seen=new Set<string>();
  const result=rows.map(row=>{
   if(!row||typeof row!=='object')throw Error('invalid line');
   const x=row as Entry;
   if(typeof x.sku!=='string'||!valid.test(x.sku)||seen.has(x.sku+'|'+x.color)||!colors[x.sku.slice(0,2)]?.includes(x.color)||
      !Number.isSafeInteger(x.quantity)||x.quantity<1||x.quantity>9)throw Error('invalid cart');
   n+=x.quantity;seen.add(x.sku+'|'+x.color);return {sku:x.sku,quantity:x.quantity,color:x.color};
  });
  return n>=1&&n<=9?result:[];
 }catch{return []}
}
export default function RetailCheckout(){
 const [lines]=useState(readCart);
 const [ready,setReady]=useState<Ready|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [requestId]=useState(()=>crypto.randomUUID());
 const directCartEligible=lines.length>0&&lines.reduce((n,x)=>n+x.quantity,0)<=(ready?.maxDirectCheckoutUnits??9)
  &&lines.every(x=>!ready?.eligibleSkus||ready.eligibleSkus.includes(x.sku));
 const captcha=useInquiryTurnstile(Boolean(ready?.retailCheckoutReady&&directCartEligible));
 useEffect(()=>{let active=true;
  fetch('/api/retail/checkout-status',{cache:'no-store'})
   .then(r=>r.json()).then(d=>{if(active)setReady(d as Ready)})
   .catch(()=>{if(active)setReady({ok:false,retailCheckoutReady:false})});
  return ()=>{active=false};
 },[]);
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(busy||!ready?.retailCheckoutReady||!lines.length)return;
  if(captcha.mode!=='required'||!captcha.token){setError('Complete the security check before checkout.');return}
  const data=new FormData(e.currentTarget);
  setError('');setBusy(true);
  try{
   const payload=Object.fromEntries(['name','email','phone','street1','street2','city','state','postalCode']
    .map(k=>[k,String(data.get(k)||'')]));
   const response=await fetch('/api/retail/checkout',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({...payload,requestId,lines,country:'US',method:'air',
      turnstileToken:captcha.token,privacyAck:data.get('privacyAck')==='on'})
   });
   const result=await response.json() as {ok?:boolean;error?:string;paymentPage?:string};
   if(!response.ok||!result.ok||!result.paymentPage)throw Error(result.error||'Cannot prepare checkout');
   const url=new URL(result.paymentPage);
   if(url.origin!==window.location.origin||!/^\/quote\/[0-9a-f]{64}$/.test(url.pathname))
    throw Error('Unrecognized secure checkout destination');
   window.location.assign(url.href);
  }catch(e){captcha.reset();setError(e instanceof Error?e.message:'Unable to prepare order');setBusy(false)}
 }
 return <div className="public-shell"><main className="form-page">
  <div className="form-intro"><span className="eyebrow">SECURE RETAIL CHECKOUT</span>
   <h1>US Retail · Secure Checkout</h1>
   <p>Public retail prices, air parcel shipping from China. Complete your US shipping address to prepare the final payment page. No card data is collected here.</p></div>
  {!lines.length?<div role="alert" className="form-status error">
   This cart is empty, invalid or contains 10+ items. <a href="https://www.mingeagle.com/retail-cart.html">Return to cart</a>.
  </div>:<section className="lead-form">
   <h2>Your items</h2>
   {lines.map(x=><p key={x.sku+'|'+x.color}>{catalog[x.sku.slice(0,2)]} · Size {x.sku.slice(4)} · {x.color} · {x.quantity} item(s)</p>)}
   <p className="form-note">The server independently verifies product prices, combined air freight, stock readiness and approved tax handling. Delivery estimates are not guarantees.</p>
   {ready===null?<p role="status">Checking secure payment availability…</p>:
    !ready.retailCheckoutReady||!directCartEligible?<div className="form-status error" role="status">
     <strong>Online card payment activation in progress.</strong>
     <p>{!directCartEligible?'This basket needs a confirmed delivered-price quote.':'No payment can be made yet. You can still request an order confirmation.'}</p>
     <a className="button" href="https://www.mingeagle.com/retail-cart.html">Return to retail cart</a>
    </div>:
    <form onSubmit={submit}>
     <p className="form-note">{ready.notice}</p>
     <div className="form-grid">
      <label>Full name *<input name="name" required maxLength={120} autoComplete="name"/></label>
      <label>Email *<input name="email" type="email" required maxLength={180} autoComplete="email"/></label>
      <label>Phone *<input name="phone" type="tel" required maxLength={45} autoComplete="tel"/></label>
      <label>US address line 1 *<input name="street1" required maxLength={200} autoComplete="address-line1"/></label>
      <label>Apartment / suite<input name="street2" maxLength={200} autoComplete="address-line2"/></label>
      <label>City *<input name="city" required maxLength={100} autoComplete="address-level2"/></label>
      <label>Delivery state *{ready.supportedStates?.length?<select name="state" required autoComplete="address-level1" defaultValue="">
       <option value="" disabled>Choose an approved delivery state</option>
       {ready.supportedStates.map(state=><option key={state} value={state}>{state==='OR'?'Oregon':state==='NH'?'New Hampshire':state} ({state})</option>)}
      </select>:<input name="state" required maxLength={2} minLength={2} pattern="[A-Za-z]{2}" autoComplete="address-level1" style={{textTransform:'uppercase'}}/>}</label>
      <label>ZIP code *<input name="postalCode" required maxLength={10} autoComplete="postal-code" pattern="[0-9]{5}(-[0-9]{4})?"/></label>
     </div>
     <div ref={captcha.container} aria-label="Checkout security verification"/>
     <label><input name="privacyAck" type="checkbox" required/> I agree to share my details for order fulfillment and accept the <a href="https://www.mingeagle.com/policies.html#shipping" target="_blank" rel="noreferrer">shipping</a> and <a href="https://www.mingeagle.com/policies.html#returns" target="_blank" rel="noreferrer">return terms</a>, and the taxes shown in my final order.</label>
     {error&&<div role="alert" className="form-status error">{error}</div>}
     <button className="button" disabled={busy||captcha.mode!=='required'||!captcha.token}>
      {busy?'Preparing secure order…':'Continue to secure payment →'}
     </button>
     <p className="form-note">No payment is recorded until our payment provider confirms success through a signed server-side notification.</p>
    </form>}
  </section>}
 </main></div>;
}
