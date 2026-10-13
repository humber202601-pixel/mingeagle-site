import {retailCheckoutReady} from '../../_shared/retail-checkout';
import type {AirwallexEnv} from '../../_shared/airwallex';
interface Env extends AirwallexEnv {RETAIL_DIRECT_CHECKOUT_ENABLED?:string;RETAIL_FULFILLMENT_APPROVED?:string;RETAIL_TAX_COMPLIANCE_APPROVED?:string;RETAIL_US_TAX_RULES_JSON?:string;TURNSTILE_SECRET_KEY?:string;MINGEAGLE_DB:D1Database;}
const origins=new Set(['https://www.mingeagle.com','https://mingeagle.com','https://app.mingeagle.com']);
export const onRequestGet:PagesFunction<Env>=async({request,env})=>{
 const origin=request.headers.get('origin');
 const headers:Record<string,string>={'cache-control':'private, no-store','vary':'Origin'};
 if(origin&&origins.has(origin))headers['access-control-allow-origin']=origin;
 const retailCheckoutReadyValue=retailCheckoutReady(env);

 return Response.json({ok:true,retailCheckoutReady:retailCheckoutReadyValue,
  retailMinimum:1,retailMaximum:9,wholesaleMinimum:10,
  wholesaleMethod:'sea',wholesaleEstimatedDeliveryDays:{min:25,max:30},
  paymentStatus:retailCheckoutReadyValue?'ACTIVE':'AWAITING_VERIFIED_MERCHANT_SETUP',
  note:retailCheckoutReadyValue?'Secure checkout is ready for eligible destinations and verified inventory':
   'Online payment has not been activated. Do not enter card details or assume an order is paid.'},
  {headers});
};
