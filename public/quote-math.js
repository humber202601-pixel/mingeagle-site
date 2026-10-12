(function(root){
'use strict';
// Pure quote math shared by future CRM and quote-preview UIs.
// Amounts are stored in integer USD cents to avoid floating point totals.
function cents(value){
 const s=String(value).trim();
 if(!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(s))throw new Error('INVALID_MONEY');
 const [whole,dec='']=s.split('.');
 return Number(whole)*100+Number(dec.padEnd(2,'0'));
}
function money(value){return (value/100).toFixed(2)}
function calculate(input){
 const units=Number(input.quantity);
 if(!Number.isSafeInteger(units)||units<1||units>999999)throw new Error('INVALID_QUANTITY');
 const retail=cents(input.retailUnitPrice),wholesale=cents(input.wholesaleUnitPrice);
 if(wholesale>retail)throw new Error('ABOVE_RETAIL_REFERENCE');
 const retailTotal=retail*units,wholesaleTotal=wholesale*units,savings=retailTotal-wholesaleTotal;
 if(!Number.isSafeInteger(retailTotal)||!Number.isSafeInteger(wholesaleTotal))throw new Error('INVALID_TOTAL');
 return {currency:'USD',quantity:units,retailUnitPrice:money(retail),wholesaleUnitPrice:money(wholesale),
 retailTotal:money(retailTotal),wholesaleTotal:money(wholesaleTotal),
 savingsPerUnit:money(retail-wholesale),savingsTotal:money(savings),
 discountPercent:retail?Number(((retail-wholesale)/retail*100).toFixed(2)):0,
 shippingAndTaxIncluded:false,approved:false};
}
function calculateFromCatalog(catalog,input){
 if(!catalog||catalog.currency!=='USD'||!catalog.products)throw new Error('INVALID_PRICE_SOURCE');
 const product=String(input.productId||'');
 const size=String(input.size||'').replace(/^No\.\s*/i,'');
 if(!/^p[1-4]$/.test(product)||!/^\d$/.test(size))throw new Error('INVALID_VARIANT');
 const retail=catalog.products[product]?.[size];
 if(retail===undefined)throw new Error('UNKNOWN_VARIANT');
 return {...calculate({retailUnitPrice:retail,wholesaleUnitPrice:input.wholesaleUnitPrice,quantity:input.quantity}),productId:product,size:'No. '+size};
}
function calculateOrder(catalog,lines){
 if(!Array.isArray(lines)||lines.length<1||lines.length>20)throw new Error('INVALID_LINES');
 const items=lines.map(line=>calculateFromCatalog(catalog,line));
 const quantity=items.reduce((n,item)=>n+item.quantity,0);
 const totalCents=key=>items.reduce((n,item)=>n+cents(item[key]),0);
 const retailTotal=totalCents('retailTotal'),wholesaleTotal=totalCents('wholesaleTotal');
 if(!Number.isSafeInteger(retailTotal)||!Number.isSafeInteger(wholesaleTotal))throw new Error('INVALID_TOTAL');
 const saved=retailTotal-wholesaleTotal;
 return {currency:'USD',items,quantity,retailTotal:money(retailTotal),
  wholesaleTotal:money(wholesaleTotal),savingsTotal:money(saved),
  discountPercent:retailTotal?Number((saved/retailTotal*100).toFixed(2)):0,
  shippingAndTaxIncluded:false,approved:false};
}
const api={calculate,calculateFromCatalog,calculateOrder};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
else root.MingEagleQuoteMath=api;
})(typeof window==='undefined'?globalThis:window);
