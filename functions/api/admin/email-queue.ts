import {ensureWebsiteIntro} from '../../../shared/outreach';

interface Env {
  MINGEAGLE_DB: D1Database;
  GMAIL_CLIENT_ID?: string;
  GMAIL_CLIENT_SECRET?: string;
  GMAIL_REFRESH_TOKEN?: string;
  GMAIL_FROM?: string;
}

type ActionInput = {
  action?: 'GENERATE' | 'SEND' | 'APPROVE' | 'DELAY' | 'SKIP' | 'RETRY';
  queueId?: string;
  days?: number;
};

type DueLead = Record<string, unknown>;

const clean = (value: unknown, max = 500) => typeof value === 'string' ? value.trim().slice(0, max) : '';

async function ensureTable(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS email_queue (
    id TEXT PRIMARY KEY,
    lead_id TEXT NOT NULL,
    company_id TEXT,
    contact_id TEXT,
    email TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    queue_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED',
    auto_eligible INTEGER NOT NULL DEFAULT 0,
    source_status TEXT,
    scheduled_for TEXT,
    dedupe_key TEXT NOT NULL UNIQUE,
    last_error TEXT,
    sent_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_queue_status_schedule ON email_queue(status, scheduled_for)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_queue_lead ON email_queue(lead_id)`).run();
}

function safeFirstName(row: DueLead) {
  const company = clean(row.company, 160).toLowerCase();
  const full = clean(row.contact, 160);
  const explicit = clean(row.first_name, 80);
  const candidate = explicit || full.split(' ')[0] || '';
  if (!candidate) return '';
  if (full.toLowerCase() === company) return '';
  if (/^(public|unknown|customer|contact|info|sales|admin|individual)$/i.test(candidate)) return '';
  return candidate.replace(/[^A-Za-z'’-]/g, '').slice(0, 40);
}

function greeting(row: DueLead) {
  const first = safeFirstName(row);
  const company = clean(row.company, 160) || 'your organization';
  return first ? `Hi ${first},` : `Hello ${company} team,`;
}

function fitCopy(customerType:string) {
  const type=customerType.toUpperCase();
  if(['TRAINING_ACADEMY','BASKETBALL_TRAINING','INDEPENDENT_COACH'].includes(type)) return { label:'basketball training academy', short:'quieter ball-handling work, indoor skill sessions, camps and take-home practice', subject:'silent basketballs for indoor skill training' };
  if(['YOUTH_SPORTS_CLUB','YOUTH_CLUB','SUMMER_CAMP'].includes(type)) return { label:'youth basketball program', short:'quieter youth drills, camps, warm-ups and at-home practice', subject:'silent basketballs for youth training' };
  if(['SPORTS_FACILITY','BASKETBALL_GYM','RECREATION_CENTER'].includes(type)) return { label:'basketball facility', short:'a quieter option for skill work in indoor spaces', subject:'a quieter basketball option for indoor training' };
  if(['SPORTS_RETAILER','SPORTS_STORE'].includes(type)) return { label:'sports retailer', short:'a differentiated indoor-play product for parents and youth players', subject:'silent basketball retail opportunity' };
  if(type==='SPORTS_DISTRIBUTOR'||type==='EDUCATION_SUPPLIER') return { label:'sporting goods supplier', short:'school and reseller indoor youth sports assortments', subject:'MING EAGLE wholesale supply' };
  if(['MULTISPORT_ACADEMY','AFTER_SCHOOL_PROGRAM','PRESCHOOL_KINDERGARTEN','ELEMENTARY_SCHOOL','MIDDLE_HIGH_SCHOOL','PRIVATE_CHARTER_SCHOOL','PUBLIC_SCHOOL','SCHOOL_DISTRICT'].includes(type)) return { label:'youth activity provider', short:'quieter supervised indoor youth programs', subject:'silent ball options for youth programs' };
  return { label:'basketball organization', short:'quieter indoor skill work and at-home basketball training', subject:'silent basketball opportunity' };
}

function templateFor(row: DueLead) {
  const status = String(row.status || '');
  const hello = greeting(row);
  const company = clean(row.company, 160) || 'your organization';
  const city = clean(row.city, 120);
  const state = clean(row.state_region, 40);
  const location = [city,state].filter(Boolean).join(', ');
  const customerType = clean(row.customer_type, 100);
  const fit = fitCopy(customerType);
  const days = Math.max(0, Math.floor(Number(row.days_since_contact || 0)));

  if (status === 'READY_TO_CONTACT') {
    const foundLine = location
      ? `I came across ${company} while looking at ${fit.label}s in ${location}.`
      : `I came across ${company} while looking at organizations that work with basketball players and programs.`;
    return {
      type: 'OUTREACH_INITIAL',
      subject: ['SPORTS_RETAILER','SPORTS_STORE','SPORTS_DISTRIBUTOR','EDUCATION_SUPPLIER'].includes(customerType.toUpperCase()) ? `MING EAGLE ${fit.subject} for ${company}` : `${company} — ${fit.subject}`,
      body: `${hello}\n\n${foundLine}\n\nWe make MING EAGLE silent basketballs for quieter indoor practice. Our silent basketball line has sold more than 30,000 sets in the U.S. market. For ${company}, a relevant use case may be ${fit.short}.\n\nWe can support sample evaluation, small wholesale quantities and repeat orders. If it looks relevant, I can send simple pricing for 20, 50 and 100 units together with shipping based on your ZIP code.\n\nWould it be useful if I sent a short wholesale quote?\n\nBest regards,\nMING EAGLE\nhttps://www.mingeagle.com`,
    };
  }
  if (status === 'WON') return {
    type: 'REORDER_FOLLOW_UP',
    subject: 'Ready for a restock? — MING EAGLE',
    body: `${hello}\n\nI hope everything has been going well with your MING EAGLE order. I wanted to check whether ${company} may need a restock or another batch of silent ball products.\n\nIf you are planning a repeat order, just reply with the approximate quantity and delivery location. I can prepare an updated quotation for you.\n\nBest regards,\nMING EAGLE`,
  };
  if (status === 'QUOTE') return {
    type: 'QUOTE_FOLLOW_UP',
    subject: 'Following up on your MING EAGLE quote',
    body: `${hello}\n\nI wanted to follow up on the MING EAGLE quotation we shared. Please let me know if you have any questions about pricing, shipping, lead time or payment terms. We can review the order configuration before confirmation.\n\nBest regards,\nMING EAGLE`,
  };
  if (status === 'SAMPLE') return {
    type: 'SAMPLE_FOLLOW_UP',
    subject: 'MING EAGLE sample follow-up',
    body: `${hello}\n\nI’m following up on the sample discussion. Please let me know if you need help with the sample arrangement, shipping details or product feedback. We can also prepare wholesale pricing when you are ready.\n\nBest regards,\nMING EAGLE`,
  };
  if (status === 'NEGOTIATION') return {
    type: 'NEGOTIATION_FOLLOW_UP',
    subject: 'Following up on commercial terms — MING EAGLE',
    body: `${hello}\n\nI’m following up on our discussion. If you still need anything clarified around price, shipping, lead time or payment terms, please let me know and I’ll review the best available option.\n\nBest regards,\nMING EAGLE`,
  };
  if (status === 'INTERESTED') return {
    type: 'INTEREST_FOLLOW_UP',
    subject: 'Next step for MING EAGLE silent basketball',
    body: `${hello}\n\nThanks again for your interest in our silent basketball products. To move forward, please send the approximate quantity and delivery ZIP code and I can confirm the best pricing and next step.\n\nBest regards,\nMING EAGLE`,
  };

  const stage = days >= 14 ? 'final' : days >= 7 ? 'second' : 'first';
  return {
    type: `OUTREACH_${stage.toUpperCase()}_FOLLOW_UP`,
    subject: stage === 'final' ? 'Final check-in — MING EAGLE silent basketball' : 'Following up — MING EAGLE silent basketball',
    body: stage === 'final'
      ? `${hello}\n\nOne final check-in regarding our silent basketball products for ${company}. If this is not relevant right now, no problem. If you would like wholesale pricing or a sample option later, feel free to reply anytime.\n\nBest regards,\nMING EAGLE`
      : `${hello}\n\nJust following up on my previous message about our silent basketball products. For ${company}, the most relevant use case may be ${fit.short}.\n\nWould it be useful if I sent pricing for 20, 50 and 100 units?\n\nBest regards,\nMING EAGLE`,
  };
}

async function generateQueue(db: D1Database) {
  await ensureTable(db);
  const due = await db.prepare(`SELECT
      l.id, l.status, l.source, l.company_id, l.primary_contact_id, l.last_contact_at, l.next_action_at,
      COALESCE(c.name, 'Individual buyer') AS company, c.customer_type, c.city, c.state_region,
      COALESCE(ct.full_name, ct.email, 'Customer') AS contact,
      ct.first_name, ct.email, COALESCE(ct.do_not_contact,0) AS do_not_contact,
      COALESCE((julianday('now') - julianday(l.last_contact_at)), 0) AS days_since_contact,
      CASE WHEN
        l.source='WEBSITE'
        OR l.status IN ('INTERESTED','SAMPLE','QUOTE','NEGOTIATION')
        OR EXISTS(SELECT 1 FROM inquiries i WHERE i.lead_id=l.id)
        OR EXISTS(SELECT 1 FROM samples s WHERE s.lead_id=l.id)
        OR EXISTS(SELECT 1 FROM quotes q WHERE q.lead_id=l.id)
        OR EXISTS(SELECT 1 FROM orders o WHERE o.lead_id=l.id)
      THEN 1 ELSE 0 END AS auto_eligible
    FROM leads l
    LEFT JOIN companies c ON c.id=l.company_id
    LEFT JOIN contacts ct ON ct.id=l.primary_contact_id
    WHERE (
        (l.status='READY_TO_CONTACT' AND l.last_contact_at IS NULL
          AND NOT EXISTS(SELECT 1 FROM messages m WHERE m.lead_id=l.id AND m.direction='OUTBOUND'))
        OR
        (l.next_action_at IS NOT NULL AND datetime(l.next_action_at) <= datetime('now')
          AND l.status IN ('CONTACTED','INTERESTED','SAMPLE','QUOTE','NEGOTIATION','WON'))
      )
      AND COALESCE(ct.do_not_contact,0)=0
      AND ct.email IS NOT NULL AND ct.email<>''
    ORDER BY CASE WHEN l.status='READY_TO_CONTACT' THEN 0 ELSE 1 END, datetime(COALESCE(l.next_action_at,l.created_at)) ASC
    LIMIT 250`).all<DueLead>();

  let created = 0;
  let initialCreated = 0;
  let followupCreated = 0;
  for (const row of due.results) {
    const leadId = String(row.id);
    const email = clean(row.email, 320);
    if (!email.includes('@')) continue;
    const tmpl = templateFor(row);
    const isInitial = String(row.status) === 'READY_TO_CONTACT';
    const nextAt = clean(row.next_action_at, 100) || new Date().toISOString();
    const dedupe = isInitial ? `${leadId}|INITIAL_OUTREACH` : `${leadId}|${String(row.status)}|${nextAt}|${tmpl.type}`;
    const isReorder = String(row.status) === 'WON';
    const autoEligible = isInitial || isReorder ? 0 : (Number(row.auto_eligible || 0) === 1 ? 1 : 0);
    const status = isInitial || isReorder ? 'REVIEW_REQUIRED' : (autoEligible ? 'READY' : 'REVIEW_REQUIRED');
    const result = await db.prepare(`INSERT OR IGNORE INTO email_queue
      (id, lead_id, company_id, contact_id, email, subject, body, queue_type, status, auto_eligible, source_status, scheduled_for, dedupe_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        crypto.randomUUID(), leadId,
        row.company_id ? String(row.company_id) : null,
        row.primary_contact_id ? String(row.primary_contact_id) : null,
        email, tmpl.subject, tmpl.body, tmpl.type, status, autoEligible, String(row.status), nextAt, dedupe,
      ).run();
    if ((result.meta?.changes || 0) > 0) {
      created += 1;
      if (isInitial) initialCreated += 1; else followupCreated += 1;
    }
  }
  return { reviewed: due.results.length, created, initialCreated, followupCreated };
}

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

async function createFollowupTask(db: D1Database, row: Record<string, unknown>) {
  const existing = await db.prepare(`SELECT id FROM tasks WHERE lead_id=? AND type='OUTREACH_FOLLOW_UP' AND status IN ('OPEN','IN_PROGRESS') LIMIT 1`)
    .bind(String(row.lead_id)).first<{id:string}>();
  if (existing?.id) {
    await db.prepare(`UPDATE tasks SET title='Follow up sent email', description='Email was sent. Follow up if the customer has not replied.', priority='MEDIUM', due_at=datetime('now','+3 days'), updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(existing.id).run();
    return;
  }
  await db.prepare(`INSERT INTO tasks (id, lead_id, company_id, contact_id, type, title, description, status, priority, due_at)
    VALUES (?, ?, ?, ?, 'OUTREACH_FOLLOW_UP', 'Follow up sent email', 'Email was sent. Follow up if the customer has not replied.', 'OPEN', 'MEDIUM', datetime('now','+3 days'))`)
    .bind(crypto.randomUUID(), String(row.lead_id), row.company_id ? String(row.company_id) : null, row.contact_id ? String(row.contact_id) : null).run();
}

async function sendQueueItem(db: D1Database, env: Env, queueId: string) {
  const row = await db.prepare(`SELECT q.*, COALESCE(ct.do_not_contact,0) AS do_not_contact, l.status AS lead_status
    FROM email_queue q
    JOIN leads l ON l.id=q.lead_id
    LEFT JOIN contacts ct ON ct.id=q.contact_id
    WHERE q.id=? LIMIT 1`).bind(queueId).first<Record<string, unknown>>();
  if (!row) throw new Error('Queue item not found.');
  if (['SENT','SKIPPED'].includes(String(row.status))) throw new Error('This queue item is already closed.');
  if (String(row.status) !== 'READY') throw new Error('Approve this draft before sending.');
  if (Number(row.do_not_contact || 0) === 1 || ['DO_NOT_CONTACT','NOT_INTERESTED','NOT_FIT'].includes(String(row.lead_status || '').toUpperCase())) throw new Error('This contact is marked DO NOT CONTACT.');

  const clientId = env.GMAIL_CLIENT_ID || '';
  const clientSecret = env.GMAIL_CLIENT_SECRET || '';
  const refreshToken = env.GMAIL_REFRESH_TOKEN || '';
  if (!clientId || !clientSecret || !refreshToken) throw new Error('Gmail OAuth is not fully configured.');

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
  });
  const token = await tokenResponse.json() as { access_token?: string; error?: string; error_description?: string };
  if (!tokenResponse.ok || !token.access_token) throw new Error(token.error_description || token.error || 'Unable to refresh Gmail access token.');

  const from = clean(env.GMAIL_FROM || 'mingeaglecommerce@gmail.com', 320);
  const email = clean(row.email, 320);
  const subject = clean(row.subject, 500);
  const body = typeof row.body === 'string' ? row.body.slice(0, 20000) : '';
  if(String(row.queue_type)==='OUTREACH_INITIAL'&&ensureWebsiteIntro(body)!==body)
    throw new Error('首次邀约邮件必须在正文中推荐官网 https://www.mingeagle.com。');
  const rawText = [
    `From: MING EAGLE <${from}>`,
    `To: ${email}`,
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
  if (!sendResponse.ok || !sent.id) throw new Error(sent.error?.message || 'Gmail API send failed.');

  const intent = String(row.queue_type) === 'OUTREACH_INITIAL' ? 'OUTREACH' : 'FOLLOW_UP';
  await db.prepare(`INSERT INTO messages (id, lead_id, company_id, contact_id, channel, direction, subject, body, intent, sent_at)
    VALUES (?, ?, ?, ?, 'EMAIL', 'OUTBOUND', ?, ?, ?, CURRENT_TIMESTAMP)`)
    .bind(crypto.randomUUID(), String(row.lead_id), row.company_id ? String(row.company_id) : null, row.contact_id ? String(row.contact_id) : null, subject, body, intent).run();

  const currentStatus = String(row.lead_status || '');
  const nextStatus = ['DISCOVERED','ANALYZED','QUALIFIED','ENRICHING','READY_TO_CONTACT'].includes(currentStatus) ? 'CONTACTED' : currentStatus;
  await db.prepare(`UPDATE leads SET status=?, last_contact_at=CURRENT_TIMESTAMP, next_best_action='Wait for reply / follow up', next_action_at=datetime('now','+3 days'), updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .bind(nextStatus, String(row.lead_id)).run();
  await createFollowupTask(db, row);

  await db.prepare(`UPDATE email_queue SET status='SENT', sent_at=CURRENT_TIMESTAMP, last_error=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(queueId).run();
  await db.prepare(`INSERT INTO activities (id, entity_type, entity_id, activity_type, title, description, metadata_json)
    VALUES (?, 'LEAD', ?, 'MESSAGE_OUTBOUND', 'Queued email sent through Gmail API', ?, ?)`)
    .bind(crypto.randomUUID(), String(row.lead_id), `EMAIL: ${body.slice(0,300)}`, JSON.stringify({ queueId, gmailMessageId: sent.id, gmailThreadId: sent.threadId || null, queueType: row.queue_type })).run();

  return { gmailMessageId: sent.id, gmailThreadId: sent.threadId || null, to: email };
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  if (!env.MINGEAGLE_DB) return Response.json({ ok: false, error: 'Database is not configured.' }, { status: 503 });
  try {
    await ensureTable(env.MINGEAGLE_DB);
    const rows = await env.MINGEAGLE_DB.prepare(`SELECT q.*, COALESCE(c.name,'Individual buyer') AS company,
      COALESCE(ct.full_name,ct.email,'Customer') AS contact, l.lead_score
      FROM email_queue q
      LEFT JOIN companies c ON c.id=q.company_id
      LEFT JOIN contacts ct ON ct.id=q.contact_id
      LEFT JOIN leads l ON l.id=q.lead_id
      ORDER BY CASE q.status WHEN 'REVIEW_REQUIRED' THEN 0 WHEN 'READY' THEN 1 WHEN 'FAILED' THEN 2 WHEN 'SENT' THEN 3 ELSE 4 END,
        datetime(COALESCE(q.scheduled_for,q.created_at)) ASC
      LIMIT 400`).all();
    const counts = await env.MINGEAGLE_DB.prepare(`SELECT status, COUNT(*) AS count FROM email_queue GROUP BY status`).all();
    return Response.json({ ok: true, rows: rows.results, counts: counts.results });
  } catch (error) {
    console.error('email_queue_load_failed', error);
    return Response.json({ ok: false, error: 'Unable to load email queue.' }, { status: 500 });
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.MINGEAGLE_DB) return Response.json({ ok: false, error: 'Database is not configured.' }, { status: 503 });
  const db = env.MINGEAGLE_DB;
  await ensureTable(db);
  try {
    const input = await request.json() as ActionInput;
    const action = input.action || 'GENERATE';
    if (action === 'GENERATE') {
      const result = await generateQueue(db);
      return Response.json({ ok: true, ...result });
    }
    const queueId = clean(input.queueId, 100);
    if (!queueId) return Response.json({ ok: false, error: 'queueId is required.' }, { status: 400 });

    if (action === 'SEND') {
      try {
        const sent = await sendQueueItem(db, env, queueId);
        return Response.json({ ok: true, ...sent });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to send queued email.';
        const validationError = message === 'Approve this draft before sending.' || message === 'This queue item is already closed.' || message === 'This contact is marked DO NOT CONTACT.' || message === 'Queue item not found.';
        if (!validationError) {
          await db.prepare(`UPDATE email_queue SET status='FAILED', last_error=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='READY'`).bind(message, queueId).run();
        }
        return Response.json({ ok: false, error: message }, { status: validationError ? 409 : 502 });
      }
    }
    if (action === 'APPROVE') {
      const result = await db.prepare(`UPDATE email_queue SET status='READY', last_error=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='REVIEW_REQUIRED'`).bind(queueId).run();
      if ((result.meta?.changes || 0) === 0) return Response.json({ ok:false, error:'Only review-required drafts can be approved.' }, { status:409 });
      return Response.json({ ok: true });
    }
    if (action === 'RETRY') {
      const result = await db.prepare(`UPDATE email_queue SET status='READY', last_error=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='FAILED'`).bind(queueId).run();
      if ((result.meta?.changes || 0) === 0) return Response.json({ ok:false, error:'Only failed sends can be retried.' }, { status:409 });
      return Response.json({ ok: true });
    }
    if (action === 'SKIP') {
      await db.prepare(`UPDATE email_queue SET status='SKIPPED', updated_at=CURRENT_TIMESTAMP WHERE id=? AND status NOT IN ('SENT','SKIPPED')`).bind(queueId).run();
      return Response.json({ ok: true });
    }
    if (action === 'DELAY') {
      const days = [1,3,7].includes(Number(input.days)) ? Number(input.days) : 3;
      await db.prepare(`UPDATE email_queue SET scheduled_for=datetime('now', ?), status=CASE WHEN auto_eligible=1 THEN 'READY' ELSE 'REVIEW_REQUIRED' END, updated_at=CURRENT_TIMESTAMP WHERE id=? AND status NOT IN ('SENT','SKIPPED')`)
        .bind(`+${days} days`, queueId).run();
      return Response.json({ ok: true, days });
    }
    return Response.json({ ok: false, error: 'Unsupported action.' }, { status: 400 });
  } catch (error) {
    console.error('email_queue_action_failed', error);
    return Response.json({ ok: false, error: 'Unable to update email queue.' }, { status: 500 });
  }
};