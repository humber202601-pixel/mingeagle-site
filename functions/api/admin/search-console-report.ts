// Admin-only Search Console snapshots. Each ranking uses one imported report,
// never a synthetic or live search metric.
interface Env { MINGEAGLE_DB?:D1Database }
type R=Record<string,unknown>;
export const onRequestGet:PagesFunction<Env>=async({request,env})=>{
 const db=env.MINGEAGLE_DB;
 if(!db)return Response.json({ok:false,error:'Database unavailable'},{status:503});
 const kind=new URL(request.url).searchParams.get('kind')||'queries';
 if(kind!=='queries'&&kind!=='pages')return Response.json({ok:false,error:'Unknown report type'},{status:400});
 try{
 const imported=await db.prepare("SELECT id,property,kind,start_date,end_date,imported_at,row_count FROM search_console_imports WHERE kind=? ORDER BY imported_at DESC,id DESC LIMIT 1").bind(kind).first<R>();
 if(!imported)return Response.json({ok:true,kind,imported:null,summary:null,rows:[],live:false},{headers:{'cache-control':'no-store'}});
 const data=await db.prepare("SELECT dimension,clicks,impressions,ctr,position FROM search_console_rows WHERE import_id=? ORDER BY impressions DESC,clicks DESC LIMIT 100").bind(imported.id).all<R>();
 const rows=data.results.map(r=>({dimension:String(r.dimension),clicks:Number(r.clicks),impressions:Number(r.impressions),ctr:Number(r.ctr),position:Number(r.position)}));
 return Response.json({ok:true,kind,imported,rows,live:false,summary:{
  displayedRows:rows.length,
  displayedImpressionsSum:rows.reduce((n,r)=>n+r.impressions,0),
  displayedClicksSum:rows.reduce((n,r)=>n+r.clicks,0),
  note:'Rows are the leading imported dimensions, not a sitewide total. Search Console can attribute the same search impression to multiple dimensions.'
 }},{headers:{'cache-control':'no-store'}});
 }catch(e){console.error('search_console_report_unavailable',e);return Response.json({ok:false,error:'Import report unavailable'},{status:503})}
};
