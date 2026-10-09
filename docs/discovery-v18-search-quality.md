# V18 search quality and zero-result diagnosis

## Live investigation

User run: Texas, Basketball Training, blank city, target 20, one batch. All eight source work items finished; 19 map clues, zero candidates and zero CRM leads. OSM supplied 11; Geoapify supplied eight. Official web, directory and four social channels supplied zero. Those six web channels shared Bing RSS. The 19 clues included softball, track, bowling and generic fitness facilities. Fourteen had no verified official URL; five failed entity/business/location verification. A completed source request was being confused with a successful customer search.

A separate manual control test supplied Dallas Hoopers, Dallas Elite Athletics and Yancy Academy official URLs. All three passed the existing verification and were saved as candidates. This confirms legitimate institutions can pass verification; the control test is not evidence that automatic discovery found them.

## Changes

- Require positive basketball name/tag evidence for basketball-specific map types. OSM sports-centre queries require a basketball sport tag. New Geoapify cache version avoids reused broad matches.
- A primary public index returning no eligible results triggers at most two ordinary DuckDuckGo HTML queries, each with a 4.5-second deadline. Official-website lookup also has a bounded alternate query. The same public-URL, city, platform, entity and business checks apply. Challenges are reported, never solved or bypassed.
- Distinguish empty query results from unavailable providers; report primary/fallback counts and reasons.
- Show returned clue counts and source notes in one-click progress. Clarify blank-city searches rotate selected metros rather than traverse every city in a state.
- Zero-import completion explicitly says no customer was verified and imported. It does not claim no prospective customers exist in the selected region.
- Exclude Wix website-builder footer accounts from institution social profiles; current deeper enrichment also removes those exact vendor URLs from existing candidates while preserving legitimate profiles.
- Keep V17 step deadlines, independent progress polling, token fencing, bounded retries and no-outreach protections.

## Verification

Five discovery suites include realistic irrelevant map names, search parsing, public URL and redirect checks, alternate-index completion through verification/enrichment/CRM, unavailable vs empty results, protected data, pause/resume and lease fencing. Production build and Pages Functions compilation are required before publication. Automatic live discovery must be checked separately; fixture tests and manually supplied websites do not demonstrate live automatic recall.

## Live follow-up and additional safeguards

The first new automatic Dallas test still imported zero customers. The primary RSS returned dictionary and San Francisco indoor-activity pages for basketball/Dallas queries. Some alternate queries returned directory clues, while others presented human-verification challenges. This live result does not demonstrate working automatic discovery.

Additional safeguards exclude primary/alternate hits without basketball business and location evidence in their title or snippet (the submitted query is never evidence). A challenge records a 30-minute provider backoff shared by backend steps; no later request is made to that provider during the restriction. Zero-result sources with unavailable fallback become REVIEW instead of implying successful search. Basketball-tagged generic gyms and community centers preserve their real buyer classification.

Reliable commercial automatic discovery still needs an available supported search provider/API; no paid service, account or credential was created. Manual official-site intake remains independently verified.
