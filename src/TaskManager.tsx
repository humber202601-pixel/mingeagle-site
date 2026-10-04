import { useState } from 'react';
import { priorityLabel, systemText, zhDate } from './adminI18n';

type Row = Record<string, unknown>;
type Props = { tasks: Row[]; accessKey: string; onChanged: () => void };

const text = (value: unknown, fallback = '—') => value === null || value === undefined || value === '' ? fallback : String(value);

export default function TaskManager({ tasks, accessKey, onChanged }: Props) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

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

  return <section className="panel task-manager">
    <div className="panel-head"><h2>待处理跟进任务</h2><span>当前 {tasks.length} 项</span></div>
    {tasks.length === 0 && <div className="empty-row">当前没有待处理跟进任务。</div>}
    {tasks.map((task, index) => {
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
