interface Env { MINGEAGLE_DB:D1Database }
const cutoff='2026-10-11 00:00:00';
const eligible=`FROM tasks t
  LEFT JOIN companies c ON c.id=t.company_id
  LEFT JOIN leads l ON l.id=t.lead_id
  LEFT JOIN companies lc ON lc.id=l.company_id
  WHERE t.status IN ('OPEN','IN_PROGRESS')
    AND datetime(t.created_at)<datetime(?)
    AND (lower(trim(c.name))='test com' OR lower(trim(lc.name))='test com')`;
export const onRequestGet:PagesFunction<Env>=async({env})=>{
  if(!env.MINGEAGLE_DB)return Response.json({ok:false,error:'Database unavailable'},{status:503});
  try {
    const r=await env.MINGEAGLE_DB.prepare(`SELECT COUNT(DISTINCT t.id) AS count ${eligible}`).bind(cutoff).first<{count:number}>();
    return Response.json({ok:true,count:Number(r?.count||0),scope:'Open or in-progress tasks attached to test com, created before 2026-10-11'});
  }catch(e){console.error('test_task_cleanup_preview_failed',e);return Response.json({ok:false,error:'Preview failed'},{status:500});}
};
export const onRequestPost:PagesFunction<Env>=async({request,env})=>{
  if(!env.MINGEAGLE_DB)return Response.json({ok:false,error:'Database unavailable'},{status:503});
  const input=await request.json().catch(()=>({})) as {confirm?:string};
  if(input.confirm!=='ARCHIVE_TEST_COM_OLD_TASKS')return Response.json({ok:false,error:'Confirmation required'},{status:400});
  try{
    const db=env.MINGEAGLE_DB;
    const result=await db.prepare(`UPDATE tasks SET status='CANCELLED',completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
      WHERE id IN (SELECT DISTINCT t.id ${eligible})`).bind(cutoff).run();
    return Response.json({ok:true,archived:Number(result.meta?.changes||0)});
  }catch(e){console.error('test_task_cleanup_failed',e);return Response.json({ok:false,error:'Archive failed'},{status:500});}
};