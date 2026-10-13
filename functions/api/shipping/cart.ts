interface Env { MINGEAGLE_DB:D1Database }
type Line={sku:string;quantity:number};
import {SKU_USD as prices} from '../../../lib/retail-reference';
import {oneItemUsAirParcel} from '../../../lib/us-small-parcel';
const cors={'access-control-allow-origin':'*','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'Content-Type','vary':'Origin','cache-control':'no-store'};
const result=(v:object,status=200)=>Response.json(v,{status,headers:cors});
export const onRequestOptions:PagesFunction<Env>=async()=>new Response(null,{status:204,headers:cors});
export const onRequestPost:PagesFunction<Env>=async({request,env})=>{
 let input:{lines?:Line[],country?:string,method?:string,seaFreightAccepted?:boolean};
 try{input=await request.json()}catch{return result({ok:false,error:'Invalid JSON'},400)}
 const lines=input.lines,country=String(input.country||'').toUpperCase(),method=input.method;
 if(!Array.isArray(lines)||!lines.length||lines.length>11||!/^[A-Z]{2}$/.test(country)||!['air','sea'].includes(String(method)))return result({ok:false,error:'Invalid basket or destination'},400);
 const keys=new Set<string>();let quantity=0,subtotalCents=0;
 for(const line of lines){if(!line||typeof line.sku!=='string'||!(line.sku in prices)||keys.has(line.sku)||!Number.isSafeInteger(line.quantity)||line.quantity<1||line.quantity>10000)return result({ok:false,error:'Invalid or duplicate basket line'},400);keys.add(line.sku);quantity+=line.quantity;subtotalCents+=Math.round(prices[line.sku]*100)*line.quantity}
 if(quantity>10000)return result({ok:false,error:'Too many items'},400);
 if(quantity>=10&&method!=='sea')return result({ok:false,error:'Wholesale orders of 10+ items require sea freight and a written quantity-based quote'},409);
 if(quantity<10&&method!=='air')return result({ok:false,error:'Retail orders of 1–9 items use air shipping'},409);
 if(quantity>=10&&!input.seaFreightAccepted)return result({ok:false,error:'Wholesale buyer must explicitly accept sea freight and estimated delivery of 25–30 days'},409);
 // Exactly one US retail unit uses the owner-confirmed small-parcel price.
 // A multi-item cart intentionally uses the existing tariff/packaging engine.
 const one=lines.length===1&&quantity===1?
  oneItemUsAirParcel(lines[0].sku,country,String(method),1):null;
 if(one)return result({ok:true,quantity:1,productsUSD:one.productUSD,lines:[{sku:one.sku,quantity:1,
  unitPriceUSD:one.productUSD,lineTotalUSD:one.productUSD}],
  ...one,volumeCBM:null,
  notice:'Single-item US air small parcel; 12–15 days estimated after dispatch, not guaranteed. Final terms and taxes require confirmation.'});
 if(!env.MINGEAGLE_DB)return result({ok:false,error:'Database unavailable'},503);
 try{
 const rate=await env.MINGEAGLE_DB.prepare('SELECT * FROM shipping_rates WHERE country=? AND method=? AND active=1').bind(country,method).first<Record<string,number>>();
 if(!rate)return result({ok:false,error:'Shipping is not configured for this destination'},404);
 let cbm=0;
 for(const line of lines){
  const pack=await env.MINGEAGLE_DB.prepare('SELECT * FROM shipping_packaging WHERE sku=?').bind(line.sku).first<Record<string,number>>();
  if(!pack)return result({ok:false,error:'Packaging not configured for '+line.sku},404);
  cbm+=Number(pack.length_cm)*Number(pack.width_cm)*Number(pack.height_cm)*Math.ceil(line.quantity/Number(pack.units_per_package))/1e6;
 }
 const raw=method==='air'?cbm*1e6/Number(rate.volume_divisor)*Number(rate.usd_per_unit):cbm*Number(rate.usd_per_unit);
 if(!Number.isFinite(raw)||raw<0)return result({ok:false,error:'Invalid shipping configuration'},503);
 const shippingCents=Math.round((Math.max(raw,Number(rate.min_charge_usd))+Number(rate.handling_usd))*100);
 if(quantity>=10)return result({ok:true,mode:'WHOLESALE_RFQ',country,method:'sea',quantity,
  seaFreightAccepted:true,estimatedTransitDaysMin:25,estimatedTransitDaysMax:30,
  shippingEstimateUSD:shippingCents/100,currency:'USD',
  pricePolicy:'Quantity-based discounts and freight must be confirmed by an individual wholesale quote; no payable total is provided.',
  paymentEnabled:false,estimateOnly:true});
 return result({ok:true,lines:lines.map(x=>({sku:x.sku,quantity:x.quantity,unitPriceUSD:prices[x.sku],lineTotalUSD:Number((prices[x.sku]*x.quantity).toFixed(2))})),quantity,country,method,volumeCBM:Number(cbm.toFixed(6)),productsUSD:subtotalCents/100,shippingUSD:shippingCents/100,totalBeforeTaxesUSD:(subtotalCents+shippingCents)/100,currency:'USD',paymentEnabled:false,taxesNotIncluded:true,estimateOnly:true,rateUpdatedAt:rate.updated_at});
 }catch(e){console.error('shipping_cart_failed',e);return result({ok:false,error:'Shipping estimate temporarily unavailable'},503)}
};