import {useEffect,useState} from 'react';
import {mapBingAiCsv,parseBingAiCsv,type BingAiCsv} from './bingAiCsv';

type Kind='PAGES'|'GROUNDING_QUERIES';
type Import={id:string;kind:Kind;start_date:string;end_date:string;row_count:number;created_at:string};
type Item={dimension:string;citations:number};
type Report={snapshot:Import|null;rows:Item[]};
type Payload={ok:boolean;error?:string;imports:Import[];latest:Record<Kind,Report>;bingApiAuthenticated:boolean};
export default function BingAiPerformanceImport({accessKey}:{accessKey:string}){
 const [data,setData]=useState<Payload|null>(null),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [reload,setReload]=useState(0),[kind,setKind]=useState<Kind>('PAGES');
 const [file,setFile]=useState<File|null>(null),[csv,setCsv]=useState<BingAiCsv|null>(null);
 const [dimensionColumn,setDimensionColumn]=useState(''),[countColumn,setCountColumn]=useState('');
 const [startDate,setStartDate]=useState(''),[endDate,setEndDate]=useState('');
 const [confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false);
 useEffect(()=>{
  const controller=new AbortController();setError('');
  fetch('/api/admin/bing-ai-report-import',{headers:{'x-admin-key':accessKey},cache:'no-store',signal:controller.signal})
   .then(async r=>{const v=await r.json() as Payload;if(!r.ok||!v.ok)throw Error(v.error||'Bing 报表不可读');if(!controller.signal.aborted)setData(v)})
   .catch(e=>{if(!controller.signal.aborted){setError(e instanceof Error?e.message:'Bing 报表暂不可用');setData(null)}});
  return ()=>controller.abort();
 },[accessKey,reload]);
 const parseFile=async(file:File|null)=>{
  setFile(file);setCsv(null);setDimensionColumn('');setCountColumn('');setConfirmed(false);setMessage('');
  if(!file)return;
  try{
   const parsed=parseBingAiCsv(await file.text());
   setCsv(parsed);setMessage('已读取 '+parsed.records.length+' 行，请将真实 Bing 导出文件中的列手动映射。');
  }catch(e){setMessage(e instanceof Error?e.message:'CSV 格式无效')}
 };
 const submit=async()=>{
  if(!csv||!file||!startDate||!endDate||!confirmed){setMessage('请完整填写日期、选择 CSV 列，并核对导出来源。');return}
  setBusy(true);setMessage('');
  try{
   const rows=mapBingAiCsv(csv,dimensionColumn,countColumn);
   const r=await fetch('/api/admin/bing-ai-report-import',{
    method:'POST',headers:{'content-type':'application/json','x-admin-key':accessKey},
    body:JSON.stringify({kind,startDate,endDate,manualConfirmation:true,rows})
   });
   const v=await r.json() as {ok?:boolean;error?:string;rowCount?:number};
   if(!r.ok||!v.ok)throw Error(v.error||'无法导入');
   setMessage('已保存 '+v.rowCount+' 条员工确认的 Bing AI Performance CSV 行。未完成 Bing API 自动认证，且不等于网站访问/点击。');
   setConfirmed(false);setFile(null);setCsv(null);setReload(x=>x+1);
  }catch(e){setMessage(e instanceof Error?e.message:'报表导入失败')}finally{setBusy(false)}
 };
 const report=data?.latest?.[kind];
 return <section className="panel" style={{padding:18,display:'grid',gap:12}} aria-label="Bing AI Performance CSV 导入">
  <div className="panel-head"><h2>Microsoft Bing AI Performance · 人工 CSV</h2><span>官方来源需由操作员提供和核对</span></div>
  <p style={{fontSize:13,color:'#475467'}}>本模块与上方“AI 推荐人工测试”独立。请从你已验证产权的
   <a href="https://www.bing.com/webmasters/" target="_blank" rel="noopener noreferrer"> Bing Webmaster Tools </a>
   → AI Performance 选择“Pages”或“Grounding queries”导出 CSV，手动选择正确列名。
   页面引用量与检索主题引用量是不同的采样视图，不能相加，也不是点击量、访客量或排名。
   当前尚未连接官方 Bing API，所以这里的来源性质为<strong>员工核实后导入的报表</strong>。</p>
  {error&&<p role="alert" style={{color:'#b42318'}}>{error}；无法读取不代表0次引用。</p>}
  {!error&&!data&&<p role="status">正在读取 Bing 报表历史…</p>}
  <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
   <label>导出数据类型 <select value={kind} onChange={e=>{setKind(e.target.value as Kind);setConfirmed(false)}}>
    <option value="PAGES">Pages · 被引用的公开页面</option>
    <option value="GROUNDING_QUERIES">Grounding queries · 检索主题短语</option>
   </select></label>
   <label>报表起始日期 <input type="date" aria-label="Bing 报表起始日期" value={startDate} onChange={e=>setStartDate(e.target.value)}/></label>
   <label>报表截止日期 <input type="date" aria-label="Bing 报表截止日期" value={endDate} onChange={e=>setEndDate(e.target.value)}/></label>
   <label>CSV 文件 <input type="file" accept=".csv,text/csv" onChange={e=>void parseFile(e.target.files?.[0]||null)}/></label>
  </div>
  {csv&&<div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
   <label>{kind==='PAGES'?'网页 URL 列':'检索主题列'} <select value={dimensionColumn} onChange={e=>setDimensionColumn(e.target.value)}>
    <option value="">请选择实际 CSV 列名</option>
    {csv.headers.map(h=><option key={h} value={h}>{h}</option>)}
   </select></label>
   <label>引用次数列 <select value={countColumn} onChange={e=>setCountColumn(e.target.value)}>
    <option value="">请选择实际 Citation count 列</option>
    {csv.headers.map(h=><option key={h} value={h}>{h}</option>)}
   </select></label>
   <span style={{alignSelf:'end',fontSize:12,color:'#667085'}}>共 {csv.records.length} 行；不允许空白指标自动转0。</span>
  </div>}
  <label style={{display:'flex',alignItems:'flex-start',gap:8,fontSize:13}}>
   <input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>
   我已在本人有权限的 Bing Webmaster AI Performance 账户核实本文件、日期、列含义和网站域名；这里属于人工核实导入，不是 Bing API 自动签名证明。
  </label>
  <button className="button" type="button" disabled={busy||!csv||!confirmed||!dimensionColumn||!countColumn} onClick={()=>void submit()}>
   {busy?'正在验证并保存…':'保存 Bing AI Performance CSV 快照'}
  </button>
  {message&&<p role="status">{message}</p>}
  {data&&<>
   <div className="table-wrap"><table><thead><tr><th>已保存快照类型</th><th>报表日期</th><th>行数</th><th>导入时间</th></tr></thead>
    <tbody>{data.imports.length?data.imports.map(r=><tr key={r.id}><td>{r.kind==='PAGES'?'被引网页':'检索主题'}</td><td>{r.start_date} – {r.end_date}</td><td>{r.row_count}</td><td>{r.created_at}</td></tr>):<tr><td colSpan={4}>尚未提供 Bing 导出文件；不能推断真实 AI 引用数为 0。</td></tr>}</tbody>
   </table></div>
   <h3 style={{margin:0}}>{kind==='PAGES'?'最近一次页面引用 CSV':'最近一次检索主题引用 CSV'}</h3>
   {report?.snapshot?<p style={{fontSize:12,color:'#667085'}}>报表期间 {report.snapshot.start_date} – {report.snapshot.end_date}，仅展示当前导入快照的前100项，未合并其它视图。</p>:
    <p style={{fontSize:12,color:'#667085'}}>该视图尚未导入实际 Bing 报表，引用量未知。</p>}
   {report?.rows.length?<div className="table-wrap"><table><thead><tr><th>{kind==='PAGES'?'网页':'检索主题'}</th><th>引用次数</th></tr></thead>
    <tbody>{report.rows.map(x=><tr key={x.dimension}><td>{kind==='PAGES'?<a target="_blank" rel="noopener noreferrer" href={x.dimension}>{x.dimension}</a>:x.dimension}</td><td>{x.citations}</td></tr>)}</tbody>
   </table></div>:null}
  </>}
 </section>;
}
