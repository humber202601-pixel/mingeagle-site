# 2026-10-13 · Schools & basketball academies: four independent multilingual GEO buyer guides

## What was actually shipped
- English source: `https://www.mingeagle.com/indoor-school-sports-equipment-guide.html` (already indexed by Google before this batch).
- German: `https://www.mingeagle.com/school-sports-equipment-de.html`.
- French: `https://www.mingeagle.com/school-sports-equipment-fr.html`.
- Spanish: `https://www.mingeagle.com/school-sports-equipment-es.html`.
- Portuguese: `https://www.mingeagle.com/school-sports-equipment-pt.html`.

These are **five URLs with actual translated buying guidance**, not four JavaScript translations of the same English text and not separate country-specific fulfillment claims. Each localized page explains indoor ball activities, actual four product models and sizes, sample assessment, school safety-document questions, bulk RFQs (quantities, delivery country and postal code, packaging, possible logo), take-home practice, and the absence of independent sound testing or universal age compliance claims.

## International SEO decisions
Google documentation: https://developers.google.com/search/docs/specialty/international/localized-versions

- One self-canonical HTTPS www URL per language.
- HTML `rel="alternate" hreflang` metadata on all five pages, **identical and bidirectional**, listing `en`, `de`, `fr`, `es`, `pt` and `x-default` (English fallback).
- Visible static language switcher across all five pages; no country/IP forced redirects.
- Standalone `/sitemap-localized.xml` with four additional *loc* entries for translated guides, announced in `robots.txt`. Google says HTML `hreflang` and Sitemap `xhtml:link` are alternative annotation methods; use HTML only here to avoid duplicate inconsistent alternate sets.
- The original `/sitemap.xml` keeps its existing 25 URLs. The site has 29 published public URLs across two maps after this rollout, but the existing 25-URL Google Search Console inspection baseline remains historical, not a 29/29 test.
- The new content is language-based, **not** a promise of Germany-only, France-only, Spain-only or Portugal-only stock, delivery, warranties, compliance, prices or seller offices. Written quotes/region-specific evidence required.
- Shared first-party product and quote pages are presently English and their actual language should not be mislabeled in metadata.
- No blanket translated versions for pages with untranslated body content; no false `hreflang` for languages without real content.
- A native-language editorial review of style, regional terminology and translation quality remains recommended before paid marketing, legal commitments or bulk campaigns.

## Test and evidence standards
- `scripts/check-localized-school-guides.cjs` verifies full native-language sections, all 5 return links, six identical head alternates, page-specific canonical & Article JSON-LD, 29 distinct URLs across two public sitemaps, no invented testing/certifications.
- `scripts/test-localized-school-guides.cjs` requires synthetic bad hreflang, page language, canonical, missing translated body or omitted XML entry to **fail**.
- Published GitHub Pages post-deploy checks directly fetch all five HTTPS HTML bodies, confirm metadata, and download `robots.txt` + the second sitemap. This proves public accessibility, **not** Google or Bing indexing and **not** ChatGPT/Perplexity citation.
- Add four new URLs to GSC URL Inspection tracker after successful release and independently submit `sitemap-localized.xml` to GSC. Google recrawl and regional indexing remain provider decisions.
- Current CRM GSC/Bing CSV allowlists were built against the 25 pre-existing public URLs. If legitimate data starts arriving for the 4 new localized URLs, update the CRM allowlists via a separate tested `v2-cloudflare` PR and deploy. Do not silently admit arbitrary external URLs.

## Scope
No customer records, product inventory, wholesale price calculation, mail sending, paid advertising, or Bing Webmaster API permissions were changed.
