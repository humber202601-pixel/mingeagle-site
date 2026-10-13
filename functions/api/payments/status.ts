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
    note: readiness.checkoutReady
      ? 'Checkout configuration prerequisites exist; merchant activation and sandbox webhook tests are still required.'
      : 'Online checkout is not ready; activation, credentials, signed webhook and explicit environment are required.',
  }, {
    headers: {
      'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
    },
  });
};
