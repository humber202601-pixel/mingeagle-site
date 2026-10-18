# MING EAGLE — AI search visibility evidence checkpoint

**Checked:** 2026-10-18 (UTC). **Scope:** first-party search and account connection diagnostics, not a cross-platform AI recommendation test.

This document distinguishes **search crawlability**, **search index status**, **normal Google impressions**, **AI answer citations**, **AI-referred site sessions**, and **verified B2B leads**. They are not interchangeable. All of the figures below are historical evidence, not live scores or guaranteed outcomes.

## Verified observations

| Dimension | Observed state | Evidence and limitations |
| --- | --- | --- |
| GSC indexing tracker | 31 public URLs tracked; 17 indexed; 14 not indexed; no tracker warning/error | Tracker last checked 2026-10-18 09:38:33 UTC. Coverage can change; independently recheck in Search Console. |
| Google organic visibility | 22 impressions, 0 clicks | Google Search Console web search, 2026-09-18–2026-10-15, latest settled data reported through 2026-10-16. Search visibility is **not** AI referral or citation. |
| Query inventory | 4 non-anonymized queries, totaling 5 impressions within the 22 total | `basketball with logo` (1), `basketballs for schools` (2), `custom team basketballs with logo` (1), `logo basketballs` (1); other search-query impressions are not individually shown due to Search Console privacy filtering. |
| Google search appearance | `PRODUCT_SNIPPETS`: 4 impressions, 0 clicks | Product-snippet appearance is **not** proof of AI Overview / AI Mode appearance. |
| AI Overview / AI Mode dedicated report | **NOT READ / NOT VERIFIED** | Google announced the Search Generative AI performance reports June 2026, with broad rollout by August 2026. The currently connected API output provided only `PRODUCT_SNIPPETS`, not an AI-specific total. Do not infer zero AI appearances. |
| Bing/Copilot AI Performance | **NOT CONNECTED / NOT MEASURED** | GSC Wizard's Bing Webmaster connection lacks the Bing API key. Bing supports cited-page counts and grounding-query reports, but no MING EAGLE figures were retrieved. |
| GA4 traffic from ChatGPT, Perplexity, Copilot, Gemini, Claude and other assistants | **NOT CONNECTED / NOT MEASURED** | The current GSC Wizard account has no Google Analytics authorization/scope. GA4 must be connected to the same GSC Wizard account and correct property before querying the AI-referred session report. This does not imply zero visits. |
| Independent AI answer citation audit | **NOT MEASURED** | `data/ai-discovery-benchmark.json` holds 24 neutral prompts only; no actual model outputs and clickable source URLs have been collected. A proposed target URL is not a recommendation. |
| Existing source assets | **PUBLISHED FIRST-PARTY INFORMATION** | Site provides `robots.txt`, `llms.txt`, `ai-product-facts.json`, `wholesale-product-facts.csv`, a school RFQ guide, and buyer-facing product detail pages. First-party resources are not independent reviews or endorsements. |

## Priority business question

> When an unfamiliar US school purchasing officer, youth basketball coach, recreation director, distributor or retailer asks an AI assistant which quiet indoor basketballs to source in bulk, does the assistant show MING EAGLE **with a real clickable mingeagle.com link**?

Until a dated, reproducible answer or official platform citation report confirms this, status remains **NOT MEASURED**, rather than `0%` or `YES`.

## Evidence collection order

1. **Official Google AI visibility:** Open the verified Search Console property and review the Search Generative AI performance report (Search and Discover where present). Record date range, AI impressions and any available landing page metrics. Do not classify ordinary product snippets as AI.
2. **Microsoft AI citation statistics:** Connect the verified MING EAGLE Bing Webmaster property to the same GSC Wizard account with a Bing Webmaster API key; read Bing's AI Performance cited pages and grounding queries directly in Bing Webmaster Tools. A successful IndexNow notification is not the same as an AI citation.
3. **True AI-referred visitors:** Authorize GA4 in the connected GSC Wizard account and link the correct public-site property. Use the GA4 AI-referral breakdown, noting that Google's AI Mode/Overviews traffic can be indistinguishable from regular Google organic traffic and that referrer data will miss some sessions.
4. **Neutral real-world prompt audit:** Keep the 24 existing prompts unchanged. Test ordinary product UIs of ChatGPT Search, Gemini, Bing/Copilot, Perplexity, Claude where accessible. Store dated outputs, mode, locale and **verified clicked citation URL** in a non-public evidence store, with clear `CITED`, `MENTIONED_NO_LINK`, `NOT_MENTIONED`, `UNAVAILABLE` categories. Never claim a result without seeing it.
5. **Leads and buyers:** Separately correlate voluntary inquiry source tags, B2B quotes and **confirmed Stripe payment receipts**. Do not equate search impressions, bot requests, AI mentions, or unverified D1 order markers with successful paid orders.

## Correct publication policy

- Do not state that OpenAI, Google, Microsoft, Anthropic or Perplexity formally recommends, partners with, or endorses MING EAGLE.
- Do not create fake testimonials, independent acoustic tests, certifications, reviews, school vendor approvals, supplier awards or measured decibel figures.
- Retain clear distinction between standard retail sample purchasing (1–9 units when eligible) and 10+ wholesale RFQ, where actual price, freight, customs and tax terms require review.
- Original photos, real test methodology, merchant disclosures and authoritative third-party references would strengthen buyer trust; they are future evidence tasks, not already delivered facts.
- This is a **dated snapshot**. Never silently update its observed counts: create a new dated checkpoint and compare on the same date ranges.

## Official reference material

- Google AI site eligibility and normal SEO: https://developers.google.com/search/docs/appearance/ai-features
- Google Search Generative AI reporting announcement: https://developers.google.com/search/blog/2026/06/gen-ai-performance-reports
- Bing AI Performance overview: https://www.bing.com/webmasters/help/ai-performance-9f8e7d6c
- OpenAI web crawler: https://developers.openai.com/api/docs/bots

**Operational note:** Search and first-party website evidence was available as of the checkpoint; Bing Webmaster and GA4 measurement connections were not. Do not turn unmeasured or unavailable figures into numerical zero.
