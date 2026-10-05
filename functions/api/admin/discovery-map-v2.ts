interface Env { MINGEAGLE_DB: D1Database }

type Input = { stateCode?: string; customerType?: string; targetCount?: number | string };
type OverpassElement = { type:'node'|'way'|'relation'; id:number; lat?:number; lon?:number; center?:{lat?:number;lon?:number}; tags?:Record<string,string> };
type Verified = { element:OverpassElement; name:string; city:string; address:string; website:string; email:string; phone:string; score:number; evidence:string };

const clean=(v:unknown,max=1000)=>typeof v==='string'?v.trim().replace(/\s+/g,' ').slice(0,max):'';
const allowedState=/^[A-Z]{2}$/;
const allowedTypes=new Set(['BASKETBALL_TRAINING','BASKETBALL_GYM','YOUTH_CLUB','SPORTS_STORE']);

function filters(type:string){
  if(type==='SPORTS_STORE')return `
    nwr["shop"="sports"]["website"](area.searchArea);
    nwr["shop"="sports"]["contact:website"](area.searchArea);
    nwr["name"~"basketball|hoops",i]["website"](area.searchArea);
    nwr["name"~"basketball|hoops",i]["contact:website"](area.searchArea);`;
  if(type==='YOUTH_CLUB')return `
    nwr["club"="sport"]["sport"="basketball"]["website"](area.searchArea);
    nwr["club"="sport"]["sport"="basketball"]["contact:website"](area.searchArea);
    nwr["name"~"basketball|hoops|AAU",i]["website"](area.searchArea);
    nwr["name"~"basketball|hoops|AAU",i]["contact:website"](area.searchArea);`;
  if(type==='BASKETBALL_GYM')return `
    nwr["sport"~"basketball|multi",i]["leisure"~"sports_centre|fitness_centre",i]["website"](area.searchArea);
    nwr["sport"~"basketball|multi",i]["leisure"~"sports_centre|fitness_centre",i]["contact:website"](area.searchArea);
    nwr["name"~"basketball|hoops",i]["website"](area.searchArea);
    nwr["name"~"basketball|hoops",i]["contact:website"](area.searchArea);`;
  return `
    nwr["sport"="basketball"]["website"](area.searchArea);
    nwr["sport"="basketball"]["contact:website"](area.searchArea);
    nwr["name"~"basketball|hoops",i]["website"](area.searchArea);
    nwr["name"~"basketball|hoops",i]["contact:website"](area.searchArea);
    nwr["sport"="basketball"]["name"~"academy|training|skills|performance|development",i]["website"](area.searchArea);`;
}

function query(state:string,type:string,target:number){
  return `[out:json][timeout:7];
area["ISO3166-2"="US-${state}"]->.searchArea;
(
${filters(type)}
);
out center ${Math.min(70,Math.max(24,target*3))};`;
}

async function fetchEndpoint(endpoint:string,q:string){
  const c=new AbortController();const timer=setTimeout(()=>c.abort(),6500);
  try{
    const r=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded;charset=UTF-8','accept':'application/json','user-agent':'MING-EAGLE-Discovery-Map/4.0 (+https://mingeagle.com)'},body:new URLSearchParams({data:q}).toString(),signal:c.signal});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    const body=await r.json() as {elements?:OverpassElement[]};return body.elements||[];
  }finally{clearTimeout(timer)}
}

async function fetchOverpass(q:string){
  const endpoints=['https://overpass.kumi.systems/api/interpreter','https://overpass.private.coffee/api/interpreter','https://overpass-api.de/api/interpreter'];
  const errors:string[]=[];
  for(const endpoint of endpoints){
    try{return {elements:await fetchEndpoint(endpoint,q),endpoint,attempts:errors.length+1}}
    catch(error){errors.push(`${new URL(endpoint).hostname}:${error instanceof Error?error.message:'failed'}`)}
  }
  throw new Error(`地图公开数据源暂时繁忙（${errors.join('；')}）`)
}

function first(tags:Record<string,string>,keys:string[]){for(const k of keys){const v=clean(tags[k],1000);if(v)return v.split(';')[0].trim()}return ''}
function normalizeWebsite(v:string){const s=clean(v,1000).split(';')[0].trim();if(!s)return '';return /^https?:\/\//i.test(s)?s:`https://${s}`}
function address(tags:Record<string,string>){const a=[tags['addr:housenumber'],tags['addr:street']].filter(Boolean).join(' ').trim();const city=first(tags,['addr:city','addr:town','addr:village','addr:suburb','addr:place']);const st=first(tags,['addr:state']);const zip=first(tags,['addr:postcode']);return [a,city,st,zip].filter(Boolean).join(', ')}
function validEmail(v:string){const e=clean(v,320).toLowerCase().replace(/^mailto:/,'').split('?')[0];return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(e)?e:''}
function strip(html:string){return html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ').trim()}
async function fetchPage(url:string){const c=new AbortController();const timer=setTimeout(()=>c.abort(),3600);try{const r=await fetch(url,{headers:{'accept':'text/html,application/xhtml+xml','accept-language':'en-US,en;q=0.9','user-agent':'Mozilla/5.0 (compatible; MING-EAGLE-Discovery-Map/4.0; +https://mingeagle.com)'},redirect:'follow',signal:c.signal});if(!r.ok)throw new Error(`HTTP ${r.status}`);return (await r.text()).slice(0,450000)}finally{clearTimeout(timer)}}
function emailsFrom(html:string){const out=new Set<string>();for(const m of html.matchAll(/mailto:([^"'<>\s?]+)/gi)){const e=validEmail(m[1]);if(e)out.add(e)}for(const raw of html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[]){const e=validEmail(raw);if(e)out.add(e)}return [...out]}
function phonesFrom(text:string){return (text.match(/(?:\+?1[\s.\-()]*)?(?:\(?\d{3}\)?[\s.\-]*)\d{3}[\s.\-]*\d{4}/g)||[])[0]||''}
function businessMatch(text:string,type:string){
  if(!/\b(basketball|hoops)\b/i.test(text))return false;
  if(type==='BASKETBALL_TRAINING')return /\b(academy|training|skills?|coaching|coach|player development|private lessons?|sessions?|development|performance|workouts?)\b/i.test(text);
  if(type==='BASKETBALL_GYM')return /\b(gym|facility|sports center|sports centre|court|open gym|recreation center|recreation centre|fitness)\b/i.test(text);
  if(type==='YOUTH_CLUB')return /\b(youth|AAU|club|tryouts?|teams?|league|academy|travel)\b/i.test(text);
  return /\b(store|shop|sporting goods|equipment|retail|gear|buy|cart|products?)\b/i.test(text);
}
function grade(score:number){return score>=80?'A':score>=60?'B':'C'}

function priority(element:OverpassElement,type:string){
  const tags=element.tags||{};const name=first(tags,['name','brand','operator']);const website=normalizeWebsite(first(tags,['contact:website','website','url']));
  if(!name||!website)return -999;
  let p=18;if(/basketball|hoops/i.test(name))p+=32;if(tags.sport==='basketball')p+=25;if(type==='BASKETBALL_TRAINING'&&/academy|training|skills|development|performance|coach/i.test(name))p+=18;if(type==='YOUTH_CLUB'&&/youth|aau|club|academy/i.test(name))p+=16;if(type==='BASKETBALL_GYM'&&/gym|center|centre|facility|sports|fitness/i.test(name))p+=14;if(first(tags,['contact:email','email']))p+=8;if(first(tags,['contact:phone','phone','contact:mobile','mobile']))p+=5;if(first(tags,['addr:city','addr:town','addr:village']))p+=3;return p;
}

async function verify(element:OverpassElement,type:string,state:string):Promise<Verified|null>{
  const tags=element.tags||{};const name=first(tags,['name','brand','operator']);const website=normalizeWebsite(first(tags,['contact:website','website','url']));if(!name||!website)return null;
  try{
    const html=await fetchPage(website);const text=strip(html).slice(0,240000);const tagText=Object.entries(tags).map(([k,v])=>`${k} ${v}`).join(' ');if(!businessMatch(`${name} ${tagText} ${text}`,type))return null;
    const city=first(tags,['addr:city','addr:town','addr:village','addr:suburb','addr:place']);
    let email=validEmail(first(tags,['contact:email','email']));if(!email)email=emailsFrom(html)[0]||'';
    let phone=first(tags,['contact:phone','phone','contact:mobile','mobile']);if(!phone)phone=phonesFrom(text);
    let score=68;if(/basketball|hoops/i.test(name))score+=8;if(tags.sport==='basketball')score+=7;if(/academy|training|skills|club|gym|sports|center|centre|development|performance/i.test(name))score+=5;if(email)score+=6;if(phone)score+=3;if(city)score+=2;
    const evidence=`Verified OSM V4 · website-first commercial entity + official website business validation · osm_tags=${['sport','club','leisure','shop'].filter(k=>tags[k]).map(k=>`${k}=${tags[k]}`).join(',')}`.slice(0,1000);
    return {element,name,city,address:address(tags),website,email,phone,score:Math.min(100,score),evidence};
  }catch{return null}
}

async function ensureTables(db:D1Database){
  await db.prepare(`CREATE TABLE IF NOT EXISTS discovery_jobs (id TEXT PRIMARY KEY,country TEXT NOT NULL DEFAULT 'US',state_region TEXT NOT NULL,customer_type TEXT NOT NULL,target_count INTEGER NOT NULL DEFAULT 20,source_provider TEXT NOT NULL DEFAULT 'OPENSTREETMAP',status TEXT NOT NULL DEFAULT 'RUNNING',result_count INTEGER NOT NULL DEFAULT 0,error TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,completed_at TEXT)`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS discovery_candidates (id TEXT PRIMARY KEY,source_key TEXT NOT NULL UNIQUE,source_provider TEXT NOT NULL DEFAULT 'OPENSTREETMAP',name TEXT NOT NULL,customer_type TEXT NOT NULL,country TEXT NOT NULL DEFAULT 'US',state_region TEXT,city TEXT,address TEXT,website TEXT,email TEXT,phone TEXT,whatsapp TEXT,instagram_url TEXT,facebook_url TEXT,latitude REAL,longitude REAL,lead_score INTEGER NOT NULL DEFAULT 0,grade TEXT NOT NULL DEFAULT 'C',status TEXT NOT NULL DEFAULT 'NEW',source_url TEXT NOT NULL,source_evidence TEXT,raw_json TEXT,crm_lead_id TEXT,discovered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
}

async function save(db:D1Database,hits:Verified[],state:string,type:string,limit:number){
  let saved=0;for(const h of hits.sort((a,b)=>b.score-a.score)){if(saved>=limit)break;const e=h.element;const tags=e.tags||{};const key=`osm:${e.type}:${e.id}`;const url=`https://www.openstreetmap.org/${e.type}/${e.id}`;const lat=Number(e.lat??e.center?.lat??0)||null;const lon=Number(e.lon??e.center?.lon??0)||null;
    await db.prepare(`INSERT INTO discovery_candidates (id,source_key,source_provider,name,customer_type,state_region,city,address,website,email,phone,latitude,longitude,lead_score,grade,status,source_url,source_evidence,raw_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(source_key) DO UPDATE SET source_provider=excluded.source_provider,name=excluded.name,customer_type=excluded.customer_type,state_region=excluded.state_region,city=excluded.city,address=excluded.address,website=excluded.website,email=CASE WHEN discovery_candidates.status='CRM' THEN COALESCE(discovery_candidates.email,excluded.email) ELSE excluded.email END,phone=CASE WHEN discovery_candidates.status='CRM' THEN COALESCE(discovery_candidates.phone,excluded.phone) ELSE excluded.phone END,latitude=excluded.latitude,longitude=excluded.longitude,lead_score=excluded.lead_score,grade=excluded.grade,status=CASE WHEN discovery_candidates.status='CRM' THEN 'CRM' ELSE 'NEW' END,source_url=excluded.source_url,source_evidence=excluded.source_evidence,raw_json=excluded.raw_json,updated_at=CURRENT_TIMESTAMP`)
      .bind(crypto.randomUUID(),key,'OPENSTREETMAP_VERIFIED_V4',h.name,type,state,h.city||null,h.address||null,h.website,h.email||null,h.phone||null,lat,lon,h.score,grade(h.score),'NEW',url,h.evidence,JSON.stringify({tags})).run();saved++}
  return saved;
}

export const onRequestPost:PagesFunction<Env>=async({request,env})=>{
  if(!env.MINGEAGLE_DB)return Response.json({ok:false,error:'Database is not configured.'},{status:503});const db=env.MINGEAGLE_DB;await ensureTables(db);let jobId='';
  try{
    const input=await request.json() as Input;const state=clean(input.stateCode,2).toUpperCase();const type=clean(input.customerType,80).toUpperCase();const target=Math.min(100,Math.max(10,Math.round(Number(input.targetCount||20))));const mapGoal=Math.min(10,Math.max(4,Math.ceil(target*0.5)));
    if(!allowedState.test(state))return Response.json({ok:false,error:'请选择有效的美国州。'},{status:400});if(!allowedTypes.has(type))return Response.json({ok:false,error:'不支持的客户类型。'},{status:400});
    jobId=crypto.randomUUID();await db.prepare(`INSERT INTO discovery_jobs (id,state_region,customer_type,target_count,source_provider) VALUES (?,?,?,?,'OPENSTREETMAP_VERIFIED_V4')`).bind(jobId,state,type,mapGoal).run();
    const started=Date.now();const source=await fetchOverpass(query(state,type,target));const elements=source.elements;const candidates=elements.map(e=>({e,p:priority(e,type)})).filter(x=>x.p>=0).sort((a,b)=>b.p-a.p).slice(0,Math.min(30,Math.max(18,target+10))).map(x=>x.e);
    const verified:Verified[]=[];let checked=0;
    for(let i=0;i<candidates.length;i+=5){if(Date.now()-started>20500)break;const batch=candidates.slice(i,i+5);checked+=batch.length;const result=await Promise.allSettled(batch.map(e=>verify(e,type,state)));verified.push(...result.flatMap(r=>r.status==='fulfilled'&&r.value?[r.value]:[]));if(verified.length>=mapGoal)break}
    const found=await save(db,verified,state,type,mapGoal);await db.prepare(`UPDATE discovery_jobs SET status='COMPLETED',result_count=?,completed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(found,jobId).run();const elapsedMs=Date.now()-started;
    return Response.json({ok:true,found,checked,verified:verified.length,rawCount:elements.length,elapsedMs,mode:'OPENSTREETMAP_VERIFIED_V4',provider:'OPENSTREETMAP_VERIFIED_V4',endpoint:new URL(source.endpoint).hostname,attempts:source.attempts,note:found?`地图V4：商业实体原始 ${elements.length} 个，官网检查 ${checked} 个，通过并保存 ${found} 个；数据源 ${new URL(source.endpoint).hostname}，耗时 ${Math.round(elapsedMs/1000)} 秒。`:`地图V4：商业实体原始 ${elements.length} 个，官网检查 ${checked} 个，本次通过 0 个；数据源 ${new URL(source.endpoint).hostname}，耗时 ${Math.round(elapsedMs/1000)} 秒。`});
  }catch(error){const msg=error instanceof Error?error.message:'Map discovery failed.';if(jobId)await db.prepare(`UPDATE discovery_jobs SET status='FAILED',error=?,completed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(msg.slice(0,1000),jobId).run();return Response.json({ok:false,error:msg},{status:502})}
};