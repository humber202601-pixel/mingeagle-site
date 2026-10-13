# Bing / Copilot AI Performance · 手工 CSV 报表接入与真实性边界（2026-10-13）

MING EAGLE 官网：`https://www.mingeagle.com/`。CRM 入口：`https://app.mingeagle.com/app/growth`。

## 官方来源
Bing Webmaster Tools 的 AI Performance 页面：https://www.bing.com/webmasters/help/ai-performance-9f8e7d6c

微软说明可导出 **Pages** 和 **Grounding Queries** 的 CSV/Excel 报告；引用次数属于跨 Copilot、Bing AI 和部分合作方的采样聚合，**不等于点击、访问、销售或全量引用日志**。不要把不同报告视图的数据相加，不要以引用量证明内容优化与增长具有因果联系。

## 当前连接状态
2026-10-13 GSC Wizard `list_bing_sites` 实际返回 `notConfigured:true`。官方 Bing API 凭据尚未连接，**本模块不声称已从 Bing 官方 API 自动取得和验证报表**。如果用户有 Bing Webmaster 后台访问权限，可在正确验证的 `mingeagle.com` property 导出 CSV，手动选择日期和确切的「网页/检索主题」列与「引用次数」列，并声明是本人真实导出。

## 安全性
- 管理后台认证及 same-origin 保护；服务器只允许 HTTPS `www.mingeagle.com` / 历史 apex 的 **25 个已知公开页面**；拒绝外站、报价 token、邮件/订单 URL 参数和伪造站点。
- 检索主题只能是短的、非个人化聚合短语。拒绝邮箱、长数字（疑似手机号）、URL、HTML 和多行聊天记录。
- 数据库表 `bing_ai_manual_imports` / `bing_ai_manual_rows` 与 `ai_visibility_observations` 完全独立。
- 每次导入追加式快照；报表缺失显示 **未知**，不要默认零。不同日期区间的来源不得混算。
- 每次至多 1000 行，要求整数 Citation Count。自动校验不能证明上传文件真来自 Bing；来源明确标记 `OPERATOR_ATTESTED_BING_CSV`。
- 需要生产 D1 先应用迁移 `0010_bing_ai_manual_reports.sql`，才可以正式打开上传模块，避免读取异常冒充空白历史。

## 完整上线后下一步
在 GSC Wizard 连接 Bing Webmaster API key、列出受权站点并核对域名所有权，优先寻找未来官方 AI Performance API 如果受支持的接口。任何 API 对接都必须经真实权限与源报告验证，不能将常规 Bing 点击/曝光混作 Copilot 引用。

IndexNow 验证与新页通知已经另行完成（PR #77），**不代表 Bing 账户验证或 AI 引用数据已配置**。
