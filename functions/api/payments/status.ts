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
