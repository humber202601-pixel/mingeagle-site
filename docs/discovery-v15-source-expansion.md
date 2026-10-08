# Customer discovery V15 — source expansion and frontend/backend review

## Result

All source cards are independently selectable. NCES no longer depends on selecting an elementary/high-school buyer type. OSM can run with an empty city and rotates through major cities in the selected state. Government school data is stored with its real school/district type rather than the current commercial search type.

Added official private-school and independent district catalogs, Geoapify category-based place clues, and five-website batches that extract institutional Facebook/TikTok/Instagram/LinkedIn profiles from verified candidate websites. Directory queries now cover chamber directories, Yellow Pages, BBB, Manta, government and education sites. Major-city lists for TX/CA/FL/NY have expanded.

## Efficiency and controls

- Up to three sources run concurrently, with separate progress, independent successful cursors and one to three consecutive batches.
- Successful cursors persist across refreshes; failed/partial sources can be retried alone without advancing past failures. Stop ends subsequent queued tasks while current requests finish.
- Per-source clue limits follow the selected target, capped at 50 per request. Candidate website batches remain capped at five.
- Exact region/type filters, literal keyword searches, source/status filters, pagination and current-page CSV export.
- True found/new/updated/retained counts. Ignored and converted clues preserve their state. Stable OSM keys deduplicate across map providers.
- City-boundary POIs can be retained when city tags are absent, with explicit uncertain-city evidence; explicit wrong-city records are rejected. If boundary geocoding is unavailable, OSM uses only explicit city tags within the selected state.

## Other fixes

Prevent page headings such as “Clarissa Playing Career” and “Expert Interview If” from becoming contact names. Complete quoted-status and buyer-type display labels. Show loading/failure states for communications and quote lists instead of reporting an empty list while loading or after failure.

## Validation

`npm run build`, `npm run test:discovery`, and `npx wrangler pages functions build` pass. SQLite integration fixtures cover new catalogs, true types/counts, literal filters, map pagination and boundary handling, shared map keys, website batches, credential-free source evidence, and ignored/converted protection. No tests send messages or record payments.

Production acceptance is recorded after deployment. Sources cover US states; indexed social search covers publicly indexed profiles, while official-website discovery provides a complementary route. Official data retains public 2024–25/private 2023–24 school vintages and requires current business/website verification. Search clues are not automatically classified as buyers or added to CRM.

## V15.1 live-result fixes

The first live all-source batch produced 84 new clues, including 60 official school/district records, 19 map records and 5 new website-linked social profiles. Overpass returned HTTP 500, so the revised map adapter falls back to original-ID OSM records delivered by Geoapify and explicitly identifies this route. Shorthand OSM n/w/r identifiers are normalized; pre-existing Geoapify IDs migrate without restoring ignored/converted clues. Successful map responses share a five-minute public-data cache. Source workers immediately claim the next queued source rather than waiting for a whole group.

Live map results also exposed irrelevant swimming, cheerleading and climbing venues. These are now excluded for basketball-focused searches; recreation centers retain their correct buyer type, and identical-name/address map records merge within a response.

## Source provenance and final acceptance

A deduplicated clue can be discovered through several channels. A separate discovery_clue_sources table now retains each observed source and its evidence, so selecting OSM or Geoapify still finds shared records. Overall batch updates count distinct clue IDs rather than double-counting cross-source updates.

Production V15.1 completed Dallas map + website-social discovery in approximately five seconds: OSM fallback 8 / Geoapify 8 / website social 7, with no new duplicates. Ten explicitly unrelated basketball-search venues were moved to the reversible ignored list. Public pages reviewed: home/products/product imagery, GUIDE FAQ, CUSTOM LOGO English/Spanish switch, inquiry request-type validation. Backend dashboard, leads, inquiries, companies, contacts, communications, automation, quotes, orders and tasks rendered. No live messages or payment actions were performed.
