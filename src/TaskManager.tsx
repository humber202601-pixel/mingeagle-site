import { useMemo, useState } from 'react';
import { priorityLabel, systemText, zhDate } from './adminI18n';

type Row = Record<string, unknown>;
type Props = { tasks: Row[]; accessKey: string; onChanged: () => void };

const text = (value: unknown, fallback = '—') => value === null || value === undefined || value === '' ? fallback : String(value);

export default function TaskManager({ tasks, accessKey, onChanged }: Props) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [cleanupCount, setCleanupCount] = useState<number | null>(null);
  const [cleanupBusy, setCleanupBusy] = useState(false);
  // Put actionable customer replies, quotes and sample requests ahead of routine reminders.
  // Within each group, higher CRM priority and older deadlines come first.
  const orderedTasks = useMemo(() => {
    const category = (row: Row) => {
      const type = String(row.type || '').toUpperCase();
      const title = String(row.title || '').toLowerCase();
      if (type === 'REPLY_ACTION' || /reply to customer|respond to customer|prepare customer quotation|confirm sample|审核批发询盘|审核并发送报价|customer quotation|sample request|客户报价|审核并发送询盘/.test(title)) return 0;
      if (type === 'OUTREACH_FOLLOW_UP' || /follow up customer email|follow up sent email/i.test(title)) return 2;
      return 1;
    };
    const priority = (row: Row) => ({URGENT:0,HIGH:1,MEDIUM:2,LOW:3}[String(row.priority||'MEDIUM').toUpperCase() as 'URGENT'|'HIGH'|'MEDIUM'|'LOW'] ?? 2);
    const due = (row: Row) => {
      const n = Date.parse(String(row.due_at || ''));
      return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
    };
    return [...tasks].sort((a,b) => category(a)-category(b) || priority(a)-priority(b) || due(a)-due(b));
  }, [tasks]);

  async function act(taskId: string, action: string) {
    setBusy(`${taskId}:${action}`);
    setError('');
    try {
      const response = await fetch('/api/admin/task-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': accessKey },
        body: JSON.stringify({ taskId, action }),
      });
      const body = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !body.ok) throw new Error(body.error || '无法更新跟进任务。');
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法更新跟进任务。');
    } finally {
      setBusy('');
    }
  }

  async function previewCleanup(){
    setCleanupBusy(true);setError('');
    try{
      const r=await fetch('/api/admin/test-task-cleanup',{headers:{'x-admin-key':accessKey},cache:'no-store'});
      const body=await r.json() as {ok?:boolean;count?:number;error?:string};
      if(!r.ok||!body.ok)throw new Error(body.error||'无法预览测试任务');
      setCleanupCount(Number(body.count||0));
    }catch(e){setError(e instanceof Error?e.message:'无法预览测试任务');}
    finally{setCleanupBusy(false);}
  }
  async function archiveCleanup(){
    if(cleanupCount===null||cleanupCount<1)return;
    if(!window.confirm(`确认归档 ${cleanupCount} 项明确标记为测试客户的遗留待办？不会删除客户、邮件或报价。`))return;
    setCleanupBusy(true);setError('');
    try{
      const r=await fetch('/api/admin/test-task-cleanup',{method:'POST',headers:{'Content-Type':'application/json','x-admin-key':accessKey},body:JSON.stringify({confirm:'ARCHIVE_NAMED_TEST_TASKS_PHASE2'})});
      const body=await r.json() as {ok?:boolean;archived?:number;error?:string};
      if(!r.ok||!body.ok)throw new Error(body.error||'归档失败');
      setCleanupCount(null);onChanged();
    }catch(e){setError(e instanceof Error?e.message:'归档失败');}
    finally{setCleanupBusy(false);}
  }
  return <section className="panel task-manager">
    <div className="panel-head"><h2>待处理跟进任务</h2><span>当前 {tasks.length} 项</span></div>
    <p className="auto-discovery-help">自动排序：客户回复、报价与样品需求优先；其次其他业务任务；常规催促邮件靠后。同类任务按优先级和截止时间排列。</p>
    <details className="task-test-cleanup"><summary>清理剩余测试待办（test com / QA TEST，安全归档）</summary>
      <p>仅处理 2026 年 10 月 12 日之前创建，关联 test com 或 MING EAGLE QA TEST - DO NOT CONTACT 的未完成任务。不删除客户、邮件、询盘、报价或真实客户记录。</p>
      <button className="table-action" disabled={cleanupBusy} onClick={()=>void previewCleanup()}>预览可归档数量</button>
      {cleanupCount!==null&&<p>符合条件：{cleanupCount} 项。{cleanupCount>0&&<button className="table-action" disabled={cleanupBusy} onClick={()=>void archiveCleanup()}>确认归档这些测试任务</button>}</p>}
    </details>
    {tasks.length === 0 && <div className="empty-row">当前没有待处理跟进任务。</div>}
    {orderedTasks.map((task, index) => {
      const id = text(task.id, `task-${index}`);
      return <div className="task-row" key={id}>
        <div className="task-main"><strong>{systemText(task.title)}</strong><p>{systemText(task.description)}</p><small>{text(task.related_to)} · 截止 {zhDate(task.due_at)}</small></div>
        <span className={`priority ${text(task.priority).toLowerCase()}`}>{priorityLabel(task.priority)}</span>
        <div className="task-actions">
          {text(task.status) === 'OPEN' && <button className="table-action" disabled={busy !== ''} onClick={() => void act(id, 'START')}>开始处理</button>}
          <button className="table-action" disabled={busy !== ''} onClick={() => void act(id, 'SNOOZE_3')}>延后 3 天</button>
          <button className="table-action" disabled={busy !== ''} onClick={() => void act(id, 'SNOOZE_7')}>延后 7 天</button>
          <button className="table-action primary" disabled={busy !== ''} onClick={() => void act(id, 'COMPLETE')}>标记完成</button>
        </div>
      </div>;
    })}
    {error && <div className="form-status error"><strong>更新跟进任务失败</strong><p>{error}</p></div>}
  </section>;
}
