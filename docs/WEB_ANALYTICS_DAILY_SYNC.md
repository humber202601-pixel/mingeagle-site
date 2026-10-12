# MING EAGLE：Cloudflare 真实流量日统计同步

此功能通过**独立 Cloudflare Cron Worker**读取官方 Cloudflare Web Analytics GraphQL，再将匿名每日聚合数据写入已有的 D1 表 web_analytics_daily。

**上线前提：** CRM 生产 D1 已安装 migrations/0006_web_analytics_daily.sql。另须由管理员创建限定 Cloudflare 账户 Analytics Read 权限的 Token，并仅以加密 Worker Secret CF_ANALYTICS_GRAPHQL_TOKEN 配置给独立 Worker；不得写入 GitHub、CRM Pages、公开 HTML 或日志。当前 PR **不创建 Token、不部署 Worker、不触碰生产 CRM 数据**。

部署需单独审查并执行 wrangler deploy --config wrangler.analytics.toml。实际 Cron 使用 UTC 03:30，仅查询最近7个完整 UTC 日期，每日对延迟到达的数据做幂等覆盖。GraphQL 必须匹配账户、站点标签以及主机名 mingeagle.com / www.mingeagle.com；不允许把其它站点或当前不完整日期写入。GraphQL 错误、无权限、结果截断、计数非法会直接失败；未返回的日期保持未知而非0。Cloudflare 提供的 Visits 及采样页载入量不等于独立访客，也不等于询盘；不得据此推算虚假漏斗转化率。

测试：node scripts/test-web-analytics-sync.mjs。仅允许 SQL 写 web_analytics_daily；无客户 PII、邮件、公开可调用的写 API。部署后需要分别核查 Cron 日志、D1 实际日期数据以及管理员只读 API /api/admin/web-analytics-daily?days=30，三者一致才可标记自动同步完成。
