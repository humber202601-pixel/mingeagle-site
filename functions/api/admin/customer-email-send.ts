import { ensureWebsiteIntro } from '../../../shared/outreach';

interface Env {
  MINGEAGLE_DB: D1Database;
  GMAIL_CLIENT_ID?: string;
  GMAIL_CLIENT_SECRET?: string;
  GMAIL_REFRESH_TOKEN?: string;
  GMAIL_FROM?: string;
}

type Input = { leadId?: string; subject?: string; body?: string };

const oneLine = (value: unknown, max: number) => typeof value === 'string' ? value.replace(/[\r\n]+/g, ' ').trim().slice(0, max) : '';
const bodyText = (value: unknown) => typeof value === 'string' ? value.trim().slice(0, 20000) : '';

function base64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function encodedHeader(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `=?UTF-8?B?${btoa(binary)}?=`;
}

async function upsertFollowUpTask(db: D1Database, leadId: string, companyId: string | null, contactId: string | null) {
  const existing = await db.prepare(`SELECT id FROM tasks WHERE lead_id=? AND type='OUTREACH_FOLLOW_UP' AND status IN ('OPEN','IN_PROGRESS') LIMIT 1`)
    .bind(leadId).first<{ id: string }>();

  if (existing?.id) {
    await db.prepare(`UPDATE tasks SET title='Follow up customer email', description='No reply yet. Follow up if the customer has not responded.', priority='MEDIUM', due_at=datetime('now','+3 days'), updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(existing.id).run();
    return;
  }

  await db.prepare(`INSERT INTO tasks (id, lead_id, company_id, contact_id, type, title, description, status, priority, due_at)
    VALUES (?, ?, ?, ?, 'OUTREACH_FOLLOW_UP', 'Follow up customer email', 'No reply yet. Follow up if the customer has not responded.', 'OPEN', 'MEDIUM', datetime('now','+3 days'))`)
    .bind(crypto.randomUUID(), leadId, companyId, contactId).run();
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.MINGEAGLE_DB) return Response.json({ ok: false, error: 'Database is not configured.' }, { status: 503 });

  try {
    const input = await request.json() as Input;
    const leadId = oneLine(input.leadId, 100);
    const subject = oneLine(input.subject, 500);
    const body = bodyText(input.body);
    if (!leadId || !subject || !body) return Response.json({ ok: false, error: 'Lead, subject and body are required.' }, { status: 400 });

    const lead = await env.MINGEAGLE_DB.prepare(`SELECT l.id, l.status, l.company_id, l.primary_contact_id, ct.email, ct.do_not_contact
      FROM leads l LEFT JOIN contacts ct ON ct.id=l.primary_contact_id WHERE l.id=? LIMIT 1`).bind(leadId).first<Record<string, unknown>>();
    if (!lead) return Response.json({ ok: false, error: 'Lead not found.' }, { status: 404 });
    if (Number(lead.do_not_contact || 0) === 1 || String(lead.status || '') === 'DO_NOT_CONTACT') {
      return Response.json({ ok: false, error: 'This contact is marked DO NOT CONTACT.' }, { status: 409 });
    }

    const to = oneLine(lead.email, 320);
    if (!to || !to.includes('@')) return Response.json({ ok: false, error: 'This contact does not have a valid email address.' }, { status: 409 });

    const previous = await env.MINGEAGLE_DB.prepare(`SELECT COUNT(*) AS count FROM messages WHERE lead_id=? AND direction='OUTBOUND'`).bind(leadId).first<{ count: number }>();
    if (!previous?.count && ensureWebsiteIntro(body) !== body) {
      return Response.json({ ok: false, error: '首次沟通请在消息中推荐官网 https://www.mingeagle.com，审核后再发送。' }, { status: 400 });
    }

    const clientId = env.GMAIL_CLIENT_ID || '';
    const clientSecret = env.GMAIL_CLIENT_SECRET || '';
    const refreshToken = env.GMAIL_REFRESH_TOKEN || '';
    if (!clientId || !clientSecret || !refreshToken) return Response.json({ ok: false, error: 'Gmail OAuth is not fully configured.' }, { status: 503 });

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
    });
    const token = await tokenResponse.json() as { access_token?: string; error?: string; error_description?: string };
    if (!tokenResponse.ok || !token.access_token) return Response.json({ ok: false, error: token.error_description || token.error || 'Unable to refresh Gmail access token.' }, { status: 502 });

    const from = oneLine(env.GMAIL_FROM || 'mingeaglecommerce@gmail.com', 320);
    const rawText = [
      `From: MING EAGLE <${from}>`,
      `To: ${to}`,
      `Subject: ${encodedHeader(subject)}`,
      `Reply-To: ${from}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      '',
      body,
    ].join('\r\n');

    const sendResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { authorization: `Bearer ${token.access_token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ raw: base64Url(new TextEncoder().encode(rawText)) }),
    });
    const sent = await sendResponse.json() as { id?: string; threadId?: string; error?: { message?: string } };
    if (!sendResponse.ok || !sent.id) return Response.json({ ok: false, error: sent.error?.message || 'Gmail API send failed.' }, { status: 502 });

    const companyId = lead.company_id ? String(lead.company_id) : null;
    const contactId = lead.primary_contact_id ? String(lead.primary_contact_id) : null;
    const crmMessageId = crypto.randomUUID();

    await env.MINGEAGLE_DB.prepare(`INSERT INTO messages (id, lead_id, company_id, contact_id, channel, direction, subject, body, intent, sent_at)
      VALUES (?, ?, ?, ?, 'EMAIL', 'OUTBOUND', ?, ?, 'OUTREACH', CURRENT_TIMESTAMP)`)
      .bind(crmMessageId, leadId, companyId, contactId, subject, body).run();

    const currentStatus = String(lead.status || '');
    const nextStatus = ['DISCOVERED','ANALYZED','QUALIFIED','ENRICHING','READY_TO_CONTACT'].includes(currentStatus) ? 'CONTACTED' : currentStatus;
    await env.MINGEAGLE_DB.prepare(`UPDATE leads SET status=?, last_contact_at=CURRENT_TIMESTAMP, next_best_action='Wait for reply / follow up', next_action_at=datetime('now','+3 days'), updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(nextStatus, leadId).run();

    await upsertFollowUpTask(env.MINGEAGLE_DB, leadId, companyId, contactId);

    await env.MINGEAGLE_DB.prepare(`INSERT INTO activities (id, entity_type, entity_id, activity_type, title, description, metadata_json)
      VALUES (?, 'LEAD', ?, 'MESSAGE_OUTBOUND', 'Email sent through Gmail API', ?, ?)`)
      .bind(crypto.randomUUID(), leadId, `EMAIL: ${body.slice(0, 300)}`, JSON.stringify({ crmMessageId, gmailMessageId: sent.id, gmailThreadId: sent.threadId || null })).run();

    return Response.json({ ok: true, gmailMessageId: sent.id, gmailThreadId: sent.threadId || null, to, from, leadStatus: nextStatus }, { status: 201 });
  } catch (error) {
    console.error('customer_email_send_failed', error);
    return Response.json({ ok: false, error: 'Unable to send email.' }, { status: 500 });
  }
};
