(function(){'use strict';
const KEY='mingeagle_retail_cart_v1';
const validSku=/^(?:P1-S[357]|P2-S[357]|P3-S[3467]|P4-S5)$/;
function read(){try{const x=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(x)?x.filter(i=>i&&validSku.test(i.sku)&&Number.isSafeInteger(i.quantity)&&i.quantity>0).slice(0,11):[]}catch{return []}}
function save(lines){try{localStorage.setItem(KEY,JSON.stringify(lines))}catch{}}
window.MingEagleCart={read,add(sku,quantity){if(!validSku.test(sku)||!Number.isSafeInteger(quantity)||quantity<1||quantity>10000)return 0;const lines=read(),item=lines.find(x=>x.sku===sku);if(item)item.quantity=Math.min(10000,item.quantity+quantity);else if(lines.length<11)lines.push({sku,quantity});save(lines);return lines.reduce((n,x)=>n+x.quantity,0)}};
const el=document.getElementById('retailCart');if(!el)return;
const $=id=>document.getElementById(id);const prices={'P1-S3':9.9,'P1-S5':11.9,'P1-S7':14.9,'P2-S3':10.9,'P2-S5':12.9,'P2-S7':15.9,'P3-S3':12.9,'P3-S4':14.9,'P3-S6':18.9,'P3-S7':21.9,'P4-S5':17.9};
const products={P1:'Flocked Silent Basketball Set',P2:'Fabric-Cover Silent Basketball Set',P3:'Weighted Flocked Silent Basketball',P4:'Flocked Silent Soccer Ball'};
let latest=null,quoteRequest=0;
function invalidate(){quoteRequest++;latest=null;$('cartCheckout').disabled=true;$('cartEstimate').hidden=true;$('cartSummaryShipping').textContent='Not calculated';$('cartSummaryTotal').textContent='—';}
const money=n=>'

function updateAirLabel(){const el=$('cartAir');if(!el)return;el.textContent=$('cartCountry').value.trim().toUpperCase()==='US'?'Air parcel · US estimated 12–15 days after dispatch':'Air parcel · delivery timing confirmed on request';}
function redraw(){const lines=read(),body=$('cartLines');body.replaceChildren();let sub=0;
 for(const l of lines){if(!(l.sku in prices))continue;const tr=document.createElement('tr'),title=document.createElement('td');title.textContent=products[l.sku.slice(0,2)]+' · Size '+l.sku.slice(4);
 const qcell=document.createElement('td'),q=document.createElement('input');q.type='number';q.min='1';q.max='10000';q.value=String(l.quantity);q.setAttribute('aria-label','Quantity '+l.sku);
 q.addEventListener('change',()=>{const x=read().find(x=>x.sku===l.sku);if(x){x.quantity=Math.max(1,Math.min(10000,Math.floor(Number(q.value)||1)));save(read().map(z=>z.sku===x.sku?x:z));invalidate();redraw()}});qcell.append(q);
 const price=document.createElement('td');price.textContent=money(prices[l.sku]*l.quantity);sub+=prices[l.sku]*l.quantity;
 const rem=document.createElement('td'),b=document.createElement('button');b.type='button';b.textContent='Remove';b.addEventListener('click',()=>{save(read().filter(x=>x.sku!==l.sku));latest=null;redraw()});rem.append(b);tr.append(title,qcell,price,rem);body.append(tr)}
 $('cartEmpty').hidden=lines.length>0;$('cartTable').hidden=lines.length===0;
 $('cartSubtotal').textContent=money(sub);$('cartSummaryGoods').textContent=money(sub);$('cartSummaryShipping').textContent='Not calculated';$('cartSummaryTotal').textContent='—';$('cartEstimate').hidden=true;$('cartCheckout').disabled=true;
 const total=lines.reduce((n,x)=>n+x.quantity,0);if(total<10)$('bulkSeaConsent').checked=false;wholesaleMode();
 $('cartStatus').textContent=lines.length?(total>=10?'10+ items: accept sea freight and request a volume-discounted quote.':'1–9 items: calculate air freight before continuing to secure retail checkout.'):'Your cart is empty.';
}
$('cartEstimateForm').addEventListener('submit',async e=>{e.preventDefault();const lines=read();if(!lines.length||quantity()>=10){$('cartStatus').textContent='10+ units must use a sea-freight wholesale quotation.';return}invalidate();const requestId=quoteRequest;$('cartCheckout').disabled=true;$('cartStatus').textContent='Calculating live shipping…';
try{const r=await fetch('https://app.mingeagle.com/api/shipping/cart',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({lines,country:$('cartCountry').value.trim().toUpperCase(),method:$('cartMethod').value})});const d=await r.json();if(requestId!==quoteRequest)return;if(!r.ok||!d.ok||d.mode==='WHOLESALE_RFQ')throw Error(d.error||'Shipping unavailable');if(!Number.isFinite(d.productsUSD)||!Number.isFinite(d.shippingUSD)||d.quantity!==quantity())throw Error('Incomplete or stale server shipping amount');latest=d;$('cartGoods').textContent=money(d.productsUSD);$('cartFreight').textContent=money(d.shippingUSD);$('cartTotal').textContent=money(d.totalBeforeTaxesUSD);$('cartSummaryGoods').textContent=money(d.productsUSD);$('cartSummaryShipping').textContent=money(d.shippingUSD);$('cartSummaryTotal').textContent=money(d.totalBeforeTaxesUSD);$('cartEstimate').hidden=false;$('cartCheckout').disabled=false;$('cartStatus').textContent='Estimate only. No payment is collected. Taxes and duties are not included.';}catch(err){$('cartStatus').textContent='Unable to quote: '+String(err.message||err)}});
$('cartCountry').addEventListener('input',()=>{invalidate();updateAirLabel();wholesaleMode()});$('cartMethod').addEventListener('change',()=>{invalidate();wholesaleMode()});$('bulkSeaConsent').addEventListener('change',wholesaleMode);
$('cartCheckout').addEventListener('click',()=>{
 const lines=read(),items=quantity(),country=$('cartCountry').value.trim().toUpperCase();
 if(!lines.length||items<1||items>10000)return;
 if(items>=10){
  if(!$('bulkSeaConsent').checked){$('cartStatus').textContent='Please accept 25–30 day estimated sea freight before requesting wholesale prices.';return}
  const params=new URLSearchParams({type:'quote',cart_flow:'wholesale',cart:lines.map(x=>x.sku+' x '+x.quantity).join(', '),cart_country:country,cart_method:'sea',sea_accepted:'yes'});
  location.href='inquiry.html?'+params.toString();return;
 }
 if(!latest||latest.quantity!==items||latest.country!==country||latest.method!=='air')return;
 location.href='retail-checkout.html';
});
redraw();
})();+Number(n).toFixed(2);
const quantity=()=>read().reduce((sum,item)=>sum+item.quantity,0);
function wholesaleMode(){
 const bulk=quantity()>=10;
 $('cartWholesale').hidden=!bulk;
 $('cartEstimateForm').hidden=bulk;
 $('cartSea').disabled=!bulk;
 $('cartAir').disabled=bulk;
 $('cartMethod').value=bulk?'sea':'air';
 $('cartShippingTitle').textContent=bulk?'Wholesale sea-freight inquiry':'Retail air-shipping estimate';
 $('cartSummaryHeading').textContent=bulk?'Wholesale quote request':'Retail order summary';
 $('cartSubtotalLabel').textContent=bulk?'Retail reference only':'Product price';
 $('cartCheckout').textContent=bulk?'Request a discounted wholesale quote →':'Continue to secure retail checkout →';
 $('cartCheckoutInfo').textContent=bulk?'Discount varies by quantity. No payment until a written wholesale quote is approved.':'The secure payment step will confirm whether checkout is currently active.';
 $('cartNote').textContent=bulk?
  '10+ items: buyer must agree to sea freight. Estimated transit 25–30 days after dispatch, not guaranteed. Price, discounts, duties and final freight require a written wholesale quote.':
  '1–9 items: published retail prices; air freight calculated separately. Taxes, duties and final delivery are confirmed before payment.';
 if(bulk){$('cartSummaryShipping').textContent='Quoted individually';$('cartSummaryTotal').textContent='Quantity discount available';}
 $('cartCheckout').disabled=bulk?!$('bulkSeaConsent').checked:!latest;
}

function updateAirLabel(){const el=$('cartAir');if(!el)return;el.textContent=$('cartCountry').value.trim().toUpperCase()==='US'?'Air parcel · US estimated 12–15 days after dispatch':'Air parcel · delivery timing confirmed on request';}
function redraw(){const lines=read(),body=$('cartLines');body.replaceChildren();let sub=0;
 for(const l of lines){if(!(l.sku in prices))continue;const tr=document.createElement('tr'),title=document.createElement('td');title.textContent=products[l.sku.slice(0,2)]+' · Size '+l.sku.slice(4);
 const qcell=document.createElement('td'),q=document.createElement('input');q.type='number';q.min='1';q.max='10000';q.value=String(l.quantity);q.setAttribute('aria-label','Quantity '+l.sku);
 q.addEventListener('change',()=>{const x=read().find(x=>x.sku===l.sku);if(x){x.quantity=Math.max(1,Math.min(10000,Math.floor(Number(q.value)||1)));save(read().map(z=>z.sku===x.sku?x:z));invalidate();redraw()}});qcell.append(q);
 const price=document.createElement('td');price.textContent=money(prices[l.sku]*l.quantity);sub+=prices[l.sku]*l.quantity;
 const rem=document.createElement('td'),b=document.createElement('button');b.type='button';b.textContent='Remove';b.addEventListener('click',()=>{save(read().filter(x=>x.sku!==l.sku));latest=null;redraw()});rem.append(b);tr.append(title,qcell,price,rem);body.append(tr)}
 $('cartEmpty').hidden=lines.length>0;$('cartTable').hidden=lines.length===0;
 $('cartSubtotal').textContent=money(sub);$('cartSummaryGoods').textContent=money(sub);$('cartSummaryShipping').textContent='Not calculated';$('cartSummaryTotal').textContent='—';$('cartEstimate').hidden=true;$('cartCheckout').disabled=true;
 const total=lines.reduce((n,x)=>n+x.quantity,0);$('cartSea').disabled=total<10;if(total<10&&$('cartMethod').value==='sea')$('cartMethod').value='air';
 $('cartStatus').textContent=lines.length?'Select destination and calculate the current shipping cost.':'Your cart is empty.';
}
$('cartEstimateForm').addEventListener('submit',async e=>{e.preventDefault();const lines=read();if(!lines.length)return;invalidate();const requestId=quoteRequest;$('cartCheckout').disabled=true;$('cartStatus').textContent='Calculating live shipping…';
try{const r=await fetch('https://app.mingeagle.com/api/shipping/cart',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({lines,country:$('cartCountry').value.trim().toUpperCase(),method:$('cartMethod').value})});const d=await r.json();if(requestId!==quoteRequest)return;if(!r.ok||!d.ok)throw Error(d.error||'Shipping unavailable');latest=d;$('cartGoods').textContent=money(d.productsUSD);$('cartFreight').textContent=money(d.shippingUSD);$('cartTotal').textContent=money(d.totalBeforeTaxesUSD);$('cartSummaryGoods').textContent=money(d.productsUSD);$('cartSummaryShipping').textContent=money(d.shippingUSD);$('cartSummaryTotal').textContent=money(d.totalBeforeTaxesUSD);$('cartEstimate').hidden=false;$('cartCheckout').disabled=false;$('cartStatus').textContent='Estimate only. No payment is collected. Taxes and duties are not included.';}catch(err){$('cartStatus').textContent='Unable to quote: '+String(err.message||err)}});
$('cartCountry').addEventListener('input',invalidate);$('cartMethod').addEventListener('change',invalidate);
$('cartCheckout').addEventListener('click',()=>{if(!latest)return;const summary=latest.lines.map(x=>x.sku+' × '+x.quantity).join(', ');const q=new URLSearchParams({type:'retail',cart:summary,cart_country:latest.country,cart_method:latest.method,cart_total:String(latest.totalBeforeTaxesUSD),cart_shipping:String(latest.shippingUSD)});location.href='inquiry.html?'+q});
redraw();
})();