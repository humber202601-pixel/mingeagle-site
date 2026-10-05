interface Env { MINGEAGLE_DB: D1Database; GEOAPIFY_API_KEY?: string }

type Input = { stateCode?: string; customerType?: string; targetCount?: number | string };
type SourceResult = { ok?: boolean; found?: number; error?: string; mode?: string; provider?: string; checked?: number; verified?: number; note?: string; elapsedMs?: number; rawCount?: number; uniquePlaces?: number; websiteChecked?: number };

const RELEASE = 'DISCOVERY_V11_GEOAPIFY_FREE_2026-10-05_2145';
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
        'user-agent': 'MING-EAGLE-Discovery-Orchestrator/5.0',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const result = await response.json().catch(() => ({ ok: false, error: `HTTP ${response.status}` })) as SourceResult;
    if (!response.ok || !result.ok) throw new Error(result.error || `HTTP ${response.status}`);
    return result;
  } catch (error) {
    if (error instanceof Error && (error.name === 'AbortError' || /aborted/i.test(error.message))) {
      if (path.includes('geoapify')) throw new Error('Geoapify 免费地点源等待超时');
      if (path.includes('discovery-web')) throw new Error('Web 实体验证源等待超时');
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
    const [geoResult, webResult] = await Promise.allSettled([
      callSource(request, '/api/admin/discovery-geoapify-v1', common, 30000),
      callSource(request, '/api/admin/discovery-web-v6', common, 34000),
    ]);

    const geo = geoResult.status === 'fulfilled' ? geoResult.value : null;
    const web = webResult.status === 'fulfilled' ? webResult.value : null;
    const geoError = geoResult.status === 'rejected' ? (geoResult.reason instanceof Error ? geoResult.reason.message : String(geoResult.reason)) : '';
    const webError = webResult.status === 'rejected' ? (webResult.reason instanceof Error ? webResult.reason.message : String(webResult.reason)) : '';
    const geoFound = Number(geo?.found || 0);
    const webFound = Number(web?.found || 0);

    if (!geo && !web) {
      return new Response(JSON.stringify({
        ok: false,
        error: `本次两个发现源都未成功。Geoapify：${geoError || '失败'}；Web核心源：${webError || '失败'}。`,
        release: RELEASE,
        sources: { geoapify: false, web: false },
      }), { status: 502, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store, no-cache, must-revalidate, max-age=0' } });
    }

    try {
      await env.MINGEAGLE_DB.prepare(`DELETE FROM discovery_candidates WHERE status='IGNORED' AND crm_lead_id IS NULL AND source_evidence LIKE 'Quarantined by V6:%'`).run();
    } catch {
      // Non-critical cleanup.
    }

    const geoNote = geo?.note || (geoError === 'GEOAPIFY_API_KEY_NOT_CONFIGURED'
      ? 'Geoapify 免费 API Key 尚未配置；当前继续使用 Web 核心源。配置后可启用稳定地点发现。'
      : geoError ? `Geoapify 地点源未完成：${geoError}。` : '');
    const notes = [
      geoNote,
      web?.note || (webError ? `Web核心源未完成：${webError}。` : ''),
      'Overpass 与 Bing RSS 已退出主发现链路；V11 使用 Geoapify 免费配额 + 官网验证。',
    ].filter(Boolean).join(' ');

    const body = {
      ok: true,
      release: RELEASE,
      found: geoFound + webFound,
      geoapifyConfigured: Boolean(env.GEOAPIFY_API_KEY),
      geoFound,
      geoChecked: Number(geo?.checked || 0),
      geoVerified: Number(geo?.verified || geoFound),
      geoRawCount: Number(geo?.rawCount || 0),
      geoUniquePlaces: Number(geo?.uniquePlaces || 0),
      geoWebsiteChecked: Number(geo?.websiteChecked || 0),
      geoElapsedMs: Number(geo?.elapsedMs || 0),
      geoError,
      webFound,
      webChecked: Number(web?.checked || 0),
      webVerified: Number(web?.verified || webFound),
      webProvider: web?.provider || web?.mode || '',
      webError,
      mode: 'VERIFIED_MULTI_SOURCE_V11_0',
      sources: { geoapify: Boolean(geo), web: Boolean(web) },
      note: notes || 'V11 Geoapify + Web 双源验证已完成。',
    };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store, no-cache, must-revalidate, max-age=0', 'pragma': 'no-cache' } });
  } catch (error) {
    console.error('discovery_orchestrator_failed', error);
    return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : '客户发现失败。', release: RELEASE }), { status: 500, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  }
};
