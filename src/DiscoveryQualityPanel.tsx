import {useEffect,useState} from 'react';
type Metrics={total:number;linked:number;sourceEvidence:number;sourceUrl:number;enriched:number;emailPresent:number;websitePresent:number;distinctWebsites:number;highGrade:number;middleGrade:number;enrichedOlder30:number;duplicateExactWebsiteSurplus:number};
type D={ok:boolean;connected:boolean;metrics:Metrics|null;error?:string;checkedAt?:string;limitations?:string[]};
export default function DiscoveryQualityPanel({accessKey}:{accessKey:string}){
 const [data,setData]=useState<D|null>(null),[error,setError]=useState('');
 const [refresh,setRefresh]=useState(0);
 useEffect(()=>{const c=new AbortController();setError('');setData(null);
  fetch('/api/admin/discovery-quality-summary',{headers:{'x-admin-key':accessKey},signal:c.signal,cache:'no-store'})
   .then(async r=>{const v=await r.json() as D;if(!r.ok||!v.ok)throw Error(v.error||'无法读取客户质量汇总');if(!c.signal.aborted)setData(v)})
   .catch(e=>{if(!c.signal.aborted)setError(e instanceof Error?e.message:'数据不可用')});
  return ()=>c.abort();},[accessKey,refresh]);
 const m=data?.metrics;
 return <section className="panel" style={{padding:18}} aria-label="客户发现证据与可联系性质量">
  <div className="panel-head"><div><h2>客户发现质量 · 来源证据与去重</h2><span>CRM 正式汇总，不包含客户姓名、邮箱或电话</span></div><button type="button" className="button secondary small" onClick={()=>setRefresh(x=>x+1)}>刷新质量指标</button></div>
  {error&&<p role="alert">{error}。不要把读取失败当作零客户。</p>}
  {!error&&!data&&<p>正在检查发现候选质量…</p>}
  {data&&!data.connected&&<p role="status">客户发现数据库尚未建立，不能报告零条候选。</p>}
  {m&&<>
   <div className="metric-grid">
    <div className="metric"><span>已发现候选</span><strong>{m.total}</strong><small>包含所有内部等级；非已成交客户</small></div>
    <div className="metric"><span>已保存来源网址</span><strong>{m.sourceUrl}/{m.total}</strong><small>保留出处，尚须审核证据真实性</small></div>
    <div className="metric"><span>已补全资料</span><strong>{m.enriched}/{m.total}</strong><small>完成流程≠联系人邮箱已验证</small></div>
    <div className="metric"><span>存在邮箱字段</span><strong>{m.emailPresent}/{m.total}</strong><small>存在不代表可送达或允许营销</small></div>
    <div className="metric"><span>网站文本去重余量</span><strong>{m.duplicateExactWebsiteSurplus}</strong><small>仅比较标准化网址字段</small></div>
    <div className="metric"><span>A/B 内部匹配级别</span><strong>{m.highGrade} / {m.middleGrade}</strong><small>还需人工核验采购需求与联系人</small></div>
   </div>
   <p style={{fontSize:12,color:'#667085'}}>已关联 CRM {m.linked} 条 · 已保存文字来源证据 {m.sourceEvidence} 条 · 30天以前的补全记录 {m.enrichedOlder30} 条。以上数据不会触发发送、重新导入或线索阶段变化。</p>
  </>}
 </section>;
}
