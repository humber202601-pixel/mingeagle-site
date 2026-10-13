import benchmark from '../../../data/ai-discovery-benchmark.json';
// Admin route is protected by functions/api/admin/_middleware.ts.
// Human-attested observations are not official platform analytics or proof of all users' answers.
interface Env {MINGEAGLE_DB?:D1Database}
type Platform='CHATGPT'|'GEMINI'|'COPILOT'|'PERPLEXITY'|'CLAUDE';
type Mode='WEB_SEARCH'|'STANDARD';
type Status='CITED'|'MENTIONED_NO_LINK'|'NOT_MENTIONED'|'UNAVAILABLE';
type Observation={prompt_id:string;platform:Platform;test_mode:Mode;status:Status;cited_url:string|null;tested_at:string};
const platforms=['CHATGPT','GEMINI','COPILOT','PERPLEXITY','CLAUDE'] as const;
const modes=['WEB_SEARCH','STANDARD'] as const;
const statuses=['CITED','MENTIONED_NO_LINK','NOT_MENTIONED','UNAVAILABLE'] as const;
const approvedPrompts=new Set(benchmark.prompts.map(p=>p.id));
const approvedUrls=new Set(['https://www.mingeagle.com/',...benchmark.prompts.map(p=>p.targetUrl)]);
const headers={'cache-control':'private, no-store'};
const send=(data:Record<string,unknown>,status=200)=>Response.json(data,{status,headers});
function publicCitation(input:unknown):string|null{
 if(typeof input!=='string'||input.length>600)return null;
 try{
  const url=new URL(input);
  if(url.protocol!=='https:'||url.hostname!=='www.mingeagle.com'||url.username||url.password||url.port||url.search||url.hash)return null;
  return approvedUrls.has(url.href)?url.href:null;
 }catch{return null}
}
function summary(rows:Observation[],mode:Mode){
 const subset=rows.filter(x=>x.test_mode===mode);
 const counts={CITED:0,MENTIONED_NO_LINK:0,NOT_MENTIONED:0,UNAVAILABLE:0};
 for(const row of subset)counts[row.status]++;
 const eligible=counts.CITED+counts.MENTIONED_NO_LINK+counts.NOT_MENTIONED;
 return {observedPairs:subset.length,unmeasuredPairs:benchmark.prompts.length*platforms.length-subset.length,
  counts,eligible,manualCitationRate:eligible>0?counts.CITED/eligible:null};
}
export const onRequestGet:PagesFunction<Env>=async({env})=>{
 const db=env.MINGEAGLE_DB;if(!db)return send({ok:false,error:'Database unavailable'},503);
 try{
  const recent=await db.prepare(`SELECT prompt_id,platform,test_mode,status,cited_url,tested_at FROM
   (SELECT prompt_id,platform,test_mode,status,cited_url,tested_at,
     ROW_NUMBER() OVER(PARTITION BY prompt_id,platform,test_mode ORDER BY tested_at DESC,id DESC) AS rn
    FROM ai_visibility_observations) WHERE rn=1
   ORDER BY tested_at DESC,prompt_id,platform LIMIT 240`).all<Observation>();
  const rows=recent.results||[];
  if(!Array.isArray(rows)||rows.length>240)return send({ok:false,error:'Invalid audit data'},503);
  return send({ok:true,source:'STAFF_ATTESTED_MANUAL_AI_REVIEW',officialPlatformReport:false,
   benchmarkVersion:benchmark.version,prompts:benchmark.prompts,platforms,
   modes,snapshots:rows,
   summary:{WEB_SEARCH:summary(rows,'WEB_SEARCH'),STANDARD:summary(rows,'STANDARD')},
   caveat:'This dashboard records operator-attested snapshots, not automated AI citations or guaranteed organic referrals. No observations means NOT MEASURED, never 0 visits or 0 recommendations.'});
 }catch{return send({ok:false,error:'AI visibility audit data unavailable; do not assume zero citations'},503)}
};
export const onRequestPost:PagesFunction<Env>=async({env,request})=>{
 const db=env.MINGEAGLE_DB;if(!db)return send({ok:false,error:'Database unavailable'},503);
 const origin=request.headers.get('origin');
 if(origin&&origin!==new URL(request.url).origin)return send({ok:false,error:'Cross-origin review is not allowed'},403);
 let input:Record<string,unknown>;
 try{
  input=await request.json();
  if(!input||typeof input!=='object'||Array.isArray(input))return send({ok:false,error:'Invalid review'},400);
 }catch{return send({ok:false,error:'Invalid JSON'},400)}
 const promptId=input.promptId,platform=input.platform,testMode=input.testMode,status=input.status;
 if(input.manualConfirmation!==true)return send({ok:false,error:'A human must attest to seeing the actual platform response'},400);
 if(typeof promptId!=='string'||!approvedPrompts.has(promptId)||
    !platforms.includes(platform as Platform)||!modes.includes(testMode as Mode)||!statuses.includes(status as Status))
   return send({ok:false,error:'Invalid benchmark prompt, platform, mode, or observation'},400);
 const citedUrl=status==='CITED'?publicCitation(input.citedUrl):null;
 if(status==='CITED'&&!citedUrl)return send({ok:false,error:'A cited result needs a direct, public HTTPS MING EAGLE benchmark URL without tracking or secret parameters'},400);
 if(status!=='CITED'&&input.citedUrl!==undefined&&input.citedUrl!==null&&input.citedUrl!=='')
   return send({ok:false,error:'Only real linked citations may include a URL'},400);
 try{
  await db.prepare(`INSERT INTO ai_visibility_observations
   (id,prompt_id,platform,test_mode,status,cited_url,method) VALUES (?,?,?,?,?,?,'MANUAL_REVIEW')`)
   .bind(crypto.randomUUID(),promptId,platform,testMode,status,citedUrl).run();
  return send({ok:true,saved:true,source:'STAFF_ATTESTED_MANUAL_AI_REVIEW',
   caveat:'This records one manually verified answer, not official AI-platform citation statistics.'});
 }catch{return send({ok:false,error:'Could not save human AI review'},503)}
};
