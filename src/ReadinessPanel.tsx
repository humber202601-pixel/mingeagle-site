import {useEffect,useState} from 'react';
type Snapshot={ok:boolean;checkedAt:string;
 analytics:{cloudflare:{schemaPresent:boolean;observedDates:number|null;latestDateUTC:string|null};google:{schemaPresent:boolean;observedDates:number|null;latestDatePacific:string|null}};
 procurement:{catalogPresent:boolean;supplierSources:number|null;approvedSourceCount:number|null;shippingRates:number|null;activeShippingRates:number|null;packagingSkus:number|null};
 security:{turnstileConfigured:boolean;turnstileEnabled:boolean;turnstileMisconfigured:boolean};
 payments:{checkoutRequested:boolean;providerCredentialsConfigured:boolean;environment:string|null;checkoutConfigurationReady:boolean};
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
   <div className="list-row"><div><strong>Google 搜索日统计</strong><small>已保存的美国太平洋时间报告日数；不等于官网访问人数</small></div><span>{count(data.analytics.google.observedDates)}</span></div>
   <div className="list-row"><div><strong>供应商已审核采购成本</strong><small>仅有供应商真实有效来源才能进行采购成本底线审核，不能凭零售价估算成本</small></div><span>{data.procurement.approvedSourceCount===null?'尚无法核验':data.procurement.approvedSourceCount+' / '+count(data.procurement.supplierSources)}</span></div>
   {data.procurement.supplierSources===0&&<p className="form-status error" role="status">供应商价格库尚无审核来源，请先在 <a href="/app/suppliers">供应商采购价</a> 中填写真实条款、MOQ 和有效期；系统不会自动生成成本或利润。</p>}
   <div className="list-row"><div><strong>已启用国家运价 / 运输包装 SKU</strong><small>运价需要实际核实，单件运费不代表最终可收款报价</small></div><span>{count(data.procurement.activeShippingRates)} / {count(data.procurement.packagingSkus)}</span></div>
   <div className="list-row"><div><strong>网站 Turnstile</strong><small>防止机器人滥用询盘接口；配置必须有站点和服务端双密钥</small></div><span>{data.security.turnstileEnabled?'已启用':data.security.turnstileMisconfigured?'启用配置不完整':'未启用'}</span></div>
   <div className="list-row"><div><strong>Airwallex 在线收款</strong><small>配置完备也不代表支付账户已激活；必须通过沙盒、Webhooks 和人工审批</small></div><span>{data.payments.checkoutConfigurationReady?'配置已就绪，待交易验收':data.payments.checkoutRequested?'启用请求存在但配置不完整':'未启用'}</span></div>
   <p style={{fontSize:12,color:'#667085'}}>核查 UTC {data.checkedAt}。当前面板只展示正式状态、聚合记录数和凭证是否存在，不会创建报价、发送邮件或执行付款。</p>
  </>}
 </section>;
}
