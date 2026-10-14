export interface StripeEnv {
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_CHECKOUT_ENABLED?: string;
  STRIPE_MODE?: string;
}

export const STRIPE_API_VERSION='2026-09-30.endive';

// No client-visible key, live API call, or CRM mutation is allowed unless
// merchant-controlled activation and a signed webhook are configured.
export function stripeCheckoutReadiness(env: StripeEnv) {
  const mode = String(env.STRIPE_MODE || '').trim().toLowerCase();
  const key = String(env.STRIPE_SECRET_KEY || '').trim();
  const signature = String(env.STRIPE_WEBHOOK_SECRET || '').trim();
  const keyValid = mode === 'test'
    ? (key.startsWith('sk_test_') || key.startsWith('rk_test_')) && key.length > 10
    : mode === 'live'
      ? (key.startsWith('sk_live_') || key.startsWith('rk_live_')) && key.length > 10
      : false;
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

// Stripe Checkout IDs are mode-qualified. A Checkout Session from another mode
// must never be linked to this environment's D1 order or payment records.
export function stripeSessionMatchesMode(sessionId:unknown, mode:unknown):boolean {
 const id=typeof sessionId==='string'?sessionId:'';
 return mode==='test'?/^cs_test_[A-Za-z0-9]+$/.test(id):
  mode==='live'?/^cs_live_[A-Za-z0-9]+$/.test(id):false;
}

export async function stripeApi(env: StripeEnv, path: string, init?: RequestInit) {
  const key = String(env.STRIPE_SECRET_KEY || '').trim();
  if (!stripeCheckoutReadiness(env).checkoutReady) throw Error('Stripe payment is not enabled.');
  const headers = new Headers(init?.headers);
  headers.set('authorization', 'Bearer ' + key);
  headers.set('stripe-version',STRIPE_API_VERSION);
  // Never log auth headers, request payloads, customer PII, or returned sessions.
  const response = await fetch('https://api.stripe.com/v1/' + path.replace(/^\/+/, ''), {
    ...init, headers, redirect:'manual'
  });
  // Workers supports manual/follow redirect modes. Reject 3xx here so a
  // provider redirect never forwards the authorization header elsewhere.
  if(response.status>=300&&response.status<400)throw Error('Stripe API redirects are not allowed.');
  return response;
}
