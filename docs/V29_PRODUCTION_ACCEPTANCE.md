# V29 — Production acceptance evidence and limits

## Implementation

The admin-only read endpoint `GET /api/admin/production-health` provides a concise,
read-only snapshot for the Automation Center. It adds **no D1 tables or periodic
polling** and never returns names, emails, phone numbers, private credentials or
CRM object IDs.

The UI distinguishes:
- **Cron observed**: the Worker recorded a heartbeat; this alone does not
  establish successful discovery or HubSpot replay.
- **HubSpot credential present**: the encrypted `HUBSPOT_PRIVATE_APP_TOKEN`
  environment variable exists. This alone does not prove API authorization.
- **HubSpot synced**: a successful recovery page advanced the D1 cursor;
  `imported_total` counts newly created inquiries, not all HubSpot contacts.
- **Verified discovery imported**: counts latest run candidate rows with
  `status='DONE'` **and** an actual `discovery_candidates.crm_lead_id`.
  A worker step saying DONE without a linked CRM lead is *not* counted.
- **Website inquiries**: D1 inquiry count and last-24h submissions.
- **D1 quotas**: **unknown**. The D1 database binding cannot read Cloudflare
  account Analytics rows-read / rows-written usage. The dashboard does not
  fabricate a remaining percentage.

## Release acceptance (production, NOT simulated)

1. Open `https://app.mingeagle.com` with the authorized admin access key.
   Go to Automation Center, reload the health panel. Check the latest
   Cron timestamps and D1 summary; do not confuse heartbeat with success.
2. Submit exactly one **consenting, authorized internal test** using the
   storefront form with a distinctive `ME-` reference. Confirm that the same
   reference creates one inquiry, one linked CRM lead and one follow-up task
   in D1. Retry the same reference and verify no duplicate.
3. If HubSpot recovery is desired, configure the encrypted Cloudflare
   Pages `HUBSPOT_PRIVATE_APP_TOKEN`, test the actual read API authorization,
   and check `lastSuccessfulPageAt`. The hourly heartbeat alone is insufficient.
   Do not paste provider tokens or client data in support tickets.
4. Run a small bounded discovery search for a known public business category
   and state. Observe sources, candidates and **CRM-linked imported count**.
   Any zero result must be explained through the source/candidate review
   pipeline before claiming that there are no customers.
5. Open Cloudflare Analytics -> D1 and review *actual* daily rows read/written
   and usage over multiple days. No D1-side SQL can know the account's
   remaining free quota without the authenticated Cloudflare Analytics API.
6. Test a non-production / authorized controlled payment sandbox if payment
   is enabled. Do not send real commercial emails or process live payments as
   a monitoring check.

## Operational limitations

- No real customer, HubSpot contact or payment is created by CI tests.
- `/api/admin/production-health` is authenticated by the admin middleware.
  If D1 is at quota, a GET may return HTTP 503; the dashboard must show
  the error without falsely re-classifying the admin password as incorrect.
- The health panel is refreshed on opening the Automation Center or by
  clicking Refresh; it is **not** a background polling process consuming D1.
- HubSpot recovery currently uses a bounded two-item hourly page with
  offset pagination. Large historical backlogs can take time and offset
  instability is handled by reference deduplication and scan resets;
  do not claim exhaustive completeness without a provider export.
- CAPTCHA / Turnstile needs a public site key and an encrypted
  backend secret before it can safely become required. It is not yet enabled.
