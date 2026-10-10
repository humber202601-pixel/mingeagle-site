# V36 — Discovery progress stall diagnosis and safe recovery

## What the screenshots actually show
The task is RUNNING, with 56 *steps*, 22/65 *work items*, 4/8 SOURCE items, 55 unique clues, two true linked CRM imports and some unresolved source records. A step can be a staged query, paged save or retry. Counting steps vs processed items is not a reliable indication of progress. A source that returns zero Geoapify/OSM results is not, by itself, evidence of a stuck task.

## Root cause addressed
The previous `updated_at` is updated by claims, lease renewals, releases and status reads and therefore cannot prove that an actual step completed. An indefinitely RUNNING view showed a perpetual spinner, without a safe way to distinguish active worker leases from stalled or throttled source requests.

## Patch
- Add nullable `discovery_auto_runs.last_progress_at` through the existing lazy schema bootstrapping, without a new D1 database or paid service. Set it **only** on completion of an actual step.
- Existing grouped work-item status counts also supply pending, processing and unresolved totals; no new progress read query is needed.
- UI displays last actual step timestamp separately from generic `updated_at`, explains total steps vs items, and updates its stall warning clock every 30 seconds *locally*, with no additional D1 polling.
- At 5 minutes without a real step while work is pending/processing, show a warning. When a worker lease is still valid, advise waiting and do not present forced recovery.
- Otherwise the operator may click **安全恢复任务**. The backend `RECOVER` request respects any current lease, uses the pre-existing atomic `claimAuto` path (which repairs truly expired PROCESSING claims), and schedules only the next bounded batch.
- RECOVER never resets a completed item, wipes leads, alters consent/opt-outs, sends email, or clears prior results. It does not impersonate a successful search result. Requests with no RUNNING job return a conflict.
- Background Cron worker and browser polling remain in place; the manual control is an option when that flow has visibly stalled.

## Caveats
- Being unable to access Cloudflare production admin credentials means the specific in-flight live task and Cloudflare request logs cannot be conclusively diagnosed here; code review and local test evidence do not establish the exact real-time cause.
- A durable D1 quota exhaustion, external search challenge, or sustained provider outage is not solved by repeated recovery clicks. Operators should pause and wait for quota/provider recovery, or end the batch while preserving completed CRM records.
- If a live run predates this schema change, the UI falls back to its creation time for first warning until actual steps begin to update `last_progress_at`. This is conservative and should not trigger an automatic restart.
- Production acceptance: open `https://app.mingeagle.com/app/discovery`, verify last actual step time, accurate pending/processing/review counts, safe-recovery availability, and unchanged two confirmed CRM customer IDs after manual recovery.

## CI
`scripts/test-discovery-stall.mjs` exercises UTC last-step staleness, idle/active lock protection, 409 on wrong state, explicit bounded recovery after expiration, previous DONE records and lead persistence, and UI hints. Existing discovery suites continue to test source handling, timeout, and 30-day consent/opt-out constraints.
