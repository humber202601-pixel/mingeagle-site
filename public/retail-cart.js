(function(){'use strict';
const KEY='mingeagle_retail_cart_v1';
function read(){try{const x=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(x)?x.filter(i=>i&&/^P[1-4]-S[34567]$/.test(i.sku)&&Number.isSafeInteger(i.quantity)&&i.quantity>0).slice(0,11):[]}catch{return []}}
function save(lines){localStorage.setItem(KEY,JSON.stringify(lines))}
window.MingEagleCart={read,add(sku,quantity){const lines=read(),item=lines.find(x=>x.sku===sku);if(item)item.quantity=Math.min(10000,item.quantity+quantity);else lines.push({sku,quantity});save(lines);return lines.reduce((n,x)=>n+x.quantity,0)}};
const el=document.getElementById('retailCart');if(!el)return;
const $=id=>document.getElementById(id);const prices={'P1-S3':9.9,'P1-S5':11.9,'P1-S7':14.9,'P2-S3':10.9,'P2-S5':12.9,'P2-S7':15.9,'P3-S3':12.9,'P3-S4':14.9,'P3-S6':18.9,'P3-S7':21.9,'P4-S5':17.9};
const products={P1:'Flocked Silent Basketball Set',P2:'Fabric-Cover Silent Basketball Set',P3:'Weighted Flocked Silent Basketball',P4:'Flocked Silent Soccer Ball'};
let latest=null;
const money=n=>'$'+Number(n).toFixed(2);
function redraw(){const lines=read(),body=$('cartLines');body.replaceChildren();let sub=0;
 for(const l of lines){if(!(l.sku in prices))continue;const tr=document.createElement('tr'),title=document.createElement('td');title.textContent=products[l.sku.slice(0,2)]+' · Size '+l.sku.slice(4);
 const qcell=document.createElement('td'),q=document.createElement('input');q.type='number';q.min='1';q.max='10000';q.value=String(l.quantity);q.setAttribute('aria-label','Quantity '+l.sku);
 q.addEventListener('change',()=>{const x=read().find(x=>x.sku===l.sku);if(x){x.quantity=Math.max(1,Math.min(10000,Math.floor(Number(q.value)||1)));save(read().map(z=>z.sku===x.sku?x:z));latest=null;redraw()}});qcell.append(q);
 const price=document.createElement('td');price.textContent=money(prices[l.sku]*l.quantity);sub+=prices[l.sku]*l.quantity;
 const rem=document.createElement('td'),b=document.createElement('button');b.type='button';b.textContent='Remove';b.addEventListener('click',()=>{save(read().filter(x=>x.sku!==l.sku));latest=null;redraw()});rem.append(b);tr.append(title,qcell,price,rem);body.append(tr)}
 $('cartEmpty').hidden=lines.length>0;$('cartTable').hidden=lines.length===0;
 $('cartSubtotal').textContent=money(sub);$('cartEstimate').hidden=true;$('cartCheckout').disabled=true;
 const total=lines.reduce((n,x)=>n+x.quantity,0);$('cartSea').disabled=total<10;if(total<10&&$('cartMethod').value==='sea')$('cartMethod').value='air';
 $('cartStatus').textContent=lines.length?'Select destination and calculate the current shipping cost.':'Your cart is empty.';
}
$('cartEstimateForm').addEventListener('submit',async e=>{e.preventDefault();const lines=read();if(!lines.length)return;latest=null;$('cartCheckout').disabled=true;$('cartStatus').textContent='Calculating live shipping…';
try{const r=await fetch('https://app.mingeagle.com/api/shipping/cart',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({lines,country:$('cartCountry').value.trim().toUpperCase(),method:$('cartMethod').value})});const d=await r.json();if(!r.ok||!d.ok)throw Error(d.error||'Shipping unavailable');latest=d;$('cartGoods').textContent=money(d.productsUSD);$('cartFreight').textContent=money(d.shippingUSD);$('cartTotal').textContent=money(d.totalBeforeTaxesUSD);$('cartEstimate').hidden=false;$('cartCheckout').disabled=false;$('cartStatus').textContent='Estimate only. No payment is collected. Taxes and duties are not included.';}catch(err){$('cartStatus').textContent='Unable to quote: '+String(err.message||err)}});
$('cartCheckout').addEventListener('click',()=>{if(!latest)return;const summary=latest.lines.map(x=>x.sku+' × '+x.quantity).join(', ');const q=new URLSearchParams({type:'retail',cart:summary,cart_country:latest.country,cart_method:latest.method,cart_total:String(latest.totalBeforeTaxesUSD),cart_shipping:String(latest.shippingUSD)});location.href='inquiry.html?'+q});
redraw();
})();