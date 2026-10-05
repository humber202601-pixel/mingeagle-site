interface Env {
  AIRWALLEX_CLIENT_ID?: string;
  AIRWALLEX_API_KEY?: string;
  AIRWALLEX_ENV?: string;
  AIRWALLEX_WEBHOOK_SECRET?: string;
  BANK_TRANSFER_ENABLED?: string;
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const mode = String(env.AIRWALLEX_ENV || 'prod').toLowerCase();
  const airwallexConfigured = Boolean(env.AIRWALLEX_CLIENT_ID && env.AIRWALLEX_API_KEY);
  const webhookConfigured = Boolean(env.AIRWALLEX_WEBHOOK_SECRET);
  const bankTransferEnabled = ['1','true','yes','on'].includes(String(env.BANK_TRANSFER_ENABLED || '').toLowerCase());

  return Response.json({
    ok: true,
    airwallex: {
      configured: airwallexConfigured,
      environment: mode === 'sandbox' || mode === 'demo' ? 'sandbox' : 'prod',
      webhookConfigured,
      checkoutReady: airwallexConfigured && webhookConfigured,
    },
    bankTransfer: {
      enabled: bankTransferEnabled,
    },
    note: airwallexConfigured && webhookConfigured
      ? 'Online payment integration is configured.'
      : 'Online payment integration still requires server-side Airwallex secrets.',
  }, {
    headers: {
      'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
    },
  });
};
