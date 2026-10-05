interface Env { MINGEAGLE_DB: D1Database }

type Input = { stateCode?: string; customerType?: string; targetCount?: number | string };
type OverpassElement = { type:'node'|'way'|'relation'; id:number; lat?:number; lon?:number; center?:{lat?:number;lon?:number}; tags?:Record<string,string> };

type Verified = {
  element: OverpassElement;
  name:string; city:string; address:string; website:string; email:string; phone:string;
  score:number; evidence:string;
};

const clean=(v:unknown,max=1000)=>typeof v==='string'?v.trim().replace(/\s+/g,' ').slice(0,max):'';
const allowedState=/^[A-Z]{2}$/;
const allowedTypes=new Set(['BASKETBALL_TRAINING','BASKETBALL_GYM','YOUTH_CLUB','SPORTS_STORE']);

function filters(type:string){
  if(type==='SPORTS_STORE')return `
    nwr["shop"="sports"]["name"](area.searchArea);
    nwr["shop"="sports"]["sport"="basketball"]["name"](area.searchArea);`;
  if(type==='YOUTH_CLUB')return `
    nwr["club"="sport"]["sport"="basketball"]["name"](area.searchArea);
    nwr["sport"="basketball"]["name"~"youth|AAU|club|academy|hoops",i](area.searchArea);`;
  if(type==='BASKETBALL_GYM')return `
    nwr["leisure"~"sports_centre|fitness_centre",i]["sport"~"basketball|multi",i]["name"](area.searchArea);
    nwr["sport"="basketball"]["name"~"gym|center|centre|facility|recreation|hoops",i](area.searchArea);`;
  return `
    nwr["sport"="basketball"]["name"~"academy|training|skills|hoops|basketball",i](area.searchArea);
    nwr["club"="sport"]["sport"="basketball"]["name"](area.searchArea);
    nwr["leisure"~"sports_centre|fitness_centre",i]["name"~"basketball|hoops|academy|training",i](area.searchArea);`;
}

function query(state:string,type:string,target:number){return `[out:json][timeout:11];
area["ISO3166-2"="US-${state}"]->.searchArea;
(
${filters(type)}
);
out center ${Math.min(120,Math.max(40,target*5))};`;}

async function fetchEndpoint(endpoint:string,q:string){
  const c=new AbortController();const timer=setTimeout(()=>c.abort(),12000);
  try{
    const r=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded;charset=UTF-8','accept':'application/json','user-agent':'MING-EAGLE-Discovery-Map/2.0 (+https://mingeagle.com)'},body:new URLSearchParams({data:q}).toString(),signal:c.signal});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    const body=await r.json() as {elements?:OverpassElement[]};return body.elements||[];
  }finally{clearTimeout(timer)}
}

async function fetchOverpass(q:string){
  const endpoints=['https://overpass.kumi.systems/api/interpreter','https://overpass-api.de/api/interpreter','https://overpass.private.coffee/api/interpreter'];
  try{return await Promise.any(endpoints.map(e=>fetchEndpoint(e,q)))}catch{throw new Error('地图公开数据源暂时繁忙')}
}

function first(tags:Record<string,string>,keys:string[]){for(const k of keys){const v=clean(tags[k],1000);if(v)return v.split(';')[0].trim()}return ''}
function normalizeWebsite(v:string){const s=clean(v,1000).split(';')[0].trim();if(!s)return '';return /^https?:\/\//i.test(s)?s:`https://${s}`}
function address(tags:Record<string,string>){const a=[tags['addr:housenumber'],tags['addr:street']].filter(Boolean).join(' ').trim();const city=first(tags,['addr:city','addr:town','addr:village','addr:suburb','addr:place']);const st=first(tags,['addr:state']);const zip=first(tags,['addr:postcode']);return [a,city,st,zip].filter(Boolean).join(', ')}
function validEmail(v:string){const e=clean(v,320).toLowerCase().replace(/^mailto:/,'').split('?')[0];return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(e)?e:''}
function strip(html:string){return html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ').trim()}
async function fetchPage(url:string){const c=new AbortController();const timer=setTimeout(()=>c.abort(),4500);try{const r=await fetch(url,{headers:{'accept':'text/html,application/xhtml+xml','accept-language':'en-US,en;q=0.9','user-agent':'Mozilla/5.0 (compatible; MING-EAGLE-Discovery-Map/2.0; +https://mingeagle.com)'},redirect:'follow',signal:c.signal});if(!r.ok)throw new Error(`HTTP ${r.status}`);return (await r.text()).slice(0,500000)}finally{clearTimeout(timer)}}
function emailsFrom(html:string){const out=new Set<string>();for(const m of html.matchAll(/mailto:([^"'<>\s?]+)/gi)){const e=validEmail(m[1]);if(e)out.add(e)}for(const raw of html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[]){const e=validEmail(raw);if(e)out.add(e)}return [...out]}
function phonesFrom(text:string){return (text.match(/(?:\+?1[\s.\-()]*)?(?:\(?\d{3}\)?[\s.\-]*)\d{3}[\s.\-]*\d{4}/g)||[])[0]||''}
function businessMatch(text:string,type:string){
  if(!/\b(basketball|hoops)\b/i.test(text))return false;
  if(type==='BASKETBALL_TRAINING')return /\b(academy|training|skills?|coaching|player development|private lessons?|camp|clinic|sessions?)\b/i.test(text);
  if(type==='BASKETBALL_GYM')return /\b(gym|facility|sports center|sports centre|court|open gym|recreation center|recreation centre)\b/i.test(text);
  if(type==='YOUTH_CLUB')return /\b(youth|AAU|club|tryouts?|teams?|league|academy)\b/i.test(text);
  return /\b(store|shop|sporting goods|equipment|retail|gear|buy|cart|products?)\b/i.test(text);
}
function grade(score:number){return score>=80?'A':score>=60?'B':'C'}

async function verify(element:OverpassElement,type:string,state:string):Promise<Verified|null>{
  const tags=element.tags||{};const name=first(tags,['name','brand','operator']);if(!name)return null;
  const website=normalizeWebsite(first(tags,['contact:website','website','url']));if(!website)return null;
  try{
    const html=await fetchPage(website);const text=strip(html).slice(0,220000);if(!businessMatch(`${name} ${text}`,type))return null;
    const city=first(tags,['addr:city','addr:town','addr:village','addr:suburb','addr:place']);
    let email=validEmail(first(tags,['contact:email','email']));if(!email)email=emailsFrom(html)[0]||'';
    let phone=first(tags,['contact:phone','phone','contact:mobile','mobile']);if(!phone)phone=phonesFrom(text);
    let score=68;if(/basketball|hoops/i.test(name))score+=8;if(/academy|training|skills|club|gym|sports|center|centre/i.test(name))score+=5;if(email)score+=7;if(phone)score+=4;if(city)score+=3;if(text.toLowerCase().includes(state.toLowerCase()))score+=2;
    const evidence=`Verified OSM V2 · official website confirmed basketball business · osm_tags=${['sport','club','leisure','shop'].filter(k=>tags[k]).map(k=>`${k}=${tags[k]}`).join(',')}`.slice(0,1000);
    return {element,name,city,address:address(tags),website,email,phone,score:Math.min(100,score),evidence};
  }catch{return null}
}

async function ensureTables(db:D1Database){
  await db.prepare(`CREATE TABLE IF NOT EXISTS discovery_jobs (id TEXT PRIMARY KEY,country TEXT NOT NULL DEFAULT 'US',state_region TEXT NOT NULL,customer_type TEXT NOT NULL,target_count INTEGER NOT NULL DEFAULT 20,source_provider TEXT NOT NULL DEFAULT 'OPENSTREETMAP',status TEXT NOT NULL DEFAULT 'RUNNING',result_count INTEGER NOT NULL DEFAULT 0,error TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,completed_at TEXT)`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS discovery_candidates (id TEXT PRIMARY KEY,source_key TEXT NOT NULL UNIQUE,source_provider TEXT NOT NULL DEFAULT 'OPENSTREETMAP',name TEXT NOT NULL,customer_type TEXT NOT NULL,country TEXT NOT NULL DEFAULT 'US',state_region TEXT,city TEXT,address TEXT,website TEXT,email TEXT,phone TEXT,whatsapp TEXT,instagram_url TEXT,facebook_url TEXT,latitude REAL,longitude REAL,lead_score INTEGER NOT NULL DEFAULT 0,grade TEXT NOT NULL DEFAULT 'C',status TEXT NOT NULL DEFAULT 'NEW',source_url TEXT NOT NULL,source_evidence TEXT,raw_json TEXT,crm_lead_id TEXT,discovered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
}

async function save(db:D1Database,hits:Verified[],state:string,type:string,target:number){let saved=0;for(const h of hits.sort((a,b)=>b.score-a.score)){if(saved>=target)break;const e=h.element;const tags=e.tags||{};const key=`osm:${e.type}:${e.id}`;const url=`https://www.openstreetmap.org/${e.type}/${e.id}`;const lat=Number(e.lat??e.center?.lat??0)||null;const lon=Number(e.lon??e.center?.lon??0)||null;
  await db.prepare(`INSERT INTO discovery_candidates (id,source_key,source_provider,name,customer_type,state_region,city,address,website,email,phone,latitude,longitude,lead_score,grade,status,source_url,source_evidence,raw_json) VALUES (?,?,'OPENSTREETMAP_VERIFIED_V2',?,?,?,?,?,?,?,?,?,?,?,?,'NEW',?,?,?) ON CONFLICT(source_key) DO UPDATE SET source_provider='OPENSTREETMAP_VERIFIED_V2',name=excluded.name,customer_type=excluded.customer_type,state_region=excluded.state_region,city=excluded.city,address=excluded.address,website=excluded.website,email=CASE WHEN discovery_candidates.status='CRM' THEN COALESCE(discovery_candidates.email,excluded.email) ELSE excluded.email END,phone=CASE WHEN discovery_candidates.status='CRM' THEN COALESCE(discovery_candidates.phone,excluded.phone) ELSE excluded.phone END,latitude=excluded.latitude,longitude=excluded.longitude,lead_score=excluded.lead_score,grade=excluded.grade,status=CASE WHEN discovery_candidates.status='CRM' THEN 'CRM' ELSE 'NEW' END,source_url=excluded.source_url,source_evidence=excluded.source_evidence,raw_json=excluded.raw_json,updated_at=CURRENT_TIMESTAMP`)
    .bind(crypto.randomUUID(),key,h.name,type,state,h.city||null,h.address||null,h.website,h.email||null,h.phone||null,lat,lon,h.score,grade(h.score),url,h.evidence,JSON.stringify({tags})).run();saved++}
  return saved}

export const onRequestPost:PagesFunction<Env>=async({request,env})=>{
  if(!env.MINGEAGLE_DB)return Response.json({ok:false,error:'Database is not configured.'},{status:503});const db=env.MINGEAGLE_DB;await ensureTables(db);let jobId='';
  try{
    const input=await request.json() as Input;const state=clean(input.stateCode,2).toUpperCase();const type=clean(input.customerType,80).toUpperCase();const target=Math.min(100,Math.max(10,Math.round(Number(input.targetCount||20))));
    if(!allowedState.test(state))return Response.json({ok:false,error:'请选择有效的美国州。'},{status:400});if(!allowedTypes.has(type))return Response.json({ok:false,error:'不支持的客户类型。'},{status:400});
    jobId=crypto.randomUUID();await db.prepare(`INSERT INTO discovery_jobs (id,state_region,customer_type,target_count,source_provider) VALUES (?,?,?,?,'OPENSTREETMAP_VERIFIED_V2')`).bind(jobId,state,type,target).run();
    const elements=await fetchOverpass(query(state,type,target));const candidates=elements.slice(0,Math.max(30,target*4));const verified:Verified[]=[];
    for(let i=0;i<candidates.length;i+=5){const batch=candidates.slice(i,i+5);const result=await Promise.allSettled(batch.map(e=>verify(e,type,state)));verified.push(...result.flatMap(r=>r.status==='fulfilled'&&r.value?[r.value]:[]));if(verified.length>=target)break}
    const found=await save(db,verified,state,type,target);await db.prepare(`UPDATE discovery_jobs SET status='COMPLETED',result_count=?,completed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(found,jobId).run();
    return Response.json({ok:true,found,checked:candidates.length,verified:verified.length,mode:'OPENSTREETMAP_VERIFIED_V2',provider:'OPENSTREETMAP_VERIFIED_V2',note:found?`地图源已验证 ${found} 个有官网且业务匹配的真实机构。`:'地图源本次没有通过官网业务验证的候选。'});
  }catch(error){const msg=error instanceof Error?error.message:'Map discovery failed.';if(jobId)await db.prepare(`UPDATE discovery_jobs SET status='FAILED',error=?,completed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(msg.slice(0,1000),jobId).run();return Response.json({ok:false,error:msg},{status:502})}
};