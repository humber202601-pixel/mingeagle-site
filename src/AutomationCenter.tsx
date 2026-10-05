import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, CheckCircle2, Clock3, MailCheck, PauseCircle, PlayCircle, RefreshCcw, Send, ShieldCheck, X } from 'lucide-react';
import { zhDate } from './adminI18n';

type Row = Record<string, unknown>;
type Settings = { enabled: boolean; maxPerRun: number; maxPerLead: number; updatedAt?: string | null };
type Metrics = { sentToday: number; ready: number; reviewRequired: number; failed: number; sentTotal: number };
type ResponseData = { ok?: boolean; settings?: Settings; metrics?: Metrics; recent?: Row[]; error?: string };
type QueueData = { ok?: boolean; rows?: Row[]; counts?: Row[]; error?: string; reviewed?: number; created?: number; initialCreated?: number; followupCreated?: number };

const emptySettings: Settings = { enabled: true, maxPerRun: 5, maxPerLead: 3 };
const emptyMetrics: Metrics = { sentToday: 0, ready: 0, reviewRequired: 0, failed: 0, sentTotal: 0 };
const text = (value: unknown, fallback = '—') => value === null || value === undefined || value === '' ? fallback : String(value);

function statusLabel(status: unknown) {
  const value = text(status, '');
  return ({ READY: '已批准 / 待发送', REVIEW_REQUIRED: '待人工审核', FAILED: '发送失败', SENT: '已发送', SKIPPED: '已跳过' } as Record<string,string>)[value] || value || '未知';
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

export default function AutomationCenter({ accessKey }: { accessKey: string }) {
  const [settings, setSettings] = useState<Settings>(emptySettings);
  const [metrics, setMetrics] = useState<Metrics>(emptyMetrics);
  const [recent, setRecent] = useState<Row[]>([]);
  const [queue, setQueue] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const headers = useMemo(() => ({ 'content-type': 'application/json', 'x-admin-key': accessKey }), [accessKey]);

  const load = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const [automationResponse, queueResponse] = await Promise.all([
        fetch('/api/admin/automation-control', { headers: { 'x-admin-key': accessKey } }),
        fetch('/api/admin/email-queue', { headers: { 'x-admin-key': accessKey } }),
      ]);
      const body = await automationResponse.json() as ResponseData;
      const queueBody = await queueResponse.json() as QueueData;
      if (!automationResponse.ok || !body.ok) throw new Error(body.error || '无法加载自动化设置。');
      if (!queueResponse.ok || !queueBody.ok) throw new Error(queueBody.error || '无法加载邮件队列。');
      setSettings(body.settings || emptySettings);
      setMetrics(body.metrics || emptyMetrics);
      setRecent(body.recent || []);
      setQueue(queueBody.rows || []);
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

  async function queueAction(queueId: string, action: 'APPROVE'|'SEND'|'DELAY'|'SKIP'|'RETRY') {
    setRowBusy(queueId); setError(''); setMessage('');
    try {
      const payload: Record<string, unknown> = { action, queueId };
      if (action === 'DELAY') payload.days = 3;
      const response = await fetch('/api/admin/email-queue', { method:'POST', headers, body:JSON.stringify(payload) });
      const body = await response.json() as { ok?: boolean; error?: string; to?: string };
      if (!response.ok || !body.ok) throw new Error(body.error || '邮件队列操作失败。');
      const labels: Record<string,string> = {
        APPROVE:'草稿已批准。冷开发仍不会自动发送，可继续点击“立即发送”。',
        SEND:`邮件已通过 Gmail 真实发送${body.to ? `至 ${body.to}` : ''}。`,
        DELAY:'已延期 3 天。',
        SKIP:'已跳过该邮件。',
        RETRY:'已重新进入待发送状态。',
      };
      setMessage(labels[action]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '邮件队列操作失败。');
    } finally { setRowBusy(''); }
  }

  const reviewQueue = useMemo(() => queue.filter(row => ['REVIEW_REQUIRED','READY','FAILED'].includes(text(row.status,''))).slice(0,30), [queue]);

  return <div>
    <section className="metric-grid">
      <div className="metric"><span>今日已自动发送</span><strong>{metrics.sentToday}</strong><small>UTC 当日统计</small></div>
      <div className="metric"><span>待自动发送</span><strong>{metrics.ready}</strong><small>仅暖客户</small></div>
      <div className="metric"><span>待人工审核</span><strong>{metrics.reviewRequired}</strong><small>首封冷开发或超限客户</small></div>
      <div className="metric"><span>发送失败</span><strong>{metrics.failed}</strong><small>需要人工查看</small></div>
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
          <div className="list-row"><div><strong>冷开发不自动发送</strong><small>首封始终进入人工审核，auto_eligible=0</small></div><span className="priority medium">强制</span></div>
          <div className="list-row"><div><strong>禁止联系立即拦截</strong><small>DO NOT CONTACT 客户不会被发送</small></div><span className="priority medium">强制</span></div>
          <div className="list-row"><div><strong>单客户发送上限</strong><small>超过上限自动转人工审核</small></div><span className="priority medium">{settings.maxPerLead} 封</span></div>
          <div className="list-row"><div><strong>每日执行时间</strong><small>Cloudflare Scheduler 每天北京时间 21:00</small></div><span className="priority medium">定时</span></div>
          <button className="button secondary" disabled={busy} onClick={() => void generateQueue()}><MailCheck size={16}/>生成 / 更新邮件审核队列</button>
        </div>
      </div>
    </section>

    {(message || error) && <div className={`form-status ${error ? 'error' : 'success'}`}><strong>{error ? '操作失败' : '操作完成'}</strong><p>{error || message}</p></div>}

    <section className="panel">
      <div className="panel-head"><div><h2>邮件审核队列</h2><span>首封冷开发必须人工审核后发送</span></div><button className="side-button" onClick={() => void load()} disabled={busy}><RefreshCcw size={16}/>{busy ? '刷新中…' : '刷新'}</button></div>
      {reviewQueue.length === 0 && <div className="empty-row">当前没有待审核或待发送邮件。点击“生成 / 更新邮件审核队列”创建草稿。</div>}
      {reviewQueue.map((row,i)=><div key={text(row.id,String(i))} style={{padding:'16px 0',borderBottom:'1px solid #e4e7ec',display:'grid',gap:10}}>
        <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'flex-start'}}>
          <div><strong>{text(row.company)} · {queueTypeLabel(row.queue_type)}</strong><p style={{margin:'5px 0 0',color:'#667085'}}>{text(row.email)} · {statusLabel(row.status)} · 评分 {text(row.lead_score,'0')}</p></div>
          <span className="priority medium">{statusLabel(row.status)}</span>
        </div>
        <div><strong style={{display:'block',marginBottom:5}}>主题：{text(row.subject)}</strong><details><summary style={{cursor:'pointer',color:'#475467'}}>预览邮件正文</summary><pre style={{whiteSpace:'pre-wrap',fontFamily:'inherit',lineHeight:1.65,background:'#f8fafc',padding:12,borderRadius:8,marginTop:8}}>{text(row.body,'')}</pre></details></div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          {text(row.status,'') === 'REVIEW_REQUIRED' && <button className="button secondary small" disabled={rowBusy===text(row.id,'')} onClick={() => void queueAction(text(row.id,''),'APPROVE')}><CheckCircle2 size={14}/>批准</button>}
          {text(row.status,'') === 'FAILED' && <button className="button secondary small" disabled={rowBusy===text(row.id,'')} onClick={() => void queueAction(text(row.id,''),'RETRY')}><RefreshCcw size={14}/>重试</button>}
          <button className="button small" disabled={rowBusy===text(row.id,'')} onClick={() => void queueAction(text(row.id,''),'SEND')}><Send size={14}/>{rowBusy===text(row.id,'') ? '处理中…' : '立即发送'}</button>
          <button className="button secondary small" disabled={rowBusy===text(row.id,'')} onClick={() => void queueAction(text(row.id,''),'DELAY')}><Clock3 size={14}/>延期3天</button>
          <button className="button secondary small" disabled={rowBusy===text(row.id,'')} onClick={() => void queueAction(text(row.id,''),'SKIP')}><X size={14}/>跳过</button>
        </div>
      </div>)}
    </section>

    <section className="panel">
      <div className="panel-head"><h2>最近自动化邮件</h2><Activity size={20}/></div>
      {recent.length === 0 && <div className="empty-row">目前还没有邮件队列记录。</div>}
      {recent.map((row,i)=><div className="activity" key={text(row.id,String(i))}><span/><div><strong>{text(row.company)} · {text(row.subject)}</strong><p>{text(row.email)} · {statusLabel(row.status)}</p></div><small>{zhDate(row.sent_at || row.updated_at)}</small></div>)}
    </section>

    <section className="panel">
      <div className="panel-head"><h2>当前策略</h2><Activity size={20}/></div>
      <p style={{margin:0,lineHeight:1.7,color:'#475467'}}>系统先生成首封和到期跟进草稿。新发现的冷客户始终进入人工审核，不会被定时任务自动发送；暖客户只有在总开关开启且未超过发送上限时，才允许 Scheduler 自动跟进。客户一旦回复，Gmail 同步会自动停止未发送的后续队列。</p>
      <div style={{marginTop:12,display:'flex',gap:8,alignItems:'center',color:'#027a48',fontWeight:700}}><MailCheck size={18}/>累计已发送 {metrics.sentTotal} 封队列邮件</div>
    </section>
  </div>;
}
