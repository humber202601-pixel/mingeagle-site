interface Env { MINGEAGLE_DB: D1Database }

type Input = { stateCode?: string; customerType?: string; targetCount?: number | string };
type SearchHit = { title:string; url:string; snippet:string; query:string; city:string };
type VerifiedHit = SearchHit & { fitScore:number; cues:string[]; orgName:string };

const clean=(v:unknown,max=1000)=>typeof v==='string'?v.trim().slice(0,max):'';
const allowedState=/^[A-Z]{2}$/;
const allowedTypes=new Set(['BASKETBALL_TRAINING','BASKETBALL_GYM','YOUTH_CLUB','SPORTS_STORE']);

const METROS:Record<string,string[]>={
  AL:['Birmingham','Mobile'],AK:['Anchorage'],AZ:['Phoenix','Tucson'],AR:['Little Rock'],CA:['Los Angeles','San Francisco','San Diego','Sacramento'],CO:['Denver','Colorado Springs'],CT:['Hartford','New Haven'],DE:['Wilmington'],FL:['Miami','Orlando','Tampa','Jacksonville'],GA:['Atlanta','Savannah'],HI:['Honolulu'],ID:['Boise'],IL:['Chicago','Springfield'],IN:['Indianapolis','Fort Wayne'],IA:['Des Moines','Iowa City'],KS:['Wichita','Topeka'],KY:['Louisville','Lexington'],LA:['New Orleans','Baton Rouge'],ME:['Portland'],MD:['Baltimore','Annapolis'],MA:['Boston','Worcester'],MI:['Detroit','Grand Rapids'],MN:['Minneapolis','Saint Paul'],MS:['Jackson','Gulfport'],MO:['St Louis','Kansas City'],MT:['Billings','Missoula'],NE:['Omaha','Lincoln'],NV:['Las Vegas','Reno'],NH:['Manchester'],NJ:['Newark','Trenton'],NM:['Albuquerque','Santa Fe'],NY:['New York City','Buffalo','Rochester','Albany'],NC:['Charlotte','Raleigh','Greensboro'],ND:['Fargo','Bismarck'],OH:['Columbus','Cleveland','Cincinnati'],OK:['Oklahoma City','Tulsa'],OR:['Portland','Eugene'],PA:['Philadelphia','Pittsburgh','Harrisburg'],RI:['Providence'],SC:['Columbia','Charleston','Greenville'],SD:['Sioux Falls','Rapid City'],TN:['Nashville','Memphis','Knoxville'],TX:['Dallas','Houston','Austin','San Antonio','Fort Worth'],UT:['Salt Lake City','Provo'],VT:['Burlington'],VA:['Richmond','Virginia Beach','Alexandria'],WA:['Seattle','Tacoma','Spokane'],WV:['Charleston','Morgantown'],WI:['Milwaukee','Madison'],WY:['Cheyenne']
};
const STATE_NAMES:Record<string,string>={AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming'};
const TERMS:Record<string,string[]>={
  BASKETBALL_TRAINING:['basketball academy','basketball training','basketball skills training','basketball player development'],
  BASKETBALL_GYM:['basketball gym','basketball training facility','indoor basketball court','basketball sports center'],
  YOUTH_CLUB:['youth basketball club','AAU basketball','youth basketball academy','basketball tryouts'],
  SPORTS_STORE:['basketball sporting goods','basketball equipment store','sports store basketball','basketball retail']
};
const BLOCKED_DOMAINS=['bing.com','google.com','duckduckgo.com','yahoo.com','yelp.com','facebook.com','instagram.com','linkedin.com','youtube.com','wikipedia.org','reddit.com','x.com','twitter.com','tiktok.com','pinterest.com','yellowpages.com','mapquest.com','tripadvisor.com','indeed.com','ziprecruiter.com','chamberofcommerce.com','manta.com','bbb.org','maxpreps.com','hudl.com','eventbrite.com','foursquare.com','nba.com','wnba.com','espn.com','cbssports.com','foxsports.com','basketball-reference.com','flashscore.com','livescore.com','sofascore.com','crazygames.com','poki.com','games.com','formula1.com'];
const HARD_NEGATIVE=/\b(formula\s*1|motorsport|racing|live\s*score|livescore|statistics|standings|box\s*score|video game|online game|play game|basketball reference|betting|odds|race calendar|full race)\b/i;
const GENERIC_NAME=/^(home|basketball|adult basketball|youth basketball|basketball training|basketball academy|basketball program|basketball programs|training|academy|program|programs|sports|athletics|contact|about|team|coaches|coach|schedule|calendar)$/i;

const STRONG_PAIR:Record<string,RegExp>={
  BASKETBALL_TRAINING:/(?:basketball|hoops).{0,90}(?:academy|training|skills?|coaching|player development|private lessons?|development program)|(?:academy|training|skills?|coaching|player development|private lessons?|development program).{0,90}(?:basketball|hoops)/i,
  BASKETBALL_GYM:/(?:basketball|hoops).{0,90}(?:gym|facility|sports? cent(?:er|re)|court rental|open gym|indoor court|training center)|(?:gym|facility|sports? cent(?:er|re)|court rental|open gym|indoor court|training center).{0,90}(?:basketball|hoops)/i,
  YOUTH_CLUB:/(?:basketball|hoops).{0,90}(?:youth|aau|club|tryouts?|team program|league)|(?:youth|aau|club|tryouts?|team program|league).{0,90}(?:basketball|hoops)/i,
  SPORTS_STORE:/(?:basketball|hoops).{0,90}(?:sporting goods|store|shop|equipment|retail|gear|balls?|shoes?)|(?:sporting goods|store|shop|equipment|retail|gear).{0,90}(?:basketball|hoops)/i
};

async function ensureTables(db:D1Database){
  await db.prepare(`CREATE TABLE IF NOT EXISTS discovery_jobs (id TEXT PRIMARY KEY,country TEXT NOT NULL DEFAULT 'US',state_region TEXT NOT NULL,customer_type TEXT NOT NULL,target_count INTEGER NOT NULL DEFAULT 20,source_provider TEXT NOT NULL DEFAULT 'OPENSTREETMAP',status TEXT NOT NULL DEFAULT 'RUNNING',result_count INTEGER NOT NULL DEFAULT 0,error TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,completed_at TEXT)`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS discovery_candidates (id TEXT PRIMARY KEY,source_key TEXT NOT NULL UNIQUE,source_provider TEXT NOT NULL DEFAULT 'OPENSTREETMAP',name TEXT NOT NULL,customer_type TEXT NOT NULL,country TEXT NOT NULL DEFAULT 'US',state_region TEXT,city TEXT,address TEXT,website TEXT,email TEXT,phone TEXT,whatsapp TEXT,instagram_url TEXT,facebook_url TEXT,latitude REAL,longitude REAL,lead_score INTEGER NOT NULL DEFAULT 0,grade TEXT NOT NULL DEFAULT 'C',status TEXT NOT NULL DEFAULT 'NEW',source_url TEXT NOT NULL,source_evidence TEXT,raw_json TEXT,crm_lead_id TEXT,discovered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
  const info=await db.prepare(`PRAGMA table_info(discovery_candidates)`).all<{name:string}>();const names=new Set(info.results.map(r=>r.name));
  for(const [name,definition] of [['contact_person_name','TEXT'],['contact_person_title','TEXT'],['enrichment_status',`TEXT NOT NULL DEFAULT 'NOT_STARTED'`]] as Array<[string,string]>){if(!names.has(name)){try{await db.prepare(`ALTER TABLE discovery_candidates ADD COLUMN ${name} ${definition}`).run()}catch{}}}
}
function decode(v:string){return v.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&apos;|&#39;|&#x27;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)))}
function strip(v:string){return decode(v.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<svg[\s\S]*?<\/svg>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim())}
function xml(block:string,tag:string){const m=block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`,'i'));return m?strip(m[1]):''}
function domainOf(v:string){try{return new URL(v).hostname.toLowerCase().replace(/^www\./,'')}catch{return ''}}
function allowedWebsite(v:string){try{const u=new URL(v);const h=u.hostname.toLowerCase().replace(/^www\./,'');return ['http:','https:'].includes(u.protocol)&&!!h&&!BLOCKED_DOMAINS.some(d=>h===d||h.endsWith(`.${d}`))}catch{return false}}
function grade(score:number){return score>=80?'A':score>=60?'B':'C'}

async function fetchText(url:string,timeout=6000){const c=new AbortController();const t=setTimeout(()=>c.abort(),timeout);try{const r=await fetch(url,{headers:{accept:'text/html,application/xhtml+xml,application/rss+xml,application/xml;q=0.9,*/*;q=0.8','accept-language':'en-US,en;q=0.9','user-agent':'Mozilla/5.0 (compatible; MING-EAGLE-Discovery/6.0; +https://mingeagle.com)'},redirect:'follow',signal:c.signal});if(!r.ok)throw new Error(`HTTP ${r.status}`);return (await r.text()).slice(0,650000)}finally{clearTimeout(t)}}

function metaContent(html:string,key:string){
  const escaped=key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const patterns=[
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,'i')
  ];
  for(const p of patterns){const m=html.match(p);if(m)return strip(m[1])}return '';
}
function titleText(html:string){const m=html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);return m?strip(m[1]):''}
function genericName(value:string){const v=clean(value,120).replace(/\s+/g,' ');if(!v||v.length<3||v.length>100)return true;if(GENERIC_NAME.test(v))return true;if(HARD_NEGATIVE.test(v))return true;if(/^\d+$/.test(v))return true;return false}
function humanizeDomain(domain:string){const stem=domain.split('.')[0].replace(/[-_]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase());return stem.slice(0,100)}
function orgNameFromPage(html:string,searchTitle:string,url:string){
  const domain=domainOf(url);const candidates:string[]=[];
  for(const key of ['og:site_name','application-name','apple-mobile-web-app-title']){const v=metaContent(html,key);if(v)candidates.push(v)}
  const titles=[titleText(html),searchTitle].filter(Boolean);
  for(const title of titles){const parts=title.split(/\s+[|–—:]\s+|\s+-\s+/).map(x=>clean(x,120)).filter(Boolean);candidates.push(...parts.slice().reverse(),...parts)}
  const logoAlts=[...html.matchAll(/<img[^>]+alt=["']([^"']+)["'][^>]*>/gi)].map(m=>strip(m[1])).filter(v=>/academy|basketball|hoops|sports|training|club|gym|athletic/i.test(v));candidates.push(...logoAlts.slice(0,3));
  for(const raw of candidates){const value=raw.replace(/\s+(official site|home page)$/i,'').trim();if(!genericName(value))return value.slice(0,100)}
  return humanizeDomain(domain);
}

async function bing(query:string,city:string){
  const q=`${query} -Formula1 -racing -livescore -stats -standings -betting -games`;
  const data=await fetchText(`https://www.bing.com/search?q=${encodeURIComponent(q)}&format=rss&mkt=en-US&setlang=en-US`,7000);
  const items=data.match(/<item\b[\s\S]*?<\/item>/gi)||[];const out:SearchHit[]=[];const seen=new Set<string>();
  for(const item of items){const title=xml(item,'title'),url=decode(xml(item,'link')),snippet=xml(item,'description');const d=domainOf(url);if(!title||!url||!d||seen.has(d)||!allowedWebsite(url))continue;if(HARD_NEGATIVE.test(`${title} ${snippet}`))continue;seen.add(d);out.push({title,url,snippet,query,city});if(out.length>=12)break}
  return out;
}
function extractSameOriginLinks(html:string,baseUrl:string){const links:string[]=[];const seen=new Set<string>();let base:URL;try{base=new URL(baseUrl)}catch{return links}const re=/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>/gi;let m:RegExpExecArray|null;while((m=re.exec(html))){try{const u=new URL(decode(m[1]),base);if(u.origin!==base.origin)continue;if(!/(about|contact|program|training|coach|team|staff|basketball|skills|clinic|camp|facility|court|shop|store|membership|lesson)/i.test(u.pathname))continue;const href=u.toString();if(seen.has(href))continue;seen.add(href);links.push(href);if(links.length>=5)break}catch{}}return links}

function scoreBusiness(hit:SearchHit,body:string,type:string,stateCode:string,orgName:string){
  const searchText=`${hit.title} ${hit.snippet}`;const all=`${searchText} ${body}`;
  if(HARD_NEGATIVE.test(searchText)||genericName(orgName))return {score:0,cues:['invalid-entity']};
  const pair=STRONG_PAIR[type];if(!pair||!pair.test(body))return {score:0,cues:['no-strong-business-pair']};
  const cues:string[]=['strong-business-pair','organization-identified'];let score=72;
  if(pair.test(searchText)){score+=8;cues.push('pair-in-search')}
  if(/programs?|services?|register|book|lessons?|sessions?|membership|pricing|enroll|tryouts?|teams?|shop|store|classes/i.test(body)){score+=7;cues.push('commercial-language')}
  if(/contact|about|team|coach|staff|director|owner|founder/i.test(body)){score+=5;cues.push('organization-language')}
  const state=(STATE_NAMES[stateCode]||'').toLowerCase();const lower=all.toLowerCase();const local=[hit.city.toLowerCase(),state,stateCode.toLowerCase()].filter(Boolean).some(x=>lower.includes(x));if(local){score+=8;cues.push('local-match')}
  return {score:Math.min(100,score),cues};
}

async function verifyHit(hit:SearchHit,type:string,stateCode:string):Promise<VerifiedHit|null>{
  try{
    const html=await fetchText(hit.url,5500);let body=strip(html).slice(0,150000);
    const orgName=orgNameFromPage(html,hit.title,hit.url);if(genericName(orgName))return null;
    const links=extractSameOriginLinks(html,hit.url).slice(0,2);
    if(links.length){const extra=await Promise.allSettled(links.map(url=>fetchText(url,4000)));for(const r of extra){if(r.status==='fulfilled')body+=` ${strip(r.value).slice(0,55000)}`}}
    const f=scoreBusiness(hit,body,type,stateCode,orgName);if(f.score<72)return null;
    return {...hit,fitScore:f.score,cues:f.cues,orgName};
  }catch{return null}
}

async function save(db:D1Database,hits:VerifiedHit[],stateCode:string,type:string,target:number){
  let saved=0;const seen=new Set<string>();
  for(const h of hits){if(saved>=target)break;const domain=domainOf(h.url);if(!domain||seen.has(domain))continue;seen.add(domain);const leadScore=Math.min(94,62+Math.round(h.fitScore*0.30));const evidence=`Verified web V5 · entity=${h.orgName} · fit=${h.fitScore} · cues=${h.cues.join(',')} · query=${h.query}`.slice(0,1000);
    await db.prepare(`INSERT INTO discovery_candidates (id,source_key,source_provider,name,customer_type,state_region,city,website,lead_score,grade,status,source_url,source_evidence,raw_json) VALUES (?,?, 'WEB_SEARCH_VERIFIED_V5',?,?,?,?,?,?,?,'NEW',?,?,?) ON CONFLICT(source_key) DO UPDATE SET source_provider='WEB_SEARCH_VERIFIED_V5',name=excluded.name,customer_type=excluded.customer_type,state_region=excluded.state_region,city=excluded.city,website=excluded.website,lead_score=excluded.lead_score,grade=excluded.grade,status=CASE WHEN discovery_candidates.status='CRM' THEN 'CRM' ELSE 'NEW' END,source_url=excluded.source_url,source_evidence=excluded.source_evidence,raw_json=excluded.raw_json,contact_person_name=CASE WHEN discovery_candidates.status='CRM' THEN discovery_candidates.contact_person_name ELSE NULL END,contact_person_title=CASE WHEN discovery_candidates.status='CRM' THEN discovery_candidates.contact_person_title ELSE NULL END,enrichment_status=CASE WHEN discovery_candidates.status='CRM' THEN discovery_candidates.enrichment_status ELSE 'NOT_STARTED' END,updated_at=CURRENT_TIMESTAMP`)
      .bind(crypto.randomUUID(),`web:${domain}`,h.orgName,type,stateCode,h.city,h.url,leadScore,grade(leadScore),h.url,evidence,JSON.stringify({title:h.title,snippet:h.snippet,query:h.query,city:h.city,fitScore:h.fitScore,cues:h.cues,orgName:h.orgName})).run();saved++
  }
  return saved;
}

export const onRequestPost:PagesFunction<Env>=async({request,env})=>{
  if(!env.MINGEAGLE_DB)return Response.json({ok:false,error:'Database is not configured.'},{status:503});
  const db=env.MINGEAGLE_DB;await ensureTables(db);let jobId='';
  try{
    const input=await request.json() as Input;const stateCode=clean(input.stateCode,2).toUpperCase();const type=clean(input.customerType,80).toUpperCase();const target=Math.min(100,Math.max(10,Math.round(Number(input.targetCount||20))));
    if(!allowedState.test(stateCode)||!METROS[stateCode])return Response.json({ok:false,error:'请选择有效的美国州。'},{status:400});
    if(!allowedTypes.has(type))return Response.json({ok:false,error:'不支持的客户类型。'},{status:400});

    await db.prepare(`UPDATE discovery_candidates SET status='IGNORED',lead_score=0,grade='C',source_evidence='Quarantined by V5: entity or business identity not revalidated',updated_at=CURRENT_TIMESTAMP WHERE source_provider LIKE 'WEB_SEARCH%' AND source_provider<>'WEB_SEARCH_VERIFIED_V5' AND status='NEW'`).run();

    jobId=crypto.randomUUID();await db.prepare(`INSERT INTO discovery_jobs (id,state_region,customer_type,target_count,source_provider) VALUES (?,?,?,?, 'WEB_SEARCH_VERIFIED_V5')`).bind(jobId,stateCode,type,target).run();
    const metros=METROS[stateCode].slice(0,5),terms=TERMS[type]||['basketball'];
    const queries=metros.flatMap(city=>terms.slice(0,3).map(term=>({city,query:`${term} ${city} ${STATE_NAMES[stateCode]||stateCode}`}))).slice(0,12);
    const searched=await Promise.allSettled(queries.map(q=>bing(q.query,q.city)));const raw=searched.flatMap(r=>r.status==='fulfilled'?r.value:[]);
    const unique:SearchHit[]=[];const domains=new Set<string>();for(const h of raw){const d=domainOf(h.url);if(!d||domains.has(d))continue;domains.add(d);unique.push(h);if(unique.length>=Math.max(24,target*3))break}
    if(!unique.length){await db.prepare(`UPDATE discovery_jobs SET status='COMPLETED',result_count=0,completed_at=CURRENT_TIMESTAMP,error='No public website candidates returned' WHERE id=?`).bind(jobId).run();return Response.json({ok:true,found:0,mode:'WEB_VERIFIED_V5',checked:0,verified:0,note:'公开搜索本次未返回可验证官网候选。'})}
    const verified:VerifiedHit[]=[];for(let i=0;i<unique.length;i+=4){const batch=unique.slice(i,i+4);const result=await Promise.allSettled(batch.map(h=>verifyHit(h,type,stateCode)));verified.push(...result.flatMap(x=>x.status==='fulfilled'&&x.value?[x.value]:[]));if(verified.length>=target)break}
    const found=await save(db,verified.sort((a,b)=>b.fitScore-a.fitScore),stateCode,type,target);
    await db.prepare(`UPDATE discovery_jobs SET status='COMPLETED',result_count=?,completed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(found,jobId).run();
    return Response.json({ok:true,found,mode:'WEB_VERIFIED_V5',checked:unique.length,verified:verified.length,note:found?`V5 已确认 ${found} 个具备明确机构身份和目标业务信号的候选。`:'本次没有候选同时通过机构身份与业务验证。'});
  }catch(error){const msg=error instanceof Error?error.message:'Web verification V5 failed.';if(jobId)await db.prepare(`UPDATE discovery_jobs SET status='FAILED',error=?,completed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(msg.slice(0,1000),jobId).run();return Response.json({ok:false,error:msg},{status:502})}
};