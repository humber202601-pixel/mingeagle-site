interface Env {
  GEOAPIFY_API_KEY?: string;
  AIRWALLEX_CLIENT_ID?: string;
  AIRWALLEX_API_KEY?: string;
  AIRWALLEX_WEBHOOK_SECRET?: string;
  AIRWALLEX_ENV?: string;
}

const RELEASE = 'MINGEAGLE_GROWTH_ENGINE_V17_SECURITY_2026-10-06';
const DEPLOY_TRIGGER = 'V17_SECURITY_HARDENING';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const paymentEnvironment = ['sandbox','demo'].includes(String(env.AIRWALLEX_ENV || '').toLowerCase()) ? 'sandbox' : 'prod';
  return new Response(JSON.stringify({
    ok: true,
    release: RELEASE,
    component: 'mingeagle-app',
    geoapifyConfigured: Boolean(env.GEOAPIFY_API_KEY),
    payments: {
      airwallexConfigured: Boolean(env.AIRWALLEX_CLIENT_ID && env.AIRWALLEX_API_KEY),
      airwallexWebhookConfigured: Boolean(env.AIRWALLEX_WEBHOOK_SECRET),
      environment: paymentEnvironment,
    },
    features: {
      discovery: 'Geoapify + verified web',
      websiteInquiryBridge: true,
      websiteNativeFormPost: true,
      websiteInquiryEmailForward: true,
      websiteInquiryIdempotency: true,
      websiteInquiryRichFields: true,
      currentPublicSiteBaseline: 'V11',
      currentPublicProductsOnly: true,
      salesPreparation: true,
      smartOutreachDrafts: true,
      firstOutreachReviewQueue: true,
      batchEmailReview: true,
      approvalRequiredBeforeSend: true,
      gmailSend: true,
      gmailReplySync: true,
      replyToQuoteInquiry: true,
      replyQuantityExtraction: true,
      replyZipExtraction: true,
      quotePrefillFromInquiry: true,
      duplicateQuoteProtection: true,
      zeroPriceQuoteProtection: true,
      quoteLiveTotalPreview: true,
      customerReadyQuoteTerms: true,
      quoteSecureLink: true,
      quoteGmailDelivery: true,
      quoteFollowupAutomation: true,
      quoteToOrderConversion: true,
      airwallexHostedCheckout: true,
      airwallexPaymentWebhook: true,
      paymentAutoReconciliation: true,
      amountBasedPaymentGuidance: true,
      bankTransferGuidance: true,
      adminBruteForceRateLimit: true,
      adminNoStoreResponses: true,
      securityResponseHeaders: true,
      hstsOnApp: true,
      antiClickjacking: true,
      replyToSampleRequest: true,
      sampleWorkflow: true,
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
