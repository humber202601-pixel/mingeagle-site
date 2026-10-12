// Admin-only historic Web Analytics snapshot viewer.
// Snapshot writes are deliberately NOT exposed via HTTP. A trusted Cloudflare
// admin connector reads GraphQL and writes strictly aggregated daily D1 rows.
// This route does not fetch Cloudflare API itself and stores no API token.
interface Env {MINGEAGLE_DB?:D1Database}
type Daily={date_utc:string;provider_visits:number;sampled_pageviews:number;fetched_at:string};
const periods=new Set([0,30,90,365]);
const reply=(v:Record<string,unknown>,status=200)=>Response.json(v,{status,headers:{'cache-control':'private, no-store'}});
export const onRequestGet:PagesFunction<Env>=async({request,env})=>{
 const db=env.MINGEAGLE_DB;if(!db)return reply({ok:false,error:'CRM database not available'},503);
 const days=Number(new URL(request.url).searchParams.get('days')??30);
 if(!Number.isInteger(days)||!periods.has(days))return reply({ok:false,error:'Unsupported time window'},400);
 try{
  const query=days===0?
   "SELECT date_utc,provider_visits,sampled_pageviews,fetched_at FROM web_analytics_daily WHERE site_tag=? ORDER BY date_utc DESC LIMIT 365":
   "SELECT date_utc,provider_visits,sampled_pageviews,fetched_at FROM web_analytics_daily WHERE site_tag=? AND date_utc>=date('now','-' || ? || ' days') ORDER BY date_utc DESC LIMIT 365";
  const stmt=db.prepare(query);
  const res=await (days===0?stmt.bind('c229a4f21594480eb5a1381a1b1e67f0'):
    stmt.bind('c229a4f21594480eb5a1381a1b1e67f0',days)).all<Daily>();
  const rows=(res.results||[]).map(r=>({dateUTC:String(r.date_utc),
    providerVisits:Number(r.provider_visits),sampledPageviews:Number(r.sampled_pageviews),
    fetchedAt:String(r.fetched_at)}));
  if(rows.some(r=>!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(r.dateUTC)
    ||![r.providerVisits,r.sampledPageviews].every(n=>Number.isSafeInteger(n)&&n>=0)))
    return reply({ok:false,error:'Provider analytics snapshot invalid'},503);
  return reply({ok:true,source:'Cloudflare Web Analytics GraphQL',
   host:'mingeagle.com',siteId:'c229a4f21594480eb5a1381a1b1e67f0',
   connected:rows.length>0,days,rows,
   coverage:{observedDays:rows.length,fromUTC:rows.length?rows.at(-1)!.dateUTC:null,
     toUTC:rows[0]?.dateUTC||null,latestFetchUTC:rows[0]?.fetchedAt||null},
   caveats:[
    'Cloudflare Web Analytics is browser beacon measurement; visits are provider-reported estimates, not verified unique persons.',
    'Snapshots may be sampled and affected by blockers; do not treat event count as total audience.',
    'Only dates returned by the source and synchronized are shown. Missing days are unknown, not zero.',
    'The initial tracking day is partial; collection began 2026-10-12 17:xx UTC.',
    'Website visit measurement and inquiry creation are different datasets with differing coverage and attribution. No visitor-to-inquiry conversion is inferred.'
   ]});
 }catch{return reply({ok:false,error:'Analytics snapshot unavailable; migration or D1 read may be missing'},503)}
};
