interface Env {
  ADMIN_ACCESS_KEY?: string;
}

async function digest(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return new Uint8Array(hash);
}

async function sameSecret(a: string, b: string) {
  const [left, right] = await Promise.all([digest(a), digest(b)]);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const configured = context.env.ADMIN_ACCESS_KEY || '';
  if (!configured) {
    return Response.json({ ok: false, error: 'Admin access is not configured.' }, { status: 503 });
  }

  const supplied = context.request.headers.get('x-admin-key') || '';
  if (!supplied || !(await sameSecret(supplied, configured))) {
    return Response.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });
  }

  return context.next();
};
