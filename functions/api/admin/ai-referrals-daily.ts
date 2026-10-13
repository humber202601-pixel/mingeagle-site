// Admin-only Cloudflare browser-referrer aggregates for recognized AI services.
// Read-only: this endpoint cannot query Cloudflare, write D1, or access its token.
// Protected by functions/api/admin/_middleware.ts.
interface Env {MINGEAGLE_DB?:D1Database}
type RecordRow={date_utc:string;platform:string;provider_visits:number;sampled_pageviews:number;fetched_at:string};
type PageRow={date_utc:string;platform:string;page_bucket:string;sampled_pageviews:number};
const SITE='c229a4f21594480eb5a1381a1b1e67f0';
const PLATFORMS=['CHATGPT','PERPLEXITY','CLAUDE','GEMINI','COPILOT'] as const;
const allowed=new Set<string>(['ALL_AI',...PLATFORMS]);
const windows=new Set([0,30,90,365]);
const PAGE_BUCKETS=new Set(['HOME','KIDS_QUIET_GUIDE','APARTMENT_GUIDE','SCHOOL_EQUIPMENT_GUIDE','CAMP_GUIDE','BULK_GUIDE','WHOLESALE_CATALOG','TEAM_CUSTOM','FOR_COACHES','FOR_SCHOOLS','WHOLESALE','PRODUCTS','PRODUCT_DETAIL','OTHER_PAGE']);
const reply=(data:Record<string,unknown>,status=200)=>
 Response.json(data,{status,headers:{'cache-control':'private, no-store'}});
export const onRequestGet:PagesFunction<Env>=async({env,request})=>{
 const db=env.MINGEAGLE_DB;
 if(!db)return reply({ok:false,error:'Production CRM database unavailable'},503);
 const days=Number(new URL(request.url).searchParams.get('days')??30);
 if(!Number.isSafeInteger(days)||!windows.has(days))
  return reply({ok:false,error:'Unsupported period'},400);
 try {
  const stmt=db.prepare(days===0?
   'SELECT date_utc,platform,provider_visits,sampled_pageviews,fetched_at FROM ai_referrals_daily WHERE site_tag=? ORDER BY date_utc DESC,platform LIMIT 3000':
   "SELECT date_utc,platform,provider_visits,sampled_pageviews,fetched_at FROM ai_referrals_daily WHERE site_tag=? AND date_utc>=date('now','-' || ? || ' days') ORDER BY date_utc DESC,platform LIMIT 3000");
  const fetched=await (days===0?stmt.bind(SITE):stmt.bind(SITE,days)).all<RecordRow>();
  const records=fetched.results||[];
  if(!Array.isArray(records)||records.length>=3000)
   return reply({ok:false,error:'AI referral history truncated'},503);
  // Query anonymous page-category summaries independently from sitewide Visits.
  // No raw requestPath, full referrer URL or CRM person information is stored.
  const pageStmt=db.prepare(days===0?
   'SELECT date_utc,platform,page_bucket,sampled_pageviews FROM ai_referral_pages_daily WHERE site_tag=? ORDER BY date_utc DESC,platform,page_bucket LIMIT 8000':
   "SELECT date_utc,platform,page_bucket,sampled_pageviews FROM ai_referral_pages_daily WHERE site_tag=? AND date_utc>=date('now','-' || ? || ' days') ORDER BY date_utc DESC,platform,page_bucket LIMIT 8000");
  const pageFetch=await (days===0?pageStmt.bind(SITE):pageStmt.bind(SITE,days)).all<PageRow>();
  const pageRecords=pageFetch.results||[];
  if(!Array.isArray(pageRecords)||pageRecords.length>=8000)
   return reply({ok:false,error:'AI referral landing-page history truncated'},503);
  const daily=new Map<string,{dateUTC:string;providerVisits:number;sampledPageviews:number;fetchedAt:string}>();
  const totals=Object.fromEntries(PLATFORMS.map(p=>[p,{providerVisits:0,sampledPageviews:0}])) as Record<typeof PLATFORMS[number],{providerVisits:number;sampledPageviews:number}>;
  const observed=new Map<string,{providerVisits:number;sampledPageviews:number}>();
  for(const row of records){
   const date=String(row.date_utc),platform=String(row.platform);
   const visits=Number(row.provider_visits),views=Number(row.sampled_pageviews);
   if(!/^20\d\d-\d\d-\d\d$/.test(date)||!allowed.has(platform)||
      !Number.isSafeInteger(visits)||!Number.isSafeInteger(views)||visits<0||views<0)
    return reply({ok:false,error:'Invalid provider referral data'},503);
   if(platform==='ALL_AI'){
    if(daily.has(date))return reply({ok:false,error:'Duplicate provider totals'},503);
    daily.set(date,{dateUTC:date,providerVisits:visits,sampledPageviews:views,fetchedAt:String(row.fetched_at)});
   }else{
    totals[platform as typeof PLATFORMS[number]].providerVisits+=visits;
    totals[platform as typeof PLATFORMS[number]].sampledPageviews+=views;
    const group=observed.get(date)||{providerVisits:0,sampledPageviews:0};
    group.providerVisits+=visits;group.sampledPageviews+=views;
    observed.set(date,group);
   }
  }
  // Every platform row must be anchored to a verified ALL_AI snapshot; otherwise
  // zero vs missing is ambiguous. Never silently normalize inconsistent totals.
  for(const [date,group] of observed){
   const all=daily.get(date);
   if(!all||all.providerVisits!==group.providerVisits||
      all.sampledPageviews!==group.sampledPageviews)
    return reply({ok:false,error:'AI referral total mismatch'},503);
  }
  const providerByDatePlatform=new Map<string,number>();
  for(const row of records){
   if(row.platform!=='ALL_AI')
    providerByDatePlatform.set(row.date_utc+'|'+row.platform,Number(row.sampled_pageviews));
  }
  const landingCounts=new Map<string,number>();
  const groupBreakdown=new Map<string,{platform:string;pageBucket:string;sampledPageviews:number}>();
  const uniquePages=new Set<string>();
  for(const row of pageRecords){
   const date=String(row.date_utc),platform=String(row.platform),
    bucket=String(row.page_bucket),views=Number(row.sampled_pageviews);
   const key=date+'|'+platform;
   if(!daily.has(date)||!PLATFORMS.includes(platform as typeof PLATFORMS[number])||
      !PAGE_BUCKETS.has(bucket)||!Number.isSafeInteger(views)||views<=0||
      !providerByDatePlatform.has(key)||uniquePages.has(key+'|'+bucket))
    return reply({ok:false,error:'Invalid AI referral landing data'},503);
   uniquePages.add(key+'|'+bucket);
   landingCounts.set(key,(landingCounts.get(key)||0)+views);
   const publicKey=platform+'|'+bucket;
   const found=groupBreakdown.get(publicKey)||{platform,pageBucket:bucket,sampledPageviews:0};
   found.sampledPageviews+=views;
   if(!Number.isSafeInteger(found.sampledPageviews))
    return reply({ok:false,error:'AI landing breakdown overflow'},503);
   groupBreakdown.set(publicKey,found);
  }
  const incompleteDays=new Set<string>();
  for(const [key,expected] of providerByDatePlatform){
   if((landingCounts.get(key)||0)!==expected)incompleteDays.add(key.split('|')[0]);
  }
  // Historic positive AI referrer dates predating path collection are unknown,
  // not silently shown as zero page-category events.
  const landingComplete=daily.size>0&&incompleteDays.size===0;
  const rows=[...daily.values()].sort((a,b)=>b.dateUTC.localeCompare(a.dateUTC));
  const summary=rows.reduce((out,row)=>({
   providerVisits:out.providerVisits+row.providerVisits,
   sampledPageviews:out.sampledPageviews+row.sampledPageviews
  }),{providerVisits:0,sampledPageviews:0});
  return reply({ok:true,source:'Cloudflare Web Analytics GraphQL referrerHost',
   connected:rows.length>0,days,rows,platforms:totals,summary,
   pageBreakdown:landingComplete?[...groupBreakdown.values()].sort((a,b)=>
    b.sampledPageviews-a.sampledPageviews||a.platform.localeCompare(b.platform)||
    a.pageBucket.localeCompare(b.pageBucket)):[],
   landingCoverage:{complete:landingComplete,
    missingPositiveDates:[...incompleteDays].sort(),
    note:landingComplete?'All recorded AI source page events have matching landing categories':
     'Landing categories not yet fully synchronized for every AI referral date'},
   coverage:{observedDays:rows.length,fromUTC:rows.at(-1)?.dateUTC||null,
    toUTC:rows[0]?.dateUTC||null,latestFetchUTC:rows[0]?.fetchedAt||null},
   caveats:[
    'AI referral = browser event with a verified AI assistant referrer hostname, not an AI citation or recommendation count.',
    'Direct, app, privacy-restricted and Google AI search visits may lack an AI referrer and cannot be inferred.',
    'Cloudflare measures sampled page-load events and provider-estimated visits, not unique people.',
    'Missing complete UTC dates are unknown, not zero; no per-visitor tracking or CRM conversion ratio is inferred.',
    'Request paths are mapped to broad predefined marketing page categories only; page-level Visits are intentionally not computed.'
   ]});
 }catch{return reply({ok:false,error:'AI referral snapshot unavailable; not equivalent to zero'},503)}
};
