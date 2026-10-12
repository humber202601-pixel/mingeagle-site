// Read-only admin GSC performance snapshots; sitewide date rows only.
// Never merges these Pacific-time dates with Cloudflare UTC visits into conversion ratios.
interface Env {MINGEAGLE_DB?:D1Database}
type R={date_pacific:string;clicks:number;impressions:number;ctr:number;average_position:number;fetched_at:string};
const valid=new Set([0,30,90,365]);
const reply=(data:Record<string,unknown>,status=200)=>Response.json(data,{status,headers:{'cache-control':'private, no-store'}});
export const onRequestGet:PagesFunction<Env>=async({request,env})=>{
 if(!env.MINGEAGLE_DB)return reply({ok:false,error:'Database not configured'},503);
 const days=Number(new URL(request.url).searchParams.get('days')??30);
 if(!Number.isSafeInteger(days)||!valid.has(days))return reply({ok:false,error:'Unsupported search analytics period'},400);
 try{
  const sql=days===0?"SELECT date_pacific,clicks,impressions,ctr,average_position,fetched_at FROM gsc_search_daily WHERE property=? ORDER BY date_pacific DESC LIMIT 365":
   "SELECT date_pacific,clicks,impressions,ctr,average_position,fetched_at FROM gsc_search_daily WHERE property=? AND date_pacific>=date('now','-'||?||' days') ORDER BY date_pacific DESC LIMIT 365";
  const p=env.MINGEAGLE_DB.prepare(sql);
  const d=await (days===0?p.bind('sc-domain:mingeagle.com'):p.bind('sc-domain:mingeagle.com',days)).all<R>();
  const rows=(d.results||[]).map(r=>({datePacific:String(r.date_pacific),clicks:Number(r.clicks),impressions:Number(r.impressions),ctr:Number(r.ctr),averagePosition:Number(r.average_position),fetchedAt:String(r.fetched_at)}));
  if(rows.some(r=>!/^20\d\d-\d\d-\d\d$/.test(r.datePacific)||
    !Number.isSafeInteger(r.clicks)||!Number.isSafeInteger(r.impressions)||r.clicks<0||r.impressions<0||r.clicks>r.impressions||
    !Number.isFinite(r.ctr)||r.ctr<0||r.ctr>1||!Number.isFinite(r.averagePosition)||r.averagePosition<0))
    return reply({ok:false,error:'Source snapshot invalid'},503);
  return reply({ok:true,source:'Google Search Console API',property:'sc-domain:mingeagle.com',timezone:'America/Los_Angeles',connected:rows.length>0,days,rows,
   coverage:{observedDays:rows.length,from:rows.at(-1)?.datePacific||null,to:rows[0]?.datePacific||null,lastFetchedAt:rows[0]?.fetchedAt||null},
   caveats:['Search Console report dates are America/Los_Angeles days and are usually delayed; they are not live traffic.',
    'Missing dates are unknown, not assumed to have zero impressions.',
    'Sitewide search impressions are not visits, users or an attributable conversion funnel.']});
 }catch{return reply({ok:false,error:'Search Console daily snapshots unavailable'},503)}
};
