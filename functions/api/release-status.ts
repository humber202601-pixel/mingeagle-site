// Public non-sensitive release marker to distinguish source CI from deployed Cloudflare Pages.
const RELEASE_ID = 'retail-order-payment-gate-20261011-v1';
export const onRequestGet: PagesFunction = async () => Response.json({
  ok: true,
  application: 'mingeagle-v2',
  releaseId: RELEASE_ID,
  capabilities: {
    retailQuoteDraft: true,
    quoteAcceptanceReconciliation: true,
    paymentIntentOwnershipCheck: true,
    checkoutRequiresExplicitEnable: true
  },
  note: 'Capabilities identify deployed code only. This does not verify credentials, database health or live payments.'
}, {headers: {'cache-control': 'no-store, max-age=0','x-content-type-options':'nosniff'}});
