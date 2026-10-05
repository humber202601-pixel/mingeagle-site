interface Env { MINGEAGLE_DB: D1Database }

type Input = { stateCode?: string; customerType?: string; targetCount?: number | string };
type SourceResult = { ok?: boolean; found?: number; error?: string; mode?: string; provider?: string; checked?: number; verified?: number };

const clean = (value: unknown, max = 1000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const allowedState = /^[A-Z]{2}$/;
const allowedTypes = new Set(['BASKETBALL_TRAINING','BASKETBALL_GYM','YOUTH_CLUB','SPORTS_STORE']);

async function callSource(
  request: Request,
  path: string,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<SourceResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = new URL(path, request.url);
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-admin-key': request.headers.get('x-admin-key') || '',
        'user-agent': 'MING-EAGLE-Discovery-Orchestrator/1.2',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const result = await response.json().catch(() => ({ ok: false, error: `HTTP ${response.status}` })) as SourceResult;
    if (!response.ok || !result.ok) throw new Error(result.error || `HTTP ${response.status}`);
    return result;
  } catch (error) {
    if (error instanceof Error && (error.name === 'AbortError' || /aborted/i.test(error.message))) {
      throw new Error(path.includes('discovery-web') ? 'Web 验证源等待超时' : '地图源等待超时');
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
    const [mapResult, webResult] = await Promise.allSettled([
      callSource(request, '/api/admin/discovery', { action: 'SEARCH', ...common }, 8000),
      callSource(request, '/api/admin/discovery-web-v2', common, 26000),
    ]);

    const map = mapResult.status === 'fulfilled' ? mapResult.value : null;
    const web = webResult.status === 'fulfilled' ? webResult.value : null;
    const mapFound = Number(map?.found || 0);
    const webFound = Number(web?.found || 0);

    if (!map && !web) {
      const mapError = mapResult.status === 'rejected' ? (mapResult.reason instanceof Error ? mapResult.reason.message : String(mapResult.reason)) : '';
      const webError = webResult.status === 'rejected' ? (webResult.reason instanceof Error ? webResult.reason.message : String(webResult.reason)) : '';
      return Response.json({
        ok: false,
        error: `本次两个免费公开数据源都未成功。地图源：${mapError || '失败'}；Web验证源：${webError || '失败'}。`,
        sources: { map: false, web: false },
      }, { status: 502 });
    }

    return Response.json({
      ok: true,
      found: mapFound + webFound,
      mapFound,
      webFound,
      webChecked: Number(web?.checked || 0),
      webVerified: Number(web?.verified || webFound),
      webProvider: web?.provider || web?.mode || '',
      mode: 'VERIFIED_MULTI_SOURCE',
      sources: { map: Boolean(map), web: Boolean(web) },
      note: !map ? '地图源未返回，本次由严格验证后的 Web 官网候选完成。' : !web ? 'Web 验证源未返回，本次由地图源完成。' : '地图源与严格验证后的 Web 官网候选均已返回。',
    });
  } catch (error) {
    console.error('discovery_orchestrator_failed', error);
    return Response.json({ ok: false, error: error instanceof Error ? error.message : '客户发现失败。' }, { status: 500 });
  }
};