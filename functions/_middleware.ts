interface Env {TEST_ENVIRONMENT?:string;OUTBOUND_EMAIL_DISABLED?:string}
const previewWrites = new Set(['/api/inquiries','/api/shipping/cart','/api/admin/quotes','/api/admin/quote-edit','/api/admin/quote-retail-approval','/api/admin/wholesale-quote-draft','/api/admin/retail-quote-draft','/api/admin/quote-send','/api/admin/quote-revise','/api/admin/unpaid-wholesale-requote','/api/admin/order-item-catalog-match']);
export const onRequest: PagesFunction<Env> = async (context) => {
  if(context.env?.TEST_ENVIRONMENT==='preview'){
    const pathname = new URL(context.request.url).pathname;
    // Each Stripe test handler independently restricts its host and test mode.
    // The visual sandbox never writes D1; order acceptance requires its isolated
    // database marker, authenticated owner access, and an expiring opt-in.
    const stripeSandboxPost = context.request.method === 'POST' && [
      '/api/payments/stripe/sandbox','/api/payments/stripe/acceptance','/api/payments/stripe/acceptance-webhook'
    ].includes(pathname);
    // Buyer quote acceptance writes only to the preview D1 and remains guarded
    // by the public token, same-origin check, quoted state and Stripe-only terms.
    const isolatedQuoteAccept = context.request.method === 'POST' &&
      /^\/api\/quote\/[a-f0-9]{64}$/i.test(pathname);
    // Preview accepts the isolated quote workflow and independently guarded tests.
    if(!['GET','HEAD','OPTIONS'].includes(context.request.method) && !previewWrites.has(pathname) && !stripeSandboxPost && !isolatedQuoteAccept){
      return Response.json({ok:false,code:'PREVIEW_OPERATION_DISABLED',error:'This operation is disabled in the isolated quote preview.'},{status:403});
    }
  }
  let response: Response;
  try { response = await context.next(); } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const quota = /D1.*(quota|limit|temporarily blocked)|exceeded.*(rows|read)|daily.*(read|limit)/i.test(message);
    const reset = new Date(); reset.setUTCHours(24, 0, 0, 0);
    response = Response.json({ ok: false, code: quota ? "DATABASE_DAILY_LIMIT" : "SERVICE_UNAVAILABLE", error: quota ? "Daily database read quota reached. Please wait until the next 00:00 UTC reset." : "Service temporarily unavailable. Please try again later.", ...(quota ? { resetAt: reset.toISOString() } : {}) }, { status: 503, headers: { "cache-control": "no-store", "retry-after": quota ? String(Math.max(60, Math.ceil((reset.getTime()-Date.now())/1000))) : "60" } });
  }
  const headers = new Headers(response.headers);

  headers.set('strict-transport-security', 'max-age=31536000');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-frame-options', 'DENY');
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=(self)');
  headers.set('x-permitted-cross-domain-policies', 'none');

  // A customer quotation contains a bearer-style URL token and may disclose
  // negotiated prices, buyer information or the current payment state.
  // Keep these specific responses out of browser/intermediary caches and do
  // not leak the token URL as a Referer to third-party checkout resources.
  // Public product, school, wholesale and procurement SEO pages keep their
  // existing caching and strict-origin referral policies.
  const urlPath=context.request?.url?new URL(context.request.url).pathname:'';
  const confidentialBuyerPath=new RegExp(
    '^/(?:quote/[a-f0-9]{60,80}|api/quote/[a-f0-9]{60,80}|api/payments/(?:stripe|airwallex)/(?:create|status))$','i'
  ).test(urlPath);
  if(confidentialBuyerPath){
    headers.set('cache-control','private, no-store, max-age=0');
    headers.set('pragma','no-cache');
    headers.set('referrer-policy','no-referrer');
    headers.set('x-robots-tag','noindex, nofollow, noarchive');
    headers.set('cross-origin-resource-policy','same-origin');
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};
