import { publicPersonName } from '../../../lib/public-contacts';
import { publicPhone, publicPhones, organizationName } from '../../../lib/public-contacts';
import { fetchPublicText, publicUrl } from '../../../lib/public-web';
import { websiteSocialProfiles, type WebsiteSocialProfile } from '../../../lib/discovery-sources';
import { parseSearch, queryPlan, COMMERCIAL_TYPES, METROS as ALL_METROS, STATE_NAMES as ALL_STATE_NAMES } from '../../../shared/discovery';
import { ensureRuns, recordResult } from '../../../lib/discovery';
interface Env { MINGEAGLE_DB: D1Database }

type Input = { stateCode?: string; customerType?: string; targetCount?: number | string; city?: string; round?: number; runId?: string };
type SearchHit = { title:string; url:string; snippet:string; query:string; city:string };
type EntityResolution = { name:string; score:number; source:string; candidates:Array<{name:string;score:number;source:string}> };
type VerifiedHit = SearchHit & {
  fitScore:number; cues:string[]; orgName:string; entityScore:number; entitySource:string;
  email:string; phone:string; whatsapp:string; instagram:string; facebook:string; linkedin:string;
  contactName:string; contactTitle:string; contactUrl:string; sourceUrls:string[];
  socialProfiles?:WebsiteSocialProfile[];
};

const clean=(v:unknown,max=1000)=>typeof v==='string'?v.trim().replace(/\s+/g,' ').slice(0,max):'';
const allowedState=/^[A-Z]{2}$/;
const allowedTypes=COMMERCIAL_TYPES;

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

const BLOCKED_DOMAINS=[
  'bing.com','google.com','duckduckgo.com','yahoo.com','yelp.com','facebook.com','instagram.com','linkedin.com','youtube.com','wikipedia.org','britannica.com','wikihow.com','dictionary.com','merriam-webster.com','reddit.com','x.com','twitter.com','tiktok.com','pinterest.com','yellowpages.com','mapquest.com','tripadvisor.com','indeed.com','ziprecruiter.com','chamberofcommerce.com','manta.com','bbb.org','eventbrite.com','foursquare.com',
  'nba.com','wnba.com','espn.com','cbssports.com','foxsports.com','basketball-reference.com','maxpreps.com','hudl.com','flashscore.com','livescore.com','sofascore.com','scores24.live','365scores.com','sports-reference.com','stathead.com','teamrankings.com','realgm.com','rotowire.com','bleacherreport.com','sports.yahoo.com','si.com','usatoday.com','theathletic.com','sportskeeda.com',
  'crazygames.com','poki.com','games.com','miniclip.com','formula1.com'
];
const HARD_NEGATIVE=/\b(formula\s*1|motorsport|racing|live\s*score|livescore|box\s*score|betting|odds|race calendar|full race|video game|online game|play game|basketball reference|fantasy basketball|sportsbook|news headlines?|breaking news|player stats?|team stats?|standings|scoreboard)\b/i;
const PUBLISHER_NEGATIVE=/\b(latest news|breaking news|articles?|editorial|journalist|subscribe to our newsletter|scores and fixtures|box scores|standings|statistics|player database|game recap|match preview|odds|betting picks?)\b/i;
const COMMERCE_OR_SERVICE=/\b(register|registration|enroll|enrollment|book now|schedule a session|private lesson|training session|membership|pricing|tuition|tryouts?|programs?|services?|shop|store|add to cart|buy now|contact us|request info|facility rental|court rental)\b/i;
const GENERIC_NAME=/^(home|basketball|adult basketball|youth basketball|basketball training|basketball academy|basketball program|basketball programs|training|academy|program|programs|sports|athletics|contact|about|team|coaches|coach|schedule|calendar|news|scores|standings|shop|store)$/i;
const BAD_PERSON_WORDS=new Set(['at','the','new','our','your','basketball','academy','training','program','programs','team','teams','contact','about','director','coach','manager','owner','founder','staff','membership','sports','adult','youth','club']);
const ENTITY_TYPES=new Set(['Organization','LocalBusiness','SportsOrganization','SportsActivityLocation','ExerciseGym','HealthClub','Store','SportingGoodsStore','EducationalOrganization','Corporation']);

const STRONG_PAIR:Record<string,RegExp>={
  BASKETBALL_TRAINING:/(?:basketball|hoops).{0,90}(?:academy|training|skills?|coaching|player development|private lessons?|development program)|(?:academy|training|skills?|coaching|player development|private lessons?|development program).{0,90}(?:basketball|hoops)/i,
  BASKETBALL_GYM:/(?:basketball|hoops).{0,90}(?:gym|facility|sports? cent(?:er|re)|court rental|open gym|indoor court|training center)|(?:gym|facility|sports? cent(?:er|re)|court rental|open gym|indoor court|training center).{0,90}(?:basketball|hoops)/i,
  YOUTH_CLUB:/(?:basketball|hoops).{0,90}(?:youth|aau|club|tryouts?|team program|league)|(?:youth|aau|club|tryouts?|team program|league).{0,90}(?:basketball|hoops)/i,
  SPORTS_STORE:/(?:basketball|hoops).{0,90}(?:sporting goods|store|shop|equipment|retail|gear|balls?|shoes?)|(?:sporting goods|store|shop|equipment|retail|gear).{0,90}(?:basketball|hoops)/i,
  INDEPENDENT_COACH:/(?:basketball|hoops).{0,90}(?:coach|trainer|private lesson|one.on.one)|(?:coach|trainer|private lesson|one.on.one).{0,90}(?:basketball|hoops)/i,
  MULTISPORT_ACADEMY:/(?:basketball|hoops).{0,100}(?:academy|sports training|sports program|sports classes|development)|(?:academy|sports training|sports program|sports classes|development).{0,100}(?:basketball|hoops)/i,
  RECREATION_CENTER:/(?:basketball|hoops).{0,100}(?:recreation|community|ymca|youth program|sports center)|(?:recreation|community|ymca|youth program|sports center).{0,100}(?:basketball|hoops)/i,
  SPORTS_DISTRIBUTOR:/(?:basketball|physical education|sporting goods).{0,100}(?:distributor|wholesale|supplier|bulk|school equipment)|(?:distributor|wholesale|supplier|bulk|school equipment).{0,100}(?:basketball|physical education|sporting goods)/i,
  SUMMER_CAMP:/(?:basketball|hoops).{0,90}(?:camp|summer|day camp)|(?:camp|summer|day camp).{0,90}(?:basketball|hoops)/i
};

export async function ensureTables(db:D1Database){await ensureRuns(db);
  await db.prepare(`CREATE TABLE IF NOT EXISTS discovery_jobs (id TEXT PRIMARY KEY,country TEXT NOT NULL DEFAULT 'US',state_region TEXT NOT NULL,customer_type TEXT NOT NULL,target_count INTEGER NOT NULL DEFAULT 20,source_provider TEXT NOT NULL DEFAULT 'OPENSTREETMAP',status TEXT NOT NULL DEFAULT 'RUNNING',result_count INTEGER NOT NULL DEFAULT 0,error TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,completed_at TEXT)`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS discovery_candidates (id TEXT PRIMARY KEY,source_key TEXT NOT NULL UNIQUE,source_provider TEXT NOT NULL DEFAULT 'OPENSTREETMAP',name TEXT NOT NULL,customer_type TEXT NOT NULL,country TEXT NOT NULL DEFAULT 'US',state_region TEXT,city TEXT,address TEXT,website TEXT,email TEXT,phone TEXT,whatsapp TEXT,instagram_url TEXT,facebook_url TEXT,latitude REAL,longitude REAL,lead_score INTEGER NOT NULL DEFAULT 0,grade TEXT NOT NULL DEFAULT 'C',status TEXT NOT NULL DEFAULT 'NEW',source_url TEXT NOT NULL,source_evidence TEXT,raw_json TEXT,crm_lead_id TEXT,discovered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
  const info=await db.prepare(`PRAGMA table_info(discovery_candidates)`).all<{name:string}>();
  const names=new Set(info.results.map(r=>r.name));
  const columns:Array<[string,string]>=[['linkedin_url','TEXT'],['contact_person_name','TEXT'],['contact_person_title','TEXT'],['website_contact_url','TEXT'],['enrichment_status',`TEXT NOT NULL DEFAULT 'NOT_STARTED'`],['enrichment_source_urls','TEXT'],['enrichment_error','TEXT'],['enriched_at','TEXT']];
  for(const [name,definition] of columns){if(!names.has(name)){try{await db.prepare(`ALTER TABLE discovery_candidates ADD COLUMN ${name} ${definition}`).run()}catch{}}}
}

function decode(v:string){return v.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&apos;|&#39;|&#x27;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)))}
function strip(v:string){return decode(v.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<svg[\s\S]*?<\/svg>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim())}
function xml(block:string,tag:string){const m=block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`,'i'));return m?strip(m[1]):''}
function domainOf(v:string){try{return new URL(v).hostname.toLowerCase().replace(/^www\./,'')}catch{return ''}}
export function allowedWebsite(v:string){if(!publicUrl(v))return false;const h=domainOf(v);return !BLOCKED_DOMAINS.some(d=>h===d||h.endsWith(`.${d}`))}
function grade(score:number){return score>=80?'A':score>=60?'B':'C'}
function normalizeName(v:string){return organizationName(clean(v,120)).replace(/^(welcome to|official website of)\s+/i,'').replace(/\s+(official site|official website|home page)$/i,'').replace(/[|–—:-]+$/,'').trim()}
function genericName(value:string){const v=normalizeName(value);if(!v||v.length<3||v.length>100)return true;if(GENERIC_NAME.test(v)||HARD_NEGATIVE.test(v)||/^\d+$/.test(v))return true;const words=v.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);if(words.length===1&&['basketball','training','academy','sports','athletics','hoops','program','club'].includes(words[0]))return true;return false}
function humanizeDomain(domain:string){return domain.split('.')[0].replace(/[-_]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase()).slice(0,100)}

const fetchText=fetchPublicText;
function metaContent(html:string,key:string){const escaped=key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const patterns=[new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,'i'),new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,'i')];for(const p of patterns){const m=html.match(p);if(m)return strip(m[1])}return ''}
function titleText(html:string){const m=html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);return m?strip(m[1]):''}

function addEntityCandidate(out:Array<{name:string;score:number;source:string}>,name:unknown,score:number,source:string){const n=normalizeName(typeof name==='string'?name:'');if(!n||genericName(n))return;const existing=out.find(x=>x.name.toLowerCase()===n.toLowerCase());if(existing){if(score>existing.score){existing.score=score;existing.source=source}return}out.push({name:n,score,source})}
function walkJsonLd(value:unknown,out:Array<{name:string;score:number;source:string}>){if(Array.isArray(value)){for(const x of value)walkJsonLd(x,out);return}if(!value||typeof value!=='object')return;const obj=value as Record<string,unknown>;const rawType=obj['@type'];const types=Array.isArray(rawType)?rawType.map(String):[String(rawType||'')];if(types.some(t=>ENTITY_TYPES.has(t))){addEntityCandidate(out,obj.name,55,'json-ld');const legal=obj.legalName;addEntityCandidate(out,legal,58,'json-ld-legal')}
  for(const [k,v] of Object.entries(obj)){if(k==='publisher'||k==='provider'||k==='parentOrganization'||k==='brand'||k==='department'||k==='@graph')walkJsonLd(v,out)}
}
function jsonLdCandidates(html:string){const out:Array<{name:string;score:number;source:string}>=[];const re=/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;let m:RegExpExecArray|null;while((m=re.exec(html))){const raw=decode(m[1]).trim().replace(/^<!--|-->$/g,'');try{walkJsonLd(JSON.parse(raw),out)}catch{}}return out}
function copyrightCandidates(text:string){const out:string[]=[];const re=/(?:©|copyright(?:\s*©)?|&copy;)\s*(?:19|20)?\d{0,4}\s*(?:by\s+)?([A-Z][A-Za-z0-9&'’.\- ]{2,80}?)(?=\s+(?:all rights reserved|privacy|terms|$)|[|•·])/gi;let m:RegExpExecArray|null;while((m=re.exec(text))){out.push(clean(m[1],100))}return out}
function logoAltCandidates(html:string){const out:string[]=[];for(const m of html.matchAll(/<img[^>]+(?:class|id|src)=["'][^"']*logo[^"']*["'][^>]+alt=["']([^"']+)["'][^>]*>/gi))out.push(strip(m[1]));for(const m of html.matchAll(/<img[^>]+alt=["']([^"']+)["'][^>]+(?:class|id|src)=["'][^"']*logo[^"']*["'][^>]*>/gi))out.push(strip(m[1]));return out}
export function resolveEntity(html:string,searchTitle:string,url:string):EntityResolution{
  const domain=domainOf(url);const out:Array<{name:string;score:number;source:string}>=[];
  for(const item of jsonLdCandidates(html))addEntityCandidate(out,item.name,item.score,item.source);
  for(const key of ['og:site_name','application-name','apple-mobile-web-app-title'])addEntityCandidate(out,metaContent(html,key),45,`meta:${key}`);
  for(const c of copyrightCandidates(strip(html).slice(-18000)))addEntityCandidate(out,c,38,'copyright');
  for(const c of logoAltCandidates(html))addEntityCandidate(out,c,32,'logo-alt');
  for(const title of [titleText(html),searchTitle].filter(Boolean)){
    const parts=title.split(/\s+[|–—:]\s+|\s+-\s+/).map(x=>clean(x,120)).filter(Boolean);
    for(const p of parts)addEntityCandidate(out,p,24,'title');
  }
  addEntityCandidate(out,humanizeDomain(domain),18,'domain');
  const domainStem=domain.split('.')[0].replace(/[^a-z0-9]/gi,'').toLowerCase();
  for(const item of out){const compact=item.name.replace(/[^a-z0-9]/gi,'').toLowerCase();if(domainStem.length>=5&&compact.includes(domainStem))item.score+=8;if(/\b(academy|training|sports|hoops|basketball|athletics|fitness|club|center|centre|gym|store|shop)\b/i.test(item.name))item.score+=3}
  out.sort((a,b)=>b.score-a.score||a.name.length-b.name.length);
  const best=out[0];return {name:best?.name||'',score:best?.score||0,source:best?.source||'',candidates:out.slice(0,6)};
}

function validEmail(v:string){const e=v.toLowerCase().replace(/^mailto:/,'').split('?')[0].trim();if(!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(e))return '';if(/\.(png|jpg|jpeg|gif|webp|svg|css|js)$/i.test(e)||/^(example|test|name)@/i.test(e))return '';return e.slice(0,320)}
function emailsOf(html:string){const d=decode(html);const set=new Set<string>();for(const m of d.matchAll(/mailto:([^"'<>\s?]+)/gi)){const e=validEmail(m[1]);if(e)set.add(e)}for(const raw of d.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[]){const e=validEmail(raw);if(e)set.add(e)}return [...set]}
const phonesOf=publicPhones;

function hrefs(html:string,base:string){const out:string[]=[];const re=/href\s*=\s*["']([^"']+)["']/gi;let m:RegExpExecArray|null;while((m=re.exec(html))){const raw=decode(m[1]).trim();if(!raw||raw.startsWith('#')||/^(javascript|data):/i.test(raw))continue;try{out.push(new URL(raw,base).toString())}catch{}}return [...new Set(out)]}
function firstSocial(links:string[],domains:string[]){return links.find(link=>{try{const h=new URL(link).hostname.toLowerCase();return domains.some(d=>h===d||h.endsWith(`.${d}`))}catch{return false}})||''}
function whatsappOf(links:string[]){const link=firstSocial(links,['wa.me','whatsapp.com']);if(!link)return '';try{const u=new URL(link);return u.hostname.toLowerCase()==='wa.me'?u.pathname.replace(/\D/g,'').slice(0,20)||link:u.searchParams.get('phone')?.replace(/\D/g,'').slice(0,20)||link}catch{return link}}
function chooseEmail(emails:string[],host:string){const domain=host.toLowerCase().replace(/^www\./,'');return emails.find(e=>e.endsWith(`@${domain}`))||emails.find(e=>/^(sales|info|contact|hello|office|admin|coach|training|orders|director)@/i.test(e))||emails[0]||''}
const validPersonName=publicPersonName;
function extractPerson(text:string){const roles='Owner|Founder|Co-Founder|Executive Director|Program Director|Basketball Director|Training Director|Head Coach|General Manager|Operations Director|Purchasing Manager|Procurement Manager|Athletic Director|Director|Coach|Manager|President|CEO';const name="([A-Z][A-Za-z'’-]{1,30}(?:\\s+[A-Z][A-Za-z'’-]{1,30}){1,2})";const patterns=[new RegExp(`${name}\\s*(?:[-–—|,:]|\\bis\\s+(?:the\\s+)?)\\s*(${roles})`),new RegExp(`(${roles})\\s*(?:[-–—|,:])?\\s*${name}`)];for(let i=0;i<patterns.length;i++){for(const m of text.matchAll(new RegExp(patterns[i].source,'g'))){const person=i===0?m[1]:m[2];const title=i===0?m[2]:m[1];const candidates=[person,...(person.split(/\s+/).length===3?[person.split(/\s+/).slice(1).join(' ')]:[])];for(const candidate of candidates)if(validPersonName(candidate))return {name:clean(candidate,120),title:clean(title,120)}}}return {name:'',title:''}}

export async function bing(query:string,city:string){const q=`${query} -Formula1 -racing -livescore -stats -standings -betting -games -news`;const data=await fetchText(`https://www.bing.com/search?q=${encodeURIComponent(q)}&format=rss&mkt=en-US&setlang=en-US`,7000);const items=data.match(/<item\b[\s\S]*?<\/item>/gi)||[];const out:SearchHit[]=[];const seen=new Set<string>();for(const item of items){const title=xml(item,'title'),url=decode(xml(item,'link')),snippet=xml(item,'description');const d=domainOf(url);if(!title||!url||!d||seen.has(d)||!allowedWebsite(url))continue;if(HARD_NEGATIVE.test(`${title} ${snippet}`))continue;seen.add(d);out.push({title,url,snippet,query,city});if(out.length>=12)break}return out}
function sameOriginPreferred(html:string,baseUrl:string){const out:string[]=[];let base:URL;try{base=new URL(baseUrl)}catch{return out}for(const link of hrefs(html,baseUrl)){try{const u=new URL(link);if(u.origin!==base.origin)continue;if(!/(about|contact|program|training|coach|team|staff|basketball|skills|clinic|camp|facility|court|shop|store|membership|lesson|leadership|director|our-story)/i.test(u.pathname))continue;u.hash='';if(u.toString()===new URL(baseUrl).toString()||out.includes(u.toString()))continue;out.push(u.toString());if(out.length>=6)break}catch{}}return [...new Set(out)]}
function isPublisherLike(body:string){const neg=(body.match(new RegExp(PUBLISHER_NEGATIVE.source,'gi'))||[]).length;const positive=(body.match(new RegExp(COMMERCE_OR_SERVICE.source,'gi'))||[]).length;return neg>=3&&positive===0}
function scoreBusiness(hit:SearchHit,body:string,type:string,stateCode:string,entity:EntityResolution){
  const searchText=`${hit.title} ${hit.snippet}`;const all=`${searchText} ${body}`;const cues:string[]=[];
  if(HARD_NEGATIVE.test(searchText)||!entity.name||genericName(entity.name)||entity.score<24)return {score:0,cues:['invalid-entity']};
  if(isPublisherLike(body))return {score:0,cues:['publisher-or-data-site']};
  const pair=STRONG_PAIR[type];if(!pair||!pair.test(body))return {score:0,cues:['no-strong-business-pair']};
  cues.push('strong-business-pair','entity-resolved');let score=62+Math.min(15,Math.round(entity.score/5));
  if(pair.test(searchText)){score+=6;cues.push('pair-in-search')}
  if(COMMERCE_OR_SERVICE.test(body)){score+=8;cues.push('commercial-or-service-language')}
  if(/contact|about|team|coach|staff|director|owner|founder|leadership/i.test(body)){score+=4;cues.push('organization-language')}
  const locations=(hit.city?[hit.city]:[ALL_STATE_NAMES[stateCode],stateCode]).filter(Boolean);const local=locations.some(x=>new RegExp('\\b'+x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','i').test(body));if(local){score+=6;cues.push('local-match')}else if(type==='SPORTS_DISTRIBUTOR'&&/nationwide|all 50 states|ship.*united states/i.test(body)){cues.push('national-supplier')}else{return {score:0,cues:['location-unconfirmed']}}
  if(['SPORTS_STORE','SPORTS_DISTRIBUTOR'].includes(type)&&!/shop|store|retail|add to cart|buy now|product|inventory|sporting goods/i.test(body))return {score:0,cues:['store-commerce-unconfirmed']};
  return {score:Math.max(0,Math.min(100,score)),cues};
}

export async function verifyHit(hit:SearchHit,type:string,stateCode:string):Promise<VerifiedHit|null>{
  try{
    if(!allowedWebsite(hit.url))return null;const homeHtml=await fetchText(hit.url,5500);const entity=resolveEntity(homeHtml,hit.title,hit.url);if(!entity.name||entity.score<24||genericName(entity.name))return null;
    const pageUrls=[hit.url];const pages:string[]=[homeHtml];const extraUrls=sameOriginPreferred(homeHtml,hit.url).filter(url=>url!==hit.url).slice(0,3);const extras=await Promise.allSettled(extraUrls.map(url=>fetchText(url,3800)));for(let i=0;i<extras.length;i++){const result=extras[i];if(result.status==='fulfilled'){pages.push(result.value);pageUrls.push(extraUrls[i])}}
    const combinedHtml=pages.join('\n');const body=pages.map(strip).join(' ').slice(0,300000);const f=scoreBusiness(hit,body,type,stateCode,entity);if(f.score<70)return null;
    const allLinks=pages.flatMap((html,index)=>hrefs(html,pageUrls[index]||hit.url));const host=domainOf(hit.url);const email=chooseEmail(emailsOf(combinedHtml),host);const phone=phonesOf(combinedHtml,body)[0]||'';const whatsapp=whatsappOf(allLinks);const instagram=firstSocial(allLinks,['instagram.com']);const facebook=firstSocial(allLinks,['facebook.com','fb.com']);const linkedin=firstSocial(allLinks,['linkedin.com']);const person=extractPerson(body);const contactUrl=pageUrls.find(url=>/contact/i.test(url))||pageUrls.find(url=>/(team|staff|coach|about|leadership)/i.test(url))||pageUrls[1]||hit.url;
    const socialProfiles=websiteSocialProfiles(pages.map((html,index)=>({html,url:pageUrls[index]})));
    const buyer=body.match(/(?:wholesale|bulk order|school equipment|physical education|youth program|private lesson|court rental|basketball camp|basketball classes)/gi)||[];if(buyer.length)f.cues.push('buyer-use:'+Array.from(new Set(buyer.map(x=>x.toLowerCase()))).slice(0,3).join('/'));return {...hit,city:f.cues.includes('national-supplier')?'':hit.city,fitScore:f.score,cues:f.cues,orgName:entity.name,entityScore:entity.score,entitySource:entity.source,email,phone,whatsapp,instagram,facebook,linkedin,contactName:person.name,contactTitle:person.title,contactUrl,sourceUrls:pageUrls.slice(0,pages.length),socialProfiles};
  }catch{return null}
}

export async function save(db:D1Database,hits:VerifiedHit[],stateCode:string,type:string,target:number,runId?:string,provider='WEB_SEARCH_VERIFIED_V6',sourceKey?:string){
  let saved=0;const seen=new Set<string>();for(const h of hits){if(saved>=target)break;const domain=domainOf(h.url);if(!domain||seen.has(domain))continue;seen.add(domain);
    const key=sourceKey||`web:${domain}`;
    const previous=await db.prepare(`SELECT phone FROM discovery_candidates WHERE source_key=?`).bind(key).first<{phone:string|null}>();const previousPhone=publicPhone(previous?.phone||'');
    let leadScore=Math.min(100,Math.round(h.fitScore*.5)+Math.min(15,Math.round(h.entityScore/4))+(h.email?15:h.phone||h.whatsapp?10:0)+(h.contactName?5:0)+(h.cues.some(x=>x.startsWith('buyer-use:'))?10:0)+(h.cues.includes('local-match')?5:0));if(!h.email&&!h.phone&&!h.whatsapp)leadScore=Math.min(79,leadScore);
    const evidence=`${provider==='OFFICIAL_WEBSITE_IMPORT_V1'?'Official website import V1':provider==='PUBLIC_SOURCE_VERIFIED_V1'?'公开来源官网核验':'Verified web V6'} · entity=${h.orgName} · entity_source=${h.entitySource} · entity_score=${h.entityScore} · fit=${h.fitScore} · cues=${h.cues.join(',')} · query=${h.query}`.slice(0,1500);
    const newId=crypto.randomUUID(); const row=await db.prepare(`INSERT INTO discovery_candidates (id,source_key,source_provider,name,customer_type,state_region,city,website,email,phone,whatsapp,instagram_url,facebook_url,linkedin_url,contact_person_name,contact_person_title,website_contact_url,lead_score,grade,status,source_url,source_evidence,raw_json,enrichment_status,enrichment_source_urls,enriched_at) VALUES (?,?, ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'NEW',?,?,?,'COMPLETED',?,CURRENT_TIMESTAMP) ON CONFLICT(source_key) DO UPDATE SET source_provider=excluded.source_provider,name=excluded.name,customer_type=excluded.customer_type,state_region=excluded.state_region,city=excluded.city,website=excluded.website,email=CASE WHEN discovery_candidates.status='CRM' THEN COALESCE(NULLIF(discovery_candidates.email,''),excluded.email) ELSE COALESCE(excluded.email,NULLIF(discovery_candidates.email,'')) END,phone=CASE WHEN discovery_candidates.status='CRM' THEN COALESCE(NULLIF(discovery_candidates.phone,''),excluded.phone) ELSE COALESCE(excluded.phone,?) END,whatsapp=CASE WHEN discovery_candidates.status='CRM' THEN COALESCE(NULLIF(discovery_candidates.whatsapp,''),excluded.whatsapp) ELSE COALESCE(excluded.whatsapp,NULLIF(discovery_candidates.whatsapp,'')) END,instagram_url=CASE WHEN discovery_candidates.status='CRM' THEN COALESCE(NULLIF(discovery_candidates.instagram_url,''),excluded.instagram_url) ELSE COALESCE(excluded.instagram_url,NULLIF(discovery_candidates.instagram_url,'')) END,facebook_url=CASE WHEN discovery_candidates.status='CRM' THEN COALESCE(NULLIF(discovery_candidates.facebook_url,''),excluded.facebook_url) ELSE COALESCE(excluded.facebook_url,NULLIF(discovery_candidates.facebook_url,'')) END,linkedin_url=CASE WHEN discovery_candidates.status='CRM' THEN COALESCE(NULLIF(discovery_candidates.linkedin_url,''),excluded.linkedin_url) ELSE COALESCE(excluded.linkedin_url,NULLIF(discovery_candidates.linkedin_url,'')) END,contact_person_name=CASE WHEN discovery_candidates.status='CRM' THEN COALESCE(NULLIF(discovery_candidates.contact_person_name,''),excluded.contact_person_name) ELSE COALESCE(excluded.contact_person_name,NULLIF(discovery_candidates.contact_person_name,'')) END,contact_person_title=CASE WHEN discovery_candidates.status='CRM' THEN COALESCE(NULLIF(discovery_candidates.contact_person_title,''),excluded.contact_person_title) ELSE COALESCE(excluded.contact_person_title,NULLIF(discovery_candidates.contact_person_title,'')) END,website_contact_url=excluded.website_contact_url,lead_score=excluded.lead_score,grade=excluded.grade,status=discovery_candidates.status,source_url=excluded.source_url,source_evidence=excluded.source_evidence,raw_json=excluded.raw_json,enrichment_status='COMPLETED',enrichment_source_urls=excluded.enrichment_source_urls,enriched_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE discovery_candidates.status<>'IGNORED' RETURNING id`)
      .bind(newId,key,provider,h.orgName,type,stateCode,h.city,h.url,h.email||null,h.phone||null,h.whatsapp||null,h.instagram||null,h.facebook||null,h.linkedin||null,h.contactName||null,h.contactTitle||null,h.contactUrl,leadScore,grade(leadScore),h.url,evidence,JSON.stringify({title:h.title,snippet:h.snippet,query:h.query,city:h.city,fitScore:h.fitScore,cues:h.cues,orgName:h.orgName,entityScore:h.entityScore,entitySource:h.entitySource}),JSON.stringify(h.sourceUrls),previousPhone||null).first<{id:string}>(); if(row){await recordResult(db,runId,row,newId);saved++}
  }
  return saved;
}

export const onRequestPost:PagesFunction<Env>=async({request,env})=>{
  if(!env.MINGEAGLE_DB)return Response.json({ok:false,error:'Database is not configured.'},{status:503});const db=env.MINGEAGLE_DB;await ensureTables(db);let jobId='';
  try{
    const input=await request.json() as Input;let parsed;try{parsed=parseSearch(input)}catch(e){return Response.json({ok:false,error:(e as Error).message},{status:400})}const {stateCode,customerType:type,targetCount:target,city,round}=parsed;if(!allowedTypes.has(type))return Response.json({ok:false,error:'不支持的商业客户类型。'},{status:400});
    jobId=crypto.randomUUID();await db.prepare(`INSERT INTO discovery_jobs (id,state_region,customer_type,target_count,source_provider) VALUES (?,?,?,?, 'WEB_SEARCH_VERIFIED_V6')`).bind(jobId,stateCode,type,target).run();
    const queries=queryPlan(stateCode,type,city,round,8);const started=Date.now();
    const searched=await Promise.allSettled(queries.map(q=>bing(q.query,q.city)));if(searched.every(r=>r.status==='rejected'))throw new Error('Web公开搜索全部失败，请稍后重试。');const raw=searched.flatMap(r=>r.status==='fulfilled'?r.value:[]);const unique:SearchHit[]=[];const domains=new Set<string>();for(const h of raw){const d=domainOf(h.url);if(!d||domains.has(d))continue;domains.add(d);unique.push(h);if(unique.length>=Math.max(28,target*4))break}
    if(!unique.length){await db.prepare(`UPDATE discovery_jobs SET status='COMPLETED',result_count=0,completed_at=CURRENT_TIMESTAMP,error='No public website candidates returned' WHERE id=?`).bind(jobId).run();return Response.json({ok:true,found:0,mode:'WEB_VERIFIED_V6',checked:0,verified:0,note:'公开搜索本次未返回可验证官网候选。'})}
    const verified:VerifiedHit[]=[];for(let i=0;i<unique.length;i+=4){if(Date.now()-started>23000)break;const batch=unique.slice(i,i+4);const result=await Promise.allSettled(batch.map(h=>verifyHit(h,type,stateCode)));verified.push(...result.flatMap(x=>x.status==='fulfilled'&&x.value?[x.value]:[]));if(verified.length>=target)break}
    const found=await save(db,verified.sort((a,b)=>b.fitScore-a.fitScore||b.entityScore-a.entityScore),stateCode,type,target,input.runId);await db.prepare(`UPDATE discovery_jobs SET status='COMPLETED',result_count=?,completed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(found,jobId).run();
    return Response.json({ok:true,found,mode:'WEB_VERIFIED_V6',provider:'WEB_SEARCH_VERIFIED_V6',checked:unique.length,verified:verified.length,note:found?`V6 已确认 ${found} 个真实机构主体并通过目标业务验证。`:'本次没有候选同时通过真实机构识别与业务验证。'});
  }catch(error){const msg=error instanceof Error?error.message:'Web verification V6 failed.';if(jobId)await db.prepare(`UPDATE discovery_jobs SET status='FAILED',error=?,completed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(msg.slice(0,1000),jobId).run();return Response.json({ok:false,error:msg},{status:502})}
};
