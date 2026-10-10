/* MING EAGLE shipment quote math. Server must price from authenticated, versioned rate tables. */
(function(root,factory){const api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MingEagleShippingMath=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const cents=n=>Math.round((Number(n)+Number.EPSILON)*100);
function valid(n,name){if(!Number.isFinite(Number(n))||Number(n)<=0)throw Error('Invalid '+name);return Number(n)}
function volumeCbm({lengthCm,widthCm,heightCm},units){
 const n=valid(units,'units');if(!Number.isInteger(n))throw Error('Units must be an integer');
 return valid(lengthCm,'lengthCm')*valid(widthCm,'widthCm')*valid(heightCm,'heightCm')*n/1e6;
}
function calculate({method,units,packaging,productPrice,ratePerCbm,ratePerVolKg,volumetricDivisor=6000,minimumFreight=0,handling=0}){
 const qty=valid(units,'units');if(!Number.isInteger(qty))throw Error('Units must be an integer');
 if(!['sea','air'].includes(method))throw Error('Unsupported method');
 if(method==='sea'&&qty<10)throw Error('Sea freight requires a minimum of 10 balls');
 const cbm=volumeCbm(packaging,qty);
 const volKg=cbm*1e6/valid(volumetricDivisor,'volumetricDivisor');
 const base=method==='sea'?cbm*valid(ratePerCbm,'ratePerCbm'):volKg*valid(ratePerVolKg,'ratePerVolKg');
 if(Number(minimumFreight)<0||Number(handling)<0)throw Error('Invalid fees');
 const freightCents=Math.max(cents(base),cents(minimumFreight))+cents(handling);
 const goodsCents=cents(valid(productPrice,'productPrice'))*qty;
 return {method,units:qty,cbm:Number(cbm.toFixed(6)),volumetricWeightKg:Number(volKg.toFixed(3)),goodsUSD:Number((goodsCents/100).toFixed(2)),shippingUSD:Number((freightCents/100).toFixed(2)),subtotalUSD:Number(((goodsCents+freightCents)/100).toFixed(2)),taxesNotIncluded:true,shippingSubjectToApproval:true};
}
return {calculate,volumeCbm};
});
