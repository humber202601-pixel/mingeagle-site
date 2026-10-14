# Stripe order acceptance — 14 October 2026

## Observed test result

The isolated Cloudflare Preview order used the same order-to-Checkout creation,
signed Stripe webhook reconciliation, payment records and fulfillment task code
as production. Stripe test mode was used throughout; no live charge occurred.

| Check | Observed result |
| --- | --- |
| Product | One P1-S3; USD 9.90 goods + USD 11.50 DDP shipping |
| Test order | `ME-RO-TEST-7E791AF16F9C` |
| Stripe Checkout | Completed, paid, USD 21.40, test mode |
| Automatic provider callback | `evt_1UQOPO6ggh6j2Fv0mxOAFUvw`, processed at `2026-10-14 09:23:41` UTC |
| D1 order | `PAID` / `PAID` |
| Payment receipt | Exactly one Stripe receipt, USD 21.40 |
| Fulfillment task | Exactly one |
| Customer order page | Received USD 21.40; outstanding USD 0.00 |
| Signed replay using the observed event ID | HTTP 200, `duplicate:true`; still one receipt and task |
| Signed synthetic wrong-amount event | USD 21.41 rejected with HTTP 409; totals unchanged |
| Production D1 | Zero Stripe payment records before and after acceptance |

The replay and wrong-amount probes were signed test simulations, not new Stripe
payments. Invalid signatures, cross-mode events and completed-but-unpaid session
reuse are additionally covered by the executable SQLite regression tests.

## Fixes retained

- Order return pages poll a dedicated, read-only Stripe status endpoint and show
  provider-neutral payment confirmation text.
- A completed unpaid Checkout Session waits for the provider callback instead of
  creating another payment attempt.
- Retail payment buttons and creation honor the retail activation switch.
- The existing public Turnstile sitekey is retained in Wrangler configuration so
  future deployments do not drop it. Its activation remains false pending a real
  browser challenge and inquiry acceptance test.

## Acceptance shutdown

The temporary Stripe test webhook was disabled through Stripe's API after the
successful acceptance. Its response confirmed test mode and `status:disabled`.
Wrangler now sets `STRIPE_ACCEPTANCE_ENABLED=false` and contains no acceptance
expiry. The test fixture handlers also reject production hosts and credentials,
require owner authentication for fixture creation, and check a secret Preview D1
marker. No acceptance token, signing secret or secure customer link is recorded
in this document or Git.

## Remaining live launch inputs

Technical test evidence does not provide real stock or a tax review. Live checkout
remains closed until the owner supplies available quantities, dispatch commitment,
returns arrangements and a supported destination-state tax collection policy.
The Preview synthetic NY policy is explicitly test-only and is never a production
tax approval. Live Stripe keys and the production endpoint's signing secret must
also be verified in their own mode before accepting customer charges.
