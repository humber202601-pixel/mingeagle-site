import { useEffect, useState, type FormEvent } from 'react';
import { ExternalLink, Search, Download } from 'lucide-react';
import { csvCell } from '../shared/discovery';
type Clue={id:string;title:string;source_provider:string;source_url:string;source_evidence:string;customer_type:string;state_region:string;city:string;website?:string;status:string};
type SourceResult={ok:boolean;found:number;added:number;partial?:boolean;note?:string;error?:string};
type ApiResult={ok?:boolean;error?:string;clues?:Clue[];pagination?:{total:number;totalPages:number};sources?:Record<string,SourceResult>;nextRound?:number;added?:number;updated?:number;name?:string;existing?:boolean};
type Props={accessKey:string;stateCode:string;customerType:string;city:string;onChanged:()=>void};
const labels:Record<string,string>={SOCIAL:'公开社交账号',DIRECTORY:'企业 / 行业及公示目录',NCES:'NCES 学校 / 学区名录',OSM:'OpenStreetMap 地图'};
const states:Record<string,string>={PENDING:'待核验',CONVERTED:'已转入候选库',IGNORED:'已忽略'};
export default function DiscoverySources({accessKey,stateCode,customerType,city,onChanged}:Props){
  const [selected,setSelected]=useState(['SOCIAL','DIRECTORY']);
  const [rows,setRows]=useState<Clue[]>([]),[status,setStatus]=useState('PENDING'),[page,setPage]=useState(1),[pagination,setPagination]=useState({total:0,totalPages:0}),[reload,setReload]=useState(0);
  const [loading,setLoading]=useState(false),[searching,setSearching]=useState(false),[busy,setBusy]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [results,setResults]=useState<Record<string,SourceResult>>({}),[batch,setBatch]=useState({key:'',round:0});
  const ncesSupported=['ELEMENTARY_SCHOOL','MIDDLE_HIGH_SCHOOL','SCHOOL_DISTRICT'].includes(customerType);
  const enabled=(source:string)=>source==='NCES'?ncesSupported:source==='OSM'?Boolean(city.trim()):true;
  const active=selected.filter(enabled);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);
    void (async()=>{try{
      const response=await fetch(`/api/admin/discovery-sources-v1?status=${status}&page=${page}`,{headers:{'x-admin-key':accessKey},signal:controller.signal});
      const data=await response.json() as ApiResult;if(!response.ok||!data.ok)throw new Error(data.error||'线索加载失败。');
      if(!controller.signal.aborted){setRows(data.clues||[]);setPagination(data.pagination||{total:0,totalPages:0});if(page>Math.max(1,data.pagination?.totalPages||0))setPage(Math.max(1,data.pagination?.totalPages||0));}
    }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'线索加载失败。');}finally{if(!controller.signal.aborted)setLoading(false);}})();
    return()=>controller.abort();
  },[accessKey,status,page,reload]);
  async function request(body:Record<string,unknown>){
    const response=await fetch('/api/admin/discovery-sources-v1',{method:'POST',headers:{'content-type':'application/json','x-admin-key':accessKey},body:JSON.stringify(body)});
    const data=await response.json() as ApiResult;if(!response.ok||!data.ok){if(data.sources)setResults(data.sources);throw new Error(data.error||'线索操作失败。');}return data;
  }
  async function search(){
    setSearching(true);setError('');setMessage('');setResults({});const key=[stateCode,customerType,city,active.join(',')].join('|'),round=batch.key===key?batch.round:0;
    try{const data=await request({action:'SEARCH',stateCode,customerType,city,targetCount:20,round,sources:active});setResults(data.sources||{});setBatch({key,round:data.nextRound??round+1});setMessage(`扩展搜索第 ${round+1} 批：新增待核验线索 ${data.added||0} 条，更新已有 ${data.updated||0} 条。通过官网核验后才计入有效客户。`);setReload(n=>n+1);onChanged();}
    catch(e){setError(e instanceof Error?e.message:'扩展搜索失败。');}finally{setSearching(false);}
  }
  async function action(row:Clue,action:string,website?:string){
    setBusy(row.id);setError('');setMessage('');try{const data=await request({action,clueId:row.id,website});setMessage(action==='VERIFY'?`${data.name||row.title} 已通过官网核验${data.existing?'并关联已有候选':'并转入候选库'}。`:action==='IGNORE'?'该线索已忽略，可恢复。':'该线索已恢复。');setReload(n=>n+1);onChanged();}
    catch(e){setError(e instanceof Error?e.message:'操作失败。');}finally{setBusy('');}
  }
  function verify(event:FormEvent<HTMLFormElement>,row:Clue){event.preventDefault();void action(row,'VERIFY',String(new FormData(event.currentTarget).get('website')||''));}
  function exportRows(){
    const values=[['线索名称','来源','类型','州','公示城市 / 搜索城市','原始页面','官网','核验状态','证据'],...rows.map(r=>[r.title,labels[r.source_provider]||r.source_provider,r.customer_type,r.state_region,r.city,r.source_url,r.website||'',states[r.status]||r.status,r.source_evidence])];
    const url=URL.createObjectURL(new Blob(['\uFEFF'+values.map(r=>r.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8;'}));const link=document.createElement('a');link.href=url;link.download='mingeagle-public-source-clues.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <section className="panel discovery-expanded-sources">
    <div className="panel-head"><h2>扩展来源 · 待核验线索</h2><span>公开来源 → 官网核验 → 客户候选 → CRM</span></div>
    <p className="discovery-source-intro">使用上方的州、客户类型及城市条件。社交和企业目录读取搜索引擎可见索引；NCES 读取官方学校及学区名录；OSM 读取地图机构资料。每条线索保留来源，尚未确认当前业务和采购需求。</p>
    <fieldset className="discovery-source-choices"><legend>选择扩展渠道</legend>{Object.entries(labels).map(([key,label])=><label key={key}><input type="checkbox" checked={selected.includes(key)&&enabled(key)} disabled={!enabled(key)||searching} onChange={e=>setSelected(s=>e.target.checked?[...new Set([...s,key])]:s.filter(x=>x!==key))}/><span>{label}<small>{key==='NCES'?'公立小学、初高中和学区':key==='OSM'?'需填写城市；保留地图原始页面':key==='SOCIAL'?'Facebook / Instagram / LinkedIn 公司页':'商会、行业目录及政府 / 教育公示'}</small></span></label>)}</fieldset>
    <div className="discovery-source-toolbar"><button type="button" className="button secondary small" disabled={searching||!active.length||Boolean(busy)} onClick={()=>void search()}><Search size={14}/>{searching?'正在搜索扩展来源…':'搜索扩展来源'}</button><span>本批每个渠道最多 50 条；重复搜索轮换关键词或名录页。</span></div>
    {!!Object.keys(results).length&&<div className="discovery-source-status" aria-live="polite">{Object.entries(results).map(([key,result])=><span key={key} className={result.ok&&!result.partial?'source-ok':'source-failed'}>{labels[key]}：{result.ok?`${result.partial?'部分完成':'已完成'} · 新增 ${result.added} 条 / 保存或更新 ${result.found} 条`:'暂未完成'} · {result.error||result.note}</span>)}</div>}
    {message&&<div className="form-status success" role="status"><p>{message}</p></div>}{error&&<div className="form-status error" role="alert"><p>{error}</p></div>}
    <div className="discovery-clue-tools"><strong>线索 · {pagination.total} 条</strong><div><select aria-label="按公开线索状态筛选" value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}><option value="PENDING">待核验</option><option value="CONVERTED">已转入候选库</option><option value="IGNORED">已忽略</option><option value="ALL">全部线索</option></select><button type="button" className="button secondary small" disabled={loading||!rows.length} onClick={exportRows}><Download size={14}/>导出本页线索</button></div></div>
    {loading?<p className="discovery-source-intro">正在读取线索…</p>:!rows.length?<p className="discovery-source-intro">暂无此状态的线索。选择渠道后开始扩展搜索。</p>:<div className="discovery-clue-list">{rows.map(row=><article key={row.id} className="discovery-clue-row"><div><strong>{row.title}</strong><p>{labels[row.source_provider]||row.source_provider} · {row.city||'未指定城市'}, {row.state_region} · {states[row.status]}</p><a href={row.source_url} target="_blank" rel="noreferrer">查看原始来源 <ExternalLink size={12}/></a><a href={'https://www.bing.com/search?q='+encodeURIComponent(`${row.title} ${row.city||''} ${row.state_region} official website`)} target="_blank" rel="noreferrer">查找机构官网 <ExternalLink size={12}/></a><small>{row.source_evidence}</small></div><div className="discovery-clue-actions">{row.status==='PENDING'?<><form onSubmit={event=>verify(event,row)}><label htmlFor={'clue-website-'+row.id}>机构官网</label><input id={'clue-website-'+row.id} name="website" type="url" defaultValue={row.website||''} placeholder="https://机构官网" required maxLength={1000}/><button className="table-action primary" disabled={Boolean(busy)||searching}>{busy===row.id?'正在核验…':'核验并转入候选库'}</button></form><button className="table-action" disabled={Boolean(busy)||searching} onClick={()=>void action(row,'IGNORE')}>忽略线索</button></>:row.status==='IGNORED'?<button className="table-action" disabled={Boolean(busy)||searching} onClick={()=>void action(row,'RESTORE')}>恢复线索</button>:<span>已关联客户候选；可在下方管理。</span>}</div></article>)}</div>}
    <div className="discovery-pagination"><span>第 {page} / {Math.max(1,pagination.totalPages)} 页 · 每页 20 条</span><div><button className="button secondary small" disabled={page<=1||loading} onClick={()=>setPage(n=>n-1)}>上一页线索</button><button className="button secondary small" disabled={page>=pagination.totalPages||loading} onClick={()=>setPage(n=>n+1)}>下一页线索</button></div></div>
    <p className="discovery-source-intro">社交来源仅覆盖公开可检索页面；学校公示数据保留学年，公示城市需核实。机构线索不会自动发送消息，也不计入已核验客户数量。地图数据 © OpenStreetMap contributors，ODbL。</p>
  </section>;
}
