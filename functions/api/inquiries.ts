interface Env {
  MINGEAGLE_DB: D1Database;
}

type InquiryInput = {
  originalReference?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  company?: string;
  customerType?: string;
  estimatedQuantity?: number | string;
  country?: string;
  city?: string;
  postalCode?: string;
  website?: string;
  jobTitle?: string;
  customization?: string;
  orderTiming?: string;
  products?: string[];
  leadSource?: string;
  marketingConsent?: boolean;
  message?: string;
  requestType?: 'WHOLESALE' | 'SAMPLE';
  productInterest?: string;
};

const clean = (value: unknown, max = 500) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

const normalizedCompany = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function safeReference(value: unknown) {
  const candidate = clean(value, 80).toUpperCase();
  return /^[A-Z0-9][A-Z0-9-]{3,79}$/.test(candidate) ? candidate : '';
}

function isCommercialCustomerType(value: unknown) {
  const type = clean(value, 120).toLowerCase();
  return /(academy|coach|trainer|retailer|sporting.?goods|camp|program|distributor|wholesale|club|school|organization)/.test(type);
}

function scoreLead(input: InquiryInput) {
  let score = input.requestType === 'SAMPLE' ? 72 : 62;
  const quantity = Number(input.estimatedQuantity || 0);
  if (quantity >= 20) score += 5;
  if (quantity >= 100) score += 8;
  if (quantity >= 500) score += 5;
  if (clean(input.company)) score += 5;
  if (clean(input.phone) || clean(input.whatsapp)) score += 3;
  if (isCommercialCustomerType(input.customerType)) score += 6;
  return Math.min(100, score);
}

function safeQuantity(value: unknown, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(100000, Math.floor(parsed));
}

function normalizeProducts(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map(item => clean(item, 180))
    .filter(Boolean)
    .slice(0, 12);
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    if (!env.MINGEAGLE_DB) {
      return Response.json({ error: 'Database is not configured.' }, { status: 503 });
    }

    const input = (await request.json()) as InquiryInput;
    const firstName = clean(input.firstName, 80);
    const lastName = clean(input.lastName, 80);
    const email = clean(input.email, 200).toLowerCase();
    const phone = clean(input.phone, 80);
    const whatsapp = clean(input.whatsapp, 80);
    const companyName = clean(input.company, 160);
    const customerType = clean(input.customerType, 100);
    const country = clean(input.country, 100);
    const city = clean(input.city, 120);
    const postalCode = clean(input.postalCode, 40);
    const website = clean(input.website, 300);
    const jobTitle = clean(input.jobTitle, 120);
    const customization = clean(input.customization, 120);
    const orderTiming = clean(input.orderTiming, 120);
    const leadSource = clean(input.leadSource, 120) || 'MING EAGLE website';
    const products = normalizeProducts(input.products);
    const message = clean(input.message, 4000);
    const requestType = input.requestType === 'SAMPLE' ? 'SAMPLE' : 'WHOLESALE';
    const productInterest = clean(input.productInterest, 120) || clean(products[0], 120) || 'SILENT_BALL';
    const requestedReference = safeReference(input.originalReference);

    if (!firstName || !lastName || !email || !country || !email.includes('@')) {
      return Response.json({ error: 'First name, last name, valid email and country are required.' }, { status: 400 });
    }

    const db = env.MINGEAGLE_DB;

    // A public website submission can be retried by the browser/Floot endpoint. Reuse the
    // original MEQ/MES reference so one customer action never becomes duplicate CRM leads.
    if (requestedReference) {
      const existing = await db.prepare(`SELECT i.id AS inquiry_id, i.reference, i.lead_id, i.status AS inquiry_status,
          l.status AS lead_status
        FROM inquiries i
        LEFT JOIN leads l ON l.id=i.lead_id
        WHERE i.reference=? LIMIT 1`)
        .bind(requestedReference)
        .first<{ inquiry_id: string; reference: string; lead_id: string | null; inquiry_status: string; lead_status: string | null }>();
      if (existing?.inquiry_id) {
        const existingSample = await db.prepare('SELECT id FROM samples WHERE inquiry_id=? LIMIT 1')
          .bind(existing.inquiry_id).first<{ id: string }>();
        return Response.json({
          ok: true,
          idempotent: true,
          reference: existing.reference,
          inquiryId: existing.inquiry_id,
          sampleId: existingSample?.id || null,
          leadId: existing.lead_id,
          leadStatus: existing.lead_status || null,
          inquiryStatus: existing.inquiry_status,
          nextBestAction: 'Existing inquiry reused',
        });
      }
    }

    let companyId: string | null = null;
    let contactId: string;

    if (companyName) {
      const normalizedName = normalizedCompany(companyName);
      const existingCompany = await db
        .prepare('SELECT id FROM companies WHERE normalized_name = ? LIMIT 1')
        .bind(normalizedName)
        .first<{ id: string }>();

      if (existingCompany?.id) {
        companyId = existingCompany.id;
        await db.prepare(`UPDATE companies SET
            customer_type=COALESCE(NULLIF(?, ''), customer_type),
            country=COALESCE(NULLIF(?, ''), country),
            city=COALESCE(NULLIF(?, ''), city),
            website=COALESCE(NULLIF(?, ''), website),
            updated_at=CURRENT_TIMESTAMP
          WHERE id=?`)
          .bind(customerType, country, city, website, companyId).run();
      } else {
        companyId = crypto.randomUUID();
        await db.prepare(`INSERT INTO companies
          (id, name, normalized_name, website, customer_type, country, city, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'PROSPECT')`)
          .bind(companyId, companyName, normalizedName, website || null, customerType || null, country, city || null).run();
      }
    }

    const existingContact = await db
      .prepare('SELECT id, company_id FROM contacts WHERE email = ? LIMIT 1')
      .bind(email)
      .first<{ id: string; company_id: string | null }>();

    if (existingContact?.id) {
      contactId = existingContact.id;
      await db.prepare(`UPDATE contacts
        SET company_id=COALESCE(company_id, ?), first_name=?, last_name=?, full_name=?,
            title=COALESCE(NULLIF(?, ''), title),
            phone=COALESCE(NULLIF(?, ''), phone), whatsapp=COALESCE(NULLIF(?, ''), whatsapp), updated_at=CURRENT_TIMESTAMP
        WHERE id=?`)
        .bind(companyId, firstName, lastName, `${firstName} ${lastName}`, jobTitle, phone, whatsapp, contactId).run();
    } else {
      contactId = crypto.randomUUID();
      await db.prepare(`INSERT INTO contacts
        (id, company_id, first_name, last_name, full_name, title, email, email_type, email_verified, phone, whatsapp, is_primary)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 1)`)
        .bind(contactId, companyId, firstName, lastName, `${firstName} ${lastName}`, jobTitle || null, email, 'UNKNOWN', phone || null, whatsapp || null).run();
    }

    const leadScore = scoreLead({ ...input, requestType, customerType, company: companyName, phone, whatsapp });
    const leadId = crypto.randomUUID();
    const leadStatus = leadScore >= 70 ? 'QUALIFIED' : 'ANALYZED';
    const nextAction = requestType === 'SAMPLE'
      ? 'Review sample request and confirm sample path'
      : 'Review inquiry and prepare response / quote path';

    await db.prepare(`INSERT INTO leads (
      id, company_id, primary_contact_id, source, source_detail, status, product_interest,
      lead_score, contact_quality_score, potential_value, close_probability, opportunity_score,
      next_best_action, next_action_at
    ) VALUES (?, ?, ?, 'WEBSITE', ?, ?, ?, ?, 40, 55, 25, ?, ?, datetime('now', '+1 day'))`)
      .bind(
        leadId,
        companyId,
        contactId,
        `${leadSource} · ${requestType}`.slice(0, 240),
        leadStatus,
        productInterest,
        leadScore,
        Math.round(leadScore * 0.5 + 55 * 0.25 + 25 * 0.25),
        nextAction,
      ).run();

    const inquiryId = crypto.randomUUID();
    const reference = requestedReference || `${requestType === 'SAMPLE' ? 'MES' : 'MEQ'}-${Date.now().toString(36).toUpperCase()}`;

    await db.prepare(`INSERT INTO inquiries (
      id, reference, lead_id, company_id, contact_id, request_type, customer_type,
      product_interest, estimated_quantity, customization, order_timing,
      shipping_country, shipping_city, shipping_postal_code, message, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW')`)
      .bind(
        inquiryId,
        reference,
        leadId,
        companyId,
        contactId,
        requestType,
        customerType || null,
        productInterest,
        String(input.estimatedQuantity ?? ''),
        customization || null,
        orderTiming || null,
        country,
        city || null,
        postalCode || null,
        message || null,
      ).run();

    let sampleId: string | null = null;
    if (requestType === 'SAMPLE') {
      sampleId = crypto.randomUUID();
      await db.prepare(`INSERT INTO samples (
        id, reference, lead_id, inquiry_id, company_id, contact_id, quantity, status, follow_up_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'REQUESTED', datetime('now', '+2 day'))`)
        .bind(sampleId, reference, leadId, inquiryId, companyId, contactId, safeQuantity(input.estimatedQuantity)).run();
    }

    const taskId = crypto.randomUUID();
    const taskPriority = requestType === 'SAMPLE' || leadScore >= 80 ? 'HIGH' : 'MEDIUM';
    await db.prepare(`INSERT INTO tasks (
      id, lead_id, company_id, contact_id, type, title, description, status, priority, due_at
    ) VALUES (?, ?, ?, ?, 'FOLLOW_UP', ?, ?, 'OPEN', ?, datetime('now', '+1 day'))`)
      .bind(
        taskId,
        leadId,
        companyId,
        contactId,
        requestType === 'SAMPLE' ? `Review sample request ${reference}` : `Review wholesale inquiry ${reference}`,
        nextAction,
        taskPriority,
      ).run();

    await db.prepare('INSERT INTO activities (id, entity_type, entity_id, activity_type, title, description, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(
        crypto.randomUUID(),
        'LEAD',
        leadId,
        'INQUIRY_CREATED',
        requestType === 'SAMPLE' ? 'Sample request received' : 'Wholesale inquiry received',
        `${firstName} ${lastName} submitted ${reference}`,
        JSON.stringify({
          inquiryId,
          sampleId,
          taskId,
          reference,
          originalReference: requestedReference || null,
          email,
          phone,
          whatsapp,
          companyName,
          customerType,
          city,
          website,
          jobTitle,
          customization,
          orderTiming,
          products,
          leadSource,
          marketingConsent: Boolean(input.marketingConsent),
          leadScore,
        }),
      ).run();

    return Response.json({
      ok: true,
      reference,
      inquiryId,
      sampleId,
      leadId,
      leadStatus,
      nextBestAction: nextAction,
    }, { status: 201 });
  } catch (error) {
    console.error('inquiry_create_failed', error);
    return Response.json({ error: 'Unable to save the inquiry right now.' }, { status: 500 });
  }
};
