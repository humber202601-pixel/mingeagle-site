# AI platform referral attribution in MING EAGLE CRM
Implemented 2026-10-13 for /app/growth. No customer or visitor source data is manufactured.

## Actual data path
1. Public `site.js` preserves first landing path plus **origin+pathname only** for browser-provided HTTP referrer, and stores selected `utm_*` fields in session storage. Referrer query strings are never captured.
2. Public `forms-core.js` sends the same `utmSource`, landingPage and referrer with a **real submitted inquiry**; backend `/api/inquiries` records metadata on the `INQUIRY_CREATED` activity.
3. `/api/admin/inbound-growth` groups persisted distinct inquiries by first genuine activity, then classifies allowlisted source values. The only countable denominator is **CRM submissions**, not all AI answers or site visitors.

## Added source labels
- ChatGPT: `utm_source=chatgpt|chatgpt_search|openai`; host `chatgpt.com`, historical `chat.openai.com`.
- Perplexity: `utm_source=perplexity|perplexity_ai`; `perplexity.ai` or `perplexity.com` (www variants).
- Claude: `utm_source=claude|claude_ai|anthropic`; host `claude.ai`.
- Gemini: `utm_source=gemini|google_gemini`; host `gemini.google.com`.
- Copilot: `utm_source=copilot|microsoft_copilot`; host `copilot.microsoft.com` or `copilot.microsoft365.com`.

Source selection follows the existing policy: explicit UTM source takes priority over browser referrer. Unknown UTM values stay `OTHER_TAGGED`, and missing/unrecognized sources remain `DIRECT_UNKNOWN`. **Never** infer the exact AI product from generic `google.com` or `bing.com` referrals. Those can be organic search or AI-enhanced search and cannot reliably be separated by referrer alone.

The page dimension now recognizes the new sitewide AI guides:
- `KIDS_QUIET_GUIDE`: `/quiet-indoor-sports-for-kids.html`
- `SCHOOL_EQUIPMENT_GUIDE`: `/indoor-school-sports-equipment-guide.html`

## Interpretation limitations
Browser UTM and referrer are user-controlled or browser-dependent; some AI apps omit them, open in external browsers or remove the source completely. A lead labelled "CHATGPT" means **a recorded inquiry has a compatible UTM/referrer**, not that ChatGPT Search cited MING EAGLE or that the website generated additional visits. This evidence must remain distinct from: (a) GSC API performance by Pacific date, (b) Bing AI Performance manual CSV exports, (c) human-attested 24-prompt platform tests, and (d) Cloudflare RUM visits by UTC date.

Do not sum independent data sources into a fabricated AI funnel. When posting owned campaign links externally, add explicit `utm_source`, `utm_medium`, `utm_campaign` with truthful source and no private data. Never try to insert a brand into AI answers, impersonate a platform referrer, or alter visitor tracking without consent.

CI proof: `scripts/test-inbound-growth.mjs` exercises real isolated SQLite inquiry/activity records, all five platforms, hostile hostname spoofing, UTM precedence, new guide landing pages, and ensures no data writes.
