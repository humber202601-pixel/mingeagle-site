(function(){
'use strict';
const block=document.getElementById('retailShipping');if(!block)return;
const pick=id=>document.getElementById(id);
const form=pick('retailShippingForm'),status=pick('shippingEstimateStatus'),details=pick('shippingEstimateDetails');
const prefix={p1:'P1',p2:'P2',p3:'P3',p4:'P4'}[block.dataset.product];
if(!prefix)return;
const js=document.createElement('script');js.src='retail-cart.js?v=20261011-1';document.head.appendChild(js);
function syncMethod(){
 const n=Number(pick('shippingUnits').value);
 const sea=[...pick('shippingMode').options].find(o=>o.value==='sea');
 if(sea){sea.disabled=Number.isFinite(n)&&n<10;if(sea.disabled&&pick('shippingMode').value==='sea')pick('shippingMode').value='air';}
}
pick('shippingUnits').addEventListener('input',syncMethod);syncMethod();
form.addEventListener('submit',async e=>{
 e.preventDefault();syncMethod();details.hidden=true;status.textContent='Calculating…';
 const size=pick('retailSize')?.value,qty=Number(pick('shippingUnits').value),country=pick('shippingCountry').value.trim().toUpperCase(),method=pick('shippingMode').value;
 if(!Number.isSafeInteger(qty)||qty<1||qty>10000||!/^[A-Z]{2}$/.test(country)||!size){status.textContent='Enter a valid two-letter country code and quantity.';return}
 const params=new URLSearchParams({sku:prefix+'-S'+size,country,method,quantity:String(qty)});
 try{
  const response=await fetch('https://app.mingeagle.com/api/shipping/estimate?'+params,{cache:'no-store'});
  const data=await response.json();
  if(!response.ok||!data.ok){status.textContent='Automatic shipping quote is not available for this destination yet. Please request a manual quote.';return}
  pick('shippingGoods').textContent='$'+Number(data.productUSD).toFixed(2);
  pick('shippingFee').textContent='$'+Number(data.shippingUSD).toFixed(2);
  pick('shippingTotal').textContent='$'+Number(data.totalBeforeTaxesUSD).toFixed(2);
  details.hidden=false;status.textContent='Estimate only. Taxes, customs duties and availability require confirmation before payment.';
  if(!document.getElementById('addRetailCart')){const b=document.createElement('button');b.id='addRetailCart';b.type='button';b.className='btn primary';b.textContent='Add to cart';details.appendChild(b);b.addEventListener('click',()=>{const size=pick('retailSize')?.value,qty=Number(pick('shippingUnits').value);if(!size||!Number.isSafeInteger(qty)||qty<1)return;const items=window.MingEagleCart;if(!items){status.textContent='Cart unavailable, please refresh the page.';return}items.add(prefix+'-S'+size,qty);location.href='retail-cart.html';});}
 }catch{status.textContent='Unable to load live shipping rates. Please ask for a manual quote.'}
});
})();