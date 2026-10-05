interface Env { GEOAPIFY_API_KEY?: string }

const RELEASE = 'MINGEAGLE_GROWTH_ENGINE_V12_2026-10-05_2208';
const DEPLOY_TRIGGER = '2026-10-05T22:08:00+08:00';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  return new Response(JSON.stringify({
    ok: true,
    release: RELEASE,
    component: 'mingeagle-app',
    geoapifyConfigured: Boolean(env.GEOAPIFY_API_KEY),
    features: {
      discovery: 'Geoapify + verified web',
      salesPreparation: true,
      smartOutreachDrafts: true,
      firstOutreachReviewQueue: true,
      gmailSend: true,
      gmailReplySync: true,
      followupAutomation: true,
    },
    deployTrigger: DEPLOY_TRIGGER,
    timestamp: new Date().toISOString(),
  }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
      'pragma': 'no-cache',
    },
  });
};
