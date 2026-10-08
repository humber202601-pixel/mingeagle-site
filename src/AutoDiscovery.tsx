import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Link} from 'react-router-dom';
import {Search,LoaderCircle,Pause,Play,RefreshCcw,ExternalLink,ArrowRight,Trash2} from 'lucide-react';
import {TYPE_OPTIONS,STATE_NAMES} from '../shared/discovery';
type Row=Record<string,unknown>;
type Run={id:string;status:string;phase:string;message:string;scope:{stateCode:string;customerType:string;city:string;targetCount:number;batches:number}};
type Data={ok?:boolean;error?:string;run?:Run|null;counts?:Array<{kind:string;status:string;count:number}>;results?:Row[];exceptions?:Row[];sources?:Row[]};
type History={counts?:Record<string,number>;protectedLeads?:number;archives?:Array<{id:string;status:string;created_at:string;counts_json:string}>};
type Props={accessKey:string;externalBusy:boolean;onBusyChange:(busy:boolean)=>void;onChanged:()=>void;onCleared:()=>void};
const text=(v:unknown,fallback='—')=>v===null||v===undefined||v===''?fallback:String(v);
const sourceNames:Record<string,string>={CORE:'官网搜索与业务核验',DIRECTORY:'企业 / 公示目录',FACEBOOK:'Facebook',TIKTOK:'TikTok',INSTAGRAM:'Instagram',LINKEDIN:'LinkedIn',GEOAPIFY:'Geoapify 地图',OSM:'OpenStreetMap 地图',NCES:'公立学校名录',NCES_PRIVATE:'私立学校名录',NCES_DISTRICTS:'学区名录'};
const statusNames:Record<string,string>={RUNNING:'处理中',PAUSED:'已暂停',COMPLETED:'已完成',PARTIAL:'已完成，部分信息待核验',DONE:'已完成',PENDING:'等待处理',FAILED:'暂未完成',SKIPPED:'保留既有状态'};
const phaseNames:Record<string,string>={SEARCH:'搜索来源',SOURCE:'搜索来源',CLUE:'查找官网并核验',CANDIDATE:'补全并入库',DONE:'处理完成'};

export default function AutoDiscovery({accessKey,externalBusy,onBusyChange,onChanged,onCleared}:Props){
  const [state,setState]=useState('TX'),[type,setType]=useState('BASKETBALL_TRAINING'),[city,setCity]=useState(''),[target,setTarget]=useState(20),[batches,setBatches]=useState(1);
  const [data,setData]=useState<Data>({}),[loading,setLoading]=useState(true),[working,setWorking]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [history,setHistory]=useState<History>({}),[historyOpen,setHistoryOpen]=useState(false),[historyBusy,setHistoryBusy]=useState(false);
  const onChangedRef=useRef(onChanged);onChangedRef.current=onChanged;
  const busy=working||historyBusy||data.run?.status==='RUNNING';
  useEffect(()=>{onBusyChange(Boolean(busy));return()=>onBusyChange(false);},[busy,onBusyChange]);
  async function api(body?:Row,signal?:AbortSignal):Promise<Data>{
    const r=await fetch('/api/admin/discovery-auto-v1',{method:body?'POST':'GET',headers:{'content-type':'application/json','x-admin-key':accessKey},...(body?{body:JSON.stringify(body)}:{}),signal});
    const result=await r.json() as Data;if(!r.ok||!result.ok)throw new Error(result.error||'任务读取失败。');return result;
  }
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);
    void api(undefined,controller.signal).then(result=>{if(!controller.signal.aborted)setData(result);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[accessKey]);
  useEffect(()=>{
    if(data.run?.status!=='RUNNING')return;
    let disposed=false,timer:ReturnType<typeof setTimeout>;
    const runId=data.run.id;
    const next=async()=>{
      try{
        const result=await api({action:'ADVANCE',runId});
        if(disposed)return;
        setData(result);setError('');
        if(result.run?.status==='RUNNING')timer=setTimeout(()=>void next(),1200);
        else onChangedRef.current();
      }catch(e){if(!disposed){setError(e instanceof Error?e.message:'当前连接中断，系统会自动重试。');timer=setTimeout(()=>void next(),10000);}}
    };
    timer=setTimeout(()=>void next(),200);
    return()=>{disposed=true;clearTimeout(timer);};
  },[accessKey,data.run?.id,data.run?.status]);
  useEffect(()=>{const scope=data.run?.scope;if(!scope)return;setState(scope.stateCode);setType(scope.customerType);setCity(scope.city);setTarget(scope.targetCount);setBatches(scope.batches);},[data.run?.id]);
  async function start(event:FormEvent){
    event.preventDefault();if(busy||externalBusy)return;setWorking(true);setError('');setMessage('');
    try{setData(await api({action:'START',stateCode:state,customerType:type,city,targetCount:target,batches}));}catch(e){setError(e instanceof Error?e.message:'任务启动失败。');}finally{setWorking(false);}
  }
  async function action(actionName:string){
    if(!data.run)return;setWorking(true);setError('');
    try{setData(await api({action:actionName,runId:data.run.id}));onChangedRef.current();}catch(e){setError(e instanceof Error?e.message:'任务操作失败。');}finally{setWorking(false);}
  }
  async function loadHistory(){
    const r=await fetch('/api/admin/discovery-history-v1',{headers:{'x-admin-key':accessKey}});const h=await r.json() as History&{ok?:boolean;error?:string};if(!r.ok||!h.ok)throw new Error(h.error||'历史记录读取失败。');setHistory(h);
  }
  async function historyAction(body:Row){
    setHistoryBusy(true);setError('');setMessage('');
    try{
      const r=await fetch('/api/admin/discovery-history-v1',{method:'POST',headers:{'content-type':'application/json','x-admin-key':accessKey},body:JSON.stringify(body)});const h=await r.json() as {ok?:boolean;error?:string;counts?:Record<string,number>;protectedLeads?:number};
      if(!r.ok||!h.ok)throw new Error(h.error||'历史记录操作失败。');
      if(body.action==='CLEAR'){
        localStorage.removeItem('mingeagle-discovery-rounds-v15');setData({run:null});onCleared();
        setMessage(`历史搜索与开发记录已从工作列表清空，可在下方历史批次中恢复。${h.protectedLeads?`保留 ${h.protectedLeads} 个已关联询盘、报价或订单的业务档案。`:''}`);
      }else{setData(await api());onCleared();setMessage('历史批次已恢复。');}
      await loadHistory();onChangedRef.current();
    }catch(e){setError(e instanceof Error?e.message:'历史记录操作失败。');}finally{setHistoryBusy(false);}
  }
  const count=(kind:string,status?:string)=>(data.counts||[]).filter(c=>c.kind===kind&&(!status||c.status===status)).reduce((n,c)=>n+Number(c.count),0);
  const imported=count('CANDIDATE','DONE');
  const importedRows=(data.results||[]).filter(row=>row.status==='DONE'&&row.crm_lead_id);
  const run=data.run,frozen=busy||run?.status==='PAUSED';
  return <section className="panel auto-discovery-panel">
    <div className="auto-discovery-title"><div><span className="auto-discovery-kicker">客户开发 · 一键完成</span><h2>选定范围，自动整理成待开发客户</h2><p>搜索推荐渠道、查找官网、核验机构、补全公开信息并去重入库，全程自动衔接。</p></div><span className="auto-discovery-badge">搜索 → 核验 → 补全 → 入库</span></div>
    <form className="auto-discovery-form" onSubmit={start}>
      <label>国家<input value="United States" readOnly/></label>
      <label>州<select aria-label="一键发现州" value={state} disabled={frozen||externalBusy} onChange={e=>setState(e.target.value)}>{Object.entries(STATE_NAMES).map(([code,name])=><option value={code} key={code}>{name} ({code})</option>)}</select></label>
      <label>客户类型<select aria-label="一键发现客户类型" value={type} disabled={frozen||externalBusy} onChange={e=>setType(e.target.value)}>{TYPE_OPTIONS.map(([code,label])=><option key={code} value={code}>{label}</option>)}</select></label>
      <label>城市（可选）<input aria-label="一键发现城市" value={city} disabled={frozen||externalBusy} onChange={e=>setCity(e.target.value)} placeholder="例如 Dallas；留空轮换重点城市" maxLength={80}/></label>
      <label>每批目标数量<select aria-label="一键发现数量" value={target} disabled={frozen||externalBusy} onChange={e=>setTarget(Number(e.target.value))}><option value={20}>20</option><option value={50}>50</option><option value={100}>100</option></select></label>
      <label>搜索深度<select aria-label="一键发现批数" value={batches} disabled={frozen||externalBusy} onChange={e=>setBatches(Number(e.target.value))}><option value={1}>标准 · 1 批</option><option value={2}>扩大 · 2 批</option><option value={3}>深入 · 3 批</option></select></label>
      <button className="button auto-discovery-start" disabled={frozen||externalBusy||loading}>{busy?<><LoaderCircle size={18} className="spin"/>正在自动处理</>:<><Search size={18}/>一键发现并加入待开发客户<ArrowRight size={18}/></>}</button>
    </form>
    <p className="auto-discovery-help">自动选择地图、公开官网、企业目录及社交索引；学校类型自动加入相应官方名录。仅补全有公开出处的信息，未公开字段会明确标记。任务进度保存在后台，离开页面后由后台定期续跑。</p>
    {loading&&<p role="status">正在读取任务进度…</p>}
    {run&&<div className="auto-discovery-progress" aria-live="polite">
      <div className="auto-discovery-run-head"><div><strong>{statusNames[run.status]||run.status} · {phaseNames[run.phase]||run.phase}</strong><p>{STATE_NAMES[run.scope.stateCode]}{run.scope.city?' / '+run.scope.city:''} · {TYPE_OPTIONS.find(([key])=>key===run.scope.customerType)?.[1]} · {run.message}</p></div><div className="secure-link-actions">{run.status==='RUNNING'?<button type="button" className="button secondary small" disabled={working} onClick={()=>void action('PAUSE')}><Pause size={14}/>暂停</button>:run.status==='PAUSED'?<button type="button" className="button small" disabled={working} onClick={()=>void action('RESUME')}><Play size={14}/>继续自动处理</button>:null}{run.status==='PARTIAL'&&<button type="button" className="button secondary small" disabled={working} onClick={()=>void action('RETRY')}><RefreshCcw size={14}/>重试未完成项目</button>}</div></div>
      <div className="auto-discovery-stats"><div><strong>{count('SOURCE','DONE')} / {count('SOURCE')}</strong><span>完成来源批次</span></div><div><strong>{count('CLUE')}</strong><span>去重后来源线索</span></div><div><strong>{count('CANDIDATE')}</strong><span>候选机构</span></div><div><strong>{imported}</strong><span>已加入待开发客户</span></div></div>
      {!!importedRows.length&&<div className="table-wrap"><table><thead><tr><th>机构 / 地区</th><th>公开联系方式</th><th>负责人 / 社交账号</th><th>结果</th></tr></thead><tbody>{importedRows.map(row=><tr key={text(row.item_key)}><td><strong>{text(row.name)}</strong><small>{text(row.city,'')} {text(row.state_region,'')} · {text(row.grade)} {text(row.lead_score,'0')}/100</small>{Boolean(row.address)&&<small>{text(row.address)}</small>}{Boolean(row.website)&&<a href={text(row.website)} target="_blank" rel="noreferrer">官网 <ExternalLink size={12}/></a>}</td><td><div>{text(row.email,'邮箱未公开')}</div><div>{text(row.phone,'电话未公开')}</div><small>{row.whatsapp?'WhatsApp: '+text(row.whatsapp):'WhatsApp 未公开'}</small></td><td><strong>{text(row.contact_person_name,'负责人未公开')}</strong><small>{text(row.contact_person_title,'')}</small><div className="discovery-socials">{[['Instagram','instagram_url'],['Facebook','facebook_url'],['TikTok','tiktok_url'],['LinkedIn','linkedin_url']].map(([label,key])=>row[key]?<a key={key} href={text(row[key])} target="_blank" rel="noreferrer">{label}</a>:null)}</div></td><td>{row.status==='DONE'&&row.crm_lead_id?<><span className="auto-discovery-imported">已加入待开发客户</span><Link to={'/app/leads/'+text(row.crm_lead_id)}>查看客户档案</Link></>:<span>{statusNames[text(row.status)]||text(row.status)}</span>}{Boolean(row.error)&&<small>{text(row.error)}</small>}</td></tr>)}</tbody></table></div>}
      <details className="auto-discovery-details"><summary>查看来源进度与未完成信息（{data.exceptions?.length||0}）</summary><ul>{data.sources?.map(row=><li key={text(row.item_key)}><strong>{sourceNames[text(row.item_key).split(':')[0]]||text(row.item_key)}</strong> · {statusNames[text(row.status)]||text(row.status)}{row.error?' · '+text(row.error):''}</li>)}</ul>{data.exceptions?.map(row=><p key={text(row.kind)+text(row.item_key)}><strong>{text(row.name)}</strong> · {text(row.error)}</p>)}</details>
    </div>}
    {message&&<div className="form-status success" role="status">{message}</div>}
    {error&&<div className="form-status error" role="alert">{error}</div>}
    <details className="auto-discovery-history" open={historyOpen} onToggle={e=>{const open=e.currentTarget.open;setHistoryOpen(open);if(open)void loadHistory().catch(e=>setError(e.message));}}><summary>历史搜索与开发记录管理</summary><p>清空当前搜索任务、线索、候选及无业务关联的开发档案和跟进记录；已关联询盘、报价、订单或样品的业务档案保留。历史批次可从这里恢复。</p><div className="auto-history-counts"><span>搜索任务 {history.counts?.discovery_jobs||0}</span><span>线索 {history.counts?.discovery_clues||0}</span><span>候选 {history.counts?.discovery_candidates||0}</span><span>开发客户 {history.counts?.leads||0}</span></div><button type="button" className="button secondary small" disabled={busy||externalBusy} onClick={()=>void historyAction({action:'CLEAR'})}><Trash2 size={14}/>{historyBusy?'正在清理…':'清空历史搜索与开发记录（可恢复）'}</button><div className="auto-history-archives">{history.archives?.map(a=><div key={a.id}><span>{a.created_at} · {a.status==='RESTORED'?'已恢复':'可恢复历史批次'}</span>{a.status==='ARCHIVED'&&<button type="button" className="button secondary small" disabled={busy||externalBusy} onClick={()=>void historyAction({action:'RESTORE',archiveId:a.id})}>恢复此历史批次</button>}</div>)}</div></details>
  </section>;
}
