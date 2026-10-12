// Public, deliberately non-sensitive readiness probe. Only two bounded SELECTs;
// never exposes customer rows, database IDs, secrets or raw SQL errors.
interface Env { MINGEAGLE_DB?: D1Database; }
type Pulse = { id: string; last_seen_at: string };
const expected = [
  { id: 'DISCOVERY', name: 'discovery', maxAgeMinutes: 30 },
  { id: 'HUBSPOT_RECOVERY', name: 'hubspotRecovery', maxAgeMinutes: 105 },
  { id: 'FOLLOWUP', name: 'dailyFollowup', maxAgeMinutes: 1590 },
] as const;

const headers = {
  'cache-control': 'no-store, max-age=0',
  'x-content-type-options': 'nosniff',
};

function pulseState(value: unknown, maxAgeMinutes: number, now: number) {
  if (typeof value !== 'string' || !value.trim()) return 'missing';
  // SQLite CURRENT_TIMESTAMP is UTC, with a space instead of T.
  const time = Date.parse(value.replace(' ', 'T') + (/[zZ]|[+-]\d\d:\d\d$/.test(value) ? '' : 'Z'));
  if (!Number.isFinite(time)) return 'missing';
  const age = (now-time)/60000;
  if (age < -5) return 'invalid_clock';
  return age <= maxAgeMinutes ? 'healthy' : 'stale';
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const now = Date.now();
  const scheduler: Record<string, string> = Object.fromEntries(expected.map(item => [item.name, 'unknown']));
  const databaseBinding = Boolean(env.MINGEAGLE_DB);
  let databaseReadOk = false;
  let schedulerReadOk = false;

  if (env.MINGEAGLE_DB) {
    try {
      const alive = await env.MINGEAGLE_DB.prepare('SELECT 1 AS alive').first<{alive:number}>();
      databaseReadOk = Number(alive?.alive) === 1;
      if (databaseReadOk) {
        const rows = await env.MINGEAGLE_DB.prepare(
          "SELECT id, last_seen_at FROM scheduler_heartbeat WHERE id IN ('DISCOVERY','HUBSPOT_RECOVERY','FOLLOWUP') LIMIT 3"
        ).all<Pulse>();
        schedulerReadOk = true;
        const seen = new Map(rows.results.map(row => [row.id, row.last_seen_at]));
        for (const item of expected) scheduler[item.name] = pulseState(seen.get(item.id), item.maxAgeMinutes, now);
      }
    } catch {
      // Fail closed. Never echo a SQL error or binding configuration publicly.
    }
  }
  const schedulerOk = schedulerReadOk && Object.values(scheduler).every(status => status === 'healthy');
  const ok = databaseReadOk && schedulerOk;

  return Response.json({
    ok,
    service: 'MING EAGLE V2 API',
    databaseBinding,
    databaseReadOk,
    schedulerReadOk,
    scheduler,
    timestamp: new Date(now).toISOString(),
  }, { status: ok ? 200 : 503, headers });
};
