import {publicInquiryRateLimit} from '../../lib/public-inquiry-guard';
interface Env {
  MINGEAGLE_DB: D1Database;
}

type InquiryInput = {
  originalReference?: string;
  _honey?: string;
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
  preferredConfiguration?: string;
  shippingPreference?: string;
  products?: string[];
  leadSource?: string;
  landingPage?: string;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  marketingConsent?: boolean;
  privacyAck?: boolean;
  requestLabel?: string;
  message?: string;
  requestType?: 'WHOLESALE' | 'SAMPLE' | 'GENERAL' | 'ORDER_SUPPORT' | 'RETAIL_PARTNERSHIP';
  productInterest?: string;
};

type ParsedRequest = {
  input: InquiryInput;
  nativeForm: boolean;
};

const FORM_EMAIL_ENDPOINT = 'https://formsubmit.co/ajax/mingeaglecommerce@gmail.com';
const THANK_YOU_URL = 'https://www.mingeagle.com/thank-you.html';

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

function quantityFloor(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.floor(value));
  const text = clean(value, 80).replace(/,/g, '');
  const match = text.match(/\d+/);
  if (!match) return fallback;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback;
}

function scoreLead(input: InquiryInput) {
  let score = input.requestType === 'SAMPLE' ? 72 : input.requestType === 'GENERAL' || input.requestType === 'ORDER_SUPPORT' ? 45 : 62;
  const quantity = quantityFloor(input.estimatedQuantity, 0);
  if (quantity >= 20) score += 5;
  if (quantity >= 100) score += 8;
  if (quantity >= 500) score += 5;
  if (clean(input.company)) score += 5;
  if (clean(input.phone) || clean(input.whatsapp)) score += 3;
  if (isCommercialCustomerType(input.customerType)) score += 6;
  return Math.min(100, score);
}

function safeQuantity(value: unknown, fallback = 1) {
  const parsed = quantityFloor(value, fallback);
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

function formText(form: FormData, key: string, max = 500) {
  const value = form.get(key);
  return clean(typeof value === 'string' ? value : '', max);
}

function formBool(form: FormData, key: string) {
  const value = formText(form, key, 40).toLowerCase();
  return ['1', 'true', 'yes', 'on', 'agreed', 'opted in', 'accepted'].includes(value);
}

function productInterestFromProducts(products: string[]) {
  const joined = products.join(' ').toLowerCase();
  if (joined.includes('soccer')) return 'SILENT_SOCCER';
  if (joined.includes('weighted')) return 'WEIGHTED_SILENT_BASKETBALL';
  if (joined.includes('fabric')) return 'FABRIC_SILENT_BASKETBALL';
  if (joined.includes('basketball')) return 'SILENT_BALL';
  return clean(products[0], 120) || 'SILENT_BALL';
}

async function parseRequest(request: Request): Promise<ParsedRequest> {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    if (formText(form, '_honey', 200)) throw new Error('Spam check failed');
    const requestLabel = formText(form, 'request_type', 80) || 'Wholesale quote';
    const products = form.getAll('products[]')
      .filter((value): value is string => typeof value === 'string')
      .map(value => clean(value, 180))
      .filter(Boolean)
      .slice(0, 12);
    const isSample = /sample/i.test(requestLabel);
    return {
      nativeForm: true,
      input: {
        originalReference: formText(form, 'inquiry_reference', 80),
        firstName: formText(form, 'firstname', 80),
        lastName: formText(form, 'lastname', 80),
        email: formText(form, 'email', 200),
        phone: formText(form, 'phone', 80),
        whatsapp: formText(form, 'phone', 80),
        company: formText(form, 'company', 160),
        customerType: formText(form, 'customer_type', 100),
        estimatedQuantity: formText(form, 'estimated_quantity', 80),
        country: formText(form, 'country', 100),
        city: formText(form, 'city', 120),
        postalCode: formText(form, 'zip', 40),
        website: formText(form, 'website', 300),
        jobTitle: formText(form, 'jobtitle', 120),
        customization: formText(form, 'customization', 120),
        orderTiming: formText(form, 'order_timing', 120),
        preferredConfiguration: formText(form, 'preferred_configuration', 250),
        shippingPreference: formText(form, 'shipping_preference', 120),
        products,
        leadSource: formText(form, 'lead_source', 120) || 'MING EAGLE website',
        landingPage: formText(form, 'landing_page', 500),
        referrer: formText(form, 'referrer', 500),
        utmSource: formText(form, 'utm_source', 200),
        utmMedium: formText(form, 'utm_medium', 200),
        utmCampaign: formText(form, 'utm_campaign', 200),
        utmContent: formText(form, 'utm_content', 200),
        marketingConsent: formBool(form, 'marketing_consent'),
        privacyAck: formBool(form, 'privacy_ack'),
        requestLabel,
        message: formText(form, 'message', 4000),
        requestType: isSample ? 'SAMPLE' : 'WHOLESALE',
        productInterest: productInterestFromProducts(products),
      },
    };
  }

  return { nativeForm: false, input: (await request.json()) as InquiryInput };
}

async function forwardInquiryEmail(input: InquiryInput, reference: string) {
  try {
    const response = await fetch(FORM_EMAIL_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        _subject: `MING EAGLE inquiry ${reference}`,
        _template: 'table',
        _replyto: clean(input.email, 200),
        'Inquiry reference': reference,
        'Request type': clean(input.requestLabel, 80) || input.requestType || 'WHOLESALE',
        Name: `${clean(input.firstName, 80)} ${clean(input.lastName, 80)}`.trim(),
        Email: clean(input.email, 200),
        Company: clean(input.company, 160),
        'Role / title': clean(input.jobTitle, 120),
        'Customer type': clean(input.customerType, 100),
        'Phone / WhatsApp': clean(input.phone || input.whatsapp, 80),
        'Website / social': clean(input.website, 300),
        Products: normalizeProducts(input.products).join(', '),
        'Estimated quantity': String(input.estimatedQuantity ?? ''),
        Configuration: clean(input.preferredConfiguration, 250),
        Customization: clean(input.customization, 120),
        'Purchase timeline': clean(input.orderTiming, 120),
        Country: clean(input.country, 100),
        City: clean(input.city, 120),
        'Postal / ZIP': clean(input.postalCode, 40),
        'Shipping preference': clean(input.shippingPreference, 120),
        Message: clean(input.message, 4000),
        'Marketing consent': input.marketingConsent ? 'Yes' : 'No',
        'Lead source': clean(input.leadSource, 120),
        'Landing page': clean(input.landingPage, 500),
        Referrer: clean(input.referrer, 500),
        'UTM source': clean(input.utmSource, 200),
        'UTM medium': clean(input.utmMedium, 200),
        'UTM campaign': clean(input.utmCampaign, 200),
        'UTM content': clean(input.utmContent, 200),
      }),
    });
    return response.ok;
  } catch (error) {
    console.error('inquiry_email_forward_failed', error);
    return false;
  }
}

function successResponse(nativeForm: boolean, reference: string, payload: Record<string, unknown>) {
  if (nativeForm) {
    return new Response(null, {
      status: 303,
      headers: {
        Location: `${THANK_YOU_URL}?ref=${encodeURIComponent(reference)}`,
        'cache-control': 'no-store',
      },
    });
  }
  return Response.json({ ok: true, reference, ...payload });
}

async function processInquiryPost(context:Parameters<PagesFunction<Env>>[0],notify=true):Promise<Response>{
  const {request,env}=context;
  try {
    if (!env.MINGEAGLE_DB) {
      return Response.json({ error: 'Database is not configured.' }, { status: 503 });
    }

    const { input, nativeForm } = await parseRequest(request);
    if (clean(input._honey, 200))return Response.json({ok:false,error:'Spam check failed.'},{status:400});
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
    const preferredConfiguration = clean(input.preferredConfiguration, 250);
    const shippingPreference = clean(input.shippingPreference, 120);
    const leadSource = clean(input.leadSource, 120) || 'MING EAGLE website';
    const products = normalizeProducts(input.products);
    const rawMessage = clean(input.message, 4000);
    const message = [
      rawMessage,
      preferredConfiguration ? `Preferred configuration: ${preferredConfiguration}` : '',
      shippingPreference ? `Shipping preference: ${shippingPreference}` : '',
    ].filter(Boolean).join('\n');
    const requestedType = clean(input.requestType,40).toUpperCase();
    const requestType = (['SAMPLE','WHOLESALE','GENERAL','ORDER_SUPPORT','RETAIL_PARTNERSHIP'].includes(requestedType)
      ? requestedType : 'WHOLESALE') as NonNullable<InquiryInput['requestType']>;
    const productInterest = clean(input.productInterest, 120) || productInterestFromProducts(products);
    const requestedReference = safeReference(input.originalReference);

    const origin=request.headers.get('origin');
    if ((nativeForm || isPublicInquiryOrigin(origin)) && !input.privacyAck) {
      return new Response('Privacy acknowledgement is required.', { status: 400 });
    }
    if (!firstName || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || (['SAMPLE','WHOLESALE','RETAIL_PARTNERSHIP'].includes(requestType) && !country)) {
      return Response.json({ error: 'First name, valid email, and country for purchase/sample inquiries are required.' }, { status: 400 });
    }

    const db = env.MINGEAGLE_DB;

    // Reuse the public website's ME reference so browser retries never create duplicate CRM leads.
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
        return successResponse(nativeForm, existing.reference, {
          idempotent: true,
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
        .bind(companyId, firstName, lastName, `${firstName} ${lastName}`.trim(), jobTitle, phone, whatsapp, contactId).run();
    } else {
      contactId = crypto.randomUUID();
      await db.prepare(`INSERT INTO contacts
        (id, company_id, first_name, last_name, full_name, title, email, email_type, email_verified, phone, whatsapp, is_primary)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 1)`)
        .bind(contactId, companyId, firstName, lastName, `${firstName} ${lastName}`.trim(), jobTitle || null, email, 'UNKNOWN', phone || null, whatsapp || null).run();
    }

    const leadScore = scoreLead({ ...input, requestType, customerType, company: companyName, phone, whatsapp });
    const leadId = crypto.randomUUID();
    const leadStatus = leadScore >= 70 ? 'QUALIFIED' : 'ANALYZED';
    const nextAction = requestType === 'SAMPLE' ? 'Review sample request and confirm sample path'
      : requestType === 'ORDER_SUPPORT' ? 'Review customer order support request and check order reference'
      : requestType === 'GENERAL' ? 'Answer public product question and confirm next step'
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
        `${leadSource} · ${clean(input.requestLabel, 80) || requestType}`.slice(0, 240),
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
        requestType === 'SAMPLE' ? `Review sample request ${reference}` : `Review ${requestType.toLowerCase().replace('_',' ')} inquiry ${reference}`,
        nextAction,
        taskPriority,
      ).run();

    await db.prepare('INSERT INTO activities (id, entity_type, entity_id, activity_type, title, description, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(
        crypto.randomUUID(),
        'LEAD',
        leadId,
        'INQUIRY_CREATED',
        requestType === 'SAMPLE' ? 'Sample request received' : `${requestType.replace('_',' ')} inquiry received`,
        `${firstName} ${lastName}`.trim()+` submitted ${reference}`,
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
          preferredConfiguration,
          shippingPreference,
          products,
          leadSource,
          landingPage: clean(input.landingPage, 500),
          referrer: clean(input.referrer, 500),
          utmSource: clean(input.utmSource, 200),
          utmMedium: clean(input.utmMedium, 200),
          utmCampaign: clean(input.utmCampaign, 200),
          utmContent: clean(input.utmContent, 200),
          marketingConsent: Boolean(input.marketingConsent),
          leadScore,
        }),
      ).run();

    const emailForwarded = notify ? await forwardInquiryEmail(input, reference) : false;

    return successResponse(nativeForm, reference, {
      inquiryId,
      sampleId,
      leadId,
      leadStatus,
      emailForwarded,
      nextBestAction: nextAction,
    });
  } catch (error) {
    console.error('inquiry_create_failed', error);
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to save the inquiry right now.' }, { status: 500 });
  }
}

// A server-internal import used only by the protected HubSpot recovery endpoint.
// It never forwards a duplicate notification email or bypasses normal input validation.
export async function receiveRecoveredInquiry(env:Env,input:Record<string,unknown>){
  const request=new Request('https://app.mingeagle.com/api/inquiries',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify(input)});
  return processInquiryPost({request,env} as Parameters<PagesFunction<Env>>[0],false);
}

// The storefront is hosted separately from the CRM. Public inquiries never
// carry an admin credential. CORS permits only the official storefront origins.
const PUBLIC_INQUIRY_ORIGINS=new Set(['https://www.mingeagle.com','https://mingeagle.com']);
function isPublicInquiryOrigin(origin:string|null){
  return Boolean(origin)&&PUBLIC_INQUIRY_ORIGINS.has(String(origin));
}
function publicCors(response:Response,origin:string|null){
  if(!isPublicInquiryOrigin(origin))return response;
  const headers=new Headers(response.headers);
  headers.set('access-control-allow-origin',String(origin));
  headers.set('access-control-allow-methods','POST, OPTIONS');
  headers.set('access-control-allow-headers','Content-Type');
  headers.set('vary','Origin');
  headers.set('cache-control','no-store');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
export const onRequestOptions: PagesFunction<Env>=async({request})=>{
  const origin=request.headers.get('origin');
  if(!isPublicInquiryOrigin(origin))return new Response(null,{status:403});
  if(request.headers.get('access-control-request-method')?.toUpperCase()!=='POST')return new Response(null,{status:405});
  const headers=new Headers({
    'access-control-allow-origin':String(origin),
    'access-control-allow-methods':'POST, OPTIONS',
    'access-control-allow-headers':'Content-Type',
    'access-control-max-age':'600',
    'cache-control':'no-store',
    'vary':'Origin',
  });
  return new Response(null,{status:204,headers});
};
export const onRequestPost: PagesFunction<Env>=async context=>{
  const origin=context.request.headers.get('origin');
  if(origin&&!isPublicInquiryOrigin(origin)&&origin!==new URL(context.request.url).origin){
    return Response.json({ok:false,error:'Origin not allowed.'},{status:403});
  }
  const size=Number(context.request.headers.get('content-length')||0);
  if(size>12000)return publicCors(Response.json({ok:false,error:'Inquiry too large.'},{status:413}),origin);
  try{
    const guard=await publicInquiryRateLimit(context.env.MINGEAGLE_DB,context.request);
    if(!guard.allowed){
      const response=Response.json({ok:false,error:'Too many form submissions. Please try later.'},
        {status:429,headers:{'retry-after':String(guard.retryAfter)}});
      return publicCors(response,origin);
    }
  }catch(error){
    console.error('public_inquiry_throttle_failed',error);
    return publicCors(Response.json({ok:false,error:'Inquiry service temporarily unavailable.'},{status:503}),origin);
  }
  return publicCors(await processInquiryPost(context),origin);
};
