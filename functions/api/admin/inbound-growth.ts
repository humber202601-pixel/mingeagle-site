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
  CASE WHEN EXISTS(SELECT 1 FROM quotes q WHERE q.lead_id=i.lead_id
     AND q.status IN ('SENT','VIEWED','ACCEPTED','DECLINED','EXPIRED','CONVERTED'))
    THEN 1 ELSE 0 END AS quoted,
  CASE WHEN EXISTS(SELECT 1 FROM orders o WHERE o.lead_id=i.lead_id AND o.status NOT IN ('DRAFT','CANCELLED'))
    THEN 1 ELSE 0 END AS ordered
 FROM inquiries i
 LEFT JOIN activities a ON a.entity_type='LEAD' AND a.entity_id=i.lead_id
   AND a.activity_type='INQUIRY_CREATED' AND json_extract(a.metadata_json,'$.inquiryId')=i.id
 WHERE (?=0 OR i.created_at>=datetime('now','-' || ? || ' days'))
), buckets AS (
 SELECT id,quoted,ordered,
 CASE
  WHEN utm IN ('google','googleads','adwords') THEN 'GOOGLE'
  WHEN utm IN ('bing','microsoft','microsoft_ads') THEN 'BING'
  WHEN utm IN ('tiktok','tik_tok') THEN 'TIKTOK'
  WHEN utm IN ('youtube','yt') THEN 'YOUTUBE'
  WHEN utm IN ('instagram','ig') THEN 'INSTAGRAM'
  WHEN utm IN ('facebook','fb','meta') THEN 'FACEBOOK'
  WHEN utm IN ('partner','coach','referral','affiliate') THEN 'PARTNER'
  WHEN utm<>'' THEN 'OTHER_TAGGED'
  WHEN referring LIKE '%google.%' THEN 'GOOGLE'
  WHEN referring LIKE '%bing.com%' THEN 'BING'
  WHEN referring LIKE '%tiktok.com%' THEN 'TIKTOK'
  WHEN referring LIKE '%youtube.com%' OR referring LIKE '%youtu.be%' THEN 'YOUTUBE'
  WHEN referring LIKE '%instagram.com%' THEN 'INSTAGRAM'
  WHEN referring LIKE '%facebook.com%' THEN 'FACEBOOK'
  ELSE 'DIRECT_UNKNOWN' END AS channel,
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
  WHEN landing LIKE '%/silent-basketball-for-apartments.html' THEN 'APARTMENT_GUIDE'
  WHEN landing LIKE '%/basketball-camp-equipment-supplier.html' THEN 'CAMP_GUIDE'
  WHEN landing LIKE '%/silent-basketball-bulk-buying-guide.html' THEN 'BULK_GUIDE'
  WHEN landing LIKE '%/for-coaches.html' THEN 'FOR_COACHES'
  WHEN landing LIKE '%/for-schools.html' THEN 'FOR_SCHOOLS'
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
   SELECT channel,audience,COUNT(*) AS inquiries,SUM(quoted) AS quoted,SUM(ordered) AS ordered
   FROM buckets GROUP BY channel,audience ORDER BY inquiries DESC,channel,audience`)
   .bind(days,days).all<Row>()).results;
  const pages=(await db.prepare(`${attribution}
   SELECT entry_page,COUNT(*) AS inquiries FROM buckets GROUP BY entry_page ORDER BY inquiries DESC,entry_page`)
   .bind(days,days).all<Row>()).results;
  const summary={inquiries:0,b2b:0,b2c:0,unknown:0,quoted:0,ordered:0};
  const sources=sourceRows.map(r=>{
   const row={channel:String(r.channel||'DIRECT_UNKNOWN'),audience:String(r.audience||'UNKNOWN'),
    inquiries:n(r.inquiries),quoted:n(r.quoted),ordered:n(r.ordered)};
   summary.inquiries+=row.inquiries;summary.quoted+=row.quoted;summary.ordered+=row.ordered;
   if(row.audience==='B2B')summary.b2b+=row.inquiries;
   else if(row.audience==='B2C')summary.b2c+=row.inquiries;
   else summary.unknown+=row.inquiries;
   return row;
  });
  return json({ok:true,generatedAt:new Date().toISOString(),filters:{days},summary,sources,
   entryPages:pages.map(p=>({entryPage:String(p.entry_page),inquiries:n(p.inquiries)})),
   limitations:[
    '本页只计算已经进入 CRM 的真实网站询盘；没有 Google 曝光、网页访问、广告点击或购物车数据。',
    '渠道优先采用询盘提交时的 UTM，其次参考 Referrer；Direct/Unknown 包含缺失归因，不代表都来自直接访问。',
    'B2C 仅在用户明确选择个人客户类型时识别；未说明身份的普通咨询与样品申请归入未确定，不能强行当作零售订单。',
    '报价和订单表示与该询盘客户关联的当前业务记录，不证明单独哪次营销触点导致成交。',
    '追踪参数由访问页面携带，并未进行广告平台服务器核验；实际流量仍需通过已验证的 Search Console 和 GA4/隐私合规网站分析工具观察。',
   ]});
 }catch(e){console.error('inbound_growth_unavailable',e);return json({ok:false,error:'无法读取真实询盘来源，请检查 D1 可用性。'},503);}
};
