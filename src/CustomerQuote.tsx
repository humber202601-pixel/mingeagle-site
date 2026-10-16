import {useEffect,useMemo,useState} from 'react';
import {useParams,useSearchParams} from 'react-router-dom';
type Quote={reference:string;status:string;currency:string;subtotal:number;
 shipping:number;tax:number;discount:number;total:number;shipping_terms?:string;payment_terms?:string;notes?:string;is_expired?:number};
type Item={description:string;quantity:number;unit_price:number;line_total:number};
type Order={reference:string;status:string;payment_status:string};
type Info={ok:boolean;error?:string;quote?:Quote;items?:Item[];order?:Order};
type PayStatus={ok:boolean;stripe?:{checkoutReady:boolean;mode:'test'|'live'|null}};
const US_STATES=[['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['DC','District of Columbia'],['FL','Florida'],['GA','Georgia'],['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],['MD','Maryland'],['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],['MO','Missouri'],['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],['NH','New Hampshire'],['NJ','New Jersey'],['NM','New Mexico'],['NY','New York'],['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],['OK','Oklahoma'],['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UT','Utah'],['VT','Vermont'],['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming']];
const money=(v:number)=>'$'+Number(v).toFixed(2);
export default function CustomerQuote(){
 const {token=''}=useParams<{token:string}>();
 const [query]=useSearchParams();
 const [data,setData]=useState<Info|null>(null);
 const [payment,setPayment]=useState<PayStatus|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const valid=useMemo(()=>/^[0-9a-f]{64}$/i.test(token),[token]);
 const returned=query.get('payment_return')==='1';
 async function load(){
  if(!valid)return;
  const results=await Promise.all([
   fetch('/api/quote/'+token,{cache:'no-store'}).then(r=>r.json() as Promise<Info>),
   fetch('/api/payments/status',{cache:'no-store'}).then(r=>r.json() as Promise<PayStatus>)
  ]);
  setData(results[0]);setPayment(results[1]);
 }
 useEffect(()=>{
  // Tokenized commercial documents should never enter marketing analytics.
  document.title='Secure Order | MING EAGLE';
  const tag=document.createElement('meta');tag.name='robots';tag.content='noindex,nofollow,noarchive';document.head.appendChild(tag);
  const ref=document.createElement('meta');ref.name='referrer';ref.content='no-referrer';document.head.appendChild(ref);
  let active=true;
  if(valid)Promise.all([
   fetch('/api/quote/'+token,{cache:'no-store'}).then(async r=>(await r.json()) as Info),
   fetch('/api/payments/status',{cache:'no-store'}).then(async r=>(await r.json()) as PayStatus)
  ]).then(([q,p])=>{if(active){setData(q);setPayment(p)}})
   .catch(()=>{if(active)setError('Unable to load this secure order.')});
  return ()=>{active=false;tag.remove();ref.remove()};
 },[token,valid]);
 async function payStripe(){
  if(!valid||!payment?.stripe?.checkoutReady||!data?.order||busy)return;
  setBusy(true);setError('');
  try{
   const response=await fetch('/api/payments/stripe/create',{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token})
   });
   const result=await response.json() as {ok?:boolean;url?:string;error?:string};
   if(!response.ok||!result.ok||!result.url)throw Error(result.error||'Unable to start Stripe checkout');
   const url=new URL(result.url);
   if(url.protocol!=='https:'||url.hostname!=='checkout.stripe.com')throw Error('Invalid Stripe destination');
   window.location.assign(url.href);
  }catch(e){setError(e instanceof Error?e.message:'Stripe checkout unavailable');setBusy(false)}
 }
 const [shippingAddress,setShippingAddress]=useState({line1:'',city:'',state:'',postalCode:''});
 async function accept(){
  if(!valid||!data?.quote)return;
  const line1=shippingAddress.line1.trim(),city=shippingAddress.city.trim(),state=shippingAddress.state.trim().toUpperCase(),postalCode=shippingAddress.postalCode.trim();
  if(line1.length<5||line1.length>180||city.length<2||city.length>100||!US_STATES.some(([code])=>code===state)||!/^[0-9]{5}(?:-[0-9]{4})?$/.test(postalCode)){
   setError('Enter a valid US street address, city, state and ZIP code before accepting this quotation.');return;
  }
  setBusy(true);setError('');
  try{
   const r=await fetch('/api/quote/'+token,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'accept',shippingAddress:{country:'US',line1,city,state,postalCode}})});
   const result=await r.json() as {ok?:boolean;error?:string};
   if(!r.ok||!result.ok)throw Error(result.error||'Unable to accept this quotation');
   await load();
  }catch(e){setError(e instanceof Error?e.message:'Unable to accept')}
  finally{setBusy(false)}
 }
 const q=data?.quote,order=data?.order;
 const taxPending=q?.notes?.startsWith('STRIPE_AUTOMATIC_TAX_PENDING:')&&order?.payment_status!=='PAID';
 return <div className="public-shell"><main className="form-page">
  <div className="form-intro"><span className="eyebrow">PRIVATE COMMERCIAL ORDER</span>
   <h1>MING EAGLE Secure Order</h1>
   <p>This private link contains a quotation. Payment is verified by our payment provider and a signed server-side notification, not by this browser redirect.</p></div>
  {!valid?<p role="alert">The secure order link is invalid.</p>:
   error&&!data?<p role="alert">{error}</p>:
   !data?<p role="status">Loading order…</p>:
   !data.ok||!q?<p role="alert">{data.error||'This quotation is not available.'}</p>:<>
    <section className="lead-form">
     <h2>Quotation {q.reference}</h2>
     <p>Status: {q.status} · Currency: {q.currency}</p>
     <div style={{overflowX:'auto'}}><table><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Subtotal</th></tr></thead>
      <tbody>{(data.items||[]).map((x,i)=><tr key={i}><td>{x.description}</td>
       <td>{x.quantity}</td><td>{money(x.unit_price)}</td><td>{money(x.line_total)}</td></tr>)}</tbody>
     </table></div>
     <p>Products: {money(q.subtotal)} · Shipping: {money(q.shipping)} · Taxes: {taxPending?'Confirmed at secure payment':money(q.tax)} · Discount: {money(q.discount)}</p>
     <h2>{taxPending?'Total before sales tax':'Total'}: {money(q.total)}</h2>
     {taxPending&&<p className="form-note">Your final sales tax and total will be shown before you pay, using the delivery address on this order.</p>}
     <p className="form-note">{q.shipping_terms||'Delivery terms are stated in the quotation.'}</p>
     {!order&&['SENT','VIEWED'].includes(q.status)&&!q.is_expired&&<section className="form-note" aria-label="US delivery address">
      <h3>Confirm US delivery address</h3>
      <p>Before accepting this Stripe quotation, enter the delivery address. We use the state and ZIP to verify the quoted freight and tax treatment.</p>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
       <label>Street address<input aria-label="Street address" value={shippingAddress.line1} onChange={e=>setShippingAddress(a=>({...a,line1:e.target.value}))} autoComplete="street-address" /></label>
       <label>City<input aria-label="City" value={shippingAddress.city} onChange={e=>setShippingAddress(a=>({...a,city:e.target.value}))} autoComplete="address-level2" /></label>
       <label>State<select aria-label="State" value={shippingAddress.state} onChange={e=>setShippingAddress(a=>({...a,state:e.target.value}))} autoComplete="address-level1"><option value="">Select state</option>{US_STATES.map(([code,name])=><option key={code} value={code}>{name} ({code})</option>)}</select></label>
       <label>ZIP code<input aria-label="ZIP code" value={shippingAddress.postalCode} onChange={e=>setShippingAddress(a=>({...a,postalCode:e.target.value}))} autoComplete="postal-code" inputMode="numeric" /></label>
      </div>
     </section>}
     {order?<div role="status">
      <strong>Order {order.reference}</strong>
      <p>Payment: {order.payment_status}. Status: {order.status}.</p>
      {returned&&<p>We received your return from the payment page. We only mark the order paid after server-side confirmation. Please refresh if your payment is processing.</p>}
     </div>:<p>No order has been created for this quotation yet.</p>}
     {error&&<p role="alert" className="form-status error">{error}</p>}
     {order?.payment_status==='PAID'?<p role="status" className="form-status success">
      Payment confirmed. Thank you for your order.</p>:
      !order&&['SENT','VIEWED'].includes(q.status)&&!q.is_expired?
       <button className="button" disabled={busy} onClick={accept}>{busy?'Processing…':'Accept quote to create unpaid order'}</button>:
       order&&payment?.stripe?.checkoutReady?
       <button className="button" disabled={busy} onClick={payStripe}>{busy?'Preparing…':'Pay securely with Stripe'}</button>:
       <p className="form-note">Stripe online payment is not yet activated for this order. Contact MING EAGLE for the approved Stripe payment link.</p>}
     <p className="form-note">Do not send credit card details by email, chat or WhatsApp.</p>
    </section>
   </>}
 </main></div>;
}
