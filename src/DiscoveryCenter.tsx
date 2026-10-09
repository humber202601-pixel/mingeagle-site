import { TYPE_OPTIONS, COMMERCIAL_TYPES, csvCell } from '../shared/discovery';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ExternalLink, LoaderCircle, MapPin, RefreshCcw, Search, UserPlus, X, Download } from 'lucide-react';
import DiscoverySources from './DiscoverySources';
import AutoDiscovery from './AutoDiscovery';

type Row = Record<string, unknown>;
type IntakeResult = { imported: number; matched: number; review: number; failed: number; warnings: string[] };
const intakeMessage = (intake?: IntakeResult) => intake ? `自动加入潜在客户 ${intake.imported} 个，匹配已有客户 ${intake.matched} 个${intake.review ? `，${intake.review} 个保留待核验或既有状态` : ''}${intake.failed ? `，${intake.failed} 个入库未完成，可重试` : ''}。` : '';

type Props = {
  accessKey: string;
  onChanged: () => void;
};

type DiscoveryData = {
  ok?: boolean;
  candidates?: Row[];
  jobs?: Row[];
  counts?: Row[];
  priority?:number;
  pagination?:{page:number;pageSize:number;total:number;totalPages:number};
  error?: string;
};

const STATES = [
  ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['FL','Florida'],['GA','Georgia'],['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],['MD','Maryland'],['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],['MO','Missouri'],['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],['NH','New Hampshire'],['NJ','New Jersey'],['NM','New Mexico'],['NY','New York'],['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],['OK','Oklahoma'],['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UT','Utah'],['VT','Vermont'],['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming'],
] as const;


const text = (value: unknown, fallback = '—') => value === null || value === undefined || value === '' ? fallback : String(value);
const typeLabel = (value: unknown) => TYPE_OPTIONS.find(([key]) => key === String(value))?.[1] || text(value);
const statusLabel = (value: unknown) => value === 'CRM' ? '已加入 CRM' : value === 'IGNORED' ? '已忽略' : '待开发';
const gradeClass = (grade: unknown) => `discovery-grade grade-${String(grade || 'C').toLowerCase()}`;
const sourceLabel = (provider: unknown) => {
  const value = String(provider || '').toUpperCase();
  if (value.startsWith('OFFICIAL_WEBSITE_IMPORT')) return '官网导入核验';
  if (value.startsWith('PUBLIC_SOURCE_VERIFIED')) return '公开来源官网核验';
  if (value.startsWith('PUBLIC_SOURCE_CLUES')) return '扩展来源线索';
  if (value.startsWith('GEOAPIFY_SCHOOL')) return '学校/采购验证';
  if (value.startsWith('GEOAPIFY')) return 'Geoapify地点';
  if (value.startsWith('WEB_SEARCH') || value.startsWith('WEB_EXPANSION')) return 'Web验证';
  if (value.startsWith('OPENSTREETMAP')) return 'OSM地图';
  return '来源证据';
};

export default function DiscoveryCenter({ accessKey, onChanged }: Props) {
  const [candidates, setCandidates] = useState<Row[]>([]);
  const [jobs, setJobs] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [autoBusy,setAutoBusy]=useState(false),[historyVersion,setHistoryVersion]=useState(0);
  const [expandedBusy,setExpandedBusy]=useState(false),[targetCount,setTargetCount]=useState(20);
  const [batching, setBatching] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('NEW');
  const [gradeFilter, setGradeFilter] = useState('ALL');
  const [stateFilter,setStateFilter]=useState('');
  const [typeFilter,setTypeFilter]=useState('');
  const [readiness,setReadiness]=useState('ALL');
  const [page,setPage]=useState(1);
  const [pagination,setPagination]=useState({page:1,pageSize:50,total:0,totalPages:0});
  const [allCounts,setAllCounts]=useState<Row[]>([]);
  const [priority,setPriority]=useState(0);
  const [searchBatch,setSearchBatch]=useState({key:'',round:0});
  const [reloadVersion,setReloadVersion]=useState(0);
  const [sourceState,setSourceState]=useState<Record<string,boolean>>({});
  const [sourceErrors,setSourceErrors]=useState<Record<string,string>>({});
  const [searchState,setSearchState]=useState('TX');
  const [searchType,setSearchType]=useState('BASKETBALL_TRAINING');
  const [searchCity,setSearchCity]=useState('');
  const [websiteUrls,setWebsiteUrls]=useState('');
  const [importing,setImporting]=useState(false);
  const [cleaning,setCleaning]=useState(false);
  const [websiteResults,setWebsiteResults]=useState<Array<{url:string;status:string;name?:string;reason?:string}>>([]);


  async function load(signal?:AbortSignal) {
    setLoading(true);
    try {
      const params=new URLSearchParams({status:statusFilter,grade:gradeFilter,state:stateFilter,type:typeFilter,readiness,q:query,page:String(page)});
      const response = await fetch('/api/admin/discovery?'+params, { headers: { 'x-admin-key': accessKey },signal });
      const body = await response.json() as DiscoveryData;
      if (!response.ok || !body.ok) throw new Error(body.error || '无法加载客户发现中心。');
      if(signal?.aborted)return;
      setCandidates(body.candidates || []);
      setAllCounts(body.counts||[]);setPriority(body.priority||0);
      if(body.pagination){setPagination(body.pagination);if(page>Math.max(1,body.pagination.totalPages))setPage(Math.max(1,body.pagination.totalPages));}
      setJobs(body.jobs || []);
    } catch (err) {
      if(!signal?.aborted)setError(err instanceof Error ? err.message : '无法加载客户发现中心。');
    } finally {
      if(!signal?.aborted)setLoading(false);
    }
  }

  useEffect(()=>{const controller=new AbortController();const timer=setTimeout(()=>void load(controller.signal),250);return()=>{clearTimeout(timer);controller.abort()}},[accessKey,statusFilter,gradeFilter,stateFilter,typeFilter,readiness,query,page,reloadVersion]);

  async function runSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const batchKey=[data.get('stateCode'),data.get('customerType'),data.get('city')].join('|');
    const round=batchKey===searchBatch.key?searchBatch.round:0;
    setSearching(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/admin/discovery-search-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': accessKey },
        body: JSON.stringify({
          stateCode: data.get('stateCode'),
          customerType: data.get('customerType'),
          targetCount: data.get('targetCount'),city:data.get('city'),round,
        }),
      });
      const body = await response.json() as {ok?:boolean;found?:number;added?:number;updated?:number;ready?:number;intake?:IntakeResult;error?:string;note?:string;nextRound?:number;sources?:Record<string,boolean>;errors?:Record<string,string>};
      setSourceState(body.sources||{});setSourceErrors(body.errors||{});
      if (!response.ok || !body.ok) throw new Error(body.error || '搜索失败。');
      setSearchBatch({key:batchKey,round:body.nextRound??round+1});
      setMessage(`第 ${round+1} 批完成：去重后 ${body.found||0} 个，本次新增 ${body.added||0} 个，更新已有 ${body.updated||0} 个，${intakeMessage(body.intake)}${body.note||''}`);
      if (body.intake?.warnings.length) setError(body.intake.warnings.join(' '));
      setReloadVersion(value=>value+1);onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : '搜索失败。');
    } finally {
      setSearching(false);
    }
  }

  async function importWebsites(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setImporting(true);setError('');setMessage('');setWebsiteResults([]);
    try {
      const urls=websiteUrls.split(/\r?\n/).map(url=>url.trim()).filter(Boolean);
      if(!urls.length||urls.length>10)throw new Error('请输入 1–10 个官网网址，每行一个。');
      const response=await fetch('/api/admin/discovery-website-v1',{method:'POST',headers:{'Content-Type':'application/json','x-admin-key':accessKey},body:JSON.stringify({stateCode:searchState,customerType:searchType,city:searchCity,websiteUrls:urls})});
      const body=await response.json() as {ok?:boolean;error?:string;found?:number;added?:number;updated?:number;verified?:number;intake?:IntakeResult;results?:Array<{url:string;status:string;name?:string;reason?:string}>};
      if(!response.ok||!body.ok)throw new Error(body.error||'官网核验失败。');
      setWebsiteResults(body.results||[]);setMessage(`官网核验完成：通过业务和地区核验 ${body.verified||0} 个，新增 ${body.added||0} 个，更新已有 ${body.updated||0} 个。${intakeMessage(body.intake)}已忽略的客户保持原状态。`);
      if (body.intake?.warnings.length) setError(body.intake.warnings.join(' '));
      setReloadVersion(value=>value+1);onChanged();
    }catch(err){setError(err instanceof Error?err.message:'官网核验失败。')}finally{setImporting(false)}
  }

  async function cleanupInvalid() {
    setCleaning(true);setError('');setMessage('');
    try {
      const response=await fetch('/api/admin/discovery',{method:'POST',headers:{'Content-Type':'application/json','x-admin-key':accessKey},body:JSON.stringify({action:'CLEANUP_INVALID'})});
      const body=await response.json() as {ok?:boolean;error?:string;ignored?:number;crmExcluded?:number;reviewRequired?:number;checked?:number;limit?:number};
      if(!response.ok||!body.ok)throw new Error(body.error||'历史候选清理失败。');
      setMessage(`历史来源核对完成：检查 ${body.checked||0} 条，忽略无效候选 ${body.ignored||0} 条，CRM 标记不匹配 ${body.crmExcluded||0} 条，需人工复查 ${body.reviewRequired||0} 条。${body.checked===body.limit?'本次最多检查 1000 条；更早记录仍需单独复查。':''}`);setReloadVersion(value=>value+1);onChanged();
    }catch(err){setError(err instanceof Error?err.message:'历史候选清理失败。')}finally{setCleaning(false)}
  }

  async function syncCandidateToCrm(candidateId: string) {
    const response=await fetch('/api/admin/discovery-enrich', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': accessKey },
      body: JSON.stringify({ action: 'SYNC_CRM', candidateId }),
    });
    const result=await response.json() as {ok?:boolean;error?:string};if(!response.ok||!result.ok)throw new Error(result.error||'联系人同步未完成。');
  }

  async function addCandidateToCrm(candidateId: string) {
    const response = await fetch('/api/admin/discovery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': accessKey },
      body: JSON.stringify({ action: 'ADD_TO_CRM', candidateId }),
    });
    const body = await response.json() as { ok?: boolean; leadId?: string; alreadyAdded?: boolean; error?: string };
    if (!response.ok || !body.ok) throw new Error(body.error || '加入 CRM 失败。');
    let syncWarning='';try{await syncCandidateToCrm(candidateId)}catch(e){syncWarning=e instanceof Error?e.message:'联系人同步未完成'}
    return {...body,syncWarning};
  }

  async function candidateAction(candidateId: string, action: 'ADD_TO_CRM' | 'IGNORE' | 'RESTORE') {
    setBusyId(candidateId);
    setError('');
    setMessage('');
    try {
      if (action === 'ADD_TO_CRM') {
        const body = await addCandidateToCrm(candidateId);
        setMessage(`已加入 CRM${body.alreadyAdded ? '（已匹配现有客户）' : ''}。`);if(body.syncWarning)setError('客户已入库，补充联系人同步需重试：'+body.syncWarning);
      } else {
        const response = await fetch('/api/admin/discovery', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-key': accessKey },
          body: JSON.stringify({ action, candidateId }),
        });
        const body = await response.json() as { ok?: boolean; error?: string };
        if (!response.ok || !body.ok) throw new Error(body.error || '操作失败。');
        setMessage(action==='RESTORE'?'已恢复该候选客户。':'已忽略该候选客户，可在“已忽略”中恢复。');
      }
      setReloadVersion(value=>value+1);
      if (action === 'ADD_TO_CRM') onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败。');
    } finally {
      setBusyId('');
    }
  }

  async function callEnrichment(candidateId: string) {
    const response = await fetch('/api/admin/discovery-enrich-v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': accessKey },
      body: JSON.stringify({ candidateId }),
    });
    const body = await response.json() as {
      ok?: boolean;
      pagesChecked?: number;
      score?: number;
      grade?: string;
      found?: Record<string, boolean>;
      error?: string;
    };
    if (!response.ok || !body.ok) throw new Error(body.error || '官网补全失败。');
    return body;
  }

  async function enrichOne(candidateId: string) {
    setBusyId(candidateId);
    setError('');
    setMessage('');
    try {
      const body = await callEnrichment(candidateId);
      const foundCount = Object.values(body.found || {}).filter(Boolean).length;
      setMessage(`官网补全完成：检查 ${body.pagesChecked || 1} 个页面，确认 ${foundCount} 类公开信息，评分更新为 ${body.grade || '—'} · ${body.score || 0}/100。`);
      setReloadVersion(value=>value+1);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : '官网补全失败。');
      setReloadVersion(value=>value+1);
    } finally {
      setBusyId('');
    }
  }

  const visible=candidates;
  function exportVisible(){
    const columns=[['客户名称','name'],['客户类型','customer_type'],['州','state_region'],['城市','city'],['官网','website'],['联系人','contact_person_name'],['职务','contact_person_title'],['邮箱','email'],['电话','phone'],['评分','lead_score'],['状态','status'],['来源','source_url'],['证据','source_evidence']];
    const csv='\uFEFF'+[columns.map(([title])=>csvCell(title)).join(','),...visible.map(row=>columns.map(([,key])=>csvCell(row[key])).join(','))].join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download=`mingeagle-prospects-page-${page}.csv`;a.click();URL.revokeObjectURL(url);
  }

  async function batchEnrich() {
    const targets = visible.filter(row => {
      const website = text(row.website, '');
      const status = text(row.status, 'NEW');
      const enrichment = text(row.enrichment_status, 'NOT_STARTED');
      const incomplete = !text(row.email, '') || !text(row.phone, '') || !text(row.contact_person_name, '');
      return Boolean(website) && status !== 'IGNORED' && incomplete && enrichment !== 'RUNNING';
    }).slice(0, 5);
    if (!targets.length) {
      setMessage('当前筛选结果里没有需要官网补全的客户。');
      return;
    }
    setBatching(true);
    setError('');
    setMessage('');
    const results = await Promise.allSettled(targets.map(row => callEnrichment(text(row.id, ''))));
    const success = results.filter(result => result.status === 'fulfilled').length;
    const failed = results.length - success;
    setMessage(`批量官网补全完成：成功 ${success} 个${failed ? `，失败 ${failed} 个` : ''}。`);
    if (failed) setError('部分官网可能有反爬、超时、非 HTML 页面或无法访问；可以稍后单独重试。');
    setReloadVersion(value=>value+1);
    onChanged();
    setBatching(false);
  }

  async function prepareSalesBatch() {
    const targets = visible.filter(row => text(row.status, 'NEW') === 'NEW' && Number(row.lead_score || 0) >= 60).slice(0, 5);
    if (!targets.length) {
      setMessage('当前筛选结果里没有 B 级以上、可准备销售的待开发客户。');
      return;
    }
    setPreparing(true);
    setError('');
    setMessage('');
    let enriched = 0;
    let added = 0;
    let noDirectContact = 0;
    let failed = 0;
    for (const row of targets) {
      const candidateId = text(row.id, '');
      if (!candidateId) continue;
      let found: Record<string, boolean> = {};
      const website = text(row.website, '');
      const incomplete = !text(row.email, '') || !text(row.phone, '') || !text(row.contact_person_name, '');
      if (website && incomplete) {
        try {
          const result = await callEnrichment(candidateId);
          found = result.found || {};
          enriched += 1;
        } catch {
          // Existing direct contacts can still be promoted to CRM even if a website blocks enrichment.
        }
      }
      const hasDirectContact = Boolean(
        text(row.email, '') || text(row.phone, '') || text(row.whatsapp, '') ||
        found.email || found.phone || found.whatsapp
      );
      if (!hasDirectContact) {
        noDirectContact += 1;
        continue;
      }
      try {
        await addCandidateToCrm(candidateId);
        added += 1;
      } catch {
        failed += 1;
      }
    }
    setMessage(`销售准备完成：处理 ${targets.length} 个，官网补全 ${enriched} 个，加入 CRM ${added} 个${noDirectContact ? `，${noDirectContact} 个暂缺邮箱/电话/WhatsApp` : ''}${failed ? `，失败 ${failed} 个` : ''}。`);
    if (noDirectContact) setError('暂缺直接联系方式的客户会继续保留在候选库，不会自动发送任何消息；可后续再次补全或人工核对官网联系表单。');
    setReloadVersion(value=>value+1);
    onChanged();
    setPreparing(false);
  }

  const counts=useMemo(()=>{
    const get=(status:string)=>Number(allCounts.find(r=>r.status===status)?.count||0);
    return {total:get('NEW')+get('CRM'),fresh:get('NEW'),a:priority,crm:get('CRM')};
  },[allCounts,priority]);

  return <>
    <AutoDiscovery accessKey={accessKey} externalBusy={expandedBusy||searching||importing||cleaning||batching||preparing||Boolean(busyId)} onBusyChange={setAutoBusy} onChanged={()=>{setReloadVersion(v=>v+1);onChanged();}} onCleared={()=>{setHistoryVersion(v=>v+1);setSearchBatch({key:'',round:0});setCandidates([]);setJobs([]);setAllCounts([]);setMessage('');setError('');}}/>
    <details className="discovery-advanced"><summary>高级工具 · 手动搜索、核验与候选记录</summary>
    <section className="metric-grid discovery-metrics">
      <div className="metric"><span>候选客户库</span><strong>{counts.total}</strong><small>有效候选</small></div>
      <div className="metric"><span>待开发</span><strong>{counts.fresh}</strong><small>尚未加入 CRM</small></div>
      <div className="metric"><span>优先跟进</span><strong>{counts.a}</strong><small>A 级且有公开联系方式</small></div>
      <div className="metric"><span>已入 CRM</span><strong>{counts.crm}</strong><small>进入销售流程</small></div>
    </section>

    <section className="panel discovery-search-panel">
      <div className="panel-head">
        <div><h2>客户发现中心</h2><span>17 类采购相关客户 · 地点发现 · 官网核验</span></div>
        {loading && <LoaderCircle size={18} className="spin"/>}
      </div>
      <div className="discovery-pipeline"><span>01 选择采购群体</span><span>02 搜索与官网核验</span><span>03 筛选与补全</span><span>04 自动加入潜在客户</span></div>
      <form className="discovery-search-form" onSubmit={runSearch}>
        <label>国家
          <input value="United States" readOnly />
        </label>
        <label>州
          <select disabled={autoBusy||expandedBusy||searching||importing} name="stateCode" value={searchState} onChange={e=>{setSearchState(e.target.value);setSearchBatch({key:'',round:0})}}>
            {STATES.map(([code,name]) => <option key={code} value={code}>{name} ({code})</option>)}
          </select>
        </label>
        <label>客户类型
          <select disabled={autoBusy||expandedBusy||searching||importing} name="customerType" value={searchType} onChange={e=>{setSearchType(e.target.value);setSearchBatch({key:'',round:0})}}>
            {TYPE_OPTIONS.map(([value,label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>城市（可选）<input disabled={autoBusy||expandedBusy||searching||importing} name="city" value={searchCity} onChange={e=>{setSearchCity(e.target.value);setSearchBatch({key:'',round:0})}} placeholder="例如 Dallas；留空覆盖主要城市" maxLength={80}/></label>
        <label>每批目标数量
          <select disabled={autoBusy||expandedBusy||searching||importing} name="targetCount" value={targetCount} onChange={e=>setTargetCount(Number(e.target.value))}><option value="20">20</option><option value="50">50</option><option value="100">100</option></select>
        </label>
        <button className="button discovery-search-button" disabled={autoBusy||expandedBusy||(searching||importing)}>{searching ? <><LoaderCircle size={16} className="spin"/> 正在搜索…</> : <><Search size={16}/> {searchBatch.round?'继续发现下一批':'开始发现客户'}</>}</button>
      </form>
      <details className="discovery-website-import">
        <summary>官网批量核验 · 补充搜索、展会和行业目录中的潜在客户</summary>
        <p>使用上方的州、客户类型和城市条件。填写公开官网完整网址，每行一个，最多 10 个；系统核验机构、业务及地区，提取公开联系方式、去重并自动加入潜在客户列表。城市仅表示官网提及的服务范围，不代表已核实的注册地址。</p>
        {COMMERCIAL_TYPES.has(searchType)?<form onSubmit={importWebsites}>
          <label htmlFor="discovery-websites">待核验官网</label>
          <textarea id="discovery-websites" value={websiteUrls} onChange={e=>setWebsiteUrls(e.target.value)} rows={4} maxLength={11000} placeholder="https://www.example.com" required/>
          <button className="button secondary" disabled={autoBusy||expandedBusy||(importing||searching)}>{importing?'正在核验官网…':'核验并加入潜在客户'}</button>
        </form>:<p>学校类别请使用上方学校专用发现。</p>}
        {!!websiteResults.length&&<ul className="discovery-website-results" aria-live="polite">{websiteResults.map((result,index)=><li key={index}><strong>{result.status==='VERIFIED'?'已核验':result.status==='DUPLICATE'?'本批重复':result.status==='IGNORED'?'保持忽略':'未通过'}</strong><span>{result.name||result.url}</span>{result.reason&&<small>{result.reason}</small>}</li>)}</ul>}
      </details>
      <div className="discovery-enrich-bar">
        <div className="discovery-note">新增独立教练、多项目训练、社区体育中心、批发商和夏令营。连续搜索会轮换城市及关键词；每批数量是目标，实际入库取决于可核验结果。先筛选“优先跟进”，再补全官网公开联系人。</div>
        <button type="button" className="button secondary small" disabled={autoBusy||expandedBusy||(batching || preparing)} onClick={() => void batchEnrich()}>{batching ? <><LoaderCircle size={14} className="spin"/> 正在批量补全…</> : <><RefreshCcw size={14}/> 批量补全前 5 个</>}</button>
        <button type="button" className="button small" disabled={autoBusy||expandedBusy||(preparing || batching)} onClick={() => void prepareSalesBatch()}>{preparing ? <><LoaderCircle size={14} className="spin"/> 正在准备销售…</> : <><UserPlus size={14}/> 一键准备销售前 5 个</>}</button>
      </div>
      {Object.keys(sourceState).length>0&&<div className="discovery-source-status" aria-live="polite">{Object.entries(sourceState).map(([key,ok])=><span key={key} className={ok?'source-ok':'source-failed'}>{key==='web'?'Web 官网验证':key==='school'?'学校 / 采购验证':'Geoapify 地点'}：{ok?'已完成':'暂未完成'}{sourceErrors[key]?` · ${sourceErrors[key]}`:''}</span>)}</div>}
      {message && <div className="form-status success"><strong>操作成功</strong><p>{message}</p></div>}
      {error && <div className="form-status error"><strong>提示</strong><p>{error}</p></div>}
    </section>

    <section className="panel table-panel">
      <div className="table-tools searchable-tools">
        <div><strong>客户候选 · {pagination.total}</strong><span> / 有效库 {counts.total}</span></div>
        <div className="table-filters">
          <input value={query} onChange={e => {setQuery(e.target.value);setPage(1)}} aria-label="搜索客户" placeholder="搜索名称、城市、负责人、网站、邮箱…"/>
          <select aria-label="按州筛选" value={stateFilter} onChange={e=>{setStateFilter(e.target.value);setPage(1)}}><option value="">全部州</option>{STATES.map(([code,name])=><option key={code} value={code}>{name}</option>)}</select>
          <select aria-label="按客户类型筛选" value={typeFilter} onChange={e=>{setTypeFilter(e.target.value);setPage(1)}}><option value="">全部客户类型</option>{TYPE_OPTIONS.map(([code,label])=><option key={code} value={code}>{label}</option>)}</select>
          <select aria-label="按联系完整度筛选" value={readiness} onChange={e=>{setReadiness(e.target.value);setPage(1)}}><option value="ALL">全部联系完整度</option><option value="PRIORITY">优先跟进 · A 级且可联系</option><option value="CONTACTABLE">有公开联系方式</option><option value="INCOMPLETE">待补全联系方式</option></select>
          <button className="button secondary small" disabled={autoBusy||expandedBusy||(cleaning||searching||importing)} onClick={()=>void cleanupInvalid()}>{cleaning?'正在核对历史来源…':'排除百科 / 新闻类历史候选'}</button>
          <button className="button secondary small" disabled={autoBusy||expandedBusy||(!visible.length||loading)} onClick={exportVisible}><Download size={14}/>导出本页 CSV</button>
          <select aria-label="按评分筛选" value={gradeFilter} onChange={e => {setGradeFilter(e.target.value);setPage(1)}}><option value="ALL">全部评分</option><option value="A">A级</option><option value="B">B级</option><option value="C">C级</option></select>
          <select aria-label="按状态筛选" value={statusFilter} onChange={e => {setStatusFilter(e.target.value);setPage(1)}}><option value="NEW">待开发</option><option value="CRM">已入CRM</option><option value="IGNORED">已忽略</option><option value="ALL">全部状态</option></select>
        </div>
      </div>
      <div className="table-wrap discovery-table-wrap"><table><thead><tr><th>客户</th><th>类型 / 地区</th><th>公开联系人 / 联系方式</th><th>评分</th><th>来源</th><th>操作</th></tr></thead><tbody>
        {visible.length === 0 && <tr><td colSpan={6}>暂无符合条件的客户。先从上方选择州和客户类型开始搜索。</td></tr>}
        {visible.map((row, index) => {
          const id = text(row.id, String(index));
          const website = text(row.website, '');
          const email = text(row.email, '');
          const phone = text(row.phone, '');
          const whatsapp = text(row.whatsapp, '');
          const instagram = text(row.instagram_url, '');
          const facebook = text(row.facebook_url, '');
          const linkedin = text(row.linkedin_url, '');
          const person = text(row.contact_person_name, '');
          const personTitle = text(row.contact_person_title, '');
          const status = text(row.status, 'NEW');
          const enrichment = text(row.enrichment_status, 'NOT_STARTED');
          return <tr key={id}>
            <td><div className="discovery-name"><strong>{text(row.name)}</strong>{website && <a href={website} target="_blank" rel="noreferrer">官网 <ExternalLink size={12}/></a>}</div><small>{statusLabel(status)}{enrichment === 'COMPLETED' ? ' · 官网已补全' : enrichment === 'FAILED' ? ' · 补全失败' : ''}</small></td>
            <td><strong>{typeLabel(row.customer_type)}</strong><small className="discovery-location"><MapPin size={12}/>{[text(row.city,''), text(row.state_region,'')].filter(Boolean).join(', ') || '—'}</small><small>{text(row.address,'')}</small></td>
            <td><div className="discovery-contact-list">
              {person && <strong>{person}{personTitle ? ` · ${personTitle}` : ''}</strong>}
              {email ? <a href={`mailto:${email}`}>{email}</a> : <span>邮箱待补全</span>}
              {phone ? <a href={`tel:${phone}`}>{phone}</a> : <span>电话待补全</span>}
              {whatsapp && <span>WhatsApp: {whatsapp}</span>}
              <div className="discovery-socials">
                {linkedin && <a href={linkedin} target="_blank" rel="noreferrer">LinkedIn</a>}
                {instagram && <a href={instagram} target="_blank" rel="noreferrer">Instagram</a>}
                {facebook && <a href={facebook} target="_blank" rel="noreferrer">Facebook</a>}
              </div>
            </div></td>
            <td><div className="discovery-score"><span className={gradeClass(row.grade)}>{text(row.grade)}</span><strong>{text(row.lead_score, '0')}</strong><small>/100</small></div></td>
            <td><a className="discovery-source" href={text(row.source_url,'#')} target="_blank" rel="noreferrer">{sourceLabel(row.source_provider)} <ExternalLink size={12}/></a>{text(row.website_contact_url,'') && <a className="discovery-source" href={text(row.website_contact_url,'')} target="_blank" rel="noreferrer">官网证据 <ExternalLink size={12}/></a>}<small>{text(row.source_evidence,'')}</small></td>
            <td><div className="secure-link-actions">
              {website && status !== 'IGNORED' && <button className="table-action" disabled={autoBusy||expandedBusy||(busyId === id)} onClick={() => void enrichOne(id)}><RefreshCcw size={13}/>{busyId === id ? '补全中…' : enrichment === 'COMPLETED' ? '重新补全' : '官网补全'}</button>}
              {status === 'NEW' && <button className="table-action" disabled={autoBusy||expandedBusy||(busyId === id)} onClick={() => void candidateAction(id,'ADD_TO_CRM')}><UserPlus size={13}/>{busyId === id ? '处理中…' : '加入CRM'}</button>}
              {status === 'NEW' && <button className="table-action" disabled={autoBusy||expandedBusy||(busyId === id)} onClick={() => void candidateAction(id,'IGNORE')}><X size={13}/>忽略</button>}
              {status === 'CRM' && <span>已进入销售流程</span>}
              {status === 'IGNORED' && <button className="table-action" disabled={autoBusy||expandedBusy||(busyId===id)} onClick={()=>void candidateAction(id,'RESTORE')}>恢复候选</button>}
            </div></td>
          </tr>;
        })}
      </tbody></table></div>
      <div className="discovery-pagination"><span>共 {pagination.total} 个 · 每页 {pagination.pageSize} 个 · 第 {page} / {Math.max(1,pagination.totalPages)} 页</span><div><button className="button secondary small" disabled={autoBusy||expandedBusy||(page<=1||loading)} onClick={()=>setPage(p=>p-1)}>上一页</button><button className="button secondary small" disabled={autoBusy||expandedBusy||(page>=pagination.totalPages||loading)} onClick={()=>setPage(p=>p+1)}>下一页</button></div></div>
    </section>

    <DiscoverySources key={historyVersion} accessKey={accessKey} stateCode={searchState} customerType={searchType} city={searchCity} targetCount={targetCount} externalBusy={autoBusy||searching||importing||cleaning||batching||preparing||Boolean(busyId)} onBusyChange={setExpandedBusy} onChanged={()=>{setReloadVersion(value=>value+1);onChanged();}}/>

    {jobs.length > 0 && <section className="panel">
      <div className="panel-head"><h2>最近发现任务</h2><span>保留最近 20 次运行记录</span></div>
      {jobs.slice(0,8).map((job,index) => <div className="list-row" key={text(job.id,String(index))}><div><strong>{typeLabel(job.customer_type)} · {text(job.state_region)}</strong><small>目标 {text(job.target_count)} · 实际 {text(job.result_count,'0')} · {text(job.source_provider)}</small></div><span>{text(job.status)}</span></div>)}
    </section>}

    <div className="discovery-attribution">公开数据源仅用于发现公开商业信息；官网补全仅访问公开网页并保留来源证据。</div>
  </details>
  </>;
}
