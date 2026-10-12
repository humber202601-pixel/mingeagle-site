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
  return 'query {viewer {accounts(filter:{accountTag:"'+ACCOUNT+'"}) {'+
   'rumPageloadEventsAdaptiveGroups(limit:'+LIMIT+',filter:{siteTag:"'+TAG+'",'+
   'datetime_geq:"'+w.from+'",datetime_lt:"'+w.to+'"}) {'+
   'count dimensions {date requestHost} sum {visits}}}}}';
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
  const rows=dailyRows(accounts[0]?.rumPageloadEventsAdaptiveGroups,w);
  let written=0;
  for(const r of rows){
    // Single D1 table, strict site-tag provenance and date-key idempotency.
    const sql=['INSERT INTO web_analytics_daily',
      '(date_utc,site_tag,host,provider_visits,sampled_pageviews,source,fetched_at)',
      "VALUES (?,?,'mingeagle.com',?,?,'CLOUDFLARE_RUM_GRAPHQL',CURRENT_TIMESTAMP)",
      'ON CONFLICT(date_utc) DO UPDATE SET provider_visits=excluded.provider_visits,',
      'sampled_pageviews=excluded.sampled_pageviews,fetched_at=CURRENT_TIMESTAMP',
      'WHERE web_analytics_daily.site_tag=excluded.site_tag',
      'AND web_analytics_daily.host=excluded.host',
      'AND web_analytics_daily.source=excluded.source'].join(' ');
    const result=await env.MINGEAGLE_DB.prepare(sql).bind(r.date,TAG,r.visits,r.sampledPageviews).run();
    if(result?.success===false)throw Error('D1 write failed');
    written++;
  }
  return {providerDates:rows.length,written,checkedCompleteDays:DAYS};
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