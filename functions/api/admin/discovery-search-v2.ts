interface Env {
  MINGEAGLE_DB: D1Database;
}

type Input = { stateCode?: string; customerType?: string; targetCount?: number | string };
type OverpassElement = { type:'node'|'way'|'relation'; id:number; lat?:number; lon?:number; center?:{lat?:number;lon?:number}; tags?:Record<string,string> };
type Seed = [number, number, string];

const clean = (value: unknown, max = 1000) => typeof value === 'string' ? value.trim().slice(0,max) : '';
const allowedState = /^[A-Z]{2}$/;
const allowedTypes = new Set(['BASKETBALL_TRAINING','BASKETBALL_GYM','YOUTH_CLUB','SPORTS_STORE']);

const METROS: Record<string, Seed[]> = {
  AL:[[33.5186,-86.8104,'Birmingham'],[30.6954,-88.0399,'Mobile']],
  AK:[[61.2181,-149.9003,'Anchorage']],
  AZ:[[33.4484,-112.0740,'Phoenix'],[32.2226,-110.9747,'Tucson']],
  AR:[[34.7465,-92.2896,'Little Rock']],
  CA:[[34.0522,-118.2437,'Los Angeles'],[37.7749,-122.4194,'San Francisco'],[32.7157,-117.1611,'San Diego'],[38.5816,-121.4944,'Sacramento']],
  CO:[[39.7392,-104.9903,'Denver'],[38.8339,-104.8214,'Colorado Springs']],
  CT:[[41.7658,-72.6734,'Hartford'],[41.3083,-72.9279,'New Haven']],
  DE:[[39.7391,-75.5398,'Wilmington']],
  FL:[[25.7617,-80.1918,'Miami'],[28.5383,-81.3792,'Orlando'],[27.9506,-82.4572,'Tampa'],[30.3322,-81.6557,'Jacksonville']],
  GA:[[33.7490,-84.3880,'Atlanta'],[32.0809,-81.0912,'Savannah']],
  HI:[[21.3069,-157.8583,'Honolulu']],
  ID:[[43.6150,-116.2023,'Boise']],
  IL:[[41.8781,-87.6298,'Chicago'],[39.7817,-89.6501,'Springfield']],
  IN:[[39.7684,-86.1581,'Indianapolis'],[41.0793,-85.1394,'Fort Wayne']],
  IA:[[41.5868,-93.6250,'Des Moines'],[41.6611,-91.5302,'Iowa City']],
  KS:[[37.6872,-97.3301,'Wichita'],[39.0473,-95.6752,'Topeka']],
  KY:[[38.2527,-85.7585,'Louisville'],[38.0406,-84.5037,'Lexington']],
  LA:[[29.9511,-90.0715,'New Orleans'],[30.4515,-91.1871,'Baton Rouge']],
  ME:[[43.6591,-70.2568,'Portland']],
  MD:[[39.2904,-76.6122,'Baltimore'],[38.9784,-76.4922,'Annapolis']],
  MA:[[42.3601,-71.0589,'Boston'],[42.2626,-71.8023,'Worcester']],
  MI:[[42.3314,-83.0458,'Detroit'],[42.9634,-85.6681,'Grand Rapids']],
  MN:[[44.9778,-93.2650,'Minneapolis'],[44.9537,-93.0900,'Saint Paul']],
  MS:[[32.2988,-90.1848,'Jackson'],[30.3674,-89.0928,'Gulfport']],
  MO:[[38.6270,-90.1994,'St Louis'],[39.0997,-94.5786,'Kansas City']],
  MT:[[45.7833,-108.5007,'Billings'],[46.8721,-113.9940,'Missoula']],
  NE:[[41.2565,-95.9345,'Omaha'],[40.8136,-96.7026,'Lincoln']],
  NV:[[36.1699,-115.1398,'Las Vegas'],[39.5296,-119.8138,'Reno']],
  NH:[[42.9956,-71.4548,'Manchester']],
  NJ:[[40.7357,-74.1724,'Newark'],[40.2171,-74.7429,'Trenton']],
  NM:[[35.0844,-106.6504,'Albuquerque'],[35.6870,-105.9378,'Santa Fe']],
  NY:[[40.7128,-74.0060,'New York City'],[42.8864,-78.8784,'Buffalo'],[43.1566,-77.6088,'Rochester'],[42.6526,-73.7562,'Albany']],
  NC:[[35.2271,-80.8431,'Charlotte'],[35.7796,-78.6382,'Raleigh'],[36.0726,-79.7920,'Greensboro']],
  ND:[[46.8772,-96.7898,'Fargo'],[46.8083,-100.7837,'Bismarck']],
  OH:[[39.9612,-82.9988,'Columbus'],[41.4993,-81.6944,'Cleveland'],[39.1031,-84.5120,'Cincinnati']],
  OK:[[35.4676,-97.5164,'Oklahoma City'],[36.1540,-95.9928,'Tulsa']],
  OR:[[45.5152,-122.6784,'Portland'],[44.0521,-123.0868,'Eugene']],
  PA:[[39.9526,-75.1652,'Philadelphia'],[40.4406,-79.9959,'Pittsburgh'],[40.2732,-76.8867,'Harrisburg']],
  RI:[[41.8240,-71.4128,'Providence']],
  SC:[[34.0007,-81.0348,'Columbia'],[32.7765,-79.9311,'Charleston'],[34.8526,-82.3940,'Greenville']],
  SD:[[43.5446,-96.7311,'Sioux Falls'],[44.0805,-103.2310,'Rapid City']],
  TN:[[36.1627,-86.7816,'Nashville'],[35.1495,-90.0490,'Memphis'],[35.9606,-83.9207,'Knoxville']],
  TX:[[32.7767,-96.7970,'Dallas'],[29.7604,-95.3698,'Houston'],[30.2672,-97.7431,'Austin'],[29.4241,-98.4936,'San Antonio'],[32.7555,-97.3308,'Fort Worth']],
  UT:[[40.7608,-111.8910,'Salt Lake City'],[40.2338,-111.6585,'Provo']],
  VT:[[44.4759,-73.2121,'Burlington']],
  VA:[[37.5407,-77.4360,'Richmond'],[36.8529,-75.9780,'Virginia Beach'],[38.8048,-77.0469,'Alexandria']],
  WA:[[47.6062,-122.3321,'Seattle'],[47.2529,-122.4443,'Tacoma'],[47.6588,-117.4260,'Spokane']],
  WV:[[38.3498,-81.6326,'Charleston'],[39.6295,-79.9559,'Morgantown']],
  WI:[[43.0389,-87.9065,'Milwaukee'],[43.0731,-89.4012,'Madison']],
  WY:[[41.1400,-104.8202,'Cheyenne']],
};

async function ensureTables(db:D1Database){
  await db.prepare(`CREATE TABLE IF NOT EXISTS discovery_jobs (id TEXT PRIMARY KEY,country TEXT NOT NULL DEFAULT 'US',state_region TEXT NOT NULL,customer_type TEXT NOT NULL,target_count INTEGER NOT NULL DEFAULT 20,source_provider TEXT NOT NULL DEFAULT 'OPENSTREETMAP',status TEXT NOT NULL DEFAULT 'RUNNING',result_count INTEGER NOT NULL DEFAULT 0,error TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,completed_at TEXT)`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS discovery_candidates (id TEXT PRIMARY KEY,source_key TEXT NOT NULL UNIQUE,source_provider TEXT NOT NULL DEFAULT 'OPENSTREETMAP',name TEXT NOT NULL,customer_type TEXT NOT NULL,country TEXT NOT NULL DEFAULT 'US',state_region TEXT,city TEXT,address TEXT,website TEXT,email TEXT,phone TEXT,whatsapp TEXT,instagram_url TEXT,facebook_url TEXT,latitude REAL,longitude REAL,lead_score INTEGER NOT NULL DEFAULT 0,grade TEXT NOT NULL DEFAULT 'C',status TEXT NOT NULL DEFAULT 'NEW',source_url TEXT NOT NULL,source_evidence TEXT,raw_json TEXT,crm_lead_id TEXT,discovered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
}

function filterFor(type:string, scope:string){
  if(type==='SPORTS_STORE') return `nwr["shop"="sports"]["name"]${scope};`;
  if(type==='YOUTH_CLUB') return `nwr["sport"="basketball"]["name"~"youth|club|aau|academy|basketball",i]${scope};\nnwr["club"="sport"]["name"]${scope};`;
  if(type==='BASKETBALL_GYM') return `nwr["leisure"~"sports_centre|fitness_centre",i]["name"]${scope};\nnwr["sport"="basketball"]["name"]${scope};`;
  return `nwr["name"~"basketball|hoops|basketball academy|basketball training|skills training",i]${scope};\nnwr["sport"="basketball"]["leisure"~"sports_centre|fitness_centre",i]${scope};\nnwr["sport"="basketball"]["club"="sport"]${scope};`;
}

function buildMetroQuery(stateCode:string,type:string,limit:number){
  const seeds = METROS[stateCode] || [];
  const body = seeds.slice(0,5).map(([lat,lon])=>filterFor(type,`(around:45000,${lat},${lon})`)).join('\n');
  return `[out:json][timeout:12];\n(\n${body}\n);\nout center ${Math.min(120,Math.max(30,limit*3))};`;
}

async function callEndpoint(endpoint:string, query:string){
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(),14000);
  try{
    const response = await fetch(endpoint,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded;charset=UTF-8','accept':'application/json','user-agent':'MING-EAGLE-Customer-Discovery/2.0'},body:new URLSearchParams({data:query}).toString(),signal:controller.signal});
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json() as {elements?:OverpassElement[]};
    return data.elements || [];
  } finally { clearTimeout(timer); }
}

async function fetchOverpass(query:string){
  const endpoints = [
    'https://overpass.private.coffee/api/interpreter',
    'https://overpass-api.de/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://overpass.osm.jp/api/interpreter',
  ];
  try { return await Promise.any(endpoints.map(e=>callEndpoint(e,query))); }
  catch { throw new Error('PUBLIC_SOURCE_BUSY'); }
}

function firstTag(tags:Record<string,string>,keys:string[]){for(const key of keys){const v=clean(tags[key]);if(v)return v.split(';')[0].trim();}return '';}
function normalizeWebsite(v:string){if(!v)return '';const x=v.split(';')[0].trim();return /^https?:\/\//i.test(x)?x:`https://${x}`;}
function normalizedName(v:string){return v.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().slice(0,240);}
function addressFrom(tags:Record<string,string>){const line=[tags['addr:housenumber'],tags['addr:street']].filter(Boolean).join(' ');const city=firstTag(tags,['addr:city','addr:town','addr:village','addr:suburb','addr:place']);return [line,city,firstTag(tags,['addr:state']),firstTag(tags,['addr:postcode'])].filter(Boolean).join(', ');}
function grade(score:number){return score>=80?'A':score>=60?'B':'C';}
function scoreCandidate(tags:Record<string,string>,type:string,website:string,email:string,phone:string,whatsapp:string,city:string){let score=38;const name=clean(tags.name,300).toLowerCase();const sport=clean(tags.sport,200).toLowerCase();if(sport.includes('basketball')||name.includes('basketball')||name.includes('hoops'))score+=15;if(type==='BASKETBALL_TRAINING'&&/(academy|training|skills|camp)/i.test(name))score+=8;if(type==='YOUTH_CLUB'&&/(youth|club|aau)/i.test(name))score+=8;if(website)score+=12;if(email)score+=14;if(phone)score+=8;if(whatsapp)score+=3;if(city)score+=2;return Math.min(100,score);}

function nearestSeedCity(state:string,lat:number,lon:number){
  const seeds=METROS[state]||[];let best='';let bestD=Infinity;
  for(const [sLat,sLon,name] of seeds){const d=(lat-sLat)*(lat-sLat)+(lon-sLon)*(lon-sLon);if(d<bestD){bestD=d;best=name;}}
  return best;
}

async function saveElements(db:D1Database,elements:OverpassElement[],stateCode:string,customerType:string,target:number){
  const seen=new Set<string>();let saved=0;
  for(const element of elements){
    if(saved>=target)break;
    const tags=element.tags||{};const name=firstTag(tags,['name','brand','operator']);if(!name)continue;
    const lat=Number(element.lat??element.center?.lat??0)||0;const lon=Number(element.lon??element.center?.lon??0)||0;
    const city=firstTag(tags,['addr:city','addr:town','addr:village','addr:suburb','addr:place'])||nearestSeedCity(stateCode,lat,lon);
    const dedupe=`${normalizedName(name)}|${city.toLowerCase()}|${stateCode}`;if(seen.has(dedupe))continue;seen.add(dedupe);
    const website=normalizeWebsite(firstTag(tags,['contact:website','website','url']));
    const email=firstTag(tags,['contact:email','email']).toLowerCase();const phone=firstTag(tags,['contact:phone','phone','contact:mobile','mobile']);const whatsapp=firstTag(tags,['contact:whatsapp','whatsapp']);
    const instagram=firstTag(tags,['contact:instagram','instagram']);const facebook=firstTag(tags,['contact:facebook','facebook']);
    const score=scoreCandidate(tags,customerType,website,email,phone,whatsapp,city);const sourceKey=`osm:${element.type}:${element.id}`;const sourceUrl=`https://www.openstreetmap.org/${element.type}/${element.id}`;
    const evidence=['OpenStreetMap metro discovery',city?`metro=${city}`:'',tags.sport?`sport=${tags.sport}`:'',tags.shop?`shop=${tags.shop}`:'',tags.leisure?`leisure=${tags.leisure}`:'',tags.club?`club=${tags.club}`:''].filter(Boolean).join(' · ');
    await db.prepare(`INSERT INTO discovery_candidates (id,source_key,name,customer_type,state_region,city,address,website,email,phone,whatsapp,instagram_url,facebook_url,latitude,longitude,lead_score,grade,source_url,source_evidence,raw_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(source_key) DO UPDATE SET name=excluded.name,customer_type=excluded.customer_type,state_region=excluded.state_region,city=excluded.city,address=excluded.address,website=excluded.website,email=excluded.email,phone=excluded.phone,whatsapp=excluded.whatsapp,instagram_url=excluded.instagram_url,facebook_url=excluded.facebook_url,latitude=excluded.latitude,longitude=excluded.longitude,lead_score=excluded.lead_score,grade=excluded.grade,source_evidence=excluded.source_evidence,raw_json=excluded.raw_json,updated_at=CURRENT_TIMESTAMP`)
      .bind(crypto.randomUUID(),sourceKey,name,customerType,stateCode,city||null,addressFrom(tags)||null,website||null,email||null,phone||null,whatsapp||null,instagram||null,facebook||null,lat||null,lon||null,score,grade(score),sourceUrl,evidence,JSON.stringify({tags})).run();
    saved++;
  }
  return saved;
}

export const onRequestPost:PagesFunction<Env>=async({request,env})=>{
  if(!env.MINGEAGLE_DB)return Response.json({ok:false,error:'Database is not configured.'},{status:503});
  const db=env.MINGEAGLE_DB;await ensureTables(db);
  let jobId='';
  try{
    const input=await request.json() as Input;const stateCode=clean(input.stateCode,2).toUpperCase();const customerType=clean(input.customerType,80).toUpperCase();const targetCount=Math.min(100,Math.max(10,Math.round(Number(input.targetCount||20))));
    if(!allowedState.test(stateCode)||!METROS[stateCode])return Response.json({ok:false,error:'请选择有效的美国州。'},{status:400});
    if(!allowedTypes.has(customerType))return Response.json({ok:false,error:'不支持的客户类型。'},{status:400});
    jobId=crypto.randomUUID();await db.prepare(`INSERT INTO discovery_jobs (id,state_region,customer_type,target_count,source_provider) VALUES (?,?,?,?, 'OPENSTREETMAP_METRO')`).bind(jobId,stateCode,customerType,targetCount).run();
    const elements=await fetchOverpass(buildMetroQuery(stateCode,customerType,targetCount));
    const found=await saveElements(db,elements,stateCode,customerType,targetCount);
    await db.prepare(`UPDATE discovery_jobs SET status='COMPLETED',result_count=?,completed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(found,jobId).run();
    return Response.json({ok:true,jobId,found,mode:'METRO'});
  }catch(error){
    const raw=error instanceof Error?error.message:'Search failed.';const message=raw==='PUBLIC_SOURCE_BUSY'?'公共地图数据源暂时繁忙，都会区分片和多个备用节点均未在时限内返回。请稍后再试。':raw;
    if(jobId)await db.prepare(`UPDATE discovery_jobs SET status='FAILED',error=?,completed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(message.slice(0,1000),jobId).run();
    console.error('discovery_search_v2_failed',error);
    return Response.json({ok:false,error:message},{status:502});
  }
};
