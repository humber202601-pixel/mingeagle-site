interface Env {
  MINGEAGLE_DB: D1Database;
  INBOUND_REPLY_KEY?: string;
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

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.MINGEAGLE_DB) return Response.json({ ok: false, error: 'Database is not configured.' }, { status: 503 });
  const configured = env.INBOUND_REPLY_KEY || '';
  const supplied = request.headers.get('x-inbound-key') || '';
  if (!configured || !supplied || !(await sameSecret(configured, supplied))) {
    return Response.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const rows = await env.MINGEAGLE_DB.prepare(`SELECT DISTINCT lower(ct.email) AS email
      FROM contacts ct
      JOIN leads l ON l.primary_contact_id=ct.id
      WHERE ct.email IS NOT NULL AND ct.email<>''
        AND l.status NOT IN ('LOST','NOT_FIT')
      ORDER BY lower(ct.email)
      LIMIT 1000`).all<{ email: string }>();
    return Response.json({ ok: true, emails: rows.results.map(row => row.email).filter(Boolean) });
  } catch (error) {
    console.error('known_emails_failed', error);
    return Response.json({ ok: false, error: 'Unable to load known CRM emails.' }, { status: 500 });
  }
};
