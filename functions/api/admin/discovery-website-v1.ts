import { parseSearch, COMMERCIAL_TYPES } from '../../../shared/discovery';
import { allowedWebsite, ensureTables, verifyHit, save } from './discovery-web-v6';

interface Env { MINGEAGLE_DB: D1Database }

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.MINGEAGLE_DB) return Response.json({ ok: false, error: 'Database is not configured.' }, { status: 503 });
  let jobId='';
  try {
    const input = await request.json() as Record<string, unknown>;
    let parsed;
    try { parsed = parseSearch(input); } catch (error) { return Response.json({ ok: false, error: (error as Error).message }, { status: 400 }); }
    if (!COMMERCIAL_TYPES.has(parsed.customerType)) return Response.json({ ok: false, error: '官网批量核验支持商业客户类别；学校请使用学校专用发现。' }, { status: 400 });
    if (!Array.isArray(input.websiteUrls) || input.websiteUrls.length < 1 || input.websiteUrls.length > 10 || input.websiteUrls.some(url => typeof url !== 'string' || url.length > 1000)) {
      return Response.json({ ok: false, error: '请输入 1–10 个官网网址，每行一个。' }, { status: 400 });
    }
    const db = env.MINGEAGLE_DB;
    await ensureTables(db);
    const runId = crypto.randomUUID();jobId=runId;
    const domains = new Set<string>();
    const results: Array<{ url: string; status: string; name?: string; reason?: string }> = [];
    const urls: string[] = [];
    for (const value of input.websiteUrls as string[]) {
      const url = value.trim();
      if (!allowedWebsite(url)) { results.push({ url, status: 'REJECTED', reason: '非公开官网网址，或属于百科、新闻、社交及目录网站。' }); continue; }
      const domain = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
      if (domains.has(domain)) { results.push({ url, status: 'DUPLICATE', reason: '同一官网在本批只核验一次。' }); continue; }
      domains.add(domain); urls.push(url);
    }
    await db.prepare(`INSERT INTO discovery_jobs (id,state_region,customer_type,target_count,source_provider) VALUES (?,?,?,?, 'OFFICIAL_WEBSITE_IMPORT_V1')`).bind(runId, parsed.stateCode, parsed.customerType, urls.length).run();
    const verified = [];
    for (let i = 0; i < urls.length; i += 5) {
      const batch = urls.slice(i, i + 5);
      const hits = await Promise.allSettled(batch.map(url => verifyHit({ title: '', url, snippet: '', query: 'admin supplied official website', city: parsed.city }, parsed.customerType, parsed.stateCode)));
      for (let j = 0; j < batch.length; j++) {
        const hit = hits[j];
        if (hit.status === 'fulfilled' && hit.value) {
          verified.push(hit.value);
          results.push({ url: batch[j], name: hit.value.orgName, status: 'VERIFIED' });
        } else results.push({ url: batch[j], status: 'REJECTED', reason: '官网无法读取，或机构、所选业务和地区的公开证据不足；未入库。' });
      }
    }
    await save(db, verified, parsed.stateCode, parsed.customerType, 10, runId, 'OFFICIAL_WEBSITE_IMPORT_V1');
    const summary = await db.prepare(`SELECT COUNT(*) AS found, COALESCE(SUM(r.was_created),0) AS added FROM discovery_run_candidates r JOIN discovery_candidates c ON c.id=r.candidate_id WHERE r.run_id=? AND c.status<>'IGNORED'`).bind(runId).first<{ found: number; added: number }>();
    for (const result of results.filter(r => r.status === 'VERIFIED')) {
      const domain = new URL(result.url).hostname.toLowerCase().replace(/^www\./, '');
      const row = await db.prepare(`SELECT status FROM discovery_candidates WHERE source_key=?`).bind('web:' + domain).first<{ status: string }>();
      if (row?.status === 'IGNORED') { result.status = 'IGNORED'; result.reason = '已核验，但该官网已被忽略，保持忽略状态。'; }
    }
    const found = Number(summary?.found || 0), added = Number(summary?.added || 0);
    await db.prepare(`UPDATE discovery_jobs SET status='COMPLETED',result_count=?,completed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(found, runId).run();
    return Response.json({ ok: true, found, added, updated: found - added, verified: verified.length, results });
  } catch (error) { const message=error instanceof Error?error.message:'官网核验失败。';if(jobId)await env.MINGEAGLE_DB.prepare(`UPDATE discovery_jobs SET status='FAILED',error=?,completed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(message.slice(0,1000),jobId).run();return Response.json({ok:false,error:message},{status:502}); }
};
