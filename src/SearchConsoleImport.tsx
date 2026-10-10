import {useEffect,useState} from 'react';
type Entry={dimension:string;clicks:number;impressions:number;ctr:number;position:number};
type Snapshot={id:string;kind:string;start_date:string;end_date:string;row_count:number;imported_at:string};
function csvRows(raw:string):string[][]{
 const out:string[][]=[];let row:string[]=[],field='',quoted=false;
 for(let i=0;i<raw.length;i++){const c=raw[i];if(c==='"'){if(quoted&&raw[i+1]==='"'){field+='"';i++}else quoted=!quoted}
 else if(c===','&&!quoted){row.push(field);field=''}
 else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&raw[i+1]==='\n')i++;row.push(field);if(row.some(x=>x.trim()))out.push(row);row=[];field=''}
 else field+=c}
 if(quoted)throw Error('CSV 引号不完整');
 row.push(field);if(row.some(x=>x.trim()))out.push(row);return out;
}
function parse(raw:string,kind:'queries'|'pages'):Entry[]{
 const records=csvRows(raw.replace(/^\uFEFF/,''));const headers=(records.shift()||[]).map(x=>x.trim().toLowerCase());
 const index=(options:string[])=>headers.findIndex(x=>options.includes(x));
 const ix=index(kind==='queries'?['top queries','query','queries']:['top pages','page','pages']);
 const clicks=index(['clicks']),impressions=index(['impressions']),ctr=index(['ctr']),position=index(['position']);
 if([ix,clicks,impressions,ctr,position].some(v=>v<0))throw Error('CSV 缺少必要列。请导出 Search Console「搜索结果」里的查询或网页表格。');
 const rows=records.map(r=>{
   const rate=(r[ctr]||'').trim(),num=(x:string)=>Number((x||'').replace(/,/g,'').trim());
   return {dimension:(r[ix]||'').trim(),clicks:num(r[clicks]),impressions:num(r[impressions]),ctr:rate.endsWith('%')?num(rate.slice(0,-1))/100:num(rate),position:num(r[position])};
 });
 if(!rows.length||rows.length>1000)throw Error('每次请导入 1–1000 行 CSV 数据');
 return rows;
}
export default function SearchConsoleImport({accessKey}:{accessKey:string}){
 const [kind,setKind]=useState<'queries'|'pages'>('queries'),[property,setProperty]=useState('sc-domain:mingeagle.com');
 const [start,setStart]=useState(''),[end,setEnd]=useState(''),[file,setFile]=useState<File|null>(null);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[snapshots,setSnapshots]=useState<Snapshot[]>([]);
 const refresh=async()=>{try{const r=await fetch('/api/admin/search-console-import',{headers:{'x-admin-key':accessKey}});const b=await r.json() as {imports?:Snapshot[]};setSnapshots(b.imports||[])}catch{setSnapshots([])}};
 useEffect(()=>{void refresh()},[accessKey]);
 const submit=async()=>{if(!file||!start||!end){setMessage('请选择 CSV 文件并填写实际报表日期范围。');return}
 setBusy(true);setMessage('');
 try{const rows=parse(await file.text(),kind);
 const r=await fetch('/api/admin/search-console-import',{method:'POST',headers:{'content-type':'application/json','x-admin-key':accessKey},body:JSON.stringify({kind,property,startDate:start,endDate:end,rows})});
 const data=await r.json() as {ok?:boolean;error?:string;rows?:number};if(!r.ok||!data.ok)throw Error(data.error||'导入失败');
 setMessage('导入成功：保存 '+data.rows+' 条数据。这是手动导出快照，不是实时搜索数据。');await refresh();
 }catch(e){setMessage(e instanceof Error?e.message:'导入失败')}finally{setBusy(false)}};
 return <section className="panel" style={{padding:18,display:'grid',gap:12}}>
 <div className="panel-head"><h2>Google 搜索表现 · 手动导入</h2><span>真实报表快照</span></div>
 <p style={{fontSize:13,color:'#475467'}}>从已验证的 Google Search Console → 搜索结果 →「查询」或「网页」导出 CSV，填写与报表一致的日期范围。仅支持本网站数据；不会自动访问 Google 账号，也不代表实时流量。</p>
 <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
 <label>报表类型 <select value={kind} onChange={e=>setKind(e.target.value as 'queries'|'pages')}><option value="queries">查询关键词</option><option value="pages">落地网页</option></select></label>
 <label>网站资源 <select value={property} onChange={e=>setProperty(e.target.value)}><option value="sc-domain:mingeagle.com">sc-domain:mingeagle.com</option><option value="https://mingeagle.com/">https://mingeagle.com/</option></select></label>
 <label>开始日期 <input aria-label="开始日期" type="date" value={start} onChange={e=>setStart(e.target.value)}/></label>
 <label>结束日期 <input aria-label="结束日期" type="date" value={end} onChange={e=>setEnd(e.target.value)}/></label>
 <label>CSV 文件 <input type="file" accept=".csv,text/csv" onChange={e=>setFile(e.target.files?.[0]||null)}/></label>
 </div><button className="button" type="button" disabled={busy} onClick={()=>void submit()}>{busy?'正在导入…':'保存 Search Console 数据快照'}</button>
 {message&&<p role="status">{message}</p>}
 <div className="table-wrap"><table><thead><tr><th>报表</th><th>统计区间</th><th>行数</th><th>导入时间</th></tr></thead><tbody>{snapshots.map(s=><tr key={s.id}><td>{s.kind==='queries'?'搜索词':'网页'}</td><td>{s.start_date} – {s.end_date}</td><td>{s.row_count}</td><td>{s.imported_at}</td></tr>)}{!snapshots.length&&<tr><td colSpan={4}>尚无导入记录，不展示估算搜索流量。</td></tr>}</tbody></table></div>
 </section>
}
