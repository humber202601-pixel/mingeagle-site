# MING EAGLE · Ten upgrades across four delivery stages (2026-10-13)

## Status protocol

- **Verified production** requires merged PR, provider production commit, and required CI, not merely code existence.
- **Code shipped / pending provider data** means code and schema deployed, but the end-to-end pipeline is not yet proven with real data.
- **Blocked by owner evidence** means the feature cannot honestly be called operational without account activation, verified supplier purchase terms, payment sandbox, identity enrollment or real browser acceptance.
- Cloudflare RUM *Visits* is provider-reported visits; GSC impressions/clicks use America/Los_Angeles date and may lag; CRM inquiry creation uses different dates. Never compute an ungrounded visit-to-order conversion number.

## Phase 1 · Indexing, traffic and incoming inquiries

| Upgrade | Actual state | Evidence / remaining gate |
|---|---|---|
| 1. Google indexing | 23 URLs registered in GSC Indexing Tracker; source URL Inspection: 11 indexed, 6 unknown, 6 discovered-not-indexed; official weekly check active | Public PR #57 merged/deployed 777defa (contextual crawlable links). Google needs to independently recrawl; newly discovered URLs not guaranteed to index |
| 2. Real visitor data | Cloudflare RUM tag is collecting; PR #55 native Worker sync source and CI merged. PR #56 admin partial-first-day/freshness shipped | Native Cron Worker not activated because scoped Analytics Token unavailable (9109). Existing ChatGPT daily safe sync remains active. At 2026-10-13 00:05 UTC the first COMPLETED provider UTC date 2026-10-12 (collection started only ~17:05 UTC) returned **1 provider Visit, 3 sampled pageload events**; D1 `web_analytics_daily` upsert and exact read-back were verified. UI admin auth read not independently re-checked. One-off planned first-day task disabled after manual success |
| 3. Website inquiry conversion | Four product detail CTA links already carried exact product; public PR #64 adds direct four-product quote links to catalog cards | PR #64 merged/deployed 436e3b4; actual conversion improvement requires enough real conversions and UTM attribution; no paid campaigns started |

## Phase 2 · Commercial RFQ and quotation safety

| Upgrade | Actual state | Evidence / remaining gate |
|---|---|---|
| 4. Smarter B2B quote / MOQ | Existing structured multi-line RFQ backend, MOQ/case-pack review, approved supplier cost floor and final manual quote approval | Issue #42 remains open. PR #68 merged and production deployed `1197a992` with read-only procurement preflight before quote release; backend still rechecks at final POST. Production supplier_purchase_terms: 0 actual rows at latest procurement gate check. **Cannot certify margins** without real approved supplier price tiers and delivery/packing costs |
| 5. GSC performance analysis | PR #58 merged/deployed a794c66, production D1 migration 0007 applied (gsc_search_daily), private admin daily endpoint and CRM display shipped | Daily GSC Wizard-to-D1 sync active. GSC latest settled-through 2026-10-10 showed only two zero-placeholder date rows; no fake snapshots inserted. PR #67 merged/deployed `aef18946`: accepts the canonical public www/apex URLs for manual CSV with strict English/Chinese parser and private URL rejection; migration 0008 created verified EMPTY manual import tables. Actual nonzero API day snapshot and genuine CSV reports are still pending |

## Phase 3 · Customer self-service, outreach safety and operations

| Upgrade | Actual state | Evidence / remaining gate |
|---|---|---|
| 6. Customer self-service/reorder | Existing high-entropy quote URL supports quote, payment/order and shipment tracking; PR #59 adds new repeat quote request without bearer token forwarding | Shipped f96ef88. Full multi-order login requires customer identity verification and privacy/access model; **not finished** |
| 7. Discovery quality | PR #62 shipped 6b5e621; aggregate-only CRM QA for sources, enrichment, website duplicates, email-field presence and internal grade | Existing discovery CRM candidates = 50; 35 email fields present. **Email present ≠ verified/consenting/deliverable**. No automatic outbound triggered |
| 8. Airwallex payment + fulfillment | Already present: secured quote acceptance, backend payment intent/webhook state machine, manual bank ledger and shipping status. Existing webhook safety tests | Merchant credentials/activation/webhooks not configured in production; online checkout disabled; no real transaction run. Must pass sandbox and owner payment approval |
| 9. Security / ops | PR #61 production deployed 72049e0: admin read-only readiness signals. Cloudflare Turnstile widget provisioned, exact three hosts allowlisted, production sitekey/secret securely stored and old bindings intact | TURNSTILE_ENABLED=false pending real form challenge/backup contact flow test; MFA identity enrollment still pending. Standalone D1 synthetic time-travel restoration drill **passed**; never restored prod |

## Phase 4 · International content and performance

| Upgrade | Actual state | Evidence / remaining gate |
|---|---|---|
| 10. Languages and performance | Public PR #60 deployed 6b86fe1 (eager-first/lazy-secondary/async image), PR #63 deployed 7f31cb7 (nine languages × 164 complete keys with placeholder safety) | Actual translations require native review; CrUX API not connected, hence no verified live speed measurement |

## Latest source-to-storage acceptance (2026-10-13 00:05 UTC)

- Cloudflare's first finished UTC source date `2026-10-12` returned one host group, `www.mingeagle.com`, `sum.visits=1`, `count=3`. The source started around 17:05 UTC, so this remains an **initial partial tracking day**, not a true full-day benchmark.
- The trusted Cloudflare connector validated the account, site tag, date, approved host, group cardinality and safe integer values, upserted **only** `web_analytics_daily` in production D1 and read back the exact date, tag, host, totals and source. No fake rows or raw visitor identifiers.
- The one-off first-day verification automation has been disabled to prevent duplicate runs. Existing daily ChatGPT task stays enabled; switching to native Cron still requires a minimum-scope Analytics read credential.
- GSC report `sc-domain:mingeagle.com` settled through 2026-10-10 has no nonzero clicks or impressions in its reported date rows; corresponding daily D1 rows are still absent, **not zero traffic**.
- PR #69 adds UTC observed-source freshness/initial-day caveats to the admin read-only readiness view; it never treats lack of a newer observed date as proof that cron failed.

## Production/environment separation

- Public website uses **GitHub Pages from `main`**, NOT Cloudflare Pages V2 preview builds. Official public acceptance: GitHub Actions `deploy` and `public-form-tests` on merge, and verified deployed SHA.
- CRM uses **Cloudflare Pages `v2-cloudflare`**, account `3426761cadca055d284c41a7fb65ee8d`, production D1 `mingeagle-v2` ID `8dfddbe8-f4ff-4f5e-bb5d-063ec3933814`.
- Never disable or replace current admin/Gmail/HubSpot secrets when adding unrelated configuration. Turnstile was staged with explicit disabled flag and after-patch verification of all prior bindings.
- CRM database remains system of record; do not submit unapproved email, release live payments, invent D1 traffic, or run a destructive production Time Travel restore as part of development.

## Open owner prerequisites

See [GitHub Issue #65](https://github.com/humber202601-pixel/mingeagle-site/issues/65). No need to share API secrets in chat/GitHub. Supplier cost source review, Airwallex merchant activation/sandbox, Turnstile real-browser test, customer identity/MFA enrollment and live CrUX measurement must be closed with provider evidence before claiming all ten upgrades are fully operational.
