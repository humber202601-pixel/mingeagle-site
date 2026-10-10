interface Env {MINGEAGLE_DB:D1Database}
const error=(message:string,status=400)=>Response.json({ok:false,error:message},{status,headers:{'cache-control':'no-store'}});
const prices:Record<string,number>={'P1-S3':9.9,'P1-S5':11.9,'P1-S7':14.9,'P2-S3':10.9,'P2-S5':12.9,'P2-S7':15.9,'P3-S3':12.9,'P3-S4':14.9,'P3-S6':18.9,'P3-S7':21.9,'P4-S5':17.9};
export const onRequestGet:PagesFunction<Env>=async({request,env})=>{
 const url=new URL(request.url),sku=(url.searchParams.get('sku')||'').toUpperCase(),country=(url.searchParams.get('country')||'').toUpperCase(),method=url.searchParams.get('method'),qty=Number(url.searchParams.get('quantity'));
 if(!(sku in prices)||!/^[A-Z]{2}$/.test(country)||!['air','sea'].includes(method||'')||!Number.isSafeInteger(qty)||qty<1||qty>10000)return error('Invalid product, destination, method or quantity');
 if(method==='sea'&&qty<10)return error('Sea shipping requires a minimum of 10 balls');
 if(!env.MINGEAGLE_DB)return error('Shipping quotes unavailable',503);
 try{
 const rate=await env.MINGEAGLE_DB.prepare('SELECT * FROM shipping_rates WHERE country=? AND method=? AND active=1').bind(country,method).first<Record<string,number>>();
 const pack=await env.MINGEAGLE_DB.prepare('SELECT * FROM shipping_packaging WHERE sku=?').bind(sku).first<Record<string,number>>();
 if(!rate||!pack)return error('Shipping rate or packaging not configured for this destination and size',404);
 const cbm=Number(pack.length_cm)*Number(pack.width_cm)*Number(pack.height_cm)*Math.ceil(qty/Number(pack.units_per_package))/1000000;
 const charge=method==='air'?cbm*1000000/Number(rate.volume_divisor)*Number(rate.usd_per_unit):cbm*Number(rate.usd_per_unit);
 const freight=Math.round((Math.max(charge,Number(rate.min_charge_usd))+Number(rate.handling_usd))*100)/100;
 const products=Math.round(prices[sku]*qty*100)/100;
 return Response.json({ok:true,sku,country,method,quantity:qty,productUSD:products,shippingUSD:freight,totalBeforeTaxesUSD:Math.round((products+freight)*100)/100,cbm:Number(cbm.toFixed(6)),currency:'USD',paymentEnabled:false,taxesNotIncluded:true,notice:'Shipping estimate only. Dispatch from China. Stock, packaging, delivery time, applicable duties and final payable amount require confirmation before payment.',rateUpdatedAt:rate.updated_at},{headers:{'cache-control':'no-store','access-control-allow-origin':'*','vary':'Origin'}});
 }catch{return error('Shipping rates are unavailable or migration pending',503)}
};
