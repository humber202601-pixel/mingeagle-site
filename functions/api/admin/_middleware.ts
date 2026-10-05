interface Env {
  ADMIN_ACCESS_KEY?: string;
  MINGEAGLE_DB?: D1Database;
}

async function digest(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return new Uint8Array(hash);
}

async function digestHex(value: string) {
  return Array.from(await digest(value)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function sameSecret(a: string, b: string) {
  const [left, right] = await Promise.all([digest(a), digest(b)]);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

function clientIp(request: Request) {
  return request.headers.get('CF-Connecting-IP')
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown';
}

async function ensureSecurityTables(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS admin_auth_attempts (
    id TEXT PRIMARY KEY,
    ip_hash TEXT NOT NULL,
    success INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_admin_auth_attempts_ip_time
    ON admin_auth_attempts(ip_hash, created_at DESC)`).run();
}

async function failedAttempts(db: D1Database, ipHash: string) {
  const row = await db.prepare(`SELECT COUNT(*) AS count
    FROM admin_auth_attempts
    WHERE ip_hash=? AND success=0 AND created_at >= datetime('now','-15 minutes')`)
    .bind(ipHash).first<{ count: number }>();
  return Number(row?.count || 0);
}

async function recordAttempt(db: D1Database, ipHash: string, success: boolean) {
  await db.prepare(`INSERT INTO admin_auth_attempts (id, ip_hash, success) VALUES (?, ?, ?)`)
    .bind(crypto.randomUUID(), ipHash, success ? 1 : 0).run();
  if (success) {
    await db.prepare(`DELETE FROM admin_auth_attempts WHERE ip_hash=? AND success=0`).bind(ipHash).run();
  }
  await db.prepare(`DELETE FROM admin_auth_attempts WHERE created_at < datetime('now','-2 days')`).run();
}

function hardenedJson(body: Record<string, unknown>, status: number, extraHeaders: Record<string, string> = {}) {
  return Response.json(body, {
    status,
    headers: {
      'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
      'pragma': 'no-cache',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'permissions-policy': 'camera=(), microphone=(), geolocation=()',
      'x-frame-options': 'DENY',
      ...extraHeaders,
    },
  });
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const configured = context.env.ADMIN_ACCESS_KEY || '';
  if (!configured) {
    return hardenedJson({ ok: false, error: 'Admin access is not configured.' }, 503);
  }

  const db = context.env.MINGEAGLE_DB;
  const ipHash = await digestHex(clientIp(context.request));
  if (db) {
    await ensureSecurityTables(db);
    const failures = await failedAttempts(db, ipHash);
    if (failures >= 8) {
      return hardenedJson(
        { ok: false, error: 'Too many failed login attempts. Please wait 15 minutes and try again.' },
        429,
        { 'retry-after': '900' },
      );
    }
  }

  const supplied = context.request.headers.get('x-admin-key') || '';
  if (!supplied || !(await sameSecret(supplied, configured))) {
    if (db) await recordAttempt(db, ipHash, false);
    return hardenedJson({ ok: false, error: 'Unauthorized.' }, 401);
  }

  if (db) await recordAttempt(db, ipHash, true);
  const response = await context.next();
  const headers = new Headers(response.headers);
  headers.set('cache-control', 'no-store, no-cache, must-revalidate, max-age=0');
  headers.set('pragma', 'no-cache');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'no-referrer');
  headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  headers.set('x-frame-options', 'DENY');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};
