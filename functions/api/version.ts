interface Env { GEOAPIFY_API_KEY?: string }

const RELEASE = 'MINGEAGLE_GROWTH_ENGINE_V15_CURRENT_SITE_BRIDGE_2026-10-05';
const DEPLOY_TRIGGER = 'V15_CURRENT_SITE_BRIDGE';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  return new Response(JSON.stringify({
    ok: true,
    release: RELEASE,
    component: 'mingeagle-app',
    geoapifyConfigured: Boolean(env.GEOAPIFY_API_KEY),
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
      quoteSecureLink: true,
      quoteGmailDelivery: true,
      quoteFollowupAutomation: true,
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