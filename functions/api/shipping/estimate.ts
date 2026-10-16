interface Env {MINGEAGLE_DB:D1Database}
const error=(message:string,status=400)=>Response.json({ok:false,error:message},{status,headers:{'cache-control':'no-store'}});
import {SKU_USD as prices} from '../../../lib/retail-reference';
import {oneItemUsAirParcel} from '../../../lib/us-small-parcel';
export const onRequestGet:PagesFunction<Env>=async({request,env})=>{
 const url=new URL(request.url),sku=(url.searchParams.get('sku')||'').toUpperCase(),country=(url.searchParams.get('country')||'').toUpperCase(),method=url.searchParams.get('method'),qty=Number(url.searchParams.get('quantity'));
 if(!(sku in prices)||!/^[A-Z]{2}$/.test(country)||!['air','sea'].includes(method||'')||!Number.isSafeInteger(qty)||qty<1||qty>10000)return error('Invalid product, destination, method or quantity');
 if(qty>=10&&method!=='sea')return error('10 or more items require a sea freight wholesale quotation, estimated 25–30 days after dispatch.',409);
 if(qty<10&&method!=='air')return error('Orders of 1–9 items require air parcel shipping.',409);
 const us=oneItemUsAirParcel(sku,country,String(method),qty);
 if(us)return Response.json({ok:true,...us,
  notice:'USA one-item air small-parcel estimate; approximately 12–15 days after dispatch, not guaranteed. Taxes, duties, stock and final amount require confirmation before payment.'},
  {headers:{'cache-control':'no-store','access-control-allow-origin':'*','vary':'Origin'}});
 if(method==='sea')return Response.json({
  ok:true,sku,country,method,quantity:qty,wholesale:true,quoteRequired:true,
  quoteStatus:'FREIGHT_PRODUCT_AND_CARTONS_UNVERIFIED',
  cbm:null,packagingVerified:false,packagingEstimateOnly:false,
  productUSD:null,shippingUSD:null,totalBeforeTaxesUSD:null,paymentEnabled:false,
  ddpConfirmed:false,currency:'USD',deliveryEstimateDaysMin:25,deliveryEstimateDaysMax:30,
  discountPolicy:'QUANTITY_DEPENDENT_QUOTE_NO_FIXED_PERCENT',
  notice:'Wholesale RFQ only, not a payable shipping estimate. Supplier carton sizes and count per carton are unverified, so CBM, volume and ocean DDP prices cannot be confirmed. Confirm carton list, buyer destination ZIP, supplier MOQ and price, forwarder clearance/duties/last-mile offer and US sales tax.'
 },{headers:{'cache-control':'no-store','access-control-allow-origin':'*','vary':'Origin'}});
 if(!env.MINGEAGLE_DB)return error('Shipping quotes unavailable',503);
 try{
 const rate=await env.MINGEAGLE_DB.prepare('SELECT * FROM shipping_rates WHERE country=? AND method=? AND active=1').bind(country,method).first<Record<string,number>>();
 const pack=await env.MINGEAGLE_DB.prepare('SELECT * FROM shipping_packaging WHERE sku=?').bind(sku).first<Record<string,number>>();
 if(!rate||!pack)return error('Shipping rate or packaging not configured for this destination and size',404);
 const cbm=Number(pack.length_cm)*Number(pack.width_cm)*Number(pack.height_cm)*Math.ceil(qty/Number(pack.units_per_package))/1000000;
 const charge=cbm*1000000/Number(rate.volume_divisor)*Number(rate.usd_per_unit);
 const freight=Math.round((Math.max(charge,Number(rate.min_charge_usd))+Number(rate.handling_usd))*100)/100;
 const products=Math.round(prices[sku]*qty*100)/100;
 return Response.json({ok:true,sku,country,method,quantity:qty,productUSD:products,shippingUSD:freight,totalBeforeTaxesUSD:Math.round((products+freight)*100)/100,cbm:Number(cbm.toFixed(6)),currency:'USD',paymentEnabled:false,taxesNotIncluded:true,wholesale:qty>=10,deliveryEstimateDaysMin:qty>=10?25:undefined,deliveryEstimateDaysMax:qty>=10?30:undefined,discountPolicy:qty>=10?'QUANTITY_DEPENDENT_QUOTE_NO_FIXED_PERCENT':undefined,notice:'Shipping estimate only. Dispatch from China. Stock, packaging, delivery time, applicable duties and final payable amount require confirmation before payment.',rateUpdatedAt:rate.updated_at},{headers:{'cache-control':'no-store','access-control-allow-origin':'*','vary':'Origin'}});
 }catch{return error('Shipping rates are unavailable or migration pending',503)}
};
