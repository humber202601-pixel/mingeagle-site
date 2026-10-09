import { addToCrm } from '../functions/api/admin/discovery';
import { syncCrm } from '../functions/api/admin/discovery-enrich';

type Candidate = { id: string; status: string; source_provider: string; website: string; raw_json: string; crm_lead_id: string };
const verifiedProviders = new Set(['WEB_SEARCH_VERIFIED_V6', 'OFFICIAL_WEBSITE_IMPORT_V1', 'PUBLIC_SOURCE_VERIFIED_V1']);

// Only official-website-verified businesses enter CRM. This never starts outreach.
export async function intakeVerifiedCandidates(db: D1Database, ids: string[], verifiedNow = false) {
  const result = { imported: 0, matched: 0, review: 0, failed: 0, leadIds: [] as string[], warnings: [] as string[] };
  for (const id of new Set(ids)) {
    const candidate = await db.prepare('SELECT * FROM discovery_candidates WHERE id=?').bind(id).first<Candidate>();
    if (!candidate || candidate.status === 'IGNORED') { result.review++; continue; }
    let proof: Record<string, unknown> = {};
    try { proof = JSON.parse(candidate.raw_json || '{}'); } catch { /* Legacy records need review. */ }
    const verified = verifiedNow || verifiedProviders.has(candidate.source_provider)
      || (candidate.source_provider === 'GEOAPIFY_V1' && proof.verifiedByWebsite === true)
      || (candidate.source_provider === 'GEOAPIFY_SCHOOL_V1' && proof.verified === true);
    if (!candidate.website || !verified) { result.review++; continue; }
    try {
      if (candidate.crm_lead_id) {
        const protectedLead = await db.prepare(`SELECT l.id FROM leads l LEFT JOIN contacts ct ON ct.id=l.primary_contact_id
          WHERE l.id=? AND (l.status IN ('LOST','NOT_FIT','DO_NOT_CONTACT','NOT_INTERESTED') OR ct.do_not_contact=1)`)
          .bind(candidate.crm_lead_id).first();
        if (protectedLead) { result.review++; continue; }
      }
      const imported = await addToCrm(db, id);
      if (imported.alreadyAdded) result.matched++; else result.imported++;
      result.leadIds.push(imported.leadId);
      try { await syncCrm(db, id); }
      catch { result.warnings.push(`${id}: 客户已入库，联系人同步需重试。`); }
    } catch (error) {
      result.failed++;
      result.warnings.push(`${id}: ${error instanceof Error ? error.message : '自动入库未完成，请重试。'}`);
    }
  }
  result.leadIds = [...new Set(result.leadIds)];
  return result;
}

export async function intakeVerifiedRun(db: D1Database, runId: string) {
  const rows = await db.prepare('SELECT candidate_id FROM discovery_run_candidates WHERE run_id=?').bind(runId).all<{ candidate_id: string }>();
  return intakeVerifiedCandidates(db, rows.results.map(row => row.candidate_id));
}
