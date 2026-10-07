export async function ensureRuns(db:D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS discovery_run_candidates (
    run_id TEXT NOT NULL, candidate_id TEXT NOT NULL, was_created INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(run_id,candidate_id))`).run();
}
export async function recordResult(db:D1Database,runId:string|undefined,row:{id:string}|null,newId:string) {
  if(!row||!runId||!/^[a-f0-9-]{36}$/i.test(runId)) return;
  await db.prepare(`INSERT INTO discovery_run_candidates(run_id,candidate_id,was_created)
    VALUES(?,?,?) ON CONFLICT(run_id,candidate_id) DO UPDATE SET
    was_created=MAX(discovery_run_candidates.was_created,excluded.was_created)`)
    .bind(runId,row.id,Number(row.id===newId)).run();
}

