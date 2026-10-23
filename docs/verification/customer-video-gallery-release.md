# Selected customer video gallery — 2026-10-23

The existing 80 written five-star US reviews and 19 photos remain intact. Added four matched buyer videos to the existing one: family play (37s), orange size 5 demonstration (8s), blue size 3 unboxing (15s), and orange size 3 demonstration (17s). The complete original clips and audio are retained; delivery encoding and unretouched poster extraction only. Source rows, original review wording, product variants, durations and source/published hashes are in `customer-videos-evidence.json`.

The gallery shows three equal-width poster cards initially, with two more revealed by **View more videos**. On phones the cards form a single column. Each card includes the correct original review, date and variant; the longer review expands independently. All five videos play in the existing accessible native dialog with controls. No gallery MP4 is requested before a visitor opens it. Closing pauses and removes the player and returns focus. Without JavaScript, all gallery posters and source disclosures remain visible; the original TikTok listing remains linked.

Screened out unrelated social recordings, different-ball footage, dark/poorly framed clips, mixed feedback and delivery complaints. Three remaining source rows were not selected. This is a curated collection, not a complete feed or aggregate score. Creator collaboration videos remain separately identified.

The complete customer media collection is 4,783,699 raw bytes after encoding. The explicit lazy-media cap changes from 2 MB for one clip to 5 MB for five clips plus posters and 19 photos; individual video and image limits and all existing storefront resource budgets remain unchanged. Budget tests verify that 5.1 MB across individually valid videos fails.

Validation: source/content hashes, five-star US product mapping, retained durations, unique assets, five-card/three-visible markup, source disclosure, preserved 80-review content, filter/load-more/sort checks, JS syntax, performance budget regression tests and static build. Deployment workflow and live interaction verification are completed before delivery.
