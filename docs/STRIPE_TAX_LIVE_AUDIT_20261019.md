# Stripe Tax Live configuration audit — 2026-10-19

## Scope and evidence
This is a read-only configuration snapshot for MING EAGLE COMMERCE LLC's connected Stripe Live account, checked on 2026-10-19 UTC. No payment, tax registration, customer, order, or Stripe Tax settings were modified.

| Check | Observed result | What it does **not** prove |
|---|---|---|
| `GET /v1/tax/registrations?status=active&limit=100` | `data=[]`, `has_more=false`; zero active US state sales-tax registrations returned | It does not establish that the merchant has no legal obligation to register or collect tax. |
| `GET /v1/tax/settings` | `livemode=true`, `status=active`, default tax behavior `exclusive`, default tax code `txcd_99999999` | Active settings do not establish a state permit, nexus opinion, or authority to collect tax. |
| Stripe Tax head-office address | Configured in Kentucky; it matches the registered-agent address the owner previously described as compliance/service-of-process mail only | The API cannot determine whether that is the correct business location for tax purposes. Do not change it without a verified address and professional/Stripe review. |
| `GET /v1/_unstable/tax/monitoring/thresholds` | `computed_at=null`, `locations=[]`, `unattributed_locations=[]` | No timestamp means no verified freshness. Empty results must not be treated as proof of no nexus, no sales, or no tax obligation. |

## Required next steps
1. Confirm with a qualified US multi-state sales-tax adviser (and Stripe support if needed) which address belongs in Stripe Tax's head-office field. Do not substitute the registered-agent address for the actual tax location by assumption, and do not edit it until the correct address is verified.
2. Obtain a documented state-by-state nexus/registration decision based on the actual entity, business operations, inventory, agents/returns handling, and current/prior-year sales sourced by destination. This snapshot is not a legal nexus assessment.
3. Register with the appropriate government tax authority before adding the corresponding Stripe Tax Registration object where collection is required. Stripe expressly states that adding the object does not register the business with the government: https://docs.stripe.com/api/tax/registrations/create
4. After registration, add only verified jurisdictions and test automatic tax against the buyer's complete delivery address and the actual goods/shipping tax codes. A state allowlist for technical Checkout availability is not a tax-registration list.
5. For existing wholesale orders, obtain a buyer-confirmed ship-to address, verify DDP freight and duty coverage for the actual SKU/quantity, record the applicable tax basis, and send a new reviewed quote for the buyer to accept. Never change an unpaid order to PAID or reuse the old acceptance.

## Kentucky law note
Effective August 1, 2026, HB 757 (2026 Ky. Acts ch. 161), §16 amended KRS 139.340(2)(g) to remove the former 200-transaction economic-nexus test for remote retailers. The current remote-seller economic threshold is gross receipts from relevant sales into Kentucky exceeding US$100,000 in the current or prior calendar year. Physical/agency nexus is separate. See the enacted Act, §§16 and 135: https://apps.legislature.ky.gov/law/acts/26RS/documents/0161.pdf and bill record: https://apps.legislature.ky.gov/record/26rs/hb757.html. Kentucky DOR FAQ content may lag the amended statute.

## Safety boundary
This audit is read-only. No live registration was fabricated; no payment switch, Tax setting, DNS record, customer record, or order was changed. The next legitimate state-tax action depends on verified business facts and the owner's qualified tax advice, not on the goal of maximizing checkout coverage.
