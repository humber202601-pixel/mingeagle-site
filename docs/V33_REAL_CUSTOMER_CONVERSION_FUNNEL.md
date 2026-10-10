# V33: actual CRM outreach-to-order conversion analysis

## UI
- New sidebar tab **客户转化分析** (`/app/funnel`) shown only to the logged-in admin.
- Source filters: discovered `DISCOVERY`, inbound website `WEBSITE`, and all CRM customers.
- Cohort window: created in last 30, 90, 365 days or all-time. Sales activities measured *as of query time* for that cohort.
- KPI: total leads, contactable, review-ready without prior outbound, actual recorded outbound emails/messages, actual later inbound replies, non-draft quotes, non-draft and non-cancelled orders, and order payment status marked paid.
- Table by real CRM company `customer_type`, with caveats for response-rate denominators under 10.
- Top 30 uncontacted, non-opted-out, contactable customers linked directly to a specific `/app/leads/:id` review-and-draft view.
- One-click client-side CSV of **aggregate segments only** (not private contact details). Formula-prefixed cells are escaped.
- Never dispatches email, mutates D1, or runs in a background poll. Only calls when opening the page, switching filters or manually refreshing.

## Source of truth / caveats

* `leads`: created cohort, company type and source. Deduplicated by lead ID.
* `contacts` and company public phone: contactability; exclude DNC, opt-outs, NOT_INTERESTED, NOT_FIT and LOST from review-ready.
* `messages`: outbound recorded CRM messages; reply counts only when a non-WEBSITE inbound message timestamp is at/after first outbound. This is not a measure of off-CRM or unrecorded communication.
* `quotes`: only SENT/VIEWED/ACCEPTED/DECLINED/EXPIRED/CONVERTED, not DRAFT; at most one per lead.
* `orders`: only non-DRAFT and non-CANCELLED; at most one per lead. Paid comes from order payment_status/status, not independent bank settlement reconciliation.
* Stage values are **not strict nested funnel steps**. Some inbound enquiries occur before sales sends and orders can be created under an imported profile without a CRM message.

## Performance & security
- Behind existing authenticated `/api/admin/_middleware.ts`.
- Two D1 SELECTs per deliberate page request: segment aggregate and up-to-30 reviewable leads. Aggregates run over one CTE with pre-grouped messages, quotes and orders, avoiding multiplicative joins from multiple messages.
- Queries are parameterized by strictly whitelisted source and cohort window; no D1 writes, tables, migrations or extra services.
- On quota/network failure, the UI reports unknown, not 0; does not automatically retry.
- CSV export only uses results already loaded in the browser.

## How to accept
1. Open `https://app.mingeagle.com/app/funnel` with authorized admin access.
2. Change source and date window, compare with actual CRM lead profiles and message/quote/order detail records.
3. Use a consenting test mailbox if end-to-end email send needs validation; this page will never send mail itself.
4. Validate actual results before declaring conversion success. A deployed widget is not evidence of sales growth.
