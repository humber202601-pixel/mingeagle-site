# Verified public AI product facts · 2026-10-13

**Purpose:** Make MING EAGLE's current first-party product specifications easy to check and reuse without inventing specifications or claiming preferential AI placement.

## Released files
- `https://www.mingeagle.com/llms.txt`: concise plain-text directory with canonical links and clear first-party context. `llms.txt` is an **experimental/convention-based supplement, not a Google Search, ChatGPT, Copilot or Perplexity ranking requirement**.
- `https://www.mingeagle.com/ai-product-facts.json`: structured facts about the **same four products** already listed in `product-master.json` and the **same size-level retail reference prices** currently listed in `retail-prices.json`; five canonical user-intent buying guides; essential limitations and sourcing context.

Both are generated only in the public GitHub Pages release from approved, existing source files by `scripts/build-ai-product-facts.cjs`, and verified with `scripts/check-ai-product-facts.cjs`. No third-party service, accounts, new database, cookies or telemetry required.

## Data provenance and caveats
- Source: product-master.json for four product names, exact sizes and colors, main product images; retail-prices.json for USD price by size; 25-URL official public sitemap for destinations.
- `retailReferencePricesUsdBySize` are **product-only published retail reference prices**, not wholesale quotations, landed costs or checkout confirmation. Taxes, freight, stock, minimum order quantities, customization, compliance and delivery remain subject to a staff-confirmed quote.
- No invented availability, seller review count, star rating, scientific noise decibels, laboratory study, age certification or claim of being recommended by any AI platform.
- Site uses soft or weighted-feel indoor balls; no model is universally silent or an equivalent replacement for a regulation ball.
- Documentation should not be treated as independent third-party testing: it is explicitly supplier information.
- Future changes to `product-master.json`, `retail-prices.json` or the pages must pass the exact-match catalog tests before publication. The builder deliberately fails closed when size and price variants disagree or an image/url is missing.

## What this does **not** accomplish
The public JSON file is **not** an authorized OpenAI commerce feed, Google Merchant feed, Microsoft Merchant feed or authenticated paid listing. Those may require eligibility, merchant accounts, verified price/stock/availability, shipping and return details. Neither file guarantees discovery, indexing, AI citations, recommendation order or measurable sales growth. Real effect is assessed via GSC URL Inspection, Bing AI Performance when connected, and human-observed benchmark tests only.

## References
- Google AI Search information: https://developers.google.com/search/docs/appearance/ai-features
- Bing AI Performance: https://www.bing.com/webmasters/help/ai-performance-9f8e7d6c
