# MING EAGLE B2B production acceptance

## Release topology

- Public marketing website: `https://www.mingeagle.com/`, deployed by `.github/workflows/deploy-pages.yml` from `main` using **GitHub Pages**. The built `deployment-version.json` must match the intended `main` SHA.
- Private CRM / backend: `https://app.mingeagle.com/`, deployed by Cloudflare Pages production branch `v2-cloudflare`. A Cloudflare **preview** does not prove GitHub Pages public release, and a marketing site merge does not update the CRM.
- Never change payment credentials, send fabricated buyer requests, create real orders, or claim public-vendor eligibility during smoke tests.

## B2B-first customer pathway

| Buyer | Public path | Form handoff |
| --- | --- | --- |
| School, PE and school district | `/for-schools.html` | `/inquiry.html?type=quote&customer=district` |
| Government and recreation agencies | `/procurement.html` | `/inquiry.html?type=quote&customer=government` |
| Corporate or organization purchasing | `/procurement.html#corporate` | `/inquiry.html?type=quote&customer=business` |
| Wholesale and distributors | `/wholesale.html` | `/inquiry.html?type=quote&customer=distributor` |
| Sample evaluation | `/inquiry.html?type=sample` | Sample request, with freight and payment confirmed before purchase |

The first navigation choices should promote wholesale, schools and institutions. Single-item prices and sample ordering remain available but secondary.

## Automated release gates

1. All build-time scripts pass, including `python scripts/check-live-public-crawl.py --self-test`.
2. The main sitemap includes **26** canonical HTML URLs; the translated sitemap includes **4** more, a combined **30** unique indexable URLs. When new pages are added, update the source manifest and every matching test before merging.
3. GitHub Pages deploy finishes; the public `/deployment-version.json` has the intended commit hash.
4. `node scripts/check-production-endpoints.cjs` verifies the live homepage, institutional procurement, wholesale, schools, product listing and inquiry HTML, as well as the CRM read-only health and public reference-price parity.
5. `node scripts/test-production-monitor.cjs` and `node scripts/check-conversion.cjs` pass. These tests do **not** create inquiries or send messages.

## Manual signoff on live `www`

- Compare public homepage H1 to “INDOOR SPORTS EQUIPMENT FOR ORGANIZATIONS.”; verify four organization buyer cards and obvious bulk quote CTA.
- Open government, school, business and wholesale inquiry links in a browser. Confirm the form is still navigable on mobile and the buyer type is preselected.
- Verify Turnstile does not leave a form permanently disabled. To confirm actual end-to-end delivery, use a pre-authorized staging tenant or an explicitly marked, non-real production test with a documented cleanup policy; GET-only automation is not sufficient.
- Confirm invoices, vendor onboarding, MOQ, lead time, documents and certifications are **quoted or verified**, not claimed as pre-approved.
- Verify that sample shopping does not claim checkout works until Stripe is actually validated.
- Keep marketing outreach and paid promotion suspended until this signoff.

## Incident from October 15, 2026

B2B PR #180 reached `main` but the public site still returned revision `31fbaaaf` when the expected revision was `50a2aacc`. The GitHub Pages deployment workflow included a stale **25/29 URL** check while the new institutional page changed the approved set to **26/30**. PR #181 corrected the stale deployment gate and added six-page production validation. Do not mark the public release complete until the live revision agrees with the new main SHA and the six-page GET checks pass.
