import {useEffect,useMemo,useState} from 'react';
import {useParams,useSearchParams} from 'react-router-dom';
type Quote={reference:string;status:string;currency:string;subtotal:number;
 shipping:number;tax:number;discount:number;total:number;shipping_terms?:string;payment_terms?:string;is_expired?:number};
type Item={description:string;quantity:number;unit_price:number;line_total:number};
type Order={reference:string;status:string;payment_status:string};
type Info={ok:boolean;error?:string;quote?:Quote;items?:Item[];order?:Order};
type PayStatus={ok:boolean;stripe?:{checkoutReady:boolean;mode:'test'|'live'|null};airwallex?:{checkoutReady:boolean;environment:'sandbox'|'prod'|null}};
type Sdk={payments:{redirectToCheckout:(opts:Record<string,unknown>)=>void}};
declare global{interface Window{AirwallexComponentsSDK?:{init:(o:Record<string,unknown>)=>Promise<Sdk>}}}
function loadProvider(){
 if(window.AirwallexComponentsSDK)return Promise.resolve();
 return new Promise<void>((resolve,reject)=>{
  const tag=document.createElement('script');tag.src='https://static.airwallex.com/components/sdk/v1/index.js';
  tag.async=true;tag.onload=()=>window.AirwallexComponentsSDK?resolve():reject(Error('Secure payment SDK is unavailable'));
  tag.onerror=()=>reject(Error('Payment service could not be loaded'));
  document.head.appendChild(tag);
 });
}
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
 async function pay(){
  if(!valid||!payment?.airwallex?.checkoutReady||!data?.order||busy)return;
  setBusy(true);setError('');
  try{
   const response=await fetch('/api/payments/airwallex/create',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({token})
   });
   const result=await response.json() as {ok?:boolean;pending?:boolean;status?:string;
    intentId?:string;clientSecret?:string;currency?:string;sdkEnv?:string;successUrl?:string;error?:string};
   if(!response.ok||!result.ok)throw Error(result.error||'Unable to start payment');
   if(result.pending){setError('Payment is pending verification. Do not pay twice.');return}
   if(!result.intentId||!result.clientSecret||!result.currency||
     !['sandbox','prod'].includes(String(result.sdkEnv)))throw Error('Payment session incomplete');
   const target=new URL(String(result.successUrl||''));
   if(target.origin!==location.origin||!target.pathname.startsWith('/quote/'+token))
    throw Error('Invalid payment return URL');
   await loadProvider();
   const sdk=await window.AirwallexComponentsSDK!.init({
    env:result.sdkEnv==='sandbox'?'demo':'prod',enabledElements:['payments']
   });
   sdk.payments.redirectToCheckout({
    env:result.sdkEnv==='sandbox'?'demo':'prod',mode:'payment',currency:result.currency,
    intent_id:result.intentId,client_secret:result.clientSecret,successUrl:target.href
   });
  }catch(e){setError(e instanceof Error?e.message:'Secure payment unavailable')}
  finally{setBusy(false)}
 }
 async function accept(){
  if(!valid||!data?.quote)return;
  setBusy(true);setError('');
  try{
   const r=await fetch('/api/quote/'+token,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'accept'})});
   const result=await r.json() as {ok?:boolean;error?:string};
   if(!r.ok||!result.ok)throw Error(result.error||'Unable to accept this quotation');
   await load();
  }catch(e){setError(e instanceof Error?e.message:'Unable to accept')}
  finally{setBusy(false)}
 }
 const q=data?.quote,order=data?.order;
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
     <p>Products: {money(q.subtotal)} · Shipping: {money(q.shipping)} · Taxes: {money(q.tax)} · Discount: {money(q.discount)}</p>
     <h2>Total: {money(q.total)}</h2>
     <p className="form-note">{q.shipping_terms||'Delivery terms are stated in the quotation.'}</p>
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
       order&&!order.reference.startsWith('ME-RO-')&&payment?.airwallex?.checkoutReady?
       <button className="button" disabled={busy} onClick={pay}>{busy?'Preparing…':'Pay securely with Airwallex'}</button>:
       <p className="form-note">Online payment is not yet activated for this order. Contact MING EAGLE for approved payment arrangements.</p>}
     <p className="form-note">Do not send credit card details by email, chat or WhatsApp.</p>
    </section>
   </>}
 </main></div>;
}
