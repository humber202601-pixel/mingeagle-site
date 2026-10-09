export const onRequest: PagesFunction = async (context) => {
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

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};
