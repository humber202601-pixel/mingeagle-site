# V28 — HubSpot backup inquiry recovery and public form abuse guard

## What is deployed

- Primary website inquiry path: `www.mingeagle.com` -> `app.mingeagle.com/api/inquiries` -> D1 CRM (lead + inquiry + follow-up task).
- Existing fallback: if D1 rejects the request, `www.mingeagle.com` may still submit to the configured HubSpot Forms endpoint, clearly reporting that CRM sync is unconfirmed.
- New protected recovery path: the Cloudflare hourly cron calls `/api/admin/hubspot-inquiry-recovery` with the pre-existing Worker `ADMIN_ACCESS_KEY`. Pages fetches from **only the configured MING EAGLE HubSpot form** and replays missing references via the same D1 ingestion validation.
- The scheduled endpoint is **disabled until `HUBSPOT_PRIVATE_APP_TOKEN` is configured on the Cloudflare Pages project serving `app.mingeagle.com`**. Connecting the HubSpot app in ChatGPT does not provision this secret in Cloudflare.
- Automatic processing is bounded at **two submissions per hourly invocation**, about 48 submissions/day if available. The D1 recovery cursor persists between invocations and advances only after each page completes. A completed scan resets to the beginning to discover newly received inquiries.
- Same `ME-YYYYMMDD-XXXXXXXX` reference is idempotent: no duplicate inquiry, lead, sample or task. No cold outreach or redundant FormSubmit notification is triggered during replay.

## Provisioning

1. HubSpot: create/authorize a private app with the minimum form-submission read scope permitted by the portal (e.g. forms read). Verify that `GET https://api.hubapi.com/form-integrations/v1/submissions/forms/eef6eb0b-5533-416f-9bda-7017b3160456?limit=2&offset=0` returns JSON with `results`; do **not** put the Bearer token in a browser, public GitHub repo or chat.
2. Cloudflare Pages -> `mingeagle-site` -> Settings -> Variables and Secrets -> production encrypted Secret: `HUBSPOT_PRIVATE_APP_TOKEN`. The Worker needs no extra HubSpot secret; it already authenticates using `ADMIN_ACCESS_KEY`.
3. Check Cloudflare Cron Trigger `0 * * * *` is active and worker `mingeagle-followup-scheduler` deployed. Hourly means UTC top-of-hour.
4. Open the internal admin API status from an authorized session or check `hubspot_inquiry_recovery_state` in D1; when unconfigured the endpoint returns `{ok:true,configured:false,disabled:true}` and never accesses HubSpot.
5. In a test account with consent, submit a sample/wholesale form during a simulated D1 failure; verify it appears in HubSpot, trigger protected `SYNC` action, and confirm exactly one corresponding D1 inquiry and follow-up task. Re-run and ensure no duplicates.

## Safety, limitations and quality gates

- The recovered form fields must include an actual consent flag and valid MING EAGLE reference, name and email. Unrelated HubSpot contacts, forms and records are not imported.
- All provider calls are read-only and external to the public website. No account passwords, access keys, payment credentials or API tokens appear in a public form response.
- Public Cloudflare-hosted inquiries are throttled at 12 requests per 15-minute hashed-IP window; no raw IP address is persisted. This reduces simple abusive traffic but is not a full bot defense. For stronger protection, configure Cloudflare WAF/Turnstile after separately verifying that the legitimate website form can supply a token and submit successfully.
- The HubSpot legacy Forms submissions API is offset-paginated. Deletions and concurrent new submissions can shift offsets, so the scanner re-reads from zero after each full pass and relies on reference deduplication. Large backlogs take multiple hours. Do not claim 100% historical coverage without an export comparison.
- The recovery job is fail-closed: HubSpot auth failures, malformed provider responses, a D1 outage or an unconfirmed D1 insert preserve the current offset for later retry; no unverified success is reported.
- Real production HubSpot read access, Cron invocation, D1 record parity and quota telemetry require credentialed production acceptance checks; CI mocks cannot establish these.
