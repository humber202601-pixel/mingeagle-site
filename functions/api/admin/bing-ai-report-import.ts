import publicUrls from '../../../data/ai-discovery-public-urls.json';
// Staff-attested exports, not authenticated Microsoft API results. Admin middleware
// guards both handlers. Never merge page totals and grounding-query totals.
interface Env {MINGEAGLE_DB?:D1Database}
type Kind='PAGES'|'GROUNDING_QUERIES';
type Entry={dimension:string;citations:number};
type Import={id:string;kind:Kind;start_date:string;end_date:string;source:string;row_count:number;created_at:string};
type Row={dimension:string;citations:number};
const privateHeaders={'cache-control':'private, no-store'};
const reply=(body:Record<string,unknown>,status=200)=>Response.json(body,{status,headers:privateHeaders});
const whitelist=new Set(publicUrls.urls.map(s=>new URL(s).pathname));
const isoDay=(v:unknown):v is string=>{
 if(typeof v!=='string'||!/^20\d\d-\d\d-\d\d$/.test(v))return false;
 const ms=Date.parse(v+'T00:00:00Z');
 return Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,10)===v;
};
function publicPage(value:unknown):boolean{
 if(typeof value!=='string'||value.length>500)return false;
 try{
  const u=new URL(value);
  return u.protocol==='https:'&&['www.mingeagle.com','mingeagle.com'].includes(u.hostname)&&
   !u.username&&!u.password&&!u.port&&!u.search&&!u.hash&&whitelist.has(u.pathname);
 }catch{return false}
}
function safeGroundingPhrase(value:unknown):boolean{
 if(typeof value!=='string'||value.length<2||value.length>160||value!==value.trim())return false;
 // Grounding queries are grouped search phrases, not customer searches, contacts or transcripts.
 return !/[<>\r\n@]/.test(value)&&!/https?:\/\/|www\./i.test(value)&&!/(?:\+?\d[\s().-]*){9,}/.test(value);
}
export const onRequestGet:PagesFunction<Env>=async({env})=>{
 const db=env.MINGEAGLE_DB;if(!db)return reply({ok:false,error:'Database unavailable'},503);
 try{
  const snapshots=await db.prepare(`SELECT id,kind,start_date,end_date,source,row_count,created_at
   FROM bing_ai_manual_imports ORDER BY created_at DESC,rowid DESC LIMIT 12`).all<Import>();
  const imports=snapshots.results||[];
  const latest:Record<string,unknown>={};
  for(const kind of ['PAGES','GROUNDING_QUERIES'] as const){
   const top=await db.prepare(`SELECT id,kind,start_date,end_date,source,row_count,created_at
    FROM bing_ai_manual_imports WHERE kind=? ORDER BY created_at DESC,rowid DESC LIMIT 1`).bind(kind).first<Import>();
   if(!top){latest[kind]={snapshot:null,rows:[]};continue}
   const result=await db.prepare(`SELECT dimension,citations FROM bing_ai_manual_rows
    WHERE import_id=? ORDER BY citations DESC,dimension ASC LIMIT 100`).bind(top.id).all<Row>();
   latest[kind]={snapshot:top,rows:result.results||[]};
  }
  return reply({ok:true,source:'OPERATOR_ATTESTED_BING_CSV',bingApiAuthenticated:false,
   imports,latest,caveat:'Uploaded exports are not authenticated via Bing API; independent Bing site/API connection is required. Page and grounding query reports are separate sampled views and must not be added together. Citations are not clicks, visitors, rankings or sales.'});
 }catch{return reply({ok:false,error:'Bing AI manual report data unavailable; do not infer zero citations'},503)}
};
export const onRequestPost:PagesFunction<Env>=async({env,request})=>{
 const db=env.MINGEAGLE_DB;if(!db)return reply({ok:false,error:'Database unavailable'},503);
 const origin=request.headers.get('origin');
 if(origin&&origin!==new URL(request.url).origin)return reply({ok:false,error:'Cross-origin report import rejected'},403);
 let v:Record<string,unknown>;
 try{v=await request.json();if(!v||typeof v!=='object'||Array.isArray(v))return reply({ok:false,error:'Invalid body'},400)}
 catch{return reply({ok:false,error:'Invalid JSON'},400)}
 const kind=v.kind,start=v.startDate,end=v.endDate,rows=v.rows;
 if(kind!=='PAGES'&&kind!=='GROUNDING_QUERIES')return reply({ok:false,error:'Invalid Bing report kind'},400);
 if(!isoDay(start)||!isoDay(end)||start>end||end>new Date().toISOString().slice(0,10))
  return reply({ok:false,error:'Invalid published report dates'},400);
 if(v.manualConfirmation!==true)return reply({ok:false,error:'Confirm this file was exported from the owned Bing Webmaster AI Performance dashboard'},400);
 if(!Array.isArray(rows)||rows.length<1||rows.length>1000)return reply({ok:false,error:'Import must contain 1–1000 rows'},400);
 const parsed:Entry[]=[];const known=new Set<string>();
 for(const raw of rows){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return reply({ok:false,error:'Invalid row'},400);
  const item=raw as Record<string,unknown>,dimension=item.dimension,citations=item.citations;
  if(typeof dimension!=='string'||typeof citations!=='number'||!Number.isSafeInteger(citations)||citations<0||citations>1000000000)
   return reply({ok:false,error:'Invalid citation metric, cannot convert blank to zero'},400);
  if(kind==='PAGES'?!publicPage(dimension):!safeGroundingPhrase(dimension))
   return reply({ok:false,error:'Only known public site pages or short non-personal Bing grounding phrases may be imported'},400);
  if(known.has(dimension))return reply({ok:false,error:'Duplicate row would double-count citations'},400);
  known.add(dimension);parsed.push({dimension,citations});
 }
 try{
  const id=crypto.randomUUID(),items=[
   db.prepare('INSERT INTO bing_ai_manual_imports(id,kind,start_date,end_date,row_count) VALUES (?,?,?,?,?)')
    .bind(id,kind,start,end,parsed.length),
   ...parsed.map(r=>db.prepare('INSERT INTO bing_ai_manual_rows(import_id,dimension,citations) VALUES (?,?,?)')
    .bind(id,r.dimension,r.citations))
  ];
  await db.batch(items);
  return reply({ok:true,importId:id,rowCount:parsed.length,source:'OPERATOR_ATTESTED_BING_CSV',bingApiAuthenticated:false});
 }catch{return reply({ok:false,error:'Unable to save Bing manual CSV snapshot'},503)}
};
