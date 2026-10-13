export interface StripeEnv {
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_CHECKOUT_ENABLED?: string;
  STRIPE_MODE?: string;
}

// No client-visible key, live API call, or CRM mutation is allowed unless
// merchant-controlled activation and a signed webhook are configured.
export function stripeCheckoutReadiness(env: StripeEnv) {
  const mode = String(env.STRIPE_MODE || '').trim().toLowerCase();
  const key = String(env.STRIPE_SECRET_KEY || '').trim();
  const signature = String(env.STRIPE_WEBHOOK_SECRET || '').trim();
  const keyValid = mode === 'test' ? key.startsWith('sk_test_') : mode === 'live' ? key.startsWith('sk_live_') : false;
  const webhookConfigured = signature.startsWith('whsec_') && signature.length > 12;
  const checkoutRequested = env.STRIPE_CHECKOUT_ENABLED === 'true';
  return {
    mode: mode === 'test' || mode === 'live' ? mode : null,
    keyConfigured: keyValid,
    webhookConfigured,
    checkoutRequested,
    checkoutReady: checkoutRequested && keyValid && webhookConfigured,
  };
}

export async function stripeApi(env: StripeEnv, path: string, init?: RequestInit) {
  const key = String(env.STRIPE_SECRET_KEY || '').trim();
  if (!stripeCheckoutReadiness(env).checkoutReady) throw Error('Stripe payment is not enabled.');
  const headers = new Headers(init?.headers);
  headers.set('authorization', 'Bearer ' + key);
  // Never log auth headers, request payloads, customer PII, or returned sessions.
  const response = await fetch('https://api.stripe.com/v1/' + path.replace(/^\/+/, ''), {
    ...init, headers, redirect:'error'
  });
  return response;
}
