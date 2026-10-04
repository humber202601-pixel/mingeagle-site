interface Env {
  ADMIN_ACCESS_KEY?: string;
  GMAIL_CLIENT_ID?: string;
  GMAIL_CLIENT_SECRET?: string;
}

const REDIRECT_URI = 'https://mingeagle-site.pages.dev/api/gmail/oauth-callback';

function base64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(base64);
  return new Uint8Array([...binary].map(char => char.charCodeAt(0)));
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

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char] || char));
}

function page(title: string, body: string, ok = true) {
  return new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{font-family:Arial,sans-serif;background:#f5f6f8;color:#172033;margin:0;padding:32px}.card{max-width:760px;margin:40px auto;background:white;border-radius:18px;padding:28px;box-shadow:0 12px 38px rgba(0,0,0,.08)}h1{margin-top:0}.ok{color:#067647}.bad{color:#b42318}textarea{width:100%;min-height:130px;padding:12px;border:1px solid #d0d5dd;border-radius:10px;font-family:monospace}.note{background:#fff7ed;border:1px solid #fed7aa;padding:12px 14px;border-radius:10px;line-height:1.6}code{background:#f2f4f7;padding:2px 6px;border-radius:5px}</style></head><body><div class="card"><h1 class="${ok ? 'ok' : 'bad'}">${escapeHtml(title)}</h1>${body}</div></body></html>`, { headers: { 'content-type': 'text/html; charset=UTF-8', 'cache-control': 'no-store' }, status: ok ? 200 : 400 });
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const error = url.searchParams.get('error');
  if (error) return page('Gmail 授权未完成', `<p>Google 返回：<code>${escapeHtml(error)}</code></p>`, false);

  const code = url.searchParams.get('code') || '';
  const state = url.searchParams.get('state') || '';
  const [payload, signature] = state.split('.');
  const stateSecret = env.ADMIN_ACCESS_KEY || '';
  if (!code || !payload || !signature || !stateSecret) return page('Gmail 授权失败', '<p>缺少授权代码或安全校验参数。</p>', false);

  const expected = await signState(stateSecret, payload);
  if (!safeEqual(signature, expected)) return page('Gmail 授权失败', '<p>安全校验失败，请从后台重新发起授权。</p>', false);

  try {
    const parsed = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as { ts?: number };
    if (!parsed.ts || Date.now() - parsed.ts > 15 * 60 * 1000) return page('Gmail 授权已过期', '<p>授权链接超过 15 分钟，请回后台重新生成。</p>', false);
  } catch {
    return page('Gmail 授权失败', '<p>无法解析安全校验参数。</p>', false);
  }

  const clientId = env.GMAIL_CLIENT_ID || '';
  const clientSecret = env.GMAIL_CLIENT_SECRET || '';
  if (!clientId || !clientSecret) return page('Gmail 授权未配置', '<p>Cloudflare 尚未配置 Gmail Client ID / Client Secret。</p>', false);

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });
  const token = await tokenResponse.json() as { refresh_token?: string; access_token?: string; error?: string; error_description?: string };
  if (!tokenResponse.ok) return page('Gmail 授权失败', `<p>${escapeHtml(token.error_description || token.error || 'Token exchange failed.')}</p>`, false);
  if (!token.refresh_token) return page('没有收到 Refresh Token', '<p>请回到后台重新授权。系统已经使用 <code>prompt=consent</code> 请求离线授权；如果仍然没有 Refresh Token，可以先在 Google 账号中撤销该应用权限后再试。</p>', false);

  return page('Gmail 授权成功', `<p>下面是一次性显示的 <strong>Refresh Token</strong>。请复制后保存到 Cloudflare 的<strong>密钥 / Secret</strong>，名称为 <code>GMAIL_REFRESH_TOKEN</code>。</p><textarea readonly onclick="this.select()">${escapeHtml(token.refresh_token)}</textarea><div class="note"><strong>重要：</strong>不要把这个 Token 发到聊天里，也不要写入 GitHub。保存到 Cloudflare Secret 后即可关闭本页面。</div>`);
};
