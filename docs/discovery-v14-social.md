# MING EAGLE 客户发现 V14.1：Facebook 与 TikTok 公开账号

2026-10-07。V14 的社交索引原包含 Facebook、Instagram 与 LinkedIn 公司页，本次加入 TikTok，并将四个平台拆开选择和展示结果。学校、地图及企业目录保留原功能。

## 实际渠道及边界

- Facebook：公开商家、训练机构和教练业务主页的搜索引擎标题及摘要。
- TikTok：公开 @账号 主页索引，可用于教练、训练机构和体育商家的线索发现。
- Instagram：公开业务账号索引。
- LinkedIn：公司页索引；个人档案不作为机构主页。
- 每个平台每批执行两个客户类别关键词查询；按州及城市筛选，重复账号按规范主页 URL 去重。零结果与接口失败分别展示，不把不相关结果填充为客户。
- 仅覆盖 Bing 公共索引收录的页面，没有登录态读取、社交平台全量账号检索或自动粉丝 / 群成员抓取。TikTok Research Tools 不向商业用户开放；Display API 用于经用户授权展示资料，未接入为陌生账号商业检索接口。
- 未启用付费服务。公开主页线索不等于采购客户；需核实业务、地区、账号归属及当前联系方式。

官方接口范围参考：
https://developers.tiktok.com/docs/en/research-api-faq
https://developers.tiktok.com/docs/en/display-api-overview

## 后台使用

1. 上方选择美国州、客户类型及英文城市。
2. “扩展来源 · 待核验线索”勾选 Facebook 或 TikTok，点击搜索。每个平台独立显示完成、部分完成、失败及新增数。
3. 搜索未覆盖的公开业务账号，可展开“补录公开社交账号”，填写公开业务名称、对应平台主页、公开业务描述与地区依据；官网可选。
4. 补录只保存待核验线索，标明人工公开描述。帖子、视频、群组、短链、私人 / 本地网址及平台不匹配链接拒绝录入。重复账号保留原记录和忽略 / 已转换状态。
5. 按来源和状态筛选，导出当前页。官网核验后沿用原候选 / CRM 流程；机构名称、业务和地区必须匹配。保存和搜索线索不会发送私信。

## 接口及兼容

- GET discovery-sources-v1 新增 source 条件，与原 status 条件共同分页。
- SEARCH 接受 FACEBOOK、TIKTOK、INSTAGRAM、LINKEDIN；保留旧 SOCIAL 调用和历史记录。
- ADD_SOCIAL 使用现有管理员认证，校验并规范公开主页 URL，保留原输入证据，只向 discovery_clues 写入。
- Facebook profile.php 保留必要 id 参数，其他跟踪参数清除；常规 about / contact 路径归一为账号主页。TikTok 仅接受 @账号主页，视频 / 标签与短链不转换为未经核实的账号。

## 验证

新增集成测试使用模拟公开索引与 SQLite，验证四个平台分别检索、TikTok 去重、Facebook id、主页规范化、跨平台 / 私人 URL / 内容页面拒绝、手工录入仅作线索、忽略和已转换状态保留、按平台分页、旧数据兼容及既有候选关联。

运行 npm run build、npm run test:discovery 及 Cloudflare Functions 打包；正式发布后通过后台验收实际索引覆盖和公开账号录入。
