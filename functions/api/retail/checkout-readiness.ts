import {airwallexCheckoutReadiness, type AirwallexEnv} from '../../_shared/airwallex';
type Env=AirwallexEnv&{
 RETAIL_DIRECT_CHECKOUT_ENABLED?:string;
 RETAIL_FULFILLMENT_APPROVED?:string;
 RETAIL_TAX_COMPLIANCE_APPROVED?:string;
};
const origins=new Set(['https://www.mingeagle.com','https://mingeagle.com','https://app.mingeagle.com']);
export const onRequestGet:PagesFunction<Env>=async({request,env})=>{
 const origin=request.headers.get('origin');
 const headers:Record<string,string>={'cache-control':'private, no-store','vary':'Origin'};
 if(origin&&origins.has(origin))headers['access-control-allow-origin']=origin;
 const provider=airwallexCheckoutReadiness(env);
 const retailCheckoutReady=provider.checkoutReady&&
  env.RETAIL_DIRECT_CHECKOUT_ENABLED==='true'&&
  env.RETAIL_FULFILLMENT_APPROVED==='true'&&
  env.RETAIL_TAX_COMPLIANCE_APPROVED==='true';
 return Response.json({ok:true,retailCheckoutReady,
  retailMinimum:1,retailMaximum:9,wholesaleMinimum:10,
  wholesaleMethod:'sea',wholesaleEstimatedDeliveryDays:{min:25,max:30},
  paymentStatus:retailCheckoutReady?'ACTIVE':'AWAITING_VERIFIED_MERCHANT_SETUP',
  note:retailCheckoutReady?'Secure checkout is ready for eligible destinations and verified inventory':
   'Online payment has not been activated. Do not enter card details or assume an order is paid.'},
  {headers});
};
