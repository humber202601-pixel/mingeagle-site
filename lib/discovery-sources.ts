import { STATE_NAMES, METROS, TERMS, COMMERCIAL_TYPES } from '../shared/discovery';
import { publicUrl, fetchPublicText } from './public-web';

export const EXPANSION_SOURCES = ['SOCIAL','DIRECTORY','NCES','OSM'] as const;
export type ExpansionSource = typeof EXPANSION_SOURCES[number];
export type Clue = {key:string;title:string;source:string;url:string;snippet:string;city:string;website:string};
export type SourceInput = {stateCode:string;customerType:string;city:string;round:number;targetCount:number};
const schoolTerms:Record<string,string>={PRESCHOOL_KINDERGARTEN:'preschool kindergarten',ELEMENTARY_SCHOOL:'elementary school',MIDDLE_HIGH_SCHOOL:'middle high school',PRIVATE_CHARTER_SCHOOL:'private charter school',SCHOOL_DISTRICT:'school district purchasing',AFTER_SCHOOL_PROGRAM:'after school youth program',EDUCATION_SUPPLIER:'school physical education equipment supplier'};
const clean=(v:unknown,max=1500)=>String(v??'').trim().replace(/\s+/g,' ').slice(0,max);
const decode=(v:string)=>v.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'");
const strip=(v:string)=>decode(v.replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
const xml=(v:string,key:string)=>strip(v.match(new RegExp(`<${key}[^>]*>([\\s\\S]*?)<\\/${key}>`,'i'))?.[1]||'');
const socialHosts=['facebook.com','instagram.com','linkedin.com'];
const directoryHosts=['chamberofcommerce.com','yellowpages.com','bbb.org','manta.com'];
const hostIn=(host:string,list:string[])=>list.some(x=>host===x||host.endsWith('.'+x));
export function sourceUrl(value:string,source:ExpansionSource){
  if(!publicUrl(value))return '';
  try{const u=new URL(value),host=u.hostname.toLowerCase().replace(/^www\./,'');u.hash='';
    if(source==='SOCIAL'){
      if(!hostIn(host,socialHosts)||/^\/(?:p|reel|reels|explore|stories|groups|posts|watch|login|accounts|share|search|help|privacy)(?:\/|$)/i.test(u.pathname))return '';
      if(hostIn(host,['linkedin.com'])&&!/^\/company\//i.test(u.pathname))return '';
      if(u.pathname==='/'||/\/posts\/|\/videos\/|\/photos\/|\/status\//i.test(u.pathname))return '';
      u.search='';
    }else if(source==='DIRECTORY'&&!hostIn(host,directoryHosts)&&!host.endsWith('.gov')&&!host.endsWith('.edu'))return '';
    return u.toString();
  }catch{return ''}
}
export function parseRssClues(rss:string,source:ExpansionSource,query:string,city:string,type:string):Clue[]{
  const out:Clue[]=[],seen=new Set<string>();
  const business=COMMERCIAL_TYPES.has(type)?/basketball|hoops|sporting goods|sports equipment|physical education|ymca/i:/school|district|preschool|kindergarten|education|after.school|youth program/i;
  for(const item of rss.match(/<item\b[\s\S]*?<\/item>/gi)||[]){
    const title=xml(item,'title'),url=sourceUrl(xml(item,'link'),source),snippet=xml(item,'description'),body=title+' '+snippet;
    if(!url||!title||seen.has(url)||!business.test(body)||/live scores?|betting|online games?|NBA news|basketball reference/i.test(body))continue;
    if(city&&!new RegExp('\\b'+city.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','i').test(body))continue;
    seen.add(url);out.push({key:url,title:clean(title,200),source,url,snippet:clean(`公开搜索摘要：${snippet} · 查询：${query}`),city,website:''});
  }return out;
}
async function json(url:string,init:RequestInit={},timeout=12000){
  const c=new AbortController(),t=setTimeout(()=>c.abort(),timeout);
  try{const r=await fetch(url,{...init,signal:c.signal,headers:{accept:'application/json','user-agent':'MING-EAGLE-Public-Discovery/14.0 (+https://mingeagle.com)',...init.headers}});if(!r.ok)throw new Error(`公开来源 HTTP ${r.status}`);const text=await r.text();if(text.length>1500000)throw new Error('公开来源返回内容过大。');const d=JSON.parse(text);if(d.error)throw new Error(clean(d.error.message||d.error,180));if(d.remark)throw new Error(clean(d.remark,180));return d;}catch(e){if(e instanceof Error&&e.name==='AbortError')throw new Error('公开数据源请求超时，请稍后重试。');throw e;}finally{clearTimeout(t)}
}
export async function indexedClues(input:SourceInput,source:'SOCIAL'|'DIRECTORY'){
  const cities=input.city?[input.city]:METROS[input.stateCode]||[STATE_NAMES[input.stateCode]];
  const city=cities[input.round%cities.length];
  const terms=TERMS[input.customerType]||[schoolTerms[input.customerType]||'school'];
  const term=terms[Math.floor(input.round/cities.length)%terms.length];
  const sites=source==='SOCIAL'?['facebook.com','instagram.com','linkedin.com/company']:['chamberofcommerce.com','yellowpages.com','.gov'];
  const results=await Promise.allSettled(sites.map(async site=>{
    const query=`site:${site} ${term} "${city}" ${STATE_NAMES[input.stateCode]}`;
    const rss=await fetchPublicText(`https://www.bing.com/search?q=${encodeURIComponent(query)}&format=rss&mkt=en-US&setlang=en-US`,6500);
    if(!/<rss\b|<channel\b/i.test(rss))throw new Error('公开搜索未返回可读取索引。');
    return parseRssClues(rss,source,query,city,input.customerType);
  }));
  if(results.every(x=>x.status==='rejected'))throw new Error('公开网页索引本次不可用。');
  const failed=results.filter(x=>x.status==='rejected').length;
  return {clues:results.flatMap(x=>x.status==='fulfilled'?x.value:[]).slice(0,30),note:`${sites.length-failed}/${sites.length} 个公开索引查询完成；仅包含搜索引擎可见页面，尚未核验机构身份。`,partial:failed>0};
}
export const NCES_SCHOOL='https://nces.ed.gov/opengis/rest/services/K12_School_Locations/EDGE_GEOCODE_PUBLICSCH_2425/MapServer/0';
export const NCES_DISTRICT='https://services1.arcgis.com/Ua5sjt3LWTPigjyD/ArcGIS/rest/services/School_District_Office_Locations_Current/FeatureServer/0';
export function ncesQuery(input:SourceInput){
  const district=input.customerType==='SCHOOL_DISTRICT';
  if(!district&&!['ELEMENTARY_SCHOOL','MIDDLE_HIGH_SCHOOL'].includes(input.customerType))throw new Error('NCES 本批支持公立小学、初高中及学区；其他类别请选公开目录。');
  const base=district?NCES_DISTRICT:NCES_SCHOOL;
  let where=`STATE='${input.stateCode}'`;
  if(input.city)where+=` AND UPPER(CITY)='${input.city.toUpperCase().replace(/'/g,"''")}'`;
  if(!district){const names=input.customerType==='ELEMENTARY_SCHOOL'?['%ELEMENTARY%','%PRIMARY%','% EL','% ELEM']:['%MIDDLE%','%HIGH%','% MS','% HS','% J H'];where+=' AND ('+names.map(n=>`UPPER(NAME) LIKE '${n}'`).join(' OR ')+')';}
  const limit=Math.min(50,input.targetCount),url=new URL(base+'/query');
  for(const [k,v]of Object.entries({where,outFields:'*',returnGeometry:'false',orderByFields:'OBJECTID',resultOffset:String(input.round*limit),resultRecordCount:String(limit),f:'json'}))url.searchParams.set(k,v);
  return {base,url:url.toString(),district};
}
export async function ncesClues(input:SourceInput){
  const {base,url,district}=ncesQuery(input),data=await json(url);
  if(!Array.isArray(data.features))throw new Error('NCES 未返回学校名录。');
  const clues:Clue[]=[];
  for(const feature of data.features){const a=feature.attributes||{},title=clean(a.NAME,200),city=clean(a.CITY,80),id=clean(district?a.LEAID:a.NCESSCH,20);
    if(!title||!id||clean(a.STATE).toUpperCase()!==input.stateCode||(input.city&&city.toLowerCase()!==input.city.toLowerCase()))continue;
    const sourceUrl=new URL(base+'/query');for(const [k,v]of Object.entries({where:`${district?'LEAID':'NCESSCH'}='${id.replace(/'/g,"''")}'`,outFields:'*',returnGeometry:'false',f:'pjson'}))sourceUrl.searchParams.set(k,v);
    clues.push({key:`nces:${district?'district':'school'}:${id}`,title,source:'NCES',url:sourceUrl.toString(),city,website:'',snippet:clean(`美国 NCES 官方${district?'学区':'公立学校'}名录 · 编号 ${id} · 学年 ${a.SCHOOLYEAR||'2024–25'} · 地址 ${a.STREET||''}, ${city}, ${input.stateCode} ${a.ZIP||''}。需补充官网、核实当前运营及采购联系信息。`)});
  }return {clues,note:`NCES 官方${district?'学区':'公立学校'}名录返回 ${clues.length} 条；学年保留在证据中，不代表已有采购需求。`,partial:false};
}
export function osmQuery(input:SourceInput,bounds?:[number,number,number,number]){
  if(!input.city)throw new Error('OSM 地图搜索请填写城市，避免全州大范围查询。');
  if(bounds&&(!bounds.every(Number.isFinite)||bounds[0]>=bounds[2]||bounds[1]>=bounds[3]||Math.abs(bounds[0])>90||Math.abs(bounds[2])>90||Math.abs(bounds[1])>180||Math.abs(bounds[3])>180))throw new Error('城市地图边界无效。');
  const scope=`${bounds?'('+bounds.join(',')+')':'(area.state)'}["addr:city"~${JSON.stringify('^'+input.city.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$')},i]["name"]`;
  const filters=['SPORTS_STORE','SPORTS_DISTRIBUTOR','EDUCATION_SUPPLIER'].includes(input.customerType)?['["shop"="sports"]']:COMMERCIAL_TYPES.has(input.customerType)?['["leisure"="sports_centre"]','["club"="sport"]["sport"~"basketball"]','["office"="educational_institution"]']:['["amenity"="school"]','["amenity"="kindergarten"]'];
  return `[out:json][timeout:8][maxsize:16777216];${bounds?'':`area["ISO3166-2"="US-${input.stateCode}"]->.state;`}(${filters.map(f=>`nwr${scope}${f};`).join('')});out tags 50;`;
}
export async function osmClues(input:SourceInput,geoapifyKey?:string){
  if(!input.city)throw new Error('OSM 地图搜索请填写城市，避免全州大范围查询。');
  let bounds:[number,number,number,number]|undefined;
  if(geoapifyKey){
    const url=new URL('https://api.geoapify.com/v1/geocode/search');for(const [k,v]of Object.entries({text:`${input.city} ${STATE_NAMES[input.stateCode]}`,type:'city',format:'json',filter:'countrycode:us',limit:'1',apiKey:geoapifyKey}))url.searchParams.set(k,v);
    const center=await json(url.toString(),{},6000),place=center.results?.[0];
    if(!place||String(place.state_code).toUpperCase()!==input.stateCode||String(place.country_code).toLowerCase()!=='us')throw new Error('地图城市与所选美国州不匹配。');
    const box=place.bbox;if(box)bounds=[Number(box.lat1),Number(box.lon1),Number(box.lat2),Number(box.lon2)];
    if(!bounds||!bounds.every(Number.isFinite))throw new Error('未能确认城市地图边界，请稍后重试。');
  }
  const body=new URLSearchParams({data:osmQuery(input,bounds)}).toString();let data;
  for(const endpoint of ['https://overpass-api.de/api/interpreter','https://overpass.private.coffee/api/interpreter']){
    try{data=await json(endpoint,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body},11000);break;}catch(e){if(endpoint.includes('private.coffee'))throw e;}
  }
  if(!Array.isArray(data.elements))throw new Error('OSM 未返回地点数据。');
  const clues:Clue[]=[];
  for(const e of data.elements){const t=e.tags||{},title=clean(t.name,200),city=clean(t['addr:city'],80);
    if(!title||city.toLowerCase()!==input.city.toLowerCase()||!['node','way','relation'].includes(e.type)||!Number.isSafeInteger(e.id)||/drinking fountain|basketball hoop|basketball court$/i.test(title))continue;
    let website=clean(t.website||t['contact:website'],1000).split(';')[0];if(website&&!/^https?:\/\//i.test(website))website='https://'+website;if(!publicUrl(website))website='';
    clues.push({key:`osm:${e.type}:${e.id}`,title,source:'OSM',url:`https://www.openstreetmap.org/${e.type}/${e.id}`,city,website,snippet:clean(`OpenStreetMap 地点资料 · ${t['addr:street']||''} ${t['addr:housenumber']||''}, ${city} · ${t.shop||t.leisure||t.club||t.amenity||t.office||''}。地图分类仅提供机构线索，业务及联系信息需官网核验。`)});
  }return {clues,note:`OSM 地图返回 ${clues.length} 条具名机构线索；普通球场、篮球架和饮水点不入库。`,partial:false};
}
export async function collectSource(input:SourceInput,source:ExpansionSource,geoapifyKey?:string){if(source==='NCES')return ncesClues(input);if(source==='OSM')return osmClues(input,geoapifyKey);return indexedClues(input,source);}
export async function ensureClues(db:D1Database){
  await db.prepare(`CREATE TABLE IF NOT EXISTS discovery_clues (id TEXT PRIMARY KEY,source_key TEXT NOT NULL UNIQUE,title TEXT NOT NULL,source_provider TEXT NOT NULL,source_url TEXT NOT NULL,source_evidence TEXT,customer_type TEXT NOT NULL,state_region TEXT NOT NULL,city TEXT,website TEXT,status TEXT NOT NULL DEFAULT 'PENDING',candidate_id TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_discovery_clues_status ON discovery_clues(status,updated_at DESC)`).run();
}
