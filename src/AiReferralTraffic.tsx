import {useEffect,useState} from 'react';

type Platform='CHATGPT'|'PERPLEXITY'|'CLAUDE'|'GEMINI'|'COPILOT';
type Totals={providerVisits:number;sampledPageviews:number};
export type AiFormEvidence={
 channel:string;entryPage:string;evidenceKind:string;
 inquiries:number;exactQuoted:number;exactOrdered:number
};
type Landing={platform:Platform;pageBucket:string;sampledPageviews:number};
const pageNames:Record<string,string>={
 HOME:'首页',KIDS_QUIET_GUIDE:'孩子室内安静运动指南',
 APARTMENT_GUIDE:'公寓静音篮球指南',SCHOOL_EQUIPMENT_GUIDE:'学校 / 培训机构指南',
 CAMP_GUIDE:'篮球训练营采购',BULK_GUIDE:'静音篮球批量采购',
 WHOLESALE_CATALOG:'批发产品目录',TEAM_CUSTOM:'球队定制 / Logo',
 FOR_COACHES:'教练采购',FOR_SCHOOLS:'学校采购',WHOLESALE:'批发采购',
 PRODUCTS:'产品目录',PRODUCT_DETAIL:'具体产品 / 使用指南',OTHER_PAGE:'其他页面'
};
type Report={
 ok:boolean;connected:boolean;source:string;days:number;
 summary:Totals;platforms:Record<Platform,Totals>;
 rows:Array<{dateUTC:string;providerVisits:number;sampledPageviews:number;fetchedAt:string}>;
 coverage:{observedDays:number;fromUTC:string|null;toUTC:string|null;latestFetchUTC:string|null};
 pageBreakdown:Landing[];
 landingCoverage:{complete:boolean;missingPositiveDates:string[];note:string};
 caveats:string[];error?:string
};
const labels:Record<Platform,string>={
 CHATGPT:'ChatGPT',PERPLEXITY:'Perplexity',CLAUDE:'Claude',
 GEMINI:'Google Gemini',COPILOT:'Microsoft Copilot'
};
const names=Object.keys(labels) as Platform[];
const count=(n:number)=>n.toLocaleString('zh-CN');

export default function AiReferralTraffic({accessKey,days,refresh,aiEvidence,crmReady,crmError}:{
 accessKey:string;days:number;refresh:number;
 aiEvidence?:AiFormEvidence[];crmReady:boolean;crmError?:string
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
   <div style={{display:'grid',gap:8}}>
    <h3 style={{margin:'4px 0 0'}}>AI 引荐进入了哪些官网内容？</h3>
    {report.landingCoverage?.complete?
     report.pageBreakdown.length===0?
      <p style={{fontSize:12,color:'#667085',margin:0}}>
       已核实日期没有可归因的 AI 引荐内容事件；不是平台推荐次数。
      </p>:
      <div className="table-wrap"><table><thead><tr>
       <th>AI 来源</th><th>官网页面类别</th><th>浏览事件</th>
      </tr></thead><tbody>
       {report.pageBreakdown.slice(0,24).map((p,i)=><tr key={p.platform+p.pageBucket+i}>
        <td>{labels[p.platform]}</td><td>{pageNames[p.pageBucket]||'其他页面'}</td>
        <td>{count(p.sampledPageviews)}</td>
       </tr>)}
      </tbody></table></div>:
     <p role="status" style={{fontSize:12,color:'#b54708',margin:0}}>
      已有真实 AI 引荐，但部分日期的落地页明细未同步完整，暂不展示不完整排名。
     </p>}
    <p style={{fontSize:12,color:'#667085',margin:0}}>
     页面级只统计浏览事件；同一 Visit 可能访问多页，不对页面分组 Visits 求和。
    </p>
   </div>
   <p style={{fontSize:12,color:'#667085',margin:0}}>
    数据覆盖：{report.coverage.fromUTC} 至 {report.coverage.toUTC}（UTC）；
    最近更新 {report.coverage.latestFetchUTC||'—'}。
    {report.summary.sampledPageviews===0?'这些已同步日期中没有识别出上述 AI 域名引荐；不能推断 AI 平台没有推荐网站。':''}
   </p>
  </>}
  <div style={{display:'grid',gap:8,borderTop:'1px solid #e4e7ec',paddingTop:14}}>
   <h3 style={{margin:0}}>CRM 真实 AI 来源询盘与后续报价（独立证据）</h3>
   <p style={{fontSize:12,color:'#475467',margin:0}}>
    这里只显示已经提交到 CRM 的询盘。来源标签来自客户浏览器的 UTM 或 Referrer，
    不能证明该访客与上面的 Cloudflare 匿名访问属于同一人或同一次会话。
   </p>
   {crmError?<p role="alert" style={{color:'#b42318'}}>询盘数据读取失败：{crmError}；不能认为没有 AI 询盘。</p>:
    !crmReady?<p role="status">CRM 询盘归因数据尚未取得。</p>:
    !aiEvidence?.length?<p>当前时间范围内没有携带可识别 AI 来源标签的实际询盘记录。</p>:
    <div className="table-wrap"><table><thead><tr>
     <th>表单报告来源</th><th>进入页面</th><th>来源证据</th>
     <th>真实询盘</th><th>关联已发报价</th><th>关联订单</th>
    </tr></thead><tbody>
     {aiEvidence.map((e,i)=><tr key={e.channel+e.entryPage+e.evidenceKind+i}>
      <td>{labels[e.channel as Platform]||e.channel}</td>
      <td>{pageNames[e.entryPage]||'未记录 / 其他页面'}</td>
      <td>{e.evidenceKind==='FORM_UTM'?'表单 UTM':'表单 Referrer'}</td>
      <td>{count(e.inquiries)}</td><td>{count(e.exactQuoted)}</td><td>{count(e.exactOrdered)}</td>
     </tr>)}
    </tbody></table></div>}
   <p style={{fontSize:12,color:'#667085',margin:0}}>
    报价与订单仅按照 CRM 已持久化的询盘编号严格关联。不同日期口径与不同数据源不可直接计算访客转化率。
   </p>
  </div>
  <p style={{fontSize:12,color:'#667085',margin:0}}>
   Google AI Overviews / AI Mode、隐藏来源的 App 跳转和普通搜索流量无法由此可靠区分；
   不将 AI 引荐与 CRM 询盘直接相除推算转化率。
  </p>
 </section>;
}
