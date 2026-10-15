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

## Native Pinterest scheduling and YouTube setup — 2026-10-15

Following the user’s action-time confirmation, Pinterest granted Metricool access and its Connections panel showed business account `mingeaglecommerce` connected to brand `7436627`. The native planner is on the Free plan (0/20 posts published this month at setup) and uses Asia/Shanghai. No paid upgrade was started.

A new MING EAGLE YouTube brand channel was created: https://www.youtube.com/channel/UCMyIMO2mCzAGcJ9GqRF4dNQ (`@mingeaglecommerce`). Switched into that new brand and saved its wholesale-first description, public business email and official website link in Studio. The existing Rubber Flooring Expert channel was not edited. Public profile recheck was subsequently blocked by browser automatic approval review after a usage-limit rejection; no alternate route was used to bypass that block.

The installed Metricool connector still refers to `7430045`; an actual scheduled-post read for the observed new brand `7436627` returned Access denied (403). It must be reauthenticated to the same Metricool account before connector-based autonomous scheduling can be enabled. Native web scheduling remains authorized and separate. Do not retry the denied connector read without a connection change, and do not claim that all future autonomous social operations are enabled.

Three additional original 1000×1500 infographics and editable SVGs are prepared: bulk purchasing brief, four product families, and no-bounce apartment activity ideas. The first native scheduled item is already visible on the calendar for 2026-10-16 08:00 Asia/Shanghai. Other submissions require final list verification before their queue entries are marked verified.

### Final native list verification

Verified the native Metricool List view using its built-in Previous, current and next month range (2026-09-01 through 2026-11-30). Exactly three rows show Pending: bulk brief on Oct 16, product-family guide on Oct 19, and apartment activities on Oct 22, all 08:00 Asia/Shanghai. All three include uploaded original media, a real selected board, titles and UTM-tagged destination URLs. These are saved schedules, not public post receipts. Native internal post IDs and eventual public URLs are not available yet and are deliberately left null.

The apartment board Indoor Play Ideas & Quiet Games was created through the authorized native connection; actual ID `1149192098607199500`. The two earlier public Pins must not be duplicated. With the three saved schedules there are five distinct Pinterest campaign items, of which only two are currently published. The Free plan showed 20 monthly posts, with 0 yet published through its planner at setup; do not interpret that as a promise of unlimited scheduling.

Instagram public email/name/handle are still populated and the chosen handle is valid in its signup UI, but password and real birthday remain unfilled. The owner must enter new credentials and complete signup verification. No password or OTP is stored in this repository. Facebook, LinkedIn and TikTok remain pending their actual owner login or registration.

### Keep campaign-only graphics outside the website payload

PR174 initially put its three new social-only PNGs under public/assets, which exceeded the existing first-party image budget. These graphics are used by Metricool/Pinterest and are not referenced by website pages, so move the three PNGs and editable SVGs to docs/marketing/assets. Native uploaded media and saved schedules are unchanged; reusable queue media URLs reference the public GitHub source files. Do not increase or disable the website performance budget for off-site marketing assets.


## Facebook Page creation and first native publication — 2026-10-15

The owner completed Facebook registration manually. After the user explicitly confirmed creation and acceptance of the displayed Page policies, the native wizard reported MING EAGLE created. The completed Page is https://www.facebook.com/profile.php?id=61594156866139 . The numeric public profile identifier is recorded separately from any unverified Graph API Page ID; no custom username has been set yet.

Saved the wholesale-first English bio, sports-goods-store category, official website, public business email and +86 business phone. Uploaded the existing brand wordmark and a new editable vector cover. The visible Contact Us button links to the wholesale page with Facebook UTM parameters. No storefront address or unsupported business hours were entered. WhatsApp linking remains incomplete because it requires owner verification.

Published queue entry FB-BULK-001 through the native Page composer under the MING EAGLE identity, with a public audience, the original bulk-purchasing infographic, custom alt text and the campaign URL. The UI explicitly reported the post published, and its standalone permalink showed the actual body, image and UTM destination:
https://www.facebook.com/permalink.php?story_fbid=pfbid02jPQc7yccPGR1ZYcvVGTfbxsvKdTXgnKtCghCy19nVWdp2oY6wiwoCKxtUWgZP6zil&id=61594156866139

Do not republish FB-BULK-001. Exact publication time is unavailable; the queue stores verification time separately. No reach, leads or AI recommendation are claimed. No paid boost or unsolicited group sharing was used.

Started connecting the new Page to native Metricool brand 7436627. Basic login shared the already-public business email and owner profile; the final Page-management permission grant has NOT been submitted. Narrowed the pending grant to read_insights, pages_manage_posts, pages_manage_engagement, pages_read_engagement, pages_manage_metadata, pages_read_user_content and pages_show_list, with only MING EAGLE selected. Disabled catalog, advertising, business-management, private messaging and all Instagram permissions in this pending grant. The final Continue also references applicable terms and requires action-time confirmation. Facebook must remain metricoolConnected=false until both grant and native connection are visibly confirmed.

The ChatGPT Metricool connector still has the previously verified account mismatch and 403; native Page OAuth does not fix that connector identity. Three existing Pinterest schedules are unchanged. Instagram, LinkedIn and TikTok are still pending actual completed owner registration/login.

Cover SVG/PNG are in docs/marketing/assets and intentionally excluded from the public website payload. No credentials, one-time codes or OAuth callback URLs are stored.

## Facebook connected and visual production upgrade — 2026-10-15

After the user explicitly accepted the displayed Metricool management scope and terms, the native Page selector showed MING EAGLE, Page ID `1406582449205088`. Selected that exact Page and verified the success message “Facebook is now connected” plus the connected Facebook and Pinterest cards for brand `7436627`. The seven previously narrowed Page scopes are now recorded as granted. The installed ChatGPT connector still points to `7430045`; this native connection does not resolve its previous 403 or enable connector-based autonomous scheduling. No denied connector read was retried.

The user chose the existing homepage weighted flocked basketball hero (`public/assets/hero-weighted-flocked-silent-basketball.webp`) as the preferred reference. Kept the website image and original wordmark unchanged. Created premium warm-gym, tactile-product social art with the built-in ImageGen workflow and actual product references. Final selected PNGs were retained; production JPEG copies only change encoding. Prompts and future design direction are recorded in `docs/marketing/social-visual-direction-20261015.md`. No unsupported acoustic figures, testimonials, endorsements or product specifications were added.

Applied `facebook-training-cover-v2.jpg` as the Page cover, verified native cover photo ID `122101307403471895`, and inspected the saved desktop Page. The composition was refined for crop safety; a native mobile preview was not tested. Updated the image on existing FB-BULK-001 using `pinterest-bulk-order-brief-v2.jpg`, saved custom alt text and enabled the AI-content label. Verified the same public permalink, unchanged body/UTM destination, new photo ID `122101312545471895`, and visible AI-content disclosure. This was an edit, not a new campaign post.

Edited all three existing native Pinterest schedules to use revision-2 JPEGs: PIN-BULK-002 on Oct 16, PIN-CATALOG-003 on Oct 19 and PIN-APARTMENT-004 on Oct 22, all 08:00 Asia/Shanghai. Each edit retained its title, body, board, UTM destination and date. The native list still shows exactly three Pending posts; no duplicates were created. Native Metricool automatically scales the portrait images to 1000×1500. Custom alt text and AI labels on these scheduled native Pin attachments were not separately verified. Native internal IDs and eventual public post URLs remain unknown.

Facebook draft entries are now ready for native scheduling but remain unpublished and unscheduled. Instagram, LinkedIn and TikTok still require their existing owner-registration/login steps. No paid advertising, plan upgrade, unsolicited mass outreach or unverified reach/AI-recommendation claim was introduced. Social-only JPEGs remain under docs/marketing/assets, outside the website payload budget. No credentials, verification codes or OAuth callback URLs are stored.

## Useful-content scheduling expansion — 2026-10-15

Created two additional premium ImageGen campaign graphics using the user's homepage weighted flocked basketball reference: `school-no-bounce-session-v2.jpg` and `team-artwork-checklist-v2.jpg`. The school timing matches the actual free activity sheet (five two-minute stages); the team guide uses authorized-artwork and sample-approval language, without treating a screen preview as final print proof. Retained generated PNG originals and created JPEG encoding copies only. No website source, payment behavior or image budget was changed.

Saved six new native schedules: Facebook catalog on Oct 16 at 20:30; apartment activities on Oct 18 at 08:00; school session on Facebook and Pinterest on Oct 21 at 20:30; and team brief on both on Oct 25 at 20:30. All times are Asia/Shanghai. The three original Pinterest schedules remain Oct 16, 19 and 22 at 08:00. Final native List verification showed exactly nine Pending rows: four Facebook and five Pinterest. These are saved schedules, not published receipts or evidence of follower growth. Native provider IDs and future public URLs are still unknown.

Each new post has a real uploaded image, custom alt text and an explicit AI-assisted illustration disclosure in the caption. The two networks use separate copy and UTM destinations; Pinterest school and team board IDs were verified. Native automatic portrait resizing is informational. No paid plan, boost or unsolicited mass sharing was used. Do not duplicate saved schedules.

During a later continuation, the browser session had expired. The owner completed secure Metricool sign-in; the fresh target page restored brand 7436627. Recovered the future-date list filter and confirmed the Oct 18 post had saved before creating anything else. This avoided duplicate submission after an unknown upload result. The installed ChatGPT connector mismatch is unchanged and was not bypassed.

Instagram now shows an SMS verification checkpoint; the brand identity and completed creation are not yet verified, so created is unknown rather than true. No phone number, OTP or account credential is recorded. LinkedIn still requires owner signup/login before company-Page creation; only public business email was prepared. TikTok remains at signup or existing-brand login selection; check the existing ACCU retail identity before creating a duplicate. YouTube's earlier browser-review block remains unresolved and was not retried.
