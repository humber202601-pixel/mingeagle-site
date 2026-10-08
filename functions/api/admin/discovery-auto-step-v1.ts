import { runAutoStep } from '../../../lib/discovery-auto-step';
import { AutoStepError } from '../../../lib/discovery-auto-support';
import type { AutoEnv } from '../../../lib/discovery-auto';
export const onRequestPost:PagesFunction<AutoEnv>=async({request,env})=>{
  if(!env.MINGEAGLE_DB)return Response.json({ok:false,error:'Database is not configured.'},{status:503});
  try{const input=await request.json() as Record<string,unknown>;if(!['SOURCE','CLUE','CANDIDATE'].includes(String(input.kind)))return Response.json({ok:false,error:'工作项类型无效。'},{status:400});return Response.json({ok:true,...await runAutoStep(env,request.url,request.headers.get('x-admin-key')||'',input)},{headers:{'cache-control':'no-store'}});}
  catch(e){return Response.json({ok:false,error:e instanceof Error?e.message:'当前步骤暂时未完成。',retryable:e instanceof AutoStepError?e.retryable:true},{status:e instanceof AutoStepError&&!e.retryable?409:502});}
};
