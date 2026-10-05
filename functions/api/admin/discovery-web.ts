interface Env { MINGEAGLE_DB: D1Database }

type Input = { stateCode?: string; customerType?: string; targetCount?: number | string };
type SearchHit = { title: string; url: string; query: string; city: string };

const clean = (value: unknown, max = 1000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const allowedState = /^[A-Z]{2}$/;
const allowedTypes = new Set(['BASKETBALL_TRAINING','BASKETBALL_GYM','YOUTH_CLUB','SPORTS_STORE']);

const METROS: Record<string,string[]> = {
  AL:['Birmingham','Mobile'],AK:['Anchorage'],AZ:['Phoenix','Tucson'],AR:['Little Rock'],
  CA:['Los Angeles','San Francisco','San Diego','Sacramento'],CO:['Denver','Colorado Springs'],CT:['Hartford','New Haven'],DE:['Wilmington'],
  FL:['Miami','Orlando','Tampa','Jacksonville'],GA:['Atlanta','Savannah'],HI:['Honolulu'],ID:['Boise'],IL:['Chicago','Springfield'],
  IN:['Indianapolis','Fort Wayne'],IA:['Des Moines','Iowa City'],KS:['Wichita','Topeka'],KY:['Louisville','Lexington'],LA:['New Orleans','Baton Rouge'],
  ME:['Portland'],MD:['Baltimore','Annapolis'],MA:['Boston','Worcester'],MI:['Detroit','Grand Rapids'],MN:['Minneapolis','Saint Paul'],
  MS:['Jackson','Gulfport'],MO:['St Louis','Kansas City'],MT:['Billings','Missoula'],NE:['Omaha','Lincoln'],NV:['Las Vegas','Reno'],
  NH:['Manchester'],NJ:['Newark','Trenton'],NM:['Albuquerque','Santa Fe'],NY:['New York City','Buffalo','Rochester','Albany'],
  NC:['Charlotte','Raleigh','Greensboro'],ND:['Fargo','Bismarck'],OH:['Columbus','Cleveland','Cincinnati'],OK:['Oklahoma City','Tulsa'],
  OR:['Portland','Eugene'],PA:['Philadelphia','Pittsburgh','Harrisburg'],RI:['Providence'],SC:['Columbia','Charleston','Greenville'],
  SD:['Sioux Falls','Rapid City'],TN:['Nashville','Memphis','Knoxville'],TX:['Dallas','Houston','Austin','San Antonio','Fort Worth'],
  UT:['Salt Lake City','Provo'],VT:['Burlington'],VA:['Richmond','Virginia Beach','Alexandria'],WA:['Seattle','Tacoma','Spokane'],
  WV:['Charleston','Morgantown'],WI:['Milwaukee','Madison'],WY:['Cheyenne']
};

const QUERY_TERMS: Record<string,string[]> = {
  BASKETBALL_TRAINING:['basketball academy','basketball training','basketball skills training'],
  BASKETBALL_GYM:['basketball gym','basketball training facility','basketball sports center'],
  YOUTH_CLUB:['youth basketball club','AAU basketball club','youth basketball academy'],
  SPORTS_STORE:['basketball sporting goods store','sports store basketball','basketball equipment store'],
};

const BLOCKED_DOMAINS = [
  'duckduckgo.com','google.com','bing.com','yahoo.com','yelp.com','facebook.com','instagram.com','linkedin.com','youtube.com',
  'yellowpages.com','mapquest.com','tripadvisor.com','indeed.com','ziprecruiter.com','chamberofcommerce.com','manta.com','bbb.org','apple.com'
];

async function ensureTables(db:D1Database){
  await db.prepare(`CREATE TABLE IF NOT EXISTS discovery_jobs (id TEXT PRIMARY KEY,country TEXT NOT NULL DEFAULT 'US',state_region TEXT NOT NULL,customer_type TEXT NOT NULL,target_count INTEGER NOT NULL DEFAULT 20,source_provider TEXT NOT NULL DEFAULT 'OPENSTREETMAP',status TEXT NOT NULL DEFAULT 'RUNNING',result_count INTEGER NOT NULL DEFAULT 0,error TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,completed_at TEXT)`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS discovery_candidates (id TEXT PRIMARY KEY,source_key TEXT NOT NULL UNIQUE,source_provider TEXT NOT NULL DEFAULT 'OPENSTREETMAP',name TEXT NOT NULL,customer_type TEXT NOT NULL,country TEXT NOT NULL DEFAULT 'US',state_region TEXT,city TEXT,address TEXT,website TEXT,email TEXT,phone TEXT,whatsapp TEXT,instagram_url TEXT,facebook_url TEXT,latitude REAL,longitude REAL,lead_score INTEGER NOT NULL DEFAULT 0,grade TEXT NOT NULL DEFAULT 'C',status TEXT NOT NULL DEFAULT 'NEW',source_url TEXT NOT NULL,source_evidence TEXT,raw_json TEXT,crm_lead_id TEXT,discovered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
}

function decodeEntities(value:string){
  return value
    .replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#x27;|&#39;/gi,"'")
    .replace(/&lt;/gi,'<').replace(/&gt;/gi,'>')
    .replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)));
}

function stripTags(value:string){ return decodeEntities(value.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()); }

function decodeResultUrl(raw:string){
  const value = decodeEntities(raw);
  try{
    const absolute = value.startsWith('//') ? `https:${value}` : value.startsWith('/') ? `https://duckduckgo.com${value}` : value;
    const url = new URL(absolute);
    if(url.hostname.endsWith('duckduckgo.com')){
      const uddg = url.searchParams.get('uddg');
      if(uddg) return decodeURIComponent(uddg);
    }
    return absolute;
  }catch{return ''}
}

function allowedWebsite(value:string){
  try{
    const url = new URL(value);
    if(!['http:','https:'].includes(url.protocol)) return false;
    const host = url.hostname.toLowerCase().replace(/^www\./,'');
    if(!host || host==='localhost' || host.endsWith('.local')) return false;
    return !BLOCKED_DOMAINS.some(domain => host===domain || host.endsWith(`.${domain}`));
  }catch{return false}
}

function domainOf(value:string){
  try{return new URL(value).hostname.toLowerCase().replace(/^www\./,'')}catch{return ''}
}

function normalizeName(value:string){return value.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().slice(0,220)}

function companyName(title:string, domain:string){
  const cleaned = stripTags(title)
    .replace(/\s+[|–—-]\s+(Official Site|Home|Basketball|Training|Academy|Sports|Gym).*$/i,'')
    .replace(/\s+[|–—-]\s+.*$/,'')
    .trim();
  if(cleaned.length >= 3 && cleaned.length <= 120) return cleaned;
  return domain.split('.')[0].replace(/[-_]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase()).slice(0,120);
}

async function searchDuckDuckGo(query:string, city:string){
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(),9000);
  try{
    const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,{
      headers:{
        'accept':'text/html,application/xhtml+xml',
        'accept-language':'en-US,en;q=0.9',
        'user-agent':'Mozilla/5.0 (compatible; MING-EAGLE-Customer-Discovery/1.0; +https://mingeagle.com)'
      },
      signal:controller.signal,
    });
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = (await response.text()).slice(0,900000);
    const hits:SearchHit[]=[];
    const patterns = [
      /<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
      /<a[^>]+href=["']([^"']+)["'][^>]+class=["'][^"']*result__a[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi,
    ];
    const seen=new Set<string>();
    for(const pattern of patterns){
      let match:RegExpExecArray|null;
      while((match=pattern.exec(html))){
        const url=decodeResultUrl(match[1]);
        if(!url || !allowedWebsite(url)) continue;
        const domain=domainOf(url); if(!domain || seen.has(domain)) continue;
        const title=stripTags(match[2]); if(!title) continue;
        seen.add(domain); hits.push({title,url,query,city});
        if(hits.length>=12) break;
      }
      if(hits.length) break;
    }
    return hits;
  } finally { clearTimeout(timer); }
}

function grade(score:number){return score>=80?'A':score>=60?'B':'C'}
function scoreHit(name:string,type:string){
  let score=58;
  const n=name.toLowerCase();
  if(/basketball|hoops/.test(n)) score+=10;
  if(type==='BASKETBALL_TRAINING' && /academy|training|skills|camp/.test(n)) score+=7;
  if(type==='YOUTH_CLUB' && /youth|club|aau/.test(n)) score+=7;
  if(type==='SPORTS_STORE' && /sport|basketball|equipment/.test(n)) score+=5;
  return Math.min(88,score);
}

async function saveHits(db:D1Database,hits:SearchHit[],stateCode:string,customerType:string,target:number){
  const seen=new Set<string>(); let saved=0;
  for(const hit of hits){
    if(saved>=target) break;
    const domain=domainOf(hit.url); if(!domain || seen.has(domain)) continue; seen.add(domain);
    const name=companyName(hit.title,domain); const key=`web:${domain}`; const score=scoreHit(name,customerType);
    const evidence=`Public web search · query=${hit.query} · result=${hit.title}`.slice(0,1000);
    await db.prepare(`INSERT INTO discovery_candidates (id,source_key,source_provider,name,customer_type,state_region,city,website,lead_score,grade,source_url,source_evidence,raw_json)
      VALUES (?,?, 'WEB_SEARCH',?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(source_key) DO UPDATE SET name=excluded.name,customer_type=excluded.customer_type,state_region=excluded.state_region,city=excluded.city,website=COALESCE(discovery_candidates.website,excluded.website),lead_score=MAX(discovery_candidates.lead_score,excluded.lead_score),grade=CASE WHEN MAX(discovery_candidates.lead_score,excluded.lead_score)>=80 THEN 'A' WHEN MAX(discovery_candidates.lead_score,excluded.lead_score)>=60 THEN 'B' ELSE 'C' END,source_evidence=excluded.source_evidence,updated_at=CURRENT_TIMESTAMP`)
      .bind(crypto.randomUUID(),key,name,customerType,stateCode,hit.city,hit.url,score,grade(score),hit.url,evidence,JSON.stringify(hit)).run();
    saved++;
  }
  return saved;
}

export const onRequestPost:PagesFunction<Env>=async({request,env})=>{
  if(!env.MINGEAGLE_DB)return Response.json({ok:false,error:'Database is not configured.'},{status:503});
  const db=env.MINGEAGLE_DB; await ensureTables(db); let jobId='';
  try{
    const input=await request.json() as Input;
    const stateCode=clean(input.stateCode,2).toUpperCase();
    const customerType=clean(input.customerType,80).toUpperCase();
    const targetCount=Math.min(100,Math.max(10,Math.round(Number(input.targetCount||20))));
    if(!allowedState.test(stateCode)||!METROS[stateCode])return Response.json({ok:false,error:'请选择有效的美国州。'},{status:400});
    if(!allowedTypes.has(customerType))return Response.json({ok:false,error:'不支持的客户类型。'},{status:400});
    jobId=crypto.randomUUID();
    await db.prepare(`INSERT INTO discovery_jobs (id,state_region,customer_type,target_count,source_provider) VALUES (?,?,?,?, 'WEB_SEARCH_PUBLIC')`).bind(jobId,stateCode,customerType,targetCount).run();

    const metros=METROS[stateCode].slice(0,5); const terms=QUERY_TERMS[customerType]||['basketball'];
    const queries=metros.map((city,index)=>({city,query:`${terms[index%terms.length]} ${city} ${stateCode}`}));
    const settled=await Promise.allSettled(queries.map(item=>searchDuckDuckGo(item.query,item.city)));
    const hits=settled.flatMap(result=>result.status==='fulfilled'?result.value:[]);
    if(!hits.length) throw new Error('WEB_SOURCE_BUSY');
    const found=await saveHits(db,hits,stateCode,customerType,targetCount);
    await db.prepare(`UPDATE discovery_jobs SET status='COMPLETED',result_count=?,completed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(found,jobId).run();
    return Response.json({ok:true,jobId,found,mode:'WEB'});
  }catch(error){
    const raw=error instanceof Error?error.message:'Web discovery failed.';
    const message=raw==='WEB_SOURCE_BUSY'?'公开 Web 搜索源暂时没有返回可用结果，请稍后重试。':raw;
    if(jobId)await db.prepare(`UPDATE discovery_jobs SET status='FAILED',error=?,completed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(message.slice(0,1000),jobId).run();
    console.error('discovery_web_failed',error);
    return Response.json({ok:false,error:message},{status:502});
  }
};
