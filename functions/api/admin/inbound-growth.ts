// V37 — actual submitted inquiries, never website impressions or visits.
// Existing /api/admin/_middleware.ts enforces admin authentication.
interface Env { MINGEAGLE_DB?:D1Database }
type Row=Record<string,unknown>;
const periods=new Set([0,30,90,365]);
const n=(v:unknown)=>Math.max(0,Number(v)||0);
const json=(data:Record<string,unknown>,status=200)=>Response.json(data,{status,headers:{'cache-control':'private, no-store'}});
const attribution=`WITH inquiry_base AS (
 SELECT i.id,i.lead_id,i.request_type,COALESCE(i.customer_type,'') AS customer_type,
  LOWER(TRIM(COALESCE(json_extract(a.metadata_json,'$.utmSource'),''))) AS utm,
  LOWER(TRIM(COALESCE(json_extract(a.metadata_json,'$.referrer'),''))) AS referring,
  COALESCE(json_extract(a.metadata_json,'$.landingPage'),'') AS landing,
  CASE WHEN i.lead_id IS NOT NULL AND EXISTS(SELECT 1 FROM quotes q WHERE q.lead_id=i.lead_id
     AND q.status IN ('SENT','VIEWED','ACCEPTED','DECLINED','EXPIRED','CONVERTED'))
    THEN 1 ELSE 0 END AS quoted,
  CASE WHEN i.lead_id IS NOT NULL AND EXISTS(SELECT 1 FROM orders o WHERE o.lead_id=i.lead_id AND o.status NOT IN ('DRAFT','CANCELLED'))
    THEN 1 ELSE 0 END AS ordered,
  CASE WHEN EXISTS(SELECT 1 FROM quotes q WHERE q.inquiry_id=i.id
      AND q.status IN ('SENT','VIEWED','ACCEPTED','DECLINED','EXPIRED','CONVERTED'))
    THEN 1 ELSE 0 END AS exact_quoted,
  CASE WHEN EXISTS(SELECT 1 FROM quotes q JOIN orders o ON o.quote_id=q.id
      WHERE q.inquiry_id=i.id AND q.status IN ('SENT','VIEWED','ACCEPTED','DECLINED','EXPIRED','CONVERTED')
      AND o.status NOT IN ('DRAFT','CANCELLED'))
    THEN 1 ELSE 0 END AS exact_ordered
 FROM inquiries i
 -- Choose one deterministic original INQUIRY_CREATED activity per inquiry.
 -- Multiple webhook retries/activity rows must never multiply the inquiry count.
 LEFT JOIN activities a ON a.id=(
   SELECT a0.id FROM activities a0
   WHERE a0.entity_type='LEAD' AND a0.entity_id=i.lead_id
     AND a0.activity_type='INQUIRY_CREATED'
     AND json_valid(a0.metadata_json)
     AND json_extract(a0.metadata_json,'$.inquiryId')=i.id
   ORDER BY a0.created_at ASC,a0.id ASC LIMIT 1
 )
 WHERE (?=0 OR i.created_at>=datetime('now','-' || ? || ' days'))
), buckets AS (
 SELECT id,quoted,ordered,exact_quoted,exact_ordered,
 CASE
  -- Only allowlisted UTM labels and exact host-prefix referral paths; this
  -- remains visitor supplied attribution, not verified AI citations.
  WHEN utm IN ('chatgpt','chatgpt_search','openai') THEN 'CHATGPT'
  WHEN utm IN ('perplexity','perplexity_ai') THEN 'PERPLEXITY'
  WHEN utm IN ('claude','claude_ai','anthropic') THEN 'CLAUDE'
  WHEN utm IN ('gemini','google_gemini') THEN 'GEMINI'
  WHEN utm IN ('copilot','microsoft_copilot') THEN 'COPILOT'
  WHEN utm IN ('google','googleads','adwords') THEN 'GOOGLE'
  WHEN utm IN ('bing','microsoft','microsoft_ads') THEN 'BING'
  WHEN utm IN ('tiktok','tik_tok') THEN 'TIKTOK'
  WHEN utm IN ('youtube','yt') THEN 'YOUTUBE'
  WHEN utm IN ('instagram','ig') THEN 'INSTAGRAM'
  WHEN utm IN ('facebook','fb','meta') THEN 'FACEBOOK'
  WHEN utm IN ('partner','coach','referral','affiliate') THEN 'PARTNER'
  WHEN utm<>'' THEN 'OTHER_TAGGED'
  -- Require the full HTTPS hostname and following slash (not a substring),
  -- so chatgpt.com.evil.example cannot impersonate chatgpt.com.
  WHEN referring LIKE 'https://chatgpt.com/%' OR referring='https://chatgpt.com'
    OR referring LIKE 'https://chat.openai.com/%' OR referring='https://chat.openai.com' THEN 'CHATGPT'
  WHEN referring LIKE 'https://www.perplexity.ai/%' OR referring='https://www.perplexity.ai'
    OR referring LIKE 'https://perplexity.ai/%' OR referring='https://perplexity.ai'
    OR referring LIKE 'https://www.perplexity.com/%' OR referring='https://www.perplexity.com'
    OR referring LIKE 'https://perplexity.com/%' OR referring='https://perplexity.com' THEN 'PERPLEXITY'
  WHEN referring LIKE 'https://claude.ai/%' OR referring='https://claude.ai' THEN 'CLAUDE'
  WHEN referring LIKE 'https://gemini.google.com/%' OR referring='https://gemini.google.com' THEN 'GEMINI'
  WHEN referring LIKE 'https://copilot.microsoft.com/%' OR referring='https://copilot.microsoft.com'
    OR referring LIKE 'https://copilot.microsoft365.com/%' OR referring='https://copilot.microsoft365.com' THEN 'COPILOT'
  WHEN referring LIKE '%google.%' THEN 'GOOGLE'
  WHEN referring LIKE '%bing.com%' THEN 'BING'
  WHEN referring LIKE '%tiktok.com%' THEN 'TIKTOK'
  WHEN referring LIKE '%youtube.com%' OR referring LIKE '%youtu.be%' THEN 'YOUTUBE'
  WHEN referring LIKE '%instagram.com%' THEN 'INSTAGRAM'
  WHEN referring LIKE '%facebook.com%' THEN 'FACEBOOK'
  ELSE 'DIRECT_UNKNOWN' END AS channel,
 CASE
  -- UTM labels are user/browser supplied; referrer is also unverified.
  -- Neither proves an actual AI citation or a specific page view from RUM.
  WHEN utm IN ('chatgpt','chatgpt_search','openai',
   'perplexity','perplexity_ai','claude','claude_ai','anthropic',
   'gemini','google_gemini','copilot','microsoft_copilot')
    THEN 'FORM_UTM'
  ELSE 'FORM_REFERRER' END AS evidence_kind,
 CASE
  WHEN request_type IN ('WHOLESALE','RETAIL_PARTNERSHIP') THEN 'B2B'
  WHEN LOWER(customer_type) LIKE '%personal%' THEN 'B2C'
  WHEN LOWER(customer_type) LIKE '%coach%' OR LOWER(customer_type) LIKE '%trainer%'
    OR LOWER(customer_type) LIKE '%academy%' OR LOWER(customer_type) LIKE '%school%'
    OR LOWER(customer_type) LIKE '%club%' OR LOWER(customer_type) LIKE '%retail%'
    OR LOWER(customer_type) LIKE '%distributor%' OR LOWER(customer_type) LIKE '%commerce%'
    THEN 'B2B'
  ELSE 'UNKNOWN' END AS audience,
 CASE
  WHEN landing LIKE '%/quiet-indoor-sports-for-kids.html' THEN 'KIDS_QUIET_GUIDE'
  WHEN landing LIKE '%/indoor-school-sports-equipment-guide.html' THEN 'SCHOOL_EQUIPMENT_GUIDE'
  WHEN landing LIKE '%/silent-basketball-for-apartments.html' THEN 'APARTMENT_GUIDE'
  WHEN landing LIKE '%/basketball-camp-equipment-supplier.html' THEN 'CAMP_GUIDE'
  WHEN landing LIKE '%/silent-basketball-bulk-buying-guide.html' THEN 'BULK_GUIDE'
  WHEN landing LIKE '%/for-coaches.html' THEN 'FOR_COACHES'
  WHEN landing LIKE '%/for-schools.html' THEN 'FOR_SCHOOLS'
  WHEN landing LIKE '%/wholesale-product-catalog.html' THEN 'WHOLESALE_CATALOG'
  WHEN landing LIKE '%/custom-basketball-for-teams.html' THEN 'TEAM_CUSTOM'
  WHEN landing LIKE '%/wholesale.html' THEN 'WHOLESALE'
  WHEN landing LIKE '%/products.html' THEN 'PRODUCTS'
  WHEN landing LIKE '%/silent-basketball.html' OR landing LIKE '%/fabric-silent-basketball.html'
    OR landing LIKE '%/weighted-flocked-basketball.html' OR landing LIKE '%/silent-soccer.html'
    THEN 'PRODUCT_DETAIL'
  WHEN landing='https://www.mingeagle.com/' OR landing='https://mingeagle.com/' THEN 'HOME'
  WHEN landing='' THEN 'NOT_RECORDED'
  ELSE 'OTHER_PAGE' END AS entry_page
 FROM inquiry_base
)`;
export const onRequestGet:PagesFunction<Env>=async({request,env})=>{
 const db=env.MINGEAGLE_DB;
 if(!db)return json({ok:false,error:'Database not bound.'},503);
 const days=Number(new URL(request.url).searchParams.get('days')??90);
 if(!Number.isInteger(days)||!periods.has(days))return json({ok:false,error:'不支持的统计时间范围。'},400);
 try{
  // Independent buckets cannot multiply messages/quotes/orders. At most 9
  // channels x 3 audiences, plus entry-page buckets; only two SELECTs.
  const sourceRows=(await db.prepare(`${attribution}
   SELECT channel,audience,COUNT(*) AS inquiries,SUM(quoted) AS quoted,SUM(ordered) AS ordered,
     SUM(exact_quoted) AS exactQuoted,SUM(exact_ordered) AS exactOrdered
   FROM buckets GROUP BY channel,audience ORDER BY inquiries DESC,channel,audience`)
   .bind(days,days).all<Row>()).results;
  const pages=(await db.prepare(`${attribution}
   SELECT entry_page,COUNT(*) AS inquiries,SUM(quoted) AS quoted,SUM(ordered) AS ordered,
     SUM(exact_quoted) AS exactQuoted,SUM(exact_ordered) AS exactOrdered FROM buckets GROUP BY entry_page ORDER BY inquiries DESC,entry_page`)
   .bind(days,days).all<Row>()).results;
  const aiRows=(await db.prepare(`${attribution}
   SELECT channel,entry_page,evidence_kind,COUNT(*) AS inquiries,
    SUM(exact_quoted) AS exactQuoted,SUM(exact_ordered) AS exactOrdered
   FROM buckets WHERE channel IN ('CHATGPT','PERPLEXITY','CLAUDE','GEMINI','COPILOT')
   GROUP BY channel,entry_page,evidence_kind
   ORDER BY inquiries DESC,channel,entry_page,evidence_kind`)
   .bind(days,days).all<Row>()).results;
  const summary={inquiries:0,b2b:0,b2c:0,unknown:0,quoted:0,ordered:0,exactQuoted:0,exactOrdered:0};
  const sources=sourceRows.map(r=>{
   const row={channel:String(r.channel||'DIRECT_UNKNOWN'),audience:String(r.audience||'UNKNOWN'),
    inquiries:n(r.inquiries),quoted:n(r.quoted),ordered:n(r.ordered),
    exactQuoted:n(r.exactQuoted),exactOrdered:n(r.exactOrdered)};
   summary.inquiries+=row.inquiries;summary.quoted+=row.quoted;summary.ordered+=row.ordered;
   summary.exactQuoted+=row.exactQuoted;summary.exactOrdered+=row.exactOrdered;
   if(row.audience==='B2B')summary.b2b+=row.inquiries;
   else if(row.audience==='B2C')summary.b2c+=row.inquiries;
   else summary.unknown+=row.inquiries;
   return row;
  });
  return json({ok:true,generatedAt:new Date().toISOString(),filters:{days},summary,sources,
   aiEvidence:aiRows.map(r=>({channel:String(r.channel),entryPage:String(r.entry_page),
    evidenceKind:String(r.evidence_kind),inquiries:n(r.inquiries),
    exactQuoted:n(r.exactQuoted),exactOrdered:n(r.exactOrdered)})),

   entryPages:pages.map(p=>({entryPage:String(p.entry_page),inquiries:n(p.inquiries),
     quoted:n(p.quoted),ordered:n(p.ordered),exactQuoted:n(p.exactQuoted),exactOrdered:n(p.exactOrdered)})),
   dataProvenance:{
     inquiries:'D1 inquiries.id (deduplicated by persisted inquiry row)',
     aiInquiryAttribution:'FORM_SUBMITTED_UTM_OR_REFERRER_NOT_PLATFORM_VERIFIED',
     exactQuote:'D1 quotes.inquiry_id = inquiries.id; quote is no longer draft',
     exactOrder:'D1 orders.quote_id = quotes.id, linked by quotes.inquiry_id; order not draft/cancelled',
     leadAssociated:'Legacy association by leads.id; not evidence of a specific inquiry causing a quote/order',
     websiteVisits:{connected:false,count:null},
     searchImpressions:{connected:false,count:null},
     conversionWindow:'Inquiry creation timestamp cohort; quote/order flags reflect current records',
   },
   limitations:[
    '本页只计算已经进入 CRM 的真实网站询盘；没有 Google 曝光、网页访问、广告点击或购物车数据。',
    '渠道优先采用询盘提交时的 UTM，其次参考 Referrer；Direct/Unknown 包含缺失归因，不代表都来自直接访问。',
    'AI 平台来源（ChatGPT、Perplexity、Claude、Gemini、Copilot）只基于客户浏览器传来的 UTM/Referrer，可能丢失或被伪造；不代表 AI 官方引用，也不能推断 AI 自然回答推荐。',
    'AI 询盘证据单独按表单 UTM 和 Referrer 分类；Cloudflare RUM 是独立匿名数据源，没有同一访客键，不能把两表相除当作会话转化率。',
    'Google AI Overviews 或 Bing/Copilot 搜索页面可能共享普通 Google/Bing 的跳转来源，无法从 Referrer 可靠拆分；未分类来源不代表没有 AI 影响。',
    'B2C 仅在用户明确选择个人客户类型时识别；未说明身份的普通咨询与样品申请归入未确定，不能强行当作零售订单。',
    '直接关联报价：quotes.inquiry_id 明确指向该询盘；直接关联订单：经该报价 quotes.id / orders.quote_id 找到订单，均不按订单行数重复统计。',
    '同客户关联报价/订单仅按 lead_id 计算，不证明某一条特定询盘带来该订单，也不应与直接关联数量相加。',
    '重复 INQUIRY_CREATED 活动只采用最早一条，避免日志重试造成询盘数翻倍；UTM/referrer 未经广告平台验证。',
    '报价和订单为按询盘创建时间选取的客户群当前状态，且并非严格同一天的访问、询盘、报价和付款事件漏斗。',
    '追踪参数由访问页面携带，并未进行广告平台服务器核验；实际流量仍需通过已验证的 Search Console 和 GA4/隐私合规网站分析工具观察。',
   ]});
 }catch(e){console.error('inbound_growth_unavailable',e);return json({ok:false,error:'无法读取真实询盘来源，请检查 D1 可用性。'},503);}
};
