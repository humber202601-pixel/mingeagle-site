import {useEffect,useRef,useState,type FormEvent} from 'react';
import {discoveryRequest,startDiscoveryLoop,mergeDiscovery} from './discovery-runner';
import {diagnoseDiscovery} from './discovery-diagnostics';
import {discoveryStall} from './discovery-stall';
import {Link} from 'react-router-dom';
import {Search,LoaderCircle,Pause,Play,RefreshCcw,ExternalLink,ArrowRight,Trash2} from 'lucide-react';
import {TYPE_OPTIONS,STATE_NAMES} from '../shared/discovery';
type Row=Record<string,unknown>;
type Run={id:string;status:string;phase:string;message:string;revision?:number;updated_at?:string;created_at?:string;last_progress_at?:string|null;steps_completed?:number;scope:{stateCode:string;customerType:string;city:string;targetCount:number;batches:number}};
type Data={ok?:boolean;error?:string;run?:Run|null;counts?:Array<{kind:string;status:string;count:number;confirmed?:number}>;results?:Row[];exceptions?:Row[];sources?:Row[];workerBusy?:boolean;progress?:{total:number;processed:number;waiting?:number;processing?:number;unresolved?:number};current?:Array<{name:string;stage:string;startedAt:string}>};
type History={counts?:Record<string,number>;protectedLeads?:number;archives?:Array<{id:string;status:string;created_at:string;counts_json:string}>};
type Props={accessKey:string;externalBusy:boolean;onBusyChange:(busy:boolean)=>void;onChanged:()=>void;onCleared:()=>void;initialType?:string};
const text=(v:unknown,fallback='—')=>v===null||v===undefined||v===''?fallback:String(v);
const sourceNames:Record<string,string>={CORE:'官网搜索与业务核验',DIRECTORY:'企业 / 公示目录',FACEBOOK:'Facebook',TIKTOK:'TikTok',INSTAGRAM:'Instagram',LINKEDIN:'LinkedIn',GEOAPIFY:'Geoapify 地图',OSM:'OpenStreetMap 地图',NCES:'公立学校名录',NCES_PRIVATE:'私立学校名录',NCES_DISTRICTS:'学区名录'};
const statusNames:Record<string,string>={RUNNING:'处理中',PAUSED:'已暂停',COMPLETED:'已完成',PARTIAL:'已完成，部分信息待核验',DONE:'已完成',PENDING:'等待处理',FAILED:'暂未完成',REVIEW:'待核验',PROCESSING:'当前处理',SKIPPED:'保留既有状态'};
const sourceResult=(row:Row):Row=>{try{return JSON.parse(String(row.result_json||'{}')) as Row;}catch{return {};}};
const phaseNames:Record<string,string>={SEARCH:'搜索来源',SOURCE:'搜索来源',CLUE:'查找官网并核验',CANDIDATE:'补全并入库',DONE:'处理完成'};

export default function AutoDiscovery({accessKey,externalBusy,onBusyChange,onChanged,onCleared,initialType}:Props){
  const [state,setState]=useState('TX'),[type,setType]=useState(initialType||'BASKETBALL_TRAINING'),[city,setCity]=useState(''),[target,setTarget]=useState(20),[batches,setBatches]=useState(1);
  const [data,setData]=useState<Data>({}),[loading,setLoading]=useState(true),[working,setWorking]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [history,setHistory]=useState<History>({}),[historyOpen,setHistoryOpen]=useState(false),[historyBusy,setHistoryBusy]=useState(false);
  const [clockNow,setClockNow]=useState(()=>Date.now());
  const onChangedRef=useRef(onChanged);onChangedRef.current=onChanged;
  useEffect(()=>{
    if(data.run?.status!=='RUNNING')return;
    setClockNow(Date.now());
    const timer=setInterval(()=>setClockNow(Date.now()),30000);
    return ()=>clearInterval(timer);
  },[data.run?.id,data.run?.status]);
  const busy=working||historyBusy||data.run?.status==='RUNNING';
  useEffect(()=>{onBusyChange(Boolean(busy));return()=>onBusyChange(false);},[busy,onBusyChange]);
  const accept=(result:Data)=>setData(previous=>mergeDiscovery(previous,result));
  const api=(body?:Row,signal?:AbortSignal,runId?:string)=>discoveryRequest<Data>(accessKey,body,signal,runId);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);
    void api(undefined,controller.signal).then(result=>{if(!controller.signal.aborted)accept(result);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[accessKey]);
  useEffect(()=>{
    if(data.run?.status!=='RUNNING')return;
    return startDiscoveryLoop({runId:data.run.id,initial:data,request:(body,signal)=>api(body,signal,data.run!.id),onData:result=>{accept(result);if(result.run?.status!=='RUNNING')onChangedRef.current();},onError:setError});
  },[accessKey,data.run?.id,data.run?.status]);
  useEffect(()=>{
    const run=data.run,scope=run?.scope;
    if(scope&&(!initialType||['RUNNING','PAUSED'].includes(run?.status||''))){
      setState(scope.stateCode);setType(scope.customerType);setCity(scope.city);
      setTarget(scope.targetCount);setBatches(scope.batches);return;
    }
    // An old completed batch should not overwrite a freshly selected category.
    if(initialType)setType(initialType);
  },[data.run?.id,data.run?.status,initialType]);
  async function start(event:FormEvent){
    event.preventDefault();if(busy||externalBusy)return;setWorking(true);setError('');setMessage('');
    try{setData(await api({action:'START',stateCode:state,customerType:type,city,targetCount:target,batches}));}catch(e){setError(e instanceof Error?e.message:'任务启动失败。');}finally{setWorking(false);}
  }
  async function action(actionName:string){
    if(!data.run)return;setWorking(true);setError('');setMessage('');
    try{
      const result=await api({action:actionName,runId:data.run.id});
      accept(result);
      if(actionName==='RECOVER')setMessage(String((result as Data&{recoveryNote?:string}).recoveryNote||'已请求安全恢复，请等待下一个任务步骤。'));
      onChangedRef.current();
    }catch(e){setError(e instanceof Error?e.message:'任务操作失败。');}finally{setWorking(false);}
  }
  async function loadHistory(){
    const h=await discoveryRequest<History>(accessKey,undefined,undefined,undefined,20000,'/api/admin/discovery-history-v1');setHistory(h);
  }
  async function historyAction(body:Row){
    setHistoryBusy(true);setError('');setMessage('');
    try{
      const h=await discoveryRequest<{protectedLeads?:number}>(accessKey,body,undefined,undefined,20000,'/api/admin/discovery-history-v1');
      if(body.action==='CLEAR'){
        localStorage.removeItem('mingeagle-discovery-rounds-v15');setData({run:null});onCleared();
        setMessage(`历史搜索与开发记录已从工作列表清空，可在下方历史批次中恢复。${h.protectedLeads?`保留 ${h.protectedLeads} 个已关联询盘、报价或订单的业务档案。`:''}`);
      }else{setData(await api());onCleared();setMessage('历史批次已恢复。');}
      await loadHistory();onChangedRef.current();
    }catch(e){setError(e instanceof Error?e.message:'历史记录操作失败。');}finally{setHistoryBusy(false);}
  }
  const count=(kind:string,status?:string)=>(data.counts||[]).filter(c=>c.kind===kind&&(!status||c.status===status)).reduce((n,c)=>n+Number(c.count),0);
  // A completed work item is NOT proof that a CRM lead was inserted.
  const imported=(data.counts||[]).filter(c=>c.kind==='CANDIDATE'&&c.status==='DONE')
    .reduce((total,c)=>total+Number(c.confirmed||0),0);
  const importedRows=(data.results||[]).filter(row=>row.status==='DONE'&&row.crm_lead_id);
  const run=data.run,frozen=busy||run?.status==='PAUSED';
  const stall=discoveryStall(data,clockNow);
  const diagnosis=diagnoseDiscovery(data);
  const zeroResult=Boolean(run&&['COMPLETED','PARTIAL'].includes(run.status)&&imported===0);
  const runMessage=zeroResult?'本批未找到通过核验并入库的客户；请查看各来源返回数量和待核验原因。':run?.message;
  return <section className="panel auto-discovery-panel">
    <div className="auto-discovery-title"><div><span className="auto-discovery-kicker">客户开发 · 一键完成</span><h2>选定范围，自动整理成待开发客户</h2><p>搜索推荐渠道、查找官网、核验机构、补全公开信息并去重入库，全程自动衔接。</p></div><span className="auto-discovery-badge">搜索 → 核验 → 补全 → 入库</span></div>
    <form className="auto-discovery-form" onSubmit={start}>
      <label>国家<input value="United States" readOnly/></label>
      <label>州<select aria-label="一键发现州" value={state} disabled={frozen||externalBusy} onChange={e=>setState(e.target.value)}>{Object.entries(STATE_NAMES).map(([code,name])=><option value={code} key={code}>{name} ({code})</option>)}</select></label>
      <label>客户类型<select aria-label="一键发现客户类型" value={type} disabled={frozen||externalBusy} onChange={e=>setType(e.target.value)}>{TYPE_OPTIONS.map(([code,label])=><option key={code} value={code}>{label}</option>)}</select></label>
      <label>城市（可选）<input aria-label="一键发现城市" value={city} disabled={frozen||externalBusy} onChange={e=>setCity(e.target.value)} placeholder="例如 Dallas；留空轮换重点城市" maxLength={80}/></label>
      <label>每批目标数量<select aria-label="一键发现数量" value={target} disabled={frozen||externalBusy} onChange={e=>setTarget(Number(e.target.value))}><option value={20}>20</option><option value={50}>50</option><option value={100}>100</option></select></label>
      <label>搜索深度<select aria-label="一键发现批数" value={batches} disabled={frozen||externalBusy} onChange={e=>setBatches(Number(e.target.value))}><option value={1}>标准 · 1 批</option><option value={2}>扩大 · 2 批</option><option value={3}>深入 · 3 批</option></select></label>
      <button className="button auto-discovery-start" disabled={frozen||externalBusy||loading}>{busy?<><LoaderCircle size={18} className="spin"/>{working?'正在提交…':'任务在后台执行 · 查看下方进度'}</>:<><Search size={18}/>一键发现并加入待开发客户<ArrowRight size={18}/></>}</button>
    </form>
    <p className="auto-discovery-help">自动选择地图、公开官网、企业目录及社交索引；官网、目录和社交渠道均检索公开搜索索引，并非平台全量数据库。城市留空时按批次轮换重点城市，不代表遍历全州。学校类型自动加入相应官方名录。仅补全有公开出处的信息，未公开字段会明确标记。任务进度保存在后台，离开页面后由后台每分钟续跑。</p>
    {loading&&<p role="status">正在读取任务进度…</p>}
    {run&&<div className="auto-discovery-progress" aria-live="polite">
      <div className="auto-discovery-run-head"><div><strong>{statusNames[run.status]||run.status} · {phaseNames[run.phase]||run.phase}</strong><p>{STATE_NAMES[run.scope.stateCode]}{run.scope.city?' / '+run.scope.city:''} · {TYPE_OPTIONS.find(([key])=>key===run.scope.customerType)?.[1]} · {runMessage}</p></div><div className="secure-link-actions">{run.status==='RUNNING'?<button type="button" className="button secondary small" disabled={working} onClick={()=>void action('PAUSE')}><Pause size={14}/>暂停</button>:run.status==='PAUSED'?<button type="button" className="button small" disabled={working} onClick={()=>void action('RESUME')}><Play size={14}/>继续自动处理</button>:null}{run.status==='PARTIAL'&&<button type="button" className="button secondary small" disabled={working} onClick={()=>void action('RETRY')}><RefreshCcw size={14}/>重试未完成项目</button>}</div></div>
      <div className="auto-discovery-live" role="status"><strong>已完成 {run.steps_completed||0} 个步骤 · 已处理 {data.progress?.processed||0} / {data.progress?.total||0} 个当前工作项</strong>{run.updated_at&&<span>最近更新：{new Date(run.updated_at.replace(' ','T')+'Z').toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai'})}（北京时间）</span>}<span>当前队列：待处理 {data.progress?.waiting??'—'} · 进行中 {data.progress?.processing??'—'} · 待复核 / 失败 {data.progress?.unresolved??'—'}。新发现的线索会自动加入总数，已完成步骤数可能大于已处理工作项。</span>{run.last_progress_at&&<span>最后一次实际步骤完成：{new Date(run.last_progress_at.replace(' ','T')+'Z').toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai'})}（北京时间）；不是任务锁续期时间。</span>}{data.current?.map((item,index)=><p key={item.name+index}>{({SOURCE:'搜索来源',CLUE:'核验线索',CANDIDATE:'整理客户',DETAIL:'读取地点详情',LOOKUP:'查找官网',VERIFY:'核验官网',ENRICH:'补全公开信息',IMPORT:'加入待开发客户'} as Record<string,string>)[item.stage]||item.stage} · {item.name}</p>)}{run.status==='RUNNING'&&!data.current?.length&&<p>{data.workerBusy?'上一处理步骤仍在执行；中断的步骤会在任务锁到期后自动恢复。':'正在衔接下一处理步骤。'}</p>}{stall.stale&&<div className="auto-discovery-diagnosis" role="status" style={{margin:'12px 0',padding:'12px',border:'1px solid #cbd5e1',borderRadius:10}}><strong>已超过 {stall.elapsedMinutes} 分钟没有记录到新的处理步骤</strong><p style={{margin:'7px 0'}}>当前仍有 {stall.waiting} 项等待处理、{stall.processing} 项正在执行。{stall.workerBusy?'后台任务锁尚有效，请等待锁释放，不会强制抢占。':'可以申请一次安全恢复；已入库客户和已完成步骤不会清空。'}</p>{stall.canRecover&&<button type="button" className="button secondary small" disabled={working} onClick={()=>void action('RECOVER')}><RefreshCcw size={14}/>安全恢复任务</button>}</div>}<button type="button" className="button secondary small" disabled={working} onClick={()=>void api(undefined,undefined,run.id).then(accept).catch(e=>setError(e.message))}>检查进度</button>{['RUNNING','PAUSED'].includes(run.status)&&<button type="button" className="button secondary small" disabled={working} onClick={()=>void action('FINISH')}>结束本批并保留结果</button>}</div>
      <div className="auto-discovery-stats"><div><strong>{count('SOURCE','DONE')} / {count('SOURCE')}</strong><span>已查询来源批次</span></div><div><strong>{count('CLUE')}</strong><span>去重后来源线索</span></div><div><strong>{count('CANDIDATE')}</strong><span>候选机构</span></div><div><strong>{imported}</strong><span>已加入待开发客户</span></div></div>
      {diagnosis&&<div className="auto-discovery-diagnosis" style={{marginTop:16,paddingTop:14,borderTop:'1px solid #e4e7ec'}} role="status">
        <strong>自动诊断：{diagnosis.title}</strong>
        <p style={{margin:'7px 0'}}>公开来源返回 {diagnosis.funnel.returned} 条（含跨来源重复） · 去重线索 {diagnosis.funnel.clues} 条 · 候选机构 {diagnosis.funnel.candidates} 个 · 已确认入库 {diagnosis.funnel.imported} 个 · 来源受限 {diagnosis.funnel.sourceFailures}/{diagnosis.funnel.sourceTotal}</p>
        <p style={{margin:'7px 0'}}>{diagnosis.detail}</p>
        <p style={{margin:'7px 0',color:'#475467'}}>下一步：{diagnosis.action}</p>
      </div>}
      {!!importedRows.length&&<div className="table-wrap"><table><thead><tr><th>机构 / 地区</th><th>公开联系方式</th><th>负责人 / 社交账号</th><th>结果</th></tr></thead><tbody>{importedRows.map(row=><tr key={text(row.item_key)}><td><strong>{text(row.name)}</strong><small>{text(row.city,'')} {text(row.state_region,'')} · {text(row.grade)} {text(row.lead_score,'0')}/100</small>{Boolean(row.address)&&<small>{text(row.address)}</small>}{Boolean(row.website)&&<a href={text(row.website)} target="_blank" rel="noreferrer">官网 <ExternalLink size={12}/></a>}</td><td><div>{text(row.email,'邮箱未公开')}</div><div>{text(row.phone,'电话未公开')}</div><small>{row.whatsapp?'WhatsApp: '+text(row.whatsapp):'WhatsApp 未公开'}</small></td><td><strong>{text(row.contact_person_name,'负责人未公开')}</strong><small>{text(row.contact_person_title,'')}</small><div className="discovery-socials">{[['Instagram','instagram_url'],['Facebook','facebook_url'],['TikTok','tiktok_url'],['LinkedIn','linkedin_url']].map(([label,key])=>row[key]?<a key={key} href={text(row[key])} target="_blank" rel="noreferrer">{label}</a>:null)}</div></td><td>{row.status==='DONE'&&row.crm_lead_id?<><span className="auto-discovery-imported">已加入待开发客户</span><Link to={'/app/leads/'+text(row.crm_lead_id)}>查看客户档案</Link></>:<span>{statusNames[text(row.status)]||text(row.status)}</span>}{Boolean(row.error)&&<small>{text(row.error)}</small>}</td></tr>)}</tbody></table></div>}
      {(data.exceptions||[]).length>0&&<div className="auto-discovery-diagnosis" style={{marginTop:16,paddingTop:14,borderTop:'1px solid #e4e7ec'}} role="status">
        <strong>尚未转入客户库的核验记录 · {data.exceptions?.length||0} 项</strong>
        <p style={{margin:'7px 0'}}>这些记录不是已确认客户，不会被自动发送首次邀约；可以查看明确原因后再重试或人工核对官网。</p>
        {(data.exceptions||[]).slice(0,5).map(row=><p key={text(row.kind)+text(row.item_key)} style={{margin:'6px 0'}}><strong>{text(row.name)}</strong>：{text(row.error,'原因待补充')}</p>)}
      </div>}
      <details className="auto-discovery-details"><summary>查看来源进度与未完成信息（{data.exceptions?.length||0}）</summary><ul>{data.sources?.map(row=>{const result=sourceResult(row);return <li key={text(row.item_key)}><strong>{sourceNames[text(row.item_key).split(':')[0]]||text(row.item_key)}</strong> · {row.status==='DONE'?'查询完成':row.status==='REVIEW'?'来源受限 / 需检查':statusNames[text(row.status)]||text(row.status)}{row.status==='DONE'?` · 返回 ${Number(result.found||0)} 条线索`:''}{Boolean(result.note)&&<p>{text(result.note)}</p>}{Boolean(row.error)&&<p>{text(row.error)}</p>}</li>;})}</ul>{data.exceptions?.map(row=><p key={text(row.kind)+text(row.item_key)}><strong>{text(row.name)}</strong> · {text(row.error)}</p>)}</details>
    </div>}
    {message&&<div className="form-status success" role="status">{message}</div>}
    {error&&<div className="form-status error" role="alert">{error}</div>}
    <details className="auto-discovery-history" open={historyOpen} onToggle={e=>{const open=e.currentTarget.open;setHistoryOpen(open);if(open)void loadHistory().catch(e=>setError(e.message));}}><summary>历史搜索与开发记录管理</summary><p>清空当前搜索任务、线索、候选及无业务关联的开发档案和跟进记录；已关联询盘、报价、订单或样品的业务档案保留。历史批次可从这里恢复。</p><div className="auto-history-counts"><span>搜索任务 {history.counts?.discovery_jobs||0}</span><span>线索 {history.counts?.discovery_clues||0}</span><span>候选 {history.counts?.discovery_candidates||0}</span><span>开发客户 {history.counts?.leads||0}</span></div><button type="button" className="button secondary small" disabled={busy||externalBusy} onClick={()=>void historyAction({action:'CLEAR'})}><Trash2 size={14}/>{historyBusy?'正在清理…':'清空历史搜索与开发记录（可恢复）'}</button><div className="auto-history-archives">{history.archives?.map(a=><div key={a.id}><span>{a.created_at} · {a.status==='RESTORED'?'已恢复':'可恢复历史批次'}</span>{a.status==='ARCHIVED'&&<button type="button" className="button secondary small" disabled={busy||externalBusy} onClick={()=>void historyAction({action:'RESTORE',archiveId:a.id})}>恢复此历史批次</button>}</div>)}</div></details>
  </section>;
}
