# MING EAGLE AI Discovery — neutral benchmark and evidence protocol

Baseline created: **2026-10-13**. State: **NOT MEASURED**. This file and the prompt bank are evaluation infrastructure, **not evidence of AI mentions, endorsements, traffic, sales, or citations**.

## Scope
Test four business questions in each of five intent categories: household ball noise, indoor kids' movement, school PE purchases, basketball coaches/academies, and wholesale/customization. Includes four non-English market variants. Prompts are deliberately neutral and never include the brand or destination URL. The `targetUrl` value is the intended relevant page to evaluate, not a required recommendation.

## How to run a defensible weekly audit
- Run each unchanged prompt in an ordinary product interface for ChatGPT Search, Gemini, Copilot/Bing, Perplexity and Claude, where accessible and supported by that platform. Record exact platform/product, mode (search on/off), model when displayed, test timestamp in UTC, market/language, account locale, location if material, and whether signed in. A single observation cannot be generalized to all users.
- Review only outputs actually seen. Categorize the result as `CITED` if a genuine clickable source URL owned by MING EAGLE appears, `MENTIONED_NO_LINK` if only MING EAGLE appears without a verified source link, `NOT_MENTIONED` if a substantive answer omits the brand, or `UNAVAILABLE` when a real test could not be run. **Do not mark CITED just because the answer mentioned a brand or because a snippet resembled our copy.** Preserve original destination URL and whether the link resolves.
- Before every run, all prompt-bank entries are **NOT MEASURED**. Never replace an unavailable result with a 0 citation or report AI recommendations as facts without actual dated observations. Never use automated model prompting if the provider's terms or account permissions do not allow it.
- Preserve an auditable observation CSV outside the public website, containing only: `timestamp_utc,platform,mode,market,language,prompt_id,observation,status,cited_url,verified_website_url,reviewed_by`. Do not store customer conversations, account tokens, screenshots with personal information, or unrelated search data in a public repository.
- For summary reporting, state denominator: `CITED / (CITED + MENTIONED_NO_LINK + NOT_MENTIONED)`. Exclude `UNAVAILABLE` and `NOT MEASURED` from observed-mention and citation-rate denominators, and report each separately. A quoted sample result must not be presented as a platform-wide share or as paid ranking.
- Separate **measured AI citations** from **referral visits** (privacy-preserving Cloudflare RUM; it does not identify every AI referral) and **verified lead attribution** (consented CRM inquiry origin/UTM). Never calculate visitor-to-inquiry conversion by dividing independently sourced Cloudflare UTC visits by Pacific-timezone Google Search impressions.
- Record an official Bing AI Performance export separately when the property has been verified. Bing cites pages and sampled grounding queries across covered Microsoft experiences; these statistics are not equivalent to per-prompt screenshot tests.

## Buyer pages and constraints
The public prompt bank maps each buyer need to an existing real product page or the two people-first guides deployed in the first AI Discovery batch. No direct endorsements, fake reviews, impossible sound-reduction claims, medical/safety certification claims, unverifiable competitor comparisons or fictional purchase prices should be published.

## Official references
- OpenAI crawler controls: https://developers.openai.com/api/docs/bots
- Google Search AI site requirements: https://developers.google.com/search/docs/appearance/ai-features
- Bing AI Performance: https://www.bing.com/webmasters/help/ai-performance-9f8e7d6c
- Anthropic crawler documentation: https://support.anthropic.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler

## Next prerequisites, separate from this PR
Bing property verification; eligible retail product feed with factual price/stock (no fictitious B2B price); independent product noise-comparison demonstrations with test methods and limitations; owner consent for paid advertising and any recurring expense.

## 2026-10-13 · Actual target-language policy

The input prompt language and the page language are independently verified. Whenever a truly localized public guide matches an unbranded buyer intent, the `targetUrl` points to that language, e.g. Spanish school PE question `ME-AI-023` now targets `school-sports-equipment-es.html`. **The three other non-English prompts (ME-AI-021 DE apartment quiet basketball, ME-AI-022 FR indoor kids activity, and ME-AI-024 PT bulk sporting-goods sourcing) have no intent-matched published local-language guide yet**; they therefore carry explicit `targetLanguage: en` metadata as an English fallback. The school-oriented German/French/Portuguese pages are not interchangeable with parent/wholesale intent. The release checker asserts both that this is an explicit fallback and that the source HTML really declares the language recorded by the benchmark. Such fallback is a *proposed content target*, never evidence a German, French, or Portuguese model actually recommended the website.

## 2026-10-18 · Measured web visibility vs. unmeasured AI citations

A first-party, dated evidence checkpoint is in [AI visibility evidence checkpoint](marketing/ai-visibility-evidence-checkpoint-20261018.md). It records Google index coverage (17 of 31 URLs tracked), ordinary Google Search impressions (22 / 0 clicks for the stated historical window), official measurement capabilities, and the two current missing connections (Bing Webmaster API and GA4). These **are not AI citation or promotion statistics**. Google released dedicated generative AI reporting in 2026; examine that report separately before asserting AI Overview / AI Mode appearances. The 24-prompt independent answer benchmark remains **NOT MEASURED**.

## 2026-10-21 · Public buyer-page first-touch coverage
First-touch capture is now installed in the deployment build on every buyer-facing canonical or localized HTML page listed by the public XML sitemaps, not just the two original AI scenario guides. It runs only in the current browser session, does not send network requests or create cookies, and stores external referral origins only (not search paths or query strings); the existing CRM inquiry payload receives source attribution only when a user submits an inquiry. This is **not** evidence that ChatGPT, Gemini, Copilot, Claude or Perplexity recommended the site, and it is not a conversion count until an inquiry is actually accepted. Do not infer a visitor's AI-platform origin from an empty/direct referrer.
