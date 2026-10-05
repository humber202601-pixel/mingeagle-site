interface Env {
  MINGEAGLE_DB: D1Database;
}

type CandidateRow = Record<string, unknown>;
type Input = {
  action?: 'SEARCH' | 'ADD_TO_CRM' | 'IGNORE';
  stateCode?: string;
  customerType?: string;
  targetCount?: number | string;
  candidateId?: string;
};

type OverpassElement = {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

const clean = (value: unknown, max = 1000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const allowedState = /^[A-Z]{2}$/;
const allowedTypes = new Set(['BASKETBALL_TRAINING','BASKETBALL_GYM','YOUTH_CLUB','SPORTS_STORE']);

async function ensureTables(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS discovery_jobs (
    id TEXT PRIMARY KEY,
    country TEXT NOT NULL DEFAULT 'US',
    state_region TEXT NOT NULL,
    customer_type TEXT NOT NULL,
    target_count INTEGER NOT NULL DEFAULT 20,
    source_provider TEXT NOT NULL DEFAULT 'OPENSTREETMAP',
    status TEXT NOT NULL DEFAULT 'RUNNING',
    result_count INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT
  )`).run();

  await db.prepare(`CREATE TABLE IF NOT EXISTS discovery_candidates (
    id TEXT PRIMARY KEY,
    source_key TEXT NOT NULL UNIQUE,
    source_provider TEXT NOT NULL DEFAULT 'OPENSTREETMAP',
    name TEXT NOT NULL,
    customer_type TEXT NOT NULL,
    country TEXT NOT NULL DEFAULT 'US',
    state_region TEXT,
    city TEXT,
    address TEXT,
    website TEXT,
    email TEXT,
    phone TEXT,
    whatsapp TEXT,
    instagram_url TEXT,
    facebook_url TEXT,
    latitude REAL,
    longitude REAL,
    lead_score INTEGER NOT NULL DEFAULT 0,
    grade TEXT NOT NULL DEFAULT 'C',
    status TEXT NOT NULL DEFAULT 'NEW',
    source_url TEXT NOT NULL,
    source_evidence TEXT,
    raw_json TEXT,
    crm_lead_id TEXT,
    discovered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_discovery_candidates_status ON discovery_candidates(status, discovered_at DESC)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_discovery_candidates_score ON discovery_candidates(lead_score DESC)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_discovery_candidates_location ON discovery_candidates(state_region, city)`).run();
}

function overpassFilters(customerType: string) {
  if (customerType === 'SPORTS_STORE') return `
    nwr["shop"="sports"](area.searchArea);`;
  if (customerType === 'YOUTH_CLUB') return `
    nwr["club"="sport"]["sport"~"basketball|multi",i](area.searchArea);
    nwr["sport"="basketball"]["name"~"youth|club|academy|AAU",i](area.searchArea);`;
  if (customerType === 'BASKETBALL_GYM') return `
    nwr["leisure"~"sports_centre|fitness_centre",i]["sport"~"basketball|multi",i](area.searchArea);
    nwr["leisure"="sports_centre"]["name"~"basketball|hoops|recreation",i](area.searchArea);`;
  return `
    nwr["sport"="basketball"]["leisure"~"sports_centre|fitness_centre",i](area.searchArea);
    nwr["sport"="basketball"]["club"="sport"](area.searchArea);
    nwr["sport"="basketball"]["name"~"academy|training|basketball|hoops",i](area.searchArea);`;
}

function fallbackFilters(customerType: string) {
  if (customerType === 'SPORTS_STORE') return `
    nwr["shop"="sports"]["name"](area.searchArea);`;
  if (customerType === 'YOUTH_CLUB') return `
    nwr["club"="sport"]["sport"="basketball"]["name"](area.searchArea);
    nwr["sport"="basketball"]["club"="sport"]["name"](area.searchArea);`;
  if (customerType === 'BASKETBALL_GYM') return `
    nwr["sport"="basketball"]["leisure"="sports_centre"]["name"](area.searchArea);
    nwr["sport"="basketball"]["leisure"="fitness_centre"]["name"](area.searchArea);`;
  return `
    nwr["sport"="basketball"]["leisure"="sports_centre"]["name"](area.searchArea);
    nwr["sport"="basketball"]["club"="sport"]["name"](area.searchArea);`;
}

function buildQuery(stateCode: string, customerType: string, limit: number, fallback = false) {
  const filters = fallback ? fallbackFilters(customerType) : overpassFilters(customerType);
  return `[out:json][timeout:18];
area["ISO3166-2"="US-${stateCode}"]->.searchArea;
(
${filters}
);
out center ${Math.min(120, Math.max(20, limit * 2))};`;
}

async function fetchOverpassEndpoint(endpoint: string, query: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'accept': 'application/json',
        'user-agent': 'MING-EAGLE-Customer-Discovery/1.1',
      },
      body: new URLSearchParams({ data: query }).toString(),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json() as { elements?: OverpassElement[] };
    return data.elements || [];
  } finally {
    clearTimeout(timer);
  }
}

async function fetchOverpass(query: string) {
  const endpoints = [
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
  ];
  try {
    return await Promise.any(endpoints.map(endpoint => fetchOverpassEndpoint(endpoint, query)));
  } catch {
    throw new Error('PUBLIC_SOURCE_BUSY');
  }
}

async function fetchOverpassResilient(stateCode: string, customerType: string, targetCount: number) {
  try {
    return await fetchOverpass(buildQuery(stateCode, customerType, targetCount, false));
  } catch {
    return fetchOverpass(buildQuery(stateCode, customerType, targetCount, true));
  }
}

function firstTag(tags: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = clean(tags[key], 1000);
    if (value) return value.split(';')[0].trim();
  }
  return '';
}

function normalizeWebsite(value: string) {
  if (!value) return '';
  const first = value.split(';')[0].trim();
  if (!first) return '';
  return /^https?:\/\//i.test(first) ? first : `https://${first}`;
}

function domainFromWebsite(value: string) {
  try {
    return new URL(normalizeWebsite(value)).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function normalizedName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 240);
}

function addressFrom(tags: Record<string, string>) {
  const line1 = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ').trim();
  const city = firstTag(tags, ['addr:city','addr:town','addr:village','addr:suburb','addr:place']);
  const state = firstTag(tags, ['addr:state']);
  const postcode = firstTag(tags, ['addr:postcode']);
  return [line1, city, state, postcode].filter(Boolean).join(', ');
}

function scoreCandidate(tags: Record<string, string>, customerType: string, website: string, email: string, phone: string, whatsapp: string, city: string) {
  let score = 38;
  const name = clean(tags.name, 300).toLowerCase();
  const sport = clean(tags.sport, 200).toLowerCase();
  if (sport.includes('basketball') || name.includes('basketball') || name.includes('hoops')) score += 15;
  if (customerType === 'BASKETBALL_TRAINING' && /(academy|training|skills|camp)/i.test(name)) score += 8;
  if (customerType === 'YOUTH_CLUB' && /(youth|club|aau)/i.test(name)) score += 8;
  if (website) score += 12;
  if (email) score += 14;
  if (phone) score += 8;
  if (whatsapp) score += 3;
  if (city) score += 2;
  return Math.min(100, score);
}

function grade(score: number) {
  if (score >= 80) return 'A';
  if (score >= 60) return 'B';
  return 'C';
}

function customerTypeForCompany(type: string) {
  if (type === 'SPORTS_STORE') return 'SPORTS_RETAILER';
  if (type === 'YOUTH_CLUB') return 'YOUTH_SPORTS_CLUB';
  if (type === 'BASKETBALL_GYM') return 'SPORTS_FACILITY';
  return 'TRAINING_ACADEMY';
}

function contactQuality(row: CandidateRow) {
  let score = 0;
  if (clean(row.email, 320)) score += 45;
  if (clean(row.phone, 160)) score += 25;
  if (clean(row.whatsapp, 320)) score += 15;
  if (clean(row.website, 1000)) score += 15;
  return Math.min(100, score);
}

async function searchCandidates(db: D1Database, stateCode: string, customerType: string, targetCount: number) {
  const jobId = crypto.randomUUID();
  await db.prepare(`INSERT INTO discovery_jobs (id, state_region, customer_type, target_count) VALUES (?, ?, ?, ?)`)
    .bind(jobId, stateCode, customerType, targetCount).run();

  try {
    const elements = await fetchOverpassResilient(stateCode, customerType, targetCount);
    const seen = new Set<string>();
    let saved = 0;

    for (const element of elements) {
      if (saved >= targetCount) break;
      const tags = element.tags || {};
      const name = firstTag(tags, ['name','brand','operator']);
      if (!name) continue;
      const city = firstTag(tags, ['addr:city','addr:town','addr:village','addr:suburb','addr:place']);
      const dedupe = `${normalizedName(name)}|${city.toLowerCase()}|${stateCode}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);

      const website = normalizeWebsite(firstTag(tags, ['contact:website','website','url']));
      const email = firstTag(tags, ['contact:email','email']).toLowerCase();
      const phone = firstTag(tags, ['contact:phone','phone','contact:mobile','mobile']);
      const whatsapp = firstTag(tags, ['contact:whatsapp','whatsapp']);
      const instagram = firstTag(tags, ['contact:instagram','instagram']);
      const facebook = firstTag(tags, ['contact:facebook','facebook']);
      const score = scoreCandidate(tags, customerType, website, email, phone, whatsapp, city);
      const sourceKey = `osm:${element.type}:${element.id}`;
      const sourceUrl = `https://www.openstreetmap.org/${element.type}/${element.id}`;
      const lat = Number(element.lat ?? element.center?.lat ?? 0) || null;
      const lon = Number(element.lon ?? element.center?.lon ?? 0) || null;
      const address = addressFrom(tags);
      const evidence = [
        `OpenStreetMap public business listing`,
        tags.sport ? `sport=${tags.sport}` : '',
        tags.shop ? `shop=${tags.shop}` : '',
        tags.leisure ? `leisure=${tags.leisure}` : '',
        tags.club ? `club=${tags.club}` : '',
      ].filter(Boolean).join(' · ');

      await db.prepare(`INSERT INTO discovery_candidates (
        id, source_key, name, customer_type, state_region, city, address, website, email, phone, whatsapp,
        instagram_url, facebook_url, latitude, longitude, lead_score, grade, source_url, source_evidence, raw_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_key) DO UPDATE SET
        name=excluded.name, customer_type=excluded.customer_type, state_region=excluded.state_region,
        city=excluded.city, address=excluded.address, website=excluded.website, email=excluded.email,
        phone=excluded.phone, whatsapp=excluded.whatsapp, instagram_url=excluded.instagram_url,
        facebook_url=excluded.facebook_url, latitude=excluded.latitude, longitude=excluded.longitude,
        lead_score=excluded.lead_score, grade=excluded.grade, source_evidence=excluded.source_evidence,
        raw_json=excluded.raw_json, updated_at=CURRENT_TIMESTAMP`)
        .bind(
          crypto.randomUUID(), sourceKey, name, customerType, stateCode, city || null, address || null,
          website || null, email || null, phone || null, whatsapp || null, instagram || null, facebook || null,
          lat, lon, score, grade(score), sourceUrl, evidence, JSON.stringify({ tags }),
        ).run();
      saved += 1;
    }

    await db.prepare(`UPDATE discovery_jobs SET status='COMPLETED', result_count=?, completed_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(saved, jobId).run();
    return { jobId, found: saved };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Search failed.';
    await db.prepare(`UPDATE discovery_jobs SET status='FAILED', error=?, completed_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(message.slice(0, 1000), jobId).run();
    throw error;
  }
}

async function addToCrm(db: D1Database, candidateId: string) {
  const candidate = await db.prepare(`SELECT * FROM discovery_candidates WHERE id=? LIMIT 1`).bind(candidateId).first<CandidateRow>();
  if (!candidate) throw new Error('Candidate not found.');
  if (clean(candidate.crm_lead_id, 120)) return { leadId: clean(candidate.crm_lead_id, 120), alreadyAdded: true };

  const name = clean(candidate.name, 300);
  const website = clean(candidate.website, 1000);
  const domain = domainFromWebsite(website);
  const normName = normalizedName(name);
  const city = clean(candidate.city, 160);

  let company = domain
    ? await db.prepare(`SELECT id FROM companies WHERE domain=? LIMIT 1`).bind(domain).first<{ id: string }>()
    : null;
  if (!company) {
    company = await db.prepare(`SELECT id FROM companies WHERE normalized_name=? AND COALESCE(city,'')=? LIMIT 1`)
      .bind(normName, city).first<{ id: string }>();
  }

  const companyId = company?.id || crypto.randomUUID();
  if (!company) {
    await db.prepare(`INSERT INTO companies (
      id, name, normalized_name, domain, website, customer_type, country, state_region, city, address, phone, status, notes
    ) VALUES (?, ?, ?, ?, ?, ?, 'US', ?, ?, ?, ?, 'PROSPECT', ?)`)
      .bind(
        companyId, name, normName, domain || null, website || null, customerTypeForCompany(clean(candidate.customer_type, 80)),
        clean(candidate.state_region, 20) || null, city || null, clean(candidate.address, 500) || null,
        clean(candidate.phone, 160) || null,
        `Discovered from OpenStreetMap. Source: ${clean(candidate.source_url, 1000)}`,
      ).run();
  }

  const email = clean(candidate.email, 320).toLowerCase();
  const phone = clean(candidate.phone, 160);
  const whatsapp = clean(candidate.whatsapp, 320);
  let contactId: string | null = null;
  if (email || phone || whatsapp) {
    const existingContact = email
      ? await db.prepare(`SELECT id FROM contacts WHERE lower(email)=lower(?) LIMIT 1`).bind(email).first<{ id: string }>()
      : null;
    contactId = existingContact?.id || crypto.randomUUID();
    if (!existingContact) {
      await db.prepare(`INSERT INTO contacts (
        id, company_id, full_name, title, email, email_type, phone, whatsapp, instagram_url, is_primary, source_url, source_evidence
      ) VALUES (?, ?, ?, 'Public business contact', ?, 'GENERIC', ?, ?, ?, 1, ?, ?)`)
        .bind(
          contactId, companyId, name, email || null, phone || null, whatsapp || null,
          clean(candidate.instagram_url, 1000) || null, clean(candidate.source_url, 1000), clean(candidate.source_evidence, 1000),
        ).run();
    }
  }

  const existingLead = await db.prepare(`SELECT id FROM leads WHERE company_id=? AND status NOT IN ('LOST','NOT_FIT','DO_NOT_CONTACT') ORDER BY created_at DESC LIMIT 1`)
    .bind(companyId).first<{ id: string }>();
  const leadId = existingLead?.id || crypto.randomUUID();
  if (!existingLead) {
    const score = Math.min(100, Math.max(0, Number(candidate.lead_score || 0)));
    const cq = contactQuality(candidate);
    const status = email || phone || whatsapp ? 'READY_TO_CONTACT' : 'ENRICHING';
    await db.prepare(`INSERT INTO leads (
      id, company_id, primary_contact_id, source, source_detail, status, product_interest,
      lead_score, contact_quality_score, potential_value, opportunity_score, next_best_action
    ) VALUES (?, ?, ?, 'DISCOVERY', ?, ?, 'SILENT_BALL', ?, ?, ?, ?, ?)`)
      .bind(
        leadId, companyId, contactId, `OpenStreetMap · ${clean(candidate.source_url, 1000)}`, status,
        score, cq, Math.min(100, Math.max(35, score)), Number((score * 0.65 + cq * 0.35).toFixed(1)),
        status === 'READY_TO_CONTACT' ? 'Review public contact details and prepare first outreach' : 'Enrich public contact details from official website',
      ).run();

    const evidencePairs = [
      ['website', website], ['email', email], ['phone', phone], ['whatsapp', whatsapp], ['source', clean(candidate.source_url, 1000)],
    ].filter(([, value]) => Boolean(value));
    for (const [field, value] of evidencePairs) {
      await db.prepare(`INSERT INTO lead_evidence (id, lead_id, field_name, value, source_url, evidence_text, confidence)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), leadId, field, value, clean(candidate.source_url, 1000), clean(candidate.source_evidence, 1000), field === 'source' ? 100 : 75).run();
    }
    await db.prepare(`INSERT INTO activities (id, entity_type, entity_id, activity_type, title, description, metadata_json)
      VALUES (?, 'LEAD', ?, 'DISCOVERY_IMPORTED', 'Discovery candidate added to CRM', ?, ?)`)
      .bind(crypto.randomUUID(), leadId, `${name} added from OpenStreetMap discovery`, JSON.stringify({ candidateId, sourceUrl: candidate.source_url, score })).run();
  }

  await db.prepare(`UPDATE discovery_candidates SET status='CRM', crm_lead_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .bind(leadId, candidateId).run();
  return { leadId, companyId, contactId, alreadyAdded: Boolean(existingLead) };
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  if (!env.MINGEAGLE_DB) return Response.json({ ok: false, error: 'Database is not configured.' }, { status: 503 });
  try {
    const db = env.MINGEAGLE_DB;
    await ensureTables(db);
    const candidates = await db.prepare(`SELECT * FROM discovery_candidates ORDER BY
      CASE status WHEN 'NEW' THEN 0 WHEN 'CRM' THEN 1 ELSE 2 END,
      lead_score DESC, discovered_at DESC LIMIT 500`).all();
    const jobs = await db.prepare(`SELECT * FROM discovery_jobs ORDER BY created_at DESC LIMIT 20`).all();
    const counts = await db.prepare(`SELECT status, COUNT(*) AS count FROM discovery_candidates GROUP BY status`).all();
    return Response.json({ ok: true, candidates: candidates.results, jobs: jobs.results, counts: counts.results });
  } catch (error) {
    console.error('discovery_load_failed', error);
    return Response.json({ ok: false, error: 'Unable to load discovery center.' }, { status: 500 });
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.MINGEAGLE_DB) return Response.json({ ok: false, error: 'Database is not configured.' }, { status: 503 });
  const db = env.MINGEAGLE_DB;
  await ensureTables(db);
  try {
    const input = await request.json() as Input;
    const action = input.action || 'SEARCH';

    if (action === 'SEARCH') {
      const stateCode = clean(input.stateCode, 2).toUpperCase();
      const customerType = clean(input.customerType, 80).toUpperCase();
      const targetCount = Math.min(100, Math.max(10, Math.round(Number(input.targetCount || 20))));
      if (!allowedState.test(stateCode)) return Response.json({ ok: false, error: 'Please select a valid U.S. state.' }, { status: 400 });
      if (!allowedTypes.has(customerType)) return Response.json({ ok: false, error: 'Unsupported customer type.' }, { status: 400 });
      const result = await searchCandidates(db, stateCode, customerType, targetCount);
      return Response.json({ ok: true, ...result });
    }

    const candidateId = clean(input.candidateId, 120);
    if (!candidateId) return Response.json({ ok: false, error: 'candidateId is required.' }, { status: 400 });

    if (action === 'ADD_TO_CRM') {
      const result = await addToCrm(db, candidateId);
      return Response.json({ ok: true, ...result });
    }
    if (action === 'IGNORE') {
      await db.prepare(`UPDATE discovery_candidates SET status='IGNORED', updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(candidateId).run();
      return Response.json({ ok: true });
    }
    return Response.json({ ok: false, error: 'Unsupported action.' }, { status: 400 });
  } catch (error) {
    console.error('discovery_action_failed', error);
    const message = error instanceof Error ? error.message : 'Discovery action failed.';
    if (message === 'PUBLIC_SOURCE_BUSY') {
      return Response.json({ ok: false, error: '公共地图数据源目前较忙。系统已经自动尝试多个备用节点，请等待约 30 秒后再试一次。' }, { status: 503 });
    }
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
};
