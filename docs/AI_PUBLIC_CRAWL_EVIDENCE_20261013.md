# MING EAGLE GEO · 29 页正式环境可抓取性验收

**目标**：当 Google Search Console 对某个新网址返回 `URL is unknown to Google` 时，检查是否存在官网上线遗漏、HTTP 错误、错误主域规范化、`noindex` 或人工/机器人 UA 请求被拦截。此报告不把网页可访问性当作平台的实际收录或 AI 引用。

## 数据来源和可信边界

- 官网静态源：`public/sitemap.xml`（25条）及 `public/sitemap-localized.xml`（德、法、西、葡各1条），目前合计29个 canonical 公共网页；首页、销售页面、产品和各语言指南均纳入。
- GitHub Pages 在正式部署后执行 `python scripts/check-live-public-crawl.py`，从独立 GitHub Actions Runner 通过 HTTPS GET 全部29页。检查200状态、没有意外跳转、`text/html`、正文大小、规范网址唯一且与 Sitemap 相同、`noindex`、页面标题、唯一H1、html语言以及四个翻译页面语言标签。
- 另对家庭与学校核心指南分别用 Googlebot、Bingbot、OAI-SearchBot、PerplexityBot、Claude-SearchBot *名称*进行合计10次 HTTP 兼容性模拟访问，仅作为 **诊断警告**；UA 字符串可伪造，且真实官方爬虫须具备经过平台 IP/rDNS 验证的身份，因此模拟响应**不能证明真实爬虫访问，也不能用于放行 WAF**。
- 测试生成 `public-crawl-audit.json`，GitHub Actions 保存14天。全部29个常规请求中任一失败，则官方 GitHub Pages 工作流标红以提醒及时修复。但这只是**发布后 QA**，工作流变红不意味着新代码已自动回滚。
- 只能通过已授权 Cloudflare Zone 的 HTTP Logpush/GraphQL及官方 bot 身份来分析历史真实请求。目前已连接的 Cloudflare 账户 `GET /zones` 返回空列表，无法从此连接读取 mingeagle.com 的机器人日志；CRM app Pages 与官网 GitHub Pages 的访问日志不能混淆。

## 2026-10-13 04:xx UTC Google 实际基线

- GSC Wizard URL Inspection Tracker：29追踪，12 indexed，17 not_indexed。17项细分为16项 `URL is unknown to Google`、1项 `Discovered - currently not indexed`（order-status）。这些均是当前逐页检查样本状态。
- `indoor-school-sports-equipment-guide.html` 已被 Google 收录；`quiet-indoor-sports-for-kids.html` 尚未发现。Google 截止2026-10-10的已结算搜索日记录不显示搜索曝光；尚不能解释为当前没有未来用户访问。
- IndexNow 密钥已发布验证，两轮重要产品页/学校页与四个本地化 URL 的发送记录已显示 HTTP200；仍不能推断 Google/Bing 收录或 Copilot 引用。
- Bing Webmaster Tools API 凭据未连接 `list_bing_sites notConfigured:true`，不能提取其官方 AI Performance 数据。CRM 的 Bing CSV 导入依赖运营人员从已授权站点的官方界面导出后上传，并明确标记运营员证明数据来源。

## 后续实际验收

如果29页全绿但 Google 仍报告 unknown，说明能排除部分官网技术发布错误；请观察 Google 自己的抓取时效，不要人为虚构“提交即收录”。重点围绕真实客户问题提高独立内容质量、真实外部引用、可核实的产品证据与合规购买路径。