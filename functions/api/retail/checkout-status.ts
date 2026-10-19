import {stripeCheckoutReadiness,type StripeEnv} from '../../_shared/stripe';
import {reviewedRetailTaxStates,remoteStartupState,remoteStartupFactsCurrent,remoteStartupWithinLimits,type RetailTaxEnv} from '../../../lib/retail-tax-policy';
import {turnstileConfiguration,type TurnstileEnv} from '../../../lib/turnstile-inquiry';
import {US_DELIVERY_STATES} from '../../../lib/us-delivery-states';
import {MAX_US_PARCEL_CHECKOUT_UNITS,US_DDP_CHECKOUT_SKUS} from '../../../lib/us-small-parcel';
interface Env extends StripeEnv,TurnstileEnv,RetailTaxEnv {
 MINGEAGLE_DB?:D1Database;
 STRIPE_TAX_POLICY_APPROVED?:string;
 RETAIL_CHECKOUT_ENABLED?:string;
 RETAIL_STOCK_FULFILLMENT_APPROVED?:string;
 RETAIL_TAX_POLICY_APPROVED?:string;
}
export function retailCheckoutReady(env:Env){
 return (stripeCheckoutReadiness(env).checkoutReady && env.STRIPE_TAX_POLICY_APPROVED==='true')
  &&env.RETAIL_CHECKOUT_ENABLED==='true'
  &&env.RETAIL_STOCK_FULFILLMENT_APPROVED==='true'
  &&env.RETAIL_TAX_POLICY_APPROVED==='true'
  &&reviewedRetailTaxStates(env).size>0
  &&turnstileConfiguration(env).enabled;
}
export const onRequestGet:PagesFunction<Env>=async({env})=>{
 let supportedStates=[...reviewedRetailTaxStates(env)].sort();
 if(remoteStartupFactsCurrent(env)&&(!env.MINGEAGLE_DB||!await remoteStartupWithinLimits(env.MINGEAGLE_DB,2140,1)))
  supportedStates=supportedStates.filter(state=>!remoteStartupState(env,state));
 const ready=retailCheckoutReady(env)&&supportedStates.length>0;
 return Response.json({ok:true,retailCheckoutReady:ready,maxRetailUnits:9,minWholesaleUnits:10,
  supportedStates,deliveryStates:Object.keys(US_DELIVERY_STATES),eligibleSkus:US_DDP_CHECKOUT_SKUS,maxDirectCheckoutUnits:MAX_US_PARCEL_CHECKOUT_UNITS,
  shippingPlan:'ONE_UNIT_PER_PARCEL',
  country:'US',method:'air',
  notice:ready?(env.RETAIL_NATIONWIDE_STRIPE_TAX_ENABLED==='true'?
   'Secure card checkout is available across the US for 1–9 eligible P1-S3 or P1-S7 sets, including mixed sizes and colors. Each set ships as a separate parcel; shipping charges are added per set. Final sales tax is shown before payment.':
   'Card checkout supports 1–9 P1-S3 or P1-S7 sets in '+supportedStates.join(', ')+', shipped as separate one-unit parcels. Other orders can request a confirmed quote.'):
   'Direct retail payment is not yet activated. Submit an order inquiry instead.'},
  {headers:{'cache-control':'no-store','access-control-allow-origin':'*'}});
};
