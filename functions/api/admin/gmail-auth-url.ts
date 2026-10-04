interface Env {
  ADMIN_ACCESS_KEY?: string;
  GMAIL_CLIENT_ID?: string;
}

const REDIRECT_URI = 'https://mingeagle-site.pages.dev/api/gmail/oauth-callback';

function base64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function signState(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return base64Url(new Uint8Array(signature));
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const clientId = env.GMAIL_CLIENT_ID || '';
  const stateSecret = env.ADMIN_ACCESS_KEY || '';
  if (!clientId) return Response.json({ ok: false, error: 'GMAIL_CLIENT_ID is not configured.' }, { status: 503 });
  if (!stateSecret) return Response.json({ ok: false, error: 'ADMIN_ACCESS_KEY is not configured.' }, { status: 503 });

  const payload = base64Url(new TextEncoder().encode(JSON.stringify({
    ts: Date.now(),
    nonce: crypto.randomUUID(),
  })));
  const signature = await signState(stateSecret, payload);
  const state = `${payload}.${signature}`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/gmail.send',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });

  return Response.json({
    ok: true,
    authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    redirectUri: REDIRECT_URI,
    scope: 'https://www.googleapis.com/auth/gmail.send',
  });
};
