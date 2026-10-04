interface Env {
  GMAIL_CLIENT_ID?: string;
  GMAIL_CLIENT_SECRET?: string;
  GMAIL_REFRESH_TOKEN?: string;
  GMAIL_FROM?: string;
}

function base64Url(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function cleanHeader(value: unknown, max = 300) {
  return typeof value === 'string' ? value.replace(/[\r\n]+/g, ' ').trim().slice(0, max) : '';
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const clientId = env.GMAIL_CLIENT_ID || '';
  const clientSecret = env.GMAIL_CLIENT_SECRET || '';
  const refreshToken = env.GMAIL_REFRESH_TOKEN || '';
  const from = cleanHeader(env.GMAIL_FROM || '');
  if (!clientId || !clientSecret || !refreshToken) {
    return Response.json({ ok: false, error: 'Gmail OAuth secrets are not fully configured.' }, { status: 503 });
  }

  try {
    const input = await request.json() as { to?: string; subject?: string; body?: string };
    const to = cleanHeader(input.to, 320);
    const subject = cleanHeader(input.subject || 'MING EAGLE Gmail API test', 500);
    const body = typeof input.body === 'string' ? input.body.slice(0, 20000) : 'This is a test email sent by the MING EAGLE Growth Engine through the Gmail API.';
    if (!to || !to.includes('@')) return Response.json({ ok: false, error: 'A valid recipient email is required.' }, { status: 400 });

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    const token = await tokenResponse.json() as { access_token?: string; error?: string; error_description?: string };
    if (!tokenResponse.ok || !token.access_token) {
      return Response.json({ ok: false, error: token.error_description || token.error || 'Unable to refresh Gmail access token.' }, { status: 502 });
    }

    const headers = [
      from ? `From: MING EAGLE <${from}>` : '',
      `To: ${to}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      '',
      body,
    ].filter((line, index) => line || index > 0);
    const raw = base64Url(headers.join('\r\n'));

    const sendResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token.access_token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ raw }),
    });
    const sent = await sendResponse.json() as { id?: string; threadId?: string; error?: { message?: string } };
    if (!sendResponse.ok || !sent.id) {
      return Response.json({ ok: false, error: sent.error?.message || 'Gmail API send failed.' }, { status: 502 });
    }

    return Response.json({ ok: true, messageId: sent.id, threadId: sent.threadId || null, from: from || 'Gmail primary address', to });
  } catch (error) {
    console.error('gmail_test_send_failed', error);
    return Response.json({ ok: false, error: 'Unable to send Gmail test message.' }, { status: 500 });
  }
};
