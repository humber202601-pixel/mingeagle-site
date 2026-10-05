export async function sha256Hex(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyInboundKey(db: D1Database, envKey: string | undefined, supplied: string) {
  if (!supplied) return false;

  if (envKey) {
    const [a, b] = await Promise.all([sha256Hex(envKey), sha256Hex(supplied)]);
    if (a === b) return true;
  }

  await db.prepare(`CREATE TABLE IF NOT EXISTS integration_secrets (
    id TEXT PRIMARY KEY,
    secret_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();

  const row = await db.prepare(`SELECT secret_hash FROM integration_secrets WHERE id='INBOUND_REPLY' LIMIT 1`)
    .first<{ secret_hash: string }>();
  if (!row?.secret_hash) return false;

  const suppliedHash = await sha256Hex(supplied);
  return row.secret_hash === suppliedHash;
}
