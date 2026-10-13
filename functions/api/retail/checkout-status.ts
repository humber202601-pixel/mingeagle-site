import {airwallexCheckoutReadiness,type AirwallexEnv} from '../../_shared/airwallex';
import {stripeCheckoutReadiness,type StripeEnv} from '../../_shared/stripe';
import {turnstileConfiguration,type TurnstileEnv} from '../../../lib/turnstile-inquiry';
interface Env extends AirwallexEnv,StripeEnv,TurnstileEnv {
 STRIPE_TAX_POLICY_APPROVED?:string;
 RETAIL_CHECKOUT_ENABLED?:string;
 RETAIL_STOCK_FULFILLMENT_APPROVED?:string;
 RETAIL_TAX_POLICY_APPROVED?:string;
}
export function retailCheckoutReady(env:Env){
 return (airwallexCheckoutReadiness(env).checkoutReady ||
   (stripeCheckoutReadiness(env).checkoutReady && env.STRIPE_TAX_POLICY_APPROVED==='true'))
  &&env.RETAIL_CHECKOUT_ENABLED==='true'
  &&env.RETAIL_STOCK_FULFILLMENT_APPROVED==='true'
  &&env.RETAIL_TAX_POLICY_APPROVED==='true'
  &&turnstileConfiguration(env).enabled;
}
export const onRequestGet:PagesFunction<Env>=async({env})=>{
 const ready=retailCheckoutReady(env);
 return Response.json({ok:true,retailCheckoutReady:ready,maxRetailUnits:9,minWholesaleUnits:10,
  country:'US',method:'air',
  notice:ready?'Retail checkout is available subject to checkout validation':
   'Direct retail payment is not yet activated. Submit an order inquiry instead.'},
  {headers:{'cache-control':'no-store','access-control-allow-origin':'*'}});
};
