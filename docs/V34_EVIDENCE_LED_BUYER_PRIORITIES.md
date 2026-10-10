# V34 — Evidence-led customer discovery priorities

## What changed
- Conversion analytics reuses the authenticated V33 discovery cohort already fetched by the browser, calculating conservative client-type recommendations across all 17 supported discovery categories **without an extra D1 request**.
- The top recommendations include an explanation and suggested next action grounded in customer counts, actual CRM outbound records, replies, non-draft quotes and real orders. No predicted revenue or invented reply rates.
- When contactable clients have not been contacted, **review those first** before spending more website/provider requests searching the same category.
- A category with >=10 contacted CRM leads, >=2 customer replies and at least one non-draft quote or real order can be suggested for a **small additional discovery test**. This is only a signal from recorded activity, not proof of future success.
- >=10 contacted and >=2 replies with no commercial proof remains a reply signal, not validated purchasing; >=10 contacted and low observed replies suggests a message/data-quality review first.
- With fewer than 10 outreach records, feedback is **insufficient**: keep the type available for limited exploration rather than automatically excluding or misranking it. Categories with zero records retain catalog order; no misleading ranking is shown.
- Recommendations use **DISCOVERY**-source CRM cohorts. Website-initiated enquiries have different funnels and are not folded into the selection model.

## Operating workflow
1. Open `https://app.mingeagle.com/app/funnel`; set source to `主动发现客户`.
2. View **V34 · 下一批开发范围建议** and the supporting actual CRM counts.
3. **Existing uncontacted clients:** click the `潜在客户` link and review customer profiles before any outward messaging.
4. **Search recommendation:** click `带入搜索类型` to open `/app/discovery?customerType=<allowed buyer type>`. The same category is applied to one-click discovery and manual advanced discovery; the operator must still pick state/city/target and click Start.
5. A previous active or paused discovery job retains its original scope until it is completed/paused. A previous finished job cannot override a newly recommended category.
6. No background search, automatic first outreach, new API keys, migrations, paid service, separate tracking DB or periodic analytics queries.

## Limitations and production acceptance
- Signals are not randomized experiments, may be skewed by data collection biases, and should never be called causal predictions or reliable conversion rates.
- An unrecorded email, phone call or off-CRM deal is not in the evidence. A declared paid CRM order is not proof of cleared bank funds.
- The operator should test 2-3 customer categories with small real verified cohorts, manually approve any first contact, log replies, quotes and orders, and compare those verified results over time.
- CI exercises thresholds, no-data behavior, all 17 categories, query-param allowlist, started-job protection and no auto-run. Live D1 customer counts are not accessible without user admin access; do not fabricate outcomes.
