interface Env {
  MINGEAGLE_DB?: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  return Response.json({
    ok: true,
    service: 'MING EAGLE V2 API',
    databaseBinding: Boolean(env.MINGEAGLE_DB),
    timestamp: new Date().toISOString(),
  });
};
