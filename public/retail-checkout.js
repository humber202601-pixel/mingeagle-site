(function(){'use strict';
const root=document.getElementById('retailCheckout');if(!root)return;
const $=id=>document.getElementById(id),API='https://app.mingeagle.com';
const cart=window.MingEagleCart;
const lines=cart?.read()||[],units=lines.reduce((n,x)=>n+x.quantity,0);
const status=$('retailPaymentStatus'),form=$('retailCheckoutForm'),pay=$('retailPay');
const money=n=>'$'+Number(n).toFixed(2);
let quote=null,providerEnabled=false,turnstileToken='',turnstileInstance=null,sending=false,requestId=null;
const params=new URLSearchParams(location.search);
const summary=lines.map(x=>x.sku+' x '+x.quantity).join(', ');
const referral=new URLSearchParams({type:'retail',cart:summary,cart_country:'US',cart_method:'air',cart_flow:'retail'});
$('retailAlternative').href='inquiry.html?'+referral.toString();
if(units<1||units>=10||lines.length>9){
 status.textContent=units>=10?'Ten or more units require a sea-freight wholesale quote. Return to your cart and accept the shipping terms.':'Your cart is empty. Choose a product before checkout.';
 form.hidden=true;return;
}
$('retailOrderLines').textContent=lines.map(x=>x.sku+' × '+x.quantity).join(', ');
const goodPrice=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
async function fetchEstimate(){
 const r=await fetch(API+'/api/shipping/cart',{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({lines,country:'US',method:'air'}),cache:'no-store'});
 const d=await r.json();
 if(!r.ok||!d.ok||d.mode==='WHOLESALE_RFQ'||d.quantity!==units||
  d.country!=='US'||d.method!=='air'||!goodPrice(d.productsUSD)||
  !goodPrice(d.shippingUSD)||!goodPrice(d.totalBeforeTaxesUSD))
  throw Error('Verified retail shipping unavailable');
 quote=d;
 $('retailOrderGoods').textContent=money(d.productsUSD);
 $('retailOrderFreight').textContent=money(d.shippingUSD);
 $('retailOrderTotal').textContent=money(d.totalBeforeTaxesUSD);
}
async function loadTurnstile(){
 const r=await fetch(API+'/api/turnstile-config',{cache:'no-store'});
 const d=await r.json();
 if(!r.ok||!d.ok||!d.enabled||!d.siteKey)throw Error('Secure verification unavailable');
 if(!window.turnstile){
  await new Promise((resolve,reject)=>{
   const s=document.createElement('script');
   s.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
   s.onload=resolve;s.onerror=()=>reject(Error('Verification script unavailable'));
   document.head.appendChild(s);
  });
 }
 if(!window.turnstile)throw Error('Cloudflare verification failed to load');
 turnstileInstance=window.turnstile.render('#retailTurnstile',{
  sitekey:d.siteKey,action:'mingeagle_checkout',
  callback:token=>{turnstileToken=token;$('retailTurnstileStatus').textContent='Security verification complete.';},
  'expired-callback':()=>{turnstileToken='';$('retailTurnstileStatus').textContent='Verification expired, please try again.';},
  'error-callback':()=>{turnstileToken='';$('retailTurnstileStatus').textContent='Verification failed, please retry.';}
 });
 $('retailTurnstileStatus').textContent='Complete verification before submitting an order.';
}
async function initialize(){
 try{
  await fetchEstimate();
  const response=await fetch(API+'/api/retail/checkout-readiness',{cache:'no-store'});
  const data=await response.json();
  providerEnabled=Boolean(response.ok&&data.ok&&data.retailCheckoutReady);
  if(!providerEnabled){
   status.textContent='Prices and shipping are available, but direct online payment is pending verified Airwallex account, tax and fulfillment activation. No card details can be collected. Use purchasing assistance below.';
   return;
  }
  await loadTurnstile();
  status.textContent='Secure payment is available. Enter US shipping details and review the final tax-inclusive amount on Airwallex before authorizing payment.';
  form.hidden=false;pay.disabled=false;
 }catch(err){status.textContent='Unable to verify online retail checkout: '+String(err.message||err)+'. You can request purchasing assistance without paying.';}
}
form.addEventListener('input',()=>{requestId=null});
form.addEventListener('submit',async e=>{
 e.preventDefault();
 if(!providerEnabled||!quote||!turnstileToken||sending){status.textContent='Please complete verified checkout and security checks.';return}
 if(!form.reportValidity())return;
 const customer={name:$('retailName').value.trim(),email:$('retailEmail').value.trim(),
  address1:$('retailAddress1').value.trim(),address2:$('retailAddress2').value.trim(),
  city:$('retailCity').value.trim(),region:$('retailRegion').value.trim().toUpperCase(),
  postalCode:$('retailPostal').value.trim(),phone:$('retailPhone').value.trim()};
 if(!requestId)requestId=crypto.randomUUID();
 const input={requestId,lines,shippingCountry:'US',shippingMethod:'air',
  customer,acceptShippingTerms:$('retailShippingConsent').checked,
  acceptTaxes:$('retailTaxConsent').checked,turnstileToken};
 sending=true;pay.disabled=true;
 status.textContent='Requesting server-priced secure payment. Do not close or submit another order…';
 try{
  const r=await fetch(API+'/api/retail/checkout',{method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify(input),cache:'no-store'});
  const d=await r.json();
  if(!r.ok||!d.ok)throw Error(d.error||'Secure payment is unavailable');
  if(d.pending){status.textContent='Payment is already pending; check the order status rather than retrying.';return}
  if(!window.AirwallexComponentsSDK)throw Error('Secure payment provider failed to load');
  const aw=await window.AirwallexComponentsSDK.init({env:d.sdkEnv,enabledElements:['payments']});
  await aw.payments.redirectToCheckout({
   env:d.sdkEnv,mode:'payment',intent_id:d.intentId,client_secret:d.clientSecret,
   currency:'USD',country_code:'US',successUrl:d.successUrl,
   shopper_email:customer.email,shopper_name:customer.name,
   withBilling:true,showTermLink:true,submitType:'pay',locale:'en'
  });
 }catch(error){
  status.textContent=String(error.message||error)+'. Payment is not confirmed. If you retried, use the same request, not a second purchase.';
  if(window.turnstile&&turnstileInstance!==null)window.turnstile.reset(turnstileInstance);
  turnstileToken='';
 }finally{sending=false;pay.disabled=false;}
});
async function checkReturn(){
 const id=params.get('checkout_ref');
 if(params.get('payment_return')!=='1'||!/^[0-9a-f-]{36}$/i.test(id||''))return false;
 const banner=$('retailReturnStatus');banner.hidden=false;
 form.hidden=true;
 banner.textContent='Returned from secure checkout. Waiting for signed payment confirmation; no payment has been marked successful yet.';
 async function poll(){
  try{const r=await fetch(API+'/api/retail/order-status?requestId='+encodeURIComponent(id),{cache:'no-store'});
   const d=await r.json();if(!r.ok||!d.ok)return false;
   if(d.paymentStatus==='PAID'){
    banner.textContent='Payment confirmed for order '+d.orderReference+'. Your order has been recorded as PAID.';
    try{localStorage.removeItem('mingeagle_retail_cart_v1')}catch{}
    return true;
   }
   banner.textContent='Order '+d.orderReference+': '+d.paymentStatus+'. Payment verification may still be processing.';
  }catch{}return false;
 }
 if(await poll())return true;
 let attempts=0;
 const interval=setInterval(async()=>{if(await poll()||++attempts>=15)clearInterval(interval)},3000);
 return true;
}
if(params.get('payment_return')==='1'){checkReturn()}else{initialize()}
})();