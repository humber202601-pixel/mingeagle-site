export const onRequest: PagesFunction = async (context) => {
  const response = await context.next();
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
