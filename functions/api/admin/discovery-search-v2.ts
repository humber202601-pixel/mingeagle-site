interface Env { MINGEAGLE_DB: D1Database }

type Input = { stateCode?: string; customerType?: string; targetCount?: number | string };
type SourceResult = { ok?: boolean; found?: number; error?: string; mode?: string; provider?: string; checked?: number; verified?: number; note?: string; elapsedMs?: number };

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
        'user-agent': 'MING-EAGLE-Discovery-Orchestrator/2.2',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const result = await response.json().catch(() => ({ ok: false, error: `HTTP ${response.status}` })) as SourceResult;
    if (!response.ok || !result.ok) throw new Error(result.error || `HTTP ${response.status}`);
    return result;
  } catch (error) {
    if (error instanceof Error && (error.name === 'AbortError' || /aborted/i.test(error.message))) {
      if (path.includes('expansion')) throw new Error('Web 扩展源等待超时');
      if (path.includes('discovery-web')) throw new Error('Web 实体验证源等待超时');
      throw new Error('地图官网验证源等待超时');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.MINGEAGLE_DB) return Response.json({ ok: false, error: 'Database is not configured.' }, { status: 503 });

  try {
    const input = await request.json() as Input;
    const stateCode = clean(input.stateCode, 2).toUpperCase();
    const customerType = clean(input.customerType, 80).toUpperCase();
    const targetCount = Math.min(100, Math.max(10, Math.round(Number(input.targetCount || 20))));

    if (!allowedState.test(stateCode)) return Response.json({ ok: false, error: '请选择有效的美国州。' }, { status: 400 });
    if (!allowedTypes.has(customerType)) return Response.json({ ok: false, error: '不支持的客户类型。' }, { status: 400 });

    const common = { stateCode, customerType, targetCount };
    const [mapResult, webResult, expansionResult] = await Promise.allSettled([
      callSource(request, '/api/admin/discovery-map-v2', common, 30000),
      callSource(request, '/api/admin/discovery-web-v6', common, 34000),
      callSource(request, '/api/admin/discovery-web-expansion-v4', common, 32000),
    ]);

    const map = mapResult.status === 'fulfilled' ? mapResult.value : null;
    const web = webResult.status === 'fulfilled' ? webResult.value : null;
    const expansion = expansionResult.status === 'fulfilled' ? expansionResult.value : null;
    const mapError = mapResult.status === 'rejected' ? (mapResult.reason instanceof Error ? mapResult.reason.message : String(mapResult.reason)) : '';
    const webError = webResult.status === 'rejected' ? (webResult.reason instanceof Error ? webResult.reason.message : String(webResult.reason)) : '';
    const expansionError = expansionResult.status === 'rejected' ? (expansionResult.reason instanceof Error ? expansionResult.reason.message : String(expansionResult.reason)) : '';
    const mapFound = Number(map?.found || 0);
    const webFound = Number(web?.found || 0);
    const expansionFound = Number(expansion?.found || 0);

    if (!map && !web && !expansion) {
      return Response.json({
        ok: false,
        error: `本次三个免费公开数据源都未成功。地图源：${mapError || '失败'}；Web核心源：${webError || '失败'}；Web扩展源：${expansionError || '失败'}。`,
        sources: { map: false, web: false, expansion: false },
      }, { status: 502 });
    }

    try {
      await env.MINGEAGLE_DB.prepare(`DELETE FROM discovery_candidates WHERE status='IGNORED' AND crm_lead_id IS NULL AND source_evidence LIKE 'Quarantined by V6:%'`).run();
    } catch {
      // Cleanup is non-critical and must never block discovery results.
    }

    const notes = [
      map?.note || (mapError ? `地图源未完成：${mapError}。` : ''),
      web?.note || (webError ? `Web核心源未完成：${webError}。` : ''),
      expansion?.note || (expansionError ? `Web扩展源未完成：${expansionError}。` : ''),
    ].filter(Boolean).join(' ');

    return Response.json({
      ok: true,
      found: mapFound + webFound + expansionFound,
      mapFound,
      mapChecked: Number(map?.checked || 0),
      mapVerified: Number(map?.verified || mapFound),
      mapElapsedMs: Number(map?.elapsedMs || 0),
      mapError,
      webFound,
      webChecked: Number(web?.checked || 0),
      webVerified: Number(web?.verified || webFound),
      webProvider: web?.provider || web?.mode || '',
      webError,
      expansionFound,
      expansionChecked: Number(expansion?.checked || 0),
      expansionVerified: Number(expansion?.verified || expansionFound),
      expansionError,
      mode: 'VERIFIED_MULTI_SOURCE_V6_6',
      sources: { map: Boolean(map), web: Boolean(web), expansion: Boolean(expansion) },
      note: notes || 'V6.6 三源验证已完成。',
    });
  } catch (error) {
    console.error('discovery_orchestrator_failed', error);
    return Response.json({ ok: false, error: error instanceof Error ? error.message : '客户发现失败。' }, { status: 500 });
  }
};