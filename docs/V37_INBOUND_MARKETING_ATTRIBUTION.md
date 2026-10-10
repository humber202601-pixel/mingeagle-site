# V37 — Inbound growth: actual CRM inquiry attribution, not fabricated visitors

The admin route `/app/growth` is guarded by the existing admin login. It reads `/api/admin/inbound-growth?days=30|90|365|0` only while that view is open, on range changes or explicit refresh.

## What is real
The existing public `www.mingeagle.com` inquiry front end stores landing URL, sanitized referrer and UTMs in sessionStorage, then submits a structured inquiry to the existing `app.mingeagle.com/api/inquiries` CRM endpoint. CRM creates an `INQUIRY_CREATED` activity with `metadata_json` including `inquiryId`, `utmSource`, `utmMedium`, `utmCampaign`, `landingPage` and `referrer`.

V37 reuses these *already persisted* records. The authenticated API groups real `inquiries` by a limited, stable list of source categories and by audience:
- B2B: WHOLESALE/RETAIL_PARTNERSHIP or clearly identified coach, academy, school, club, retailer, distributor or e-commerce customer
- B2C: explicit personal buyer
- UNKNOWN: all other sources, including ambiguous product questions or sample requests
It also reports *lead-associated* current sent quotes and non-draft/non-cancelled orders, clearly distinguished from attribution or cash receipt proof.

No pageview, ad-impression, search click, revenue or generic B2C purchase is invented, even when source metadata is absent. Source is inferred from the recorded UTM first then simplified external referrer. It is marketing self-reported attribution, not validated platform analytics.

## Performance
Two grouped D1 SELECTs (source x audience; entry page) and no writes per explicit view or filter change. No periodic tracking script, analytics token, external API key, additional database or new paid third-party service. No public endpoint for reading CRM data.

## Search Console and Bing setup (human-domain-owner action)
1. Add `mingeagle.com` as a Domain property in Google Search Console; copy the exact TXT verification token furnished by Google.
2. Add the TXT record at the **DNS host that actually controls mingeagle.com**, verify with Google, and submit `https://www.mingeagle.com/sitemap.xml`.
3. Connect Bing Webmaster Tools via verified Google Search Console import if available, or follow Bing-provided proof of ownership and submit the same sitemap.
4. For initial review, monitor US-filtered search impressions, clicks, queries and top pages. Actual Google Search Console figures need a validated property; this code does not claim to retrieve them.
5. Before attaching GA4 or other detailed visitor trackers, select a privacy-aware implementation and update the privacy notice where needed. This V37 change does not install a new tracking cookie or read personal browser data.

## End-to-end acceptance
After site deployment, an explicitly consenting TEST inquiry sent from a tagged landing page such as `/for-coaches.html?utm_source=partner&utm_medium=referral&utm_campaign=coach_demo` will record the source in CRM after a valid human form submit. V37 backend tests use only isolated in-memory SQLite fixtures and **never send real web inquiries**. Real production source numbers remain unknown until someone with authorized admin access opens the dashboard.
