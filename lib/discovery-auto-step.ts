import { COMMERCIAL_TYPES,STATE_NAMES } from '../shared/discovery';
import { allowedWebsite,bing,verifyHit } from '../functions/api/admin/discovery-web-v6';
import { clueMatches } from '../functions/api/admin/discovery-sources-v1';
import { detailsGeo,extractGeoContact,verifySchoolWebsite } from '../functions/api/admin/discovery-school-v1';
import { addToCrm } from '../functions/api/admin/discovery';
import { syncCrm } from '../functions/api/admin/discovery-enrich';
import { assertAutoLease,autoApi,AutoStepError,type AutoRow as Row } from './discovery-auto-support';
import type { AutoEnv } from './discovery-auto';
const clean=(v:unknown,max=1000)=>String(v??'').trim().slice(0,max);
export type StepResult=Row&{continue?:boolean;payload?:Row;review?:boolean};
export async function runAutoStep(env:AutoEnv,base:string,key:string,input:Row):Promise<StepResult>{
  const db=env.MINGEAGLE_DB,runId=clean(input.autoRunId),kind=clean(input.kind),id=clean(input.itemKey);
  await assertAutoLease(db,input);
  const task=await db.prepare(`SELECT payload_json FROM discovery_auto_items WHERE run_id=? AND kind=? AND item_key=? AND status='PROCESSING' AND claim_token=?`).bind(runId,kind,id,clean(input.autoToken)).first<{payload_json:string}>();
  if(!task)throw new AutoStepError('此工作项已完成或被接替。');
  const payload=JSON.parse(task.payload_json) as Row;
  const run=await db.prepare(`SELECT scope_json FROM discovery_auto_runs WHERE id=?`).bind(runId).first<{scope_json:string}>();
  if(!run)throw new AutoStepError('任务已不存在。');const scope=JSON.parse(run.scope_json) as Row;
  const guard=()=>assertAutoLease(db,input),again=(next:Row):StepResult=>({continue:true,payload:{...payload,...next}});
  if(kind==='SOURCE'){
    const source=clean(payload.source),path=source==='CORE'?(COMMERCIAL_TYPES.has(clean(scope.customerType))?'discovery-web-v6':'discovery-school-v1'):'discovery-sources-v1';
    const result=await autoApi(base,key,path,{...scope,round:payload.round,runId,autoSourceOnly:source==='CORE',action:'SEARCH',sources:[source],autoRunId:runId,autoToken:input.autoToken});
    await guard();const states=result.sources as Record<string,Row>|undefined;
    if(states?.[source]?.partial)throw new AutoStepError(clean(states[source].note)||'来源部分未完成。',true);
    return {found:result.found||states?.[source]?.found||0,note:result.note||states?.[source]?.note};
  }
  const table=kind==='CLUE'?'discovery_clues':'discovery_candidates';
  const row=await db.prepare(`SELECT * FROM ${table} WHERE id=?`).bind(id).first<Row>();
  if(!row)throw new AutoStepError('线索或候选记录已不存在。');
  if(row.status==='IGNORED')return {skipped:true,reason:'已忽略记录保持原状态'};
  if(kind==='CLUE'&&row.status==='CONVERTED'&&row.candidate_id)return {candidateId:row.candidate_id};
  let stage=clean(payload.stage);
  if(!stage){
    if(kind==='CLUE')stage=row.source_provider==='SCHOOL_GEOAPIFY'&&!allowedWebsite(clean(row.website))?'DETAIL':'LOOKUP';
    else stage=row.source_provider==='GEOAPIFY_SCHOOL_V1'||!allowedWebsite(clean(row.website))?'LOOKUP':'ENRICH';
  }
  if(stage==='DETAIL'){
    const raw=JSON.parse(clean(row.raw_json)||'{}') as Row;
    if(!raw.placeId||!env.GEOAPIFY_API_KEY)return again({stage:'LOOKUP'});
    const details=await detailsGeo(env.GEOAPIFY_API_KEY,clean(raw.placeId,300));await guard();
    const geo=extractGeoContact(details);
    if(allowedWebsite(geo.website))await db.prepare(`UPDATE discovery_clues SET website=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='PENDING'`).bind(geo.website,id).run();
    return again({stage:'LOOKUP'});
  }
  if(stage==='LOOKUP'){
    const name=clean(row.title||row.name,200),websites:string[]=[];
    if(allowedWebsite(clean(row.website)))websites.push(clean(row.website));
    if(kind==='CLUE'&&row.source_provider==='DIRECTORY'&&allowedWebsite(clean(row.source_url)))websites.push(clean(row.source_url));
    if(!websites.length){const hits=await bing(`"${name}" ${clean(row.city,80)} ${STATE_NAMES[clean(row.state_region)]||clean(row.state_region,30)} official website`,clean(row.city,80));await guard();for(const hit of hits)if(clueMatches(hit.title,name))websites.push(hit.url);}
    if(!websites.length)return {review:true,reason:'公开索引尚未提供可核验官网，记录保留待核验。'};
    return again({stage:'VERIFY',websites:[...new Set(websites)].slice(0,2),websiteIndex:0});
  }
  if(stage==='VERIFY'){
    const websites=payload.websites as string[]||[],index=Number(payload.websiteIndex||0),website=websites[index];
    if(!website)return {review:true,reason:'未找到名称、业务和地区均可核验的官网，记录保留待核验。'};
    if(kind==='CLUE'){
      try{const verified=await autoApi(base,key,'discovery-sources-v1',{action:'VERIFY',clueId:id,website,autoRunId:runId,autoToken:input.autoToken});await guard();return {candidateId:verified.candidateId,name:verified.name};}
      catch(e){if(e instanceof AutoStepError&&!e.retryable){await guard();if(index+1<websites.length)return again({websiteIndex:index+1});return {review:true,reason:e.message};}throw e;}
    }
    const verified=COMMERCIAL_TYPES.has(clean(row.customer_type))?await verifyHit({title:clean(row.name),url:website,snippet:'',query:'automatic official website match',city:clean(row.city,80)},clean(row.customer_type),clean(row.state_region)):await verifySchoolWebsite(website,clean(row.customer_type),clean(row.state_region),clean(row.city,80));await guard();
    if(!verified||!clueMatches(verified.orgName,clean(row.name,200))){if(index+1<websites.length)return again({websiteIndex:index+1});return {review:true,reason:'官网无法读取或名称、业务、地区证据不足，记录保留待核验。'};}
    await db.prepare(`UPDATE discovery_candidates SET website=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(website,id).run();
    return again({stage:'ENRICH'});
  }
  const domain=new URL(clean(row.website)).hostname.toLowerCase().replace(/^www\./,'');
  const exclusion=await db.prepare(`SELECT l.id FROM leads l JOIN companies c ON c.id=l.company_id LEFT JOIN contacts ct ON ct.id=l.primary_contact_id WHERE c.domain=? AND (l.status IN ('DO_NOT_CONTACT','NOT_INTERESTED','NOT_FIT') OR ct.do_not_contact=1) LIMIT 1`).bind(domain).first();
  if(exclusion)return {skipped:true,reason:'保留不联系 / 不匹配客户的既有状态'};
  if(stage==='ENRICH'){
    await autoApi(base,key,'discovery-enrich-v2',{candidateId:id,skipSync:true,autoRunId:runId,autoToken:input.autoToken});await guard();return again({stage:'IMPORT'});
  }
  if(stage!=='IMPORT')throw new AutoStepError('工作步骤无效。');
  if(row.enrichment_status!=='COMPLETED')return again({stage:'ENRICH'});
  await guard();const imported=await addToCrm(db,id);await guard();await syncCrm(db,id);await guard();
  const lead=await db.prepare(`SELECT primary_contact_id FROM leads WHERE id=?`).bind(imported.leadId).first<{primary_contact_id:string}>();
  if(lead?.primary_contact_id)await db.prepare(`UPDATE contacts SET facebook_url=COALESCE(NULLIF(facebook_url,''),?),tiktok_url=COALESCE(NULLIF(tiktok_url,''),?) WHERE id=?`).bind(row.facebook_url||null,row.tiktok_url||null,lead.primary_contact_id).run();
  for(const [field,value] of [['facebook',row.facebook_url],['tiktok',row.tiktok_url]])if(value){await guard();await db.prepare(`INSERT INTO lead_evidence(id,lead_id,field_name,value,source_url,evidence_text,confidence) SELECT ?,?,?,?,?, 'Official website public social link',85 WHERE NOT EXISTS(SELECT 1 FROM lead_evidence WHERE lead_id=? AND field_name=? AND value=?)`).bind(crypto.randomUUID(),imported.leadId,field,value,row.website_contact_url||row.website,imported.leadId,field,value).run();}
  const missing=[['联系人','contact_person_name'],['邮箱','email'],['电话','phone'],['WhatsApp','whatsapp']].filter(([,field])=>!row[field]).map(([label])=>label);
  return {...imported,name:row.name,missing};
}
