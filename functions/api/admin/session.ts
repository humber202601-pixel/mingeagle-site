// The admin middleware authenticates the supplied x-admin-key before this handler runs.
// Intentionally avoid D1: authentication must work when dashboard data is unavailable.
export const onRequestGet: PagesFunction = async () =>
  Response.json({ ok: true, authenticated: true }, {
    headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  });
