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

async function digest(value: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return new Uint8Array(hash);
}

async function sameSecret(a: string, b: string) {
  const [left, right] = await Promise.all([digest(a), digest(b)]);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

async function signState(secret: string, payload: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return base64Url(new Uint8Array(signature));
}

function html(message = '') {
  return new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect Gmail · MING EAGLE</title><style>body{font-family:Arial,sans-serif;background:#17243a;color:#172033;margin:0;padding:32px}.card{max-width:520px;margin:60px auto;background:#fff;border-radius:20px;padding:30px;box-shadow:0 18px 60px rgba(0,0,0,.28)}h1{margin:0 0 8px}.sub{color:#667085;line-height:1.6}.warn{color:#b42318;background:#fef3f2;border:1px solid #fecdca;padding:10px 12px;border-radius:9px;margin:12px 0}label{display:block;font-size:13px;font-weight:700;margin:18px 0 8px}input{width:100%;box-sizing:border-box;padding:12px;border:1px solid #d0d5dd;border-radius:10px;font:inherit}button{margin-top:16px;width:100%;border:0;border-radius:10px;padding:13px;background:#ef5b2a;color:#fff;font-weight:800;cursor:pointer}code{background:#f2f4f7;padding:2px 5px;border-radius:5px}.small{font-size:12px;color:#667085;line-height:1.6}</style></head><body><div class="card"><h1>连接 Gmail</h1><p class="sub">MING EAGLE Growth Engine · 一次性 OAuth 授权入口</p>${message ? `<div class="warn">${message}</div>` : ''}<form method="post"><label>后台管理员访问密码</label><input type="password" name="key" required autocomplete="current-password" placeholder="ADMIN_ACCESS_KEY"><button type="submit">继续前往 Google 授权</button></form><p class="small">授权范围仅请求 <code>gmail.send</code>，用于发送邮件；不会请求读取收件箱权限。管理员密码不会写入 URL。</p></div></body></html>`, { headers: { 'content-type': 'text/html; charset=UTF-8', 'cache-control': 'no-store' } });
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  if (!env.GMAIL_CLIENT_ID) return html('尚未配置 GMAIL_CLIENT_ID。请先在 Cloudflare Pages 中添加 Google OAuth Client ID。');
  return html();
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const configured = env.ADMIN_ACCESS_KEY || '';
  const clientId = env.GMAIL_CLIENT_ID || '';
  if (!configured || !clientId) return html('Cloudflare 尚未完成管理员密码或 Gmail Client ID 配置。');

  const form = await request.formData();
  const supplied = String(form.get('key') || '');
  if (!supplied || !(await sameSecret(supplied, configured))) return html('管理员密码不正确，请重试。');

  const payload = base64Url(new TextEncoder().encode(JSON.stringify({ ts: Date.now(), nonce: crypto.randomUUID() })));
  const signature = await signState(configured, payload);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/gmail.send',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: `${payload}.${signature}`,
  });

  return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`, 302);
};
