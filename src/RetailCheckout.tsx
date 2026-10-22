import {useEffect,useState,type FormEvent} from 'react';
import {ArrowLeft,ArrowRight,LockKeyhole,Truck,ShieldCheck,PackageCheck} from 'lucide-react';
import {useInquiryTurnstile} from './useInquiryTurnstile';
import {US_DELIVERY_STATES} from '../lib/us-delivery-states';
import './retail-checkout.css';
import {checkoutIntentId,checkoutSupportUrl} from './retailCheckoutIntent';
type Entry={sku:string;quantity:number;color:string};
type Ready={ok?:boolean;retailCheckoutReady?:boolean;supportedStates?:string[];eligibleSkus?:string[];maxDirectCheckoutUnits?:number};
type Price={ok?:boolean;productUSD?:number;productsUSD?:number;shippingUSD?:number;totalBeforeTaxesUSD?:number;ddpConfirmed?:boolean;shippingPlan?:string;parcelCount?:number};
const colors:Record<string,string[]>={P1:['Orange','Blue','Green','Yellow'],P2:['Orange','Green'],P3:['Orange','Brown','Black','Aqua Blue'],P4:['Black/White','Black/Green','Black/Red','Yellow/Green','Black/Gold']};
const valid=/^(?:P1-S[357]|P2-S[357]|P3-S[3467]|P4-S5)$/;
const catalog:Record<string,string>={P1:'Flocked Silent Basketball Set',P2:'Fabric-Cover Silent Basketball Set',P3:'Weighted Flocked Silent Basketball',P4:'Flocked Silent Soccer Ball'};
const money=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n);
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
   if(typeof x.sku!=='string'||!valid.test(x.sku)||seen.has(x.sku+'|'+x.color)||!colors[x.sku.slice(0,2)]?.includes(x.color)||!Number.isSafeInteger(x.quantity)||x.quantity<1||x.quantity>9)throw Error('invalid cart');
   n+=x.quantity;seen.add(x.sku+'|'+x.color);return {sku:x.sku,quantity:x.quantity,color:x.color};
  });
  return n>=1&&n<=9?result:[];
 }catch{return []}
}
export default function RetailCheckout(){
 const [lines]=useState(readCart);
 const [ready,setReady]=useState<Ready|null>(null),[price,setPrice]=useState<Price|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[state,setState]=useState('');
 const [needsOrderReview,setNeedsOrderReview]=useState(false);
 const [requestId]=useState(()=>checkoutIntentId(lines,typeof sessionStorage!=='undefined'?sessionStorage:null,()=>crypto.randomUUID()));
 const quantity=lines.reduce((n,x)=>n+x.quantity,0);
 const maxDirectUnits=ready?.maxDirectCheckoutUnits??1;
 const overDirectLimit=quantity>maxDirectUnits;
 const unconfirmedSkus=lines.filter(x=>ready?.eligibleSkus&&!ready.eligibleSkus.includes(x.sku)).map(x=>x.sku);
 const cartEligible=lines.length>0&&!overDirectLimit&&unconfirmedSkus.length===0;
 const stateEligible=!state||!ready?.supportedStates||ready.supportedStates.includes(state);
 const goods=price?.productsUSD??price?.productUSD,freight=price?.shippingUSD,total=price?.totalBeforeTaxesUSD;
 const priceReady=price?.ok===true&&price.ddpConfirmed===true&&[goods,freight,total].every(x=>typeof x==='number'&&Number.isFinite(x)&&x>=0)&&Math.round(Number(total)*100)===Math.round(Number(goods)*100)+Math.round(Number(freight)*100);
 const canCheckout=Boolean(ready?.retailCheckoutReady&&cartEligible&&priceReady);
 const captcha=useInquiryTurnstile(Boolean(canCheckout&&stateEligible));
 const quoteParams=new URLSearchParams({type:'retail',cart:lines.map(x=>`${x.sku} / ${x.color} x ${x.quantity}`).join(', '),cart_country:'US',shipping_state:state});
 const quoteUrl='https://www.mingeagle.com/inquiry.html?'+quoteParams;
 useEffect(()=>{
  let active=true;
  fetch('/api/retail/checkout-status',{cache:'no-store'}).then(r=>r.json()).then(d=>{if(active)setReady(d as Ready)}).catch(()=>{if(active)setReady({ok:false,retailCheckoutReady:false})});
  const grouped=new Map<string,number>();
  for(const x of lines)grouped.set(x.sku,(grouped.get(x.sku)||0)+x.quantity);
  if(lines.length)fetch('/api/shipping/cart',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({country:'US',method:'air',lines:[...grouped].map(([sku,quantity])=>({sku,quantity}))})}).then(r=>r.json()).then(d=>{if(active)setPrice(d as Price)}).catch(()=>{if(active)setPrice({ok:false})});
  return ()=>{active=false};
 },[lines]);
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(busy||needsOrderReview||!canCheckout||!stateEligible||!state)return;
  if(captcha.mode!=='required'||!captcha.token){setError('Please complete the security check.');return}
  const data=new FormData(e.currentTarget);setError('');setBusy(true);
  try{
   const payload=Object.fromEntries(['name','email','phone','street1','street2','city','state','postalCode'].map(k=>[k,String(data.get(k)||'')]));
   const response=await fetch('/api/retail/checkout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...payload,requestId,lines,country:'US',method:'air',turnstileToken:captcha.token,privacyAck:data.get('privacyAck')==='on'})});
   const result=await response.json() as {ok?:boolean;error?:string;paymentPage?:string};
   if(!response.ok||!result.ok||!result.paymentPage){
    if(response.status===409&&/^Checkout request already received/.test(result.error||'')){
     setNeedsOrderReview(true);
     throw Error('This checkout request may already have created an order. Do not create another order until the first is checked.');
    }
    throw Error(result.error||'We could not confirm whether your checkout request was saved. Please use the same request reference when contacting us.');
   }
   const url=new URL(result.paymentPage);
   if(url.origin!==window.location.origin||!/^\/quote\/[0-9a-f]{64}$/.test(url.pathname))throw Error('Please contact us to confirm your order.');
   // The D1 order is already committed. Try to hand the buyer straight to
   // Stripe-hosted payment; never retry retail order creation if this fails.
   // A Checkout Session is not a charge, and only the signed webhook can
   // mark the order as paid. The private order URL remains a safe recovery.
   try{
    const token=url.pathname.split('/')[2];
    const pay=await fetch('/api/payments/stripe/create',{
     method:'POST',headers:{'content-type':'application/json'},
     body:JSON.stringify({token}),signal:AbortSignal.timeout(15000)
    });
    if(pay.ok){
     const session=await pay.json() as {ok?:boolean;url?:string};
     if(session.ok===true&&typeof session.url==='string'){
      const stripe=new URL(session.url);
      if(stripe.protocol==='https:'&&stripe.hostname==='checkout.stripe.com'){
       window.location.assign(stripe.href);return;
      }
     }
    }
   }catch{ /* Provider or network unavailable; the order already exists. */ }
   window.location.assign(url.href);
  }catch(e){captcha.reset();setError(e instanceof Error?e.message:'Unable to prepare order');setBusy(false)}
 }
 const loading=ready===null||(lines.length>0&&price===null);
 return <div className="retail-checkout">
  <header className="rc-header"><a className="rc-brand" href="https://www.mingeagle.com/"><span className="rc-brand-mark">ME</span><span>MING EAGLE<small>MORE PLAY. EVERY DAY.</small></span></a><span className="rc-secure"><LockKeyhole size={15}/> Secure checkout</span></header>
  <main className="rc-main">
   <a className="rc-back" href="https://www.mingeagle.com/retail-cart.html"><ArrowLeft size={15}/> Back to cart</a>
   <div className="rc-title"><div><span className="rc-eyebrow">CHECKOUT</span><h1>Delivery details</h1><p>A few details, then you're ready to play.</p></div><ol className="rc-steps" aria-label="Checkout progress"><li>Cart</li><li aria-current="step">Delivery</li><li>Payment</li></ol></div>
   {!lines.length?<section className="rc-card rc-empty"><h2>Your cart is empty</h2><p>Add a product to prepare your order.</p><a className="rc-action" href="https://www.mingeagle.com/retail-cart.html">Return to cart <ArrowRight size={16}/></a></section>:<div className="rc-layout">
    <section className="rc-card rc-form-card" aria-label="Delivery details">
     {loading?<p className="rc-message" role="status">Preparing your order…</p>:!canCheckout?<div className="rc-message" role="status"><h2>Let's confirm your delivery price</h2><p>{overDirectLimit
       ? `This basket has ${quantity} units. Direct air checkout is limited to ${maxDirectUnits}; 10+ units require a separately approved wholesale sea-freight quote.`
       : unconfirmedSkus.length
       ? `Confirmed duty-paid parcel rates are not yet available for: ${unconfirmedSkus.join(', ')}. Request a quote for this basket instead of attempting card payment.`
       : price?.ddpConfirmed!==true
       ? 'The complete duty-paid delivery price for this basket is not yet confirmed. Please request a quote.'
       : 'Card checkout is temporarily unavailable. We can confirm your order by email.'}</p><a className="rc-action" href={quoteUrl}>Request an order quote <ArrowRight size={16}/></a></div>:<form onSubmit={submit}>
      <fieldset><legend><span>1</span> Contact information</legend><div className="rc-fields"><label>Full name<input name="name" required maxLength={120} autoComplete="name"/></label><label>Email address<input name="email" type="email" required maxLength={180} autoComplete="email"/></label><label className="rc-wide">Phone number<input name="phone" type="tel" required maxLength={45} autoComplete="tel"/><small>For delivery updates only.</small></label></div></fieldset>
      <fieldset><legend><span>2</span> Shipping address</legend><div className="rc-country"><span>United States</span><small>Ships from China</small></div><div className="rc-fields"><label className="rc-wide">Street address<input name="street1" required maxLength={200} autoComplete="address-line1"/></label><label className="rc-wide">Apartment, suite, etc. <span className="rc-optional">(optional)</span><input name="street2" maxLength={200} autoComplete="address-line2"/></label><label>City<input name="city" required maxLength={100} autoComplete="address-level2"/></label><label>State<select name="state" required autoComplete="address-level1" value={state} onChange={e=>setState(e.target.value)}><option value="" disabled>Select your state</option>{Object.entries(US_DELIVERY_STATES).map(([code,name])=><option key={code} value={code}>{name}</option>)}</select></label><label>ZIP code<input name="postalCode" required maxLength={10} autoComplete="postal-code" inputMode="numeric" pattern="[0-9]{5}(-[0-9]{4})?"/></label></div></fieldset>
      {!stateEligible?<div className="rc-state-note" role="status"><strong>We can help with this address.</strong><p>Your delivery state needs an order confirmation before online payment.</p><a href={quoteUrl}>Request a confirmed order <ArrowRight size={14}/></a></div>:<>
       <div className="rc-verification" ref={captcha.container} aria-label="Checkout security verification"/>
       <label className="rc-consent"><input name="privacyAck" type="checkbox" required/><span>I accept the <a href="https://www.mingeagle.com/policies.html#shipping" target="_blank" rel="noreferrer">shipping terms</a> and <a href="https://www.mingeagle.com/policies.html#returns" target="_blank" rel="noreferrer">return terms</a>, and agree to use my details to fulfill this order.</span></label>
       {error&&<div role="alert" className="rc-error"><p>{error}</p><p>Checkout request reference: <code>{requestId}</code>. This reference is not an order number or proof of payment.</p><a href={checkoutSupportUrl(requestId)}>Ask MING EAGLE to locate this request by email</a><p>Please confirm the existing request before starting a new one. A failed network response does not prove that no order was created.</p></div>}
       <button className="rc-action rc-submit" disabled={busy||needsOrderReview||captcha.mode!=='required'||!captcha.token}>{busy?'Preparing your order…':needsOrderReview?'Contact support to locate existing request':'Continue to secure payment →'}</button><p className="rc-payment-note"><LockKeyhole size={13}/> Card payment is handled securely by Stripe.</p>
      </>}
     </form>}
    </section>
    <aside className="rc-card rc-summary" aria-label="Order summary"><div className="rc-summary-title"><h2>Your order</h2><span>{lines.reduce((n,x)=>n+x.quantity,0)} item(s)</span></div>
     {lines.map(x=><div className="rc-product" key={x.sku+'|'+x.color}>{x.sku.startsWith('P1-')&&<img src="https://www.mingeagle.com/assets/hero-flocked-silent-basketball-set.webp?v=20261007-1" alt="Flocked basketball with mini hoop"/>}<div><strong>{catalog[x.sku.slice(0,2)]}</strong><span>Size {x.sku.slice(4)} · {x.color}</span><small>Quantity {x.quantity}</small></div></div>)}
     <dl className="rc-prices"><div><dt>Products</dt><dd>{typeof goods==='number'?money(goods):'—'}</dd></div><div><dt>Air parcel delivery</dt><dd>{typeof freight==='number'?money(freight):'—'}</dd></div><div className="rc-total"><dt>Total before sales tax<small>USD</small></dt><dd>{typeof total==='number'?money(total):'—'}</dd></div></dl>
     <p className="rc-tax-note">Any applicable sales tax is confirmed before payment.</p>
     {quantity>1&&price?.shippingPlan==='ONE_UNIT_PER_PARCEL'&&<p className="rc-tax-note">{quantity} sets ship in {price.parcelCount} separate parcels. Delivery is charged per set; parcels may arrive separately.</p>}
     <ul className="rc-benefits"><li><PackageCheck size={18}/><span>Dispatch within 3 days<small>Products replenished as needed</small></span></li><li><Truck size={18}/><span>Air parcel from China<small>Estimated 12–15 days after dispatch</small></span></li>{price?.ddpConfirmed&&<li><ShieldCheck size={18}/><span>Import duties included<small>No extra import duty on this order</small></span></li>}</ul>
     <div className="rc-help">Need a hand? <a href="https://www.mingeagle.com/inquiry.html?type=question">Contact us</a></div>
    </aside>
   </div>}
  </main><footer className="rc-footer">MING EAGLE COMMERCE LLC <span>·</span> <a href="https://www.mingeagle.com/policies.html#privacy">Privacy</a> <span>·</span> <a href="https://www.mingeagle.com/policies.html#returns">Returns</a></footer>
 </div>;
}
