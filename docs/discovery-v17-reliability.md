# Customer Discovery V17 — bounded background steps and recoverable progress

The reported screenshot shows an HTML response parsed as JSON (`Unexpected token '<'`) while the page continues to show a processing state. Code review additionally found execution and polling tied to one request, a 150-second lease, sequential website checks and repeated deterministic failures, per-redirect rather than whole-page deadlines, and a CRM sync request without a timeout.

## Resulting behavior

- KICK claims a maximum of three work items and responds with the persisted snapshot. Pages `waitUntil` runs each claimed group after the response.
- A work item performs exactly one stage: source search, map detail, official-site lookup, official-site verification, public enrichment or CRM intake. The orchestration deadline is 20 seconds per step, with internal API deadlines of 17 seconds. This leaves room within Cloudflare's documented 30-second post-response window; interruption is handled through persisted claims, not assumed successful completion.
- Source search stores raw clues and associations before expensive verification. Pending school map facilities unrelated to the requested buyer type are excluded.
- Website enrichment uses one 6-second budget across all redirects per page, bounded response reads and a 5-second manual CRM-sync deadline. Automated intake syncs in its separate import stage.
- Independent progress reads continue every three seconds, including while a kickoff is pending. Client requests have a 15-second deadline and explicit HTML/non-JSON handling. Historical clear/restore/read actions use the same bounded transport with a 20-second deadline. A revision counter rejects out-of-order snapshots.
- Per-item completion and stage transitions are persisted immediately. The UI shows completed steps, current work items, last update and completed/total known items. Totals can grow when new clues arrive.
- Transient failures retry once. Missing or mismatched public evidence ends in REVIEW without automatic repeated lookup. REVIEW remains available for explicit retry.
- A 60-second lease prevents concurrent execution. Expired PROCESSING claims are recovered with bounded attempts. Claim tokens fence late results and background cleanup, including late enrichment errors. FINISH preserves imported customers and uncompleted clues, releases the active run and prevents late worker results from reopening it.
- The existing scheduler continues discovery once per minute, yields to an active worker and handles HTML/network errors. Daily outreach behavior and switches are unchanged. Discovery does not send outreach.
- Existing data migrates additively. Existing job scopes, candidates, clues and business records are preserved. Recoverable historical clear/restore also covers new run-clue associations; restored in-flight jobs are paused.

## Validation

`npm run test:discovery` runs four suites against actual bundled handlers, SQLite with atomic D1 batches, controlled public-provider fixtures and the actual client controller. Coverage includes full source→official verification→enrichment→CRM behavior, duplicate/ignored/contact evidence protections, recoverable clearing and conflict rollback; immediate kickoff, live per-item progress during a slow source, hard deadlines for non-responsive fetches, lease-expiry recovery, late-result fencing, HTML/502 failures, bounded retries, independent client polling, stale snapshots, cancellation and background scheduler failures. `npm run build` checks TypeScript and production frontend compilation. Wrangler builds all Pages Functions.

Online interactive verification is pending because cloud-browser automatic approval review rejected access due to the session usage limit. No alternative browser or authenticated HTTP workaround was used. Deployment checks are verified through the repository integration.

References: https://developers.cloudflare.com/workers/platform/limits/ ; https://developers.cloudflare.com/pages/functions/api-reference/
