# V31 — Verified customer discovery intake resilience

## Confirmed code finding

Verified candidates from the public-website parser are saved with
`enrichment_status='COMPLETED'` and explicit entity/business-fit evidence.
The automatic discovery candidate step previously always reloaded the site
through another enrichment endpoint before CRM import, even if it had
already been verified. A later website outage or network timeout could then
prevent a legitimate candidate from entering the CRM.

## Change

- Skip the redundant website fetch only when the record has a verified
  first-party source provider, a COMPLETED enrichment status, an
  allowed website URL, and parseable upstream identity and fit evidence.
- Unsupported sources, generic directory/map/social clues, pending/failed
  enrichments and low-fit records still use the established verification path.
- An ignored or do-not-contact lead is **never** auto-restored or outreached.
- Preserve the existing idempotent CRM import, evidence and no-cold-email
  protections.
- The discovery progress table now reports imported customers from actual
  linked `crm_lead_id` values, aggregated inside the existing D1 query.
  This also avoids the 100-result UI snapshot cap.
- Surface the first five review/failure reasons on the discovery screen
  with details available for all returned exceptions.

## Acceptance

1. CI tests pass for source import, social/map/school verification,
   retry/lease controls and trusted completed enrichment re-use.
2. Run a small authorized production search and compare source clues,
   candidates, review reasons and confirmed CRM-linked imports.
3. Compare actual D1 request quotas through Cloudflare Analytics.
   Cloudflare account analytics are not exposed to this local test.
4. Do not claim an increase in real customers until the live search,
   provider access and CRM records are checked.

This release makes existing verified candidates more resilient; it does
not bypass human verification challenges or invent identities/contacts.
