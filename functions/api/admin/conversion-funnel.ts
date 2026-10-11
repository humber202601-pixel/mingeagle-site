// V33: actual CRM conversion cohorts, not synthetic lead estimates.
// Read-only, two bounded aggregate/list queries. This route is guarded by
// /api/admin/_middleware.ts and is only called while the funnel page is open.
interface Env { MINGEAGLE_DB?:D1Database }
type FunnelRow=Record<string,unknown>;
const response=(data:Record<string,unknown>,status=200)=>Response.json(data,{status,headers:{'cache-control':'private, no-store'}});
const windows=new Set([0,30,90,365]);
const scopes=new Set(['ALL','DISCOVERY','WEBSITE']);
const n=(x:unknown)=>Math.max(0,Number(x)||0);
const activity=`WITH message_activity AS (
  SELECT lead_id,
    MIN(CASE WHEN direction='OUTBOUND' THEN datetime(sent_at) END) AS first_outbound,
    MAX(CASE WHEN direction='INBOUND' AND channel<>'WEBSITE' THEN datetime(sent_at) END) AS latest_inbound
  FROM messages WHERE lead_id IS NOT NULL GROUP BY lead_id
), sent_quotes AS (
  SELECT lead_id,1 AS yes FROM quotes
  WHERE lead_id IS NOT NULL AND status IN ('SENT','VIEWED','ACCEPTED','DECLINED','EXPIRED','CONVERTED')
  GROUP BY lead_id
), real_orders AS (
  SELECT lead_id,1 AS yes,
    MAX(CASE WHEN payment_status='PAID' OR status='PAID' THEN 1 ELSE 0 END) AS paid
  FROM orders WHERE lead_id IS NOT NULL AND status NOT IN ('DRAFT','CANCELLED')
  GROUP BY lead_id
), lead_flags AS (
  SELECT l.id,l.lead_score,l.source,l.status,c.name AS company_name,
    COALESCE(NULLIF(c.customer_type,''),'UNCLASSIFIED') AS category,
    c.city,c.state_region,
    ct.email,COALESCE(NULLIF(ct.phone,''),NULLIF(c.phone,'')) AS contact_phone,ct.whatsapp,
    CASE WHEN COALESCE(ct.do_not_contact,0)=1
      OR l.status IN ('DO_NOT_CONTACT','NOT_INTERESTED','NOT_FIT','LOST')
      THEN 1 ELSE 0 END AS blocked,
    CASE WHEN (length(trim(COALESCE(ct.email,'')))>4 AND instr(ct.email,'@')>1)
      OR length(trim(COALESCE(ct.phone,'')))>=6
      OR length(trim(COALESCE(ct.whatsapp,'')))>=6
      OR length(trim(COALESCE(c.phone,'')))>=6
      THEN 1 ELSE 0 END AS has_contact,
    CASE WHEN length(trim(COALESCE(ct.email,'')))>4 AND instr(ct.email,'@')>1
      THEN 1 ELSE 0 END AS has_email,
    CASE WHEN m.first_outbound IS NOT NULL THEN 1 ELSE 0 END AS contacted,
    CASE WHEN m.first_outbound IS NOT NULL AND m.latest_inbound IS NOT NULL
      AND m.latest_inbound>=m.first_outbound THEN 1 ELSE 0 END AS replied,
    COALESCE(q.yes,0) AS quoted,COALESCE(o.yes,0) AS ordered,
    COALESCE(o.paid,0) AS paid
  FROM leads l LEFT JOIN companies c ON c.id=l.company_id
  LEFT JOIN contacts ct ON ct.id=l.primary_contact_id
  LEFT JOIN message_activity m ON m.lead_id=l.id
  LEFT JOIN sent_quotes q ON q.lead_id=l.id
  LEFT JOIN real_orders o ON o.lead_id=l.id
  WHERE (?=0 OR l.created_at>=datetime('now', '-' || ? || ' days'))
    AND (?='ALL' OR l.source=?)
)`;
export const onRequestGet:PagesFunction<Env>=async({request,env})=>{
  const db=env.MINGEAGLE_DB;
  if(!db)return response({ok:false,error:'数据库未绑定。'},503);
  const url=new URL(request.url),days=Number(url.searchParams.get('days')??90);
  const source=String(url.searchParams.get('source')||'DISCOVERY').toUpperCase();
  if(!Number.isInteger(days)||!windows.has(days)||!scopes.has(source))
    return response({ok:false,error:'日期范围或客户来源不支持。'},400);
  // User-selected scope is whitelisted; SQL values are bound parameters.
  try{
    const bind=[days,days,source,source] as const;
    const groups=(await db.prepare(`${activity}
      SELECT category,COUNT(*) AS total,
        SUM(has_contact) AS withContact,
        SUM(CASE WHEN has_contact=1 AND blocked=0 THEN 1 ELSE 0 END) AS contactable,
        SUM(CASE WHEN has_email=1 AND blocked=0 THEN 1 ELSE 0 END) AS emailReady,
        SUM(blocked) AS blocked,
        SUM(contacted) AS contacted,
        SUM(replied) AS replied,
        SUM(quoted) AS quoted,
        SUM(ordered) AS ordered,
        SUM(paid) AS paid,
        SUM(CASE WHEN has_contact=1 AND blocked=0 AND contacted=0 THEN 1 ELSE 0 END) AS readyToReview
      FROM lead_flags
      GROUP BY category ORDER BY total DESC,category ASC LIMIT 80`)
      .bind(...bind).all<FunnelRow>()).results;
    const prospects=(await db.prepare(`${activity}
      SELECT id,company_name,category,city,state_region,email,contact_phone,whatsapp,lead_score,status
      FROM lead_flags
      WHERE has_contact=1 AND blocked=0 AND contacted=0
      ORDER BY lead_score DESC,id ASC LIMIT 30`)
      .bind(...bind).all<FunnelRow>()).results;
    // Quote engagement is measured from actual quote records, not lead status labels.
    // A quote may have been viewed or accepted before its status subsequently changed.
    const q=(await db.prepare(`SELECT
      COUNT(*) AS sent,
      SUM(CASE WHEN first_viewed_at IS NOT NULL OR q.status IN ('VIEWED','ACCEPTED','CONVERTED') THEN 1 ELSE 0 END) AS viewed,
      SUM(CASE WHEN accepted_at IS NOT NULL OR q.status IN ('ACCEPTED','CONVERTED') THEN 1 ELSE 0 END) AS accepted,
      SUM(CASE WHEN q.status='DECLINED' THEN 1 ELSE 0 END) AS declined,
      SUM(CASE WHEN q.status='EXPIRED' THEN 1 ELSE 0 END) AS expired,
      (SELECT COUNT(DISTINCT o.quote_id) FROM orders o
       JOIN quotes qi ON qi.id=o.quote_id
       WHERE o.status NOT IN ('DRAFT','CANCELLED') AND qi.status NOT IN ('DRAFT','CANCELLED')
         AND (?=0 OR qi.created_at>=datetime('now','-'||?||' days'))
         AND (?='ALL' OR EXISTS(SELECT 1 FROM leads l2 WHERE l2.id=qi.lead_id AND l2.source=?))) AS with_order
    FROM quotes q LEFT JOIN leads l ON l.id=q.lead_id
    WHERE q.status NOT IN ('DRAFT','CANCELLED')
      AND (?=0 OR q.created_at>=datetime('now','-'||?||' days'))
      AND (?='ALL' OR l.source=?)`).bind(days,days,source,source,days,days,source,source).first<FunnelRow>())||{};
    const quotePerformance={sent:n(q.sent),viewed:n(q.viewed),accepted:n(q.accepted),declined:n(q.declined),expired:n(q.expired),withOrder:n(q.with_order)};
    // Item-level figures reflect actual non-draft quotes; one quote can contain multiple items.
    const productRows=(await db.prepare(`SELECT qi.description AS product,
      COUNT(DISTINCT q.id) AS quoted,
      COUNT(DISTINCT CASE WHEN q.first_viewed_at IS NOT NULL OR q.status IN ('VIEWED','ACCEPTED','CONVERTED') THEN q.id END) AS viewed,
      COUNT(DISTINCT CASE WHEN q.accepted_at IS NOT NULL OR q.status IN ('ACCEPTED','CONVERTED') THEN q.id END) AS accepted,
      COUNT(DISTINCT CASE WHEN EXISTS(SELECT 1 FROM orders o WHERE o.quote_id=q.id AND o.status NOT IN ('DRAFT','CANCELLED')) THEN q.id END) AS with_order,
      SUM(qi.quantity) AS quoted_units,
      SUM(qi.line_total) AS quoted_merchandise_usd
    FROM quote_items qi JOIN quotes q ON q.id=qi.quote_id
      LEFT JOIN leads l ON l.id=q.lead_id
    WHERE q.status NOT IN ('DRAFT','CANCELLED') AND q.currency='USD'
      AND (?=0 OR q.created_at>=datetime('now','-'||?||' days'))
      AND (?='ALL' OR l.source=?)
    GROUP BY qi.description ORDER BY quoted DESC,quoted_units DESC,qi.description ASC LIMIT 25`)
      .bind(days,days,source,source).all<FunnelRow>()).results||[];
    const products=productRows.map(p=>({product:String(p.product||''),quoted:n(p.quoted),viewed:n(p.viewed),accepted:n(p.accepted),withOrder:n(p.with_order),quotedUnits:n(p.quoted_units),quotedMerchandiseUSD:n(p.quoted_merchandise_usd)}));
    const segments=groups.map(g=>({
      category:String(g.category||'UNCLASSIFIED'),total:n(g.total),withContact:n(g.withContact),
      contactable:n(g.contactable),emailReady:n(g.emailReady),blocked:n(g.blocked),
      contacted:n(g.contacted),replied:n(g.replied),quoted:n(g.quoted),
      ordered:n(g.ordered),paid:n(g.paid),readyToReview:n(g.readyToReview),
    }));
    const summary={total:0,withContact:0,contactable:0,emailReady:0,blocked:0,
      contacted:0,replied:0,quoted:0,ordered:0,paid:0,readyToReview:0};
    for(const seg of segments)for(const key of Object.keys(summary) as Array<keyof typeof summary>)
      summary[key]+=seg[key];
    return response({ok:true,generatedAt:new Date().toISOString(),
      filters:{days,source},summary,quotePerformance,products,segments,prospects:prospects.map(p=>({
        id:String(p.id),company:String(p.company_name||'未填写机构名称'),
        category:String(p.category||'UNCLASSIFIED'),city:String(p.city||''),state:String(p.state_region||''),
        email:String(p.email||''),phone:String(p.contact_phone||''),whatsapp:String(p.whatsapp||''),
        score:n(p.lead_score),status:String(p.status||''),
      })),limitations:[
        '按客户创建日期建立同批样本，指标为当前累计状态，不是各环节严格嵌套的人数。',
        '已联系=CRM中实际存在发出消息；已回复=发出消息后收到非网站渠道消息，不推断离线沟通。',
        '报价=已有非草稿报价；订单=非草稿及未取消订单；付款=订单标记已付，并非银行流水核验。',
        '报价表现按报价创建日期筛选，查看与接受依据实际报价记录；订单关联不代表款项到账。',
        '产品表现按报价明细描述分组；只统计非草稿 USD 报价，报价商品金额不代表收入，组合报价中的每个产品可计入一次。',
        '未获取联系方式不会猜测联系方式；已退订、不感兴趣和不匹配的客户不进入待开发名单。',
      ]});
  }catch(error){
    console.error('conversion_funnel_failed',error);
    return response({ok:false,error:'无法读取客户转化数据，请检查数据库可用性与 D1 额度。'},503);
  }
};
