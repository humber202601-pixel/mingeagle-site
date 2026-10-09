import { STATE_NAMES, METROS, TERMS, COMMERCIAL_TYPES } from '../shared/discovery';
import { publicUrl, fetchPublicText } from './public-web';
import {isWebsiteVendorSocial} from './public-contacts';
import {alternateSearch,rssSearchHits,type PublicSearchHit} from './public-search';

export const SOCIAL_SOURCES = ['FACEBOOK','TIKTOK','INSTAGRAM','LINKEDIN'] as const;
export type SocialSource = typeof SOCIAL_SOURCES[number];
export const EXPANSION_SOURCES = ['SOCIAL',...SOCIAL_SOURCES,'DIRECTORY','NCES','NCES_PRIVATE','NCES_DISTRICTS','OSM','GEOAPIFY','WEBSITE_SOCIAL'] as const;
export type ExpansionSource = typeof EXPANSION_SOURCES[number];
export type Clue = {key:string;title:string;source:string;url:string;snippet:string;city:string;website:string;customerType?:string;aliasKeys?:string[];address?:string};
export type SourceInput = {stateCode:string;customerType:string;city:string;round:number;targetCount:number};
export function sourceCity(input:SourceInput){const cities=input.city?[input.city]:METROS[input.stateCode]||[STATE_NAMES[input.stateCode]];return {city:cities[input.round%cities.length],page:Math.floor(input.round/cities.length)};}
export function mapBuyerMatch(title:string,type:string,context=''){
  if(!COMMERCIAL_TYPES.has(type)||['SPORTS_STORE','SPORTS_DISTRIBUTOR','SUMMER_CAMP','MULTISPORT_ACADEMY'].includes(type))return true;
  if(/basketball|hoops/i.test(title+' '+context))return true;
  if(['BASKETBALL_TRAINING','BASKETBALL_GYM','YOUTH_CLUB','INDEPENDENT_COACH'].includes(type))return false;
  return !/swim|aquatic|cheer|climb|bouldering|tennis|pickleball|golf|skating|martial|jiu.?jitsu|karate|taekwondo|boxing|pilates|yoga|crossfit|soccer|football|equestrian|ice rink|softball|baseball|bowling|bowl and barrel|track stadium|track and|sandy pickle/i.test(title+' '+context);
}
export function mapBuyerType(title:string,requested:string){
  if(!COMMERCIAL_TYPES.has(requested))return requested;
  if(/recreation|recreational|ymca|community cent(?:er|re)/i.test(title))return 'RECREATION_CENTER';
  if(['BASKETBALL_TRAINING','BASKETBALL_GYM','YOUTH_CLUB','INDEPENDENT_COACH'].includes(requested)&&/fitness|gym|sports? cent(?:er|re)|sports? hall/i.test(title)&&!/academy|training|skills|coach/i.test(title))return 'BASKETBALL_GYM';
  return requested;
}
export type WebsiteSocialProfile = {source:SocialSource;url:string;pageUrl:string;originalUrl:string;label:string};
const schoolTerms:Record<string,string>={PRESCHOOL_KINDERGARTEN:'preschool kindergarten',ELEMENTARY_SCHOOL:'elementary school',MIDDLE_HIGH_SCHOOL:'middle high school',PRIVATE_CHARTER_SCHOOL:'private charter school',SCHOOL_DISTRICT:'school district purchasing',AFTER_SCHOOL_PROGRAM:'after school youth program',EDUCATION_SUPPLIER:'school physical education equipment supplier'};
const clean=(v:unknown,max=1500)=>String(v??'').trim().replace(/\s+/g,' ').slice(0,max);
const decode=(v:string)=>v.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'");
const strip=(v:string)=>decode(v.replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
const xml=(v:string,key:string)=>strip(v.match(new RegExp(`<${key}[^>]*>([\\s\\S]*?)<\\/${key}>`,'i'))?.[1]||'');
const socialSites:Record<SocialSource,string>={FACEBOOK:'facebook.com',TIKTOK:'tiktok.com',INSTAGRAM:'instagram.com',LINKEDIN:'linkedin.com/company'};
const socialHosts=['facebook.com','fb.com','instagram.com','linkedin.com','tiktok.com'];
const directoryHosts=['chamberofcommerce.com','yellowpages.com','bbb.org','manta.com'];
const hostIn=(host:string,list:string[])=>list.some(x=>host===x||host.endsWith('.'+x));
export function socialProvider(value:string):SocialSource|undefined{
  if(!publicUrl(value))return;
  const host=new URL(value).hostname.toLowerCase();
  if(hostIn(host,['facebook.com','fb.com']))return 'FACEBOOK';
  if(hostIn(host,['tiktok.com']))return 'TIKTOK';
  if(hostIn(host,['instagram.com']))return 'INSTAGRAM';
  if(hostIn(host,['linkedin.com']))return 'LINKEDIN';
}
export function sourceUrl(value:string,source:ExpansionSource){
  if(!publicUrl(value)||isWebsiteVendorSocial(value))return '';
  try{const u=new URL(value),host=u.hostname.toLowerCase().replace(/^www\./,'');u.hash='';
    if(source==='SOCIAL'||SOCIAL_SOURCES.includes(source as SocialSource)){
      if(!hostIn(host,socialHosts)||/^\/(?:p|reel|reels|explore|stories|groups|posts|watch|login|accounts|share|search|help|privacy)(?:\/|$)/i.test(u.pathname))return '';
      const provider=socialProvider(value);if(!provider||(source!=='SOCIAL'&&provider!==source))return '';
      const path=u.pathname.replace(/\/+$/,'');
      let profile='';
      if(provider==='TIKTOK'){
        if(!/^\/@[a-z0-9_][a-z0-9_.]{1,23}$/i.test(path))return '';
        profile=path.toLowerCase();
      }else if(provider==='INSTAGRAM'){
        if(!/^\/[a-z0-9_.]{1,30}$/i.test(path)||/^\/(?:about|developer|developers|direct|legal|challenge)$/i.test(path))return '';
        profile=path.toLowerCase();
      }else if(provider==='LINKEDIN'){
        const match=path.match(/^\/company\/([a-z0-9_-]+)(?:\/about)?$/i);if(!match)return '';
        profile='/company/'+match[1].toLowerCase();
      }else{
        if(/^\/profile\.php$/i.test(path)){
          const id=u.searchParams.get('id');if(!id||!/^\d{5,30}$/.test(id))return '';
          return 'https://www.facebook.com/profile.php?id='+id;
        }
        const match=path.match(/^\/([a-z0-9._-]+)(?:\/(?:about|contact))?$/i)||path.match(/^\/(?:people|pages)\/[a-z0-9._-]+\/(\d{5,30})$/i);
        if(!match||/^(?:home\.php|index\.php|marketplace|events|gaming|business|ads|policies|settings|recover|logout|friends|notifications|messages|people|pages|developers|about)$/i.test(match[1]))return '';
        profile='/'+match[1].toLowerCase();
      }
      u.protocol='https:';u.hostname='www.'+(provider==='LINKEDIN'?'linkedin.com':provider==='FACEBOOK'?'facebook.com':provider==='TIKTOK'?'tiktok.com':'instagram.com');u.port='';u.pathname=profile+'/';u.search='';
    }else if(source==='DIRECTORY'&&!hostIn(host,directoryHosts)&&!host.endsWith('.gov')&&!host.endsWith('.edu'))return '';
    return u.toString();
  }catch{return ''}
}
export function websiteSocialProfiles(pages:Array<{url:string;html:string}>):WebsiteSocialProfile[]{
  const found=new Map<string,WebsiteSocialProfile>();
  const entities=(value:string)=>decode(value).replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>{
    const code=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);
    return code>0&&code<=0x10ffff?String.fromCodePoint(code):'';
  });
  for(const page of pages){
    if(!publicUrl(page.url))continue;
    const add=(raw:string,label:string)=>{
      if(found.size>=20||raw.length>2000)return;
      try{
        const originalUrl=new URL(entities(raw).trim(),page.url).toString(),source=socialProvider(originalUrl);
        if(!source)return;const url=sourceUrl(originalUrl,source);
        if(url&&!found.has(url))found.set(url,{source,url,pageUrl:page.url,originalUrl,label:clean(strip(label),160)});
      }catch{}
    };
    const visible=page.html.replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style|template)\b[\s\S]*?<\/\1>/gi,'');
    for(const match of visible.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)){
      const href=match[1].match(/(?:^|\s)href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i);
      if(href)add(href[1]??href[2]??href[3],match[2]);
    }
    for(const script of page.html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
      try{
        const walk=(node:unknown,depth=0)=>{
          if(!node||typeof node!=='object'||depth>12)return;
          if(Array.isArray(node)){node.slice(0,100).forEach(value=>walk(value,depth+1));return;}
          const item=node as Record<string,unknown>,types=Array.isArray(item['@type'])?item['@type']:[item['@type']];
          if(types.some(type=>typeof type==='string'&&/^(?:[a-z]*Organization|LocalBusiness|School|Preschool|HighSchool|ElementarySchool|SportingGoodsStore|SportsActivityLocation)$/i.test(type))){
            const links=Array.isArray(item.sameAs)?item.sameAs:[item.sameAs];
            for(const link of links.slice(0,30))if(typeof link==='string')add(link,'机构结构化资料 sameAs');
          }
          if(item['@graph'])walk(item['@graph'],depth+1);
        };
        walk(JSON.parse(script[1]));
      }catch{}
    }
  }
  return [...found.values()];
}
export function parseRssClues(rss:string,source:ExpansionSource,query:string,city:string,type:string):Clue[]{
  return indexClues(rssSearchHits(rss),source,query,city,type);
}
function indexClues(hits:PublicSearchHit[],source:ExpansionSource,query:string,city:string,type:string):Clue[]{
  const out:Clue[]=[],seen=new Set<string>();
  const business=COMMERCIAL_TYPES.has(type)?/basketball|hoops|sporting goods|sports equipment|physical education|ymca/i:/school|district|preschool|kindergarten|education|after.school|youth program/i;
  for(const hit of hits){
    const title=hit.title,url=sourceUrl(hit.url,source),snippet=hit.snippet,body=title+' '+snippet;
    if(!url||!title||seen.has(url)||!business.test(body)||/live scores?|betting|online games?|NBA news|basketball reference/i.test(body))continue;
    if(city&&!new RegExp('\\b'+city.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','i').test(body))continue;
    seen.add(url);out.push({key:url,title:clean(title,200),source,url,snippet:clean(`公开搜索摘要：${snippet} · 查询：${query}`),city,website:''});
  }return out;
}
async function json(url:string,init:RequestInit={},timeout=12000){
  const c=new AbortController(),t=setTimeout(()=>c.abort(),timeout);
  try{const r=await fetch(url,{...init,signal:c.signal,headers:{accept:'application/json','user-agent':'MING-EAGLE-Public-Discovery/14.0 (+https://mingeagle.com)',...init.headers}});if(!r.ok)throw new Error(`公开来源 HTTP ${r.status}`);const text=await r.text();if(text.length>1500000)throw new Error('公开来源返回内容过大。');const d=JSON.parse(text);if(d.error)throw new Error(clean(d.error.message||d.error,180));if(d.remark)throw new Error(clean(d.remark,180));return d;}catch(e){if(e instanceof Error&&e.name==='AbortError')throw new Error('公开数据源请求超时，请稍后重试。');throw e;}finally{clearTimeout(t)}
}
export async function indexedClues(input:SourceInput,source:'SOCIAL'|'DIRECTORY'|SocialSource,db?:D1Database){
  const cities=input.city?[input.city]:METROS[input.stateCode]||[STATE_NAMES[input.stateCode]];
  const city=cities[input.round%cities.length];
  const terms=TERMS[input.customerType]||[schoolTerms[input.customerType]||'school'];
  const term=terms[Math.floor(input.round/cities.length)%terms.length];
  const sites=source==='SOCIAL'?['facebook.com','instagram.com','linkedin.com/company']:source==='DIRECTORY'?['chamberofcommerce.com','yellowpages.com','bbb.org','manta.com','.gov','.edu']:[socialSites[source],socialSites[source],socialSites[source]];
  const queries:string[]=[];
  const results=await Promise.allSettled(sites.map(async (site,index)=>{
    const keyword=source==='SOCIAL'||source==='DIRECTORY'?term:terms[(Math.floor(input.round/cities.length)*3+index)%terms.length];
    const query=`site:${site} ${keyword} "${city}" ${STATE_NAMES[input.stateCode]}`;
    queries[index]=query;
    const rss=await fetchPublicText(`https://www.bing.com/search?q=${encodeURIComponent(query)}&format=rss&mkt=en-US&setlang=en-US`,6500);
    if(!/<rss\b|<channel\b/i.test(rss))throw new Error('公开搜索未返回可读取索引。');
    return parseRssClues(rss,source,query,city,input.customerType);
  }));
  const primary=results.flatMap(x=>x.status==='fulfilled'?x.value:[]);
  const alternate=primary.length?[]:await Promise.allSettled(queries.slice(0,2).map(async query=>indexClues(await alternateSearch(query,db),source,query,city,input.customerType)));
  if(results.every(x=>x.status==='rejected')&&!alternate.some(x=>x.status==='fulfilled'))throw new Error('公开网页索引本次不可用；主索引和备用索引均未能读取。');
  const failed=results.filter(x=>x.status==='rejected').length;
  const fallback=alternate.flatMap(x=>x.status==='fulfilled'?x.value:[]),clues=[...new Map([...primary,...fallback].map(clue=>[clue.key,clue])).values()].slice(0,Math.min(50,input.targetCount));
  const warning=alternate.filter(x=>x.status==='rejected').map(x=>x.reason instanceof Error?x.reason.message:String(x.reason)).slice(0,1).join('');
  return {clues,review:!clues.length&&alternate.length>0&&alternate.every(x=>x.status==='rejected'),note:`${city} · 主索引 ${sites.length-failed}/${sites.length} 次查询可读取，符合条件 ${primary.length} 条${alternate.length?`；备用索引符合条件 ${fallback.length} 条`:''}。${warning?warning.replace(/[。.]+$/,'')+'。':''}${clues.length?'账号身份、地区和业务需官网核验。':'本次没有有效线索；查询完成不代表找到客户。'}仅覆盖公开索引页面。`,partial:failed>0&&!fallback.length};
}
export const NCES_SCHOOL='https://nces.ed.gov/opengis/rest/services/K12_School_Locations/EDGE_GEOCODE_PUBLICSCH_2425/MapServer/0';
export const NCES_DISTRICT='https://services1.arcgis.com/Ua5sjt3LWTPigjyD/ArcGIS/rest/services/School_District_Office_Locations_Current/FeatureServer/0';
export const NCES_PRIVATE='https://nces.ed.gov/opengis/rest/services/K12_School_Locations/EDGE_GEOCODE_PRIVATESCH_2324/MapServer/0';
export function ncesQuery(input:SourceInput,source:'NCES'|'NCES_PRIVATE'|'NCES_DISTRICTS'='NCES'){
  const district=source==='NCES_DISTRICTS'||source==='NCES'&&input.customerType==='SCHOOL_DISTRICT',privateSchool=source==='NCES_PRIVATE';
  const base=district?NCES_DISTRICT:privateSchool?NCES_PRIVATE:NCES_SCHOOL;
  let where=`STATE='${input.stateCode}'`;
  if(input.city)where+=` AND UPPER(CITY)='${input.city.toUpperCase().replace(/'/g,"''")}'`;
  if(!district&&!privateSchool&&['ELEMENTARY_SCHOOL','MIDDLE_HIGH_SCHOOL'].includes(input.customerType)){const names=input.customerType==='ELEMENTARY_SCHOOL'?['%ELEMENTARY%','%PRIMARY%','% EL','% ELEM']:['%MIDDLE%','%HIGH%','% MS','% HS','% J H'];where+=' AND ('+names.map(n=>`UPPER(NAME) LIKE '${n}'`).join(' OR ')+')';}
  const limit=Math.min(50,input.targetCount),url=new URL(base+'/query');
  for(const [k,v]of Object.entries({where,outFields:'*',returnGeometry:'false',orderByFields:'OBJECTID',resultOffset:String(input.round*limit),resultRecordCount:String(limit),f:'json'}))url.searchParams.set(k,v);
  return {base,url:url.toString(),district,privateSchool};
}
export async function ncesClues(input:SourceInput,source:'NCES'|'NCES_PRIVATE'|'NCES_DISTRICTS'='NCES'){
  const {base,url,district,privateSchool}=ncesQuery(input,source),data=await json(url);
  if(!Array.isArray(data.features))throw new Error('NCES 未返回学校名录。');
  const clues:Clue[]=[];
  for(const feature of data.features){const a=feature.attributes||{},title=clean(a.NAME,200),city=clean(a.CITY,80),id=clean(district?a.LEAID:privateSchool?a.PPIN:a.NCESSCH,20);
    if(!title||!id||clean(a.STATE).toUpperCase()!==input.stateCode||(input.city&&city.toLowerCase()!==input.city.toLowerCase()))continue;
    const sourceUrl=new URL(base+'/query');for(const [k,v]of Object.entries({where:`${district?'LEAID':privateSchool?'PPIN':'NCESSCH'}='${id.replace(/'/g,"''")}'`,outFields:'*',returnGeometry:'false',f:'pjson'}))sourceUrl.searchParams.set(k,v);
    const customerType=district?'SCHOOL_DISTRICT':privateSchool?'PRIVATE_CHARTER_SCHOOL':/elementary|primary|\b(?:el|elem)$/i.test(title)?'ELEMENTARY_SCHOOL':/middle|high|secondary|\b(?:ms|hs|jh)$/i.test(title)?'MIDDLE_HIGH_SCHOOL':'PUBLIC_SCHOOL';
    clues.push({key:`nces:${district?'district':privateSchool?'private':'school'}:${id}`,title,source,customerType,url:sourceUrl.toString(),city,address:clean([a.STREET,city,input.stateCode,a.ZIP].filter(Boolean).join(', '),500),website:'',snippet:clean(`美国 NCES 官方${district?'学区':privateSchool?'私立学校':'公立学校'}名录 · 编号 ${id} · 学年 ${a.SCHOOLYEAR||(privateSchool?'2023–24':'2024–25')} · 地址 ${a.STREET||''}, ${city}, ${input.stateCode} ${a.ZIP||''}。需补充官网、核实当前运营及采购联系信息。`)});
  }return {clues,note:`${input.city||STATE_NAMES[input.stateCode]} · NCES 官方${district?'学区':privateSchool?'私立学校':'公立学校'}名录第 ${input.round+1} 页，返回 ${clues.length} 条。学校和学区按真实类型保存；此来源独立于商业客户类型。`,partial:false};
}
export function osmQuery(input:SourceInput,bounds?:[number,number,number,number]){
  if(!input.city)throw new Error('OSM 地图搜索请填写城市，避免全州大范围查询。');
  if(bounds&&(!bounds.every(Number.isFinite)||bounds[0]>=bounds[2]||bounds[1]>=bounds[3]||Math.abs(bounds[0])>90||Math.abs(bounds[2])>90||Math.abs(bounds[1])>180||Math.abs(bounds[3])>180))throw new Error('城市地图边界无效。');
  const scope=`${bounds?'('+bounds.join(',')+')':'(area.state)["addr:city"~'+JSON.stringify('^'+input.city.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$')+',i]'}["name"]`;
  const basketballOnly=['BASKETBALL_TRAINING','BASKETBALL_GYM','YOUTH_CLUB','INDEPENDENT_COACH'].includes(input.customerType);
  const filters=['SPORTS_STORE','SPORTS_DISTRIBUTOR','EDUCATION_SUPPLIER'].includes(input.customerType)?['["shop"="sports"]']:COMMERCIAL_TYPES.has(input.customerType)?[basketballOnly?'["leisure"="sports_centre"]["sport"~"basketball"]':'["leisure"="sports_centre"]','["club"="sport"]["sport"~"basketball"]','["leisure"="fitness_centre"]["sport"~"basketball"]']:['["amenity"="school"]','["amenity"="kindergarten"]'];
  return `[out:json][timeout:8][maxsize:16777216];${bounds?'':`area["ISO3166-2"="US-${input.stateCode}"]->.state;`}(${filters.map(f=>`nwr${scope}${f};`).join('')});out tags ${Math.min(50,input.targetCount)};`;
}
export async function osmClues(input:SourceInput,geoapifyKey?:string,db?:D1Database){
  const originalInput=input;
  input={...input,city:sourceCity(input).city};
  let bounds:[number,number,number,number]|undefined,boundsNote='';
  if(geoapifyKey){try{
    const url=new URL('https://api.geoapify.com/v1/geocode/search');for(const [k,v]of Object.entries({text:`${input.city} ${STATE_NAMES[input.stateCode]}`,type:'city',format:'json',filter:'countrycode:us',limit:'1',apiKey:geoapifyKey}))url.searchParams.set(k,v);
    const center=await json(url.toString(),{},6000),place=center.results?.[0];
    if(!place||String(place.state_code).toUpperCase()!==input.stateCode||String(place.country_code).toLowerCase()!=='us')throw new Error('地图城市与所选美国州不匹配。');
    const box=place.bbox;if(box)bounds=[Number(box.lat1),Number(box.lon1),Number(box.lat2),Number(box.lon2)];
    if(!bounds||!bounds.every(Number.isFinite))throw new Error('未能确认城市地图边界，请稍后重试。');
  }catch{bounds=undefined;boundsNote='城市边界定位暂不可用，本批仅检索明确标注该城市的地图记录。';}}
  const body=new URLSearchParams({data:osmQuery(input,bounds)}).toString();let data,error:unknown;
  for(const endpoint of ['https://overpass-api.de/api/interpreter','https://overpass.private.coffee/api/interpreter']){
    try{data=await json(endpoint,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body},8500);break;}catch(e){error=e;}
  }
  if(!data){
    if(!geoapifyKey)throw error;
    const fallback=await cachedGeoapifyClues(originalInput,geoapifyKey,db),clues=fallback.clues.filter(c=>c.key.startsWith('osm:')).map(c=>({...c,source:'OSM',snippet:'通过 Geoapify 读取 OSM 公开机构资料；'+c.snippet}));
    if(fallback.clues.length&&!clues.length)throw new Error('OSM 公共接口暂不可用，备用地图数据未提供可核验的 OSM 原始记录。请使用 Geoapify 地图机构来源。');
    return {clues,partial:false,note:`${input.city} · OSM 公共接口本批未完成，已通过 Geoapify 备用接口读取 ${clues.length} 条 OSM 机构资料；保留原始 OSM 页面，业务仍需官网核验。`};
  }
  if(!Array.isArray(data.elements))throw new Error('OSM 未返回地点数据。');
  const clues:Clue[]=[];
  for(const e of data.elements){const t=e.tags||{},title=clean(t.name,200),explicitCity=clean(t['addr:city'],80),city=explicitCity||input.city;
    if(!title||(explicitCity&&city.toLowerCase()!==input.city.toLowerCase())||(!explicitCity&&!bounds)||!['node','way','relation'].includes(e.type)||!Number.isSafeInteger(e.id)||/drinking fountain|basketball hoop|basketball court$/i.test(title)||!mapBuyerMatch(title,input.customerType,String(t.sport||'')))continue;
    let website=clean(t.website||t['contact:website'],1000).split(';')[0];if(website&&!/^https?:\/\//i.test(website))website='https://'+website;if(!publicUrl(website))website='';
    const customerType=t.amenity==='kindergarten'?'PRESCHOOL_KINDERGARTEN':t.amenity==='school'?'PUBLIC_SCHOOL':mapBuyerType(title,input.customerType);
    clues.push({key:`osm:${e.type}:${e.id}`,title,source:'OSM',customerType,url:`https://www.openstreetmap.org/${e.type}/${e.id}`,city,website,address:clean([t['addr:housenumber'],t['addr:street'],city,input.stateCode,t['addr:postcode']].filter(Boolean).join(' '),500),snippet:clean(`OpenStreetMap 地点资料 · ${t['addr:street']||''} ${t['addr:housenumber']||''}, ${city} · ${explicitCity?'地图明确标注城市':'位于搜索城市边界；城市归属待核实'} · ${t.shop||t.leisure||t.club||t.amenity||t.office||''}。地图分类仅提供机构线索，业务及联系信息需官网核验。`)});
  }return {clues,note:`${input.city} · OSM 地图返回 ${clues.length} 条具名机构线索；${boundsNote}未填城市时轮换所选州的主要城市。普通球场、篮球架和饮水点不入库。`,partial:false};
}
export async function geoapifyClues(input:SourceInput,apiKey?:string){
  if(!apiKey)throw new Error('Geoapify API Key 尚未配置；仍可使用独立的 OSM、学校及目录来源。');
  const {city,page}=sourceCity(input),center=new URL('https://api.geoapify.com/v1/geocode/search');
  for(const [k,v]of Object.entries({text:`${city} ${STATE_NAMES[input.stateCode]}`,type:'city',format:'json',filter:'countrycode:us',limit:'1',apiKey}))center.searchParams.set(k,v);
  const location=(await json(center.toString(),{},6000)).results?.[0];
  if(!location?.place_id||String(location.state_code).toUpperCase()!==input.stateCode||location.country_code!=='us')throw new Error('未能确认所选州的城市地图位置。');
  const url=new URL('https://api.geoapify.com/v2/places'),limit=Math.min(50,input.targetCount);
  const categories=['SPORTS_STORE','SPORTS_DISTRIBUTOR','EDUCATION_SUPPLIER'].includes(input.customerType)?'commercial.outdoor_and_sport':COMMERCIAL_TYPES.has(input.customerType)?'sport.sports_centre,sport.sports_hall':'education.school,education.kindergarten';
  for(const [k,v]of Object.entries({categories,filter:`place:${location.place_id}`,limit:String(limit),offset:String(page*limit),lang:'en',apiKey}))url.searchParams.set(k,v);
  const data=await json(url.toString(),{},8500);
  if(!Array.isArray(data.features))throw new Error('Geoapify 未返回地图机构数据。');
  const clues:Clue[]=[];
  for(const f of data.features){const p=f.properties||{},raw=p.datasource?.raw||{},title=clean(p.name,200),id=clean(p.place_id,400),explicitCity=clean(p.city,80);
    if(!title||!id||p.country_code!=='us'||(p.state_code&&String(p.state_code).toUpperCase()!==input.stateCode)||(explicitCity&&explicitCity.toLowerCase()!==city.toLowerCase())||/drinking fountain|basketball hoop|basketball court$/i.test(title)||!mapBuyerMatch(title,input.customerType,(p.categories||[]).join(' ')+' '+String(raw.sport||'')))continue;
    let website=clean(p.website||p.contact?.website||raw.website||raw['contact:website'],1000).split(';')[0];if(website&&!/^https?:\/\//i.test(website))website='https://'+website;if(!publicUrl(website))website='';
    const rawType=String(raw.osm_type||p.datasource?.osm_type||'').toLowerCase(),osmType=({n:'node',w:'way',r:'relation'} as Record<string,string>)[rawType]||rawType,osmId=String(raw.osm_id||p.datasource?.osm_id||'');
    const osm=['node','way','relation'].includes(osmType)&&/^\d+$/.test(osmId),sourceUrl=osm?`https://www.openstreetmap.org/${osmType}/${osmId}`:`https://www.openstreetmap.org/search?query=${encodeURIComponent(title+' '+city+' '+input.stateCode)}`;
    const customerType=categories.startsWith('education')?(p.categories?.includes('education.kindergarten')?'PRESCHOOL_KINDERGARTEN':'PUBLIC_SCHOOL'):mapBuyerType(title,input.customerType);
    clues.push({key:osm?`osm:${osmType}:${osmId}`:`geoapify:${id}`,aliasKeys:osm?[`geoapify:${id}`]:[],source:'GEOAPIFY',title,customerType,url:sourceUrl,website,city:explicitCity||city,address:clean(p.formatted,500),snippet:clean(`Geoapify 公开地点目录 · ${p.formatted||title+' '+city} · 分类 ${(p.categories||[]).join(', ')} · ${explicitCity?'来源标注城市':'城市搜索范围，具体归属待核实'}。地图分类不等于采购意向，官网和业务需核验。`)});
  }
  const unique=[...new Map(clues.map(c=>[c.title.toLowerCase()+'|'+c.snippet.split(' · 分类 ')[0].toLowerCase(),c])).values()];
  return {clues:unique,note:`${city} · 地图机构第 ${page+1} 页，返回 ${unique.length} 条；已排除明显无关的专项运动地点，并合并同名同地址记录。业务和采购意向需官网核验。`,partial:false};
}
async function cachedGeoapifyClues(input:SourceInput,apiKey?:string,db?:D1Database){
  if(!db||!apiKey)return geoapifyClues(input,apiKey);
  const {city,page}=sourceCity(input),key=['geoapify-v18',input.stateCode,input.customerType,city.toLowerCase(),page,Math.min(50,input.targetCount)].join('|');
  const cached=await db.prepare(`SELECT payload FROM discovery_public_source_cache WHERE cache_key=? AND expires_at>CURRENT_TIMESTAMP`).bind(key).first<{payload:string}>();
  if(cached){try{const data=JSON.parse(cached.payload) as Awaited<ReturnType<typeof geoapifyClues>>;return {...data,note:data.note+' · 使用 5 分钟内的公开地图缓存。'};}catch{}}
  const data=await geoapifyClues(input,apiKey);
  await db.prepare(`INSERT INTO discovery_public_source_cache(cache_key,payload,expires_at) VALUES(?,?,datetime('now','+5 minutes')) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,expires_at=excluded.expires_at`).bind(key,JSON.stringify(data)).run();return data;
}
export async function collectSource(input:SourceInput,source:ExpansionSource,geoapifyKey?:string,db?:D1Database){
  if(source==='NCES'||source==='NCES_PRIVATE'||source==='NCES_DISTRICTS')return ncesClues(input,source);
  if(source==='OSM')return osmClues(input,geoapifyKey,db);
  if(source==='GEOAPIFY')return cachedGeoapifyClues(input,geoapifyKey,db);
  if(source==='WEBSITE_SOCIAL')throw new Error('官网批量发现需要候选库上下文。');
  return indexedClues(input,source,db);
}
export async function ensureClues(db:D1Database){
  await db.prepare(`CREATE TABLE IF NOT EXISTS discovery_clues (id TEXT PRIMARY KEY,source_key TEXT NOT NULL UNIQUE,title TEXT NOT NULL,source_provider TEXT NOT NULL,source_url TEXT NOT NULL,source_evidence TEXT,customer_type TEXT NOT NULL,state_region TEXT NOT NULL,city TEXT,website TEXT,status TEXT NOT NULL DEFAULT 'PENDING',candidate_id TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
  const columns=await db.prepare(`PRAGMA table_info(discovery_clues)`).all<{name:string}>();
  if(!columns.results.some(c=>c.name==='address')){try{await db.prepare(`ALTER TABLE discovery_clues ADD COLUMN address TEXT`).run();}catch(e){const now=await db.prepare(`PRAGMA table_info(discovery_clues)`).all<{name:string}>();if(!now.results.some(c=>c.name==='address'))throw e;}}
  if(!columns.results.some(c=>c.name==='raw_json')){try{await db.prepare(`ALTER TABLE discovery_clues ADD COLUMN raw_json TEXT`).run();}catch(e){const now=await db.prepare(`PRAGMA table_info(discovery_clues)`).all<{name:string}>();if(!now.results.some(c=>c.name==='raw_json'))throw e;}}
  await db.prepare(`CREATE TABLE IF NOT EXISTS discovery_run_clues(run_id TEXT NOT NULL,clue_id TEXT NOT NULL,PRIMARY KEY(run_id,clue_id))`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_discovery_clues_status ON discovery_clues(status,updated_at DESC)`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS discovery_clue_sources (clue_id TEXT NOT NULL,source_provider TEXT NOT NULL,source_url TEXT NOT NULL,evidence TEXT,last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(clue_id,source_provider))`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_discovery_clue_sources_provider ON discovery_clue_sources(source_provider,clue_id)`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS discovery_public_source_cache (cache_key TEXT PRIMARY KEY,payload TEXT NOT NULL,expires_at TEXT NOT NULL)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_discovery_public_cache_expiry ON discovery_public_source_cache(expires_at)`).run();
  await db.prepare(`DELETE FROM discovery_public_source_cache WHERE expires_at<=CURRENT_TIMESTAMP`).run();
}
