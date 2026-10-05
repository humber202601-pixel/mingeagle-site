const RELEASE = 'DISCOVERY_V10_1_PARALLEL_CITY_OSM_2026-10-05_2128';

export const onRequestGet: PagesFunction = async () => {
  return new Response(JSON.stringify({
    ok: true,
    release: RELEASE,
    component: 'mingeagle-app',
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
