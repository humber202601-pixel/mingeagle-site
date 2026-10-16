import {useEffect,useState} from 'react';
type Snapshot={ok:boolean;checkedAt:string;
 analytics:{cloudflare:{schemaPresent:boolean;observedDates:number|null;latestDateUTC:string|null;lastFetchedAtUTC:string|null;partialInitialDayObserved:boolean;observedDateCoverage:{status:'SCHEMA_MISSING'|'NO_VERIFIED_DATA'|'LATEST_COMPLETED_UTC_DAY'|'OLDER_OBSERVED_DATE'|'INVALID_OBSERVED_DATE';daysBehind:number|null}};google:{schemaPresent:boolean;observedDates:number|null;latestDatePacific:string|null;lastFetchedAtUTC:string|null}};
 procurement:{catalogPresent:boolean;supplierSources:number|null;approvedSourceCount:number|null;shippingRates:number|null;activeShippingRates:number|null;packagingSkus:number|null;activeShippingRoutes:Array<{country:string;method:string;minimumUnits:number}>|null};
 retailReferenceCostRisk:{schemaPresent:boolean;comparableSkus:number|null;atOrBelowApprovedCost:number|null;unmatchedApprovedSkus:number|null;affectedSkus:string[]|null};
 b2bStripeEvidence:{schemaPresent:boolean;wholesaleOrders:number|null;awaitingPaymentOrders:number|null;stripeCheckoutSessions:number|null;reconciledPaidOrders:number|null};
 b2bStripeSessionHealth:{schemaPresent:boolean;openOrPendingSessions:number|null;olderThan24Hours:number|null;oldestAgedUTC:string|null};
 stripeWebhookHealth:{schemaPresent:boolean;receivedEvents:number|null;processedEvents:number|null;unprocessedEvents:number|null;olderThanTenMinutes:number|null;oldestUnprocessedUTC:string|null};
 security:{turnstileConfigured:boolean;turnstileEnabled:boolean;turnstileMisconfigured:boolean};
 payments:{checkoutRequested:boolean;providerCredentialsConfigured:boolean;webhookConfigured:boolean;environment:string|null;checkoutConfigurationReady:boolean;retailOnlyRestriction:boolean;b2bCheckoutRequested:boolean;b2bTaxReviewed:boolean;b2bApprovedDestinationStates:string[];b2bConfigurationReady:boolean};
 caveats:string[];error?:string};
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
   <div className="list-row"><div><strong>批发待付款订单 / Stripe 会话</strong><small>未全额付款订单数和已创建的批发 Stripe Checkout 会话数，均为生产数据库只读统计；不代表已扣款。</small></div><span>{count(data.b2bStripeEvidence.awaitingPaymentOrders)} / {count(data.b2bStripeEvidence.stripeCheckoutSessions)}</span></div>
   {data.b2bStripeEvidence.schemaPresent&&data.b2bStripeEvidence.reconciledPaidOrders===0&&<p role="status" className="form-status error">尚无可核对的正式批发 Stripe 足额付款闭环。配置开启及独立小额测试成功，不等于客户批发订单验收通过。</p>}
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
   {!data.stripeWebhookHealth.schemaPresent&&<p role="alert" className="form-status error">Stripe 事件台账不存在，不能判断支付回调是否处理。请检查正式数据库迁移。</p>}
   {(data.stripeWebhookHealth.olderThanTenMinutes??0)>0&&<p role="alert" className="form-status error">
    存在超过 10 分钟仍未处理的 Stripe 事件（最早登记于 UTC {data.stripeWebhookHealth.oldestUnprocessedUTC||'未知'}）。请先在 Stripe Dashboard 核实事件和订单状态，确认后再按正常重试流程处理，切勿手工标记付款。
   </p>}
   <div className="list-row"><div><strong>网站 Turnstile</strong><small>防止机器人滥用询盘接口；配置必须有站点和服务端双密钥</small></div><span>{data.security.turnstileEnabled?'已启用':data.security.turnstileMisconfigured?'启用配置不完整':'未启用'}</span></div>
   <div className="list-row"><div><strong>Stripe 在线收款配置</strong><small>仅代表 API 凭证和签名 Webhook 的配置状态；不代表真实到账或税务义务已经核实</small></div><span>{data.payments.checkoutConfigurationReady?'基础配置就绪，待真实交易验收':data.payments.checkoutRequested?'Stripe 启用请求存在但配置不完整':'未启用'}</span></div>
   <div className="list-row"><div><strong>B2B 报价订单 Stripe 收款</strong><small>须卖方正式发出完整报价、买方接受，且满足税务及收款安全条件；不是所有询盘均可直接付款</small></div><span>{data.payments.b2bConfigurationReady?'已配置受控收款：'+data.payments.b2bApprovedDestinationStates.join(' / ')+'（仅符合条件的订单可付款）':data.payments.retailOnlyRestriction?'当前仅限零售样品付款':data.payments.b2bCheckoutRequested&&!data.payments.b2bTaxReviewed?'待审核 B2B 税务及运输费用':'B2B 收款尚未开放或条件未满足'}</span></div>
   <p style={{fontSize:12,color:'#667085'}}>核查 UTC {data.checkedAt}。当前面板只展示正式状态、聚合记录数和凭证是否存在，不会创建报价、发送邮件或执行付款。</p>
  </>}
 </section>;
}
