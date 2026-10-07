import { parseSearch, SCHOOL_TYPES } from '../../../shared/discovery';
import { ensureRuns } from '../../../lib/discovery';

interface Env { MINGEAGLE_DB:D1Database; GEOAPIFY_API_KEY?:string }
type Result={ok?:boolean;found?:number;error?:string;checked?:number;verified?:number;note?:string;rawCount?:number;websiteChecked?:number};
const RELEASE='DISCOVERY_V13_1_QUALIFIED_BUYERS_2026-10-07';
const response=(body:Record<string,unknown>,status=200)=>Response.json({...body,release:RELEASE},{status,headers:{'cache-control':'no-store'}});
async function callSource(request:Request,path:string,body:Record<string,unknown>,timeout:number):Promise<Result>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const r=await fetch(new URL(path,request.url),{method:'POST',headers:{
      'content-type':'application/json','x-admin-key':request.headers.get('x-admin-key')||'',
      'user-agent':'MING-EAGLE-Discovery/13.0'},body:JSON.stringify(body),signal:controller.signal});
    const result=await r.json() as Result;
    if(!r.ok||!result.ok)throw new Error(result.error||`HTTP ${r.status}`);
    return result;
  }finally{clearTimeout(timer)}
}
export const onRequestPost:PagesFunction<Env>=async({request,env})=>{
  if(!env.MINGEAGLE_DB)return response({ok:false,error:'Database is not configured.'},503);
  let parsed;
  try{parsed=parseSearch(await request.json())}catch(e){return response({ok:false,error:e instanceof Error?e.message:'搜索参数无效。'},400)}
  const db=env.MINGEAGLE_DB,runId=crypto.randomUUID(),started=Date.now();
  try{
    await ensureRuns(db);
    const body={...parsed,runId};
    const school=SCHOOL_TYPES.has(parsed.customerType);
    const configs=school?[['school','/api/admin/discovery-school-v1',40000] as const]:
      [['geoapify','/api/admin/discovery-geoapify-v1',36000] as const,['web','/api/admin/discovery-web-v6',40000] as const];
    const results=await Promise.allSettled(configs.map(([,path,time])=>callSource(request,path,body,time)));
    const sources:Record<string,boolean>={},sourceNotes:string[]=[],errors:Record<string,string>={};
    results.forEach((r,i)=>{
      const name=configs[i][0];sources[name]=r.status==='fulfilled';
      if(r.status==='fulfilled'){if(r.value.note)sourceNotes.push(r.value.note)}
      else{errors[name]=r.reason instanceof Error?r.reason.message:String(r.reason)}
    });
    const any=Object.values(sources).some(Boolean);
    if(!any)return response({ok:false,runId,partial:true,sources,errors,error:'发现源本次未成功，请查看来源状态并重试。已保存的结果仍可在候选库查看。'},502);
    const summary=await db.prepare(`SELECT COUNT(*) AS found,COALESCE(SUM(r.was_created),0) AS added,
      COUNT(*)-COALESCE(SUM(r.was_created),0) AS updated,
      COALESCE(SUM(CASE WHEN c.status='NEW' AND c.lead_score>=80
      AND (NULLIF(c.email,'') IS NOT NULL OR NULLIF(c.phone,'') IS NOT NULL OR NULLIF(c.whatsapp,'') IS NOT NULL)
      THEN 1 ELSE 0 END),0) AS ready
      FROM discovery_run_candidates r JOIN discovery_candidates c ON c.id=r.candidate_id
      WHERE r.run_id=? AND c.status<>'IGNORED'`).bind(runId).first<Record<string,number>>();
    const geo=results.find((_,i)=>configs[i][0]===(school?'school':'geoapify'));
    const web=results.find((_,i)=>configs[i][0]==='web');
    return response({ok:any,runId,...summary,partial:Object.keys(errors).length>0,sources,errors,
      nextRound:parsed.round+1,geoapifyConfigured:Boolean(env.GEOAPIFY_API_KEY),elapsedMs:Date.now()-started,
      geoFound:geo?.status==='fulfilled'?geo.value.found||0:0,
      webFound:web?.status==='fulfilled'?web.value.found||0:0,
      note:sourceNotes.join(' '),
      ...(any?{}:{error:'发现源本次未成功，请查看来源状态并重试。已保存的结果仍可在候选库查看。'})},any?200:502);
  }catch(e){
    console.error('discovery_v13_failed',e);
    return response({ok:false,error:'客户发现暂时无法完成，请重试。'},500);
  }
};
