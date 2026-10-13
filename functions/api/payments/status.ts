import {airwallexCheckoutReadiness} from '../../_shared/airwallex';
import {stripeCheckoutReadiness,type StripeEnv} from '../../_shared/stripe';
interface Env extends StripeEnv {
 STRIPE_TAX_POLICY_APPROVED?:string;
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
      keyConfigured:stripe.keyConfigured,
      webhookConfigured:stripe.webhookConfigured,
      checkoutRequested:stripe.checkoutRequested,
      taxPolicyApproved:env.STRIPE_TAX_POLICY_APPROVED==='true',
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
