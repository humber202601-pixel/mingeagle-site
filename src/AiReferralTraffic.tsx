import {useEffect,useState} from 'react';

type Platform='CHATGPT'|'PERPLEXITY'|'CLAUDE'|'GEMINI'|'COPILOT';
type Totals={providerVisits:number;sampledPageviews:number};
type Report={
 ok:boolean;connected:boolean;source:string;days:number;
 summary:Totals;platforms:Record<Platform,Totals>;
 rows:Array<{dateUTC:string;providerVisits:number;sampledPageviews:number;fetchedAt:string}>;
 coverage:{observedDays:number;fromUTC:string|null;toUTC:string|null;latestFetchUTC:string|null};
 caveats:string[];error?:string
};
const labels:Record<Platform,string>={
 CHATGPT:'ChatGPT',PERPLEXITY:'Perplexity',CLAUDE:'Claude',
 GEMINI:'Google Gemini',COPILOT:'Microsoft Copilot'
};
const names=Object.keys(labels) as Platform[];
const count=(n:number)=>n.toLocaleString('zh-CN');

export default function AiReferralTraffic({accessKey,days,refresh}:{
 accessKey:string;days:number;refresh:number
}){
 const [report,setReport]=useState<Report|null>(null);
 const [error,setError]=useState('');
 const [loading,setLoading]=useState(true);
 useEffect(()=>{
  const controller=new AbortController();
  setReport(null);setError('');setLoading(true);
  fetch('/api/admin/ai-referrals-daily?days='+days,{
   headers:{'x-admin-key':accessKey},signal:controller.signal,cache:'no-store'
  }).then(async r=>{
   const body=await r.json() as Report;
   if(!r.ok||!body.ok)throw Error(body.error||'AI 引荐聚合报表暂不可用');
   if(!controller.signal.aborted)setReport(body);
  }).catch(e=>{
   if(!controller.signal.aborted)setError(e instanceof Error?e.message:'无法读取 AI 来源统计');
  }).finally(()=>{if(!controller.signal.aborted)setLoading(false)});
  return ()=>controller.abort();
 },[accessKey,days,refresh]);
 return <section className="panel" style={{padding:18,display:'grid',gap:12}} aria-label="AI 平台真实引荐来源统计">
  <div className="panel-head"><h2>AI 平台真实引荐访问 · Cloudflare</h2>
   <span>按已完成 UTC 日汇总 · 不追踪个人</span></div>
  <p style={{fontSize:13,color:'#475467',lineHeight:1.7,margin:0}}>
   只统计 Cloudflare 浏览器事件中实际存在的 ChatGPT、Perplexity、Claude、Gemini 或 Copilot
   引荐域名。AI 回答被引用、机器人抓取、直接访问与未带来源的访问不计入此表。
  </p>
  {loading&&<p role="status">正在读取已核验的 AI 引荐来源日统计…</p>}
  {error&&<p role="alert" style={{color:'#b42318'}}>AI 来源统计暂不可用：{error}。不能将缺失数据当作零次引荐。</p>}
  {!loading&&!error&&report&&!report.connected&&
   <p role="status">尚未同步到可核验的已完成 UTC 日期；AI 引荐数目前未知，不是 0。</p>}
  {!loading&&!error&&report?.connected&&<>
   <div className="metric-grid">
    <div className="metric"><span>可归因的 AI 来源页面浏览事件</span>
     <strong>{count(report.summary.sampledPageviews)}</strong>
     <small>{report.coverage.observedDays} 个有数据的 UTC 日期；Cloudflare 事件可能抽样</small></div>
    <div className="metric"><span>Cloudflare AI 来源 Visits</span>
     <strong>{count(report.summary.providerVisits)}</strong>
     <small>按来源组汇总的供应商估算 Visits，非唯一用户或 AI 引用次数</small></div>
   </div>
   <div className="table-wrap"><table><thead><tr>
    <th>AI 来源平台</th><th>页面浏览事件</th><th>Cloudflare Visits</th>
   </tr></thead><tbody>
    {names.map(platform=><tr key={platform}><td>{labels[platform]}</td>
     <td>{count(report.platforms[platform]?.sampledPageviews||0)}</td>
     <td>{count(report.platforms[platform]?.providerVisits||0)}</td></tr>)}
   </tbody></table></div>
   <p style={{fontSize:12,color:'#667085',margin:0}}>
    数据覆盖：{report.coverage.fromUTC} 至 {report.coverage.toUTC}（UTC）；
    最近更新 {report.coverage.latestFetchUTC||'—'}。
    {report.summary.sampledPageviews===0?'这些已同步日期中没有识别出上述 AI 域名引荐；不能推断 AI 平台没有推荐网站。':''}
   </p>
  </>}
  <p style={{fontSize:12,color:'#667085',margin:0}}>
   Google AI Overviews / AI Mode、隐藏来源的 App 跳转和普通搜索流量无法由此可靠区分；
   不将 AI 引荐与 CRM 询盘直接相除推算转化率。
  </p>
 </section>;
}
