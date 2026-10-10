import {useEffect,useState} from 'react';
type Suggestion={kind:string;target:string;reason:string;action:string;impressions:number;clicks:number;ctr:number;position:number};
type Report={kind:string;start_date:string;end_date:string};
type Data={ok:boolean;suggestions:Suggestion[];reports:Report[];limitations:string[]};
export default function SeoOpportunities({accessKey}:{accessKey:string}){
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
 useEffect(()=>{const controller=new AbortController();setError('');
 (async()=>{try{const r=await fetch('/api/admin/search-opportunities',{headers:{'x-admin-key':accessKey},signal:controller.signal});const v=await r.json() as Data&{error?:string};if(!r.ok||!v.ok)throw Error(v.error||'无法读取');if(!controller.signal.aborted)setData(v)}catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'读取失败')}})();return ()=>controller.abort();
 },[accessKey,refresh]);
 return <section className="panel" style={{padding:18,display:'grid',gap:12}}>
 <div className="panel-head"><h2>SEO 优化机会 · 真实数据驱动</h2><button className="button secondary small" type="button" onClick={()=>setRefresh(x=>x+1)}>刷新建议</button></div>
 <p style={{fontSize:12,color:'#667085'}}>建议由手动导入的 Google Search Console 报表生成，仅供人工筛选。不会自动发布内容、投广告或伪造访问量。</p>
 {error&&<p role="alert">{error}</p>}
 {data?.reports?.length?<p style={{fontSize:12,color:'#667085'}}>最近报表：{data.reports.map(r=>`${r.kind==='queries'?'关键词':'页面'} ${r.start_date}～${r.end_date}`).join('；')}</p>:<p>尚无 Google Search Console 报表，请先导入官方 CSV。</p>}
 <div className="table-wrap"><table><thead><tr><th>搜索词 / 页面</th><th>展示</th><th>点击</th><th>平均排名</th><th>发现的问题</th><th>建议采取的动作</th></tr></thead><tbody>
 {(data?.suggestions||[]).map((r,i)=><tr key={r.kind+r.target+i}><td style={{overflowWrap:'anywhere',maxWidth:220}}><strong>{r.target}</strong><small style={{display:'block'}}>{r.kind==='queries'?'搜索关键词':'网站页面'}</small></td><td>{r.impressions}</td><td>{r.clicks}</td><td>{r.position.toFixed(1)}</td><td>{r.reason}</td><td>{r.action}</td></tr>)}
 {!data?.suggestions?.length&&<tr><td colSpan={6}>暂时没有符合筛选条件的机会；这不代表网站没有搜索需求。</td></tr>}
 </tbody></table></div>
 {(data?.limitations||[]).map((x,i)=><p key={i} style={{fontSize:12,color:'#667085',margin:0}}>{x}</p>)}
 </section>
}
