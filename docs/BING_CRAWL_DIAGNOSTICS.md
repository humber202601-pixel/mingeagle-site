# Bing crawl-parity evidence (read-only)

**Started:** 2026-10-22. **Bing Webmaster Support:** user confirmed a support ticket was filed; ticket ID is not stored here. The ticket and URL Inspection screenshots are the authoritative evidence of what Bing sees.

## What this tests

The existing production smoke workflow requests the public homepage, /wholesale.html, and /for-schools.html with:
- a normal synthetic site-reliability User-Agent, and
- a synthetic User-Agent string resembling Bingbot (clearly labeled as simulated).

For each request the script uses **GET with redirects disabled**. It records the real HTTP status, Location header, Content-Type, self-referencing canonical and noindex directives. It also GETs the public robots.txt and confirms an explicit Bingbot allowance and main sitemap reference.

Use the GitHub Actions **Read-only production smoke monitor** logs to compare behavior; tests run under the existing approximately six-hour schedule. The test does **not** log request contents or visitor data, submit URLs, bypass rate limits, change DNS, modify production, or claim to be an authenticated Bingbot IP.

**Important limitation:** an HTTP client merely setting a Bingbot User-Agent does not establish true Bingbot access, crawler IP reputation, indexed status, search ranking, or AI citations. Bing Webmaster URL Inspection, server-side verified crawler evidence and Bing Support remain decisive. A successful monitor means only that our independent public GET probes saw the expected output at that time.

## Current issue and safe escalation

- Previously Bing reported the homepage as a redirect at its last earlier fetch, while the later GitHub Pages audit showed 200 with matching canonical and no redirect.
- Bing reported the wholesale page as discovered but not crawled.
- Bing Live URL inspection returned a generic error without an HTTP status.
- On 2026-10-21, Bing accepted the main and localized sitemaps; the main sitemap reported 27 discovered URLs and the localized sitemap was initially processing.
- Bing AI Performance displayed 0 citations at the initial baseline, but this is sampled Microsoft Copilot/partner coverage rather than all AI platforms.

Do not submit another ticket automatically. Do not alter Cloudflare DNS, Stripe, the CRM or email routing in response to these observations. If future monitor probes fail, inspect timestamped logs and obtain the Bing support response before adjusting configuration. Real index or citation changes require new official data.

## Local verification

```bash
node scripts/test-bing-crawl-parity.cjs
node scripts/check-bing-crawl-parity.cjs
```
