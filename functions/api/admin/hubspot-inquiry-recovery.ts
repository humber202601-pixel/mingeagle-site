import {receiveRecoveredInquiry} from '../inquiries';
import {FORM_PAGE_LIMIT,MINGEAGLE_HUBSPOT_FORM_ID,parseHubspotSubmission,type HubspotSubmission} from '../../../lib/hubspot-form-recovery';

interface Env{MINGEAGLE_DB:D1Database;HUBSPOT_PRIVATE_APP_TOKEN?:string;}
type State={offset:number};
const status=(body:Record<string,unknown>,code=200)=>Response.json(body,{status:code,headers:{'cache-control':'no-store'}});
// Protected by /api/admin/_middleware. Only this private endpoint may fetch
// HubSpot submissions; API credentials never appear in site JS or responses.
export const onRequestPost:PagesFunction<Env>=async({request,env})=>{
  if(!env.MINGEAGLE_DB)return status({ok:false,error:'Database is not configured.'},503);
  if(!env.HUBSPOT_PRIVATE_APP_TOKEN)return status({ok:true,configured:false,disabled:true,reason:'HUBSPOT_PRIVATE_APP_TOKEN not configured'});
  const body=await request.json().catch(()=>({})) as {action?:string};
  if(body.action!=='SYNC')return status({ok:false,error:'Unsupported operation.'},400);
  const db=env.MINGEAGLE_DB;
  try{
    await db.prepare(`CREATE TABLE IF NOT EXISTS hubspot_inquiry_recovery_state(
      id TEXT PRIMARY KEY,offset INTEGER NOT NULL DEFAULT 0,
      imported_total INTEGER NOT NULL DEFAULT 0,last_synced_at TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
    await db.prepare(`INSERT OR IGNORE INTO hubspot_inquiry_recovery_state(id,offset)
      VALUES('public-form',0)`).run();
    const row=await db.prepare(`SELECT offset FROM hubspot_inquiry_recovery_state
      WHERE id='public-form'`).first<State>();
    const offset=Math.max(0,Math.min(Number(row?.offset||0),100000));
    const url=new URL('https://api.hubapi.com/form-integrations/v1/submissions/forms/'+MINGEAGLE_HUBSPOT_FORM_ID);
    url.searchParams.set('limit',String(FORM_PAGE_LIMIT));
    url.searchParams.set('offset',String(offset));
    const response=await fetch(url.toString(),{
      headers:{Authorization:'Bearer '+env.HUBSPOT_PRIVATE_APP_TOKEN,Accept:'application/json'},
      signal:AbortSignal.timeout(12000)});
    if(!response.ok)return status({ok:false,error:'HubSpot form read failed',providerStatus:response.status},502);
    const page=await response.json() as {results?:HubspotSubmission[];hasMore?:boolean;offset?:number};
    if(!Array.isArray(page.results))return status({ok:false,error:'Unexpected HubSpot submission response.'},502);
    const submissions=page.results.slice(0,FORM_PAGE_LIMIT);
    let imported=0,reused=0,skipped=0;
    for(const submission of submissions){
      const input=parseHubspotSubmission(submission);
      if(!input){skipped++;continue}
      const result=await receiveRecoveredInquiry(env,input);
      if(!result.ok)return status({ok:false,error:'CRM recovery item failed; cursor unchanged for safe retry.',status:result.status},502);
      const item=await result.json() as {ok?:boolean;idempotent?:boolean;inquiryId?:string;leadId?:string};
      if(!item.ok||!item.inquiryId||!item.leadId)return status({ok:false,error:'CRM recovery not confirmed; cursor unchanged.'},502);
      if(item.idempotent)reused++;else imported++;
    }
    // Advance only after every item has succeeded or been verified unrelated.
    // HubSpot's submissions API is offset-paged. Re-scan from 0 after a full pass
    // to pick up new submissions without keeping any customer PII in state.
    const hasMore=Boolean(page.hasMore)&&submissions.length>0;
    const nextOffset=hasMore?offset+submissions.length:0;
    await db.prepare(`UPDATE hubspot_inquiry_recovery_state SET
      offset=?,imported_total=imported_total+?,last_synced_at=CURRENT_TIMESTAMP,
      updated_at=CURRENT_TIMESTAMP WHERE id='public-form'`)
      .bind(nextOffset,imported).run();
    return status({ok:true,configured:true,processed:submissions.length,imported,
      reused,skipped,hasMore,nextOffset});
  }catch(error){
    console.error('hubspot_recovery_failed',error);
    return status({ok:false,error:'HubSpot recovery is temporarily unavailable; cursor preserved.'},503);
  }
};
