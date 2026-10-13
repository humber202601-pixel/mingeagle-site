(function(){'use strict';
const STORAGE='mingeagle_retail_cart_v1';
const SKU=/^(?:P1-S[357]|P2-S[357]|P3-S[3467]|P4-S5)$/;
const PRICE={'P1-S3':9.9,'P1-S5':11.9,'P1-S7':14.9,'P2-S3':10.9,'P2-S5':12.9,'P2-S7':15.9,'P3-S3':12.9,'P3-S4':14.9,'P3-S6':18.9,'P3-S7':21.9,'P4-S5':17.9};
const NAME={P1:'Flocked Silent Basketball Set',P2:'Fabric-Cover Silent Basketball Set',P3:'Weighted Flocked Silent Basketball',P4:'Flocked Silent Soccer Ball'};
const money=n=>'$'+Number(n).toFixed(2);
function read(){
 try{const value=JSON.parse(localStorage.getItem(STORAGE)||'[]');
 return Array.isArray(value)?value.filter(v=>v&&typeof v.sku==='string'&&SKU.test(v.sku)&&
  Number.isSafeInteger(v.quantity)&&v.quantity>=1&&v.quantity<=10000).slice(0,11):[]}
 catch{return []}
}
function save(rows){try{localStorage.setItem(STORAGE,JSON.stringify(rows))}catch{}}
const quantity=lines=>lines.reduce((sum,x)=>sum+x.quantity,0);
window.MingEagleCart={
 read,
 add(sku,qty){
  if(!SKU.test(sku)||!Number.isSafeInteger(qty)||qty<1||qty>10000)return 0;
  const rows=read(),found=rows.find(x=>x.sku===sku);
  if(found)found.quantity=Math.min(10000,found.quantity+qty);
  else if(rows.length<11)rows.push({sku,quantity:qty});
  save(rows);return quantity(rows);
 }
};
if(!document.getElementById('retailCart'))return;
const $=id=>document.getElementById(id);
let last=null,version=0,loading=false;
const country=()=>String($('cartCountry').value||'').trim().toUpperCase();
const isWholesale=()=>quantity(read())>=10;
function clearEstimate(){
 version++;last=null;$('cartEstimate').hidden=true;$('cartCheckout').disabled=true;
 $('cartSummaryShipping').textContent='Not calculated';$('cartSummaryTotal').textContent='—';
}
function sourceConsent(){
 const field=$('cartSeaConsent');
 return Boolean(field&&field.checked&&isWholesale());
}
function formatItems(){
 return read().map(x=>x.sku+' x '+x.quantity).join(', ');
}
function linkToInquiry(type){
 if(!last)return;
 const params=new URLSearchParams({
  type,cart:formatItems(),cart_country:last.country,cart_method:last.method,
  cart_total:String(last.totalBeforeTaxesUSD),cart_shipping:String(last.shippingUSD),
  order_units:String(quantity(read()))
 });
 if(type==='quote'){
  params.set('shipping_consent','sea-25-30-days-estimated');
  params.set('discount_request','quantity-based wholesale pricing');
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
  const quantityCell=document.createElement('td'),count=document.createElement('input');
  count.type='number';count.min='1';count.max='10000';count.value=String(line.quantity);
  count.setAttribute('aria-label','Quantity '+line.sku);
  count.addEventListener('change',()=>{
   const current=read(),found=current.find(x=>x.sku===line.sku);
   if(found){found.quantity=Math.max(1,Math.min(10000,Math.floor(Number(count.value)||1)));save(current);render()}
  });
  quantityCell.append(count);
  const cost=document.createElement('td');cost.textContent=money(PRICE[line.sku]*line.quantity);
  subtotal+=Math.round(PRICE[line.sku]*100)*line.quantity;
  const removeCell=document.createElement('td'),remove=document.createElement('button');
  remove.type='button';remove.textContent='Remove';
  remove.addEventListener('click',()=>{save(read().filter(x=>x.sku!==line.sku));render()});
  removeCell.append(remove);row.append(title,quantityCell,cost,removeCell);body.append(row);
 }
 $('cartEmpty').hidden=lines.length>0;$('cartTable').hidden=lines.length===0;
 $('cartSubtotal').textContent=money(subtotal/100);
 $('cartSummaryGoods').textContent=money(subtotal/100);
 $('cartSea').disabled=!bulk;
 $('cartAir').disabled=bulk;
 $('cartMethod').value=bulk?'sea':'air';
 $('cartAir').textContent=country()==='US'?'Air parcel · estimated 12–15 days (US one item)':'Air parcel · confirm destination timing';
 $('cartSea').textContent='Wholesale sea freight · estimated 25–30 days after dispatch';
 $('cartWholesale').hidden=!bulk;
 $('cartRetail').hidden=bulk;
 $('cartSeaConsent').checked=false;
 $('cartRoute').textContent=bulk?
  'Wholesale · '+n+' items. Quantity-based discounts; sea freight required (estimated 25–30 days after dispatch, not guaranteed).':
  'Retail · '+n+' of 9 maximum items. Public USD unit prices; air parcel shipping.';
 $('cartCheckout').textContent=bulk?'Request tiered wholesale quote →':'Request secure retail payment →';
 $('cartStatus').textContent=!lines.length?'Your cart is empty.':
  bulk?'Agree to sea freight terms before calculating the wholesale freight estimate.':
  'Review air freight and taxes before requesting secure payment. Online checkout is activated only when the payment provider is ready.';
}
$('cartCountry').addEventListener('input',render);
$('cartMethod').addEventListener('change',clearEstimate);
$('cartSeaConsent').addEventListener('change',clearEstimate);
$('cartEstimateForm').addEventListener('submit',async e=>{
 e.preventDefault();
 if(loading)return;
 const lines=read(),n=quantity(lines),bulk=n>=10;
 if(!lines.length)return;
 if(bulk&&!sourceConsent()){
  $('cartStatus').textContent='Please accept 25–30 day estimated sea freight terms before requesting a wholesale quote.';return;
 }
 if(bulk&&$('cartMethod').value!=='sea'||!bulk&&$('cartMethod').value!=='air'){
  $('cartStatus').textContent='Invalid delivery method for this order quantity.';return;
 }
 clearEstimate();const current=version;loading=true;
 $('cartStatus').textContent='Checking current server-side shipping estimate…';
 try{
  const response=await fetch('https://app.mingeagle.com/api/shipping/cart',{
   method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({lines,country:country(),method:$('cartMethod').value,
    seaFreightAccepted:sourceConsent()})
  });
  const result=await response.json();
  if(current!==version)return;
  if(!response.ok||!result.ok)throw Error(result.error||'Estimate unavailable');
  if((n>=10)!==Boolean(result.wholesale))throw Error('Order classification mismatch');
  last=result;
  const goods=Number(result.productsUSD??result.productUSD),freight=Number(result.shippingUSD),total=Number(result.totalBeforeTaxesUSD);
  if(![goods,freight,total].every(Number.isFinite))throw Error('Invalid server shipping amount');
  $('cartGoods').textContent=money(goods);$('cartFreight').textContent=money(freight);$('cartTotal').textContent=money(total);
  $('cartSummaryGoods').textContent=money(goods);$('cartSummaryShipping').textContent=money(freight);
  $('cartSummaryTotal').textContent=money(total);$('cartEstimate').hidden=false;
  $('cartCheckout').disabled=false;
  $('cartStatus').textContent=bulk?
   'Preliminary wholesale sea freight only. Quantity discounts and final total require a written quote; delivery estimated 25–30 days after dispatch.':
   'Retail cost estimated. No funds are collected on this page. Payment requires confirmed stock, final taxes and an activated secure payment gateway.';
 }catch(err){$('cartStatus').textContent='Cannot calculate shipping: '+String(err?.message||err)}
 finally{loading=false}
});
$('cartCheckout').addEventListener('click',()=>{
 if(!last)return;
 if(isWholesale()){
  if(!sourceConsent()){$('cartStatus').textContent='Accept sea freight before requesting wholesale terms.';return}
  linkToInquiry('quote');
 }else{linkToInquiry('retail')}
});
render();
})();
