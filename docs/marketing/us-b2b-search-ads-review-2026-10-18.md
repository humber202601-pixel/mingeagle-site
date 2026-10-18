# MING EAGLE 美国 B2B 搜索广告试验包（未启动）

**制作日期：2026-10-18 · 状态：DRAFT / NOT LAUNCHED / $0 SPENT。**
本文件是人工审核清单，不是 Google Ads 正式创建结果、投放批准、预估转化结果或成交数据。完整关键词、文案、排除词与 URL 见 [广告配置 JSON](us-b2b-search-ads-pilot-2026-10-18.json)。

## 为什么先做这四类，而不是大面积投放“silent basketball”

| 广告组 | 搜索目的 | 真实官网落地页 | 优先衡量 |
|---|---|---|---|
| school_bulk | 学校 / PE 批量采购 | https://www.mingeagle.com/for-schools.html | 有学校信息、10+ 数量、产品型号和 ZIP 的有效 RFQ |
| academy_training | 训练机构 / 篮球营 | https://www.mingeagle.com/for-coaches.html | 提供真实训练用途、认可非标准比赛球特征的样品询问 |
| wholesale_distributors | 运动零售商 / 经销商进货 | https://www.mingeagle.com/wholesale-product-catalog.html | 有数量与交付地区、要求明确的经销商询价 |
| custom_logo | 球队 / 学校 Logo 定制 | https://www.mingeagle.com/custom-basketball-for-teams.html | 带 Logo 图样、型号、批量、收货地的询价 |

*以上是投放假设，不代表任何群体已经有实际询单。产品不等同标准比赛用篮球，未经卖家审核的批发价/税费/认证不可承诺。*

## 人工开通与放行门槛（全部满足才可以花钱）

1. **需要另行明确授权广告支出上限**、每日预算和可用 Google Ads 广告账户；当前未获支付或自动开通批准。
2. 在广告后台选择仅搜索网络，面向美国实际所在用户；初期使用严格的精准/词组匹配，避免广泛匹配或展示广告消耗预算。
3. 检查每组关键词的实际搜索量和出价估算；没有这些真实数据时不要猜测 CPC、CPA、转化率或盈利。
4. 在后台配置 `utm_source=google&utm_medium=cpc&utm_campaign=us_b2b_search_pilot&utm_content={_megroup}` 作为 Final URL suffix，**需明确创建并验证每组自定义参数 `{_megroup}`**。无法支持时改为各广告组的字面值 `utm_content=school_bulk` 等（不要保留未展开的占位符）。
5. 在真实测试环境检查着陆页、点击后询价页、HubSpot CRM 来源保存链路，以及真实的 `QUALIFIED_RFQ` 事件。不能把纯点击、打开表单、机器流量当有效客户。
6. 计算广告每条有效询盘可承受的最大成本：**每单贡献毛利 × 询盘到付费订单的经验证转化比例**；目前缺这些真实数据，故不设置虚构的 CPA/ROAS 目标。
7. 获批准后先小范围测试，负面词包括 “free”, “DIY”, “NBA live”, “used”, “job” 等；每个广告组的排除词需再按实际搜索报告审查。
8. 逐次审核内容真实性、政府采购供应商身份、样品及税务措辞。广告批准不是产品资质审批。

## 文案检查和技术验收

- 每组 **8 条短标题**（上限 30 字符）、**3 条描述**（上限 90 字符），与对应官网页面的采购任务一致；广告平台允许组合展示，不意味着全部都会展示。
- 配置 18 个初始精准/词组匹配词，且不使用“官方认证供应商”“实测降低 X 分贝”“现货美国仓”等未经验证承诺。
- 独立 GitHub CI 通过 `scripts/check-us-b2b-search-ads-pilot.cjs` 核对四个公开着陆页、B2B 询价入口、文案长度以及 **DRAFT / 无账号 / 无预算** 门槛。
- 本次不会创建广告、启用付款、提交广告审批、群发邮件或修改真实客户信息。

## 真实观测指标

建议记录 `google_ads_clicks`、`google_ads_cost`、`real_RFQ_submissions`、`qualified_RFQs`、`approved_quotes`、`Stripe_verified_orders` 并分别标明统计时间范围。没有账户连接或测试时填 **NOT MEASURED** 而不是 0。广告引流与 AI 自然搜索引用分开统计。

## 相关官方文档

- Google Ads responsive search ad 内容与长度：https://support.google.com/google-ads/answer/7684791
- Google Ads Final URL suffix：https://support.google.com/google-ads/answer/9054021
- URL tracking：https://support.google.com/google-ads/answer/6273460
