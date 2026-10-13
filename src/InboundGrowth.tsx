import SeoOpportunities from './SeoOpportunities';
import {containsPartialInitialDay,describeSnapshotAge,FIRST_CAPTURE_TIME_UTC} from './analyticsStatus';
import SearchConsoleImport from './SearchConsoleImport';
import AiVisibilityPanel from './AiVisibilityPanel';
import AiReferralTraffic from './AiReferralTraffic';
import BingAiPerformanceImport from './BingAiPerformanceImport';
import {useEffect,useState} from 'react';
import {ArrowUpRight,RefreshCcw} from 'lucide-react';

type SourceRow={channel:string;audience:string;inquiries:number;quoted:number;ordered:number;exactQuoted:number;exactOrdered:number;videoContext:number};
type PageRow={entryPage:string;inquiries:number;quoted:number;ordered:number;exactQuoted:number;exactOrdered:number;videoContext:number};
type AiEvidenceRow={channel:string;entryPage:string;evidenceKind:string;inquiries:number;exactQuoted:number;exactOrdered:number};
type Data={ok:boolean;error?:string;aiEvidence:AiEvidenceRow[];summary:{inquiries:number;b2b:number;b2c:number;unknown:number;quoted:number;ordered:number;exactQuoted:number;exactOrdered:number;videoContextInquiries:number};sources:SourceRow[];entryPages:PageRow[];generatedAt:string;limitations:string[];
 dataProvenance:{inquiries:string;exactQuote:string;exactOrder:string;leadAssociated:string;
 websiteVisits:{connected:boolean;count:number|null};searchImpressions:{connected:boolean;count:number|null};
 conversionWindow:string}};
type AnalyticsDaily={ok:boolean;source?:string;host?:string;connected:boolean;days:number;rows:Array<{
 dateUTC:string;providerVisits:number;sampledPageviews:number;fetchedAt:string;
}>;coverage:{observedDays:number;fromUTC:string|null;toUTC:string|null;latestFetchUTC:string|null};
 caveats:string[];error?:string};
type GscDaily={ok:boolean;source?:string;connected:boolean;days:number;timezone:string;rows:Array<{datePacific:string;clicks:number;impressions:number;ctr:number;averagePosition:number;fetchedAt:string}>;coverage:{observedDays:number;from:string|null;to:string|null;lastFetchedAt:string|null};caveats:string[];error?:string};
const sources:Record<string,string>={CHATGPT:'ChatGPT（访问来源）',PERPLEXITY:'Perplexity（访问来源）',CLAUDE:'Claude（访问来源）',GEMINI:'Gemini（访问来源）',COPILOT:'Copilot（访问来源）',GOOGLE:'Google',BING:'Bing',TIKTOK:'TikTok',YOUTUBE:'YouTube',INSTAGRAM:'Instagram',FACEBOOK:'Facebook',PARTNER:'合作推荐',OTHER_TAGGED:'其他带标签渠道',DIRECT_UNKNOWN:'未知 / 直接访问'};
const pages:Record<string,string>={KIDS_QUIET_GUIDE:'孩子室内安静运动专题',SCHOOL_EQUIPMENT_GUIDE:'学校与培训机构采购专题',APARTMENT_GUIDE:'公寓家庭指南',CAMP_GUIDE:'篮球训练营采购指南',BULK_GUIDE:'批量采购指南',WHOLESALE_CATALOG:'批发产品目录',TEAM_CUSTOM:'球队定制篮球',HOME:'首页',FOR_COACHES:'教练采购',FOR_SCHOOLS:'学校采购',WHOLESALE:'批发采购',PRODUCTS:'产品目录',PRODUCT_DETAIL:'产品详情',NOT_RECORDED:'未记录落地页',OTHER_PAGE:'其他页面'};
const audiences:Record<string,string>={B2B:'B2B 批发 / 机构',B2C:'B2C 个人客户',UNKNOWN:'尚不能分类'};
const num=(x:number)=>Number(x||0).toLocaleString('zh-CN');
const pageAdvice=(row:PageRow)=>{
 if(row.entryPage==='NOT_RECORDED'||row.entryPage==='OTHER_PAGE')return '先完善来源识别，不归因到具体页面';
 if(row.exactOrdered>0)return '有询盘编号直接关联订单：核实渠道标签并分析需求';
 if(row.exactQuoted>0)return '有询盘编号直接关联报价：优化采购说明和报价入口';
 if(row.ordered>0||row.quoted>0)return '只有同客户关联，不能据此认定本页面促成成交';
 if(row.inquiries>0)return '已有询盘：跟进客户需求，观察报价进展';
 return '暂无有效询盘证据';
};
export default function InboundGrowth({accessKey}:{accessKey:string}){
 const [days,setDays]=useState(90),[refresh,setRefresh]=useState(0);
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const [analytics,setAnalytics]=useState<AnalyticsDaily|null>(null);
 const [analyticsError,setAnalyticsError]=useState('');
 const [gsc,setGsc]=useState<GscDaily|null>(null);
 const [gscError,setGscError]=useState('');
 const snapshotAge=describeSnapshotAge(analytics?.coverage.latestFetchUTC);
 const initialDayPartial=analytics?.connected?containsPartialInitialDay(analytics.rows):false;
 useEffect(()=>{
   const c=new AbortController();
   setData(null);setError('');setLoading(true);
   (async()=>{try{
    const r=await fetch('/api/admin/inbound-growth?days='+days,{headers:{'x-admin-key':accessKey},signal:c.signal});
    const body=await r.json() as Data;
    if(!r.ok||!body.ok)throw new Error(body.error||'无法读取询盘归因。');
    if(!c.signal.aborted)setData(body);
   }catch(e){if(!c.signal.aborted)setError(e instanceof Error?e.message:'数据不可用');}
   finally{if(!c.signal.aborted)setLoading(false)}})();
   return ()=>c.abort();
 },[accessKey,days,refresh]);
 useEffect(()=>{
  const c=new AbortController();
  setAnalytics(null);setAnalyticsError('');
  fetch('/api/admin/web-analytics-daily?days='+days,{
    headers:{'x-admin-key':accessKey},signal:c.signal,cache:'no-store'
  }).then(async r=>{
    const body=await r.json() as AnalyticsDaily;
    if(!r.ok||!body.ok)throw Error(body.error||'网站访问聚合数据读取失败');
    if(!c.signal.aborted)setAnalytics(body);
  }).catch(e=>{if(!c.signal.aborted)setAnalyticsError(e instanceof Error?e.message:'统计暂时不可用')});
  return ()=>c.abort();
 },[accessKey,days,refresh]);
 useEffect(()=>{
  const controller=new AbortController();setGsc(null);setGscError('');
  fetch('/api/admin/gsc-search-daily?days='+days,{headers:{'x-admin-key':accessKey},signal:controller.signal,cache:'no-store'})
   .then(async response=>{const value=await response.json() as GscDaily;
    if(!response.ok||!value.ok)throw Error(value.error||'GSC 真实搜索数据暂不可用');
    if(!controller.signal.aborted)setGsc(value);
   }).catch(e=>{if(!controller.signal.aborted)setGscError(e instanceof Error?e.message:'GSC 暂不可用')});
  return ()=>controller.abort();
 },[accessKey,days,refresh]);
 return <div style={{display:'grid',gap:18}}><AiVisibilityPanel accessKey={accessKey}/><BingAiPerformanceImport accessKey={accessKey}/><SearchConsoleImport accessKey={accessKey}/><SeoOpportunities accessKey={accessKey}/>
   <section className="panel" style={{padding:18}}>
    <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'end'}}>
      <label style={{display:'grid',gap:7,fontSize:12,fontWeight:700}}>询盘创建时间
        <select value={days} onChange={e=>setDays(Number(e.target.value))} style={{padding:9,borderRadius:8,border:'1px solid #cbd5e1'}}>
          <option value={30}>最近30天</option><option value={90}>最近90天</option><option value={365}>最近365天</option><option value={0}>全部历史</option>
        </select>
      </label>
      <button type="button" className="button secondary small" disabled={loading} onClick={()=>setRefresh(n=>n+1)}><RefreshCcw size={15}/>按需刷新</button>
    </div>
    <p style={{margin:'12px 0 0',fontSize:12,color:'#667085'}}>询盘转化按 CRM 真实记录计算；Cloudflare 网页访问按已有的独立 UTC 日期快照显示。搜索曝光仍未接入，不合并不同数据口径做营销归因。</p>
   </section>
   <AiReferralTraffic accessKey={accessKey} days={days} refresh={refresh} aiEvidence={data?.aiEvidence} crmReady={Boolean(data&&!loading)} crmError={error}/>
   {loading&&<section className="panel" style={{padding:18}}>正在统计实际询盘…</section>}
   {error&&<section className="panel" style={{padding:18}}><p role="alert">{error}。不要频繁刷新，以免耗尽 D1 免费额度。</p></section>}
   {data&&!loading&&<>
    <section className="metric-grid">
      {([['网站询盘',data.summary.inquiries,'实际已记录的询盘'],['来自创作者视频选购入口的询盘',data.summary.videoContextInquiries,'只有正式提交询盘且携带有效站内视频代码才计数，不能证明实际观看'],['B2B 明确采购意向',data.summary.b2b,'批发、机构、零售商'],['B2C 明确个人客户',data.summary.b2c,'用户选择了个人客户类型'],['身份尚不明确',data.summary.unknown,'不强行归类'],['直接关联报价的询盘',data.summary.exactQuoted,'按询盘编号关联有效报价；每个询盘只算一次'],
 ['直接关联订单的询盘',data.summary.exactOrdered,'询盘→报价→订单编号完整关联；每个询盘只算一次']] as const).map(([label,value,note])=><div className="metric" key={label}><span>{label}</span><strong>{num(value)}</strong><small>{note}</small></div>)}
    </section>
    <section className="panel" style={{padding:18}}>
      <div className="panel-head"><h2>数据口径与真实转化链</h2><span>严格询盘编号关联 · 避免把同一客户的多次报价当成新增客户</span></div>
      <div className="metric-grid">
       <div className="metric"><span>网站访问统计</span><strong>{analytics?.connected?'日聚合已同步':'等待有效快照'}</strong><small>Cloudflare Visits 只按已同步日期展示；不代表准确唯一访客，也不能与 CRM 询盘直接相除</small></div>
       <div className="metric"><span>询盘 → 已发报价</span><strong>{data.summary.inquiries>0?(data.summary.exactQuoted/data.summary.inquiries*100).toFixed(1)+'%':'—'}</strong><small>{num(data.summary.exactQuoted)} / {num(data.summary.inquiries)} 条同批询盘，按编号直接关联</small></div>
       <div className="metric"><span>询盘 → 订单</span><strong>{data.summary.inquiries>0?(data.summary.exactOrdered/data.summary.inquiries*100).toFixed(1)+'%':'—'}</strong><small>{num(data.summary.exactOrdered)} / {num(data.summary.inquiries)} 条同批询盘，非订单数或实际到账率</small></div>
       <div className="metric"><span>Google 搜索展现</span><strong>{gsc?.connected?num(gsc.rows.reduce((n,r)=>n+r.impressions,0)):'等待有效快照'}</strong><small>{gsc?.connected?'已同步 '+gsc.coverage.observedDays+' 个 Google 报告日；非访问量':'已有 GSC 授权；但 CRM 尚无有效日快照，不填 0'}</small></div>
      </div>
      {data.summary.inquiries>0&&data.summary.inquiries<30&&<p role="status" style={{fontSize:12,color:'#667085'}}>样本仅 {data.summary.inquiries} 条，比例仅用于流程检查，不宜据此预测未来成交率。</p>}
      <p style={{fontSize:12,color:'#667085'}}>独立询盘行数去重统计，报价/订单依靠正式引用关系计算。历史客户仅通过 lead_id 关联的其他报价、订单不计入直接转化；同一客户可能多次询盘。当前不是访问量漏斗，也不能据此断言具体营销活动创造了订单。</p>
    </section>
    <section className="panel" style={{padding:18}}>
      <div className="panel-head"><h2>实际询盘来自哪个渠道？</h2><span>按来源与采购身份汇总；视频入口信号仅为导航提示</span></div>
      {data.summary.inquiries===0?<div className="empty-row">当前筛选时间范围内没有已记录的官网询盘。不能据此判断网站没有访客。</div>:<div className="table-wrap"><table><thead><tr><th>渠道</th><th>客户身份</th><th>询盘</th><th>视频入口提示</th><th>直接关联报价</th><th>直接关联订单</th><th>同客户关联报价</th><th>同客户关联订单</th></tr></thead><tbody>{data.sources.map((row,i)=><tr key={row.channel+row.audience+i}><td><strong>{sources[row.channel]||row.channel}</strong></td><td>{audiences[row.audience]||row.audience}</td><td>{num(row.inquiries)}</td><td>{num(row.videoContext)}</td><td>{num(row.exactQuoted)}</td><td>{num(row.exactOrdered)}</td><td>{num(row.quoted)}</td><td>{num(row.ordered)}</td></tr>)}</tbody></table></div>}
    </section>
    <section className="panel" style={{padding:18}}>
      <div className="panel-head"><h2>询盘最初进入哪个页面？</h2><span>缺失来源单独归类；报价与订单仅表示客户关联，不证明单次页面促成</span></div>
      <div className="table-wrap"><table><thead><tr><th>落地页类型</th><th>真实询盘</th><th>视频入口提示</th><th>直接关联报价</th><th>直接关联订单</th><th>同客户报价</th><th>同客户订单</th><th>建议下一步</th></tr></thead><tbody>{data.entryPages.map(row=><tr key={row.entryPage}><td>{pages[row.entryPage]||row.entryPage}</td><td>{num(row.inquiries)}</td><td>{num(row.videoContext)}</td><td>{num(row.exactQuoted)}</td><td>{num(row.exactOrdered)}</td><td>{num(row.quoted)}</td><td>{num(row.ordered)}</td><td>{pageAdvice(row)}</td></tr>)}{!data.entryPages.length&&<tr><td colSpan={8}>尚无实际询盘数据。</td></tr>}</tbody></table></div>
    </section>
    <section className="panel" style={{padding:18}}>
      <div className="panel-head"><h2>下一步优先优化哪些页面？</h2><span>只根据真实 CRM 询盘与后续业务记录</span></div>
      {data.entryPages.filter(p=>!['NOT_RECORDED','OTHER_PAGE'].includes(p.entryPage)&&p.inquiries>0).length===0
       ? <p>暂时没有足够的具体页面询盘证据。先积累真实客户来源，不推荐凭空选“爆款页面”。</p>
       : <div className="table-wrap"><table><thead><tr><th>页面</th><th>业务依据</th><th>推荐动作</th></tr></thead><tbody>
         {[...data.entryPages].filter(p=>!['NOT_RECORDED','OTHER_PAGE'].includes(p.entryPage)&&p.inquiries>0)
           .sort((a,b)=>b.exactOrdered-a.exactOrdered||b.exactQuoted-a.exactQuoted||b.inquiries-a.inquiries)
           .slice(0,3).map(p=><tr key={p.entryPage}><td><strong>{pages[p.entryPage]||p.entryPage}</strong></td>
             <td>{num(p.inquiries)} 询盘 / {num(p.exactQuoted)} 直接关联报价 / {num(p.exactOrdered)} 直接关联订单</td><td>{pageAdvice(p)}</td></tr>)}
         </tbody></table></div>}
      <p style={{fontSize:12,color:'#667085'}}>视频入口提示来自首次提交询盘时保存的 V001–V016 站内链接代码；不会统计视频播放、视频观看时间或所有视频点击，也无法证明该视频促成采购或成交。</p>
      <p style={{fontSize:12,color:'#667085'}}>仅供内容优化排序，不代表页面带来了全部订单，也不自动花费广告预算。若出现活动记录重复，系统不会因此增加询盘计数。</p>
    </section>
    <section className="panel" style={{padding:18}}>
      <div className="panel-head"><h2>网站访问统计与搜索曝光</h2><span>Cloudflare Web Analytics · 经过来源核验的每日聚合快照</span></div>
      <p style={{color:'#475467',fontSize:13,lineHeight:1.7}}>MING EAGLE 官网已部署 Cloudflare Web Analytics。此处只展示由授权 Cloudflare 查询获取并同步的**每日聚合快照**，而不是实时网站请求。历史未同步的日期保持未知，不能自动视为零；首次安装之前的数据无法补采。CRM 不持有 Cloudflare 分析 API 密钥。</p>
      {analyticsError&&<p role="alert" style={{fontSize:12,color:'#b42318'}}>Cloudflare 汇总暂不可读：{analyticsError}。请通过下方 Cloudflare 官方报表查询，CRM 不会将读取失败当作 0。</p>}
      {!analyticsError&&analytics&&!analytics.connected&&<p role="status" style={{fontSize:13}}>Cloudflare 已开始采集，但 CRM 暂无核验通过的日统计快照。现在不能报告访问量或计算访客到询盘转化率。</p>}
      {!analyticsError&&analytics?.connected&&<>
       <div className="metric-grid">
        <div className="metric"><span>Cloudflare 报告 Visits（已同步日期）</span><strong>{num(analytics.rows.reduce((n,r)=>n+r.providerVisits,0))}</strong><small>来自 {analytics.coverage.observedDays} 个有记录的 UTC 日期；可能抽样，非唯一自然人</small></div>
        <div className="metric"><span>最新同步 UTC</span><strong style={{fontSize:16}}>{analytics.coverage.latestFetchUTC||'—'}</strong><small>仅同步已有统计的日期，不等于实时在线人数</small></div>
       </div>
       <div className="table-wrap"><table><thead><tr><th>UTC 日期</th><th>Cloudflare 报告 Visits</th><th>采样页载入事件</th></tr></thead><tbody>
        {analytics.rows.slice(0,14).map(r=><tr key={r.dateUTC}><td>{r.dateUTC}</td><td>{num(r.providerVisits)}</td><td>{num(r.sampledPageviews)}</td></tr>)}
       </tbody></table></div>
       <p role="status" style={{fontSize:12,color:snapshotAge.state==='old'||snapshotAge.state==='invalid'?'#b54708':'#667085'}}>{snapshotAge.text}</p>
       {initialDayPartial&&<p role="status" style={{fontSize:12,color:'#b54708'}}>首次采集日 2026-10-12 并非全天数据：Cloudflare 从 {FIRST_CAPTURE_TIME_UTC} 才开始收集访问事件；该日 Visits 不应与后续完整采集日直接对比。</p>}
       <p style={{fontSize:12,color:'#667085'}}>统计覆盖：{analytics.coverage.fromUTC} 至 {analytics.coverage.toUTC}。仅汇总实际同步的日期，不推算缺失日期；不与不同创建日期范围的询盘数相除计算访客转化率。</p>
      </>}
      <div style={{marginTop:14,borderTop:'1px solid #e4e7ec',paddingTop:14}}>
       <h3>Google Search Console · 真实搜索曝光与点击</h3>
       {gscError&&<p role="alert">Google 搜索日快照暂不可读：{gscError}。不会将读取异常当作 0。</p>}
       {!gscError&&gsc&&!gsc.connected&&<p role="status">已连接 Google Search Console，但 CRM 尚无定期同步的有效日统计；等待首次经过来源核验的快照。</p>}
       {!gscError&&gsc?.connected&&<>
        <div className="metric-grid">
         <div className="metric"><span>自然搜索点击</span><strong>{num(gsc.rows.reduce((n,r)=>n+r.clicks,0))}</strong><small>Google 搜索点击，非报价或订单</small></div>
         <div className="metric"><span>搜索结果曝光</span><strong>{num(gsc.rows.reduce((n,r)=>n+r.impressions,0))}</strong><small>{gsc.coverage.observedDays} 个 Google 有效报告日，非 Cloudflare Visits</small></div>
        </div>
        <div className="table-wrap"><table><thead><tr><th>Google 报告日（美国太平洋时间）</th><th>搜索点击</th><th>搜索曝光</th><th>点击率</th></tr></thead><tbody>
         {gsc.rows.slice(0,14).map(r=><tr key={r.datePacific}><td>{r.datePacific}</td><td>{num(r.clicks)}</td><td>{num(r.impressions)}</td><td>{(r.ctr*100).toFixed(2)}%</td></tr>)}
        </tbody></table></div>
        <p style={{fontSize:12,color:'#667085'}}>最新快照于 {gsc.coverage.lastFetchedAt||'—'} 保存；Google 搜索日使用 America/Los_Angeles 时区，通常有数日延迟，不直接与 Cloudflare UTC 访问数据相除计算转化。</p>
       </>}
      </div>
      <p style={{fontSize:12,color:'#667085'}}>请在 Cloudflare Web Analytics 中选择 mingeagle.com；这是浏览器采集的数据，可能受广告拦截、脚本禁用和采样影响，不能直接等同于自然人唯一访客数。</p>
      <p style={{color:'#475467',fontSize:13,lineHeight:1.7}}>官网已有 sitemap.xml、robots.txt 和询盘 UTM 归因。Google Search Console 的 mingeagle.com 域名属性已授权，CRM 也已接入独立的搜索日统计快照查询；但只有同步取得真实有效报告后才会显示点击和曝光。无数据不能当作零。详细搜索关键词与网页建议目前仍以人工导入的官方 CSV 快照为依据。Bing Webmaster Tools 是否验证仍需单独检查。</p>
      <div style={{display:'flex',gap:16,flexWrap:'wrap'}}>
       <a href="https://dash.cloudflare.com/?to=/:account/web-analytics/sites" target="_blank" rel="noopener noreferrer">查看 Cloudflare Web Analytics 真实访问报表 <ArrowUpRight size={13}/></a>
       <a href="https://search.google.com/search-console/" target="_blank" rel="noreferrer">打开 Google Search Console <ArrowUpRight size={13}/></a>
       <a href="https://www.bing.com/webmasters/" target="_blank" rel="noreferrer">打开 Bing Webmaster Tools <ArrowUpRight size={13}/></a>
       <a href="https://www.mingeagle.com/sitemap.xml" target="_blank" rel="noreferrer">查看官网站点地图 <ArrowUpRight size={13}/></a>
      </div>
      <p style={{color:'#667085',fontSize:12}}>站点地图提交不等于 Google 已收录；必须以搜索平台验证后的实际报表为准。</p>
    </section>
    <section className="panel" style={{padding:18}}>
      <div className="panel-head"><h2>归因说明与边界</h2><span>刷新时间 {new Date(data.generatedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}</span></div>
      {data.limitations.map((item,i)=><p key={i} style={{fontSize:12,color:'#667085',lineHeight:1.7,margin:'6px 0'}}>{item}</p>)}
    </section>
   </>}
  </div>;
}
