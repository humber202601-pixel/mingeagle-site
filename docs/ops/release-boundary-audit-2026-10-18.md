# Production release boundary — verified 2026-10-18

## Observed, not inferred

- Cloudflare Pages project: `mingeagle-site`; connected custom domain: `app.mingeagle.com`.
- Cloudflare Pages **production branch**: `v2-cloudflare`; latest independently queried production deployment: `87735756-5716-458c-88fe-1513593d118e`, revision `6cc1b88590709412a3164061373b4bab606dd6e1`, final `deploy: success` (2026-10-18 05:00 UTC).
- Marketing `main` revision `d4c69d89b70b691adac144ff6bb3420bb25f4b22` generated Cloudflare Pages **preview** deployment `ebd578b2-d5e2-4c23-b5a4-b657b6c4a22e` (2026-10-18 14:10 UTC), **not** production.
- GitHub compare `main...v2-cloudflare` (both directions) returned HTTP 404, **No common ancestor**. Do not merge unrelated histories to synchronize websites.
- Production V2 has Vite/TypeScript + Pages Functions, Stripe tests and quote flow. Marketing main is a separate static site with `public/*.html`, product/catalog references and lightweight preview build.
- Marketing `public/sales-quantity-policy.json` describes **1–9 retail air parcel** and **10+ sea-freight RFQ**; marketing `public/retail-checkout-scope.json` explicitly says the live **backend** `https://app.mingeagle.com/api/retail/checkout-status` is authoritative. Static 51-jurisdiction list is **not** independent proof of live card eligibility or tax exemption.

## Release and acceptance checks

1. Map `www.mingeagle.com` public DNS/hosting independently; Cloudflare Pages' configured custom domain above does **not** prove `www` serves this project. Do not change DNS on guesses.
2. Verify live HTTP response, security headers, canonical URLs and actual assets for both `www` and `app` with an external trusted network. Distinguish checker DNS limitations from public outages.
3. Assert unchanged contract: retail 1–9 units only when backend checkout-status permits; ≥10 units require reviewed wholesale RFQ, buyer-accepted quote, explicit shipping and tax terms before Stripe Checkout. Never infer jurisdiction eligibility from static JSON alone.
4. Compare publicly displayed SKU/specification, dispatch and shipping claims with operational V2 records *without altering* actual orders, prices or tax flags.
5. Inspect authenticated, read-only B2B payment preflight and live Stripe receipt evidence per #316, not from order label `PAID`.
6. On any subsequent release: identify exact target site/branch, passing CI, preview URL, Cloudflare **production** deployment ID/commit, live-page probe, and (where relevant) authorized payment evidence. Record these as distinct facts.

## Safety / ownership

No DNS changes, promotion to production, Stripe charges/refunds, credential edits, tax-state flags, existing customer/order mutations, or force merges authorized by this note. Reference #330 (release boundary), #316 (live payment reconciliation), #314 (sample margin). This file is documentation, not a claim of production behavior.
