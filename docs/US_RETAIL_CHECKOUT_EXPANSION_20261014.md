# US retail checkout expansion, 2026-10-14

## Deployed UI and pending national activation

The checkout now uses a compact branded header, separate delivery form and order summary, exact server-priced merchandise/freight/total, and a horizontal terms checkbox with inline links. It accepts an address selection from all 50 US states plus DC; a state that is not yet card-eligible offers a confirmed-order quote instead. Selecting a state is not evidence that card payment has been enabled for it.

The existing OR/NH card route remains active. The nationwide remote-seller startup route is implemented but **disabled**, because `RETAIL_REMOTE_STARTUP_FACTS_JSON` is empty. Do not fabricate an owner declaration from general permission. In particular, existing statements establish a new October 2026 LLC with no sales, China-direct fulfillment, no current US warehouse and a KY registered-agent address used only for statutory services. They do not explicitly establish absence of every US employee, sales/returns agent, office or relevant related/predecessor sales.

To activate, obtain the missing owner facts and record a date/reference in the deployment configuration. This factual declaration is not a professional tax opinion, a permit, a product exemption or a permanent US zero-tax approval. Business-presence changes, outside-channel sales and predecessor/related-entity aggregation need reassessment.

## Implemented bounded startup rule

The required factual declaration has basis `REMOTE_SELLER_STARTUP`, source `OWNER_FACTUAL_DECLARATION`, China fulfillment, no US business presence, and zero baseline US direct/marketplace/related sales and orders. It has a 31-day factual review lifetime, matching the project's existing non-government policy review interval. Never fill these values before the owner has confirmed the actual facts.

This route permits all 50 states and DC only while the ledger is within **150 total orders and USD 50,000 gross**. These are conservative engineering review limits below the reviewed economic-nexus rules, not statutory thresholds. They are not estimates of how much sales tax is due. No fake registration is created and no tax is collected without authority. Buyer use-tax duties may exist separately.

Readiness, new-order creation and Stripe session creation all recheck the rule. Count all paid history and active unpaid retail reservations across destinations, include original gross after refunds, reject unknown currency/DB failures, and release expired unpaid reservations. Migration 0014 enforces the count and gross limits at the final insert of the atomic checkout batch; concurrent submissions cannot overrun an earlier read. Apply the migration before activating this route. Reconcile exact order/session/webhook amounts under the unchanged payment-safety checks.

Only the existing owner-confirmed one-unit P1-S3/P1-S7 DDP prices are eligible. This work does not fabricate import-duty-inclusive freight for other SKUs or 2–9-item carts.

## Primary sources reviewed on 2026-10-14

- Streamlined Sales Tax Governing Board remote-seller guidance and linked state rules: https://www.streamlinedsalestax.org/for-businesses/remote-seller-faqs/remote-seller-state-guidance . Distinguishes physical presence from economic thresholds and includes current state updates. Its headline historical date and some rows remain stale; use applicable state law where they conflict.
- Current Kentucky KRS 139.340, effective August 1, 2026: https://apps.legislature.ky.gov/law/statutes/statute.aspx?id=58190 . Physical/agency criteria are separate from the current remote-seller gross-receipts threshold exceeding USD 100,000. The former 200-transaction test was removed; some DOR/SST summaries still show it.
- Stripe Tax monitoring: https://docs.stripe.com/tax/monitoring . Primarily Stripe-processed activity; does not establish absence of physical nexus or automatically include all outside sales. This implementation does not claim Stripe Tax has been enabled.
- Stripe tax registration guidance: https://docs.stripe.com/tax/registering . Actual registration is required where collection obligations apply; adding API tax registration data is not government registration.
- Cloudflare widget sizing: https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/ . Normal/flexible require 300px; narrow forms use the compact size rather than overflowing.

Validation includes current/absent/stale/false owner declarations, national address states, real SQLite gross/count reservation limits and rollback, retained gross on refunds, exact merchandise/freight totals, desktop/mobile layout and terms alignment, and security-widget initialization after delayed readiness. No live customer charge is authorized or performed.
