interface Env {
  MINGEAGLE_DB: D1Database;
}

type Input = {
  enabled?: boolean;
  maxPerRun?: number;
  maxPerLead?: number;
};

async function ensureSettings(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS automation_settings (
    id TEXT PRIMARY KEY,
    auto_email_enabled INTEGER NOT NULL DEFAULT 1,
    max_auto_send_per_run INTEGER NOT NULL DEFAULT 5,
    max_auto_send_per_lead INTEGER NOT NULL DEFAULT 3,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await db.prepare(`INSERT OR IGNORE INTO automation_settings
    (id, auto_email_enabled, max_auto_send_per_run, max_auto_send_per_lead)
    VALUES ('default', 1, 5, 3)`).run();
}

async function payload(db: D1Database) {
  await ensureSettings(db);
  const settings = await db.prepare(`SELECT * FROM automation_settings WHERE id='default'`).first<Record<string, unknown>>();
  const today = await db.prepare(`SELECT
      SUM(CASE WHEN status='SENT' AND date(sent_at)=date('now') THEN 1 ELSE 0 END) AS sent_today,
      SUM(CASE WHEN status='READY' THEN 1 ELSE 0 END) AS ready,
      SUM(CASE WHEN status='REVIEW_REQUIRED' THEN 1 ELSE 0 END) AS review_required,
      SUM(CASE WHEN status='FAILED' THEN 1 ELSE 0 END) AS failed,
      SUM(CASE WHEN status='SENT' THEN 1 ELSE 0 END) AS sent_total
    FROM email_queue`).first<Record<string, unknown>>().catch(() => null);

  let recentRows: Record<string, unknown>[] = [];
  try {
    const recent = await db.prepare(`SELECT q.id, q.lead_id, q.email, q.subject, q.status, q.sent_at, q.updated_at,
        COALESCE(c.name,'Individual buyer') AS company
      FROM email_queue q
      LEFT JOIN companies c ON c.id=q.company_id
      ORDER BY datetime(COALESCE(q.sent_at,q.updated_at,q.created_at)) DESC
      LIMIT 12`).all<Record<string, unknown>>();
    recentRows = recent.results || [];
  } catch {
    recentRows = [];
  }

  return {
    settings: {
      enabled: Number(settings?.auto_email_enabled || 0) === 1,
      maxPerRun: Number(settings?.max_auto_send_per_run || 5),
      maxPerLead: Number(settings?.max_auto_send_per_lead || 3),
      updatedAt: settings?.updated_at || null,
    },
    metrics: {
      sentToday: Number(today?.sent_today || 0),
      ready: Number(today?.ready || 0),
      reviewRequired: Number(today?.review_required || 0),
      failed: Number(today?.failed || 0),
      sentTotal: Number(today?.sent_total || 0),
    },
    recent: recentRows,
  };
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  if (!env.MINGEAGLE_DB) return Response.json({ ok: false, error: 'Database is not configured.' }, { status: 503 });
  try {
    const data = await payload(env.MINGEAGLE_DB);
    return Response.json({ ok: true, ...data });
  } catch (error) {
    console.error('automation_control_load_failed', error);
    return Response.json({ ok: false, error: 'Unable to load automation settings.' }, { status: 500 });
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.MINGEAGLE_DB) return Response.json({ ok: false, error: 'Database is not configured.' }, { status: 503 });
  const db = env.MINGEAGLE_DB;
  try {
    await ensureSettings(db);
    const input = await request.json() as Input;
    const enabled = input.enabled === undefined ? null : input.enabled ? 1 : 0;
    const maxPerRun = Math.min(20, Math.max(1, Math.floor(Number(input.maxPerRun || 5))));
    const maxPerLead = Math.min(5, Math.max(1, Math.floor(Number(input.maxPerLead || 3))));
    const current = await db.prepare(`SELECT * FROM automation_settings WHERE id='default'`).first<Record<string, unknown>>();
    await db.prepare(`UPDATE automation_settings SET
      auto_email_enabled=?, max_auto_send_per_run=?, max_auto_send_per_lead=?, updated_at=CURRENT_TIMESTAMP
      WHERE id='default'`)
      .bind(
        enabled === null ? Number(current?.auto_email_enabled || 0) : enabled,
        input.maxPerRun === undefined ? Number(current?.max_auto_send_per_run || 5) : maxPerRun,
        input.maxPerLead === undefined ? Number(current?.max_auto_send_per_lead || 3) : maxPerLead,
      ).run();
    const data = await payload(db);
    return Response.json({ ok: true, ...data });
  } catch (error) {
    console.error('automation_control_update_failed', error);
    return Response.json({ ok: false, error: 'Unable to update automation settings.' }, { status: 500 });
  }
};
