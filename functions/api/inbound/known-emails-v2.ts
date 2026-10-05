import { verifyInboundKey } from '../../_shared/inbound-auth';

interface Env {
  MINGEAGLE_DB: D1Database;
  INBOUND_REPLY_KEY?: string;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.MINGEAGLE_DB) return Response.json({ ok: false, error: 'Database is not configured.' }, { status: 503 });
  const supplied = request.headers.get('x-inbound-key') || '';
  if (!(await verifyInboundKey(env.MINGEAGLE_DB, env.INBOUND_REPLY_KEY, supplied))) {
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
    console.error('known_emails_v2_failed', error);
    return Response.json({ ok: false, error: 'Unable to load known CRM emails.' }, { status: 500 });
  }
};
