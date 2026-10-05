interface Env { MINGEAGLE_DB: D1Database }

type Input = { stateCode?: string; customerType?: string; targetCount?: number | string };
type SearchHit = { title:string; url:string; snippet:string; query:string; city:string };
type VerifiedHit = SearchHit & { fitScore:number; cues:string[]; homepageText:string; validationMode:'WEBSITE'|'SEARCH_EVIDENCE' };
type CandidateRow = { id:string; name?:string; website?:string; source_provider?:string };
type CueCheck = { label:string; re:RegExp };

const clean=(v:unknown,max=1000)=>typeof v==='string'?v.trim().slice(0,max):'';
const allowedState=/^[A-Z]{2}$/;
const allowedTypes=new Set(['BASKETBALL_TRAINING','BASKETBALL_GYM','YOUTH_CLUB','SPORTS_STORE']);

const METROS:Record<string,string[]>={
  AL:['Birmingham','Mobile'],AK:['Anchorage'],AZ:['Phoenix','Tucson'],AR:['Little Rock'],CA:['Los Angeles','San Francisco','San Diego','Sacramento'],CO:['Denver','Colorado Springs'],CT:['Hartford','New Haven'],DE:['Wilmington'],FL:['Miami','Orlando','Tampa','Jacksonville'],GA:['Atlanta','Savannah'],HI:['Honolulu'],ID:['Boise'],IL:['Chicago','Springfield'],IN:['Indianapolis','Fort Wayne'],IA:['Des Moines','Iowa City'],KS:['Wichita','Topeka'],KY:['Louisville','Lexington'],LA:['New Orleans','Baton Rouge'],ME:['Portland'],MD:['Baltimore','Annapolis'],MA:['Boston','Worcester'],MI:['Detroit','Grand Rapids'],MN:['Minneapolis','Saint Paul'],MS:['Jackson','Gulfport'],MO:['St Louis','Kansas City'],MT:['Billings','Missoula'],NE:['Omaha','Lincoln'],NV:['Las Vegas','Reno'],NH:['Manchester'],NJ:['Newark','Trenton'],NM:['Albuquerque','Santa Fe'],NY:['New York City','Buffalo','Rochester','Albany'],NC:['Charlotte','Raleigh','Greensboro'],ND:['Fargo','Bismarck'],OH:['Columbus','Cleveland','Cincinnati'],OK:['Oklahoma City','Tulsa'],OR:['Portland','Eugene'],PA:['Philadelphia','Pittsburgh','Harrisburg'],RI:['Providence'],SC:['Columbia','Charleston','Greenville'],SD:['Sioux Falls','Rapid City'],TN:['Nashville','Memphis','Knoxville'],TX:['Dallas','Houston','Austin','San Antonio','Fort Worth'],UT:['Salt Lake City','Provo'],VT:['Burlington'],VA:['Richmond','Virginia Beach','Alexandria'],WA:['Seattle','Tacoma','Spokane'],WV:['Charleston','Morgantown'],WI:['Milwaukee','Madison'],WY:['Cheyenne']
};
const STATE_NAMES:Record<string,string>={AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming'};
const TERMS:Record<string,string[]>={
  BASKETBALL_TRAINING:['basketball academy training','basketball skills coach','youth basketball training'],
  BASKETBALL_GYM:['basketball gym facility','indoor basketball courts','basketball training facility'],
  YOUTH_CLUB:['youth basketball club','AAU basketball team','youth basketball academy'],
  SPORTS_STORE:['basketball sporting goods','basketball equipment store','sports store basketball']
};
const BLOCKED_DOMAINS=['bing.com','google.com','duckduckgo.com','yahoo.com','yelp.com','facebook.com','instagram.com','linkedin.com','youtube.com','wikipedia.org','reddit.com','x.com','twitter.com','tiktok.com','pinterest.com','yellowpages.com','mapquest.com','tripadvisor.com','indeed.com','ziprecruiter.com','chamberofcommerce.com','manta.com','bbb.org','maxpreps.com','hudl.com','eventbrite.com','foursquare.com','nba.com','wnba.com','espn.com','cbssports.com','foxsports.com','basketball-reference.com','flashscore.com','livescore.com','sofascore.com','crazygames.com','poki.com','games.com'];
const STRONG_NEGATIVE=/\b(live\s*score|livescore|scores?|game results?|statistics|standings|fixtures?|sports news|highlights?|streaming|fantasy basketball|video game|online game|play basketball games?|basketball reference|betting|odds)\b/i;

const CUES:Record<string,CueCheck[]>={
  BASKETBALL_TRAINING:[
    {label:'academy',re:/\bacadem(y|ies)\b/i},{label:'training',re:/\btraining\b/i},{label:'skills',re:/\bskills?\b/i},
    {label:'coach',re:/\bcoach(ing|es)?\b/i},{label:'player-development',re:/player development/i},
    {label:'private-training',re:/private (lesson|training|session)/i},{label:'camp-clinic',re:/\b(camp|clinic)s?\b/i},{label:'youth-program',re:/youth basketball|youth program/i}
  ],
  BASKETBALL_GYM:[
    {label:'gym',re:/\bgym\b/i},{label:'facility',re:/\bfacilit(y|ies)\b/i},{label:'courts',re:/basketball courts?|court rental|open gym/i},
    {label:'sports-center',re:/sports? cent(er|re)/i},{label:'training-center',re:/training (center|facility)/i}
  ],
  YOUTH_CLUB:[
    {label:'youth',re:/\byouth\b/i},{label:'aau',re:/\baau\b/i},{label:'club',re:/basketball club|\bclub\b/i},
    {label:'teams',re:/\bteams?\b/i},{label:'tryouts',re:/\btryouts?\b/i},{label:'league',re:/\bleague\b/i}
  ],
  SPORTS_STORE:[
    {label:'sporting-goods',re:/sporting goods/i},{label:'store',re:/\bstore\b|\bshop\b/i},{label:'equipment',re:/\bequipment\b/i},
    {label:'retail',re:/\bretail\b/i},{label:'basketball-products',re:/basketball (gear|equipment|balls?|shoes?|apparel)/i}
  ]
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

async function fetchText(url:string,timeout=5000){
  const c=new AbortController();const t=setTimeout(()=>c.abort(),timeout);
  try{
    const r=await fetch(url,{headers:{accept:'text/html,application/xhtml+xml,application/rss+xml,application/xml;q=0.9,*/*;q=0.8','accept-language':'en-US,en;q=0.9','user-agent':'Mozilla/5.0 (compatible; MING-EAGLE-Discovery/3.1; +https://mingeagle.com)'},redirect:'follow',signal:c.signal});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    return (await r.text()).slice(0,500000);
  }finally{clearTimeout(t)}
}

async function bing(query:string,city:string){
  const data=await fetchText(`https://www.bing.com/search?q=${encodeURIComponent(query)}&format=rss&mkt=en-US&setlang=en-US`,7000);
  const items=data.match(/<item\b[\s\S]*?<\/item>/gi)||[];const out:SearchHit[]=[];const seen=new Set<string>();
  for(const item of items){
    const title=xml(item,'title'),url=decode(xml(item,'link')),snippet=xml(item,'description');const d=domainOf(url);
    if(!title||!url||!d||seen.has(d)||!allowedWebsite(url))continue;
    if(STRONG_NEGATIVE.test(`${title} ${snippet}`))continue;
    seen.add(d);out.push({title,url,snippet,query,city});if(out.length>=12)break;
  }
  return out;
}

function fitEvidence(hit:SearchHit,body:string,type:string,stateCode:string,websiteLoaded:boolean){
  const searchText=`${hit.title} ${hit.snippet}`;
  const all=`${searchText} ${body}`;
  if(STRONG_NEGATIVE.test(searchText))return {score:0,cues:['negative-content']};
  const basketball=/basketball|hoops/i.test(all);
  if(!basketball&&type!=='SPORTS_STORE')return {score:0,cues:['no-basketball-signal']};

  const searchCues=(CUES[type]||[]).filter(x=>x.re.test(searchText)).map(x=>x.label);
  const bodyCues=(CUES[type]||[]).filter(x=>x.re.test(body)).map(x=>x.label);
  const cues=Array.from(new Set([...searchCues,...bodyCues]));
  const stateName=STATE_NAMES[stateCode]||'';
  const localText=`${searchText} ${body}`.toLowerCase();
  const local=[hit.city,stateName,stateCode].filter(Boolean).some(v=>localText.includes(v.toLowerCase()));
  const commercial=/contact|about us|programs?|services?|register|registration|book|schedule (a )?(session|training)|pricing|membership|train with|our coaches?|our trainers?/i.test(body);

  let score=0;
  if(basketball)score+=22;
  score+=Math.min(38,searchCues.length*16);
  score+=Math.min(28,bodyCues.filter(x=>!searchCues.includes(x)).length*9);
  if(local)score+=16;
  else if(hit.city&&hit.query.toLowerCase().includes(hit.city.toLowerCase()))score+=6;
  if(websiteLoaded)score+=5;
  if(commercial)score+=10;

  return {score:Math.min(100,score),cues:[...cues,...(local?['local-match']:[]),...(commercial?['commercial-site']:[])]};
}

async function verifyHit(hit:SearchHit,type:string,stateCode:string):Promise<VerifiedHit|null>{
  if(!allowedWebsite(hit.url)||STRONG_NEGATIVE.test(`${hit.title} ${hit.snippet}`))return null;
  let body='';let websiteLoaded=false;
  try{const html=await fetchText(hit.url,5200);body=strip(html).slice(0,120000);websiteLoaded=true}catch{body=''}
  const f=fitEvidence(hit,body,type,stateCode,websiteLoaded);
  const searchStrong=(CUES[type]||[]).filter(x=>x.re.test(`${hit.title} ${hit.snippet}`)).length>=2 && /basketball|hoops/i.test(`${hit.title} ${hit.snippet}`);
  const threshold=websiteLoaded?50:searchStrong?46:62;
  if(f.score<threshold)return null;
  return {...hit,fitScore:f.score,cues:f.cues,homepageText:body.slice(0,1500),validationMode:websiteLoaded?'WEBSITE':'SEARCH_EVIDENCE'};
}

async function quarantineLegacy(db:D1Database){
  const rows=await db.prepare(`SELECT id,name,website,source_provider FROM discovery_candidates WHERE status='NEW' AND source_provider LIKE 'WEB_SEARCH%' LIMIT 250`).all<CandidateRow>();
  for(const row of rows.results||[]){
    const domain=domainOf(clean(row.website,1000));const name=clean(row.name,300);
    const obviouslyBad=!domain||BLOCKED_DOMAINS.some(d=>domain===d||domain.endsWith(`.${d}`))||STRONG_NEGATIVE.test(name);
    if(obviouslyBad){
      await db.prepare(`UPDATE discovery_candidates SET status='IGNORED',lead_score=0,grade='C',source_evidence='Automatically quarantined: not a target commercial basketball customer',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='NEW'`).bind(row.id).run();
    }else if(row.source_provider!=='WEB_SEARCH_VERIFIED'){
      await db.prepare(`UPDATE discovery_candidates SET lead_score=MIN(lead_score,59),grade='C',source_evidence=COALESCE(source_evidence,'') || ' · Awaiting strict business validation',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='NEW'`).bind(row.id).run();
    }
  }
}

async function save(db:D1Database,hits:VerifiedHit[],stateCode:string,type:string,target:number){
  let saved=0;const seen=new Set<string>();
  for(const h of hits){
    if(saved>=target)break;
    const domain=domainOf(h.url);if(!domain||seen.has(domain))continue;seen.add(domain);
    const name=companyName(h.title,domain);
    const leadScore=Math.min(88,55+Math.round(h.fitScore*0.33));
    const evidence=`Verified public web search · mode=${h.validationMode} · fit=${h.fitScore} · cues=${h.cues.join(',')} · query=${h.query}`.slice(0,1000);
    await db.prepare(`INSERT INTO discovery_candidates (id,source_key,source_provider,name,customer_type,state_region,city,website,lead_score,grade,status,source_url,source_evidence,raw_json) VALUES (?,?, 'WEB_SEARCH_VERIFIED',?,?,?,?,?,?,?,'NEW',?,?,?) ON CONFLICT(source_key) DO UPDATE SET source_provider='WEB_SEARCH_VERIFIED',name=excluded.name,customer_type=excluded.customer_type,state_region=excluded.state_region,city=excluded.city,website=excluded.website,lead_score=excluded.lead_score,grade=excluded.grade,status=CASE WHEN discovery_candidates.status='CRM' THEN 'CRM' ELSE 'NEW' END,source_url=excluded.source_url,source_evidence=excluded.source_evidence,raw_json=excluded.raw_json,updated_at=CURRENT_TIMESTAMP`)
      .bind(crypto.randomUUID(),`web:${domain}`,name,type,stateCode,h.city,h.url,leadScore,grade(leadScore),h.url,evidence,JSON.stringify({title:h.title,snippet:h.snippet,query:h.query,city:h.city,fitScore:h.fitScore,cues:h.cues,validationMode:h.validationMode})).run();
    saved++;
  }
  return saved;
}

export const onRequestPost:PagesFunction<Env>=async({request,env})=>{
  if(!env.MINGEAGLE_DB)return Response.json({ok:false,error:'Database is not configured.'},{status:503});
  const db=env.MINGEAGLE_DB;await ensureTables(db);let jobId='';
  try{
    const input=await request.json() as Input;
    const stateCode=clean(input.stateCode,2).toUpperCase();
    const type=clean(input.customerType,80).toUpperCase();
    const target=Math.min(100,Math.max(10,Math.round(Number(input.targetCount||20))));
    if(!allowedState.test(stateCode)||!METROS[stateCode])return Response.json({ok:false,error:'请选择有效的美国州。'},{status:400});
    if(!allowedTypes.has(type))return Response.json({ok:false,error:'不支持的客户类型。'},{status:400});

    await quarantineLegacy(db);
    jobId=crypto.randomUUID();
    await db.prepare(`INSERT INTO discovery_jobs (id,state_region,customer_type,target_count,source_provider) VALUES (?,?,?,?, 'WEB_SEARCH_VERIFIED_V2')`).bind(jobId,stateCode,type,target).run();

    const metros=METROS[stateCode].slice(0,5),terms=TERMS[type]||['basketball'];
    const queries=metros.flatMap((city,index)=>[
      {city,query:`${terms[index%terms.length]} ${city} ${STATE_NAMES[stateCode]||stateCode}`},
      {city,query:`${terms[(index+1)%terms.length]} ${city} ${stateCode} coach programs`}
    ]).slice(0,10);

    const searched=await Promise.allSettled(queries.map(q=>bing(q.query,q.city)));
    const raw=searched.flatMap(r=>r.status==='fulfilled'?r.value:[]);
    const unique:SearchHit[]=[];const domains=new Set<string>();
    for(const h of raw){const d=domainOf(h.url);if(!d||domains.has(d))continue;domains.add(d);unique.push(h);if(unique.length>=Math.max(20,target*2))break}
    if(!unique.length)throw new Error('公开搜索源本次没有返回可验证官网候选。');

    const verifyPool=unique.slice(0,Math.min(24,Math.max(12,target*2)));
    const verifiedResults=await Promise.allSettled(verifyPool.map(h=>verifyHit(h,type,stateCode)));
    const verified=verifiedResults.flatMap(x=>x.status==='fulfilled'&&x.value?[x.value]:[]).sort((a,b)=>b.fitScore-a.fitScore);
    const found=await save(db,verified,stateCode,type,target);

    await db.prepare(`UPDATE discovery_jobs SET status='COMPLETED',result_count=?,completed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(found,jobId).run();
    return Response.json({ok:true,found,mode:'WEB_VERIFIED_V2',provider:'BING_RSS',checked:verifyPool.length,verified:verified.length});
  }catch(error){
    const msg=error instanceof Error?error.message:'Web verification failed.';
    if(jobId)await db.prepare(`UPDATE discovery_jobs SET status='FAILED',error=?,completed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(msg.slice(0,1000),jobId).run();
    return Response.json({ok:false,error:msg},{status:502});
  }
};
