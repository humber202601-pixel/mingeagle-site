export type AirwallexEnv = {
  AIRWALLEX_CLIENT_ID?: string;
  AIRWALLEX_API_KEY?: string;
  AIRWALLEX_ENV?: string;
};

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

export function airwallexSdkEnv(env: AirwallexEnv): 'demo' | 'prod' {
  const mode = String(env.AIRWALLEX_ENV || 'prod').toLowerCase();
  return mode === 'sandbox' || mode === 'demo' ? 'demo' : 'prod';
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
