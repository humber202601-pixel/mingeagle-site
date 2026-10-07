# MING EAGLE 客户发现 V14：公开来源拓展

2026-10-07。保留现有 Geoapify、Bing 官网发现与官网批量核验，新增“扩展来源 · 待核验线索”。使用主搜索区域所选州、客户类型及城市，不产生付费服务订阅或外联消息。

## 已接入的四个渠道

| 渠道 | 实际入口 | 用途和边界 |
| --- | --- | --- |
| 公开社交账号 | Bing 公共 RSS 索引的 Facebook、Instagram、LinkedIn 公司页定向查询 | 只读取搜索引擎可见的标题和摘要；排除帖子、个人 LinkedIn 页面和登录入口。没有社交 API、登录态读取或社交平台全量账号覆盖。 |
| 企业 / 行业及公示目录 | Bing 公共索引定向查询商会、Yellow Pages、政府公示页面 | 业务与查询城市文字过滤。目录页先保留线索，不作为目标企业官网、不确认购买意向。 |
| NCES 学校 / 学区名录 | NCES EDGE 2024–25 公立学校地点与 NCES Current 学区办公室 ArcGIS Query | 本批支持公立小学、初高中、学区；学校类型依据名称初筛，最终以官网核验。保留机构编号、学年和公示地址。公示城市可能与实际位置不同，需核实当前运营及联系信息。 |
| OpenStreetMap | Overpass 公共接口，按美国州及 addr:city 严格查询 | 需填写城市，返回具名体育中心、体育商店或学校等地点线索；普通球场、篮球架、饮水点排除。地图分类需官网进一步核验。保留原始 OSM 页面；标明 OSM contributors / ODbL。 |

NCES 公立学校：
https://nces.ed.gov/opengis/rest/services/K12_School_Locations/EDGE_GEOCODE_PUBLICSCH_2425/MapServer/0

NCES 学区办公室：
https://services1.arcgis.com/Ua5sjt3LWTPigjyD/ArcGIS/rest/services/School_District_Office_Locations_Current/FeatureServer/0

Google Places 官方 API 需要开通计费，本批未启用。企业注册查询属于主体核对来源，不能独自证明静音球业务匹配或采购需求；未虚构已接入美国各州企业注册数据库。

## 使用方式

1. 在主搜索区域选择州、客户类型和英文城市。
2. 滚动到“扩展来源 · 待核验线索”，选择渠道并点击“搜索扩展来源”。NCES 仅适用其支持的学校类型；OSM 需填写城市。
3. 每条线索保留原始来源和检索 / 公示证据。点击原始来源或“查找机构官网”，输入机构官网。
4. “核验并转入候选库”验证官网主体、类型和地区，机构名称还须与线索匹配。商业候选按官网域名去重；同一学区域名下的不同学校页面按路径区分。已有候选关联，不重复建客户；已忽略候选不会恢复。
5. 未通过的线索保持待核验；线索可忽略、恢复、按状态分页和导出当前页 CSV。已转入候选库的记录在现有候选 / CRM 流程管理。

## 数据和操作

- 新表 discovery_clues 只保存公开机构线索，PENDING / CONVERTED / IGNORED。线索不进入有效客户计数和自动外联。
- GET /api/admin/discovery-sources-v1：分页读线索，每页 20 条。
- POST SEARCH：独立并行执行选定渠道；保留各渠道成功、部分成功、失败和零结果。重复搜索轮换索引关键词或 NCES 分页。
- POST VERIFY：官网核验并关联或新增客户候选，保留原始线索来源。
- POST IGNORE / RESTORE：可恢复的线索状态变更。
- 接口沿用现有管理员中间件认证。公开 URL、官网重定向保护、联系方式提取、忽略 / CRM 保护沿用现有实现。

## 验证

npm run build、npm run test:discovery（同时运行原发现集成测试及新增来源集成测试）、Cloudflare Functions 打包。

新增集成测试使用模拟公开网页与 SQLite，不是真实客户资料。验证社交页面 / 城市过滤、NCES SQL 转义和学年、OSM 普通设施排除、单源与全源失败、线索独立保存、去重、忽略恢复、机构身份及私有 URL 拒绝、核验晋级、同域学校区分、分页与不发送沟通记录。正式发布后需要登录会话验收真实来源的可访问性与结果覆盖。
