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
const api={calculate};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
else root.MingEagleQuoteMath=api;
})(typeof window==='undefined'?globalThis:window);
