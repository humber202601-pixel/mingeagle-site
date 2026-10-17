(function(){'use strict';
const STORAGE='mingeagle_retail_cart_v1';
const SKU=/^(?:P1-S[357]|P2-S[357]|P3-S[3467]|P4-S5)$/;
const PRICE={'P1-S3':9.9,'P1-S5':11.9,'P1-S7':14.9,'P2-S3':10.9,'P2-S5':12.9,'P2-S7':15.9,'P3-S3':12.9,'P3-S4':14.9,'P3-S6':18.9,'P3-S7':21.9,'P4-S5':17.9};
const NAME={P1:'Flocked Silent Basketball Set',P2:'Fabric-Cover Silent Basketball Set',P3:'Weighted Flocked Silent Basketball',P4:'Flocked Silent Soccer Ball'};
const COLORS={P1:['Orange','Blue','Green','Yellow'],P2:['Orange','Green'],
 P3:['Orange','Brown','Black','Aqua Blue'],
 P4:['Black/White','Black/Green','Black/Red','Yellow/Green','Black/Gold']};
const money=n=>'$'+Number(n).toFixed(2);
const known=sku=>typeof sku==='string'&&SKU.test(sku)&&Object.prototype.hasOwnProperty.call(PRICE,sku);
const family=sku=>String(sku||'').slice(0,2);
const allowed=(sku,color)=>typeof color==='string'&&COLORS[family(sku)]?.includes(color);
const validQty=n=>Number.isSafeInteger(n)&&n>=1&&n<=10000;
function read(){
 try {
  const value=JSON.parse(localStorage.getItem(STORAGE)||'[]');
  if(!Array.isArray(value))return [];
  const combined=new Map();
  for(const v of value){
   if(!v||!known(v.sku)||!validQty(v.quantity))continue;
   // Older carts did not store colors. Preserve them as unselected and ask
   // the customer to explicitly pick one rather than invent a variant.
   const color=allowed(v.sku,v.color)?v.color:'';
   const key=v.sku+'|'+color;
   const old=combined.get(key)||0;
   if(old+v.quantity>10000)continue;
   combined.set(key,old+v.quantity);
  }
  return [...combined].slice(0,55).map(([key,quantity])=>{
   const marker=key.indexOf('|');
   return {sku:key.slice(0,marker),color:key.slice(marker+1),quantity};
  });
 }catch{return []}
}
function save(rows){
 try{localStorage.setItem(STORAGE,JSON.stringify(rows));return true}
 catch{return false}
}
const quantity=lines=>lines.reduce((sum,x)=>sum+x.quantity,0);
function aggregate(lines){
 const grouped=new Map();
 for(const line of lines){
  if(!known(line.sku)||!validQty(line.quantity))throw Error('Invalid cart line');
  grouped.set(line.sku,(grouped.get(line.sku)||0)+line.quantity);
 }
 return [...grouped].map(([sku,quantity])=>({sku,quantity}));
}
window.MingEagleCart={
 read,aggregate,colors:sku=>COLORS[family(sku)]?.slice()||[],
 unitPrice:sku=>known(sku)?PRICE[sku]:null,productName:sku=>NAME[family(sku)]||'',
 add(sku,qty,color){
  if(!known(sku)||!validQty(qty)||!allowed(sku,color))return {ok:false,error:'Choose a valid product, size and color.'};
  const rows=read(),found=rows.find(x=>x.sku===sku&&x.color===color);
  if(quantity(rows)+qty>10000)return {ok:false,error:'Order limit exceeded. Please request a bulk quote.'};
  if(found)found.quantity+=qty;
  else if(rows.length<55)rows.push({sku,color,quantity:qty});
  else return {ok:false,error:'Too many different product/color combinations.'};
  if(!save(rows))return {ok:false,error:'Browser storage unavailable. Enable storage or try another browser.'};
  return {ok:true,count:quantity(rows),quantity:qty,sku,color};
 }
};
if(!document.getElementById('retailCart'))return;
const $=id=>document.getElementById(id);
let last=null,version=0,loading=false,checkoutAvailable=false,checkoutGate=null;
const country=()=>String($('cartCountry').value||'').trim().toUpperCase();
const isWholesale=()=>quantity(read())>=10;
function clearEstimate(){
 version++;last=null;checkoutAvailable=false;checkoutGate=null;$('cartEstimate').hidden=true;$('cartCheckout').disabled=true;$('cartInquiry').hidden=true;
 $('cartSummaryShipping').textContent='Not calculated';$('cartSummaryTotal').textContent='—';
}
function sourceConsent(){
 const field=$('cartSeaConsent');
 return Boolean(field&&field.checked&&isWholesale());
}
function formatItems(){
 return aggregate(read()).map(x=>x.sku+' x '+x.quantity).join(', ');
}
function linkToInquiry(type){
 if(!last)return;
 const params=new URLSearchParams({
  type,cart:formatItems(),cart_country:last.country,cart_method:last.method,
  order_units:String(quantity(read())),
  cart_options:read().map(x=>x.sku+' | '+x.color+' | '+x.quantity).join('; ').slice(0,2200)
 });
 if(type==='quote'){
  params.set('shipping_consent','sea-25-30-days-estimated');
  params.set('discount_request','quantity-based wholesale pricing');
 }else{
  // Retail informational estimates are separate from the official card charge.
  if(Number.isFinite(last.totalBeforeTaxesUSD))params.set('cart_total',String(last.totalBeforeTaxesUSD));
  if(Number.isFinite(last.shippingUSD))params.set('cart_shipping',String(last.shippingUSD));
 }
 location.href='inquiry.html?'+params.toString();
}
function render(){
 clearEstimate();
 const lines=read(),n=quantity(lines),bulk=n>=10,body=$('cartLines');
 body.replaceChildren();let subtotal=0;
 for(const line of lines){
  const row=document.createElement('tr'),title=document.createElement('td');
  title.textContent=NAME[line.sku.slice(0,2)]+' · Size '+line.sku.slice(4);
  const colorLabel=document.createElement('label');colorLabel.textContent='Color: ';
  colorLabel.style.cssText='display:block;margin-top:7px;font-size:13px';
  const colorSelect=document.createElement('select');
  colorSelect.setAttribute('aria-label','Color for '+line.sku);
  if(!line.color){const option=new Option('Choose a color','');colorSelect.add(option)}
  for(const color of COLORS[family(line.sku)]){
   colorSelect.add(new Option(color,color));
  }
  colorSelect.value=line.color||'';
  colorSelect.addEventListener('change',()=>{
   const items=read(),found=items.find(x=>x.sku===line.sku&&x.color===line.color);
   if(found){found.color=colorSelect.value;save(items);render()}
  });
  colorLabel.append(colorSelect);title.append(colorLabel);
  const quantityCell=document.createElement('td'),count=document.createElement('input');
  count.type='number';count.min='1';count.max='10000';count.value=String(line.quantity);
  count.setAttribute('aria-label','Quantity '+line.sku);
  count.addEventListener('change',()=>{
   const current=read(),found=current.find(x=>x.sku===line.sku&&x.color===line.color);
   if(found){found.quantity=Math.max(1,Math.min(10000,Math.floor(Number(count.value)||1)));save(current);render()}
  });
  quantityCell.append(count);
  const cost=document.createElement('td');cost.textContent=bulk?'Quote required':money(PRICE[line.sku]*line.quantity);
  subtotal+=Math.round(PRICE[line.sku]*100)*line.quantity;
  const removeCell=document.createElement('td'),remove=document.createElement('button');
  remove.type='button';remove.textContent='Remove';
  remove.addEventListener('click',()=>{save(read().filter(x=>!(x.sku===line.sku&&x.color===line.color)));render()});
  removeCell.append(remove);row.append(title,quantityCell,cost,removeCell);body.append(row);
 }
 $('cartEmpty').hidden=lines.length>0;$('cartTable').hidden=lines.length===0;
 $('cartSubtotal').textContent=bulk?'Price on request':money(subtotal/100);
 $('cartSummaryGoods').textContent=bulk?'Price on request':money(subtotal/100);
 $('cartSea').disabled=!bulk;
 $('cartAir').disabled=bulk;
 $('cartMethod').value=bulk?'sea':'air';
 $('cartAir').textContent=country()==='US'?'Air parcel · estimated 12–15 days after dispatch':'Air parcel · confirm destination timing';
 $('cartSea').textContent='Wholesale sea freight · estimated 25–30 days after dispatch';
 $('cartWholesale').hidden=!bulk;
 $('cartRetail').hidden=bulk;
 $('cartSeaConsent').checked=false;
 $('cartRoute').textContent=bulk?
  'Wholesale · '+n+' items. Quantity-based discounts; sea freight required (estimated 25–30 days after dispatch, not guaranteed).':
  'Retail · '+n+' of 9 maximum items. Public USD unit prices; air parcel shipping.';
 $('cartCheckout').textContent=bulk?'Request tiered wholesale quote →':'Calculate shipping before checkout →';
 const confirmedParcels = n>=1 && n<=9 && country()==='US' &&
  lines.every(x=>['P1-S3','P1-S7'].includes(x.sku));
 $('cartCustomsNote').textContent=confirmedParcels?
  'China → US: each P1-S3 set has $11.50 shipping and each P1-S7 set has $14.00 shipping. Each set ships in its own parcel; charges are added per set and parcels may arrive separately. Customs clearance and US import duties are included, with no additional import duty charged to the buyer. Final US sales tax is shown before payment.':
  'China-direct delivery: customs clearance and import-duty coverage is not yet confirmed for this size or quantity. US sales tax is separate. Request a confirmed delivered-price quote before payment.';
 $('cartStatus').textContent=!lines.length?'Your cart is empty.':
  bulk?'Agree to sea freight terms and request a written wholesale quote. The product price, carton dimensions, freight and DDP total have not been verified.':
  'Review air freight and taxes before requesting secure payment. Online checkout is activated only when the payment provider is ready.';
}
$('cartCountry').addEventListener('input',render);
$('cartMethod').addEventListener('change',clearEstimate);
$('cartSeaConsent').addEventListener('change',clearEstimate);
$('cartEstimateForm').addEventListener('submit',async e=>{
 e.preventDefault();
 if(loading)return;
 const lines=read(),n=quantity(lines),bulk=n>=10;
 if(lines.some(x=>!allowed(x.sku,x.color))){
  $('cartStatus').textContent='Choose a color for every cart item before checking freight.';return;
 }
 if(!lines.length)return;
 if(bulk&&!sourceConsent()){
  $('cartStatus').textContent='Please accept 25–30 day estimated sea freight terms before requesting a wholesale quote.';return;
 }
 if(bulk&&$('cartMethod').value!=='sea'||!bulk&&$('cartMethod').value!=='air'){
  $('cartStatus').textContent='Invalid delivery method for this order quantity.';return;
 }
 if(!/^[A-Z]{2}$/.test(country())){
  $('cartStatus').textContent='Enter a valid two-letter destination country before continuing.';return;
 }
 if(n>10000){
  $('cartStatus').textContent='Maximum inquiry quantity is 10,000 units per request. Please contact MING EAGLE for larger quantities.';return;
 }
 if(bulk){
  // Wholesale is an RFQ, not a rate calculation or payment. Do not make a
  // prospect's ability to request a written quotation depend on shipping API
  // uptime when supplier cartons/sea DDP charges are not yet verified.
  clearEstimate();
  last={country:country(),method:'sea',wholesale:true,quoteRequired:true,
   productsUSD:null,shippingUSD:null,totalBeforeTaxesUSD:null,volumeCBM:null,
   paymentEnabled:false,ddpConfirmed:false};
  $('cartSummaryGoods').textContent='Price on request';
  $('cartSummaryShipping').textContent='Written DDP quote required';
  $('cartSummaryTotal').textContent='To be confirmed';
  $('cartEstimate').hidden=true;
  $('cartCheckout').disabled=false;
  $('cartInquiry').hidden=true;
  $('cartCheckout').textContent='Continue to wholesale RFQ form →';
  $('cartStatus').textContent='Continue to the wholesale inquiry form to confirm products, quantity and destination. No payment or shipping quote is generated. Supplier prices, actual cartons and DDP freight require written confirmation.';
  return;
 }
 clearEstimate();const current=version;loading=true;
 $('cartStatus').textContent='Checking current server-side retail air shipping…';
 try{
  const response=await fetch('https://app.mingeagle.com/api/shipping/cart',{
   method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({lines:aggregate(lines),country:country(),method:$('cartMethod').value,
    seaFreightAccepted:sourceConsent()})
  });
  const result=await response.json();
  if(current!==version)return;
  if(!response.ok||!result.ok)throw Error(result.error||'Estimate unavailable');
  if(result.wholesale!==false)throw Error('Retail air order classification mismatch');
  last=result;
  if(typeof (result.productsUSD??result.productUSD)!=='number'||
     typeof result.shippingUSD!=='number'||typeof result.totalBeforeTaxesUSD!=='number')
   throw Error('Retail delivered-price quote is incomplete');
  const goods=Number(result.productsUSD??result.productUSD),freight=Number(result.shippingUSD),total=Number(result.totalBeforeTaxesUSD);
  if(![goods,freight,total].every(Number.isFinite))throw Error('Invalid server shipping amount');
  $('cartGoods').textContent=money(goods);$('cartFreight').textContent=money(freight);$('cartTotal').textContent=money(total);
  $('cartSummaryGoods').textContent=money(goods);$('cartSummaryShipping').textContent=money(freight);
  $('cartSummaryTotal').textContent=money(total);$('cartEstimate').hidden=false;
  // Verify payment readiness before promising a payment route. The server
  // remains authoritative and repeats this check during order creation.
  checkoutAvailable=false;
  if(!bulk&&result.ddpConfirmed===true){
   $('cartStatus').textContent='Checking secure card checkout activation…';
   try{
    const gate=await fetch('https://app.mingeagle.com/api/retail/checkout-status',{cache:'no-store'});
    const data=gate.ok?await gate.json():null;
    if(current!==version)return;
    checkoutGate=data&&typeof data==='object'?data:null;
    checkoutAvailable=Boolean(checkoutGate?.ok&&checkoutGate.retailCheckoutReady===true&&n<=(checkoutGate.maxDirectCheckoutUnits??1)&&lines.every(x=>checkoutGate.eligibleSkus?.includes(x.sku)));
   }catch{checkoutAvailable=false;checkoutGate=null}
  }
  if(current!==version)return;
  $('cartCheckout').disabled=false;
  $('cartInquiry').hidden=!checkoutAvailable;
  $('cartCheckout').textContent=bulk?'Request tiered wholesale quote →':
   result.ddpConfirmed!==true?'Request confirmed delivered-price quote →':
   checkoutAvailable?'Continue to secure checkout →':'Request confirmed retail quote →';
  const eligibleForDirectCheckout=Boolean(checkoutGate?.ok&&Array.isArray(checkoutGate.eligibleSkus)&&lines.every(x=>checkoutGate.eligibleSkus.includes(x.sku)));
  const maxDirectCheckoutUnits=Number(checkoutGate?.maxDirectCheckoutUnits??1);
  const checkoutBlockedStatus=!checkoutGate||checkoutGate.ok!==true?
    'Could not verify online card checkout for this order. No payment will be taken. You can request a confirmed retail quote instead.':
   checkoutGate.retailCheckoutReady!==true?
    'Online card checkout is not activated for this order yet. No payment will be taken. You can request a confirmed retail quote instead.':
   !eligibleForDirectCheckout?
    'This model or size is not currently enabled for direct card checkout. No payment will be taken. You can request a confirmed retail quote instead.':
   n>maxDirectCheckoutUnits?
    'This basket exceeds the current direct-checkout quantity limit. No payment will be taken. You can request a confirmed retail quote instead.':
    'This basket does not meet the current direct-checkout requirements. No payment will be taken. You can request a confirmed retail quote instead.';
  $('cartStatus').textContent=result.ddpConfirmed!==true?
    'Import duties have not been confirmed for this basket. Request a delivered-price quote before payment.':
   checkoutAvailable?
    'Import duties are included. Each set ships in its own parcel, with shipping charged per set; parcels may arrive separately. Continue to checkout for final sales tax before payment.':
    checkoutBlockedStatus;
 }catch(err){$('cartStatus').textContent='Cannot calculate shipping: '+String(err?.message||err)}
 finally{loading=false}
});
$('cartCheckout').addEventListener('click',async()=>{
 if(!last)return;
 if(isWholesale()){
  if(!sourceConsent()){$('cartStatus').textContent='Accept sea freight before requesting wholesale terms.';return}
  linkToInquiry('quote');return;
 }
 if(last.ddpConfirmed!==true||!checkoutAvailable){
  // An inquiry occurs only from a button explicitly labeled as a quote request.
  linkToInquiry('retail');return;
 }
 // Only switch from inquiry fallback to real retail checkout after the
 // server reports *all* merchant/payment/stock/tax/Turnstile gates ready.
 const button=$('cartCheckout');button.disabled=true;
 $('cartStatus').textContent='Checking secure retail payment availability…';
 try{
  const response=await fetch('https://app.mingeagle.com/api/retail/checkout-status',{cache:'no-store'});
  if(response.ok){
   const data=await response.json();
   if(data.ok&&data.retailCheckoutReady===true&&quantity(read())<=(data.maxDirectCheckoutUnits??1)&&read().every(x=>allowed(x.sku,x.color)&&data.eligibleSkus?.includes(x.sku))){
    const url=new URL('https://app.mingeagle.com/retail/checkout');
    url.searchParams.set('cart',JSON.stringify(read()));
    url.searchParams.set('country',country());
    location.href=url.href;return;
   }
  }
  checkoutAvailable=false;
  $('cartCheckout').textContent='Request confirmed retail quote →';
  $('cartStatus').textContent='Secure card checkout is not activated for this order. No payment was taken. The button now offers a confirmed retail quote instead.';
 }catch{
  checkoutAvailable=false;
  $('cartCheckout').textContent='Request confirmed retail quote →';
  $('cartStatus').textContent='Unable to verify secure card payment. No payment was taken. The button now offers a confirmed retail quote instead.';
 }finally{button.disabled=false}
 $('cartInquiry').hidden=true;
});
$('cartInquiry').addEventListener('click',()=>{
 if(last&&!isWholesale())linkToInquiry('retail');
});
render();
})();
