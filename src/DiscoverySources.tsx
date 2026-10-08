import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ExternalLink, Search, Download } from 'lucide-react';
import { csvCell, TYPE_OPTIONS, STATE_NAMES } from '../shared/discovery';
type Clue={id:string;title:string;source_provider:string;source_url:string;source_evidence:string;customer_type:string;state_region:string;city:string;website?:string;status:string};
type SourceResult={ok:boolean;found:number;added:number;updated?:number;retained?:number;partial?:boolean;note?:string;error?:string;running?:boolean;queued?:boolean};
type WebsiteProfile={source:string;url:string;pageUrl:string;status:string;existing:boolean};
type ApiResult={ok?:boolean;error?:string;clues?:Clue[];pagination?:{total:number;totalPages:number};sources?:Record<string,SourceResult>;nextRound?:number;added?:number;updated?:number;name?:string;existing?:boolean|number;clueStatus?:string;found?:number;note?:string;profiles?:WebsiteProfile[]};
type Props={accessKey:string;stateCode:string;customerType:string;city:string;targetCount:number;externalBusy:boolean;onBusyChange:(value:boolean)=>void;onChanged:()=>void};
const channels:Record<string,{label:string;note:string}>={FACEBOOK:{label:'Facebook · FB',note:'公开商家主页、训练机构及教练业务账号'},TIKTOK:{label:'TikTok · TK',note:'公开教练、训练机构和体育商家账号'},INSTAGRAM:{label:'Instagram',note:'公开业务账号'},LINKEDIN:{label:'LinkedIn',note:'公司页；个人档案不作为企业来源'},DIRECTORY:{label:'企业 / 行业及公示目录',note:'商会、Yellow Pages、BBB、Manta、政府及教育公示'},NCES:{label:'NCES 公立学校 / 学区',note:'独立可选；学区类型查询学区，其余查询公立学校，保留学年'},NCES_PRIVATE:{label:'NCES 私立学校名录',note:'官方私立学校资料，保留 2023–24 学年'},NCES_DISTRICTS:{label:'NCES 学区名录',note:'独立检索学区办公室及采购群体'},OSM:{label:'OpenStreetMap 地图',note:'城市可留空；按所选州重点城市轮换'},GEOAPIFY:{label:'Geoapify 地图机构',note:'按城市及机构类别检索，逐页扩展'},WEBSITE_SOCIAL:{label:'官网社交账号批量发现',note:'读取已核验候选官网；每批 5 家机构，无需逐条输入'}};
const labels:Record<string,string>={SOCIAL:'公开社交账号（历史来源）',...Object.fromEntries(Object.entries(channels).map(([key,value])=>[key,value.label]))};
const socialChannels=['FACEBOOK','TIKTOK','INSTAGRAM','LINKEDIN'];
function readRounds():Record<string,number>{try{const value=JSON.parse(localStorage.getItem('mingeagle-discovery-rounds-v15')||'{}');if(!value||typeof value!=='object'||Array.isArray(value))return {};return Object.fromEntries(Object.entries(value).filter(([key,n])=>key.length<300&&Number.isInteger(n)&&Number(n)>=0&&Number(n)<=10000).slice(-1000)) as Record<string,number>;}catch{return {};}}
const states:Record<string,string>={PENDING:'待核验',CONVERTED:'已转入候选库',IGNORED:'已忽略'};
export default function DiscoverySources({accessKey,stateCode,customerType,city,targetCount,externalBusy,onBusyChange,onChanged}:Props){
  const [selected,setSelected]=useState(['FACEBOOK','TIKTOK']);
  const [rows,setRows]=useState<Clue[]>([]),[status,setStatus]=useState('PENDING'),[sourceFilter,setSourceFilter]=useState('ALL'),[page,setPage]=useState(1),[pagination,setPagination]=useState({total:0,totalPages:0}),[reload,setReload]=useState(0);
  const [socialSaving,setSocialSaving]=useState(false);
  const [websiteDiscovering,setWebsiteDiscovering]=useState(false),[websiteProfiles,setWebsiteProfiles]=useState<WebsiteProfile[]>([]);
  const [loadError,setLoadError]=useState(''),[loading,setLoading]=useState(false),[searching,setSearching]=useState(false),[busy,setBusy]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [results,setResults]=useState<Record<string,SourceResult>>({}),[batchCount,setBatchCount]=useState(1),[progress,setProgress]=useState('');
  const [regionFilter,setRegionFilter]=useState('ALL'),[typeFilter,setTypeFilter]=useState('ALL'),[keyword,setKeyword]=useState(''),[query,setQuery]=useState('');
  const rounds=useRef<Record<string,number>>(readRounds()),stop=useRef(false),operating=useRef(false);
  const active=selected,busyAny=searching||socialSaving||websiteDiscovering||Boolean(busy)||externalBusy;
  const failed=Object.entries(results).filter(([,r])=>(!r.ok||r.partial)&&!r.running&&!r.queued).map(([s])=>s);
  function begin(){if(operating.current||externalBusy)return false;operating.current=true;onBusyChange(true);return true;}
  function finish(){operating.current=false;onBusyChange(false);}
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setLoadError('');
    void (async()=>{try{
      const params=new URLSearchParams({status,source:sourceFilter,page:String(page)});if(regionFilter==='CURRENT'){params.set('state',stateCode);if(city.trim())params.set('city',city.trim());}if(typeFilter==='CURRENT')params.set('type',customerType);if(query)params.set('q',query);
      const response=await fetch(`/api/admin/discovery-sources-v1?${params}`,{headers:{'x-admin-key':accessKey},signal:controller.signal});
      const data=await response.json() as ApiResult;if(!response.ok||!data.ok)throw new Error(data.error||'线索加载失败。');
      if(!controller.signal.aborted){setRows(data.clues||[]);setPagination(data.pagination||{total:0,totalPages:0});if(page>Math.max(1,data.pagination?.totalPages||0))setPage(Math.max(1,data.pagination?.totalPages||0));}
    }catch(e){if(!controller.signal.aborted)setLoadError(e instanceof Error?e.message:'线索加载失败。');}finally{if(!controller.signal.aborted)setLoading(false);}})();
    return()=>controller.abort();
  },[accessKey,status,sourceFilter,page,reload,regionFilter,typeFilter,query,stateCode,customerType,city]);
  async function request(body:Record<string,unknown>){
    const response=await fetch('/api/admin/discovery-sources-v1',{method:'POST',headers:{'content-type':'application/json','x-admin-key':accessKey},body:JSON.stringify(body),signal:AbortSignal.timeout(45000)});
    const data=await response.json() as ApiResult;if(!response.ok||!data.ok)throw new Error(Object.values(data.sources||{}).map(r=>r.error).filter(Boolean).join(' · ')||data.error||'线索操作失败。');return data;
  }
  async function search(keys=active,retry=false){
    if(!keys.length||!begin())return;stop.current=false;setSearching(true);setError('');setMessage('');setProgress('正在安排所选来源…');
    const initial=Object.fromEntries(keys.map(s=>[s,{ok:false,found:0,added:0,queued:true} as SourceResult]));setResults(previous=>retry?{...previous,...initial}:initial);
    const count=retry?1:batchCount,scope=[stateCode,customerType,city.trim().toLowerCase(),targetCount].join('|');let added=0,updated=0,completed=0,failures=0;
    try{
      for(let batch=0;batch<count&&!stop.current;batch++){
        for(let start=0;start<keys.length&&!stop.current;start+=3){
          await Promise.all(keys.slice(start,start+3).map(async source=>{
            const cursor=scope+'|'+source,round=rounds.current[cursor]||0;
            setResults(previous=>({...previous,[source]:{ok:false,found:0,added:0,running:true,note:`第 ${round+1} 批`}}));
            try{const data=await request({action:'SEARCH',stateCode,customerType,city,targetCount,round,sources:[source]});const result=data.sources?.[source]||{ok:true,found:0,added:0};if(!result.partial)rounds.current[cursor]=Math.min(10000,data.nextRound??round+1);try{localStorage.setItem('mingeagle-discovery-rounds-v15',JSON.stringify(rounds.current));}catch{}added+=data.added||0;updated+=data.updated||0;setResults(previous=>({...previous,[source]:result}));}
            catch(e){failures++;setResults(previous=>({...previous,[source]:{ok:false,found:0,added:0,error:e instanceof Error?e.message:'该来源搜索失败。'}}));}
            finally{completed++;setProgress(`已完成 ${completed} / ${keys.length*count} 项来源检索`);setReload(n=>n+1);}
          }));
        }
      }
      setResults(previous=>Object.fromEntries(Object.entries(previous).map(([key,value])=>[key,value.queued?{...value,queued:false,error:'尚未执行；可继续搜索。'}:value])));
      setMessage(`${stop.current?'已停止后续排队任务':'扩展检索完成'}：新增 ${added} 条，更新 ${updated} 条${failures?`，${failures} 项来源请求未完成，可单独重试`:''}。已忽略和已转入候选库的线索保留原状态。`);onChanged();
    }finally{setSearching(false);finish();}
  }
  async function action(row:Clue,action:string,website?:string){
    if(!begin())return;setBusy(row.id);setError('');setMessage('');try{const data=await request({action,clueId:row.id,website});setMessage(action==='VERIFY'?`${data.name||row.title} 已通过官网核验${data.existing?'并关联已有候选':'并转入候选库'}。`:action==='IGNORE'?'该线索已忽略，可恢复。':'该线索已恢复。');setReload(n=>n+1);onChanged();}
    catch(e){setError(e instanceof Error?e.message:'操作失败。');}finally{setBusy('');finish();}
  }
  function verify(event:FormEvent<HTMLFormElement>,row:Clue){event.preventDefault();void action(row,'VERIFY',String(new FormData(event.currentTarget).get('website')||''));}
  async function addSocial(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!begin())return;const form=event.currentTarget,values=new FormData(form);setSocialSaving(true);setError('');setMessage('');
    try{const data=await request({action:'ADD_SOCIAL',stateCode,customerType,city,source:values.get('source'),title:values.get('title'),sourceUrl:values.get('sourceUrl'),evidence:values.get('evidence'),website:values.get('website')});
      setMessage(data.existing?`该账号已有${states[data.clueStatus||'PENDING']}线索，保留原记录。`:`${data.name} 已保存为待核验社交线索，请继续核验机构官网。`);
      if(!data.existing){setSourceFilter(String(values.get('source')));setStatus('PENDING');setPage(1);form.reset();}setReload(n=>n+1);
    }catch(e){setError(e instanceof Error?e.message:'公开账号保存失败。');}finally{setSocialSaving(false);finish();}
  }
  async function discoverWebsite(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!begin())return;const website=String(new FormData(event.currentTarget).get('website')||'');
    setWebsiteDiscovering(true);setWebsiteProfiles([]);setError('');setMessage('');
    try{
      const data=await request({action:'DISCOVER_SOCIAL',stateCode,customerType,city,website});
      setWebsiteProfiles(data.profiles||[]);
      setMessage(`${data.name}：官网发现 ${data.found||0} 个账号主页，新增 ${data.added||0} 条线索，保留已有 ${Number(data.existing)||0} 条。${data.note||''}`);
      if(data.added){setSourceFilter('ALL');setStatus('PENDING');setPage(1);}setReload(n=>n+1);
    }catch(e){setError(e instanceof Error?e.message:'官网社交账号发现失败。');}finally{setWebsiteDiscovering(false);finish();}
  }
  function exportRows(){
    const values=[['线索名称','来源','类型','州','公示城市 / 搜索城市','原始页面','官网','核验状态','证据'],...rows.map(r=>[r.title,labels[r.source_provider]||r.source_provider,r.customer_type,r.state_region,r.city,r.source_url,r.website||'',states[r.status]||r.status,r.source_evidence])];
    const url=URL.createObjectURL(new Blob(['\uFEFF'+values.map(r=>r.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8;'}));const link=document.createElement('a');link.href=url;link.download='mingeagle-public-source-clues.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <section className="panel discovery-expanded-sources">
    <div className="panel-head"><h2>扩展来源 · 待核验线索</h2><span>公开来源 → 官网核验 → 客户候选 → CRM</span></div>
    <p className="discovery-source-intro">使用上方的州、客户类型及城市条件。Facebook、TikTok 等渠道搜索公开可检索账号；也可从机构官网自动发现公开社交链接，或手动补录。学校和地图资料同样保留来源，核验后再进入客户候选库。</p>
    <fieldset className="discovery-source-choices"><legend>选择扩展渠道</legend>{Object.entries(channels).map(([key,channel])=><label key={key}><input type="checkbox" checked={selected.includes(key)} disabled={busyAny} onChange={e=>setSelected(s=>e.target.checked?[...new Set([...s,key])]:s.filter(x=>x!==key))}/><span>{channel.label}<small>{channel.note}</small></span></label>)}</fieldset>
    <div className="discovery-source-toolbar"><button type="button" className="button secondary small" disabled={busyAny||!active.length} onClick={()=>void search()}><Search size={14}/>{searching?'正在搜索扩展来源…':'搜索扩展来源'}</button><label>连续批数 <select aria-label="扩展搜索连续批数" value={batchCount} disabled={busyAny} onChange={e=>setBatchCount(Number(e.target.value))}><option value="1">1 批</option><option value="2">2 批</option><option value="3">3 批</option></select></label><button type="button" className="button secondary small" disabled={busyAny} onClick={()=>setSelected(Object.keys(channels))}>全选来源</button><button type="button" className="button secondary small" disabled={busyAny} onClick={()=>setSelected([])}>清空选择</button>{failed.length>0&&<button type="button" className="button secondary small" disabled={busyAny} onClick={()=>void search(failed,true)}>仅重试未完成来源</button>}{searching&&<button type="button" className="button secondary small" onClick={()=>{stop.current=true;setProgress('正在结束当前检索，之后停止排队任务…');}}>停止后续批次</button>}<span>每来源每批最多 {Math.min(50,targetCount)} 条；3 个来源并行，成功后独立推进批次。学校名录按州检索，地图和公开索引轮换重点城市。</span></div>
    {progress&&<p className="discovery-source-intro" role="status">{progress}</p>}
    {!!Object.keys(results).length&&<div className="discovery-source-status" aria-live="polite">{Object.entries(results).map(([key,result])=><span key={key} className={result.running||result.queued?'source-running':result.ok&&!result.partial?'source-ok':'source-failed'}>{labels[key]}：{result.running?'正在检索…':result.queued?'等待检索':result.ok?`${result.partial?'部分完成':'已完成'} · 找到 ${result.found} / 新增 ${result.added} / 更新 ${result.updated||0} / 保留原状态 ${result.retained||0}`:'暂未完成'}{(result.error||result.note)&&' · '}{result.error||result.note}</span>)}</div>}
    {message&&<div className="form-status success" role="status"><p>{message}</p></div>}{(error||loadError)&&<div className="form-status error" role="alert"><p>{error||loadError}</p></div>}
    <details className="discovery-social-entry discovery-website-social"><summary>从机构官网发现社交账号</summary><p>先核验官网中的机构名称、业务和地区，再提取 Facebook、TikTok、Instagram、LinkedIn 公司主页。账号和出处保存为待核验线索；重复账号保留原状态。</p><form onSubmit={event=>void discoverWebsite(event)}>
      <label className="social-entry-wide">公开机构官网<input name="website" type="url" required maxLength={1000} placeholder="https://机构官网" disabled={websiteDiscovering}/></label>
      <div className="social-entry-wide"><button className="button secondary small" disabled={busyAny||!city.trim()}><Search size={14}/>{websiteDiscovering?'正在核验官网及读取账号…':'发现官网社交账号'}</button><span>{city.trim()?`${city}, ${stateCode} · 沿用上方客户类型`:'请先在上方填写英文城市'}</span></div>
    </form>{websiteProfiles.length>0&&<ul className="discovery-website-social-results" aria-label="官网发现的社交账号">{websiteProfiles.map(profile=><li key={profile.url}><strong>{labels[profile.source]}</strong><a href={profile.url} target="_blank" rel="noreferrer">{profile.url}<ExternalLink size={12}/></a><span>{profile.existing?'保留已有':'新增'} · {states[profile.status]||profile.status}</span><a href={profile.pageUrl} target="_blank" rel="noreferrer">查看官网出处<ExternalLink size={12}/></a></li>)}</ul>}</details>
    <details className="discovery-social-entry"><summary>补录公开社交账号</summary><p>从公开主页确认业务名称、服务城市和业务描述后录入。平台请选择对应账号来源；地区和客户类型沿用上方条件。</p><form onSubmit={event=>void addSocial(event)}>
      <label>社交平台<select name="source" defaultValue="TIKTOK">{socialChannels.map(key=><option key={key} value={key}>{labels[key]}</option>)}</select></label>
      <label>机构 / 教练业务名称<input name="title" required minLength={3} maxLength={200} placeholder="公开主页显示的业务名称"/></label>
      <label className="social-entry-wide">公开账号主页<input name="sourceUrl" type="url" required maxLength={1000} placeholder="https://www.tiktok.com/@账号名 或 Facebook 主页"/></label>
      <label className="social-entry-wide">公开业务描述及地区依据<textarea name="evidence" required minLength={20} maxLength={1000} rows={3} placeholder="填写公开主页中的训练业务、服务城市等依据；至少 20 个字符"/></label>
      <label className="social-entry-wide">机构官网（可选）<input name="website" type="url" maxLength={1000} placeholder="https://机构官网"/></label>
      <div className="social-entry-wide"><button className="button secondary small" disabled={busyAny||!city.trim()}>{socialSaving?'正在保存…':'保存为待核验线索'}</button><span>{city.trim()?`${city}, ${stateCode} · 仅保存线索，需官网核验`:'请先在上方填写英文城市'}</span></div>
    </form></details>
    <div className="discovery-clue-tools"><strong>线索 · {pagination.total} 条</strong><div><select aria-label="按公开线索地区筛选" value={regionFilter} onChange={e=>{setRegionFilter(e.target.value);setPage(1);}}><option value="ALL">全部地区</option><option value="CURRENT">{city.trim()||STATE_NAMES[stateCode]} · 当前地区</option></select><select aria-label="按公开线索客户类型筛选" value={typeFilter} onChange={e=>{setTypeFilter(e.target.value);setPage(1);}}><option value="ALL">全部客户类型</option><option value="CURRENT">当前客户类型</option></select><form onSubmit={e=>{e.preventDefault();setQuery(keyword.trim());setPage(1);}}><input aria-label="搜索公开线索" value={keyword} maxLength={160} placeholder="名称、官网或证据关键词" onChange={e=>setKeyword(e.target.value)}/><button type="submit" className="button secondary small" disabled={loading}>筛选</button>{query&&<button type="button" className="button secondary small" onClick={()=>{setKeyword('');setQuery('');setPage(1);}}>重置关键词</button>}</form><select aria-label="按公开线索来源筛选" value={sourceFilter} onChange={e=>{setSourceFilter(e.target.value);setPage(1);}}><option value="ALL">全部来源</option>{Object.entries(labels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select><select aria-label="按公开线索状态筛选" value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}><option value="PENDING">待核验</option><option value="CONVERTED">已转入候选库</option><option value="IGNORED">已忽略</option><option value="ALL">全部线索</option></select><button type="button" className="button secondary small" disabled={loading||!rows.length} onClick={exportRows}><Download size={14}/>导出本页线索</button></div></div>
    {loading?<p className="discovery-source-intro">正在读取线索…</p>:!rows.length?<p className="discovery-source-intro">暂无此状态的线索。选择渠道后开始扩展搜索。</p>:<div className="discovery-clue-list">{rows.map(row=><article key={row.id} className="discovery-clue-row"><div><strong>{row.title}</strong><p>{labels[row.source_provider]||row.source_provider} · {row.city||'未指定城市'}, {row.state_region} · {TYPE_OPTIONS.find(([type])=>type===row.customer_type)?.[1]||row.customer_type} · {states[row.status]}</p><a href={row.source_url} target="_blank" rel="noreferrer">查看原始来源 <ExternalLink size={12}/></a><a href={'https://www.bing.com/search?q='+encodeURIComponent(`${row.title} ${row.city||''} ${row.state_region} official website`)} target="_blank" rel="noreferrer">查找机构官网 <ExternalLink size={12}/></a><small>{row.source_evidence}</small></div><div className="discovery-clue-actions">{row.status==='PENDING'?<><form onSubmit={event=>verify(event,row)}><label htmlFor={'clue-website-'+row.id}>机构官网</label><input id={'clue-website-'+row.id} name="website" type="url" defaultValue={row.website||''} placeholder="https://机构官网" required maxLength={1000}/><button className="table-action primary" disabled={busyAny}>{busy===row.id?'正在核验…':'核验并转入候选库'}</button></form><button className="table-action" disabled={busyAny} onClick={()=>void action(row,'IGNORE')}>忽略线索</button></>:row.status==='IGNORED'?<button className="table-action" disabled={busyAny} onClick={()=>void action(row,'RESTORE')}>恢复线索</button>:<span>已关联客户候选；可在客户候选库中管理。</span>}</div></article>)}</div>}
    <div className="discovery-pagination"><span>第 {page} / {Math.max(1,pagination.totalPages)} 页 · 每页 20 条</span><div><button className="button secondary small" disabled={page<=1||loading} onClick={()=>setPage(n=>n-1)}>上一页线索</button><button className="button secondary small" disabled={page>=pagination.totalPages||loading} onClick={()=>setPage(n=>n+1)}>下一页线索</button></div></div>
    <p className="discovery-source-intro">社交来源仅覆盖公开可检索业务账号；搜索结果为零时可补录公开主页，不代表当地没有客户。账号归属、当前业务和联系信息需核验。学校公示数据保留学年，公示城市需核实。NCES 公立学校 2024–25 学年、私立学校 2023–24 学年，目录不等于当前采购意向。地图与索引未填城市时轮换重点城市，未覆盖全州所有地点。机构线索不会自动发送消息，也不计入已核验客户数量。地图数据 © OpenStreetMap contributors，ODbL。</p>
  </section>;
}
