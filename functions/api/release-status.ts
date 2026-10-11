// Public non-sensitive release marker to distinguish source CI from deployed Cloudflare Pages.
const RELEASE_ID = 'discovery-official-site-validation-20261011-v4';
export const onRequestGet: PagesFunction = async () => Response.json({
  ok: true,
  application: 'mingeagle-v2',
  releaseId: RELEASE_ID,
  capabilities: {
    retailQuoteDraft: true,
    wholesaleMultiLineQuoteDraft: true,
    wholesaleUnitPricesRequireManualInput: true,
    wholesaleRetailPriceComparison: true,
    customerQuoteDynamicSavings: true,
    quoteAcceptanceReconciliation: true,
    paymentIntentOwnershipCheck: true,
    checkoutRequiresExplicitEnable: true,
    searchConsoleSnapshotImport: true,
    searchConsoleSnapshotRankings: true,
    seoOpportunitySuggestions: true,
    discoveryDirectoryOfficialSiteRecheck: true,
    discoveryCandidateWebsiteFiltering: true
  },
  note: 'Capabilities identify deployed code only. This does not verify credentials, database health or live payments.'
}, {headers: {'cache-control': 'no-store, max-age=0','x-content-type-options':'nosniff'}});
