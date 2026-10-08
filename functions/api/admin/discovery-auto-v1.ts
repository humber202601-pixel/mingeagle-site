import { ensureAuto,startAuto,advanceAuto,autoSummary,type AutoEnv } from '../../../lib/discovery-auto';
const json=(data:Record<string,unknown>,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store'}});
export const onRequestGet:PagesFunction<AutoEnv>=async({request,env})=>{
  if(!env.MINGEAGLE_DB)return json({ok:false,error:'Database is not configured.'},503);
  await ensureAuto(env.MINGEAGLE_DB);
  return json({ok:true,...await autoSummary(env.MINGEAGLE_DB,new URL(request.url).searchParams.get('runId')||undefined)});
};
export const onRequestPost:PagesFunction<AutoEnv>=async({request,env})=>{
  if(!env.MINGEAGLE_DB)return json({ok:false,error:'Database is not configured.'},503);
  try{
    const db=env.MINGEAGLE_DB;await ensureAuto(db);const input=await request.json() as Record<string,unknown>;
    if(input.action==='START'){const started=await startAuto(db,input);return json({ok:true,...started,...await autoSummary(db,started.runId)});}
    let runId=String(input.runId||'');
    if(input.action==='TICK'){const pending=await db.prepare(`SELECT id FROM discovery_auto_runs WHERE status='RUNNING' ORDER BY created_at LIMIT 1`).first<{id:string}>();if(!pending)return json({ok:true,idle:true});runId=pending.id;}
    if(!runId)return json({ok:false,error:'任务编号不能为空。'},400);
    if(input.action==='ADVANCE'||input.action==='TICK')return json({ok:true,...await advanceAuto(env,request.url,request.headers.get('x-admin-key')||'',runId)});
    if(input.action==='PAUSE'||input.action==='RESUME'){
      await db.prepare(`UPDATE discovery_auto_runs SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('RUNNING','PAUSED')`).bind(input.action==='PAUSE'?'PAUSED':'RUNNING',runId).run();
    }else if(input.action==='RETRY'){
      const locked=await db.prepare(`SELECT id FROM discovery_auto_runs WHERE id=? AND lease_until>datetime('now')`).bind(runId).first();
      if(locked)return json({ok:false,error:'当前步骤仍在处理，请稍后重试。'},409);
      await db.batch([db.prepare(`UPDATE discovery_auto_items SET status='PENDING',attempts=0,error=NULL WHERE run_id=? AND status='FAILED'`).bind(runId),db.prepare(`UPDATE discovery_auto_runs SET status='RUNNING',completed_at=NULL,message='正在重试未完成项目' WHERE id=? AND status IN ('PARTIAL','COMPLETED','PAUSED')`).bind(runId)]);
    }else return json({ok:false,error:'不支持的任务操作。'},400);
    return json({ok:true,...await autoSummary(db,runId)});
  }catch(e){return json({ok:false,error:e instanceof Error?e.message:'一键任务暂时无法完成。'},500);}
};
