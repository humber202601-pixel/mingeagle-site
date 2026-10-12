# 报价计算与隔离验收

## 价格与金额

官网main/public/retail-reference-prices.json和quote-math.js是权威来源。CRM保留相同版本的部署副本，不在运行时依赖官网网络请求。
scripts/sync-quote-reference.mjs从两份权威文件生成ESM计算适配模块、价格版本及旧retail-prices.json网址的兼容副本。
React报价、后台报价接口、公开客户优惠说明使用相同计算规则；运费、零售草稿和AI目录的商品价格来自同一目录。
报价快照的source_url带目录SHA256版本，报价数量/描述/单价修改后相关审核记录会删除；客户页面只显示仍有效的审核优惠。

更新价格时，先更新并验收官网main，再在CRM分支执行：

```sh
node scripts/sync-quote-reference.mjs --from /path/to/website-main/public
npm run test:quotes
npm run test:discovery
npm run build
```

提交生成文件与副本。GitHub CI另检出当前main，严格比较两份权威文件和所有生成文件；不一致会失败，不自动改成绿灯。
金额必须显式填写、非负、最多两位小数；商品单价须大于0。数量必须是明确正整数，数量区间/冲突不自动取下限。额外折扣不得超过商品金额，总额须大于0且不超过USD1,000,000。
目录零售价差额用于商品优惠对比，不再作为额外折扣扣除，避免重复优惠。

## 预览环境

生产D1为mingeagle-v2；Pages env.preview和scheduler previews均使用独立mingeagle-crm-preview。
本次已对独立预览库执行现有四个迁移，没有复制生产客户数据。
预览ADMIN_ACCESS_KEY为独立随机密钥，仅存在Cloudflare secret和本地受限凭据文件，不提交Git。
预览OUTBOUND_EMAIL_DISABLED=true，AUTO_EMAIL_ENABLED=false。Pages只允许隔离报价流程所需的写操作；询盘通知和真实客户报价邮件关闭。
Worker预览没有生产管理员凭据且不配置预览cron；生产任务运行凭据问题另行处理，不在报价开发时顺便启用自动邮件。

wrangler.toml的env.preview与wrangler.scheduler.toml的previews绑定必须保持独立。不得在正式数据库运行测试脚本或填入真实客户邮箱。
Cloudflare Worker预览命令必须为npx wrangler preview --config wrangler.scheduler.toml；不能误用默认Pages配置。

## 验收

- test:quotes保留原报价、零售、支付安全断言，补充合法小数、非法精度、数量、总额、税费保留、审核失效及人工批准测试。
- test-quote-flow使用真实SQLite与实际后台handler及鉴权中间件，禁止外部网络调用；它不是正式CRM端到端验收。
- test-quote-preview在专用Cloudflare预览部署运行实际HTTP+Functions+D1流程；在首个写入前检查测试环境与发送禁用标记。合成询盘邮箱为example.invalid，不发客户邮件。
- 使用独立密钥文件执行远程验收，不把密钥写入命令行或日志：

```sh
node scripts/test-quote-preview.mjs --url https://PREVIEW.mingeagle-site.pages.dev --key-file /private/path/preview-admin-key.txt
```

测试产生的合成记录留在独立预览库中。正式上线后的读取验收还需核实Cloudflare部署commit、deployment-version.json及价格/计算器文件，不能把PR提交成功当成上线成功。
人工批准后才可释放DRAFT客户链接或发送；真实客户发送需使用者明确操作与授权，本次不进行真实客户发送或修改真实CRM记录。
