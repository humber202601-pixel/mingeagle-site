import SearchConsoleImport from './SearchConsoleImport';
import {useEffect,useState} from 'react';
import {ArrowUpRight,RefreshCcw} from 'lucide-react';

type SourceRow={channel:string;audience:string;inquiries:number;quoted:number;ordered:number};
type PageRow={entryPage:string;inquiries:number};
type Data={ok:boolean;error?:string;summary:{inquiries:number;b2b:number;b2c:number;unknown:number;quoted:number;ordered:number};sources:SourceRow[];entryPages:PageRow[];generatedAt:string;limitations:string[]};
const sources:Record<string,string>={GOOGLE:'Google',BING:'Bing',TIKTOK:'TikTok',YOUTUBE:'YouTube',INSTAGRAM:'Instagram',FACEBOOK:'Facebook',PARTNER:'合作推荐',OTHER_TAGGED:'其他带标签渠道',DIRECT_UNKNOWN:'未知 / 直接访问'};
const pages:Record<string,string>={APARTMENT_GUIDE:'公寓家庭指南',CAMP_GUIDE:'篮球训练营采购指南',BULK_GUIDE:'批量采购指南',HOME:'首页',FOR_COACHES:'教练采购',FOR_SCHOOLS:'学校采购',WHOLESALE:'批发采购',PRODUCTS:'产品目录',PRODUCT_DETAIL:'产品详情',NOT_RECORDED:'未记录落地页',OTHER_PAGE:'其他页面'};
const audiences:Record<string,string>={B2B:'B2B 批发 / 机构',B2C:'B2C 个人客户',UNKNOWN:'尚不能分类'};
const num=(x:number)=>Number(x||0).toLocaleString('zh-CN');
export default function InboundGrowth({accessKey}:{accessKey:string}){
 const [days,setDays]=useState(90),[refresh,setRefresh]=useState(0);
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
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
 return <div style={{display:'grid',gap:18}}><SearchConsoleImport accessKey={accessKey}/>
   <section className="panel" style={{padding:18}}>
    <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'end'}}>
      <label style={{display:'grid',gap:7,fontSize:12,fontWeight:700}}>询盘创建时间
        <select value={days} onChange={e=>setDays(Number(e.target.value))} style={{padding:9,borderRadius:8,border:'1px solid #cbd5e1'}}>
          <option value={30}>最近30天</option><option value={90}>最近90天</option><option value={365}>最近365天</option><option value={0}>全部历史</option>
        </select>
      </label>
      <button type="button" className="button secondary small" disabled={loading} onClick={()=>setRefresh(n=>n+1)}><RefreshCcw size={15}/>按需刷新</button>
    </div>
    <p style={{margin:'12px 0 0',fontSize:12,color:'#667085'}}>本页只读取 CRM 已收到的真实询盘。搜索曝光和网站访问量尚未接入，不能据此计算网站转化率。</p>
   </section>
   {loading&&<section className="panel" style={{padding:18}}>正在统计实际询盘…</section>}
   {error&&<section className="panel" style={{padding:18}}><p role="alert">{error}。不要频繁刷新，以免耗尽 D1 免费额度。</p></section>}
   {data&&!loading&&<>
    <section className="metric-grid">
      {([['网站询盘',data.summary.inquiries,'实际已记录的询盘'],['B2B 明确采购意向',data.summary.b2b,'批发、机构、零售商'],['B2C 明确个人客户',data.summary.b2c,'用户选择了个人客户类型'],['身份尚不明确',data.summary.unknown,'不强行归类'],['关联有效报价',data.summary.quoted,'客户下的非草稿报价'],['关联真实订单',data.summary.ordered,'非草稿、未取消的订单']] as const).map(([label,value,note])=><div className="metric" key={label}><span>{label}</span><strong>{num(value)}</strong><small>{note}</small></div>)}
    </section>
    <section className="panel" style={{padding:18}}>
      <div className="panel-head"><h2>实际询盘来自哪个渠道？</h2><span>按来源与采购身份汇总</span></div>
      {data.summary.inquiries===0?<div className="empty-row">当前筛选时间范围内没有已记录的官网询盘。不能据此判断网站没有访客。</div>:<div className="table-wrap"><table><thead><tr><th>渠道</th><th>客户身份</th><th>询盘</th><th>关联报价</th><th>关联订单</th></tr></thead><tbody>{data.sources.map((row,i)=><tr key={row.channel+row.audience+i}><td><strong>{sources[row.channel]||row.channel}</strong></td><td>{audiences[row.audience]||row.audience}</td><td>{num(row.inquiries)}</td><td>{num(row.quoted)}</td><td>{num(row.ordered)}</td></tr>)}</tbody></table></div>}
    </section>
    <section className="panel" style={{padding:18}}>
      <div className="panel-head"><h2>询盘最初进入哪个页面？</h2><span>仅记录带有落地页字段的询盘</span></div>
      <div className="table-wrap"><table><thead><tr><th>落地页类型</th><th>真实询盘</th></tr></thead><tbody>{data.entryPages.map(row=><tr key={row.entryPage}><td>{pages[row.entryPage]||row.entryPage}</td><td>{num(row.inquiries)}</td></tr>)}{!data.entryPages.length&&<tr><td colSpan={2}>尚无实际询盘数据。</td></tr>}</tbody></table></div>
    </section>
    <section className="panel" style={{padding:18}}>
      <div className="panel-head"><h2>搜索曝光与访问量 · 尚待连接</h2><span>不显示虚构数据</span></div>
      <p style={{color:'#475467',fontSize:13,lineHeight:1.7}}>网站目前已有 sitemap.xml、robots.txt 和询盘 UTM 归因。Google Search Console 需要先由域名持有人验证所有权；Bing Webmaster Tools 也需要验证。验证后才能获取搜索展现、点击及实际收录表现。</p>
      <div style={{display:'flex',gap:16,flexWrap:'wrap'}}>
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
