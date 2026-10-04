interface Env {
  MINGEAGLE_DB: D1Database;
}

type Input = {
  contactId?: string;
  title?: string;
  phone?: string;
  whatsapp?: string;
  doNotContact?: boolean;
};

const clean = (value: unknown, max = 500) => typeof value === 'string' ? value.trim().slice(0, max) : '';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.MINGEAGLE_DB) return Response.json({ ok: false, error: 'Database is not configured.' }, { status: 503 });
  try {
    const input = await request.json() as Input;
    const contactId = clean(input.contactId, 100);
    if (!contactId) return Response.json({ ok: false, error: 'Contact is required.' }, { status: 400 });

    const db = env.MINGEAGLE_DB;
    const contact = await db.prepare(`SELECT id, full_name, email, do_not_contact FROM contacts WHERE id=? LIMIT 1`).bind(contactId).first<Record<string, unknown>>();
    if (!contact) return Response.json({ ok: false, error: 'Contact not found.' }, { status: 404 });

    const title = clean(input.title, 160);
    const phone = clean(input.phone, 100);
    const whatsapp = clean(input.whatsapp, 100);
    const doNotContact = Boolean(input.doNotContact);

    await db.prepare(`UPDATE contacts SET title=?, phone=?, whatsapp=?, do_not_contact=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(title || null, phone || null, whatsapp || null, doNotContact ? 1 : 0, contactId).run();

    if (doNotContact) {
      await db.prepare(`UPDATE leads SET status='DO_NOT_CONTACT', next_best_action='Do not contact', next_action_at=NULL, updated_at=CURRENT_TIMESTAMP
        WHERE primary_contact_id=? AND status NOT IN ('WON','LOST')`).bind(contactId).run();
      await db.prepare(`UPDATE tasks SET status='CANCELLED', completed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
        WHERE contact_id=? AND status IN ('OPEN','IN_PROGRESS') AND type IN ('OUTREACH_FOLLOW_UP','REPLY_ACTION','SALES_FOLLOW_UP','QUOTE_FOLLOW_UP','SAMPLE_FOLLOW_UP','FOLLOW_UP')`).bind(contactId).run();
    } else if (Number(contact.do_not_contact || 0) === 1) {
      await db.prepare(`UPDATE leads SET status='READY_TO_CONTACT', next_best_action='Review before contacting again', next_action_at=NULL, updated_at=CURRENT_TIMESTAMP
        WHERE primary_contact_id=? AND status='DO_NOT_CONTACT'`).bind(contactId).run();
    }

    await db.prepare(`INSERT INTO activities (id, entity_type, entity_id, activity_type, title, description, metadata_json)
      VALUES (?, 'CONTACT', ?, 'CONTACT_UPDATED', 'Contact details updated', ?, ?)`)
      .bind(
        crypto.randomUUID(), contactId,
        `${String(contact.full_name || contact.email || 'Contact')} updated`,
        JSON.stringify({ title, phone, whatsapp, doNotContact }),
      ).run();

    return Response.json({ ok: true, contactId, doNotContact });
  } catch (error) {
    console.error('contact_update_failed', error);
    return Response.json({ ok: false, error: 'Unable to update contact.' }, { status: 500 });
  }
};
