interface Env {
  MINGEAGLE_DB: D1Database;
}

type Input = {
  action?: 'ENRICH' | 'SYNC_CRM';
  candidateId?: string;
};

type Row = Record<string, unknown>;

type PageResult = {
  url: string;
  html: string;
};

const clean = (value: unknown, max = 1000) => typeof value === 'string' ? value.trim().slice(0, max) : '';

async function ensureColumns(db: D1Database) {
  const info = await db.prepare(`PRAGMA table_info(discovery_candidates)`).all<{ name: string }>();
  const names = new Set(info.results.map(row => row.name));
  const columns: Array<[string, string]> = [
    ['linkedin_url', 'TEXT'],
    ['contact_person_name', 'TEXT'],
    ['contact_person_title', 'TEXT'],
    ['website_contact_url', 'TEXT'],
    ['enrichment_status', `TEXT NOT NULL DEFAULT 'NOT_STARTED'`],
    ['enrichment_source_urls', 'TEXT'],
    ['enrichment_error', 'TEXT'],
    ['enriched_at', 'TEXT'],
  ];
  for (const [name, definition] of columns) {
    if (names.has(name)) continue;
    try {
      await db.prepare(`ALTER TABLE discovery_candidates ADD COLUMN ${name} ${definition}`).run();
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      if (!message.includes('duplicate column')) throw error;
    }
  }
}

function isPrivateIpv4(host: string) {
  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10
    || parts[0] === 127
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168)
    || parts[0] === 0;
}

function safeUrl(value: string, base?: string) {
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    throw new Error('Website URL is invalid.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only public HTTP/HTTPS websites can be enriched.');
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('Private/local website addresses are not allowed.');
  }
  if (isPrivateIpv4(host) || host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')) {
    throw new Error('Private network addresses are not allowed.');
  }
  if (url.port && !['80', '443'].includes(url.port)) throw new Error('Non-standard website ports are not allowed.');
  url.hash = '';
  return url;
}

async function fetchHtml(input: string, base?: string): Promise<PageResult> {
  let current = safeUrl(input, base);
  for (let redirects = 0; redirects < 4; redirects += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    try {
      const response = await fetch(current.toString(), {
        redirect: 'manual',
        headers: {
          accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
          'user-agent': 'MING-EAGLE-Public-Website-Enrichment/1.0 (+https://www.mingeagle.com)',
        },
        signal: controller.signal,
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) throw new Error(`Website redirect ${response.status} has no location.`);
        current = safeUrl(location, current.toString());
        continue;
      }
      if (!response.ok) throw new Error(`Website returned HTTP ${response.status}.`);
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.toLowerCase().includes('text/html') && !contentType.toLowerCase().includes('application/xhtml')) {
        throw new Error('Website did not return an HTML page.');
      }
      const declared = Number(response.headers.get('content-length') || 0);
      if (declared > 1_500_000) throw new Error('Website page is too large to inspect safely.');
      const html = (await response.text()).slice(0, 900_000);
      return { url: current.toString(), html };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('Website redirected too many times.');
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCharCode(parseInt(code, 16)));
}

function htmlText(html: string) {
  return decodeHtml(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hrefs(html: string, base: string) {
  const results: string[] = [];
  const regex = /href\s*=\s*["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html))) {
    const raw = decodeHtml(match[1]).trim();
    if (!raw || raw.startsWith('#') || /^(javascript|data):/i.test(raw)) continue;
    try {
      results.push(new URL(raw, base).toString());
    } catch {
      // Ignore malformed links.
    }
  }
  return Array.from(new Set(results));
}

function validEmail(value: string) {
  const email = value.toLowerCase().replace(/^mailto:/, '').split('?')[0].trim();
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) return '';
  if (/\.(png|jpg|jpeg|gif|webp|svg|css|js)$/i.test(email)) return '';
  if (/^(example|test|name)@/i.test(email)) return '';
  return email.slice(0, 320);
}

function extractEmails(html: string) {
  const decoded = decodeHtml(html);
  const set = new Set<string>();
  const mailto = /mailto:([^"'<>\s?]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = mailto.exec(decoded))) {
    const email = validEmail(match[1]);
    if (email) set.add(email);
  }
  const plain = decoded.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  for (const raw of plain) {
    const email = validEmail(raw);
    if (email) set.add(email);
  }
  return Array.from(set);
}

function phoneValue(raw: string) {
  const decoded = decodeURIComponent(raw).replace(/^tel:/i, '').split('?')[0].trim();
  const digits = decoded.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return '';
  return decoded.slice(0, 80);
}

function extractPhones(html: string, text: string) {
  const set = new Set<string>();
  const tel = /href\s*=\s*["'](tel:[^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = tel.exec(html))) {
    const phone = phoneValue(match[1]);
    if (phone) set.add(phone);
  }
  const plain = text.match(/(?:\+?1[\s.\-()]*)?(?:\(?\d{3}\)?[\s.\-]*)\d{3}[\s.\-]*\d{4}(?:\s*(?:x|ext\.?)[\s]*\d{1,6})?/gi) || [];
  for (const raw of plain) {
    const phone = phoneValue(raw);
    if (phone) set.add(phone);
  }
  return Array.from(set);
}

function firstSocial(links: string[], domains: string[]) {
  return links.find(link => {
    try {
      const host = new URL(link).hostname.toLowerCase();
      return domains.some(domain => host === domain || host.endsWith(`.${domain}`));
    } catch {
      return false;
    }
  }) || '';
}

function whatsappFromLinks(links: string[]) {
  const link = firstSocial(links, ['wa.me', 'whatsapp.com']);
  if (!link) return '';
  try {
    const url = new URL(link);
    if (url.hostname.toLowerCase() === 'wa.me') return url.pathname.replace(/\D/g, '').slice(0, 20) || link;
    return url.searchParams.get('phone')?.replace(/\D/g, '').slice(0, 20) || link;
  } catch {
    return link;
  }
}

function extractPerson(text: string) {
  const roles = '(Owner|Founder|Co-Founder|Director|Executive Director|Program Director|Head Coach|Coach|General Manager|Manager|President|CEO|Operations Director|Basketball Director|Training Director|Purchasing Manager|Procurement Manager)';
  const name = '([A-Z][a-zA-Z\'’-]{1,30}(?:\\s+[A-Z][a-zA-Z\'’-]{1,30}){1,2})';
  const patterns = [
    new RegExp(`${name}\\s*(?:[-–—|,:]|is\\s+(?:the\\s+)?)\\s*${roles}`, 'i'),
    new RegExp(`${roles}\\s*(?:[-–—|,:]|is)?\\s*${name}`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    if (pattern === patterns[0]) return { name: clean(match[1], 120), title: clean(match[2], 120) };
    return { name: clean(match[2], 120), title: clean(match[1], 120) };
  }
  return { name: '', title: '' };
}

function chooseEmail(emails: string[], host: string) {
  if (!emails.length) return '';
  const domain = host.toLowerCase().replace(/^www\./, '');
  return emails.find(email => email.endsWith(`@${domain}`))
    || emails.find(email => /^(sales|info|contact|hello|office|admin|support|coach|training|orders)@/i.test(email))
    || emails[0];
}

function scoreAfterEnrichment(row: Row, personName: string, personTitle: string, linkedin: string, instagram: string, facebook: string) {
  let score = Math.max(0, Number(row.lead_score || 0));
  const hadEmail = Boolean(clean(row.email, 320));
  const hadPhone = Boolean(clean(row.phone, 160));
  const hadWhatsapp = Boolean(clean(row.whatsapp, 320));
  if (!hadEmail && clean(row.enriched_email, 320)) score += 14;
  if (!hadPhone && clean(row.enriched_phone, 160)) score += 8;
  if (!hadWhatsapp && clean(row.enriched_whatsapp, 320)) score += 3;
  if (personName && personTitle) score += 8;
  if (linkedin) score += 4;
  if (instagram || facebook) score += 2;
  return Math.min(100, Math.round(score));
}

function grade(score: number) {
  if (score >= 80) return 'A';
  if (score >= 60) return 'B';
  return 'C';
}

function contactQuality(row: Row) {
  let score = 0;
  if (clean(row.email, 320)) score += 45;
  if (clean(row.phone, 160)) score += 25;
  if (clean(row.whatsapp, 320)) score += 15;
  if (clean(row.website, 1000)) score += 10;
  if (clean(row.contact_person_name, 160)) score += 5;
  return Math.min(100, score);
}

async function syncCrm(db: D1Database, candidateId: string) {
  const candidate = await db.prepare(`SELECT * FROM discovery_candidates WHERE id=? LIMIT 1`).bind(candidateId).first<Row>();
  if (!candidate) throw new Error('Candidate not found.');
  const leadId = clean(candidate.crm_lead_id, 120);
  if (!leadId) return { synced: false };

  const lead = await db.prepare(`SELECT id, company_id, primary_contact_id, status FROM leads WHERE id=? LIMIT 1`).bind(leadId).first<Row>();
  if (!lead) return { synced: false };
  const companyId = clean(lead.company_id, 120);
  let contactId = clean(lead.primary_contact_id, 120);
  const website = clean(candidate.website, 1000);
  const phone = clean(candidate.phone, 160);
  const email = clean(candidate.email, 320).toLowerCase();
  const whatsapp = clean(candidate.whatsapp, 320);
  const personName = clean(candidate.contact_person_name, 160);
  const personTitle = clean(candidate.contact_person_title, 160);
  const instagram = clean(candidate.instagram_url, 1000);
  const linkedin = clean(candidate.linkedin_url, 1000);

  if (companyId) {
    await db.prepare(`UPDATE companies SET
      website=CASE WHEN COALESCE(website,'')='' THEN ? ELSE website END,
      phone=CASE WHEN COALESCE(phone,'')='' THEN ? ELSE phone END,
      updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(website || null, phone || null, companyId).run();
  }

  if (!contactId && (email || phone || whatsapp || personName)) {
    const sameEmail = email ? await db.prepare(`SELECT id FROM contacts WHERE lower(email)=lower(?) LIMIT 1`).bind(email).first<{ id: string }>() : null;
    contactId = sameEmail?.id || crypto.randomUUID();
    if (!sameEmail) {
      await db.prepare(`INSERT INTO contacts (
        id, company_id, full_name, title, email, email_type, phone, whatsapp, linkedin_url, instagram_url,
        is_primary, source_url, source_evidence
      ) VALUES (?, ?, ?, ?, ?, 'UNKNOWN', ?, ?, ?, ?, 1, ?, ?)`)
        .bind(
          contactId, companyId || null, personName || clean(candidate.name, 200) || 'Public business contact',
          personTitle || 'Public business contact', email || null, phone || null, whatsapp || null,
          linkedin || null, instagram || null, clean(candidate.website_contact_url, 1000) || website || clean(candidate.source_url, 1000),
          `Public contact details found on official website. ${clean(candidate.enrichment_source_urls, 2000)}`,
        ).run();
    }
    await db.prepare(`UPDATE leads SET primary_contact_id=? WHERE id=?`).bind(contactId, leadId).run();
  } else if (contactId) {
    const existingEmail = email ? await db.prepare(`SELECT id FROM contacts WHERE lower(email)=lower(?) AND id<>? LIMIT 1`).bind(email, contactId).first<{ id: string }>() : null;
    await db.prepare(`UPDATE contacts SET
      full_name=CASE WHEN COALESCE(full_name,'')='' OR full_name=(SELECT name FROM companies WHERE id=company_id) THEN COALESCE(NULLIF(?,''),full_name) ELSE full_name END,
      title=CASE WHEN COALESCE(title,'')='' OR title='Public business contact' THEN COALESCE(NULLIF(?,''),title) ELSE title END,
      email=CASE WHEN COALESCE(email,'')='' AND ?=0 THEN NULLIF(?,'') ELSE email END,
      phone=CASE WHEN COALESCE(phone,'')='' THEN NULLIF(?,'') ELSE phone END,
      whatsapp=CASE WHEN COALESCE(whatsapp,'')='' THEN NULLIF(?,'') ELSE whatsapp END,
      linkedin_url=CASE WHEN COALESCE(linkedin_url,'')='' THEN NULLIF(?,'') ELSE linkedin_url END,
      instagram_url=CASE WHEN COALESCE(instagram_url,'')='' THEN NULLIF(?,'') ELSE instagram_url END,
      source_url=COALESCE(NULLIF(?,''),source_url),
      source_evidence=COALESCE(NULLIF(?,''),source_evidence),
      updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(
        personName, personTitle, existingEmail ? 1 : 0, email, phone, whatsapp, linkedin, instagram,
        clean(candidate.website_contact_url, 1000) || website,
        `Public contact details found on official website. ${clean(candidate.enrichment_source_urls, 2000)}`,
        contactId,
      ).run();
  }

  const quality = contactQuality(candidate);
  const candidateScore = Math.min(100, Math.max(0, Number(candidate.lead_score || 0)));
  const currentStatus = clean(lead.status, 80);
  const reachable = Boolean(email || phone || whatsapp);
  const nextStatus = reachable && ['DISCOVERED','ANALYZED','ENRICHING'].includes(currentStatus) ? 'READY_TO_CONTACT' : currentStatus;
  await db.prepare(`UPDATE leads SET
    lead_score=CASE WHEN lead_score<? THEN ? ELSE lead_score END,
    contact_quality_score=CASE WHEN contact_quality_score<? THEN ? ELSE contact_quality_score END,
    opportunity_score=?, status=?,
    next_best_action=CASE WHEN ?=1 THEN 'Review enriched website contact and prepare first outreach' ELSE next_best_action END,
    updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .bind(candidateScore, candidateScore, quality, quality, Number((candidateScore * 0.65 + quality * 0.35).toFixed(1)), nextStatus, reachable ? 1 : 0, leadId).run();

  const sourceUrl = clean(candidate.website_contact_url, 1000) || website || clean(candidate.source_url, 1000);
  const evidence: Array<[string, string]> = [
    ['website_email', email], ['website_phone', phone], ['website_whatsapp', whatsapp],
    ['contact_person', [personName, personTitle].filter(Boolean).join(' · ')], ['linkedin', linkedin], ['instagram', instagram],
  ];
  for (const [field, value] of evidence) {
    if (!value) continue;
    await db.prepare(`INSERT INTO lead_evidence (id, lead_id, field_name, value, source_url, evidence_text, confidence)
      SELECT ?, ?, ?, ?, ?, 'Public information extracted from official website', 85
      WHERE NOT EXISTS (SELECT 1 FROM lead_evidence WHERE lead_id=? AND field_name=? AND value=?)`)
      .bind(crypto.randomUUID(), leadId, field, value, sourceUrl, leadId, field, value).run();
  }

  await db.prepare(`INSERT INTO activities (id, entity_type, entity_id, activity_type, title, description, metadata_json)
    VALUES (?, 'LEAD', ?, 'DISCOVERY_ENRICHED', 'Public website enrichment completed', ?, ?)`)
    .bind(crypto.randomUUID(), leadId, `Updated public contact data for ${clean(candidate.name, 200)}`, JSON.stringify({ candidateId, sourceUrl })).run();

  return { synced: true, leadId, contactId: contactId || null };
}

async function enrichCandidate(db: D1Database, candidateId: string) {
  const row = await db.prepare(`SELECT * FROM discovery_candidates WHERE id=? LIMIT 1`).bind(candidateId).first<Row>();
  if (!row) throw new Error('Candidate not found.');
  const website = clean(row.website, 1000);
  if (!website) throw new Error('This candidate has no public website to inspect.');

  await db.prepare(`UPDATE discovery_candidates SET enrichment_status='RUNNING', enrichment_error=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(candidateId).run();

  try {
    const home = await fetchHtml(website);
    const homeUrl = new URL(home.url);
    const allPages: PageResult[] = [home];
    const homeLinks = hrefs(home.html, home.url);
    const sameHost = homeLinks.filter(link => {
      try {
        const url = new URL(link);
        return url.hostname.toLowerCase().replace(/^www\./, '') === homeUrl.hostname.toLowerCase().replace(/^www\./, '');
      } catch {
        return false;
      }
    });
    const preferred = sameHost.filter(link => /\/(contact|contact-us|about|about-us|team|staff|coaches|coach|leadership|our-team)(?:[/?#]|$)/i.test(link));
    const pageTargets = Array.from(new Set(preferred)).slice(0, 2);
    for (const target of pageTargets) {
      try {
        allPages.push(await fetchHtml(target));
      } catch {
        // A secondary page failing should not cancel a successful homepage enrichment.
      }
    }

    const combinedHtml = allPages.map(page => page.html).join('\n');
    const combinedText = allPages.map(page => htmlText(page.html)).join(' ');
    const links = allPages.flatMap(page => hrefs(page.html, page.url));
    const emails = extractEmails(combinedHtml);
    const phones = extractPhones(combinedHtml, combinedText);
    const email = chooseEmail(emails, homeUrl.hostname);
    const phone = phones[0] || '';
    const whatsapp = whatsappFromLinks(links);
    const instagram = firstSocial(links, ['instagram.com']);
    const facebook = firstSocial(links, ['facebook.com', 'fb.com']);
    const linkedin = firstSocial(links, ['linkedin.com']);
    const person = extractPerson(combinedText);
    const sourceUrls = allPages.map(page => page.url);
    const contactUrl = allPages.find(page => /contact/i.test(page.url))?.url || allPages[1]?.url || home.url;

    const mergedEmail = clean(row.email, 320) || email;
    const mergedPhone = clean(row.phone, 160) || phone;
    const mergedWhatsapp = clean(row.whatsapp, 320) || whatsapp;
    const mergedInstagram = clean(row.instagram_url, 1000) || instagram;
    const mergedFacebook = clean(row.facebook_url, 1000) || facebook;
    const mergedLinkedin = clean(row.linkedin_url, 1000) || linkedin;
    const scoreRow = { ...row, enriched_email: email, enriched_phone: phone, enriched_whatsapp: whatsapp };
    const score = scoreAfterEnrichment(scoreRow, person.name, person.title, mergedLinkedin, mergedInstagram, mergedFacebook);

    await db.prepare(`UPDATE discovery_candidates SET
      website=?, email=?, phone=?, whatsapp=?, instagram_url=?, facebook_url=?, linkedin_url=?,
      contact_person_name=COALESCE(NULLIF(?,''),contact_person_name),
      contact_person_title=COALESCE(NULLIF(?,''),contact_person_title),
      website_contact_url=?, lead_score=?, grade=?, enrichment_status='COMPLETED', enrichment_source_urls=?,
      enrichment_error=NULL, enriched_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
      WHERE id=?`)
      .bind(
        home.url, mergedEmail || null, mergedPhone || null, mergedWhatsapp || null, mergedInstagram || null,
        mergedFacebook || null, mergedLinkedin || null, person.name, person.title, contactUrl,
        score, grade(score), JSON.stringify(sourceUrls), candidateId,
      ).run();

    const synced = await syncCrm(db, candidateId);
    return {
      candidateId,
      pagesChecked: sourceUrls.length,
      found: {
        email: Boolean(email), phone: Boolean(phone), whatsapp: Boolean(whatsapp),
        instagram: Boolean(instagram), facebook: Boolean(facebook), linkedin: Boolean(linkedin),
        contactPerson: Boolean(person.name),
      },
      score,
      grade: grade(score),
      synced,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Website enrichment failed.';
    await db.prepare(`UPDATE discovery_candidates SET enrichment_status='FAILED', enrichment_error=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(message.slice(0, 1000), candidateId).run();
    throw error;
  }
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.MINGEAGLE_DB) return Response.json({ ok: false, error: 'Database is not configured.' }, { status: 503 });
  const db = env.MINGEAGLE_DB;
  try {
    await ensureColumns(db);
    const input = await request.json() as Input;
    const candidateId = clean(input.candidateId, 120);
    if (!candidateId) return Response.json({ ok: false, error: 'candidateId is required.' }, { status: 400 });
    if ((input.action || 'ENRICH') === 'SYNC_CRM') {
      const result = await syncCrm(db, candidateId);
      return Response.json({ ok: true, ...result });
    }
    const result = await enrichCandidate(db, candidateId);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error('discovery_enrichment_failed', error);
    return Response.json({ ok: false, error: error instanceof Error ? error.message : 'Unable to enrich candidate.' }, { status: 500 });
  }
};