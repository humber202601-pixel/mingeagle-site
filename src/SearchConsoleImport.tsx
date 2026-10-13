import {useEffect,useState} from 'react';
import {parseGscCsv} from './gscCsv';
type Entry={dimension:string;clicks:number;impressions:number;ctr:number;position:number};
type Snapshot={id:string;kind:string;start_date:string;end_date:string;row_count:number;imported_at:string};
export default function SearchConsoleImport({accessKey}:{accessKey:string}){
 const [kind,setKind]=useState<'queries'|'pages'>('queries'),[property,setProperty]=useState('sc-domain:mingeagle.com');
 const [start,setStart]=useState(''),[end,setEnd]=useState(''),[file,setFile]=useState<File|null>(null);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[snapshots,setSnapshots]=useState<Snapshot[]>([]);
 const [report,setReport]=useState<{imported:Snapshot|null;rows:Entry[]}|null>(null);
 const refresh=async()=>{try{const r=await fetch('/api/admin/search-console-import',{headers:{'x-admin-key':accessKey}});const b=await r.json() as {ok?:boolean;imports?:Snapshot[];error?:string};if(!r.ok||b.ok!==true)throw Error(b.error||'导入历史暂不可读');setSnapshots(b.imports||[])}catch(e){setSnapshots([]);setMessage('Google 报表导入历史暂不可读，不能据此认定没有报表：'+(e instanceof Error?e.message:'数据库不可用'))}};
 const loadReport=async()=>{try{const r=await fetch('/api/admin/search-console-report?kind='+kind,{headers:{'x-admin-key':accessKey}});const b=await r.json() as {ok?:boolean;imported:Snapshot|null;rows:Entry[]};if(!r.ok||!b.ok)throw Error('报表读取失败');setReport({imported:b.imported,rows:b.rows});}catch{setReport(null)}};
 useEffect(()=>{void refresh()},[accessKey]);
 useEffect(()=>{void loadReport()},[accessKey,kind]);
 const submit=async()=>{if(!file||!start||!end){setMessage('请选择 CSV 文件并填写实际报表日期范围。');return}
 setBusy(true);setMessage('');
 try{const rows=parseGscCsv(await file.text(),kind);
 const r=await fetch('/api/admin/search-console-import',{method:'POST',headers:{'content-type':'application/json','x-admin-key':accessKey},body:JSON.stringify({kind,property,startDate:start,endDate:end,rows})});
 const data=await r.json() as {ok?:boolean;error?:string;rows?:number};if(!r.ok||!data.ok)throw Error(data.error||'导入失败');
 setMessage('导入成功：保存 '+data.rows+' 条数据。这是手动导出快照，不是实时搜索数据。');await refresh();await loadReport();
 }catch(e){setMessage(e instanceof Error?e.message:'导入失败')}finally{setBusy(false)}};
 return <section className="panel" style={{padding:18,display:'grid',gap:12}}>
 <div className="panel-head"><h2>Google 搜索表现 · 手动导入</h2><span>真实报表快照</span></div>
 <p style={{fontSize:13,color:'#475467'}}>从已验证的 Google Search Console → 搜索结果 →「查询」或「网页」导出 CSV，填写与报表一致的日期范围。仅支持官网已核验站点地图中的 25 个公开页面（包括最新的家庭与学校 AI 专题）；同时接受 www 和历史非 www 的 HTTPS 网址，不导入带参数的询盘、订单或私人页面。手动 CSV 快照不会自动访问 Google 账号，也不是实时流量。</p>
 <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
 <label>报表类型 <select value={kind} onChange={e=>setKind(e.target.value as 'queries'|'pages')}><option value="queries">查询关键词</option><option value="pages">落地网页</option></select></label>
 <label>网站资源 <select value={property} onChange={e=>setProperty(e.target.value)}><option value="sc-domain:mingeagle.com">sc-domain:mingeagle.com（已连接域名属性）</option><option value="https://www.mingeagle.com/">https://www.mingeagle.com/（官网正式域名）</option><option value="https://mingeagle.com/">https://mingeagle.com/（历史域名）</option></select></label>
 <label>开始日期 <input aria-label="开始日期" type="date" value={start} onChange={e=>setStart(e.target.value)}/></label>
 <label>结束日期 <input aria-label="结束日期" type="date" value={end} onChange={e=>setEnd(e.target.value)}/></label>
 <label>CSV 文件 <input type="file" accept=".csv,text/csv" onChange={e=>setFile(e.target.files?.[0]||null)}/></label>
 </div><button className="button" type="button" disabled={busy} onClick={()=>void submit()}>{busy?'正在导入…':'保存 Search Console 数据快照'}</button>
 {message&&<p role="status">{message}</p>}
 <div className="table-wrap"><table><thead><tr><th>报表</th><th>统计区间</th><th>行数</th><th>导入时间</th></tr></thead><tbody>{snapshots.map(s=><tr key={s.id}><td>{s.kind==='queries'?'搜索词':'网页'}</td><td>{s.start_date} – {s.end_date}</td><td>{s.row_count}</td><td>{s.imported_at}</td></tr>)}{!snapshots.length&&<tr><td colSpan={4}>尚无导入记录，不展示估算搜索流量。</td></tr>}</tbody></table></div>
 <div style={{display:'grid',gap:8}}><h3 style={{margin:'8px 0 0'}}>最新{kind==='queries'?'关键词':'页面'}数据（按展示次数排序）</h3>{report?.imported?<p style={{fontSize:12,color:'#667085'}}>报表区间：{report.imported.start_date} 至 {report.imported.end_date}；仅展示导入数据前 100 行，不代表网站总流量。</p>:<p style={{fontSize:12,color:'#667085'}}>尚未导入该类型报表。</p>}
 <div className="table-wrap"><table><thead><tr><th>{kind==='queries'?'搜索关键词':'页面网址'}</th><th>展示</th><th>点击</th><th>CTR</th><th>平均排名</th></tr></thead><tbody>{(report?.rows||[]).map((row,i)=><tr key={row.dimension+i}><td style={{maxWidth:350,overflowWrap:'anywhere'}}>{row.dimension}</td><td>{row.impressions.toLocaleString()}</td><td>{row.clicks.toLocaleString()}</td><td>{(row.ctr*100).toFixed(1)}%</td><td>{row.position.toFixed(1)}</td></tr>)}{!report?.rows.length&&<tr><td colSpan={5}>没有已导入的搜索表现数据。</td></tr>}</tbody></table></div></div>
 </section>
}
