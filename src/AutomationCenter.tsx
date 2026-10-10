import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, CheckCircle2, Clock3, MailCheck, PackageCheck, PauseCircle, PlayCircle, RefreshCcw, Send, ShieldCheck, X } from 'lucide-react';
import { zhDate } from './adminI18n';

type Row = Record<string, unknown>;
type Settings = { enabled: boolean; maxPerRun: number; maxPerLead: number; updatedAt?: string | null };
type Metrics = { sentToday: number; ready: number; reviewRequired: number; failed: number; sentTotal: number };
type SchedulerRow = { id:string; cron:string; last_seen_at:string };
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
      const [automationResponse, queueResponse, samplesResponse] = await Promise.all([
        fetch('/api/admin/automation-control', { headers: { 'x-admin-key': accessKey } }),
        fetch('/api/admin/email-queue', { headers: { 'x-admin-key': accessKey } }),
        fetch('/api/admin/samples', { headers: { 'x-admin-key': accessKey } }),
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
      setQueue(queueBody.rows || []);
      const nextSamples = samplesBody.samples || [];
      setSamples(nextSamples);
      setSampleDrafts(Object.fromEntries(nextSamples.map(row => [text(row.id,''), sampleDraftFromRow(row)])));
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法加载自动化设置。');
    } finally { setBusy(false); }
  }, [accessKey]);

  useEffect(() => { void load(); }, [load]);

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

  const heartbeatDisplay = (kind: 'DISCOVERY' | 'FOLLOWUP') => {
    const row=scheduler.find(item=>item.id===kind);
    if(!row)return {state:'未观察到执行记录',time:'—',recent:false};
    const date=new Date(row.last_seen_at.replace(' ','T')+'Z');
    if(Number.isNaN(date.getTime()))return {state:'记录时间无效',time:'—',recent:false};
    const age=Date.now()-date.getTime(),windowMs=kind==='DISCOVERY'?30*60*1000:26*60*60*1000;
    return {state:age>=0&&age<=windowMs?'最近有触发':'触发记录可能过期',time:date.toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})+'（北京时间）',recent:age>=0&&age<=windowMs};
  };
  const discoveryBeat=heartbeatDisplay('DISCOVERY'),followupBeat=heartbeatDisplay('FOLLOWUP');

  return <div>
    <section className="panel" aria-label="定时任务真实运行记录">
      <div className="panel-head"><div><h2>定时任务触发记录</h2><span>只有 Worker 实际收到 Cron Trigger 才会产生记录</span></div><button type="button" className="side-button" disabled={busy} onClick={()=>void load()}><RefreshCcw size={16}/>刷新状态</button></div>
      <div className="list-row"><div><strong>客户发现续跑 · 每分钟检查一次</strong><small>{discoveryBeat.time}</small></div><span className={discoveryBeat.recent?'priority medium':'priority high'}>{discoveryBeat.state}</span></div>
      <div className="list-row"><div><strong>客户跟进调度 · 北京时间每天 21:00</strong><small>{followupBeat.time}</small></div><span className={followupBeat.recent?'priority medium':'priority high'}>{followupBeat.state}</span></div>
      <p style={{color:'#667085',fontSize:13,marginTop:10}}>记录最多每 15 分钟更新一次，以减少 D1 消耗。触发成功不代表搜索找到客户或邮件已发送；首次部署后暂无记录时请核对 Cloudflare Cron Triggers。</p>
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