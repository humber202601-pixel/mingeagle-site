# MING EAGLE V15 — current-site baseline

This branch is the safe V15 working branch for the public website.

## Source of truth
The public frontend baseline is the currently published `www.mingeagle.com` V11 package deployed by `.github/workflows/deploy-pages.yml`.

## Product scope for this phase
Keep the current silent-ball product line only:
- Flocked Silent Basketball Set
- Fabric-Cover Silent Basketball Set
- Weighted Flocked Silent Basketball
- Flocked Silent Soccer Ball

Preserve the current creator/TikTok Video Wall, Play Stories, Wholesale, inquiry flow, order tracking and policies.

## Explicitly out of scope for now
Do NOT add basketball uniforms, soccer uniforms, jerseys, training shirts, team socks, shin guards, team bags, Custom Studio or Team Packages to the public website in this phase.

## V15 backend integration rule
Backend/CRM/quote/order capabilities may be upgraded behind the website, but must not change the current public product assortment or visual structure unless separately approved.

The production-safe route is:

`www.mingeagle.com V11 form -> https://ming-eagle-sports.floot.app/_api/inquiry -> existing email + HubSpot capture -> app.mingeagle.com growth-engine CRM`

The public MEQ/MES reference is reused by the growth engine for idempotency, so retries do not create duplicate leads.

## Release guard
The V15 branch workflow must refuse release if any of these regressions occur:
- homepage has fewer than 6 TikTok player embeds;
- Video Wall has fewer than 16 TikTok player embeds;
- any out-of-scope apparel/team-supply content appears;
- any of the four current public products disappears;
- the published Floot inquiry bridge is missing.

## Verified before public release
- Floot backend was republished successfully at `https://ming-eagle-sports.floot.app`.
- Native `application/x-www-form-urlencoded` form parsing was tested without creating a CRM record.
- The V15 static candidate scan contains all four current products and none of the explicitly forbidden apparel/team-supply terms.
- `app.mingeagle.com` reports `MINGEAGLE_GROWTH_ENGINE_V15_WEBSITE_BRIDGE_2026-10-05` with the website inquiry bridge enabled.

Do not update the `main` GitHub Pages deployment until the user approves the final V15 candidate.
