# Cloudflare D1 Time Travel recovery: safe acceptance record

## Verified isolation-only drill (2026-10-12/13 UTC)

- The production D1 instance `mingeagle-v2` supports a read-only **current Time Travel bookmark GET**; bookmark string was deliberately not copied into reports, docs or source.
- Created a **disposable new D1 test database** `mingeagle_restore_drill_20261013` (not production/preview), created synthetic marker table, inserted BEFORE, read the Time Travel bookmark, updated row to AFTER, used REST Time Travel restore with bookmark, and verified restored marker was BEFORE.
- Successfully deleted the disposable test database after verifying restoration. No customer, lead, inquiry, quote, order, payment or real provider record was read or modified by the test.
- The test confirms current API permissions and a basic bookmark rewind on an isolated database. It **does not test production application recovery**, actual backup retention or restoring a schema with concurrent live business writes.

## Production recovery procedure (NOT automatically executed)

1. Identify incident, stop destructive writers and snapshot the affected timeframe; do not run restore while approved orders/payments might be posting.
2. Record current D1 bookmark and affected schema counts **without displaying sensitive records or bearer credentials**.
3. Require owner confirmation and an operations maintenance window before any production restore. Always consider that a point-in-time restore overwrites more recent customer orders and transactions.
4. Export/encrypt an independent up-to-date backup or take a separate secure copy where permitted, coordinate financial ledger recovery and vendor webhook replay before restoring.
5. Test a complete restoration in a separate environment if feasible and verify migrations, read-only reference lookups and application access. Do not use a preview DB as a disposable test fixture if it serves shared reviewers.
6. Only then choose an appropriate Cloudflare Time Travel bookmark or timestamp and perform controlled production restoration, followed by read-back and full acceptance; record and reconcile post-backup customer/finance events separately.
7. Keep restoration permissions restricted. The real `/time_travel/restore` endpoint must never be exposed to public HTTP or scheduled monitoring.

Cloudflare official docs: https://developers.cloudflare.com/d1/reference/time-travel/. Time Travel is enabled by Cloudflare; actual history window depends on Workers plan and retention settings. Check the account-specific applicable limit before any restore. The weekly non-destructive check may verify bookmark availability but must NEVER call restore automatically.
