interface Env {
  MINGEAGLE_DB: D1Database;
}

type TaskAction = 'START' | 'COMPLETE' | 'SNOOZE_3' | 'SNOOZE_7';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.MINGEAGLE_DB) return Response.json({ ok: false, error: 'Database is not configured.' }, { status: 503 });

  try {
    const body = await request.json() as { taskId?: string; action?: TaskAction };
    const taskId = typeof body.taskId === 'string' ? body.taskId.trim() : '';
    const action = body.action;
    if (!taskId || !action) return Response.json({ ok: false, error: 'Task and action are required.' }, { status: 400 });

    const db = env.MINGEAGLE_DB;
    const task = await db.prepare(`SELECT id, title, status, lead_id, company_id, contact_id, order_id FROM tasks WHERE id=? LIMIT 1`)
      .bind(taskId).first<Record<string, unknown>>();
    if (!task) return Response.json({ ok: false, error: 'Task not found.' }, { status: 404 });

    let title = '';
    let description = '';

    if (action === 'START') {
      await db.prepare(`UPDATE tasks SET status='IN_PROGRESS', updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='OPEN'`).bind(taskId).run();
      title = 'Follow-up started';
      description = `${String(task.title)} moved to IN_PROGRESS`;
    } else if (action === 'COMPLETE') {
      await db.prepare(`UPDATE tasks SET status='DONE', completed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(taskId).run();
      title = 'Follow-up completed';
      description = `${String(task.title)} completed`;
    } else {
      const days = action === 'SNOOZE_3' ? 3 : 7;
      await db.prepare(`UPDATE tasks SET status='OPEN', due_at=datetime('now', ?), updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .bind(`+${days} days`, taskId).run();
      title = 'Follow-up rescheduled';
      description = `${String(task.title)} snoozed ${days} days`;
    }

    await db.prepare(`INSERT INTO activities (id, entity_type, entity_id, activity_type, title, description, metadata_json)
      VALUES (?, 'TASK', ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), taskId, `TASK_${action}`, title, description, JSON.stringify({ taskId, action, orderId: task.order_id || null })).run();

    return Response.json({ ok: true, task: { id: taskId, action } });
  } catch (error) {
    console.error('task_action_failed', error);
    return Response.json({ ok: false, error: 'Unable to update follow-up.' }, { status: 500 });
  }
};
