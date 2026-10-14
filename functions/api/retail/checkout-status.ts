import {stripeCheckoutReadiness,type StripeEnv} from '../../_shared/stripe';
import {reviewedZeroTaxStates,type RetailTaxEnv} from '../../../lib/retail-tax-policy';
import {turnstileConfiguration,type TurnstileEnv} from '../../../lib/turnstile-inquiry';
interface Env extends StripeEnv,TurnstileEnv,RetailTaxEnv {
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
  &&reviewedZeroTaxStates(env).size>0
  &&turnstileConfiguration(env).enabled;
}
export const onRequestGet:PagesFunction<Env>=async({env})=>{
 const ready=retailCheckoutReady(env);
 const supportedStates=[...reviewedZeroTaxStates(env)].sort();
 return Response.json({ok:true,retailCheckoutReady:ready,maxRetailUnits:9,minWholesaleUnits:10,
  supportedStates,eligibleSkus:['P1-S3','P1-S7'],maxDirectCheckoutUnits:1,
  country:'US',method:'air',
  notice:ready?'Card checkout supports one P1-S3 or P1-S7 set in '+supportedStates.join(', ')+'. Other orders can request a confirmed quote.':
   'Direct retail payment is not yet activated. Submit an order inquiry instead.'},
  {headers:{'cache-control':'no-store','access-control-allow-origin':'*'}});
};
