import {useEffect,useState} from 'react';
type Snapshot={ok:boolean;checkedAt:string;
 analytics:{cloudflare:{schemaPresent:boolean;observedDates:number|null;latestDateUTC:string|null;lastFetchedAtUTC:string|null;partialInitialDayObserved:boolean;observedDateCoverage:{status:'SCHEMA_MISSING'|'NO_VERIFIED_DATA'|'LATEST_COMPLETED_UTC_DAY'|'OLDER_OBSERVED_DATE'|'INVALID_OBSERVED_DATE';daysBehind:number|null}};google:{schemaPresent:boolean;observedDates:number|null;latestDatePacific:string|null;lastFetchedAtUTC:string|null}};
 procurement:{catalogPresent:boolean;supplierSources:number|null;approvedSourceCount:number|null;shippingRates:number|null;activeShippingRates:number|null;packagingSkus:number|null;activeShippingRoutes:Array<{country:string;method:string;minimumUnits:number}>|null};
 retailReferenceCostRisk:{schemaPresent:boolean;comparableSkus:number|null;atOrBelowApprovedCost:number|null;unmatchedApprovedSkus:number|null;affectedSkus:string[]|null};
 b2bStripeEvidence:{schemaPresent:boolean;wholesaleOrders:number|null;awaitingPaymentOrders:number|null;stripeCheckoutSessions:number|null;reconciledPaidOrders:number|null};
 quoteExpiryHealth:{schemaPresent:boolean;outstandingSentOrViewed:number|null;expiringWithinTwoCalendarDays:number|null;pastValidityDate:number|null};
 b2bStripeSessionHealth:{schemaPresent:boolean;openOrPendingSessions:number|null;olderThan24Hours:number|null;oldestAgedUTC:string|null};
 stripeWebhookHealth:{schemaPresent:boolean;receivedEvents:number|null;processedEvents:number|null;unprocessedEvents:number|null;
  unprocessedPaymentSuccessEvents:number|null;unprocessedExpirationEvents:number|null;unprocessedOtherEvents:number|null;
  olderThanTenMinutes:number|null;oldestUnprocessedUTC:string|null};
 security:{turnstileConfigured:boolean;turnstileEnabled:boolean;turnstileMisconfigured:boolean};
 payments:{checkoutRequested:boolean;providerCredentialsConfigured:boolean;webhookConfigured:boolean;environment:string|null;checkoutConfigurationReady:boolean;retailOnlyRestriction:boolean;b2bCheckoutRequested:boolean;b2bTaxReviewed:boolean;b2bApprovedDestinationStates:string[];b2bConfigurationReady:boolean};
 caveats:string[];error?:string};
type LiveTaxRegistrations={ok:boolean;checkedAt?:string;activeUsStateSalesTaxCount?:number;activeStates?:string[];morePages?:boolean;error?:string};
function StripeTaxRegistrationsReadOnly({accessKey,refresh}:{accessKey:string;refresh:number}){
 const [result,setResult]=useState<LiveTaxRegistrations|null>(null);
 const [error,setError]=useState('');
 useEffect(()=>{
  const controller=new AbortController();setResult(null);setError('');
  fetch('/api/admin/stripe-tax-registrations',{headers:{'x-admin-key':accessKey},signal:controller.signal,cache:'no-store'})
   .then(async response=>{
    const value=await response.json() as LiveTaxRegistrations;
    if(!response.ok||!value.ok)throw Error(value.error||'Stripe Tax 注册记录无法读取');
    if(!controller.signal.aborted)setResult(value);
   }).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Stripe Tax 记录读取失败')});
  return ()=>controller.abort();
 },[accessKey,refresh]);
 return <>
  <div className="list-row"><div><strong>Stripe Tax Live 已生效州销售税登记（只读）</strong>
   <small>从 Stripe Tax API 读取实际登记记录，独立于 51 个技术允许目的州；Stripe 记录本身也不等同于政府许可或 Nexus 意见。</small></div>
   <span>{error?'无法核验':result?result.activeUsStateSalesTaxCount+' 个州'+(result.morePages?'（仅已读取第一页）':''):'查询中…'}</span></div>
  {error&&<p role="alert" className="form-status error">Stripe Tax Live 查询失败：{error}。不能把读取失败当作零项登记或收税许可。</p>}
  {result&&<p role="status" style={{fontSize:12,color:result.activeUsStateSalesTaxCount===0?'#b54708':'#667085'}}>
    Stripe 已报告的活跃州销售税登记：{result.activeStates?.join(' / ')||'无'}。核查时间 UTC {result.checkedAt}。
    {result.morePages?'Stripe 还有后续页面，登记数量暂不完整。':'已检查 API 返回的全部分页标记。'}
    仍须核实政府实际税务许可、客户目的州和相关销售税义务；未登记的州不应被自动判定为无需纳税。</p>}
 </>;
}
const count=(n:number|null):string=>n===null?'尚无法核验':String(n);
export default function ReadinessPanel({accessKey}:{accessKey:string}){
 const [data,setData]=useState<Snapshot|null>(null),[error,setError]=useState('');
 const [refresh,setRefresh]=useState(0);
 useEffect(()=>{
  const c=new AbortController();setError('');setData(null);
  fetch('/api/admin/ops-readiness',{headers:{'x-admin-key':accessKey},signal:c.signal,cache:'no-store'})
   .then(async r=>{const v=await r.json() as Snapshot;if(!r.ok||!v.ok)throw Error(v.error||'生产配置不可读');if(!c.signal.aborted)setData(v);})
   .catch(e=>{if(!c.signal.aborted)setError(e instanceof Error?e.message:'生产环境检查失败')});
  return ()=>c.abort();
 },[accessKey,refresh]);
 return <section className="panel" aria-label="生产系统安全与商业可用性" style={{padding:18}}>
  <div className="panel-head"><div><h2>生产安全与商业准备情况</h2><span>使用正式环境真实配置与只读聚合结果；不读取客户明细或密钥</span></div><button type="button" className="side-button" onClick={()=>setRefresh(x=>x+1)}>刷新</button></div>
  {error&&<p role="alert" className="form-status error">{error}，请勿将读取失败解释为0。</p>}
  {!error&&!data&&<p>正在安全检查正式环境…</p>}
  {data&&<>
   <div className="list-row"><div><strong>Cloudflare 网站访问日统计</strong><small>已保存的 UTC 日数；不代表已配置原生 Worker</small></div><span>{count(data.analytics.cloudflare.observedDates)}</span></div>
   {data.analytics.cloudflare.observedDateCoverage.status==='LATEST_COMPLETED_UTC_DAY'&&<p role="status" style={{fontSize:12,color:'#166534'}}>已核验来源日期：{data.analytics.cloudflare.latestDateUTC}（UTC 最新已结束日）。记录最后获取于 {data.analytics.cloudflare.lastFetchedAtUTC||'未知'} UTC；这只证明存在统计快照，不代表原生 Cron 已启用。</p>}
   {data.analytics.cloudflare.observedDateCoverage.status==='OLDER_OBSERVED_DATE'&&<p role="status" style={{fontSize:12,color:'#b54708'}}>最新有记录的 Cloudflare 来源日期为 {data.analytics.cloudflare.latestDateUTC}，距当前 UTC 日期 {data.analytics.cloudflare.observedDateCoverage.daysBehind} 天。可能没有新的有效访问记录，需对照 Cloudflare 原始报表核验，不可直接断定同步任务失败。</p>}
   {data.analytics.cloudflare.observedDateCoverage.status==='NO_VERIFIED_DATA'&&<p role="status" style={{fontSize:12}}>暂未同步任何经核验的 Cloudflare UTC 日期；缺失数据不等于零访问量。</p>}
   {['SCHEMA_MISSING','INVALID_OBSERVED_DATE'].includes(data.analytics.cloudflare.observedDateCoverage.status)&&<p role="alert" className="form-status error">Cloudflare 日统计表或已记录日期异常，请检查数据库迁移和来源。</p>}
   {data.analytics.cloudflare.partialInitialDayObserved&&<p role="status" style={{fontSize:12,color:'#b54708'}}>首次记录 2026-10-12 UTC 只覆盖约17:05以后，非全天数据；请勿与后续完整采集日直接比较。</p>}
   <div className="list-row"><div><strong>Google 搜索日统计</strong><small>已保存的美国太平洋时间报告日数；不等于官网访问人数</small></div><span>{count(data.analytics.google.observedDates)}</span></div>
   <div className="list-row"><div><strong>当前有效的已审核供应商条款</strong><small>仅统计已人工批准、已生效且尚未到期的采购条款；不证明颜色、DDP 运费、关税或最终利润。过期或未生效条款不会计入。</small></div><span>{data.procurement.approvedSourceCount===null?'尚无法核验':data.procurement.approvedSourceCount+' / '+count(data.procurement.supplierSources)}</span></div>
   {data.procurement.supplierSources===0&&<p className="form-status error" role="status">供应商价格库尚无审核来源，请先在 <a href="/app/suppliers">供应商采购价</a> 中填写真实条款、MOQ 和有效期；系统不会自动生成成本或利润。</p>}
   <div className="list-row"><div><strong>零售标价与已审核采购价对照</strong><small>可比 SKU 数 / 零售商品单价不高于该 SKU 已审核采购阶梯单价的数量；不含运费、税、Stripe 费用。采购 MOQ 单价不一定适用于单件样品。</small></div><span>{count(data.retailReferenceCostRisk.comparableSkus)} / {count(data.retailReferenceCostRisk.atOrBelowApprovedCost)}</span></div>
   {(data.retailReferenceCostRisk.atOrBelowApprovedCost??0)>0&&<p className="form-status error" role="alert">发现零售标价可能倒挂：{data.retailReferenceCostRisk.affectedSkus?.join('、')}。请重新确认供应商与规格、单件采购价和含税运费，再由经营负责人决定是否调整零售价格。系统不会自动改价或关闭已获准的样品业务。</p>}
   {data.retailReferenceCostRisk.schemaPresent&&data.retailReferenceCostRisk.comparableSkus===0&&<p role="status" style={{fontSize:12}}>没有可比较的、已审核且处于有效期内的供应商 SKU 采购价；不能据此断言现有零售售价有利润。</p>}
   <div className="list-row"><div><strong>已启用国家运价 / 运输包装 SKU</strong><small>运价需要实际核实，单件运费不代表最终可收款报价</small></div><span>{count(data.procurement.activeShippingRates)} / {count(data.procurement.packagingSkus)}</span></div>
   <div className="list-row"><div><strong>已核验自动运价目的地</strong><small>只显示已启用的国家、运输方式及最低件数；未列出的目的地必须人工询价，不能套用美国运价。</small></div><span>{data.procurement.activeShippingRoutes===null?'尚无法核验':data.procurement.activeShippingRoutes.length===0?'暂无启用运价':data.procurement.activeShippingRoutes.map(r=>r.country+' '+(r.method==='sea'?'海运':'空运')+'≥'+r.minimumUnits+'件').join('；')}</span></div>
   <div className="list-row"><div><strong>真实批发 Stripe 收款闭环</strong><small>仅统计报价合计至少 10 件、Stripe 成功会话对应足额入账记录且订单为 PAID 的正式订单；不包含 $0.50 独立验证或历史线下收款。</small></div><span>{data.b2bStripeEvidence.reconciledPaidOrders===null?'尚无法核验':data.b2bStripeEvidence.reconciledPaidOrders+' / '+count(data.b2bStripeEvidence.wholesaleOrders)}</span></div>
   <WholesalePaymentPreflight accessKey={accessKey} refresh={refresh}/>
   <div className="list-row"><div><strong>批发待付款订单 / Stripe 会话</strong><small>未全额付款订单数和已创建的批发 Stripe Checkout 会话数，均为生产数据库只读统计；不代表已扣款。</small></div><span>{count(data.b2bStripeEvidence.awaitingPaymentOrders)} / {count(data.b2bStripeEvidence.stripeCheckoutSessions)}</span></div>
   {data.b2bStripeEvidence.schemaPresent&&data.b2bStripeEvidence.reconciledPaidOrders===0&&<p role="status" className="form-status error">尚无可核对的正式批发 Stripe 足额付款闭环。配置开启及独立小额测试成功，不等于客户批发订单验收通过。</p>}
   <div className="list-row"><div><strong>已发送/已浏览、尚未接受的报价</strong><small>待跟进报价总数 / 未来两个 UTC 日历日内到期数 / 已过报价有效日但尚未处理数；仅为后台只读统计。</small></div>
    <span>{count(data.quoteExpiryHealth.outstandingSentOrViewed)} / {count(data.quoteExpiryHealth.expiringWithinTwoCalendarDays)} / {count(data.quoteExpiryHealth.pastValidityDate)}</span></div>
   {(data.quoteExpiryHealth.expiringWithinTwoCalendarDays??0)>0&&
     <p role="status" className="form-status">有报价临近有效期限。请在 <a href="/app/quotes">报价管理</a> 中逐单核查客户需求、实际供应商价格、DDP 运费及税务；不得未经客户同意自动改价或发送邮件。</p>}
   {(data.quoteExpiryHealth.pastValidityDate??0)>0&&
     <p role="alert" className="form-status error">有已发送或已浏览报价超过有效日期但仍未转为已接受/过期状态。旧报价不可当成有效收款依据，应核对状态并重新审核。</p>}
   {!data.quoteExpiryHealth.schemaPresent&&
     <p role="alert" className="form-status error">报价数据表缺失，不能核实报价到期风险。</p>}
   <div className="list-row"><div><strong>批发 Stripe Checkout 待确认会话</strong><small>本地数据库中仍为 OPEN/PENDING 且订单未结清的会话总数 / 超过 24 小时的会话数；不是实时 Stripe 支付状态。</small></div>
    <span>{count(data.b2bStripeSessionHealth.openOrPendingSessions)} / {count(data.b2bStripeSessionHealth.olderThan24Hours)}</span></div>
   {(data.b2bStripeSessionHealth.olderThan24Hours??0)>0&&
    <p role="alert" className="form-status error">存在超过 24 小时未更新的批发 Checkout 记录，最早创建于 UTC {data.b2bStripeSessionHealth.oldestAgedUTC||'未知'}。请核对 Stripe Dashboard 与 Webhook。勿直接重开付款、人工标记 PAID 或自动发货。</p>}
   {!data.b2bStripeSessionHealth.schemaPresent&&
    <p role="alert" className="form-status error">批发 Stripe 会话数据库表缺失，不能判断等待确认的支付记录。</p>}
   <div className="list-row"><div><strong>Stripe 签名事件处理情况</strong><small>仅统计系统收到并登记的 Stripe Webhook 事件，不代表 Stripe 全部事件或真实订单付款完成；已处理 / 已收到。</small></div>
    <span>{count(data.stripeWebhookHealth.processedEvents)} / {count(data.stripeWebhookHealth.receivedEvents)}</span></div>
   <div className="list-row"><div><strong>Stripe 未完成处理的事件</strong><small>待处理 / 超过 10 分钟仍未处理。Webhook 验签失败、未送达平台的事件不会计入。</small></div>
    <span>{count(data.stripeWebhookHealth.unprocessedEvents)} / {count(data.stripeWebhookHealth.olderThanTenMinutes)}</span></div>
   {data.stripeWebhookHealth.schemaPresent&&<div className="list-row"><div><strong>未处理 Stripe 事件分类（只读）</strong><small>付款成功回调 / Checkout 过期 / 其他。过期事件也可能属于真实订单，必须按 Stripe 原始投递记录核实。</small></div>
    <span>{count(data.stripeWebhookHealth.unprocessedPaymentSuccessEvents)} / {count(data.stripeWebhookHealth.unprocessedExpirationEvents)} / {count(data.stripeWebhookHealth.unprocessedOtherEvents)}</span></div>}
   {!data.stripeWebhookHealth.schemaPresent&&<p role="alert" className="form-status error">Stripe 事件台账不存在，不能判断支付回调是否处理。请检查正式数据库迁移。</p>}
   {(data.stripeWebhookHealth.olderThanTenMinutes??0)>0&&<p role="alert" className="form-status error">
    存在超过 10 分钟仍未处理的 Stripe 事件（最早登记于 UTC {data.stripeWebhookHealth.oldestUnprocessedUTC||'未知'}）。请先在 Stripe Dashboard 核实事件和订单状态，确认后再按正常重试流程处理，切勿手工标记付款。
   </p>}
   <div className="list-row"><div><strong>网站 Turnstile</strong><small>防止机器人滥用询盘接口；配置必须有站点和服务端双密钥</small></div><span>{data.security.turnstileEnabled?'已启用':data.security.turnstileMisconfigured?'启用配置不完整':'未启用'}</span></div>
   <div className="list-row"><div><strong>Stripe 在线收款配置</strong><small>仅代表 API 凭证和签名 Webhook 的配置状态；不代表真实到账或税务义务已经核实</small></div><span>{data.payments.checkoutConfigurationReady?'基础配置就绪，待真实交易验收':data.payments.checkoutRequested?'Stripe 启用请求存在但配置不完整':'未启用'}</span></div>
   <div className="list-row"><div><strong>B2B 报价订单 Stripe 收款</strong><small>仅检查 API 凭证、商家审核标志和允许目的州名单，不代表州销售税注册或真实结算已获验收。</small></div>
    <span>{data.payments.b2bConfigurationReady?'B2B 技术配置就绪；允许目的州/DC '+data.payments.b2bApprovedDestinationStates.length+' 个（非税务注册清单）':data.payments.retailOnlyRestriction?'当前仅限零售样品付款':data.payments.b2bCheckoutRequested&&!data.payments.b2bTaxReviewed?'待审核 B2B 税务及运输费用':'B2B 收款尚未开放或条件未满足'}</span></div>
   {data.payments.b2bCheckoutRequested&&<p role="status" style={{fontSize:12,color:'#b54708'}}>Stripe Tax 开关、技术目的州清单及后台税务审核标志均不等于已取得政府销售税许可。请对照下方 Stripe Tax Live 实际登记记录，逐单核实税务义务、合法税务依据、买方接受报价及支付凭证。</p>}
   <StripeTaxRegistrationsReadOnly accessKey={accessKey} refresh={refresh}/>
   <p style={{fontSize:12,color:'#667085'}}>核查 UTC {data.checkedAt}。当前面板只展示正式状态、聚合记录数和凭证是否存在，不会创建报价、发送邮件或执行付款。</p>
  </>}
 </section>;
}


type WholesaleOrderStatus={
 reference:string;orderStatus:string;paymentStatus:string;
 wholesaleUnits:number;stripeCheckoutSessions:number;stripePaymentReconciled:boolean;
 codeChecksPassed:boolean;blockers:string[];nextAction:string;
 manualSalesTaxDeterminationStillRequired:boolean;
};
type WholesalePreflightResponse={
 ok:boolean;checkedAtUTC:string;audited:number;hasMore:boolean;
 codeChecksPassed:number;quoteRevisionRequired:number;stripeFullyReconciled:number;
 pendingOrderReview:{awaitingPayment:number;missingDeliveryAddress:number;missingSalesTaxBasis:number;
  quoteRevisionRequired:number;codeReadyButManualApprovalRequired:number};
 orders:WholesaleOrderStatus[];code?:string;
};
const paymentBlockerLabel:Record<string,string>={
 LIVE_B2B_STRIPE_CONFIG_NOT_READY:'生产 Stripe 配置尚未满足付款条件',
 CLOSED_ORDER_NO_NEW_CHECKOUT:'订单已关闭，不允许重新扣款',
 ALREADY_MARKED_PAID_NO_NEW_CHECKOUT:'订单已标记收款，禁止重复扣款',
 PAID_NOT_FULLY_RECONCILED_VIA_STRIPE:'尚无足额 Stripe 实收及成功会话的对应凭证',
 PAYMENT_STATUS_NOT_ELIGIBLE:'订单付款状态不允许建立新 Checkout',
 OPEN_STRIPE_RECONCILIATION_REVIEW:'存在未关闭的 Stripe 付款核账争议',
 QUOTE_STRIPE_TERMS_MISSING:'买方接受的报价未明确同意 Stripe 卡支付',
 QUOTE_ACCEPTANCE_OR_VALIDITY_NOT_PAYABLE:'报价未完成有效的发送及买方接受，或已到期',
 COMPLETE_US_DELIVERY_ADDRESS_REQUIRED:'买方收货地址缺少必要的美国州、市、邮编或街道',
 ACCEPTED_QUOTE_SHIP_STATE_MISMATCH:'收货州与原报价运输条款不一致',
 DESTINATION_NOT_IN_APPROVED_B2B_SCOPE:'收货州不在已审核的 B2B 系统配置名单内',
 SALES_TAX_BASIS_NOT_DOCUMENTED:'报价缺少销售税处理依据',
 ACCEPTED_QUOTE_AMOUNT_CHANGED:'订单金额与买方接受的原报价不一致',
 ACCEPTED_QUOTE_ITEMS_CHANGED_OR_MISSING:'订单商品规格、数量或单价与原报价不一致',
 PAYMENT_AMOUNT_OR_CURRENCY_INVALID:'付款金额或币种不符合系统要求',
 PARTIAL_RECEIPT_NEEDS_MANUAL_REVIEW:'已有部分收款，需人工核账并重新审核',
 ORDER_TOTAL_NOT_RECONCILED:'订单商品、运费和税额的合计不一致',
 NOT_WHOLESALE_QUANTITY:'不足十件，不属于批发收款范围',
};
function WholesalePaymentPreflight({accessKey,refresh}:{accessKey:string;refresh:number}){
 const [data,setData]=useState<WholesalePreflightResponse|null>(null);
 const [error,setError]=useState('');
 useEffect(()=>{
  const ctrl=new AbortController();
  setData(null);setError('');
  fetch('/api/admin/b2b-payment-preflight',{
   headers:{'x-admin-key':accessKey},cache:'no-store',signal:ctrl.signal,
  }).then(async res=>{
   const parsed=await res.json() as WholesalePreflightResponse;
   if(!res.ok||!parsed.ok)throw Error(parsed.code||'付款预检不可用');
   if(!ctrl.signal.aborted)setData(parsed);
  }).catch(err=>{if(!ctrl.signal.aborted)setError(err instanceof Error?err.message:'读取预检失败')});
  return ()=>ctrl.abort();
 },[accessKey,refresh]);
 return <div style={{border:'1px solid #e0e5ec',borderRadius:10,padding:12,marginTop:14,marginBottom:14}}
  aria-label="B2B Stripe 逐单付款预检">
   <strong>批发订单逐单 Stripe 付款预检（仅管理员只读）</strong>
   <p style={{fontSize:12}}>只核对正式报价和系统证据；不会自动改报价、发邮件或收款。销售税义务、豁免及注册必须逐单独立确认。</p>
   {error&&<p role="alert" className="form-status error">当前无法核验：{error}。请勿将错误视为全部已就绪。</p>}
   {!error&&!data&&<p>正在读取逐单付款检查…</p>}
   {data&&<>
    <p role="status" style={{fontSize:12}}>检查 {data.audited} 笔批发订单；代码条件通过 {data.codeChecksPassed} 笔；
     需要重新审核报价 {data.quoteRevisionRequired} 笔；
     Stripe 账本足额对账 {data.stripeFullyReconciled} 笔。
     {data.hasMore?'尚有其他记录未在本次页面中展开；以下汇总仅统计本次已审核的前 50 笔。':''}</p>
    <div className="list-row"><div><strong>待付款批发订单资料补齐</strong>
      <small>仅统计未付款/部分付款且未关闭的订单：缺完整收货地址 / 缺销售税依据 / 需重新报价。每类可能重叠，不得相加当作订单总数。</small></div>
      <span>{data.pendingOrderReview.missingDeliveryAddress} / {data.pendingOrderReview.missingSalesTaxBasis} / {data.pendingOrderReview.quoteRevisionRequired}</span>
    </div>
    <p style={{fontSize:12}}>当前待付款 {data.pendingOrderReview.awaitingPayment} 笔；代码检查通过但仍待卖方税务和扣款审批 {data.pendingOrderReview.codeReadyButManualApprovalRequired} 笔。历史已付款订单不纳入催补资料统计，也不得再次扣款。</p>
    {data.orders.slice(0,12).map(o=><div className="list-row" key={o.reference}>
     <div>
      <strong>{o.reference} · {o.wholesaleUnits} 件 · {o.paymentStatus}</strong>
      <small>{o.stripePaymentReconciled?'已核验数据库内 Stripe 会话与实收凭证':o.codeChecksPassed?'系统条款检查通过；仍需税务与收款人工审批':'付款前置条件不完整，不得直接重新扣款'}</small>
      {o.blockers.length>0&&<small style={{display:'block',color:'#a12622',marginTop:4}}>
       {o.blockers.slice(0,6).map(code=>paymentBlockerLabel[code]||code).join('；')}
       {o.blockers.length>6?'；另有 '+(o.blockers.length-6)+' 项':''}
      </small>}
     </div>
    </div>)}
    <p style={{fontSize:12,color:'#667085'}}>查询时间 {data.checkedAtUTC} UTC。请在报价管理中根据实际价格、运费、税务凭证修订新报价并重新取得客户接受，切勿篡改历史报价。</p>
   </>}
  </div>;
}
