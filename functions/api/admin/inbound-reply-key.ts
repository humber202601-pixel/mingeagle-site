interface Env {
  MINGEAGLE_DB: D1Database;
}

type Input = { action?: 'GENERATE' | 'REVOKE' };

async function ensureTable(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS integration_secrets (
    id TEXT PRIMARY KEY,
    secret_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
}

async function sha256Hex(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function randomKey() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `mer_${btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')}`;
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  if (!env.MINGEAGLE_DB) return Response.json({ ok: false, error: 'Database is not configured.' }, { status: 503 });
  await ensureTable(env.MINGEAGLE_DB);
  const row = await env.MINGEAGLE_DB.prepare(`SELECT created_at, updated_at FROM integration_secrets WHERE id='INBOUND_REPLY' LIMIT 1`).first<Record<string, unknown>>();
  return Response.json({ ok: true, configured: Boolean(row), createdAt: row?.created_at || null, updatedAt: row?.updated_at || null });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.MINGEAGLE_DB) return Response.json({ ok: false, error: 'Database is not configured.' }, { status: 503 });
  await ensureTable(env.MINGEAGLE_DB);
  const input = await request.json().catch(() => ({})) as Input;
  const action = input.action || 'GENERATE';

  if (action === 'REVOKE') {
    await env.MINGEAGLE_DB.prepare(`DELETE FROM integration_secrets WHERE id='INBOUND_REPLY'`).run();
    return Response.json({ ok: true, configured: false });
  }

  const key = randomKey();
  const hash = await sha256Hex(key);
  await env.MINGEAGLE_DB.prepare(`INSERT INTO integration_secrets (id, secret_hash)
    VALUES ('INBOUND_REPLY', ?)
    ON CONFLICT(id) DO UPDATE SET secret_hash=excluded.secret_hash, updated_at=CURRENT_TIMESTAMP`)
    .bind(hash).run();

  return Response.json({
    ok: true,
    configured: true,
    key,
    warning: 'This key is shown only in this response. Copy it now and store it in Google Apps Script Properties.',
  });
};
