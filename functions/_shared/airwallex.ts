export type AirwallexEnv = {
  AIRWALLEX_CLIENT_ID?: string;
  AIRWALLEX_API_KEY?: string;
  AIRWALLEX_ENV?: string;
  AIRWALLEX_CHECKOUT_ENABLED?: string;
  AIRWALLEX_WEBHOOK_SECRET?: string;
};

// Single fail-closed activation rule across all customer and admin surfaces.
// Provider API credentials alone do not ensure a paid order can be reconciled.
export function airwallexCheckoutReadiness(env:AirwallexEnv){
 const mode=String(env.AIRWALLEX_ENV||'').trim().toLowerCase();
 const environment=mode==='sandbox'||mode==='prod'?mode:null;
 const checkoutRequested=env.AIRWALLEX_CHECKOUT_ENABLED==='true';
 const providerCredentialsConfigured=Boolean(env.AIRWALLEX_CLIENT_ID?.trim()&&env.AIRWALLEX_API_KEY?.trim());
 const webhookConfigured=Boolean(env.AIRWALLEX_WEBHOOK_SECRET?.trim());
 return {checkoutRequested,environment,providerCredentialsConfigured,webhookConfigured,
  checkoutReady:checkoutRequested&&Boolean(environment)&&providerCredentialsConfigured&&webhookConfigured};
}

type CachedToken = {
  cacheKey: string;
  token: string;
  expiresAt: number;
};

let cachedToken: CachedToken | null = null;

export function airwallexApiBase(env: AirwallexEnv) {
  const mode = String(env.AIRWALLEX_ENV || 'prod').toLowerCase();
  return mode === 'sandbox' || mode === 'demo'
    ? 'https://api.sandbox.airwallex.com'
    : 'https://api.airwallex.com';
}

export function airwallexSdkEnv(env: AirwallexEnv): 'sandbox' | 'prod' {
  const mode = String(env.AIRWALLEX_ENV || 'prod').toLowerCase();
  return mode === 'sandbox' || mode === 'demo' ? 'sandbox' : 'prod';
}

export function isAirwallexConfigured(env: AirwallexEnv) {
  return Boolean(env.AIRWALLEX_CLIENT_ID && env.AIRWALLEX_API_KEY);
}

export async function getAirwallexAccessToken(env: AirwallexEnv) {
  const clientId = String(env.AIRWALLEX_CLIENT_ID || '').trim();
  const apiKey = String(env.AIRWALLEX_API_KEY || '').trim();
  if (!clientId || !apiKey) throw new Error('Airwallex is not configured.');

  const base = airwallexApiBase(env);
  const cacheKey = `${base}|${clientId}`;
  const now = Date.now();
  if (cachedToken && cachedToken.cacheKey === cacheKey && cachedToken.expiresAt > now + 60_000) {
    return cachedToken.token;
  }

  const response = await fetch(`${base}/api/v1/authentication/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-client-id': clientId,
      'x-api-key': apiKey,
    },
  });
  const body = await response.json().catch(() => ({})) as { token?: string; expires_at?: string; message?: string; error?: string };
  if (!response.ok || !body.token) {
    throw new Error(body.message || body.error || `Airwallex authentication failed (${response.status}).`);
  }

  const expiresAt = Date.parse(String(body.expires_at || ''));
  cachedToken = {
    cacheKey,
    token: body.token,
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : now + 25 * 60_000,
  };
  return body.token;
}
