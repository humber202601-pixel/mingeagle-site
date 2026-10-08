# Discovery V16 — One-click intake and recoverable history clearing

The primary discovery screen now asks for location, buyer type and search depth, then automatically searches relevant sources, locates official websites, verifies institutional identity and business fit, enriches public details and adds verified institutions to the existing CRM prospect workspace. Manual tools remain available in a collapsed advanced section.

## Pipeline

- Durable D1 runs and per-source/per-record checkpoints; three source requests or two record operations per step.
- Official website search plus maps/directories/public social indices; schools use the appropriate public/private/district catalogue.
- Exact name, business and locality checks remain in effect. Missing official sites and failed verification remain exceptions, rather than unqualified CRM entries.
- Relevant contact/staff/coach/procurement pages are read concurrently. Public person, email, phone, WhatsApp and institutional social profiles retain source evidence. Facebook/TikTok and available map/catalogue addresses are preserved in CRM.
- Available public fields are completed; unavailable fields are explicit. Verified institutions without direct phone/email still enter CRM for development.
- Independent deduplication and ignored/do-not-contact protections; automatic second attempts, retry-failed-only, pause/resume and a leased worker step.
- Browser automatically advances the current job. The existing scheduler also advances jobs every five minutes; its original daily follow-up schedule is unchanged. Discovery does not queue or send outreach.

## History management

- Clear prior discovery jobs, source clues/associations, candidates, run cursors/checkpoints and unlinked DISCOVERY CRM prospects, contacts, companies and related development records.
- Commercial links (inquiries, quotes, orders and samples) protect business archives.
- Archive and clearing are one atomic D1 batch. Admin UI provides restore. Restore conflicts rollback without overwriting current data; unfinished restored runs are paused.
- No credentials, settings, products, payments or fulfillment records are cleared.

## Validation

`npm run build`, all three discovery regression suites and Cloudflare Pages Functions compilation passed. New tests cover complete automatic intake, public-contact and source evidence, cross-source deduplication, late address convergence, noninvented missing fields, pause/resume, error recovery, lease locking, atomic cleanup/restore, restoration conflicts, 200+ record cleanup and protected commercial archives. No outreach was sent during testing.
