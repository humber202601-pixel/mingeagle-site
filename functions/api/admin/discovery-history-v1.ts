import {ensureHistory,historyPreview,clearHistory,restoreHistory} from '../../../lib/discovery-history';
interface Env{MINGEAGLE_DB:D1Database}
const json=(data:Record<string,unknown>,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store'}});
export const onRequestGet:PagesFunction<Env>=async({env})=>{
  if(!env.MINGEAGLE_DB)return json({ok:false,error:'Database is not configured.'},503);
  await ensureHistory(env.MINGEAGLE_DB);return json({ok:true,...await historyPreview(env.MINGEAGLE_DB)});
};
export const onRequestPost:PagesFunction<Env>=async({request,env})=>{
  if(!env.MINGEAGLE_DB)return json({ok:false,error:'Database is not configured.'},503);
  try{
    await ensureHistory(env.MINGEAGLE_DB);const input=await request.json() as Record<string,unknown>;
    if(input.action==='CLEAR')return json({ok:true,...await clearHistory(env.MINGEAGLE_DB)});
    if(input.action==='RESTORE')return json({ok:true,...await restoreHistory(env.MINGEAGLE_DB,String(input.archiveId||''))});
    return json({ok:false,error:'不支持的历史记录操作。'},400);
  }catch(e){return json({ok:false,error:e instanceof Error?e.message:'历史记录操作失败。'},409);}
};
