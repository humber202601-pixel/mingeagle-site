import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { priorityLabel, systemText, zhDate } from './adminI18n';
import { prioritizeB2BTasks } from './b2bTaskSort';

type Row = Record<string, unknown>;
type Props = { tasks: Row[]; inquiries: Row[]; accessKey: string; onChanged: () => void };

const text = (value: unknown, fallback = '—') => value === null || value === undefined || value === '' ? fallback : String(value);

export default function TaskManager({ tasks, inquiries, accessKey, onChanged }: Props) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [cleanupCount, setCleanupCount] = useState<number | null>(null);
  const [cleanupBusy, setCleanupBusy] = useState(false);
  // WEBSITE inquiries and their quote follow-ups outrank prospecting reminders.
  // Sorting never modifies task state or triggers outreach.
  const orderedTasks=useMemo(()=>prioritizeB2BTasks(tasks),[tasks]);

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
    <p className="auto-discovery-help">自动排序：官网主动询盘及其报价任务优先；其次其他客户回复和报价；公开来源开发跟进靠后。组内按优先级及截止日期排列。</p>
    <details className="task-test-cleanup"><summary>清理剩余测试待办（test com / QA TEST，安全归档）</summary>
      <p>仅处理 2026 年 10 月 12 日之前创建，关联 test com 或 MING EAGLE QA TEST - DO NOT CONTACT 的未完成任务。不删除客户、邮件、询盘、报价或真实客户记录。</p>
      <button className="table-action" disabled={cleanupBusy} onClick={()=>void previewCleanup()}>预览可归档数量</button>
      {cleanupCount!==null&&<p>符合条件：{cleanupCount} 项。{cleanupCount>0&&<button className="table-action" disabled={cleanupBusy} onClick={()=>void archiveCleanup()}>确认归档这些测试任务</button>}</p>}
    </details>
    {tasks.length === 0 && <div className="empty-row">当前没有待处理跟进任务。</div>}
    {orderedTasks.map((task, index) => {
      const id = text(task.id, `task-${index}`);
      const isQuoteTask = /quote|quotation|报价|批发询盘/i.test(String(task.title || '') + ' ' + String(task.type || ''));
      const matchedInquiry = isQuoteTask ? inquiries.find(i =>
        String(i.lead_id || '') !== '' && String(i.lead_id) === String(task.lead_id || '') &&
        ['NEW','REVIEWING','RESPONDED','QUALIFIED'].includes(String(i.status || ''))) : undefined;
      const quoteHref = matchedInquiry ? '/app/quotes?inquiry=' + encodeURIComponent(String(matchedInquiry.reference || '')) : '';
      const relevantInquiry = isQuoteTask && task.lead_id
        ? inquiries.find(i=>String(i.lead_id||'')===String(task.lead_id)) : undefined;
      const inquiryHref = relevantInquiry ? '/app/inquiries/' + encodeURIComponent(String(relevantInquiry.id||'')) : '';
      return <div className="task-row" key={id}>
        <div className="task-main"><strong>{systemText(task.title)}</strong><p>{systemText(task.description)}</p><small>{task.lead_source==='WEBSITE'?'官网主动询盘 · ':task.lead_source==='DISCOVERY'?'公开来源候选 · ':''}{text(task.related_to)} · 截止 {zhDate(task.due_at)}</small></div>
        <span className={`priority ${text(task.priority).toLowerCase()}`}>{priorityLabel(task.priority)}</span>
        <div className="task-actions">
          {quoteHref && <Link className="table-action primary" to={quoteHref}>打开对应询盘并报价</Link>}
          {!quoteHref && inquiryHref && <Link className="table-action" to={inquiryHref}>查看关联询盘</Link>}
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
