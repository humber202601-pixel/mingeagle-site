interface Env { MINGEAGLE_DB: D1Database }

type Input = { stateCode?: string; customerType?: string; targetCount?: number | string };
type SearchHit = { title:string; url:string; snippet:string; query:string; city:string };
type VerifiedHit = SearchHit & { fitScore:number; cues:string[] };

const clean=(v:unknown,max=1000)=>typeof v==='string'?v.trim().slice(0,max):'';
const allowedState=/^[A-Z]{2}$/;
const allowedTypes=new Set(['BASKETBALL_TRAINING','BASKETBALL_GYM','YOUTH_CLUB','SPORTS_STORE']);

const METROS:Record<string,string[]>={
  AL:['Birmingham','Mobile'],AK:['Anchorage'],AZ:['Phoenix','Tucson'],AR:['Little Rock'],CA:['Los Angeles','San Francisco','San Diego','Sacramento'],CO:['Denver','Colorado Springs'],CT:['Hartford','New Haven'],DE:['Wilmington'],FL:['Miami','Orlando','Tampa','Jacksonville'],GA:['Atlanta','Savannah'],HI:['Honolulu'],ID:['Boise'],IL:['Chicago','Springfield'],IN:['Indianapolis','Fort Wayne'],IA:['Des Moines','Iowa City'],KS:['Wichita','Topeka'],KY:['Louisville','Lexington'],LA:['New Orleans','Baton Rouge'],ME:['Portland'],MD:['Baltimore','Annapolis'],MA:['Boston','Worcester'],MI:['Detroit','Grand Rapids'],MN:['Minneapolis','Saint Paul'],MS:['Jackson','Gulfport'],MO:['St Louis','Kansas City'],MT:['Billings','Missoula'],NE:['Omaha','Lincoln'],NV:['Las Vegas','Reno'],NH:['Manchester'],NJ:['Newark','Trenton'],NM:['Albuquerque','Santa Fe'],NY:['New York City','Buffalo','Rochester','Albany'],NC:['Charlotte','Raleigh','Greensboro'],ND:['Fargo','Bismarck'],OH:['Columbus','Cleveland','Cincinnati'],OK:['Oklahoma City','Tulsa'],OR:['Portland','Eugene'],PA:['Philadelphia','Pittsburgh','Harrisburg'],RI:['Providence'],SC:['Columbia','Charleston','Greenville'],SD:['Sioux Falls','Rapid City'],TN:['Nashville','Memphis','Knoxville'],TX:['Dallas','Houston','Austin','San Antonio','Fort Worth'],UT:['Salt Lake City','Provo'],VT:['Burlington'],VA:['Richmond','Virginia Beach','Alexandria'],WA:['Seattle','Tacoma','Spokane'],WV:['Charleston','Morgantown'],WI:['Milwaukee','Madison'],WY:['Cheyenne']
};
const STATE_NAMES:Record<string,string>={AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming'};
const TERMS:Record<string,string[]>={
  BASKETBALL_TRAINING:['basketball academy','basketball training','basketball skills coach'],
  BASKETBALL_GYM:['basketball gym','basketball training facility','indoor basketball court'],
  YOUTH_CLUB:['youth basketball club','AAU basketball club','youth basketball academy'],
  SPORTS_STORE:['basketball sporting goods store','basketball equipment store','sporting goods basketball']
};

const BLOCKED_DOMAINS=['bing.com','google.com','duckduckgo.com','yahoo.com','yelp.com','facebook.com','instagram.com','linkedin.com','youtube.com','wikipedia.org','reddit.com','x.com','twitter.com','tiktok.com','pinterest.com','yellowpages.com','mapquest.com','tripadvisor.com','indeed.com','ziprecruiter.com','chamberofcommerce.com','manta.com','bbb.org','maxpreps.com','hudl.com','eventbrite.com','foursquare.com','nba.com','wnba.com','espn.com','cbssports.com','foxsports.com','basketball-reference.com','flashscore.com','livescore.com','sofascore.com','crazygames.com','poki.com','games.com','formula1.com'];
const HARD_NEGATIVE=/\b(formula\s*1|f1\b|live\s*score|livescore|scores?|results?|statistics|stats|standings|fixtures?|calendar|full race|race calendar|motorsport|news|highlights?|stream|streaming|fantasy|video game|online game|play game|basketball reference|nba|wnba|betting|odds)\b/i;
const BASKETBALL=/\b(basketball|hoops)\b/i;
const TARGET_SIGNAL:Record<string,RegExp>={
  BASKETBALL_TRAINING:/\b(academy|training|skills?|coach|coaching|player development|private lessons?|clinic|camp)\b/i,
  BASKETBALL_GYM:/\b(gym|facility|sports? cent(?:er|re)|court|open gym|court rental|training center)\b/i,
  YOUTH_CLUB:/\b(youth|aau|club|tryouts?|teams?|league|academy)\b/i,
  SPORTS_STORE:/\b(sporting goods|store|shop|equipment|retail|basketball gear|basketball shoes|basketballs?)\b/i
};

async function ensureTables(db:D1Database){
  await db.prepare(`CREATE TABLE IF NOT EXISTS discovery_jobs (id TEXT PRIMARY KEY,country TEXT NOT NULL DEFAULT 'US',state_region TEXT NOT NULL,customer_type TEXT NOT NULL,target_count INTEGER NOT NULL DEFAULT 20,source_provider TEXT NOT NULL DEFAULT 'OPENSTREETMAP',status TEXT NOT NULL DEFAULT 'RUNNING',result_count INTEGER NOT NULL DEFAULT 0,error TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,completed_at TEXT)`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS discovery_candidates (id TEXT PRIMARY KEY,source_key TEXT NOT NULL UNIQUE,source_provider TEXT NOT NULL DEFAULT 'OPENSTREETMAP',name TEXT NOT NULL,customer_type TEXT NOT NULL,country TEXT NOT NULL DEFAULT 'US',state_region TEXT,city TEXT,address TEXT,website TEXT,email TEXT,phone TEXT,whatsapp TEXT,instagram_url TEXT,facebook_url TEXT,latitude REAL,longitude REAL,lead_score INTEGER NOT NULL DEFAULT 0,grade TEXT NOT NULL DEFAULT 'C',status TEXT NOT NULL DEFAULT 'NEW',source_url TEXT NOT NULL,source_evidence TEXT,raw_json TEXT,crm_lead_id TEXT,discovered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
}
function decode(v:string){return v.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&apos;|&#39;|&#x27;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)))}
function strip(v:string){return decode(v.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim())}
function xml(block:string,tag:string){const m=block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`,'i'));return m?strip(m[1]):''}
function domainOf(v:string){try{return new URL(v).hostname.toLowerCase().replace(/^www\./,'')}catch{return ''}}
function allowedWebsite(v:string){try{const u=new URL(v);const h=u.hostname.toLowerCase().replace(/^www\./,'');return ['http:','https:'].includes(u.protocol)&&!!h&&!BLOCKED_DOMAINS.some(d=>h===d||h.endsWith(`.${d}`))}catch{return false}}
function companyName(title:string,domain:string){const x=strip(title).replace(/\s+[|–—-]\s+.*$/,'').trim();return x.length>=3&&x.length<=100?x:domain.split('.')[0].replace(/[-_]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase()).slice(0,100)}
function grade(score:number){return score>=80?'A':score>=60?'B':'C'}

async function fetchText(url:string,timeout=5000){const c=new AbortController();const t=setTimeout(()=>c.abort(),timeout);try{const r=await fetch(url,{headers:{accept:'text/html,application/xhtml+xml,application/rss+xml,application/xml;q=0.9,*/*;q=0.8','accept-language':'en-US,en;q=0.9','user-agent':'Mozilla/5.0 (compatible; MING-EAGLE-Discovery/4.0; +https://mingeagle.com)'},redirect:'follow',signal:c.signal});if(!r.ok)throw new Error(`HTTP ${r.status}`);return (await r.text()).slice(0,550000)}finally{clearTimeout(t)}}

function prequalifies(hit:SearchHit,type:string){
  const text=`${hit.title} ${hit.snippet}`;
  if(HARD_NEGATIVE.test(text)) return false;
  if(type==='SPORTS_STORE') return /basketball|sporting goods|sports store|equipment/i.test(text) && TARGET_SIGNAL[type].test(text);
  return BASKETBALL.test(text) && TARGET_SIGNAL[type].test(text);
}

async function bing(query:string,city:string,type:string){
  const q=`${query} -schedule -results -stats -news -games -calendar -NBA -WNBA -Formula1`;
  const data=await fetchText(`https://www.bing.com/search?q=${encodeURIComponent(q)}&format=rss&mkt=en-US&setlang=en-US`,7000);
  const items=data.match(/<item\b[\s\S]*?<\/item>/gi)||[];const out:SearchHit[]=[];const seen=new Set<string>();
  for(const item of items){const title=xml(item,'title'),url=decode(xml(item,'link')),snippet=xml(item,'description');const d=domainOf(url);if(!title||!url||!d||seen.has(d)||!allowedWebsite(url))continue;const hit={title,url,snippet,query,city};if(!prequalifies(hit,type))continue;seen.add(d);out.push(hit);if(out.length>=10)break}
  return out;
}

function scoreBusiness(hit:SearchHit,body:string,type:string,stateCode:string){
  const searchText=`${hit.title} ${hit.snippet}`;
  const all=`${searchText} ${body}`;
  if(HARD_NEGATIVE.test(searchText)) return {score:0,cues:['negative']};
  const target=TARGET_SIGNAL[type];
  const basketballOk=type==='SPORTS_STORE'?/basketball|sporting goods|sports store|equipment/i.test(all):BASKETBALL.test(all);
  const targetInSearch=target.test(searchText);
  const targetInBody=target.test(body);
  if(!basketballOk || !targetInSearch || !targetInBody) return {score:0,cues:['missing-core-business-signal']};
  const cues:string[]=['search-target-match','homepage-target-match'];
  let score=60;
  if(BASKETBALL.test(searchText)) { score+=8; cues.push('basketball-in-search'); }
  if(/programs?|services?|training|academy|coaching|lessons?|register|book|tryouts?|teams?|shop|store/i.test(body)) { score+=10; cues.push('business-page-language'); }
  if(/contact|about|team|coach|staff/i.test(body)) { score+=7; cues.push('contact-team-language'); }
  const state=(STATE_NAMES[stateCode]||'').toLowerCase();
  const local=[hit.city.toLowerCase(),state,stateCode.toLowerCase()].filter(Boolean).some(x=>all.toLowerCase().includes(x));
  if(local){score+=10;cues.push('local-match')}
  if(/price|pricing|membership|session|class|camp|clinic|registration|book now|enroll/i.test(body)){score+=5;cues.push('commercial-intent')}
  return {score:Math.min(100,score),cues};
}

async function verifyHit(hit:SearchHit,type:string,stateCode:string):Promise<VerifiedHit|null>{
  try{
    const html=await fetchText(hit.url,5000);const body=strip(html).slice(0,140000);
    if(HARD_NEGATIVE.test(`${hit.title} ${hit.snippet}`))return null;
    const f=scoreBusiness(hit,body,type,stateCode);if(f.score<70)return null;
    return {...hit,fitScore:f.score,cues:f.cues};
  }catch{return null}
}

async function save(db:D1Database,hits:VerifiedHit[],stateCode:string,type:string,target:number){
  let saved=0;const seen=new Set<string>();
  for(const h of hits){if(saved>=target)break;const domain=domainOf(h.url);if(!domain||seen.has(domain))continue;seen.add(domain);const name=companyName(h.title,domain);const leadScore=Math.min(92,60+Math.round(h.fitScore*0.30));const evidence=`Verified web V3 · fit=${h.fitScore} · cues=${h.cues.join(',')} · query=${h.query}`.slice(0,1000);
    await db.prepare(`INSERT INTO discovery_candidates (id,source_key,source_provider,name,customer_type,state_region,city,website,lead_score,grade,status,source_url,source_evidence,raw_json) VALUES (?,?, 'WEB_SEARCH_VERIFIED_V3',?,?,?,?,?,?,?,'NEW',?,?,?) ON CONFLICT(source_key) DO UPDATE SET source_provider='WEB_SEARCH_VERIFIED_V3',name=excluded.name,customer_type=excluded.customer_type,state_region=excluded.state_region,city=excluded.city,website=excluded.website,lead_score=excluded.lead_score,grade=excluded.grade,status=CASE WHEN discovery_candidates.status='CRM' THEN 'CRM' ELSE 'NEW' END,source_url=excluded.source_url,source_evidence=excluded.source_evidence,raw_json=excluded.raw_json,updated_at=CURRENT_TIMESTAMP`)
      .bind(crypto.randomUUID(),`web:${domain}`,name,type,stateCode,h.city,h.url,leadScore,grade(leadScore),h.url,evidence,JSON.stringify({title:h.title,snippet:h.snippet,query:h.query,city:h.city,fitScore:h.fitScore,cues:h.cues})).run();saved++
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

    await db.prepare(`UPDATE discovery_candidates SET status='IGNORED',lead_score=0,grade='C',source_evidence='Quarantined by V3: requires stronger business verification',updated_at=CURRENT_TIMESTAMP WHERE source_provider IN ('WEB_SEARCH','WEB_SEARCH_VERIFIED') AND status='NEW'`).run();

    jobId=crypto.randomUUID();
    await db.prepare(`INSERT INTO discovery_jobs (id,state_region,customer_type,target_count,source_provider) VALUES (?,?,?,?, 'WEB_SEARCH_VERIFIED_V3')`).bind(jobId,stateCode,type,target).run();

    const metros=METROS[stateCode].slice(0,5),terms=TERMS[type]||['basketball'];
    const queries=metros.flatMap(city=>terms.slice(0,2).map(term=>({city,query:`\"${term}\" ${city} ${STATE_NAMES[stateCode]||stateCode}`}))).slice(0,10);
    const searched=await Promise.allSettled(queries.map(q=>bing(q.query,q.city,type)));
    const raw=searched.flatMap(r=>r.status==='fulfilled'?r.value:[]);
    const unique:SearchHit[]=[];const domains=new Set<string>();
    for(const h of raw){const d=domainOf(h.url);if(!d||domains.has(d))continue;domains.add(d);unique.push(h);if(unique.length>=Math.max(20,target*3))break}
    if(!unique.length)throw new Error('没有获得符合目标业务信号的公开官网候选。');

    const verified:VerifiedHit[]=[];
    for(let i=0;i<unique.length;i+=5){const batch=unique.slice(i,i+5);const result=await Promise.allSettled(batch.map(h=>verifyHit(h,type,stateCode)));verified.push(...result.flatMap(x=>x.status==='fulfilled'&&x.value?[x.value]:[]));if(verified.length>=target)break}
    const found=await save(db,verified.sort((a,b)=>b.fitScore-a.fitScore),stateCode,type,target);
    await db.prepare(`UPDATE discovery_jobs SET status='COMPLETED',result_count=?,completed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(found,jobId).run();
    return Response.json({ok:true,found,mode:'WEB_VERIFIED_V3',checked:unique.length,verified:verified.length});
  }catch(error){const msg=error instanceof Error?error.message:'Web verification V3 failed.';if(jobId)await db.prepare(`UPDATE discovery_jobs SET status='FAILED',error=?,completed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(msg.slice(0,1000),jobId).run();return Response.json({ok:false,error:msg},{status:502})}
};