# MING EAGLE — Stripe Checkout rollout checklist (October 2026)

## Architecture

- Stripe: MING EAGLE COMMERCE LLC credit/debit card acquiring.
- Airwallex: the LLC's existing USD business settlement bank account, not Airwallex Pay.
- www.mingeagle.com: public catalog on GitHub main.
- app.mingeagle.com: Cloudflare Pages backend, checkout, D1 orders and signed webhooks, branch v2-cloudflare.
- 1–9 total units: retail air shipping, subject to approved tax and stock conditions.
- 10+ units: wholesale quote and sea-shipping consent; no unattended direct payment.

## Cloudflare production setup

Open Cloudflare → Workers & Pages → mingeagle-site → Settings → Variables and Secrets → Production.

Secrets (NEVER commit or paste into chat):
- STRIPE_SECRET_KEY: matching test (sk_test_) or live (sk_live_) key.
- STRIPE_WEBHOOK_SECRET: whsec_ signing secret for this exact webhook endpoint.

Plain text flags:
- STRIPE_MODE: test initially, live only after acceptance tests.
- STRIPE_CHECKOUT_ENABLED: true only after all requirements are satisfied.
- STRIPE_TAX_POLICY_APPROVED: true only after applicable state sales tax policy and registrations are confirmed.
- RETAIL_CHECKOUT_ENABLED: true after retail fulfillment has been verified.
- RETAIL_STOCK_FULFILLMENT_APPROVED: true after SKUs, stock, delivery and packaging are confirmed.
- RETAIL_TAX_POLICY_APPROVED: true after US retail tax/shipping policy has been approved.

Existing TURNSTILE_ENABLED, TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY must be working for retail customer order creation.

Do not enable all flags merely to bypass controls. If any requirement remains unmet, keep the respective flag unset or false.

## Stripe Dashboard

1. Go to Developers / Webhooks (Workbench / Event destinations).
2. Configure HTTPS event endpoint:
   https://app.mingeagle.com/api/payments/stripe/webhook
3. Select event types:
   - checkout.session.completed
   - checkout.session.async_payment_succeeded
   - checkout.session.async_payment_failed
   - checkout.session.expired
4. Save endpoint, copy its specific signing secret to Cloudflare Secret STRIPE_WEBHOOK_SECRET.
5. Use test keys + test webhook in test mode, then live keys + live webhook in live mode.
6. Stripe Tax registration/collection must be assessed separately. The software does NOT automatically register sales tax obligations.

## Acceptance tests

1. Run npm ci, npm run test:quotes, npm run build and npm run test:discovery.
2. Build Cloudflare Pages Functions and test in isolated environment.
3. Validate 1–9 unit cart with multiple colors, backend freight repricing and quantity 10+ wholesale routing.
4. Validate signed webhook after paid test Checkout Session, wrong signature, wrong amount, duplicate and replay.
5. Confirm that payment redirect alone never marks an order PAID.
6. Confirm order update, matching payment receipt and fulfillment task exactly once.
7. Confirm refund, dispute and inventory workflows with staff before any live customer charge.
8. Confirm published privacy, terms, shipping, returns, destination taxes and correct statement descriptor.
9. Approve stock/tax compliance, deploy verified branch and then explicitly set activation flags.

## Notes

- Server uses Stripe-hosted Checkout; card data never hits this site.
- All charges derive from persisted CRM orders, not customer-provided amounts.
- Partially paid orders require a refreshed manual payment instruction.
- Refund and dispute event reconciliation is not yet automated in this patch.
- Stripe user account Payments/Payouts enabled is necessary but not sufficient for the website.
- Emergency kill switch: set STRIPE_CHECKOUT_ENABLED=false.
