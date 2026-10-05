interface Env { MINGEAGLE_DB: D1Database }

type Input = { stateCode?: string; customerType?: string; targetCount?: number | string };
type Center = { city:string; lat:number; lon:number; radius:number };
type OSMElement = { type:'node'|'way'|'relation'; id:number; lat?:number; lon?:number; center?:{lat?:number;lon?:number}; tags?:Record<string,string> };
type CityResult = { city:string; endpoint:string; elements:OSMElement[] };
type Verified = { element:OSMElement; name:string; city:string; address:string; website:string; email:string; phone:string; score:number; evidence:string; sourceUrl:string };

const clean=(v:unknown,max=1000)=>typeof v==='string'?v.trim().replace(/\s+/g,' ').slice(0,max):'';
const allowedState=/^[A-Z]{2}$/;
const allowedTypes=new Set(['BASKETBALL_TRAINING','BASKETBALL_GYM','YOUTH_CLUB','SPORTS_STORE']);

const CENTERS:Record<string,Center[]>={
  TX:[
    {city:'Dallas',lat:32.7767,lon:-96.7970,radius:42000},
    {city:'Fort Worth',lat:32.7555,lon:-97.3308,radius:30000},
    {city:'Houston',lat:29.7604,lon:-95.3698,radius:42000},
    {city:'Austin',lat:30.2672,lon:-97.7431,radius:30000},
    {city:'San Antonio',lat:29.4241,lon:-98.4936,radius:34000}
  ],
  CA:[
    {city:'Los Angeles',lat:34.0522,lon:-118.2437,radius:45000},
    {city:'San Diego',lat:32.7157,lon:-117.1611,radius:35000},
    {city:'San Francisco',lat:37.7749,lon:-122.4194,radius:35000},
    {city:'Sacramento',lat:38.5816,lon:-121.4944,radius:30000}
  ],
  FL:[
    {city:'Miami',lat:25.7617,lon:-80.1918,radius:38000},
    {city:'Orlando',lat:28.5383,lon:-81.3792,radius:34000},
    {city:'Tampa',lat:27.9506,lon:-82.4572,radius:34000},
    {city:'Jacksonville',lat:30.3322,lon:-81.6557,radius:32000}
  ],
  NY:[
    {city:'New York City',lat:40.7128,lon:-74.0060,radius:42000},
    {city:'Buffalo',lat:42.8864,lon:-78.8784,radius:28000},
    {city:'Rochester',lat:43.1566,lon:-77.6088,radius:26000},
    {city:'Albany',lat:42.6526,lon:-73.7562,radius:24000}
  ]
};

const OVERPASS=[
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter'
];

function first(tags:Record<string,string>,keys:string[]){for(const k of keys){const v=clean(tags[k],1000);if(v)return v.split(';')[0].trim()}return ''}
function domainOf(v:string){try{return new URL(v).hostname.toLowerCase().replace(/^www\./,'')}catch{return ''}}
function normalizeWebsite(v:string){const s=clean(v,1000).split(';')[0].trim();if(!s)return '';try{return new URL(/^https?:\/\//i.test(s)?s:`https://${s}`).toString()}catch{return ''}}
function validEmail(v:string){const e=clean(v,320).toLowerCase().replace(/^mailto:/,'').split('?')[0];return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(e)?e:''}
function strip(html:string){return html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<svg[\s\S]*?<\/svg>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ').trim()}
function grade(score:number){return score>=80?'A':score>=60?'B':'C'}
function address(tags:Record<string,string>){const a=[tags['addr:housenumber'],tags['addr:street']].filter(Boolean).join(' ').trim();const city=first(tags,['addr:city','addr:town','addr:village','addr:suburb','addr:place']);const st=first(tags,['addr:state']);const zip=first(tags,['addr:postcode']);return [a,city,st,zip].filter(Boolean).join(', ')}
function emailsFrom(html:string){const out=new Set<string>();for(const m of html.matchAll(/mailto:([^"'<>\s?]+)/gi)){const e=validEmail(m[1]);if(e)out.add(e)}for(const raw of html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[]){const e=validEmail(raw);if(e)out.add(e)}return [...out]}
function phoneFrom(text:string){return (text.match(/(?:\+?1[\s.\-()]*)?(?:\(?\d{3}\)?[\s.\-]*)\d{3}[\s.\-]*\d{4}/g)||[])[0]||''}
function elementLat(e:OSMElement){return Number(e.lat??e.center?.lat??0)}
function elementLon(e:OSMElement){return Number(e.lon??e.center?.lon??0)}
function nearestCity(e:OSMElement,centers:Center[]){const lat=elementLat(e),lon=elementLon(e);if(!lat||!lon)return first(e.tags||{},['addr:city','addr:town','addr:village'])||centers[0]?.city||'';let best=centers[0],bestD=Infinity;for(const c of centers){const d=(lat-c.lat)**2+(lon-c.lon)**2;if(d<bestD){bestD=d;best=c}}return first(e.tags||{},['addr:city','addr:town','addr:village'])||best?.city||''}

function nameRegex(type:string){
  if(type==='SPORTS_STORE')return 'basketball|hoops|sporting goods|sports store|sports shop';
  if(type==='YOUTH_CLUB')return 'basketball|hoops|AAU|youth|academy|club';
  if(type==='BASKETBALL_GYM')return 'basketball|hoops|gym|sports center|sports centre|training facility';
  return 'basketball|hoops|academy|training|skills|performance|development|elite';
}
function query(center:Center,type:string){
  const regex=nameRegex(type),a=`around:${center.radius},${center.lat},${center.lon}`;
  const blocks=[
    `nwr(${a})["name"~"${regex}",i]["website"];`,
    `nwr(${a})["name"~"${regex}",i]["contact:website"];`
  ];
  if(type!=='SPORTS_STORE'){
    blocks.push(`nwr(${a})["sport"="basketball"]["website"];`);
    blocks.push(`nwr(${a})["sport"="basketball"]["contact:website"];`);
  }
  return `[out:json][timeout:4];\n(\n${blocks.join('\n')}\n);\nout center 28;`;
}

async function fetchCity(center:Center,type:string,index:number):Promise<CityResult>{
  const endpoint=OVERPASS[index%OVERPASS.length];
  const c=new AbortController();const t=setTimeout(()=>c.abort(),4700);
  try{
    const r=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded;charset=UTF-8','accept':'application/json','user-agent':'MING-EAGLE-City-Discovery/1.1 (+https://mingeagle.com)'},body:new URLSearchParams({data:query(center,type)}).toString(),signal:c.signal});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    const body=await r.json() as {elements?:OSMElement[]};
    return {city:center.city,endpoint:new URL(endpoint).hostname,elements:body.elements||[]};
  }finally{clearTimeout(t)}
}
async function fetchPage(url:string){const c=new AbortController();const t=setTimeout(()=>c.abort(),2500);try{const r=await fetch(url,{headers:{accept:'text/html,application/xhtml+xml','accept-language':'en-US,en;q=0.9','user-agent':'Mozilla/5.0 (compatible; MING-EAGLE-City-Discovery/1.1; +https://mingeagle.com)'},redirect:'follow',signal:c.signal});if(!r.ok)throw new Error(`HTTP ${r.status}`);return (await r.text()).slice(0,380000)}finally{clearTimeout(t)}}
function businessMatch(text:string,type:string){if(!/\b(basketball|hoops)\b/i.test(text))return false;if(type==='BASKETBALL_TRAINING')return /\b(academy|training|trainer|skills?|coaching|coach|player development|private lessons?|private training|sessions?|development|performance|workouts?)\b/i.test(text);if(type==='BASKETBALL_GYM')return /\b(gym|facility|sports center|sports centre|court|open gym|recreation center|recreation centre|fitness|training facility)\b/i.test(text);if(type==='YOUTH_CLUB')return /\b(youth|AAU|club|tryouts?|teams?|league|academy|travel)\b/i.test(text);return /\b(store|shop|sporting goods|equipment|retail|gear|buy|cart|products?)\b/i.test(text)}
function priority(e:OSMElement,type:string){const tags=e.tags||{},name=first(tags,['name','brand','operator']),website=normalizeWebsite(first(tags,['contact:website','website','url']));if(!name||!website)return -999;let n=20;if(/basketball|hoops/i.test(name))n+=28;if(tags.sport==='basketball')n+=24;if(type==='BASKETBALL_TRAINING'&&/academy|training|skills|development|performance|elite|coach/i.test(name))n+=18;if(type==='YOUTH_CLUB'&&/youth|aau|club|academy/i.test(name))n+=16;if(type==='BASKETBALL_GYM'&&/gym|center|centre|facility|sports|fitness/i.test(name))n+=14;if(first(tags,['contact:email','email']))n+=8;if(first(tags,['contact:phone','phone','contact:mobile','mobile']))n+=5;return n}

async function verify(e:OSMElement,type:string,state:string,centers:Center[]):Promise<Verified|null>{
  const tags=e.tags||{},name=first(tags,['name','brand','operator']),website=normalizeWebsite(first(tags,['contact:website','website','url']));if(!name||!website)return null;
  try{
    const html=await fetchPage(website),text=strip(html).slice(0,220000),tagText=Object.entries(tags).map(([k,v])=>`${k} ${v}`).join(' ');
    if(!businessMatch(`${name} ${tagText} ${text}`,type))return null;
    let email=validEmail(first(tags,['contact:email','email']));if(!email)email=emailsFrom(html)[0]||'';
    let phone=first(tags,['contact:phone','phone','contact:mobile','mobile']);if(!phone)phone=phoneFrom(text);
    const city=nearestCity(e,centers);let score=70;if(/basketball|hoops/i.test(name))score+=8;if(tags.sport==='basketball')score+=7;if(/academy|training|skills|club|gym|sports|center|centre|development|performance|elite/i.test(name))score+=5;if(email)score+=5;if(phone)score+=3;if(city)score+=2;
    const sourceUrl=`https://www.openstreetmap.org/${e.type}/${e.id}`;
    const evidence=`OSM City V1.1 · parallel metro discovery + official website validation · state=${state} · city=${city} · tags=${['sport','club','leisure','shop'].filter(k=>tags[k]).map(k=>`${k}=${tags[k]}`).join(',')}`.slice(0,1000);
    return {element:e,name,city,address:address(tags),website,email,phone,score:Math.min(98,score),evidence,sourceUrl};
  }catch{return null}
}

async function ensureTables(db:D1Database){
  await db.prepare(`CREATE TABLE IF NOT EXISTS discovery_jobs (id TEXT PRIMARY KEY,country TEXT NOT NULL DEFAULT 'US',state_region TEXT NOT NULL,customer_type TEXT NOT NULL,target_count INTEGER NOT NULL DEFAULT 20,source_provider TEXT NOT NULL DEFAULT 'OPENSTREETMAP',status TEXT NOT NULL DEFAULT 'RUNNING',result_count INTEGER NOT NULL DEFAULT 0,error TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,completed_at TEXT)`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS discovery_candidates (id TEXT PRIMARY KEY,source_key TEXT NOT NULL UNIQUE,source_provider TEXT NOT NULL DEFAULT 'OPENSTREETMAP',name TEXT NOT NULL,customer_type TEXT NOT NULL,country TEXT NOT NULL DEFAULT 'US',state_region TEXT,city TEXT,address TEXT,website TEXT,email TEXT,phone TEXT,whatsapp TEXT,instagram_url TEXT,facebook_url TEXT,latitude REAL,longitude REAL,lead_score INTEGER NOT NULL DEFAULT 0,grade TEXT NOT NULL DEFAULT 'C',status TEXT NOT NULL DEFAULT 'NEW',source_url TEXT NOT NULL,source_evidence TEXT,raw_json TEXT,crm_lead_id TEXT,discovered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
}
async function save(db:D1Database,hits:Verified[],state:string,type:string,target:number){
  let saved=0;const domains=new Set<string>();
  for(const h of hits.sort((a,b)=>b.score-a.score)){
    if(saved>=target)break;const d=domainOf(h.website);if(!d||domains.has(d))continue;domains.add(d);
    const e=h.element,tags=e.tags||{},lat=Number(e.lat??e.center?.lat??0)||null,lon=Number(e.lon??e.center?.lon??0)||null,key=`web:${d}`;
    await db.prepare(`INSERT INTO discovery_candidates (id,source_key,source_provider,name,customer_type,state_region,city,address,website,email,phone,latitude,longitude,lead_score,grade,status,source_url,source_evidence,raw_json) VALUES (?,?, 'OPENSTREETMAP_CITY_V1_1',?,?,?,?,?,?,?,?,?,?,?,?, 'NEW',?,?,?) ON CONFLICT(source_key) DO UPDATE SET customer_type=excluded.customer_type,state_region=excluded.state_region,city=COALESCE(discovery_candidates.city,excluded.city),address=COALESCE(discovery_candidates.address,excluded.address),website=COALESCE(discovery_candidates.website,excluded.website),email=COALESCE(discovery_candidates.email,excluded.email),phone=COALESCE(discovery_candidates.phone,excluded.phone),latitude=COALESCE(discovery_candidates.latitude,excluded.latitude),longitude=COALESCE(discovery_candidates.longitude,excluded.longitude),lead_score=MAX(discovery_candidates.lead_score,excluded.lead_score),grade=CASE WHEN MAX(discovery_candidates.lead_score,excluded.lead_score)>=80 THEN 'A' WHEN MAX(discovery_candidates.lead_score,excluded.lead_score)>=60 THEN 'B' ELSE 'C' END,status=CASE WHEN discovery_candidates.status='CRM' THEN 'CRM' ELSE 'NEW' END,source_evidence=CASE WHEN discovery_candidates.source_provider='WEB_SEARCH_VERIFIED_V6' THEN discovery_candidates.source_evidence ELSE excluded.source_evidence END,updated_at=CURRENT_TIMESTAMP`)
      .bind(crypto.randomUUID(),key,h.name,type,state,h.city||null,h.address||null,h.website,h.email||null,h.phone||null,lat,lon,h.score,grade(h.score),h.sourceUrl,h.evidence,JSON.stringify({tags})).run();
    saved++;
  }
  return saved;
}

export const onRequestPost:PagesFunction<Env>=async({request,env})=>{
  if(!env.MINGEAGLE_DB)return Response.json({ok:false,error:'Database is not configured.'},{status:503});
  const db=env.MINGEAGLE_DB;await ensureTables(db);let jobId='';
  try{
    const input=await request.json() as Input,state=clean(input.stateCode,2).toUpperCase(),type=clean(input.customerType,80).toUpperCase(),target=Math.min(40,Math.max(10,Math.round(Number(input.targetCount||20))));
    if(!allowedState.test(state))return Response.json({ok:false,error:'请选择有效的美国州。'},{status:400});
    if(!allowedTypes.has(type))return Response.json({ok:false,error:'不支持的客户类型。'},{status:400});
    const centers=CENTERS[state];
    if(!centers?.length)return Response.json({ok:true,found:0,checked:0,verified:0,rawCount:0,mode:'OPENSTREETMAP_CITY_V1_1',provider:'OPENSTREETMAP_CITY_V1_1',note:`城市级 OSM V1.1 暂未配置 ${state} 的重点城市，本次由 Web 核心源继续发现。`});
    const goal=Math.min(8,Math.max(4,Math.ceil(target*0.4)));
    jobId=crypto.randomUUID();
    await db.prepare(`INSERT INTO discovery_jobs (id,state_region,customer_type,target_count,source_provider) VALUES (?,?,?,?,'OPENSTREETMAP_CITY_V1_1')`).bind(jobId,state,type,goal).run();

    const started=Date.now();
    const citySettled=await Promise.allSettled(centers.map((center,index)=>fetchCity(center,type,index)));
    const cityResults:CityResult[]=citySettled.flatMap(r=>r.status==='fulfilled'?[r.value]:[]);
    const failedCities=citySettled.flatMap((r,i)=>r.status==='rejected'?[centers[i].city]:[]);
    const allElements=cityResults.flatMap(r=>r.elements);
    const dedupe=new Map<string,OSMElement>();
    for(const e of allElements){
      const tags=e.tags||{},website=normalizeWebsite(first(tags,['contact:website','website','url'])),d=domainOf(website);if(!d)continue;
      const old=dedupe.get(d);if(!old||priority(e,type)>priority(old,type))dedupe.set(d,e);
    }
    const candidates=[...dedupe.values()].map(e=>({e,p:priority(e,type)})).filter(x=>x.p>=0).sort((a,b)=>b.p-a.p).slice(0,14).map(x=>x.e);
    const verified:Verified[]=[];let checked=0;
    for(let i=0;i<candidates.length;i+=4){
      if(Date.now()-started>14500)break;
      const batch=candidates.slice(i,i+4);checked+=batch.length;
      const rs=await Promise.allSettled(batch.map(e=>verify(e,type,state,centers)));
      verified.push(...rs.flatMap(r=>r.status==='fulfilled'&&r.value?[r.value]:[]));
      if(verified.length>=goal)break;
    }
    const found=await save(db,verified,state,type,goal);
    await db.prepare(`UPDATE discovery_jobs SET status='COMPLETED',result_count=?,completed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(found,jobId).run();
    const elapsedMs=Date.now()-started;
    const successfulCities=cityResults.map(x=>x.city).join(', ')||'无';
    const failedText=failedCities.length?`；超时/失败城市：${failedCities.join(', ')}`:'';
    return Response.json({ok:true,found,checked,verified:verified.length,rawCount:allElements.length,uniqueDomains:dedupe.size,elapsedMs,endpoint:cityResults.map(x=>x.endpoint).filter((v,i,a)=>a.indexOf(v)===i).join(','),attempts:centers.length,mode:'OPENSTREETMAP_CITY_V1_1',provider:'OPENSTREETMAP_CITY_V1_1',note:found?`城市级 OSM V1.1：并行城市成功 ${successfulCities}，原始 ${allElements.length} 个，官网域名去重 ${dedupe.size} 个，检查 ${checked} 个，验证并保存 ${found} 个（${Math.round(elapsedMs/1000)} 秒）${failedText}。`:`城市级 OSM V1.1：并行城市成功 ${successfulCities}，原始 ${allElements.length} 个，官网域名去重 ${dedupe.size} 个，检查 ${checked} 个，本次没有新增通过官网验证的机构（${Math.round(elapsedMs/1000)} 秒）${failedText}。`});
  }catch(error){
    const msg=error instanceof Error?error.message:'City OSM discovery failed.';
    if(jobId)await db.prepare(`UPDATE discovery_jobs SET status='FAILED',error=?,completed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(msg.slice(0,1000),jobId).run();
    return Response.json({ok:false,error:msg},{status:502});
  }
};