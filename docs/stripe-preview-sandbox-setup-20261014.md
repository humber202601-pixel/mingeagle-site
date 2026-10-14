# Stripe Checkout — Cloudflare Preview Visual Sandbox

**Purpose**: let the MING EAGLE merchant safely open real Stripe-hosted **test-mode** Checkout pages for the two merchant-confirmed one-unit US DDP offers. No live charges, customer orders, state-tax conclusions, CRM writes or webhook reconciliations occur in this experiment.

## Production safety

- Only a **Cloudflare Pages branch preview host** with a subdomain of `.mingeagle-site.pages.dev` may call `POST /api/payments/stripe/sandbox`. The production `app.mingeagle.com` and bare `mingeagle-site.pages.dev` hosts always reject the route.
- Runtime must have `TEST_ENVIRONMENT=preview`, `STRIPE_MODE=test`, `STRIPE_SANDBOX_ENABLED=true`, a valid `sk_test_` or suitable `rk_test_` key, and a **separate independent admin access token**, minimum 32 characters.
- `STRIPE_SANDBOX_ACCESS_TOKEN` is not a Stripe API key; never use `rk_live_`, `sk_live_`, a production admin token, or send any API secret in chat, browser URL or code.
- Sandbox handler does not access `MINGEAGLE_DB`, and returns only server-issued `cs_test_` Checkout Sessions, validating Stripe domain and exact amount. Redirect back from Checkout is NOT a verified payment receipt.
- Product and shipping amounts are enforced server-side: one P1-S3 = USD 9.90 + 11.50 = 21.40; one P1-S7 = USD 14.90 + 14.00 = 28.90. US sales tax is *intentionally NOT modeled*. This test proves only the hosted card UI and Stripe test API.
- Real retail payment and automatic tax collection remain disabled; **do not set** `RETAIL_CHECKOUT_ENABLED`, `RETAIL_TAX_POLICY_APPROVED`, `STRIPE_TAX_POLICY_APPROVED`, `RETAIL_STOCK_FULFILLMENT_APPROVED` or any fake `NO_COLLECTION_REQUIRED` state in production.

## One-time setup in Stripe Dashboard (merchant only)

1. Visit https://dashboard.stripe.com/ and switch to a **sandbox / test mode**. See https://docs.stripe.com/keys.
2. From Developers → API keys, reveal or create a **test** secret key beginning `sk_test_` (or a restricted `rk_test_` with Checkout Sessions create permission). **Do not reuse any `rk_live_` key.**
3. No test webhook is necessary for this visual-only phase. Later, configure a separate *test-mode* webhook and `whsec_` for the full D1 order / payment reconciliation test; do not direct sandbox events to a live webhook endpoint.

## One-time setup in Cloudflare Pages (merchant only)

1. Open Cloudflare → Workers & Pages → **Pages** → project `mingeagle-site` → Settings → Variables and Secrets → **Preview** (NOT Production; do not confuse this Pages project with a similarly named Worker).
2. The nonsecret Preview flags `TEST_ENVIRONMENT=preview`, `STRIPE_MODE=test`, `STRIPE_SANDBOX_ENABLED=true` are already declared in the repository `wrangler.toml` under `[env.preview.vars]`. **Do not attempt to create duplicate plaintext variables in the dashboard** because Wrangler is the source of truth and subsequent deploys can overwrite dashboard variables.
3. In the **Preview environment only**, create these two **encrypted secrets** through the dashboard:
   - `STRIPE_SECRET_KEY` = a brand-new `sk_test_` key from Stripe test mode (never the existing `rk_live_` / `sk_live_` key).
   - `STRIPE_SANDBOX_ACCESS_TOKEN` = a different new random token of 32+ characters, unrelated to any Stripe/admin password. Save it privately for opening the test UI. Do not paste either secret in chats, screenshots, URLs or GitHub.
4. If Cloudflare shows **'a variable with this name already exists'** when adding `STRIPE_SECRET_KEY`, **cancel**, then verify the page header, resource type **Pages** and environment **Preview**. The live `STRIPE_SECRET_KEY` already exists under **Production** and MUST NOT be replaced or deleted. Preview and Production bindings are separate. If an entry truly already exists in Preview, inspect its TYPE/name only; do not blindly overwrite an unknown secret.
5. Check the key names and ensure Production entries, including existing live Stripe keys and webhook secret, remain unchanged.
4. Redeploy a preview branch after changes if required. Open the branch-specific `https://<preview-subdomain>.mingeagle-site.pages.dev/stripe-sandbox.html` URL. Enter the independent sandbox access token **only on this page**, then select P1-S3 or P1-S7.
5. Stripe Checkout must show **test mode** and the expected goods + shipping totals. Stripe documents the safe test card `4242 4242 4242 4242`, a future expiry date, and any 3-digit CVC; never enter a real card. https://docs.stripe.com/testing
6. A return to `stripe-sandbox.html?result=success` means only the browser returned from a test Checkout session, **not** that the CRM order was paid, sales tax was addressed, or a signed webhook was reconciled. For full end-to-end testing, use separate synthetic orders in Preview D1 and an authenticated, test-only webhook, after additional implementation and independent tax/stock gate review.

## Troubleshooting and acceptance

- 404 = non-preview hostname or sandbox disabled.
- 503 = test-mode secret key / independent access token not configured, or Stripe unavailable.
- 403 = origin or sandbox token mismatch.
- 502 = Stripe API error, unexpected live session, unsafe redirect URL or amount mismatch.
- Production remains closed even if a sandbox test works; Stripe account readiness and business compliance require separate acceptance.

Proof: `scripts/test-stripe-sandbox.mjs` mocks Stripe and verifies no provider call for disabled or unauthorized cases, no open sessions for unapproved SKUs, exact two totals and rejection of cross-mode responses. **CI does not count as a real Stripe-hosted payment test.**
