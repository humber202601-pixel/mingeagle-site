# MING EAGLE US B2B Google Search Pilot — Phase 1

**Prepared:** 2026-10-22  
**Status:** DRAFT ONLY — NOT PUBLISHED — NO AD SPEND  
**Business goal:** qualified US B2B wholesale RFQs and, ultimately, verified Stripe-paid orders. Click volume alone is not success.

## 1. Phase 1 decision

Start with one Google Search campaign and two tightly themed ad groups. Do not start with Performance Max, Display, YouTube, broad match, or generic awareness campaigns.

Public search-result inspection for `silent basketball` and `quiet basketball` shows many consumer product pages and buying guides. This is qualitative SERP evidence only; it is **not** Google search-volume or CPC data. To reduce consumer-only clicks, Phase 1 prioritizes explicit wholesale and institutional procurement language. Reconsider generic `silent basketball` / `quiet basketball` terms only after the first Search Terms report provides evidence.

Observed public examples:
- https://cipton.com/collections/basketball/products/silent-basketball
- https://www.nexplayground.com/shop/quiet-basketball
- https://ygasports.com/blogs/news/silent-basketball-buying-guide

## 2. Campaign settings

- **Campaign name:** `US B2B Quiet Basketball — Phase 1`
- **Type:** Search only
- **Networks:** Google Search; turn off Display Network. Keep Search Partners off for the initial test if the UI permits.
- **Locations:** United States; choose the presence option for people in or regularly in the targeted locations, not people who merely show interest in the US.
- **Language:** English
- **Match types:** Exact and phrase only; no broad match in Phase 1.
- **Schedule:** 14 days, with a specific end date. Keep paused until every launch gate below passes.
- **Budget cap:** Prefer **Campaign total budget = $70** with explicit start/end dates if available in the Search campaign setup. Google says a campaign total budget is a cap for the campaign duration. If the UI does not offer it, use **$2.50 average daily budget for 14 days** and set the end date: most campaigns can spend up to 2× the average daily budget on an individual active day, so this fallback keeps 14 active days at no more than $70 in ad spend before any applicable taxes or billing adjustments. Do not use $5/day for this 14-day test.
- **Bidding:** Prefer Manual CPC if offered. Otherwise use Maximize Clicks with a conservative maximum CPC bid limit if the interface provides one. Do not use conversion-based automated bidding until the conversion event is validated and enough real conversion data exists.
- **Promotion:** Do not spend $500 just to unlock the new-advertiser credit. That threshold is incompatible with the minimum-cost pilot unless real, profitable demand independently justifies it.

Official budget guidance:
- https://support.google.com/google-ads/answer/10486938
- https://support.google.com/google-ads/answer/10486637
- https://support.google.com/google-ads/answer/7287265

## 3. Ad group A — Wholesale quiet / silent basketballs

**Landing page:** https://www.mingeagle.com/wholesale.html  
**Primary CTA:** request a written wholesale quote; wholesale orders generally start at 10 units, subject to written confirmation.

### Keywords

| Keyword | Match |
|---|---|
| `silent basketball wholesale` | Exact |
| `silent basketball wholesale` | Phrase |
| `quiet basketball bulk` | Phrase |
| `bulk silent basketball supplier` | Phrase |
| `indoor basketball wholesale` | Phrase |
| `soft basketball wholesale` | Phrase |

### Responsive search ad headlines (all ≤30 characters)

1. Silent Basketball Wholesale
2. Bulk Quiet Indoor Basketballs
3. Wholesale Orders 10+ Units
4. Request a Bulk Quote
5. Flocked & Fabric-Cover Balls
6. Supplier for Schools & Clubs
7. Custom Logo Options
8. Compare Ball Models
9. Request Samples First
10. Wholesale Indoor Ball Supply

### Descriptions (all ≤90 characters)

1. Compare quiet indoor basketball models and request a written quote for 10+ units.
2. For schools, clubs, coaches and resellers. Share quantity, models and delivery ZIP.
3. Ask about eligible samples, custom logos and sea-freight options before ordering.
4. Product specs, bulk pricing and delivery terms are confirmed in your written quote.

## 4. Ad group B — School / institutional bulk procurement

**Landing page:** https://www.mingeagle.com/for-schools.html  
**Primary CTA:** request a school / institutional quote.

### Keywords

| Keyword | Match |
|---|---|
| `bulk basketballs for schools` | Exact |
| `school PE basketball supplier` | Phrase |
| `school basketball equipment wholesale` | Phrase |
| `bulk sports balls for schools` | Phrase |
| `school sports equipment supplier` | Phrase |
| `basketball equipment for PE programs` | Phrase |

### Responsive search ad headlines (all ≤30 characters)

1. Bulk Basketballs for Schools
2. School PE Ball Supplier
3. Quiet Balls for Indoor PE
4. School Bulk Quote 10+ Units
5. Request School Samples
6. Sports Equipment for Schools
7. Compare Indoor Ball Models
8. Supply for PE & After-School
9. Ask About Bulk Pricing
10. Request a School Quote

### Descriptions (all ≤90 characters)

1. Compare soft indoor ball options for supervised PE, activity rooms and programs.
2. Request a quote for 10+ units. Share sizes, quantities and delivery destination.
3. Samples may be available; final model suitability, freight and pricing are confirmed.
4. Designed for quieter play; not silent or a regulation game-ball replacement.

Official responsive-search-ad limits: headlines up to 30 characters and descriptions up to 90.
- https://support.google.com/google-ads/answer/7684791

## 5. Initial negative keywords

Start with the following irrelevant-intent exclusions, then review actual Search Terms reports before adding more:

- free
- used
- second hand
- DIY
- how to make
- repair
- job
- jobs
- salary
- NBA live
- NBA scores
- game download
- court rental
- logo maker

Do not automatically exclude terms such as `kids`, `school`, `foam`, `training`, or `indoor`: these can describe legitimate users or products.

## 6. Ad URL tracking

Enable Google Ads auto-tagging. Use an ad-group-specific **Final URL suffix** so the CRM can preserve source details even when optional GA4 analytics is not accepted:

- Ad group A: `utm_source=google&utm_medium=cpc&utm_campaign=us_b2b_search_pilot&utm_content=wholesale_silent`
- Ad group B: `utm_source=google&utm_medium=cpc&utm_campaign=us_b2b_search_pilot&utm_content=school_bulk`

Do not put customer names, email addresses, inquiry text, order details, or other personal data in URLs.

## 7. Conversion tracking — required before launch

The current repository has:
- first-touch source / UTM capture on selected buyer pages;
- CRM payload fields for source, landing page, referrer and UTM values;
- an opt-in GA4 tracker that emits `generate_lead` only after the CRM or backup form confirms acceptance;
- privacy consent / revocation controls and automated static checks.

Relevant implementation:
- https://github.com/humber202601-pixel/mingeagle-site/blob/main/public/geo-source-capture.js
- https://github.com/humber202601-pixel/mingeagle-site/blob/main/public/forms-core.js
- https://github.com/humber202601-pixel/mingeagle-site/blob/main/public/inquiry.js
- https://github.com/humber202601-pixel/mingeagle-site/blob/main/public/ga4-consent.js

**Still not verified:** the live GA4 property records the event in a real accepted test submission; `generate_lead` is marked as a GA4 key event; and Google Ads successfully imports that key event. Code/CI success is not a substitute for a real end-to-end test.

Before launch:
1. Verify the GA4 property / measurement ID is the intended MING EAGLE property.
2. In a test session, accept optional analytics, submit a clearly identified test inquiry, and verify CRM acceptance.
3. Confirm `generate_lead` appears in GA4 Realtime / DebugView after consent.
4. Mark the correct event as a key event in GA4, then import it into the linked Google Ads account.
5. Confirm Google Ads reports the imported action and that no form content or customer identifiers are sent as event parameters.
6. Test a rejected-consent session too: the inquiry should still work, while optional GA4 tracking remains disabled.

Google notes that Keyword Planner basic features require billing setup, and imported GA4 conversion data can take time to appear:
- https://support.google.com/google-ads/answer/7337243
- https://support.google.com/google-ads/answer/2375435
- https://support.google.com/google-ads/answer/1722022

## 8. Definition of a qualified RFQ

Count a lead as qualified only after human review confirms:
- reachable contact details;
- an actual school, club, institution, reseller, distributor, or other plausible business use case;
- selected model(s) and a confirmed intention to buy 10+ units;
- destination sufficient to review delivery and freight;
- buyer understands that final wholesale price, customization, freight, tax and delivery terms require a written quote.

A click, page view, opened form, unverified submission, or personal sample request is not a qualified wholesale RFQ. Track qualified RFQs, quotes sent, and Stripe-verified paid orders separately.

## 9. Launch gates (all required)

- [ ] Google Ads payment / billing setup is accepted.
- [ ] Search campaign, US presence targeting, English, exact/phrase match and network settings are reviewed.
- [ ] $70 campaign-total cap is applied, or the $2.50/day + 14-day fallback is set.
- [ ] Both final URLs return HTTP 200, are HTTPS / indexable, and match their ad intent.
- [ ] Ad copy is approved for factual accuracy and character limits.
- [ ] Ad-group UTM suffixes persist into the CRM.
- [ ] A real accepted test inquiry produces the intended GA4 event after consent.
- [ ] The GA4 key event is imported and visible in Google Ads.
- [ ] Campaign end date and a daily review owner are set.
- [ ] Campaign remains paused until the owner explicitly decides to start spending.

## 10. First 14-day operating cadence

- **Before day 1:** verify billing, conversion, landing pages and the full lead path. No spend while any gate is unchecked.
- **Days 1–3:** inspect search terms and spend daily; exclude obvious consumer / unrelated queries. Do not widen match types.
- **Days 4–7:** compare spend and qualified RFQs by ad group, not just clicks or CTR. Pause the weaker group if it spends without useful inquiries.
- **Days 8–14:** keep only search terms with plausible wholesale intent; review each RFQ, quote and Stripe-paid outcome.
- **At day 14:** pause automatically by end date and decide using verified qualified-RFQ cost, quote acceptance, paid orders and contribution margin. Do not extend the campaign simply because the budget remains.

**Status note:** this file is a planning artifact only. It does not create a Google Ads campaign, enable billing, submit ads for approval, or represent any performance, customer lead, or sale.
