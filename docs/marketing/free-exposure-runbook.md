# MING EAGLE 免费曝光长期执行规则

用户已授权长期、零广告预算推进官网与公开推广。官网正文发布仍执行分支、PR、CI、合并及实际部署核验。

- 每日任务：MING EAGLE 免费曝光推进（Asia/Shanghai，每日上午约8点，允许平台灵活调度）。沿用已有 Google 搜索统计与网站真实流量同步。
- 最新商业方向：官网以批发客户为主，优先学校、训练机构、俱乐部、零售商和经销商；零售保留为空运样品及小批量试购入口，TikTok承担零售引流。优先级为学校采购、批发目录、定制篮球与样品评估；公寓和家庭内容作辅助入口。不得用大量重复页面、刷评或无关评论链接制造曝光。
- 信息源：product-master.json、retail-prices.json、us-single-parcel-shipping.json、retail-checkout-scope.json。确认全国1–9件的规则时以实际 checkout-status 为准；不改付款、税务或退款政策。
- 所有原创内容说明 MING EAGLE 商家身份。没有独立实验数据，不写声学百分比、分贝指标、绝对静音、认证或顾客评价。

## 当前公开资源

1. https://www.mingeagle.com/for-schools.html#free-school-session
2. https://www.mingeagle.com/silent-basketball-for-apartments.html#free-apartment-games
3. https://www.mingeagle.com/custom-basketball-for-teams.html#free-logo-brief

各页有匹配的免费下载文本与用户主动分享入口。不收取资料费，不索取邮箱。仓库 README 也链接这些实际资源。

## 站外发布队列

free-exposure-queue.json 已按批发优先策略改写8条英文文案，包含商家身份披露、B2B/样品落地页及按渠道区分的UTM链接。当前全部是草稿；没有社交账号连接或实际公开发布回执，不得标记为已发布。先使用 Metricool 的免费额度；额度用完等待重置，不升级付费。品牌账号需一次连接，个人账号不默认当作品牌账号使用。

优先渠道为自己的 Pinterest/Instagram/Facebook/YouTube 品牌内容。群组或 Reddit 仅在具体社区规则明确允许该类型商家资源时选择性贡献，不自动跨群灌广告、不私信群发，不创建假账号或绕过限制。Metricool 当前不能替代群组规则审查。

官方规则与接口资料（使用前重新核实）：
- Google AI 搜索：https://developers.google.com/search/docs/appearance/ai-features
- Google 搜索反垃圾：https://developers.google.com/search/docs/essentials/spam-policies
- OpenAI 搜索抓取：https://developers.openai.com/api/docs/bots
- Reddit：https://support.reddithelp.com/hc/en-us/articles/360043504051-Spam
- Pinterest：https://help.pinterest.com/en/business/article/before-you-get-started-with-catalogs
- Metricool 免费MCP与限制：https://help.metricool.com/mcp-limits-and-plan-requirements-h72jg

## 记录与复盘

每次推进记录实际修改、PR/提交、CI、生产部署及验证网址。站外发布后必须读取回执，登记 publicPostUrl、publishedAt、平台账号和实际结果。没有回执时保留失败或草稿状态，避免重复发布。只报告实际Google收录、搜索展示/点击、可验证AI引用及匿名引流指标；IndexNow收到提交不等于收录。零数据、数据延迟或无访问权限均保留真实含义。

2026-10-15核验：Metricool插件可以调用，品牌7430045的API明确返回尚未连接任何社交网络。已安装插件不等于已连接Facebook/Pinterest等品牌账号；未取得发布回执，当前公开社交发布数仍为0。连接入口：https://app.metricool.com/brands/connections?blogId=7430045 。Google Merchant Center 尚未授予接口权限，Bing Webmaster API 尚未接通；这些渠道不列为已启动。允许在已有官网、GitHub和搜索数据访问范围内继续独立执行。


## 2026-10-15：学校页面搜索意图对齐

- GSC 正式属性：`sc-domain:mingeagle.com`；本轮数据已结算至 2026-10-12（America/Los_Angeles）。
- 最近 28 天：6 次展示、0 点击；2026-10-12 当日 3 次展示、平均排名 12.67。此前 2026-10-11 为 3 次展示、平均排名 55.67。
- 已确认查询与落地页：`basketballs for schools` → `/for-schools.html`（1 次展示、平均排名 26）；`basketball with logo` 与 `logo basketballs` → `/custom-basketball-for-teams.html`。
- URL Inspection：`/for-schools.html`、`/custom-basketball-for-teams.html`、`/custom-logo.html`、`/silent-basketball-for-apartments.html` 均为 `PASS / Submitted and indexed`，抓取允许，用户声明 canonical 与 Google canonical 一致。
- 本轮实施：将学校页标题、描述、主标题和可见问答与已出现的学校采购搜索意图对齐；新增 WebPage、BreadcrumbList、FAQPage 结构化数据；明确“更低冲击噪声不等于完全静音”；更新站点地图 lastmod。
- GSC 的 Sitemaps 汇总暂显示 25+4 个 URL、0 indexed，而 URL Inspection 与搜索展示已证明部分页面已收录；因此保留两类指标，不把 Sitemap 汇总的 0 误读为整站未收录。
- 站外队列仍全部为草稿：没有连接品牌社交账号，也没有公开发布回执或独立 AI 引用证据，因此未登记任何“已发布”或“AI 推荐”。

## Verified brand-channel setup — 2026-10-15

Pinterest business account `mingeaglecommerce` is live as MING EAGLE, with wholesale-first description, official website and public business contact details. Two original 1000×1500 planning infographics were published, with AI-assisted content disclosure, alt text and UTM-tagged links:

- School activity: https://de.pinterest.com/pin/1149192029968368240/
- Team quote checklist: https://de.pinterest.com/pin/1149192029968368476/

Both public Pins and their destination links were inspected. Actual publish timestamps are unavailable; queue records verification time separately. Do not republish these queue entries. No reach, clicks, inquiries or independent AI recommendation are claimed. Metricool is still unconnected and its web session requires login. Native publication does not imply automatic scheduling is active.

YouTube company channel name/handle are prepared but final creation accepts YouTube Terms and needs action-time confirmation. Instagram public signup fields are prepared; new password, real birthday and final registration require user completion. Facebook and LinkedIn need owner sign-in. TikTok needs registration or the existing brand login. Do not modify unrelated personal profiles or the existing YouTube channel.

The editable infographic SVGs, rendered PNGs and plain MING EAGLE social wordmark are stored in public/assets. Use only verified brand accounts, no paid upgrade, no bulk unsolicited outreach.

### Website claim and Metricool login follow-up

Pinterest confirmed website ownership of `www.mingeagle.com` on 2026-10-15. The public verification tag and three marketing PNG assets are live with HTTP 200; deployment and public-form CI succeeded for PR172 (`9af23f08f1016caf15b921b951ce8a801cc84edb`). The social wordmark is visible on the Pinterest profile.

The user completed Metricool login manually. Its current web brand is `7436627` (renamed MING EAGLE), whereas the installed connector still reports no network for `7430045`. Do not guess that the connector can manage the new brand or send queued posts until the account mismatch is reconciled by an actual successful read. Pinterest OAuth is open for the MING EAGLE account. It requests public/private board and Pin read/write/delete, account/follower read and ad-data read permissions. The final grant has not been clicked and needs user action-time confirmation. No paid plan or ads were started.
