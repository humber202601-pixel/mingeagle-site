interface Env {
  MINGEAGLE_DB: D1Database;
}

type DueLead = Record<string, unknown>;

function taskFor(status: string, reference: string, daysSinceContact: number) {
  if (status === 'CONTACTED') {
    const stage = daysSinceContact >= 14 ? '最终跟进' : daysSinceContact >= 7 ? '第二次跟进' : '第一次跟进';
    return {
      type: 'OUTREACH_FOLLOW_UP',
      title: `${stage} · ${reference}`,
      description: `客户尚未回复。距离最近联系约 ${Math.max(0, Math.floor(daysSinceContact))} 天，请进行礼貌跟进。`,
      priority: daysSinceContact >= 7 ? 'HIGH' : 'MEDIUM',
    };
  }
  if (status === 'QUOTE') return { type: 'QUOTE_FOLLOW_UP', title: `跟进报价 · ${reference}`, description: '客户处于报价阶段，请确认是否有价格、交付或付款问题需要处理。', priority: 'HIGH' };
  if (status === 'SAMPLE') return { type: 'SAMPLE_FOLLOW_UP', title: `跟进样品 · ${reference}`, description: '客户处于样品阶段，请确认样品安排、物流或试用反馈。', priority: 'HIGH' };
  if (status === 'NEGOTIATION') return { type: 'SALES_FOLLOW_UP', title: `继续商务洽谈 · ${reference}`, description: '客户处于洽谈阶段，请推进价格、付款、物流或成交确认。', priority: 'HIGH' };
  if (status === 'INTERESTED') return { type: 'SALES_FOLLOW_UP', title: `推进意向客户 · ${reference}`, description: '客户已经表达兴趣，请确认数量、配置和目的地，并推进样品或报价。', priority: 'HIGH' };
  if (status === 'REPLIED') return { type: 'REPLY_ACTION', title: `处理客户回复 · ${reference}`, description: '客户已有回复，请检查沟通记录并完成下一步回复。', priority: 'MEDIUM' };
  return { type: 'FOLLOW_UP', title: `销售跟进 · ${reference}`, description: '请检查该客户的下一步销售动作。', priority: 'MEDIUM' };
}

export const onRequestPost: PagesFunction<Env> = async ({ env }) => {
  if (!env.MINGEAGLE_DB) return Response.json({ ok: false, error: 'Database is not configured.' }, { status: 503 });
  try {
    const db = env.MINGEAGLE_DB;
    const due = await db.prepare(`SELECT
        l.id, l.status, l.company_id, l.primary_contact_id, l.last_contact_at, l.next_action_at,
        COALESCE(c.name, ct.full_name, ct.email, 'Lead') AS reference,
        COALESCE((julianday('now') - julianday(l.last_contact_at)), 0) AS days_since_contact,
        COALESCE(ct.do_not_contact,0) AS do_not_contact
      FROM leads l
      LEFT JOIN companies c ON c.id=l.company_id
      LEFT JOIN contacts ct ON ct.id=l.primary_contact_id
      WHERE l.next_action_at IS NOT NULL
        AND datetime(l.next_action_at) <= datetime('now')
        AND l.status IN ('CONTACTED','REPLIED','INTERESTED','SAMPLE','QUOTE','NEGOTIATION')
        AND COALESCE(ct.do_not_contact,0)=0
      ORDER BY l.next_action_at ASC
      LIMIT 200`).all<DueLead>();

    let created = 0;
    let skipped = 0;
    for (const row of due.results) {
      const leadId = String(row.id);
      const open = await db.prepare(`SELECT id FROM tasks WHERE lead_id=? AND status IN ('OPEN','IN_PROGRESS') LIMIT 1`).bind(leadId).first<{ id: string }>();
      if (open?.id) { skipped += 1; continue; }
      const task = taskFor(String(row.status), String(row.reference || 'Lead'), Number(row.days_since_contact || 0));
      await db.prepare(`INSERT INTO tasks (id, lead_id, company_id, contact_id, type, title, description, status, priority, due_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, CURRENT_TIMESTAMP)`)
        .bind(
          crypto.randomUUID(), leadId,
          row.company_id ? String(row.company_id) : null,
          row.primary_contact_id ? String(row.primary_contact_id) : null,
          task.type, task.title, task.description, task.priority,
        ).run();
      await db.prepare(`UPDATE leads SET next_best_action=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(task.title, leadId).run();
      await db.prepare(`INSERT INTO activities (id, entity_type, entity_id, activity_type, title, description)
        VALUES (?, 'LEAD', ?, 'AUTOMATION_FOLLOW_UP', 'Automatic follow-up task created', ?)`)
        .bind(crypto.randomUUID(), leadId, task.title).run();
      created += 1;
    }

    return Response.json({ ok: true, reviewed: due.results.length, created, skipped });
  } catch (error) {
    console.error('automation_sweep_failed', error);
    return Response.json({ ok: false, error: 'Unable to run follow-up automation.' }, { status: 500 });
  }
};
