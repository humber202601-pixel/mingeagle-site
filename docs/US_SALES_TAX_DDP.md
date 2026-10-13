# MING EAGLE: US sales tax and China-direct DDP sign-off (2026-10-14)

## Confirmed business facts (owner)
- US warehouse planned in Kentucky (KY), not yet operational; no LLC inventory has been confirmed there.
- For a single **P1-S7** item shipped China to US, US$14 shipping charge includes customs clearance and applicable import duties; the customer does not pay a separate import duty on delivery.
- Other product sizes and multi-unit DDP cost/coverage have NOT been confirmed.
- Retail: 1–9 units. Wholesale: 10+ via quote, sea freight with buyer consent.
- This is NOT proof that US state/local sales tax is included in the US$14. Duty/tariff and sales tax are different taxes.

## Tax obligations independent of Stripe
1. Determine registered LLC state, place of management, inventory ownership, workers/agents, trade shows and physical presence in each state. An LLC, US bank account, or future warehouse alone is not enough to determine every state obligation.
2. Count current and prior calendar-year sales by destination state, including all channels by the same seller and marketplace sales where applicable. Save the ledger and marketplace facilitator certificates.
3. Kentucky remote seller threshold: 200 or more KY sales OR US$100,000 in Kentucky receipts in current or previous calendar year (Kentucky DOR): https://taxanswers.ky.gov/Sales-and-Excise-Taxes/Pages/Remote-Retailers-Marketplace-Providers-FAQs.aspx
4. An operating warehouse holding owned inventory in KY can create physical nexus even below economic threshold. Before inventory arrives, review KY registration and inventory ownership.
5. Consult other states' specific official DOR requirements; thresholds, transaction counts, sourcing rules and sale definitions differ. Source reference: https://www.streamlinedsalestax.org/for-businesses/marketplace-sellers
6. If registration and collection are REQUIRED in any destination state, do not classify it as "no collection required": register first and integrate Stripe Tax or an approved tax calculation/filing provider. Do not simply charge 0%.
7. Product tax category must be tangible sporting goods, not an electronically supplied service. Resale / school exemptions require valid certificates where applicable.
8. Periodically review nexus, especially before the first KY warehouse inbound shipment.

## Zero-tax state gate (operational safeguard)
Backend requires `STRIPE_TAX_POLICY_APPROVED=true`, `RETAIL_TAX_POLICY_APPROVED=true` AND a *current, independently signed-off state-specific policy*:
`RETAIL_US_TAX_POLICY_JSON` (Secret in Cloudflare, never include in public code).
Example for format only — **DO NOT paste or activate without verifying facts**:
```json
{
  "reviewed_on": "2026-10-14",
  "review_reference": "CPA-reviewed evidence ID / tax workpaper ref",
  "states": {
    "KY": "NO_COLLECTION_REQUIRED"
  }
}
```
The example is a schema sample, not a statement that KY qualifies. Nonlisted states, collected/registered states, unknown states, reviews older than 31 days, missing references and malformed JSON are denied direct Checkout (quote instead). Review date, source, status and state must be based on actual evidence.

Stripe Checkout will not collect a different delivery state from the existing verified order after fixed shipping/tax amounts have been persisted.

## DDP safeguards
- A single China-origin **P1-S7** unit at an approved **$14** US shipping quote is confirmed seller-paid customs clearance and import duties; state sales tax separately reviewed.
- Other SKUs and multiple-item orders can receive an estimate but **cannot charge** through self-service Checkout until their DDP coverage/total is confirmed and the code is explicitly expanded.
- Do not promise universal delivery dates; 12–15 days is an estimate after dispatch.
- Collect logistics evidence: shipping contract, importer of record, duty payment, brokerage, return handling, remote area surcharges, claims, actual tracked delivery, and carrier terms.

## Tests
- Run `npm run test:quotes` (includes tax policy and DDP tests)
- Run `npm run build` and Cloudflare Pages Functions bundle
- Use mocked Stripe API / signed webhook tests in CI; no live charges, no live key in tests.
- Test mode requires separate sk_test_/rk_test_ key and whsec_ endpoint in isolated preview, never mix with production live credentials or production D1.
- Keep prod checkout closed until state review, stock, refunds, shipping and webhook acceptance are approved.

## Authoritative references
- KY DOR: https://revenue.ky.gov/Business/Sales-Use-Tax/Pages/default.aspx
- KY FAQ: https://taxanswers.ky.gov/Sales-and-Excise-Taxes/Pages/Remote-Retailers-Marketplace-Providers-FAQs.aspx
- Streamlined sales tax state/marketplace rules: https://www.streamlinedsalestax.org/for-businesses/marketplace-sellers
- Stripe Tax guidance: https://support.stripe.com/questions/charging-sales-tax-gst-or-vat-on-payments
- US Customs current duty regime: https://www.govinfo.gov/content/pkg/FR-2026-10-08/html/2026-20650.htm
