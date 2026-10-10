import { assertAutoLease,saveAutoClues,sourceJobId } from '../../../lib/discovery-auto-support';
import { sourceSnapshot } from '../../../lib/discovery-source-snapshot';
import { ensureClues } from '../../../lib/discovery-sources';
import { publicPhone, publicPhones } from '../../../lib/public-contacts';
import { fetchPublicText } from '../../../lib/public-web';
import { websiteSocialProfiles } from '../../../lib/discovery-sources';
import { parseSearch, queryPlan, COMMERCIAL_TYPES, METROS as ALL_METROS, STATE_NAMES as ALL_STATE_NAMES } from '../../../shared/discovery';
import { ensureRuns, recordResult } from '../../../lib/discovery';
import { allowedWebsite, resolveEntity } from './discovery-web-v6';
interface Env { MINGEAGLE_DB: D1Database; GEOAPIFY_API_KEY?: string }

type Input = { stateCode?: string; customerType?: string; targetCount?: number | string; city?: string; round?: number; runId?: string; autoSourceOnly?:boolean; autoRunId?:string; autoToken?:string; sourceOffset?:number };
type GeoResult = {
  name?: string; formatted?: string; city?: string; state?: string; state_code?: string; country_code?: string;
  lat?: number; lon?: number; place_id?: string;
};
type Candidate = {
  placeId: string; name: string; city: string; state: string; address: string; lat: number | null; lon: number | null;
  website: string; email: string; phone: string; score: number; sourceQuery: string; verified: boolean;
  contactName: string; contactTitle: string; contactUrl: string; cues: string[]; sourceUrls: string[];
};

const RELEASE = 'SCHOOL_DISCOVERY_V1_2026-10-06';
const clean = (v: unknown, max = 1000) => typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '';
const allowedState = /^[A-Z]{2}$/;
const SCHOOL_TYPES = new Set([
  'PRESCHOOL_KINDERGARTEN','ELEMENTARY_SCHOOL','MIDDLE_HIGH_SCHOOL','PRIVATE_CHARTER_SCHOOL',
  'SCHOOL_DISTRICT','AFTER_SCHOOL_PROGRAM','EDUCATION_SUPPLIER','PUBLIC_SCHOOL'
]);

const CITY_MAP: Record<string,string[]> = {
  AL:['Birmingham','Mobile'],AK:['Anchorage'],AZ:['Phoenix','Tucson'],AR:['Little Rock'],CA:['Los Angeles','San Diego','San Francisco','Sacramento'],CO:['Denver','Colorado Springs'],CT:['Hartford','New Haven'],DE:['Wilmington'],FL:['Miami','Orlando','Tampa','Jacksonville'],GA:['Atlanta','Savannah'],HI:['Honolulu'],ID:['Boise'],IL:['Chicago','Springfield'],IN:['Indianapolis','Fort Wayne'],IA:['Des Moines','Iowa City'],KS:['Wichita','Topeka'],KY:['Louisville','Lexington'],LA:['New Orleans','Baton Rouge'],ME:['Portland'],MD:['Baltimore','Annapolis'],MA:['Boston','Worcester'],MI:['Detroit','Grand Rapids'],MN:['Minneapolis','Saint Paul'],MS:['Jackson'],MO:['St Louis','Kansas City'],MT:['Billings'],NE:['Omaha','Lincoln'],NV:['Las Vegas','Reno'],NH:['Manchester'],NJ:['Newark','Trenton'],NM:['Albuquerque','Santa Fe'],NY:['New York City','Buffalo','Rochester','Albany'],NC:['Charlotte','Raleigh','Greensboro'],ND:['Fargo'],OH:['Columbus','Cleveland','Cincinnati'],OK:['Oklahoma City','Tulsa'],OR:['Portland','Eugene'],PA:['Philadelphia','Pittsburgh','Harrisburg'],RI:['Providence'],SC:['Columbia','Charleston','Greenville'],SD:['Sioux Falls'],TN:['Nashville','Memphis','Knoxville'],TX:['Dallas','Houston','Austin','San Antonio','Fort Worth'],UT:['Salt Lake City','Provo'],VT:['Burlington'],VA:['Richmond','Virginia Beach','Alexandria'],WA:['Seattle','Tacoma','Spokane'],WV:['Charleston'],WI:['Milwaukee','Madison'],WY:['Cheyenne']
};

const TERMS: Record<string,string[]> = {
  PRESCHOOL_KINDERGARTEN:['preschool kindergarten','early childhood school','montessori preschool'],
  ELEMENTARY_SCHOOL:['elementary school','grade school','K-5 school'],
  MIDDLE_HIGH_SCHOOL:['middle school','high school','junior high school'],
  PRIVATE_CHARTER_SCHOOL:['private school','charter school','independent school'],
  SCHOOL_DISTRICT:['school district','public schools district','unified school district'],
  AFTER_SCHOOL_PROGRAM:['after school program','youth activity center','school enrichment program'],
  EDUCATION_SUPPLIER:['school sports equipment supplier','physical education equipment supplier','school sporting goods supplier']
  ,PUBLIC_SCHOOL:['public school','school athletics','public school purchasing']
};

const ROLE_PATTERN = '(?:Athletic Director|Director of Athletics|PE Teacher|Physical Education Teacher|Physical Education Director|Sports Coordinator|Athletic Coordinator|Activities Director|Recreation Director|Purchasing Manager|Procurement Manager|Procurement Officer|Purchasing Director|Buyer|Operations Manager|School Administrator|Business Manager|Principal|Vice Principal|Head of School|Program Director)';
const PRIORITY_ROLE = /Purchasing|Procurement|Buyer|Athletic Director|Director of Athletics|Physical Education Director/i;
const PAGE_KEYWORDS = /staff|directory|athletic|physical education|\bpe\b|purchas|procurement|vendor|business|administration|contact|department/i;

function nested(obj: unknown, path: string[]) { let cur: unknown = obj; for (const key of path) { if (!cur || typeof cur !== 'object' || !(key in cur)) return undefined; cur = (cur as Record<string,unknown>)[key]; } return cur; }
function asString(v: unknown, max = 1000) { return typeof v === 'string' ? clean(v, max) : ''; }
function normalizeWebsite(v: string) { const s = clean(v, 1000); if (!s) return ''; try { return new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`).toString(); } catch { return ''; } }
function sameHost(a: string, b: string) { try { return new URL(a).hostname.replace(/^www\./,'').toLowerCase() === new URL(b).hostname.replace(/^www\./,'').toLowerCase(); } catch { return false; } }
function validEmail(v: string) { const e = clean(v, 320).toLowerCase().replace(/^mailto:/,'').split('?')[0]; return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(e) ? e : ''; }
function emailFrom(text: string) { for (const raw of text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []) { const e = validEmail(raw); if (e && !/example\.|sentry\.|cloudflare\.|wixpress\./i.test(e)) return e; } return ''; }
function phoneFrom(text:string){return publicPhones('',text)[0]||''}
function strip(html: string) { return html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<svg[\s\S]*?<\/svg>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&#39;|&apos;/gi,"'").replace(/\s+/g,' ').trim(); }
function grade(score: number) { return score >= 80 ? 'A' : score >= 60 ? 'B' : 'C'; }

function strongName(name: string, type: string) {
  const n = name.toLowerCase();
  if(/police department|bus depot|bus barn|transportation|warehouse|school district library/.test(n))return false;
  if(type==='PRIVATE_CHARTER_SCHOOL'&&/school district|public schools/.test(n)&&!/charter/.test(n))return false;
  if (type === 'PRESCHOOL_KINDERGARTEN') return /preschool|pre-school|kindergarten|montessori|early childhood|learning center/.test(n);
  if (type === 'ELEMENTARY_SCHOOL') return /elementary|grade school|primary school|academy|school/.test(n);
  if (type === 'MIDDLE_HIGH_SCHOOL') return /middle school|junior high|high school|secondary school|academy/.test(n);
  if (type === 'PRIVATE_CHARTER_SCHOOL') return /charter|academy|school|preparatory|prep|independent/.test(n);
  if (type === 'SCHOOL_DISTRICT') return /school district|public schools|unified school|isd\b|usd\b|schools district/.test(n);
  if (type === 'AFTER_SCHOOL_PROGRAM') return /after.?school|youth|community|activity|enrichment|learning center|recreation/.test(n);
  return /school|education|educational|sport|physical education|equipment|supplier/.test(n);
}

function pageMatches(text: string, type: string) {
  const t = text.toLowerCase();
  if (type === 'EDUCATION_SUPPLIER') return /(school|education|physical education|pe equipment).{0,120}(sport|equipment|supply|supplier|products)/i.test(text);
  if (type === 'AFTER_SCHOOL_PROGRAM') return /after.?school|youth program|enrichment|student activities|community recreation/i.test(text);
  if (type === 'SCHOOL_DISTRICT') return /school district|public schools|board of education|district office/i.test(text);
  return /school|academy|kindergarten|preschool|elementary|middle school|high school|charter|education/i.test(t);
}

function contactFrom(text: string) {
  const role = new RegExp(ROLE_PATTERN, 'i');
  const nameBefore = new RegExp(`([A-Z][A-Za-z'.-]+(?:\\s+[A-Z][A-Za-z'.-]+){1,3})\\s*[,|–—-]\\s*(${ROLE_PATTERN})`, 'i');
  const titleBefore = new RegExp(`(${ROLE_PATTERN})\\s*[:|–—-]\\s*([A-Z][A-Za-z'.-]+(?:\\s+[A-Z][A-Za-z'.-]+){1,3})`, 'i');
  const a = text.match(nameBefore); if (a) return { name: clean(a[1], 100), title: clean(a[2], 120) };
  const b = text.match(titleBefore); if (b) return { name: clean(b[2], 100), title: clean(b[1], 120) };
  const r = text.match(role); return r ? { name: '', title: clean(r[0], 120) } : { name: '', title: '' };
}

function extractUsefulLinks(base: string, html: string) {
  const out: string[] = [];
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const label = strip(m[2]).slice(0, 180);
    const href = clean(m[1], 1000);
    if (!PAGE_KEYWORDS.test(`${label} ${href}`)) continue;
    try {
      const url = new URL(href, base).toString();
      if (!sameHost(url, base) || out.includes(url)) continue;
      out.push(url);
      if (out.length >= 8) break;
    } catch {}
  }
  return out;
}

async function fetchJson(url: string, timeout = 7000) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), timeout);
  try { const r = await fetch(url, { headers: { accept:'application/json', 'user-agent':'MING-EAGLE-School-Discovery/1.0 (+https://mingeagle.com)' }, signal:c.signal }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return await r.json() as Record<string,unknown>; }
  finally { clearTimeout(t); }
}
const fetchHtml=fetchPublicText;

export async function verifySchoolWebsite(url:string,type:string,state:string,city:string) {
  if(!SCHOOL_TYPES.has(type)||!allowedWebsite(url))return null;
  try {
    const html=await fetchHtml(url,5500),entity=resolveEntity(html,'',url);
    if(!entity.name||entity.score<24)return null;
    if(type==='PRIVATE_CHARTER_SCHOOL'&&/school district|public schools/i.test(entity.name)&&!/charter/i.test(entity.name))return null;
    if(type==='ELEMENTARY_SCHOOL'&&!/elementary|primary|grade school/i.test(entity.name))return null;
    if(type==='MIDDLE_HIGH_SCHOOL'&&!/middle|high school|secondary|junior high/i.test(entity.name))return null;
    const urls=[url],pages=[html];
    const extra=extractUsefulLinks(url,html).filter(link=>link!==url).slice(0,3);
    const results=await Promise.allSettled(extra.map(link=>fetchHtml(link,3800)));
    results.forEach((result,index)=>{if(result.status==='fulfilled'){pages.push(result.value);urls.push(extra[index]);}});
    const body=pages.map(strip).join(' ').slice(0,300000);
    if(!pageMatches(body,type))return null;
    const location=city||ALL_STATE_NAMES[state];
    if(!new RegExp('\\b'+location.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','i').test(body))return null;
    const email=emailFrom(pages.join('\n')),phone=publicPhones(pages.join('\n'),body)[0]||'',person=contactFrom(body);
    const purchasing=/purchas|procurement|vendor|bid|business office/i.test(body),athletics=/athletic|physical education|sports program/i.test(body);
    const score=Math.min(email||phone?95:79,70+(email?8:0)+(phone?4:0)+(purchasing?8:0)+(athletics?5:0));
    const socialProfiles=websiteSocialProfiles(pages.map((html,index)=>({html,url:urls[index]})));
    return {title:entity.name,url,snippet:'',query:'public source official website verification',city,fitScore:score,cues:['官网学校业务核验','官网地区匹配',...(purchasing?['采购页面证据']:[]),...(athletics?['体育或 PE 页面证据']:[])],orgName:entity.name,entityScore:entity.score,entitySource:entity.source,email,phone,whatsapp:'',instagram:'',facebook:'',linkedin:'',contactName:person.name,contactTitle:person.title,contactUrl:urls.find(link=>/contact|staff|directory|purchas/i.test(link))||url,sourceUrls:urls,socialProfiles};
  }catch{return null;}
}

async function searchGeo(apiKey: string, query: string, state: string) {
  const u = new URL('https://api.geoapify.com/v1/geocode/search');
  u.searchParams.set('text', query); u.searchParams.set('format','json'); u.searchParams.set('filter','countrycode:us'); u.searchParams.set('lang','en'); u.searchParams.set('limit','8'); u.searchParams.set('apiKey', apiKey);
  const data = await fetchJson(u.toString(), 6500); const results = Array.isArray(data.results) ? data.results as GeoResult[] : [];
  return results.filter(r => String(r.country_code || '').toLowerCase() === 'us' && (!r.state_code || String(r.state_code).toUpperCase() === state));
}
export async function detailsGeo(apiKey: string, id: string) {
  const u = new URL('https://api.geoapify.com/v2/place-details'); u.searchParams.set('id',id); u.searchParams.set('features','details'); u.searchParams.set('lang','en'); u.searchParams.set('apiKey',apiKey);
  const data = await fetchJson(u.toString(),6500); const features = Array.isArray(data.features) ? data.features as Array<Record<string,unknown>> : [];
  const f = features.find(x => nested(x,['properties','feature_type']) === 'details') || features[0]; return f ? ((f.properties || {}) as Record<string,unknown>) : {};
}
export function extractGeoContact(props: Record<string,unknown>) {
  const raw = (nested(props,['datasource','raw']) || {}) as Record<string,unknown>; const contact = (props.contact || {}) as Record<string,unknown>;
  const website = normalizeWebsite(asString(props.website) || asString(contact.website) || asString(raw.website) || asString(raw['contact:website']) || asString(raw.url));
  const email = validEmail(asString(contact.email) || asString(props.email) || asString(raw.email) || asString(raw['contact:email']));
  const phone = asString(contact.phone) || asString(props.phone) || asString(raw.phone) || asString(raw['contact:phone']);
  return { website, email, phone };
}

async function ensureTables(db: D1Database) {await ensureRuns(db);
  await db.prepare(`CREATE TABLE IF NOT EXISTS discovery_jobs (id TEXT PRIMARY KEY,country TEXT NOT NULL DEFAULT 'US',state_region TEXT NOT NULL,customer_type TEXT NOT NULL,target_count INTEGER NOT NULL DEFAULT 20,source_provider TEXT NOT NULL DEFAULT 'SCHOOL_GEOAPIFY',status TEXT NOT NULL DEFAULT 'RUNNING',result_count INTEGER NOT NULL DEFAULT 0,error TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,completed_at TEXT)`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS discovery_candidates (id TEXT PRIMARY KEY,source_key TEXT NOT NULL UNIQUE,source_provider TEXT NOT NULL DEFAULT 'SCHOOL_GEOAPIFY',name TEXT NOT NULL,customer_type TEXT NOT NULL,country TEXT NOT NULL DEFAULT 'US',state_region TEXT,city TEXT,address TEXT,website TEXT,email TEXT,phone TEXT,whatsapp TEXT,instagram_url TEXT,facebook_url TEXT,latitude REAL,longitude REAL,lead_score INTEGER NOT NULL DEFAULT 0,grade TEXT NOT NULL DEFAULT 'C',status TEXT NOT NULL DEFAULT 'NEW',source_url TEXT NOT NULL,source_evidence TEXT,raw_json TEXT,crm_lead_id TEXT,discovered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
  const info = await db.prepare(`PRAGMA table_info(discovery_candidates)`).all<{name:string}>(); const names = new Set(info.results.map(r => r.name));
  const columns: Array<[string,string]> = [['linkedin_url','TEXT'],['contact_person_name','TEXT'],['contact_person_title','TEXT'],['website_contact_url','TEXT'],['enrichment_status',`TEXT NOT NULL DEFAULT 'NOT_STARTED'`],['enrichment_source_urls','TEXT'],['enrichment_error','TEXT'],['enriched_at','TEXT']];
  for (const [name, definition] of columns) if (!names.has(name)) { try { await db.prepare(`ALTER TABLE discovery_candidates ADD COLUMN ${name} ${definition}`).run(); } catch {} }
}

async function save(db: D1Database, items: Candidate[], state: string, type: string, target: number,runId?:string) {
  let saved = 0; const seen = new Set<string>();
  for (const c of items.sort((a,b) => b.score - a.score)) {
    if (saved >= target) break;
    const key = `schoolgeo:${c.placeId}`; if (seen.has(key)) continue; seen.add(key);
    const evidence = `School Discovery V1 · ${c.cues.join(' · ')} · query=${c.sourceQuery}`.slice(0, 1500);
    const sourceUrl = c.website || `https://www.openstreetmap.org/search?query=${encodeURIComponent(c.name + ' ' + c.city)}`;
    const newId=crypto.randomUUID(); const row=await db.prepare(`INSERT INTO discovery_candidates (id,source_key,source_provider,name,customer_type,state_region,city,address,website,email,phone,latitude,longitude,lead_score,grade,status,source_url,source_evidence,raw_json,contact_person_name,contact_person_title,website_contact_url,enrichment_status,enrichment_source_urls,enriched_at) VALUES (?,?, 'GEOAPIFY_SCHOOL_V1',?,?,?,?,?,?,?,?,?,?,?,?, 'NEW',?,?,?,?,?,?,'COMPLETED',?,CURRENT_TIMESTAMP) ON CONFLICT(source_key) DO UPDATE SET customer_type=excluded.customer_type,state_region=excluded.state_region,city=COALESCE(excluded.city,discovery_candidates.city),address=COALESCE(excluded.address,discovery_candidates.address),website=COALESCE(excluded.website,discovery_candidates.website),email=COALESCE(excluded.email,discovery_candidates.email),phone=COALESCE(excluded.phone,discovery_candidates.phone),latitude=COALESCE(excluded.latitude,discovery_candidates.latitude),longitude=COALESCE(excluded.longitude,discovery_candidates.longitude),lead_score=MAX(discovery_candidates.lead_score,excluded.lead_score),grade=CASE WHEN MAX(discovery_candidates.lead_score,excluded.lead_score)>=80 THEN 'A' WHEN MAX(discovery_candidates.lead_score,excluded.lead_score)>=60 THEN 'B' ELSE 'C' END,contact_person_name=COALESCE(excluded.contact_person_name,discovery_candidates.contact_person_name),contact_person_title=COALESCE(excluded.contact_person_title,discovery_candidates.contact_person_title),website_contact_url=COALESCE(excluded.website_contact_url,discovery_candidates.website_contact_url),source_evidence=excluded.source_evidence,enrichment_status='COMPLETED',enrichment_source_urls=excluded.enrichment_source_urls,enriched_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE discovery_candidates.status<>'IGNORED' RETURNING id`).bind(
      newId, key, c.name, type, state, c.city || null, c.address || null, c.website || null, c.email || null, c.phone || null, c.lat, c.lon, c.score, grade(c.score), sourceUrl, evidence,
      JSON.stringify({ placeId:c.placeId, sourceQuery:c.sourceQuery, verified:c.verified, cues:c.cues }), c.contactName || null, c.contactTitle || null, c.contactUrl || null, JSON.stringify(c.sourceUrls)
    ).first<{id:string}>();
    if(row){await recordResult(db,runId,row,newId);saved++;}
  }
  return saved;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.MINGEAGLE_DB) return Response.json({ ok:false, error:'Database is not configured.', release:RELEASE }, { status:503 });
  if (!env.GEOAPIFY_API_KEY) return Response.json({ ok:false, error:'GEOAPIFY_API_KEY_NOT_CONFIGURED', release:RELEASE }, { status:503 });
  const db = env.MINGEAGLE_DB; await ensureTables(db); let jobId = '';
  try {
    const input = await request.json() as Input; const state = clean(input.stateCode,2).toUpperCase(); const type = clean(input.customerType,80).toUpperCase(); const target = Math.min(60,Math.max(10,Math.round(Number(input.targetCount || 20))));
    if (!allowedState.test(state)) return Response.json({ ok:false, error:'请选择有效的美国州。', release:RELEASE }, { status:400 });
    if (!SCHOOL_TYPES.has(type)) return Response.json({ ok:false, error:'不支持的学校/教育客户类型。', release:RELEASE }, { status:400 });

    let parsed;try{parsed=parseSearch(input)}catch(e){return Response.json({ok:false,error:(e as Error).message},{status:400})}const cities = parsed.city?[parsed.city]:(ALL_METROS[state] || []); const locations = cities.length ? cities : [state]; const terms = TERMS[type] || ['school'];
    const allQueries=terms.flatMap(term=>locations.map(city=>`${term} ${city} ${ALL_STATE_NAMES[state]} USA`));const offset=(parsed.round*8)%allQueries.length;const queries=Array.from({length:Math.min(8,allQueries.length)},(_,i)=>allQueries[(offset+i)%allQueries.length]);
    if(input.autoRunId)await assertAutoLease(db,input);
    jobId = sourceJobId(input,'GEOAPIFY_SCHOOL_V1',parsed.round);
    await db.prepare(`INSERT OR IGNORE INTO discovery_jobs (id,state_region,customer_type,target_count,source_provider) VALUES (?,?,?,?,'GEOAPIFY_SCHOOL_V1')`).bind(jobId,state,type,target).run();
    if(input.autoSourceOnly)await ensureClues(db);
    const {locationsFound,rawCount}=await sourceSnapshot(db,input,'GEOAPIFY_SCHOOL_V1',parsed.round,async()=>{
        const searchRs = await Promise.allSettled(queries.map(q => searchGeo(env.GEOAPIFY_API_KEY!,q,state).then(results => ({ q, results }))));
        if(searchRs.every(r=>r.status==='rejected'))throw new Error('学校地点查询全部失败，请稍后重试。');const raw: Array<{q:string;r:GeoResult}> = []; for (const s of searchRs) if (s.status === 'fulfilled') for (const r of s.value.results) raw.push({ q:s.value.q, r });
        const byPlace = new Map<string,{q:string;r:GeoResult}>(); for (const x of raw) { if(parsed.city&&clean(x.r.city,100).toLowerCase()!==parsed.city.toLowerCase())continue; const id = clean(x.r.place_id,300); const name = clean(x.r.name || x.r.formatted,180); if (!id || !name || !strongName(name,type)) continue; if (!byPlace.has(id)) byPlace.set(id,x); }
      return {locationsFound:[...byPlace.values()],rawCount:raw.length};
    });
    const started=Date.now();
    const byPlace=new Map(locationsFound.map(({q,r})=>[clean(r.place_id,300),{q,r}]));
    if(input.autoSourceOnly){
      await assertAutoLease(db,input);
      const allSeeds=[...byPlace.values()].slice(0,target).map(({q,r})=>({key:'school-map:'+r.place_id,title:clean(r.name||r.formatted,180),source:'SCHOOL_GEOAPIFY',url:'https://www.openstreetmap.org/search?query='+encodeURIComponent(clean(r.name,180)+' '+clean(r.city,80)),evidence:q+' · 地图信息待官网核验',city:clean(r.city,80),address:clean(r.formatted,500),raw:{placeId:clean(r.place_id,300)}}));
      const offset=Number(input.sourceOffset||0);
      if(!Number.isInteger(offset)||offset<0||offset>100)return Response.json({ok:false,error:'来源游标无效。'},{status:400});
      const seeds=allSeeds.slice(offset,offset+4);
      const foundIds=await saveAutoClues(db,{...input,customerType:type},seeds);
      const hasMore=offset+4<allSeeds.length;
      await db.prepare(`UPDATE discovery_jobs SET status=?,result_count=MAX(result_count,?),error=NULL,completed_at=CASE WHEN ? THEN NULL ELSE CURRENT_TIMESTAMP END WHERE id=?`).bind(hasMore?'RUNNING':'COMPLETED',offset+foundIds.length,hasMore?1:0,jobId).run();
      return Response.json({ok:true,found:foundIds.length,available:allSeeds.length,hasMore,nextOffset:hasMore?offset+4:null,foundIds,note:'学校地图线索已分批保存，地点详情和官网核验将分步继续。'});
    }
    const shortlist = [...byPlace.values()].slice(0,Math.min(28,target + 12)); const candidates: Candidate[] = []; let detailsChecked = 0; let websiteChecked = 0;

    for (let i=0;i<shortlist.length;i+=3) {
      if (Date.now() - started > 26000) break;
      const batch = shortlist.slice(i,i+3);
      const rs = await Promise.allSettled(batch.map(async x => {
        detailsChecked++; const props = await detailsGeo(env.GEOAPIFY_API_KEY!,clean(x.r.place_id,300)); const geo = extractGeoContact(props);
        const name = clean(asString(props.name,180) || x.r.name || x.r.formatted,180); const city = clean(asString(props.city,100) || x.r.city,100); const address = clean(asString(props.formatted,320) || x.r.formatted,320);if(parsed.city&&city.toLowerCase()!==parsed.city.toLowerCase())return null;if(props.state_code&&String(props.state_code).toUpperCase()!==state)return null;
        let email = geo.email, phone = publicPhone(geo.phone), contactName = '', contactTitle = '', contactUrl = '', verified = false, score = 48;
        const cues: string[] = []; const sourceUrls: string[] = []; if (strongName(name,type)) { score += 10; cues.push('name matches customer type'); }
        if (geo.website) {
          score += 8; websiteChecked++;
          try {
            const homeHtml = await fetchHtml(geo.website); sourceUrls.push(geo.website); const homeText = strip(homeHtml).slice(0,240000);
            if (pageMatches(homeText,type)) { verified = true; score += 10; cues.push('official website verified'); }
            if (!email) email = emailFrom(homeHtml); if (!phone) phone = phoneFrom(homeText);
            const links = extractUsefulLinks(geo.website, homeHtml).slice(0,4);
            for (const url of links) {
              if (Date.now() - started > 26000) break;
              try {
                const html = await fetchHtml(url,4200); sourceUrls.push(url); const text = strip(html).slice(0,180000); if (!email) email = emailFrom(html); if (!phone) phone = phoneFrom(text);
                if (/athletic|physical education|\bPE\b|sports program/i.test(text)) { score += 8; cues.push('athletics / PE page found'); }
                if (/purchas|procurement|vendor|bid|RFP|business office/i.test(text)) { score += 12; cues.push('purchasing / procurement cue found'); }
                const contact = contactFrom(text); if (contact.title && !contactTitle) { contactName = contact.name; contactTitle = contact.title; contactUrl = url; score += 12; cues.push(`contact role: ${contact.title}`); if (PRIORITY_ROLE.test(contact.title)) score += 5; }
              } catch {}
            }
          } catch { score -= 2; }
        }
        if (email) { score += 8; cues.push('public email found'); } if (phone) { score += 4; cues.push('public phone found'); }
        if (!verified && !strongName(name,type)) return null;
        return { placeId:clean(x.r.place_id,300), name, city, state, address, lat:Number(x.r.lat)||null, lon:Number(x.r.lon)||null, website:geo.website, email, phone, score:Math.min(verified&&(email||phone)?98:79,score), sourceQuery:x.q, verified, contactName, contactTitle, contactUrl, cues:[...new Set(cues)], sourceUrls:[...new Set(sourceUrls)] } as Candidate;
      }));
      candidates.push(...rs.flatMap(r => r.status === 'fulfilled' && r.value ? [r.value] : [])); if (candidates.length >= target) break;
    }

    const found = await save(db,candidates,state,type,target,input.runId); await db.prepare(`UPDATE discovery_jobs SET status='COMPLETED',result_count=?,completed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(found,jobId).run();
    return Response.json({ ok:true, release:RELEASE, found, checked:detailsChecked, verified:candidates.filter(c=>c.verified).length, rawCount, uniquePlaces:byPlace.size, websiteChecked, elapsedMs:Date.now()-started, provider:'GEOAPIFY_SCHOOL_V1', mode:'SCHOOL_PROCUREMENT_V1', note:`学校/教育客户发现完成：搜索 ${queries.length} 个地点关键词，优先识别学校官网、PE/体育部门、采购/Procurement/Vendor 页面和公开联系人。` });
  } catch (error) {
    console.error('school_discovery_failed', error); if (jobId) { try { await db.prepare(`UPDATE discovery_jobs SET status='FAILED',error=?,completed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(error instanceof Error ? error.message : String(error),jobId).run(); } catch {} }
    return Response.json({ ok:false, error:error instanceof Error ? error.message : '学校客户发现失败。', release:RELEASE }, { status:500 });
  }
};
