import {stripeApi,type StripeEnv} from './stripe';

export type DeliveryAddress={name?:string;email?:string;phone?:string;street1?:string;street2?:string;
 city?:string;state?:string;postalCode?:string;country?:string};
export async function registeredStripeTaxState(env:StripeEnv,state:string){
 const response=await stripeApi(env,'tax/registrations?status=active&limit=100');
 if(!response.ok)return false;
 const body=await response.json() as {data?:{country?:string;status?:string;livemode?:boolean;
  country_options?:{us?:{state?:string;type?:string}}}[]};
 return Array.isArray(body.data)&&body.data.some(r=>r.country==='US'&&r.status==='active'&&
  r.livemode===(env.STRIPE_MODE==='live')&&r.country_options?.us?.state===state&&
  r.country_options.us.type==='state_sales_tax');
}
export async function fixedTaxCustomer(env:StripeEnv,orderId:string,address:DeliveryAddress){
 if(address.country!=='US'||!address.name||!address.street1||!address.city||
  !/^[A-Z]{2}$/.test(address.state||'')||!/^\d{5}(?:-\d{4})?$/.test(address.postalCode||''))
  throw Error('Complete delivery address required for tax.');
 const form=new URLSearchParams();
 form.set('name',address.name);form.set('shipping[name]',address.name);
 form.set('metadata[order_id]',orderId);form.set('tax_exempt','none');
 if(address.email)form.set('email',address.email);
 const fields={line1:address.street1,line2:address.street2||'',city:address.city,
  state:address.state!,postal_code:address.postalCode!,country:'US'};
 for(const [key,value] of Object.entries(fields)){
  form.set('address['+key+']',value);form.set('shipping[address]['+key+']',value);
 }
 const response=await stripeApi(env,'customers',{method:'POST',headers:{
  'content-type':'application/x-www-form-urlencoded','idempotency-key':'mingeagle-tax-customer-'+orderId
 },body:form.toString()});
 if(!response.ok)throw Error('Tax customer could not be prepared.');
 const customer=await response.json() as {id?:string;livemode?:boolean};
 if(!/^cus_[A-Za-z0-9]+$/.test(customer.id||'')||customer.livemode!==(env.STRIPE_MODE==='live'))
  throw Error('Tax customer mode mismatch.');
 return customer.id!;
}
export function automaticTaxAmount(session:{automatic_tax?:{enabled?:boolean;status?:string};
 amount_total?:number;currency?:string;total_details?:{amount_tax?:number;amount_discount?:number;amount_shipping?:number}},base:number){
 const tax=session.total_details?.amount_tax;
 if(session.automatic_tax?.enabled!==true||session.automatic_tax.status!=='complete'||
  session.currency!=='usd'||!Number.isSafeInteger(tax)||Number(tax)<0||Number(tax)>base||
  !Number.isSafeInteger(session.amount_total)||session.amount_total!==base+Number(tax)||
  Number(session.total_details?.amount_discount||0)!==0||Number(session.total_details?.amount_shipping||0)!==0)
  return null;
 return tax!;
}
