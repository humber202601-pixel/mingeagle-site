// Cloudflare Web Analytics → existing CRM D1: daily anonymous aggregate only.
// Separate Worker: GraphQL token is an encrypted Worker secret, never a CRM secret.
const ACCOUNT='3426761cadca055d284c41a7fb65ee8d';
const TAG='c229a4f21594480eb5a1381a1b1e67f0';
const HOSTS=new Set(['mingeagle.com','www.mingeagle.com']);
const LIMIT=1000, DAYS=7;
export function utcWindow(now=new Date()){
  if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error('bad clock');
  const end=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate());
  const start=end-DAYS*86400000;
  return {start:new Date(start).toISOString().slice(0,10),
    end:new Date(end).toISOString().slice(0,10),
    from:new Date(start).toISOString(),to:new Date(end).toISOString()};
}
function query(w){
 const filter='siteTag:"'+TAG+'",datetime_geq:"'+w.from+'",datetime_lt:"'+w.to+'"';
 return 'query {viewer {accounts(filter:{accountTag:"'+ACCOUNT+'"}) {'+
  'daily:rumPageloadEventsAdaptiveGroups(limit:'+LIMIT+',filter:{'+filter+'}) {'+
  'count dimensions {date requestHost refererHost} sum {visits}} '+
  // Page-level breakdown is based on sampled page events, NEVER sum(visits)
  // grouped by path; a single visit may include multiple pages.
  'paths:rumPageloadEventsAdaptiveGroups(limit:'+LIMIT+',filter:{'+filter+'}) {'+
  'count dimensions {date requestHost refererHost requestPath}}}}}';
}

const valid=n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0;
export function dailyRows(groups,w){
  if(!Array.isArray(groups)||groups.length>=LIMIT)throw Error('missing/truncated Cloudflare groups');
  const map=new Map();
  for(const g of groups){
    const d=g?.dimensions?.date,h=g?.dimensions?.requestHost;
    if(typeof d!=='string'||!/^20\d\d-\d\d-\d\d$/.test(d)||
      d<w.start||d>=w.end||!Number.isFinite(Date.parse(d+'T00:00:00Z'))||
      new Date(d+'T00:00:00Z').toISOString().slice(0,10)!==d)
      throw Error('invalid or incomplete UTC day');
    if(typeof h!=='string')throw Error('missing requestHost');
    if(!HOSTS.has(h.toLowerCase()))continue;
    if(!valid(g.count)||!valid(g.sum?.visits))throw Error('invalid provider metrics');
    const row=map.get(d)||{date:d,visits:0,sampledPageviews:0};
    row.visits+=g.sum.visits;row.sampledPageviews+=g.count;
    if(!valid(row.visits)||!valid(row.sampledPageviews))throw Error('metrics overflow');
    map.set(d,row);
  }
  // No provider group = unknown. Explicit group of 0 is a real provider 0.
  return [...map.values()].sort((a,b)=>a.date.localeCompare(b.date));
}

const AI_REFERRERS={
 CHATGPT:['chatgpt.com','chat.openai.com'],
 PERPLEXITY:['perplexity.ai','perplexity.com'],
 CLAUDE:['claude.ai'],
 GEMINI:['gemini.google.com'],
 COPILOT:['copilot.microsoft.com','copilot.microsoft365.com']
};
// Only explicit AI-service referrer hostnames count. Ordinary Google/Bing and
// missing referrers cannot be inferred to be AI traffic.
export function aiReferrerPlatform(value){
 if(typeof value!=='string')return null;
 const host=value.toLowerCase().replace(/\.$/,'');
 for(const [platform,domains] of Object.entries(AI_REFERRERS)){
  if(domains.some(d=>host===d||host.endsWith('.'+d)))return platform;
 }
 return null;
}
export function aiReferralRows(groups,baseRows,w){
 if(!Array.isArray(groups)||groups.length>=LIMIT)throw Error('missing/truncated referrer groups');
 const dates=new Set(baseRows.map(r=>r.date));
 const totals=new Map([...dates].map(d=>[d,{date:d,platform:'ALL_AI',visits:0,sampledPageviews:0}]));
 const perPlatform=new Map();
 for(const g of groups){
  const date=g?.dimensions?.date,host=g?.dimensions?.requestHost,ref=g?.dimensions?.refererHost;
  if(!HOSTS.has(String(host||'').toLowerCase()))continue;
  if(typeof date!=='string'||!dates.has(date)||date<w.start||date>=w.end||
     typeof ref!=='string'||!valid(g.count)||!valid(g.sum?.visits))
   throw Error('invalid AI referrer source data');
  const platform=aiReferrerPlatform(ref);
  if(!platform)continue;
  const key=date+'|'+platform;
  const row=perPlatform.get(key)||{date,platform,visits:0,sampledPageviews:0};
  row.visits+=g.sum.visits;row.sampledPageviews+=g.count;
  const all=totals.get(date);
  all.visits+=g.sum.visits;all.sampledPageviews+=g.count;
  if(![row.visits,row.sampledPageviews,all.visits,all.sampledPageviews].every(valid))
   throw Error('AI referral metric overflow');
  perPlatform.set(key,row);
 }
 // Record ALL_AI=0 only on dates when Cloudflare actually supplied site traffic.
 // Missing provider days remain unknown, never fabricated zeroes.
 return [...totals.values(),...perPlatform.values()]
   .sort((a,b)=>a.date.localeCompare(b.date)||a.platform.localeCompare(b.platform));
}


// Whitelisted marketing-page categories; raw request paths never enter CRM D1.
export function aiLandingCategory(path){
 if(typeof path!=='string'||!path.startsWith('/')||path.length>2048)
  throw Error('invalid RUM request path');
 if(path==='/'||path==='/index.html')return 'HOME';
 if(path==='/quiet-indoor-sports-for-kids.html')return 'KIDS_QUIET_GUIDE';
 if(path==='/silent-basketball-for-apartments.html')return 'APARTMENT_GUIDE';
 if(path==='/indoor-school-sports-equipment-guide.html'||
    /^\/school-sports-equipment-(es|fr|de|pt)\.html$/.test(path))
  return 'SCHOOL_EQUIPMENT_GUIDE';
 if(path==='/basketball-camp-equipment-supplier.html')return 'CAMP_GUIDE';
 if(path==='/silent-basketball-bulk-buying-guide.html')return 'BULK_GUIDE';
 if(path==='/wholesale-product-catalog.html')return 'WHOLESALE_CATALOG';
 if(path==='/custom-basketball-for-teams.html'||path==='/custom-logo.html')return 'TEAM_CUSTOM';
 if(path==='/for-coaches.html')return 'FOR_COACHES';
 if(path==='/for-schools.html')return 'FOR_SCHOOLS';
 if(path==='/wholesale.html')return 'WHOLESALE';
 if(path==='/products.html')return 'PRODUCTS';
 if(['/silent-basketball.html','/fabric-silent-basketball.html',
  '/weighted-flocked-basketball.html','/silent-soccer.html',
  '/silent-basketball-guide.html','/silent-basketball-vs-regular.html'].includes(path))
  return 'PRODUCT_DETAIL';
 return 'OTHER_PAGE';
}
export function aiLandingRows(pathGroups,baseline,referrals,w){
 if(!Array.isArray(pathGroups)||pathGroups.length>=LIMIT)
  throw Error('missing/truncated Cloudflare page breakdown');
 const observedDates=new Set(baseline.map(r=>r.date));
 const counts=new Map();
 const rows=new Map();
 for(const g of pathGroups){
  const d=g?.dimensions?.date,host=g?.dimensions?.requestHost,
    ref=g?.dimensions?.refererHost,path=g?.dimensions?.requestPath;
  if(!HOSTS.has(String(host||'').toLowerCase()))continue;
  if(typeof d!=='string'||!observedDates.has(d)||d<w.start||d>=w.end||
     typeof ref!=='string'||!valid(g.count))throw Error('invalid RUM page group');
  const platform=aiReferrerPlatform(ref);
  if(!platform)continue;
  const bucket=aiLandingCategory(path),key=d+'|'+platform;
  counts.set(key,(counts.get(key)||0)+g.count);
  const rowKey=key+'|'+bucket;
  const row=rows.get(rowKey)||{date:d,platform,pageBucket:bucket,sampledPageviews:0};
  row.sampledPageviews+=g.count;
  if(!valid(row.sampledPageviews)||!valid(counts.get(key)))
   throw Error('AI page attribution overflow');
  if(g.count>0)rows.set(rowKey,row);
 }
 // Verify all platform totals against the separate, less-granular RUM query.
 // Fail closed rather than show partial landing-page attribution.
 for(const item of referrals){
  if(item.platform==='ALL_AI')continue;
  if((counts.get(item.date+'|'+item.platform)||0)!==item.sampledPageviews)
   throw Error('AI landing page / source count mismatch');
 }
 for(const [key,count] of counts){
  if(!referrals.some(x=>x.platform!=='ALL_AI'&&key===x.date+'|'+x.platform&&x.sampledPageviews===count))
   throw Error('Unmatched AI landing source');
 }
 return [...rows.values()].sort((a,b)=>a.date.localeCompare(b.date)||
  a.platform.localeCompare(b.platform)||a.pageBucket.localeCompare(b.pageBucket));
}

export async function synchronize(env,{now=new Date(),fetchImpl=fetch}={}){
  if(!env?.MINGEAGLE_DB)throw Error('missing D1 binding');
  if(typeof env.CF_ANALYTICS_GRAPHQL_TOKEN!=='string'||
    !env.CF_ANALYTICS_GRAPHQL_TOKEN.trim())throw Error('missing analytics secret');
  const w=utcWindow(now);
  const res=await fetchImpl('https://api.cloudflare.com/client/v4/graphql',{
    method:'POST',headers:{'content-type':'application/json',
     authorization:'Bearer '+env.CF_ANALYTICS_GRAPHQL_TOKEN},
    body:JSON.stringify({query:query(w)}),signal:AbortSignal.timeout(20000)});
  if(!res.ok)throw Error('Cloudflare Analytics HTTP '+res.status);
  const payload=await res.json();
  if(payload?.errors&&(!Array.isArray(payload.errors)||payload.errors.length))
    throw Error('Cloudflare GraphQL errors');
  const accounts=(payload?.data?.viewer??payload?.result?.viewer)?.accounts;
  if(!Array.isArray(accounts)||accounts.length!==1)throw Error('ambiguous account response');
  const groups=accounts[0]?.daily;
  const pathGroups=accounts[0]?.paths;
  const rows=dailyRows(groups,w);
  const referrals=aiReferralRows(groups,rows,w);
  const landing=aiLandingRows(pathGroups,rows,referrals,w);
  // D1 batch is transactional: a failure never leaves a partly updated day set.
  const sql=['INSERT INTO web_analytics_daily',
    '(date_utc,site_tag,host,provider_visits,sampled_pageviews,source,fetched_at)',
    "VALUES (?,?,'mingeagle.com',?,?,'CLOUDFLARE_RUM_GRAPHQL',CURRENT_TIMESTAMP)",
    'ON CONFLICT(date_utc) DO UPDATE SET provider_visits=excluded.provider_visits,',
    'sampled_pageviews=excluded.sampled_pageviews,fetched_at=CURRENT_TIMESTAMP',
    'WHERE web_analytics_daily.site_tag=excluded.site_tag',
    'AND web_analytics_daily.host=excluded.host',
    'AND web_analytics_daily.source=excluded.source'].join(' ');
  const aiSql=['INSERT INTO ai_referrals_daily',
    '(date_utc,platform,site_tag,host,provider_visits,sampled_pageviews,source,fetched_at)',
    "VALUES (?,? ,?,'mingeagle.com',?,?,'CLOUDFLARE_RUM_GRAPHQL',CURRENT_TIMESTAMP)",
    'ON CONFLICT(date_utc,platform) DO UPDATE SET provider_visits=excluded.provider_visits,',
    'sampled_pageviews=excluded.sampled_pageviews,fetched_at=CURRENT_TIMESTAMP',
    'WHERE ai_referrals_daily.site_tag=excluded.site_tag',
    'AND ai_referrals_daily.host=excluded.host',
    'AND ai_referrals_daily.source=excluded.source'].join(' ');
  const landingSql=['INSERT INTO ai_referral_pages_daily',
    '(date_utc,platform,page_bucket,site_tag,host,sampled_pageviews,source,fetched_at)',
    "VALUES (?,?,?,?,'mingeagle.com',?,'CLOUDFLARE_RUM_GRAPHQL',CURRENT_TIMESTAMP)",
    'ON CONFLICT(date_utc,platform,page_bucket) DO UPDATE SET',
    'sampled_pageviews=excluded.sampled_pageviews,fetched_at=CURRENT_TIMESTAMP',
    'WHERE ai_referral_pages_daily.site_tag=excluded.site_tag',
    'AND ai_referral_pages_daily.host=excluded.host',
    'AND ai_referral_pages_daily.source=excluded.source'].join(' ');
  // Delete stale page-group rows only for days actually supplied by Cloudflare,
  // inside the same atomic batch as the authoritative new snapshot.
  const pruneSql='DELETE FROM ai_referral_pages_daily WHERE date_utc=? AND site_tag=?';
  const statements=[
    ...rows.map(r=>env.MINGEAGLE_DB.prepare(sql).bind(r.date,TAG,r.visits,r.sampledPageviews)),
    ...referrals.map(r=>env.MINGEAGLE_DB.prepare(aiSql)
      .bind(r.date,r.platform,TAG,r.visits,r.sampledPageviews)),
    ...rows.map(r=>env.MINGEAGLE_DB.prepare(pruneSql).bind(r.date,TAG)),
    ...landing.map(r=>env.MINGEAGLE_DB.prepare(landingSql)
      .bind(r.date,r.platform,r.pageBucket,TAG,r.sampledPageviews))
  ];
  if(statements.length){
    const results=await env.MINGEAGLE_DB.batch(statements);
    if(!Array.isArray(results)||results.length!==statements.length||
      results.some(r=>!r||r.success===false))
      throw Error('D1 batch write not confirmed');
  }
  return {providerDates:rows.length,written:rows.length,aiReferralRows:referrals.length,aiLandingRows:landing.length,checkedCompleteDays:DAYS};
}
export default {
  async scheduled(_event,env,ctx){
    ctx.waitUntil(synchronize(env).then(r=>
      console.log('web_analytics_daily_sync',JSON.stringify(r))
    ).catch(()=>{
      console.error('web_analytics_daily_sync_failed');
      throw Error('web_analytics_daily_sync_failed');
    }));
  },
  async fetch(){return new Response('Not found',{status:404});}
};