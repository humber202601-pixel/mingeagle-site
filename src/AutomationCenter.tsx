import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, CheckCircle2, Clock3, MailCheck, PackageCheck, PauseCircle, PlayCircle, RefreshCcw, Send, ShieldCheck, X } from 'lucide-react';
import { zhDate } from './adminI18n';

type Row = Record<string, unknown>;
type Settings = { enabled: boolean; maxPerRun: number; maxPerLead: number; updatedAt?: string | null };
type Metrics = { sentToday: number; ready: number; reviewRequired: number; failed: number; sentTotal: number };
type SchedulerRow = { id:string; cron:string; last_seen_at:string };
type ProductionHealth={
  ok?:boolean;error?:string;generatedAt?:string;
  hubspot?:{credentialConfigured:boolean;stateKnown:boolean;status:'DISABLED'|'NEVER_SUCCEEDED'|'STALE'|'HEALTHY';importedTotal:number|null;lastSuccessfulPageAt:string|null;nextOffset:number|null;
    job?:{status:string;lastAttemptAt:string;lastSuccessAt:string|null;httpStatus:number|null;consecutiveFailures:number}|null;
    lastBatch?:{completedAt:string;processed:number;imported:number;reused:number;skipped:number;hasMore:boolean;nextOffset:number}|null;
    inventoryAudit?:{checkedAt:string;limit2Count:number;limit2HasMore:boolean|null;
      limit50Count:number;limit50HasMore:boolean|null;limit2Offset:number|null;
      limit50Offset:number|null;limit2Total:number|null;limit50Total:number|null}|null;
    qualityAudit?:{checkedAt:string;scanned:number;eligible:number;excluded:number;
      reasons:Record<AuditReason,number>;scope:string}|null};
  turnstile?:{configured:boolean;enabled:boolean;misconfigured:boolean};
  discovery?:{status:string;phase:string;updatedAt:string;stepsCompleted:number;sources:number;sourceFailures:number;candidates:number;imported:number|null}|null;
  inquiries?:{total:number;last24h:number;newCount:number;newOver4h:number;newOver24h:number;reviewingOver24h:number;orphanLeadLinks:number|null;latestAt:string|null}|null;
  quota?:{actualD1RowsRead:number|null;actualD1RowsWritten:number|null;trackingConfigured:boolean};
};
type AuditReason='ELIGIBLE'|'NO_FORM_FIELDS'|'INVALID_INQUIRY_REFERENCE'|
 'CONSENT_NOT_GRANTED'|'MISSING_IDENTITY'|'UNSUPPORTED_REQUEST_TYPE'|'MISSING_COUNTRY';
type AuditClassification={scanned:number;eligible:number;excluded:number;
 reasons:Record<AuditReason,number>};
type LiveAudit={ok:boolean;inventory:{limit50:{count:number}};classification:AuditClassification;error?:string};
const auditLabels:Record<AuditReason,string>={
 ELIGIBLE:'符合补录格式（不等于已入库）',
 NO_FORM_FIELDS:'未包含可解析的表单字段',
 INVALID_INQUIRY_REFERENCE:'缺少或无效的官网询盘编号（包括其他类型的提交）',
 CONSENT_NOT_GRANTED:'未提供有效隐私同意',
 MISSING_IDENTITY:'姓名或电子邮箱不完整',
 UNSUPPORTED_REQUEST_TYPE:'申请类型不属于支持范围',
 MISSING_COUNTRY:'需要配送地区的申请缺少国家信息',
};
type ResponseData = { ok?: boolean; settings?: Settings; metrics?: Metrics; recent?: Row[]; scheduler?: SchedulerRow[]; error?: string };
type QueueData = { ok?: boolean; rows?: Row[]; counts?: Row[]; error?: string; reviewed?: number; created?: number; initialCreated?: number; followupCreated?: number };
type SamplesData = { ok?: boolean; samples?: Row[]; error?: string };
type QueueAction = 'APPROVE'|'SEND'|'DELAY'|'SKIP'|'RETRY';
type SampleDraft = { status: string; shippingAddress: string; carrier: string; trackingNumber: string; costAmount: string; currency: string };

const emptySettings: Settings = { enabled: true, maxPerRun: 5, maxPerLead: 3 };
const emptyMetrics: Metrics = { sentToday: 0, ready: 0, reviewRequired: 0, failed: 0, sentTotal: 0 };
const sampleStatuses = ['REQUESTED','APPROVED','PAYMENT_PENDING','PREPARING','SHIPPED','DELIVERED','FOLLOW_UP','CONVERTED','CLOSED'];
const text = (value: unknown, fallback = '—') => value === null || value === undefined || value === '' ? fallback : String(value);

function statusLabel(status: unknown) {
  const value = text(status, '');
  return ({ READY: '已批准 / 待发送', REVIEW_REQUIRED: '待人工审核', FAILED: '发送失败', SENT: '已发送', SKIPPED: '已跳过' } as Record<string,string>)[value] || value || '未知';
}

function sampleStatusLabel(status: unknown) {
  const value = text(status, '');
  return ({
    REQUESTED:'客户已申请', APPROVED:'已批准', PAYMENT_PENDING:'待付款/费用确认', PREPARING:'准备中', SHIPPED:'已发出', DELIVERED:'已送达', FOLLOW_UP:'待回访', CONVERTED:'已转销售', CLOSED:'已关闭',
  } as Record<string,string>)[value] || value || '未知';
}

function queueTypeLabel(value: unknown) {
  const type = text(value, '');
  if (type === 'OUTREACH_INITIAL') return '首次冷开发';
  if (type.includes('OUTREACH') && type.includes('FOLLOW_UP')) return '未回复跟进';
  if (type === 'QUOTE_FOLLOW_UP') return '报价跟进';
  if (type === 'SAMPLE_FOLLOW_UP') return '样品跟进';
  if (type === 'NEGOTIATION_FOLLOW_UP') return '商务洽谈跟进';
  if (type === 'INTEREST_FOLLOW_UP') return '意向客户跟进';
  if (type === 'REORDER_FOLLOW_UP') return '复购跟进';
  return type || '邮件';
}

function sampleDraftFromRow(row: Row): SampleDraft {
  return {
    status: text(row.status, 'REQUESTED'),
    shippingAddress: text(row.shipping_address, ''),
    carrier: text(row.carrier, ''),
    trackingNumber: text(row.tracking_number, ''),
    costAmount: row.cost_amount === null || row.cost_amount === undefined ? '' : String(row.cost_amount),
    currency: text(row.currency, 'USD'),
  };
}

export default function AutomationCenter({ accessKey }: { accessKey: string }) {
  const [settings, setSettings] = useState<Settings>(emptySettings);
  const [metrics, setMetrics] = useState<Metrics>(emptyMetrics);
  const [recent, setRecent] = useState<Row[]>([]);
  const [scheduler, setScheduler] = useState<SchedulerRow[]>([]);
  const [health, setHealth] = useState<ProductionHealth|null>(null);
  const [healthError, setHealthError] = useState('');
  const [auditBusy,setAuditBusy]=useState(false);
  const [auditResult,setAuditResult]=useState<AuditClassification|null>(null);
  const [auditError,setAuditError]=useState('');
  const [queue, setQueue] = useState<Row[]>([]);
  const [samples, setSamples] = useState<Row[]>([]);
  const [sampleDrafts, setSampleDrafts] = useState<Record<string, SampleDraft>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState('');
  const [sampleBusy, setSampleBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const headers = useMemo(() => ({ 'content-type': 'application/json', 'x-admin-key': accessKey }), [accessKey]);

  const load = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const [automationResponse, queueResponse, samplesResponse, healthResponse] = await Promise.all([
        fetch('/api/admin/automation-control', { headers: { 'x-admin-key': accessKey } }),
        fetch('/api/admin/email-queue', { headers: { 'x-admin-key': accessKey } }),
        fetch('/api/admin/samples', { headers: { 'x-admin-key': accessKey } }),
        fetch('/api/admin/production-health', { headers: { 'x-admin-key': accessKey } }),
      ]);
      const body = await automationResponse.json() as ResponseData;
      const queueBody = await queueResponse.json() as QueueData;
      const samplesBody = await samplesResponse.json() as SamplesData;
      if (!automationResponse.ok || !body.ok) throw new Error(body.error || '无法加载自动化设置。');
      if (!queueResponse.ok || !queueBody.ok) throw new Error(queueBody.error || '无法加载邮件队列。');
      if (!samplesResponse.ok || !samplesBody.ok) throw new Error(samplesBody.error || '无法加载样品申请。');
      setSettings(body.settings || emptySettings);
      setMetrics(body.metrics || emptyMetrics);
      setRecent(body.recent || []);
      setScheduler(body.scheduler || []);
      // Health checks are a read-only convenience. A temporary D1 quota or
      // incomplete migration must not break the existing automation screen.
      const healthBody=await healthResponse.json().catch(()=>({})) as ProductionHealth;
      if(healthResponse.ok&&healthBody.ok){setHealth(healthBody);setHealthError('');}
      else {setHealth(null);setHealthError(healthBody.error||'健康检查暂时不可用');}
      setQueue(queueBody.rows || []);
      const nextSamples = samplesBody.samples || [];
      setSamples(nextSamples);
      setSampleDrafts(Object.fromEntries(nextSamples.map(row => [text(row.id,''), sampleDraftFromRow(row)])));
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法加载自动化设置。');
    } finally { setBusy(false); }
  }, [accessKey]);

  useEffect(() => { void load(); }, [load]);

  async function auditHubspotNow(){
    setAuditBusy(true);setAuditError('');setAuditResult(null);
    try{
      const response=await fetch('/api/admin/hubspot-inquiry-recovery',{
        method:'POST',headers,body:JSON.stringify({action:'AUDIT'}),cache:'no-store'
      });
      const result=await response.json() as LiveAudit;
      const c=result.classification;
      if(!response.ok||!result.ok||!c||!Number.isSafeInteger(c.scanned)
        ||!Number.isSafeInteger(c.eligible)||!Number.isSafeInteger(c.excluded)
        ||c.scanned>50||c.eligible+c.excluded!==c.scanned
        ||!c.reasons||Object.keys(c.reasons).length!==Object.keys(auditLabels).length
        ||!(Object.keys(auditLabels) as AuditReason[]).every(k=>
          Number.isSafeInteger(c.reasons[k])&&c.reasons[k]>=0)
        ||(Object.keys(auditLabels) as AuditReason[]).reduce((n,k)=>n+c.reasons[k],0)!==c.scanned
        ||c.reasons.ELIGIBLE!==c.eligible)
        throw Error(result.error||'HubSpot 只读抽查结果不可核验');
      setAuditResult(c);
    }catch(e){setAuditError(e instanceof Error?e.message:'HubSpot 只读抽查失败')}
    finally{setAuditBusy(false)}
  }

  async function update(next: Partial<Settings>) {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/admin/automation-control', { method: 'POST', headers, body: JSON.stringify(next) });
      const body = await response.json() as ResponseData;
      if (!response.ok || !body.ok) throw new Error(body.error || '保存失败。');
      setSettings(body.settings || emptySettings);
      setMetrics(body.metrics || emptyMetrics);
      setRecent(body.recent || []);
      setScheduler(body.scheduler || []);
      setMessage('自动化设置已保存。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败。');
    } finally { setBusy(false); }
  }

  async function generateQueue() {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/admin/email-queue', { method:'POST', headers, body:JSON.stringify({ action:'GENERATE' }) });
      const body = await response.json() as QueueData;
      if (!response.ok || !body.ok) throw new Error(body.error || '生成邮件队列失败。');
      setMessage(`邮件草稿队列已更新：新增 ${body.created || 0} 封，其中首封 ${body.initialCreated || 0} 封、跟进 ${body.followupCreated || 0} 封。`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成邮件队列失败。');
    } finally { setBusy(false); }
  }

  async function requestQueueAction(queueId: string, action: QueueAction) {
    const payload: Record<string, unknown> = { action, queueId };
    if (action === 'DELAY') payload.days = 3;
    const response = await fetch('/api/admin/email-queue', { method:'POST', headers, body:JSON.stringify(payload) });
    const body = await response.json() as { ok?: boolean; error?: string; to?: string };
    if (!response.ok || !body.ok) throw new Error(body.error || '邮件队列操作失败。');
    return body;
  }

  async function queueAction(queueId: string, action: QueueAction) {
    setRowBusy(queueId); setError(''); setMessage('');
    try {
      const body = await requestQueueAction(queueId, action);
      const labels: Record<QueueAction,string> = {
        APPROVE:'草稿已批准。现在才允许点击“立即发送”。',
        SEND:`邮件已通过 Gmail 真实发送${body.to ? `至 ${body.to}` : ''}。`,
        DELAY:'已延期 3 天。',
        SKIP:'已跳过该邮件。',
        RETRY:'已重新进入待发送状态。',
      };
      setMessage(labels[action]);
      setSelectedIds(ids => ids.filter(id => id !== queueId));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '邮件队列操作失败。');
    } finally { setRowBusy(''); }
  }

  const reviewQueue = useMemo(() => queue.filter(row => ['REVIEW_REQUIRED','READY','FAILED'].includes(text(row.status,''))).slice(0,30), [queue]);
  const selectedRows = useMemo(() => reviewQueue.filter(row => selectedIds.includes(text(row.id,''))), [reviewQueue, selectedIds]);
  const selectedReviewCount = selectedRows.filter(row => text(row.status,'') === 'REVIEW_REQUIRED').length;
  const selectedReadyCount = selectedRows.filter(row => text(row.status,'') === 'READY').length;
  const openSamples = useMemo(() => samples.filter(row => !['CONVERTED','CLOSED'].includes(text(row.status,''))).slice(0,30), [samples]);

  function toggleSelected(id: string) {
    setSelectedIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  }

  function toggleSelectAll() {
    const ids = reviewQueue.map(row => text(row.id,'')).filter(Boolean);
    const allSelected = ids.length > 0 && ids.every(id => selectedIds.includes(id));
    setSelectedIds(allSelected ? [] : ids);
  }

  async function batchAction(action: 'APPROVE'|'SEND'|'SKIP') {
    const targets = selectedRows.filter(row => {
      const status = text(row.status,'');
      if (action === 'APPROVE') return status === 'REVIEW_REQUIRED';
      if (action === 'SEND') return status === 'READY';
      return ['REVIEW_REQUIRED','READY','FAILED'].includes(status);
    });
    if (!targets.length) {
      setMessage(action === 'SEND' ? '请先勾选至少一封“已批准 / 待发送”的邮件。' : '当前勾选项里没有可执行该批量操作的邮件。');
      return;
    }
    if (action === 'SEND') {
      const confirmed = window.confirm(`将通过 Gmail 真实发送 ${targets.length} 封已批准邮件。确认继续吗？`);
      if (!confirmed) return;
    }

    setBusy(true); setError(''); setMessage('');
    let success = 0;
    const failures: string[] = [];
    for (const row of targets) {
      const id = text(row.id,'');
      try {
        await requestQueueAction(id, action);
        success += 1;
      } catch (err) {
        failures.push(`${text(row.company,'客户')}: ${err instanceof Error ? err.message : '失败'}`);
      }
    }
    setSelectedIds([]);
    const label = action === 'APPROVE' ? '批量批准' : action === 'SEND' ? '批量发送' : '批量跳过';
    setMessage(`${label}完成：成功 ${success} 封${failures.length ? `，失败 ${failures.length} 封` : ''}。`);
    if (failures.length) setError(failures.slice(0,3).join('；'));
    await load();
    setBusy(false);
  }

  function updateSampleDraft(id: string, patch: Partial<SampleDraft>) {
    setSampleDrafts(current => ({ ...current, [id]: { ...(current[id] || { status:'REQUESTED', shippingAddress:'', carrier:'', trackingNumber:'', costAmount:'', currency:'USD' }), ...patch } }));
  }

  async function saveSample(sampleId: string) {
    const draft = sampleDrafts[sampleId];
    if (!draft) return;
    setSampleBusy(sampleId); setError(''); setMessage('');
    try {
      const response = await fetch('/api/admin/samples', {
        method:'POST', headers,
        body:JSON.stringify({
          sampleId,
          status:draft.status,
          shippingAddress:draft.shippingAddress,
          carrier:draft.carrier,
          trackingNumber:draft.trackingNumber,
          costAmount:draft.costAmount === '' ? null : Number(draft.costAmount),
          currency:draft.currency,
        }),
      });
      const body = await response.json() as { ok?:boolean; error?:string; reference?:string; status?:string };
      if (!response.ok || !body.ok) throw new Error(body.error || '保存样品申请失败。');
      setMessage(`样品申请 ${body.reference || ''} 已更新为“${sampleStatusLabel(body.status)}”。`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存样品申请失败。');
    } finally { setSampleBusy(''); }
  }

  const heartbeatDisplay = (kind: 'DISCOVERY' | 'FOLLOWUP' | 'HUBSPOT_RECOVERY') => {
    const row=scheduler.find(item=>item.id===kind);
    if(!row)return {state:'未观察到执行记录',time:'—',recent:false};
    const date=new Date(row.last_seen_at.replace(' ','T')+'Z');
    if(Number.isNaN(date.getTime()))return {state:'记录时间无效',time:'—',recent:false};
    const age=Date.now()-date.getTime(),windowMs=kind==='DISCOVERY'?30*60*1000:kind==='HUBSPOT_RECOVERY'?3*60*60*1000:26*60*60*1000;
    return {state:age>=0&&age<=windowMs?'最近有触发':'触发记录可能过期',time:date.toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})+'（北京时间）',recent:age>=0&&age<=windowMs};
  };
  const discoveryBeat=heartbeatDisplay('DISCOVERY'),followupBeat=heartbeatDisplay('FOLLOWUP'),recoveryBeat=heartbeatDisplay('HUBSPOT_RECOVERY');

  return <div>
    <section className="panel" aria-label="定时任务真实运行记录">
      <div className="panel-head"><div><h2>定时任务触发记录</h2><span>只有 Worker 实际收到 Cron Trigger 才会产生记录</span></div><button type="button" className="side-button" disabled={busy} onClick={()=>void load()}><RefreshCcw size={16}/>刷新状态</button></div>
      <div className="list-row"><div><strong>客户发现续跑 · 每分钟检查一次</strong><small>{discoveryBeat.time}</small></div><span className={discoveryBeat.recent?'priority medium':'priority high'}>{discoveryBeat.state}</span></div>
      <div className="list-row"><div><strong>客户跟进调度 · 北京时间每天 21:00</strong><small>{followupBeat.time}</small></div><span className={followupBeat.recent?'priority medium':'priority high'}>{followupBeat.state}</span></div>
      <div className="list-row"><div><strong>HubSpot 备用询盘补录 · 每小时检查一次</strong><small>{recoveryBeat.time}</small></div><span className={recoveryBeat.recent?'priority medium':'priority high'}>{recoveryBeat.state}</span></div>
      <p style={{color:'#667085',fontSize:13,marginTop:10}}>记录最多每 15 分钟更新一次，以减少 D1 消耗。触发成功不代表搜索找到客户、询盘已补录或邮件已发送。HubSpot 补录还需要在后台安全配置读取凭证；首次部署后暂无记录时请核对 Cloudflare Cron Triggers。</p>
    </section>
    <section className="panel" aria-label="生产环境真实业务验收">
      <div className="panel-head"><div><h2>生产验收 · 真实运行数据</h2><span>仅显示数据库已确认的结果，无法读取的数据不按 0 处理</span></div><button type="button" className="side-button" disabled={busy} onClick={()=>void load()}><RefreshCcw size={16}/>重新检查</button></div>
      {healthError&&<p className="form-status error" role="status">{healthError}</p>}
      {!health&&!healthError&&<p>生产数据检查尚未完成。</p>}
      {health&&<>
        <div className="list-row"><div><strong>官网询盘入库</strong><small>最近 24 小时新增，来自 D1 询盘表；不等于页面访问量</small></div><span>{health.inquiries?health.inquiries.last24h+' 条':'尚未建立统计表'}</span></div>
        <div className="list-row"><div><strong>历史询盘总数</strong><small>包含已处理和未处理记录</small></div><span>{health.inquiries?health.inquiries.total+' 条':'未知'}</span></div>
        <div className="list-row"><div><strong>新询盘待首次处理 · 超过 4 小时</strong><small>依据 CRM 的 NEW 状态和创建时间；不代表已核验邮件或 WhatsApp 是否回复</small></div><span>{health.inquiries?health.inquiries.newOver4h+' 条':'无法核验'}</span></div>
        <div className="list-row"><div><strong>长期待处理 · 超过 24 小时</strong><small>分别统计仍为 NEW 以及处于 REVIEWING 的询盘；只读统计，不修改客户状态</small></div><span>{health.inquiries?('NEW '+health.inquiries.newOver24h+' / REVIEWING '+health.inquiries.reviewingOver24h):'无法核验'}</span></div>
        {health.inquiries&&health.inquiries.newOver4h>0&&<p className="form-status error" role="alert">需要人工核查：{health.inquiries.newOver4h} 条新询盘建立超过 4 小时仍为 NEW，其中 {health.inquiries.newOver24h} 条超过 24 小时。请进入 <a href="/app/inquiries">询盘列表</a> 确认客户是否已联系，并更新处理状态；系统不会自动联系客户。</p>}
        {health.inquiries&&health.inquiries.reviewingOver24h>0&&<p className="form-status error" role="alert">另有 {health.inquiries.reviewingOver24h} 条询盘创建超过 24 小时仍处于 REVIEWING，请人工核实实际处理进度。这是状态提醒，并非逾期承诺或真实发送记录。</p>}
        <div className="list-row"><div><strong>询盘关联线索一致性</strong><small>只统计缺失的线索关联数量，不读取或公开客户内容</small></div><span>{health.inquiries?.orphanLeadLinks===null||health.inquiries?.orphanLeadLinks===undefined?'无法核验':health.inquiries.orphanLeadLinks===0?'全部关联正常':health.inquiries.orphanLeadLinks+' 条关联异常'}</span></div>
        {health.inquiries?.orphanLeadLinks!=null&&health.inquiries.orphanLeadLinks>0&&<p className="form-status error" role="alert">发现 {health.inquiries.orphanLeadLinks} 条询盘缺少有效销售线索关联。请人工检查，系统不会自动改写客户资料。</p>}
        <div className="list-row"><div><strong>Turnstile 机器人验证</strong><small>{health.turnstile?.enabled?'已在服务器开启，每条公开询盘都需要验证':health.turnstile?.misconfigured?'已设置启用但缺少密钥：公开询盘验证会临时不可用':health.turnstile?.configured?'密钥已配置，等待手动开启':'未启用（沿用现有限流规则）'}</small></div><span>{health.turnstile?.enabled?'验证中':health.turnstile?.misconfigured?'配置不完整':'未开启'}</span></div>
        <div className="list-row"><div><strong>HubSpot 备用补录</strong><small>{health.hubspot?.credentialConfigured?'服务端凭证已配置；还需以成功同步记录确认实际读取':'缺少服务端读取凭证，定时触发不能恢复 HubSpot 询盘'}</small></div><span>{health.hubspot?.status==='HEALTHY'?'最近同步成功':health.hubspot?.status==='STALE'?'同步已超时':health.hubspot?.status==='NEVER_SUCCEEDED'?'尚无成功同步':'补录未启用'}</span></div>
        {health.hubspot?.status!=='HEALTHY'&&<p className="form-status error" role="alert">{health.hubspot?.status==='DISABLED'?'HubSpot 备用补录未启用：必须在 Cloudflare Pages 生产环境安全配置 HUBSPOT_PRIVATE_APP_TOKEN，才能执行补录；此页面不会创建或显示密钥。':health.hubspot?.status==='STALE'?'HubSpot 备用补录最近超过 3 小时未成功，请检查授权、Provider API 和补录日志。':'HubSpot 备用补录尚无成功记录；Cron 有心跳并不等于备份完成。'}</p>}
        {health.hubspot?.lastSuccessfulPageAt&&<p style={{color:'#667085',fontSize:13}}>最近成功补录批次：{health.hubspot.lastSuccessfulPageAt}（数据库 UTC 时间）· 累计恢复 {health.hubspot.importedTotal??0} 条。</p>}
        <div className="list-row"><div><strong>HubSpot 每小时实际执行结果</strong><small>{health.hubspot?.job?.lastAttemptAt?'最近执行：'+health.hubspot.job.lastAttemptAt+'（UTC）':'还没有收到新版本的执行结果'}</small></div><span>{health.hubspot?.job?.status==='SUCCEEDED'?'已成功读取并处理一批':health.hubspot?.job?.status==='SKIPPED_NO_WORKER_KEY'?'Worker 缺少恢复服务密钥':health.hubspot?.job?.status==='SKIPPED_NO_PROVIDER_KEY'?'Pages 缺少 HubSpot 密钥':health.hubspot?.job?.status==='AUTH_FAILED'?'管理员授权失败':health.hubspot?.job?.status==='API_FAILED'?'服务接口失败':health.hubspot?.job?.status==='NETWORK_FAILED'?'网络或请求超时':'尚无执行结果'}</span></div>
        {health.hubspot?.job&&health.hubspot.job.status!=='SUCCEEDED'&&<p className="form-status error" role="alert">备用恢复没有成功完成。当前状态：{health.hubspot.job.status}；连续失败 {health.hubspot.job.consecutiveFailures} 次。{health.hubspot.job.httpStatus?'接口 HTTP '+health.hubspot.job.httpStatus+'。':''}请先修复安全配置或接口错误；系统不会因为 Cron 触发而标记成功。</p>}
        {health.hubspot?.lastBatch&&<div className="list-row"><div><strong>最近成功读取的 HubSpot 批次</strong><small>{health.hubspot.lastBatch.completedAt}（UTC）· 每次最多读取两条提交记录，下一页偏移 {health.hubspot.lastBatch.nextOffset}</small></div><span>读取 {health.hubspot.lastBatch.processed} · 新增 {health.hubspot.lastBatch.imported} · 去重 {health.hubspot.lastBatch.reused} · 跳过 {health.hubspot.lastBatch.skipped}</span></div>}
        {health.hubspot?.lastBatch?.hasMore&&<p style={{color:'#667085',fontSize:13}}>HubSpot 历史记录还有下一页，后续整点任务会继续读取。不能将本批成功视为全部历史补录完成。</p>}
        {health.hubspot?.lastBatch&&health.hubspot.lastBatch.skipped>0&&<p className="form-status error" role="alert">最近批次有 {health.hubspot.lastBatch.skipped} 条未导入：可能是视频提交、缺失授权同意、无效询盘编号或不支持的申请类型。系统不会擅自创建销售线索。</p>}
        {health.hubspot?.inventoryAudit&&<div className="list-row"><div><strong>HubSpot 历史提交只读抽查</strong><small>同一表单与密钥分别请求 limit=2 和 limit=50。最后抽查 {health.hubspot.inventoryAudit.checkedAt}（UTC）；仅记录汇总，不读取或展示客户内容</small></div><span>2条请求返回 {health.hubspot.inventoryAudit.limit2Count} · 50条请求返回 {health.hubspot.inventoryAudit.limit50Count}</span></div>}
        {health.hubspot?.inventoryAudit&&<p className="form-status" role="status">分页：limit=2 的 hasMore 为 {String(health.hubspot.inventoryAudit.limit2HasMore)}；limit=50 的 hasMore 为 {String(health.hubspot.inventoryAudit.limit50HasMore)}。这只代表当前 API 可返回的记录，不代表 HubSpot 历史累计提交全部已恢复。</p>}
        {health.hubspot?.inventoryAudit&&health.hubspot.inventoryAudit.limit50Count>health.hubspot.inventoryAudit.limit2Count&&<p className="form-status" role="status">历史分页诊断确认小页无法提供可靠分页标志，系统已改为满页自动推进。当前游标 {health.hubspot.nextOffset??'未知'}；需确认最终短页/空页才算完成扫描一轮，不能把 11 次提交都视作有效询盘。</p>}
        {health.hubspot?.qualityAudit&&<div className="panel" style={{padding:12}}>
          <strong>上次自动只读分类（前 50 条抽查）</strong>
          <p style={{fontSize:12,color:'#667085'}}>UTC {health.hubspot.qualityAudit.checkedAt} · 抽查 {health.hubspot.qualityAudit.scanned} · 格式合格 {health.hubspot.qualityAudit.eligible} · 排除 {health.hubspot.qualityAudit.excluded}。仅判断符合官网恢复条件，不能证明已入库或是全部历史提交。</p>
          {(Object.keys(auditLabels) as AuditReason[]).filter(k=>Number(health.hubspot?.qualityAudit?.reasons[k]||0)>0).map(k=><p key={k} style={{fontSize:12,margin:'4px 0'}}>{auditLabels[k]}：{health.hubspot!.qualityAudit!.reasons[k]}</p>)}
        </div>}
        <div style={{display:'flex',gap:10,alignItems:'center',margin:'12px 0'}}>
          <button type="button" className="side-button" disabled={auditBusy} onClick={()=>void auditHubspotNow()}>
            <RefreshCcw size={14}/>{auditBusy?'正在核查 HubSpot…':'即时只读核查前 50 条提交'}
          </button>
          <small style={{color:'#667085'}}>只读取 HubSpot 汇总分类；不改变恢复游标、不新增客户、不会发邮件</small>
        </div>
        {auditError&&<p className="form-status error" role="alert">{auditError}</p>}
        {auditResult&&<div className="panel" style={{padding:12}}>
          <strong>HubSpot 最新只读核查结果</strong>
          <p style={{fontSize:13}}>共检查 {auditResult.scanned} 条 · 符合恢复条件 {auditResult.eligible} 条 · 排除 {auditResult.excluded} 条</p>
          {(Object.keys(auditLabels) as AuditReason[]).filter(k=>auditResult.reasons[k]>0).map(k=><p key={k} style={{fontSize:12,margin:'5px 0'}}>{auditLabels[k]}：{auditResult.reasons[k]} 条</p>)}
          <p style={{fontSize:12,color:'#667085'}}>只报告固定理由和数量，不显示姓名、邮箱或原始表单内容。此结果是最多前 50 条提交的有效性检查，不等于补录完成。</p>
        </div>}
        <div className="list-row"><div><strong>上一批客户发现</strong><small>{health.discovery?health.discovery.status+' · 来源批次 '+health.discovery.sources+' · 来源异常 '+health.discovery.sourceFailures:'尚无可统计的搜索任务'}</small></div><span>{health.discovery?.imported!=null?'确认入库 '+health.discovery.imported+' 个':'入库数量未知'}</span></div>
        {health.discovery&&<div className="list-row"><div><strong>发现流程排查</strong><small>候选机构 {health.discovery.candidates} 个 · 已完成处理步骤 {health.discovery.stepsCompleted} · 来源受限 {health.discovery.sourceFailures} 个</small></div><span>{health.discovery.sourceFailures>0?'存在来源受限':health.discovery.candidates>0&&health.discovery.imported===0?'核验或入库待排查':'查看任务明细'}</span></div>}
        <div className="list-row"><div><strong>Cloudflare D1 免费额度</strong><small>数据库无法自行读取云平台累计行数；必须以 Cloudflare Analytics 为准</small></div><span>未接入额度遥测 · 不显示虚假余量</span></div>
        <p style={{color:'#667085',fontSize:13,marginTop:10}}>定时触发只表示 Cron 收到执行事件，不等于 HubSpot 数据同步成功；实际 D1 消耗与线上表单端到端效果需要生产环境验证。</p>
      </>}
    </section>
    <section className="metric-grid">
      <div className="metric"><span>今日已自动发送</span><strong>{metrics.sentToday}</strong><small>UTC 当日统计</small></div>
      <div className="metric"><span>待自动发送</span><strong>{metrics.ready}</strong><small>仅暖客户</small></div>
      <div className="metric"><span>待人工审核</span><strong>{metrics.reviewRequired}</strong><small>首封冷开发或超限客户</small></div>
      <div className="metric"><span>待处理样品</span><strong>{openSamples.length}</strong><small>客户回复自动生成</small></div>
    </section>

    <section className="admin-grid two-col">
      <div className="panel">
        <div className="panel-head"><h2>自动发送总开关</h2>{settings.enabled ? <PlayCircle size={20}/> : <PauseCircle size={20}/>}</div>
        <div style={{display:'grid',gap:14}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:16,padding:'14px 0',borderBottom:'1px solid #e4e7ec'}}>
            <div><strong>{settings.enabled ? '已开启' : '已暂停'}</strong><p style={{margin:'5px 0 0',color:'#667085'}}>仅控制暖客户自动跟进。冷开发始终保留人工审核。</p></div>
            <button className="button" disabled={busy} onClick={() => void update({ enabled: !settings.enabled })}>{settings.enabled ? '暂停自动发送' : '恢复自动发送'}</button>
          </div>
          <label style={{display:'grid',gap:7,fontWeight:700}}>每次定时任务最多自动发送
            <input type="number" min="1" max="20" value={settings.maxPerRun} onChange={e=>setSettings(s=>({...s,maxPerRun:Number(e.target.value)}))} style={{padding:10,border:'1px solid #d0d5dd',borderRadius:8}}/>
          </label>
          <label style={{display:'grid',gap:7,fontWeight:700}}>单个潜客最多自动发送
            <input type="number" min="1" max="5" value={settings.maxPerLead} onChange={e=>setSettings(s=>({...s,maxPerLead:Number(e.target.value)}))} style={{padding:10,border:'1px solid #d0d5dd',borderRadius:8}}/>
          </label>
          <button className="button" disabled={busy} onClick={() => void update({ maxPerRun: settings.maxPerRun, maxPerLead: settings.maxPerLead })}>保存发送上限</button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><h2>安全规则</h2><ShieldCheck size={20}/></div>
        <div style={{display:'grid',gap:12}}>
          <div className="list-row"><div><strong>冷开发必须先批准</strong><small>后端强制要求 READY 状态后 Gmail 才允许发送</small></div><span className="priority medium">强制</span></div>
          <div className="list-row"><div><strong>禁止联系立即拦截</strong><small>DO NOT CONTACT 客户不会被发送</small></div><span className="priority medium">强制</span></div>
          <div className="list-row"><div><strong>单客户发送上限</strong><small>超过上限自动转人工审核</small></div><span className="priority medium">{settings.maxPerLead} 封</span></div>
          <div className="list-row"><div><strong>每日执行时间</strong><small>Cloudflare Scheduler 每天北京时间 21:00</small></div><span className="priority medium">定时</span></div>
          <button className="button secondary" disabled={busy} onClick={() => void generateQueue()}><MailCheck size={16}/>生成 / 更新邮件审核队列</button>
        </div>
      </div>
    </section>

    {(message || error) && <div className={`form-status ${error ? 'error' : 'success'}`}><strong>{error ? '操作提示' : '操作完成'}</strong><p>{error || message}</p>{error && message && <p>{message}</p>}</div>}

    <section className="panel">
      <div className="panel-head"><div><h2>邮件审核队列</h2><span>先勾选，再批量批准或发送；发送前还会再次确认</span></div><button className="side-button" onClick={() => void load()} disabled={busy}><RefreshCcw size={16}/>{busy ? '刷新中…' : '刷新'}</button></div>

      {reviewQueue.length > 0 && <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',padding:'10px 0 14px',borderBottom:'1px solid #e4e7ec'}}>
        <label style={{display:'flex',alignItems:'center',gap:7,fontWeight:700,cursor:'pointer'}}><input type="checkbox" checked={reviewQueue.length > 0 && reviewQueue.every(row => selectedIds.includes(text(row.id,'')))} onChange={toggleSelectAll}/>全选当前 {reviewQueue.length} 封</label>
        <span style={{color:'#667085'}}>已选 {selectedRows.length} · 待批准 {selectedReviewCount} · 可发送 {selectedReadyCount}</span>
        <button className="button secondary small" disabled={busy || selectedReviewCount===0} onClick={() => void batchAction('APPROVE')}><CheckCircle2 size={14}/>批量批准</button>
        <button className="button small" disabled={busy || selectedReadyCount===0} onClick={() => void batchAction('SEND')}><Send size={14}/>批量发送已批准</button>
        <button className="button secondary small" disabled={busy || selectedRows.length===0} onClick={() => void batchAction('SKIP')}><X size={14}/>批量跳过</button>
      </div>}

      {reviewQueue.length === 0 && <div className="empty-row">当前没有待审核或待发送邮件。点击“生成 / 更新邮件审核队列”创建草稿。</div>}
      {reviewQueue.map((row,i)=>{
        const id = text(row.id,String(i));
        const status = text(row.status,'');
        return <div key={id} style={{padding:'16px 0',borderBottom:'1px solid #e4e7ec',display:'grid',gap:10}}>
          <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'flex-start'}}>
            <div style={{display:'flex',gap:10,alignItems:'flex-start'}}>
              <input type="checkbox" checked={selectedIds.includes(id)} onChange={() => toggleSelected(id)} style={{marginTop:3}}/>
              <div><strong>{text(row.company)} · {queueTypeLabel(row.queue_type)}</strong><p style={{margin:'5px 0 0',color:'#667085'}}>{text(row.email)} · {statusLabel(row.status)} · 评分 {text(row.lead_score,'0')}</p></div>
            </div>
            <span className="priority medium">{statusLabel(row.status)}</span>
          </div>
          <div><strong style={{display:'block',marginBottom:5}}>主题：{text(row.subject)}</strong><details><summary style={{cursor:'pointer',color:'#475467'}}>预览邮件正文</summary><pre style={{whiteSpace:'pre-wrap',fontFamily:'inherit',lineHeight:1.65,background:'#f8fafc',padding:12,borderRadius:8,marginTop:8}}>{text(row.body,'')}</pre></details></div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            {status === 'REVIEW_REQUIRED' && <button className="button secondary small" disabled={rowBusy===id} onClick={() => void queueAction(id,'APPROVE')}><CheckCircle2 size={14}/>批准</button>}
            {status === 'FAILED' && <button className="button secondary small" disabled={rowBusy===id} onClick={() => void queueAction(id,'RETRY')}><RefreshCcw size={14}/>重试并回到待发送</button>}
            {status === 'READY' && <button className="button small" disabled={rowBusy===id} onClick={() => void queueAction(id,'SEND')}><Send size={14}/>{rowBusy===id ? '处理中…' : '立即发送'}</button>}
            <button className="button secondary small" disabled={rowBusy===id} onClick={() => void queueAction(id,'DELAY')}><Clock3 size={14}/>延期3天</button>
            <button className="button secondary small" disabled={rowBusy===id} onClick={() => void queueAction(id,'SKIP')}><X size={14}/>跳过</button>
          </div>
        </div>;
      })}
    </section>

    <section className="panel">
      <div className="panel-head"><div><h2>样品申请</h2><span>客户回复 sample / try / demo 后自动创建</span></div><PackageCheck size={20}/></div>
      {openSamples.length === 0 && <div className="empty-row">当前没有待处理样品申请。</div>}
      {openSamples.map((row,i)=>{
        const id = text(row.id,String(i));
        const draft = sampleDrafts[id] || sampleDraftFromRow(row);
        return <div key={id} style={{padding:'16px 0',borderBottom:'1px solid #e4e7ec',display:'grid',gap:10}}>
          <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'flex-start'}}>
            <div><strong>{text(row.reference)} · {text(row.customer)}</strong><p style={{margin:'5px 0 0',color:'#667085'}}>数量 {text(row.quantity,'1')} · {text(row.email,'无邮箱')} · {text(row.phone || row.whatsapp,'无电话')}</p></div>
            <span className="priority high">{sampleStatusLabel(row.status)}</span>
          </div>
          <details>
            <summary style={{cursor:'pointer',color:'#475467'}}>编辑样品状态 / 地址 / 物流</summary>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:10,marginTop:12}}>
              <label style={{display:'grid',gap:6,fontWeight:700}}>状态<select value={draft.status} onChange={e=>updateSampleDraft(id,{status:e.target.value})} style={{padding:9,border:'1px solid #d0d5dd',borderRadius:8}}>{sampleStatuses.map(s=><option key={s} value={s}>{sampleStatusLabel(s)}</option>)}</select></label>
              <label style={{display:'grid',gap:6,fontWeight:700}}>物流商<input value={draft.carrier} onChange={e=>updateSampleDraft(id,{carrier:e.target.value})} placeholder="USPS / UPS / FedEx..." style={{padding:9,border:'1px solid #d0d5dd',borderRadius:8}}/></label>
              <label style={{display:'grid',gap:6,fontWeight:700}}>运单号<input value={draft.trackingNumber} onChange={e=>updateSampleDraft(id,{trackingNumber:e.target.value})} style={{padding:9,border:'1px solid #d0d5dd',borderRadius:8}}/></label>
              <label style={{display:'grid',gap:6,fontWeight:700}}>样品成本<input type="number" min="0" step="0.01" value={draft.costAmount} onChange={e=>updateSampleDraft(id,{costAmount:e.target.value})} style={{padding:9,border:'1px solid #d0d5dd',borderRadius:8}}/></label>
              <label style={{display:'grid',gap:6,fontWeight:700}}>币种<input value={draft.currency} onChange={e=>updateSampleDraft(id,{currency:e.target.value.toUpperCase()})} style={{padding:9,border:'1px solid #d0d5dd',borderRadius:8}}/></label>
              <label style={{display:'grid',gap:6,fontWeight:700,gridColumn:'1 / -1'}}>收货地址<input value={draft.shippingAddress} onChange={e=>updateSampleDraft(id,{shippingAddress:e.target.value})} placeholder="客户确认后填写完整地址" style={{padding:9,border:'1px solid #d0d5dd',borderRadius:8}}/></label>
            </div>
            <div style={{marginTop:10,display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
              <button className="button small" disabled={sampleBusy===id} onClick={() => void saveSample(id)}><CheckCircle2 size={14}/>{sampleBusy===id ? '保存中…' : '保存样品进度'}</button>
              {Boolean(row.follow_up_at) && <span style={{color:'#667085'}}>计划回访：{zhDate(row.follow_up_at)}</span>}
            </div>
          </details>
        </div>;
      })}
    </section>

    <section className="panel">
      <div className="panel-head"><h2>最近自动化邮件</h2><Activity size={20}/></div>
      {recent.length === 0 && <div className="empty-row">目前还没有邮件队列记录。</div>}
      {recent.map((row,i)=><div className="activity" key={text(row.id,String(i))}><span/><div><strong>{text(row.company)} · {text(row.subject)}</strong><p>{text(row.email)} · {statusLabel(row.status)}</p></div><small>{zhDate(row.sent_at || row.updated_at)}</small></div>)}
    </section>

    <section className="panel">
      <div className="panel-head"><h2>当前策略</h2><Activity size={20}/></div>
      <p style={{margin:0,lineHeight:1.7,color:'#475467'}}>系统先生成首封和到期跟进草稿。新发现的冷客户必须先人工批准，后端才允许发送；暖客户只有在总开关开启且未超过发送上限时，才允许 Scheduler 自动跟进。客户一旦回复，Gmail 同步会自动停止未发送的后续队列，并把报价或样品意向转换成结构化销售动作。</p>
      <div style={{marginTop:12,display:'flex',gap:8,alignItems:'center',color:'#027a48',fontWeight:700}}><MailCheck size={18}/>累计已发送 {metrics.sentTotal} 封队列邮件</div>
    </section>
  </div>;
}