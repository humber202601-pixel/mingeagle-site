import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, MailCheck, PauseCircle, PlayCircle, RefreshCcw, ShieldCheck } from 'lucide-react';
import { zhDate } from './adminI18n';

type Row = Record<string, unknown>;
type Settings = { enabled: boolean; maxPerRun: number; maxPerLead: number; updatedAt?: string | null };
type Metrics = { sentToday: number; ready: number; reviewRequired: number; failed: number; sentTotal: number };
type ResponseData = { ok?: boolean; settings?: Settings; metrics?: Metrics; recent?: Row[]; error?: string };

const emptySettings: Settings = { enabled: true, maxPerRun: 5, maxPerLead: 3 };
const emptyMetrics: Metrics = { sentToday: 0, ready: 0, reviewRequired: 0, failed: 0, sentTotal: 0 };
const text = (value: unknown, fallback = '—') => value === null || value === undefined || value === '' ? fallback : String(value);

function statusLabel(status: unknown) {
  const value = text(status, '');
  return ({ READY: '待自动发送', REVIEW_REQUIRED: '待人工审核', FAILED: '发送失败', SENT: '已发送', SKIPPED: '已跳过' } as Record<string,string>)[value] || value || '未知';
}

export default function AutomationCenter({ accessKey }: { accessKey: string }) {
  const [settings, setSettings] = useState<Settings>(emptySettings);
  const [metrics, setMetrics] = useState<Metrics>(emptyMetrics);
  const [recent, setRecent] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const headers = useMemo(() => ({ 'content-type': 'application/json', 'x-admin-key': accessKey }), [accessKey]);

  const load = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/admin/automation-control', { headers: { 'x-admin-key': accessKey } });
      const body = await response.json() as ResponseData;
      if (!response.ok || !body.ok) throw new Error(body.error || '无法加载自动化设置。');
      setSettings(body.settings || emptySettings);
      setMetrics(body.metrics || emptyMetrics);
      setRecent(body.recent || []);
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

  return <div>
    <section className="metric-grid">
      <div className="metric"><span>今日已自动发送</span><strong>{metrics.sentToday}</strong><small>UTC 当日统计</small></div>
      <div className="metric"><span>待自动发送</span><strong>{metrics.ready}</strong><small>暖客户队列</small></div>
      <div className="metric"><span>待人工审核</span><strong>{metrics.reviewRequired}</strong><small>冷开发或超限客户</small></div>
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
          {message && <div className="form-status"><strong>{message}</strong></div>}
          {error && <div className="form-status error"><strong>{error}</strong></div>}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><h2>安全规则</h2><ShieldCheck size={20}/></div>
        <div style={{display:'grid',gap:12}}>
          <div className="list-row"><div><strong>冷开发不自动发送</strong><small>必须人工批准后才能进入发送队列</small></div><span className="priority medium">强制</span></div>
          <div className="list-row"><div><strong>禁止联系立即拦截</strong><small>DO NOT CONTACT 客户不会被定时发送</small></div><span className="priority medium">强制</span></div>
          <div className="list-row"><div><strong>单客户发送上限</strong><small>超过上限自动转人工审核</small></div><span className="priority medium">{settings.maxPerLead} 封</span></div>
          <div className="list-row"><div><strong>每日执行时间</strong><small>Cloudflare Scheduler 每天北京时间 21:00</small></div><span className="priority medium">定时</span></div>
          <a className="button secondary" href="/email-queue.html">打开完整邮件队列</a>
        </div>
      </div>
    </section>

    <section className="panel">
      <div className="panel-head"><h2>最近自动化邮件</h2><button className="side-button" onClick={() => void load()} disabled={busy}><RefreshCcw size={16}/>{busy ? '刷新中…' : '刷新'}</button></div>
      {recent.length === 0 && <div className="empty-row">目前还没有邮件队列记录。</div>}
      {recent.map((row,i)=><div className="activity" key={text(row.id,String(i))}><span/><div><strong>{text(row.company)} · {text(row.subject)}</strong><p>{text(row.email)} · {statusLabel(row.status)}</p></div><small>{zhDate(row.sent_at || row.updated_at)}</small></div>)}
    </section>

    <section className="panel">
      <div className="panel-head"><h2>当前策略</h2><Activity size={20}/></div>
      <p style={{margin:0,lineHeight:1.7,color:'#475467'}}>系统先扫描到期客户，再区分暖客户和冷开发。暖客户在总开关开启时可自动发送；冷开发始终进入人工审核。每次发送成功都会写入 CRM，并把下一次跟进时间顺延 3 天。</p>
      <div style={{marginTop:12,display:'flex',gap:8,alignItems:'center',color:'#027a48',fontWeight:700}}><MailCheck size={18}/>累计已发送 {metrics.sentTotal} 封队列邮件</div>
    </section>
  </div>;
}
