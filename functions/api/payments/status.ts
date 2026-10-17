import {airwallexCheckoutReadiness} from '../../_shared/airwallex';
import {stripeCheckoutReadiness,type StripeEnv} from '../../_shared/stripe';
interface Env extends StripeEnv {
 STRIPE_TAX_POLICY_APPROVED?:string;
 STRIPE_RETAIL_ONLY_ENABLED?:string;
 STRIPE_B2B_CHECKOUT_ENABLED?:string;
 STRIPE_B2B_TAX_POLICY_APPROVED?:string;
 STRIPE_B2B_APPROVED_US_STATES?:string;
 RETAIL_CHECKOUT_ENABLED?:string;
 RETAIL_STOCK_FULFILLMENT_APPROVED?:string;
 RETAIL_TAX_POLICY_APPROVED?:string;
  AIRWALLEX_CLIENT_ID?: string;
  AIRWALLEX_API_KEY?: string;
  AIRWALLEX_ENV?: string;
  AIRWALLEX_WEBHOOK_SECRET?: string;
  AIRWALLEX_CHECKOUT_ENABLED?: string;
  BANK_TRANSFER_ENABLED?: string;
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const readiness=airwallexCheckoutReadiness(env);
  const stripe=stripeCheckoutReadiness(env);
  const bankTransferEnabled = ['1','true','yes','on'].includes(String(env.BANK_TRANSFER_ENABLED || '').toLowerCase());
  // Configuration-only readiness: a list of allowed destinations is NOT a tax
  // registration or independent nexus opinion. Expose only reason codes, never
  // credentials, to help staff diagnose exactly why Live Checkout is disabled.
  const b2bActivationBlockers:string[]=[];
  if(stripe.mode!=='live')b2bActivationBlockers.push('LIVE_STRIPE_MODE_NOT_SET');
  if(!stripe.keyConfigured)b2bActivationBlockers.push('STRIPE_KEY_UNAVAILABLE_OR_MODE_MISMATCH');
  if(!stripe.webhookConfigured)b2bActivationBlockers.push('SIGNED_WEBHOOK_NOT_CONFIGURED');
  if(!stripe.checkoutRequested)b2bActivationBlockers.push('GLOBAL_CHECKOUT_NOT_ENABLED');
  if(env.STRIPE_TAX_POLICY_APPROVED!=='true')b2bActivationBlockers.push('GLOBAL_TAX_POLICY_NOT_APPROVED');
  if(env.STRIPE_RETAIL_ONLY_ENABLED==='true')b2bActivationBlockers.push('RETAIL_ONLY_RESTRICTION');
  if(env.STRIPE_B2B_CHECKOUT_ENABLED!=='true')b2bActivationBlockers.push('B2B_CHECKOUT_NOT_ENABLED');
  if(env.STRIPE_B2B_TAX_POLICY_APPROVED!=='true')b2bActivationBlockers.push('B2B_TAX_POLICY_NOT_APPROVED');
  if(!String(env.STRIPE_B2B_APPROVED_US_STATES||'').trim())b2bActivationBlockers.push('NO_B2B_DESTINATION_STATES_CONFIGURED');


  return Response.json({
    ok: true,
    airwallex: {
      configured: readiness.providerCredentialsConfigured,
      environment: readiness.environment,
      webhookConfigured: readiness.webhookConfigured,
      checkoutRequested: readiness.checkoutRequested,
      checkoutReady: readiness.checkoutReady,
    },
    stripe: {
      checkoutReady: stripe.checkoutReady && env.STRIPE_TAX_POLICY_APPROVED==='true',
      mode:stripe.mode,
      keyMode:stripe.keyMode,
      keyConfigured:stripe.keyConfigured,
      webhookConfigured:stripe.webhookConfigured,
      checkoutRequested:stripe.checkoutRequested,
      taxPolicyApproved:env.STRIPE_TAX_POLICY_APPROVED==='true',
      retailOnlyRestriction:env.STRIPE_RETAIL_ONLY_ENABLED==='true',
      // Retail and wholesale approval must not be inferred from the same global Stripe flag.
      retailConfigurationReady:stripe.checkoutReady&&env.STRIPE_TAX_POLICY_APPROVED==='true'
        &&env.RETAIL_CHECKOUT_ENABLED==='true'&&env.RETAIL_STOCK_FULFILLMENT_APPROVED==='true'
        &&env.RETAIL_TAX_POLICY_APPROVED==='true',
      b2bActivationBlockers,
      b2bLiveConfigurationReady:b2bActivationBlockers.length===0,
      b2bTaxScopeWarning:'A configured state list and policy toggle do not establish nexus, sales tax registration or exemption. Independently verify each order and destination.',
      b2bCheckoutRequested:env.STRIPE_B2B_CHECKOUT_ENABLED==='true',
      b2bTaxReviewConfigured:env.STRIPE_B2B_TAX_POLICY_APPROVED==='true',
      b2bConfigurationReady:stripe.checkoutReady&&env.STRIPE_TAX_POLICY_APPROVED==='true'
        &&env.STRIPE_RETAIL_ONLY_ENABLED!=='true'&&env.STRIPE_B2B_CHECKOUT_ENABLED==='true'
        &&env.STRIPE_B2B_TAX_POLICY_APPROVED==='true'
        &&Boolean(String(env.STRIPE_B2B_APPROVED_US_STATES||'').trim()),
    },
    bankTransfer: {
      enabled: bankTransferEnabled,
    },
    note: stripe.checkoutReady && env.STRIPE_TAX_POLICY_APPROVED==='true'
      ? 'Stripe configuration prerequisites exist; order-specific fulfillment, state sales tax and checkout activation still require verification.'
      : 'Stripe online checkout is not ready; approved tax policy, activation, credentials and signed webhook are required.',
  }, {
    headers: {
      'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
    },
  });
};
