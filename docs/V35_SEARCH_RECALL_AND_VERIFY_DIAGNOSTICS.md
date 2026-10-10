# V35 — recover real website buyers without false CRM imports

## The issue
The core public search formerly required a buyer's **search title or snippet** to explicitly contain the searched city. Many genuine local academies expose their location only on the official website/contact page; those records were rejected before verification and led to misleading zero-result runs.

## What changed
- Buyer-related website results with missing city mention in the **search snippet** are now eligible as **unverified source clues**, not customers.
- Prefer webpages whose snippets mention the requested location. Allow at most 2–8 additional *snippet-location-unknown* candidates per normal CORE query batch to bound provider fetch/cost and avoid overfitting broad basketball indexes.
- A record **cannot reach verified candidates / CRM** until the existing official-site verification finds a named independent institution, appropriate basketball/retail/supply business evidence, and the requested city/region on the website itself. Search terms or the selected city alone never count as location proof.
- Results with dictionary, betting, news, sport scores, social media / directories etc. remain excluded and private/network URLs are rejected by the pre-existing public URL checks.
- CORE source notes now distinguish how many webpages were returned, were buyer-relevant, had locality explicitly in the snippet, and need locality verification.
- Manual official website verification errors identify missing entity, geography, business fit, invalid URLs, or unreadable source. Unverified prospects remain pending review.
- Direct web verification responds with counts of the reasons pages failed and the number of pages actually inspected. This requires no extra provider requests.
- Automatic source work remains resumable; later steps verify website evidence and suppress opt-outs before CRM import.

## Acceptance
- The new Node mocked-site fixture demonstrates a local Dallas basketball organization being retained despite a city-free search snippet and passing **only** when its site confirms Dallas. A comparable Austin basketball site fails the Dallas check and must not be saved. Irrelevant dictionary sites are never fetched.
- Full discovery regression suite, TypeScript build and GitHub CI must pass before merge.
- This does **not** prove a live vendor search has returned valid US prospects, because production Cloudflare D1 credentials and actual source response statistics are not available in this session. Real acceptance requires checking a new small discovery job and the source/verification diagnostics on app.mingeagle.com.
- There is no new paid API, credential, background scan, bulk email, fabricated business directory or Cloudflare D1 migration. No real commercial messages are sent.
