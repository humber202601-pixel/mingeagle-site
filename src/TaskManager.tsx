import { useState } from 'react';

type Row = Record<string, unknown>;
type Props = { tasks: Row[]; accessKey: string; onChanged: () => void };

const text = (value: unknown, fallback = '—') => value === null || value === undefined || value === '' ? fallback : String(value);
const date = (value: unknown) => value ? new Date(String(value).replace(' ', 'T') + (String(value).includes('Z') ? '' : 'Z')).toLocaleString() : '—';

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
      if (!response.ok || !body.ok) throw new Error(body.error || 'Unable to update task.');
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update task.');
    } finally {
      setBusy('');
    }
  }

  return <section className="panel task-manager">
    <div className="panel-head"><h2>Open follow-ups</h2><span>{tasks.length} active tasks</span></div>
    {tasks.length === 0 && <div className="empty-row">No open follow-ups.</div>}
    {tasks.map((task, index) => {
      const id = text(task.id, `task-${index}`);
      return <div className="task-row" key={id}>
        <div className="task-main"><strong>{text(task.title)}</strong><p>{text(task.description, '')}</p><small>{text(task.related_to)} · Due {date(task.due_at)}</small></div>
        <span className={`priority ${text(task.priority).toLowerCase()}`}>{text(task.priority)}</span>
        <div className="task-actions">
          {text(task.status) === 'OPEN' && <button className="table-action" disabled={busy !== ''} onClick={() => void act(id, 'START')}>Start</button>}
          <button className="table-action" disabled={busy !== ''} onClick={() => void act(id, 'SNOOZE_3')}>+3 days</button>
          <button className="table-action" disabled={busy !== ''} onClick={() => void act(id, 'SNOOZE_7')}>+7 days</button>
          <button className="table-action primary" disabled={busy !== ''} onClick={() => void act(id, 'COMPLETE')}>Done</button>
        </div>
      </div>;
    })}
    {error && <div className="form-status error"><strong>Could not update follow-up.</strong><p>{error}</p></div>}
  </section>;
}
