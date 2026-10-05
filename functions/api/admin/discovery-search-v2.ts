interface Env { MINGEAGLE_DB: D1Database }

type Input = { stateCode?: string; customerType?: string; targetCount?: number | string };
type SourceResult = { ok?: boolean; found?: number; error?: string; mode?: string; provider?: string; checked?: number; verified?: number; note?: string; elapsedMs?: number; rawCount?: number; endpoint?: string; attempts?: number };

const RELEASE = 'DISCOVERY_V9_OSM_COMMERCIAL_2026-10-05_2105';
const clean = (value: unknown, max = 1000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const allowedState = /^[A-Z]{2}$/;
const allowedTypes = new Set(['BASKETBALL_TRAINING','BASKETBALL_GYM','YOUTH_CLUB','SPORTS_STORE']);

async function callSource(request: Request,path: string,body: Record<string, unknown>,timeoutMs: number): Promise<SourceResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = new URL(path, request.url);
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-admin-key': request.headers.get('x-admin-key') || '',
        'user-agent': 'MING-EAGLE-Discovery-Orchestrator/3.0',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const result = await response.json().catch(() => ({ ok: false, error: `HTTP ${response.status}` })) as SourceResult;
    if (!response.ok || !result.ok) throw new Error(result.error || `HTTP ${response.status}`);
    return result;
  } catch (error) {
    if (error instanceof Error && (error.name === 'AbortError' || /aborted/i.test(error.message))) {
      if (path.includes('discovery-web')) throw new Error('Web 实体验证源等待超时');
      throw new Error('地图商业实体源等待超时');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.MINGEAGLE_DB) return new Response(JSON.stringify({ ok: false, error: 'Database is not configured.', release: RELEASE }), { status: 503, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

  try {
    const input = await request.json() as Input;
    const stateCode = clean(input.stateCode, 2).toUpperCase();
    const customerType = clean(input.customerType, 80).toUpperCase();
    const targetCount = Math.min(100, Math.max(10, Math.round(Number(input.targetCount || 20))));

    if (!allowedState.test(stateCode)) return Response.json({ ok: false, error: '请选择有效的美国州。', release: RELEASE }, { status: 400, headers: { 'cache-control': 'no-store' } });
    if (!allowedTypes.has(customerType)) return Response.json({ ok: false, error: '不支持的客户类型。', release: RELEASE }, { status: 400, headers: { 'cache-control': 'no-store' } });

    const common = { stateCode, customerType, targetCount };
    const [mapResult, webResult] = await Promise.allSettled([
      callSource(request, '/api/admin/discovery-map-v2', common, 30000),
      callSource(request, '/api/admin/discovery-web-v6', common, 34000),
    ]);

    const map = mapResult.status === 'fulfilled' ? mapResult.value : null;
    const web = webResult.status === 'fulfilled' ? webResult.value : null;
    const mapError = mapResult.status === 'rejected' ? (mapResult.reason instanceof Error ? mapResult.reason.message : String(mapResult.reason)) : '';
    const webError = webResult.status === 'rejected' ? (webResult.reason instanceof Error ? webResult.reason.message : String(webResult.reason)) : '';
    const mapFound = Number(map?.found || 0);
    const webFound = Number(web?.found || 0);

    if (!map && !web) {
      return new Response(JSON.stringify({
        ok: false,
        error: `本次两个免费公开验证源都未成功。地图商业实体源：${mapError || '失败'}；Web核心源：${webError || '失败'}。`,
        release: RELEASE,
        sources: { map: false, web: false },
      }), { status: 502, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store, no-cache, must-revalidate, max-age=0' } });
    }

    try {
      await env.MINGEAGLE_DB.prepare(`DELETE FROM discovery_candidates WHERE status='IGNORED' AND crm_lead_id IS NULL AND source_evidence LIKE 'Quarantined by V6:%'`).run();
    } catch {
      // Non-critical cleanup.
    }

    const notes = [
      map?.note || (mapError ? `地图商业实体源未完成：${mapError}。` : ''),
      web?.note || (webError ? `Web核心源未完成：${webError}。` : ''),
      'Bing RSS 扩展源已停用：其商业搜索结果质量不稳定，不再参与客户入库。',
    ].filter(Boolean).join(' ');

    const body = {
      ok: true,
      release: RELEASE,
      found: mapFound + webFound,
      mapFound,
      mapChecked: Number(map?.checked || 0),
      mapVerified: Number(map?.verified || mapFound),
      mapRawCount: Number(map?.rawCount || 0),
      mapElapsedMs: Number(map?.elapsedMs || 0),
      mapEndpoint: map?.endpoint || '',
      mapAttempts: Number(map?.attempts || 0),
      mapError,
      webFound,
      webChecked: Number(web?.checked || 0),
      webVerified: Number(web?.verified || webFound),
      webProvider: web?.provider || web?.mode || '',
      webError,
      mode: 'VERIFIED_MULTI_SOURCE_V9_0',
      sources: { map: Boolean(map), web: Boolean(web) },
      note: notes || 'V9 双源验证已完成。',
    };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store, no-cache, must-revalidate, max-age=0', 'pragma': 'no-cache' } });
  } catch (error) {
    console.error('discovery_orchestrator_failed', error);
    return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : '客户发现失败。', release: RELEASE }), { status: 500, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  }
};