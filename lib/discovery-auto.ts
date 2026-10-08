import { parseSearch, COMMERCIAL_TYPES, STATE_NAMES } from '../shared/discovery';
import { ensureTables, allowedWebsite, bing } from '../functions/api/admin/discovery-web-v6';
import { ensureClues } from './discovery-sources';
import { clueMatches } from '../functions/api/admin/discovery-sources-v1';
import { addToCrm } from '../functions/api/admin/discovery';
import { syncCrm } from '../functions/api/admin/discovery-enrich';

export interface AutoEnv { MINGEAGLE_DB:D1Database; GEOAPIFY_API_KEY?:string }
type Row=Record<string,unknown>;
type Scope=ReturnType<typeof parseSearch> & {batches:number};
type Item={run_id:string;kind:string;item_key:string;payload_json:string;attempts:number};
const clean=(v:unknown,max=1000)=>String(v??'').trim().slice(0,max);

export async function ensureAuto(db:D1Database){
  await ensureTables(db);await ensureClues(db);
  for(const [table,fields] of [['discovery_candidates',['tiktok_url']],['contacts',['facebook_url','tiktok_url']]] as const){
    const info=await db.prepare(`PRAGMA table_info(${table})`).all<{name:string}>();
    for(const field of fields)if(!info.results.some(row=>row.name===field)){
      try{await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${field} TEXT`).run();}catch(e){const now=await db.prepare(`PRAGMA table_info(${table})`).all<{name:string}>();if(!now.results.some(row=>row.name===field))throw e;}
    }
  }
  await db.prepare(`CREATE TABLE IF NOT EXISTS discovery_auto_runs (
    id TEXT PRIMARY KEY, scope_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'RUNNING',
    phase TEXT NOT NULL DEFAULT 'SEARCH', message TEXT, lease_token TEXT, lease_until TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT)`).run();
  await db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_discovery_auto_active ON discovery_auto_runs((1)) WHERE status IN ('RUNNING','PAUSED')`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS discovery_auto_items (
    run_id TEXT NOT NULL, kind TEXT NOT NULL, item_key TEXT NOT NULL, payload_json TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'PENDING', attempts INTEGER NOT NULL DEFAULT 0,
    error TEXT, result_json TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(run_id,kind,item_key))`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_discovery_auto_pending ON discovery_auto_items(run_id,kind,status)`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS discovery_auto_cursors (
    scope_key TEXT PRIMARY KEY, next_round INTEGER NOT NULL DEFAULT 0)`).run();
}

export function autoSources(type:string){
  const base=['CORE','DIRECTORY','FACEBOOK','TIKTOK','INSTAGRAM','LINKEDIN'];
  if(COMMERCIAL_TYPES.has(type))return [...base,'GEOAPIFY','OSM'];
  return [...base,type==='SCHOOL_DISTRICT'?'NCES_DISTRICTS':type==='PRIVATE_CHARTER_SCHOOL'?'NCES_PRIVATE':'NCES'];
}

async function enqueue(db:D1Database,runId:string,kind:string,key:string,payload:Row={}){
  await db.prepare(`INSERT OR IGNORE INTO discovery_auto_items(run_id,kind,item_key,payload_json) VALUES(?,?,?,?)`)
    .bind(runId,kind,key,JSON.stringify(payload)).run();
}

export async function startAuto(db:D1Database,input:Row){
  const parsed=parseSearch(input),batches=Number(input.batches??1);
  if(!Number.isInteger(batches)||batches<1||batches>3)throw new Error('连续批次必须为 1–3。');
  const active=await db.prepare(`SELECT id FROM discovery_auto_runs WHERE status IN ('RUNNING','PAUSED') ORDER BY created_at DESC LIMIT 1`).first<{id:string}>();
  if(active)return {runId:active.id,existing:true};
  const key=[parsed.stateCode,parsed.customerType,parsed.city.toLowerCase()].join('|');
  const cursor=await db.prepare(`SELECT next_round FROM discovery_auto_cursors WHERE scope_key=?`).bind(key).first<{next_round:number}>();
  const scope:Scope={...parsed,round:cursor?.next_round||0,batches},runId=crypto.randomUUID();
  const statements=[db.prepare(`INSERT INTO discovery_auto_runs(id,scope_json,message) VALUES(?,?,'正在搜索推荐来源')`).bind(runId,JSON.stringify(scope))];
  for(let round=scope.round;round<scope.round+batches;round++)for(const source of autoSources(scope.customerType)){
    statements.push(db.prepare(`INSERT INTO discovery_auto_items(run_id,kind,item_key,payload_json) VALUES(?,'SOURCE',?,?)`)
      .bind(runId,source+':'+round,JSON.stringify({source,round})));
  }
  statements.push(db.prepare(`INSERT INTO discovery_auto_cursors(scope_key,next_round) VALUES(?,?) ON CONFLICT(scope_key) DO UPDATE SET next_round=excluded.next_round`).bind(key,scope.round+batches));
  try{await db.batch(statements);}catch(e){
    const existing=await db.prepare(`SELECT id FROM discovery_auto_runs WHERE status IN ('RUNNING','PAUSED') LIMIT 1`).first<{id:string}>();
    if(existing)return {runId:existing.id,existing:true};throw e;
  }
  return {runId,existing:false};
}

async function callApi(base:string,key:string,path:string,input:Row){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),65000);
  try{
    const r=await fetch(new URL('/api/admin/'+path,base),{method:'POST',headers:{'content-type':'application/json','x-admin-key':key},body:JSON.stringify(input),signal:controller.signal});
    const data=await r.json() as Row;
    if(!r.ok||!data.ok){const sources=data.sources as Record<string,Row>|undefined;throw new Error(Object.values(sources||{}).map(s=>clean(s.error)).filter(Boolean).join(' · ')||clean(data.error)||'本次来源或官网未能完成。');}
    return data;
  }finally{clearTimeout(timer);}
}

async function searchSource(env:AutoEnv,base:string,key:string,runId:string,scope:Scope,item:Item){
  const db=env.MINGEAGLE_DB,{source,round}=JSON.parse(item.payload_json) as {source:string;round:number};
  const input={...scope,round,runId};
  let result:Row;
  if(source==='CORE'){
    const path=COMMERCIAL_TYPES.has(scope.customerType)?'discovery-web-v6':'discovery-school-v1';
    result=await callApi(base,key,path,input);
    const records=await db.prepare(`SELECT c.id FROM discovery_run_candidates r JOIN discovery_candidates c ON c.id=r.candidate_id WHERE r.run_id=? AND c.status<>'IGNORED'`).bind(runId).all<{id:string}>();
    for(const row of records.results)await enqueue(db,runId,'CANDIDATE',row.id);
  }else{
    result=await callApi(base,key,'discovery-sources-v1',{...input,action:'SEARCH',sources:[source]});
    for(const id of result.foundIds as string[]||[])await enqueue(db,runId,'CLUE',id);
    const states=result.sources as Record<string,Row>|undefined;
    if(states?.[source]?.partial)throw new Error(clean(states[source].note)||'部分来源未完成，正在自动重试。');
  }
  return {found:Number(result.found||0),note:clean(result.note)||clean((result.sources as Record<string,Row>|undefined)?.[source]?.note)};
}

async function verifyClue(env:AutoEnv,base:string,key:string,runId:string,item:Item){
  const db=env.MINGEAGLE_DB,clue=await db.prepare(`SELECT * FROM discovery_clues WHERE id=?`).bind(item.item_key).first<Row>();
  if(!clue)throw new Error('线索记录已不存在。');
  if(clue.status==='IGNORED')return {skipped:true,reason:'已忽略线索保持原状态'};
  if(clue.status==='CONVERTED'&&clue.candidate_id){await enqueue(db,runId,'CANDIDATE',String(clue.candidate_id));return {candidateId:clue.candidate_id};}
  const websites:string[]=[];
  if(allowedWebsite(clean(clue.website)))websites.push(clean(clue.website));
  if(allowedWebsite(clean(clue.source_url))&&clue.source_provider==='DIRECTORY')websites.push(clean(clue.source_url));
  if(!websites.length){
    const hits=await bing(`"${clean(clue.title,200)}" ${clean(clue.city,80)} ${STATE_NAMES[String(clue.state_region)]||clean(clue.state_region,30)} official website`,clean(clue.city,80));
    for(const hit of hits)if(clueMatches(hit.title,clean(clue.title,200)))websites.push(hit.url);
  }
  if(!websites.length)throw new Error('公开索引尚未提供可核验官网，已保留待核验线索。');
  let last='机构名称、业务或地区证据不足。';
  for(const website of [...new Set(websites)].slice(0,2)){
    try{
      const result=await callApi(base,key,'discovery-sources-v1',{action:'VERIFY',clueId:item.item_key,website});
      if(result.candidateId){await enqueue(db,runId,'CANDIDATE',String(result.candidateId));return {candidateId:result.candidateId,name:result.name};}
    }catch(e){last=e instanceof Error?e.message:last;}
  }
  throw new Error(last);
}

async function importCandidate(env:AutoEnv,base:string,key:string,item:Item){
  const db=env.MINGEAGLE_DB;
  const row=await db.prepare(`SELECT * FROM discovery_candidates WHERE id=?`).bind(item.item_key).first<Row>();
  if(!row)throw new Error('候选记录已不存在。');
  if(row.status==='IGNORED')return {skipped:true,reason:'已忽略候选保持原状态'};
  if(!allowedWebsite(clean(row.website)))throw new Error('官网尚未核验，已保留待核验记录。');
  const domain=new URL(clean(row.website)).hostname.toLowerCase().replace(/^www\./,'');
  const exclusion=await db.prepare(`SELECT l.id FROM leads l JOIN companies c ON c.id=l.company_id
    LEFT JOIN contacts ct ON ct.id=l.primary_contact_id WHERE c.domain=?
    AND (l.status IN ('DO_NOT_CONTACT','NOT_INTERESTED','NOT_FIT') OR ct.do_not_contact=1) LIMIT 1`).bind(domain).first<{id:string}>();
  if(exclusion)return {skipped:true,reason:'保留不联系 / 不匹配客户的既有状态'};
  await callApi(base,key,'discovery-enrich-v2',{candidateId:item.item_key});
  const fresh=await db.prepare(`SELECT * FROM discovery_candidates WHERE id=?`).bind(item.item_key).first<Row>();
  if(!fresh||fresh.enrichment_status!=='COMPLETED')throw new Error('官网补全尚未完成。');
  const imported=await addToCrm(db,item.item_key);await syncCrm(db,item.item_key);
  const lead=await db.prepare(`SELECT primary_contact_id FROM leads WHERE id=?`).bind(imported.leadId).first<{primary_contact_id:string}>();
  if(lead?.primary_contact_id)await db.prepare(`UPDATE contacts SET facebook_url=COALESCE(NULLIF(facebook_url,''),?),tiktok_url=COALESCE(NULLIF(tiktok_url,''),?) WHERE id=?`).bind(fresh.facebook_url||null,fresh.tiktok_url||null,lead.primary_contact_id).run();
  for(const [field,value] of [['facebook',fresh.facebook_url],['tiktok',fresh.tiktok_url]])if(value)await db.prepare(`INSERT INTO lead_evidence(id,lead_id,field_name,value,source_url,evidence_text,confidence) SELECT ?,?,?,?,?, 'Official website public social link',85 WHERE NOT EXISTS(SELECT 1 FROM lead_evidence WHERE lead_id=? AND field_name=? AND value=?)`).bind(crypto.randomUUID(),imported.leadId,field,value,fresh.website_contact_url||fresh.website,imported.leadId,field,value).run();
  const missing=[['联系人','contact_person_name'],['邮箱','email'],['电话','phone'],['WhatsApp','whatsapp']].filter(([,field])=>!fresh[field]).map(([label])=>label);
  return {...imported,name:fresh.name,missing,alreadyAdded:imported.alreadyAdded};
}

export async function autoSummary(db:D1Database,runId?:string){
  const run=runId?await db.prepare(`SELECT * FROM discovery_auto_runs WHERE id=?`).bind(runId).first<Row>():await db.prepare(`SELECT * FROM discovery_auto_runs ORDER BY created_at DESC,id DESC LIMIT 1`).first<Row>();
  if(!run)return {run:null};
  const counts=await db.prepare(`SELECT kind,status,COUNT(*) AS count FROM discovery_auto_items WHERE run_id=? GROUP BY kind,status`).bind(run.id).all<Row>();
  const results=await db.prepare(`SELECT i.item_key,i.status,i.error,i.result_json,c.name,c.website,c.address,c.email,c.phone,c.whatsapp,c.instagram_url,c.facebook_url,c.linkedin_url,c.tiktok_url,c.contact_person_name,c.contact_person_title,c.lead_score,c.grade,c.crm_lead_id,c.customer_type,c.city,c.state_region
    FROM discovery_auto_items i LEFT JOIN discovery_candidates c ON c.id=i.item_key
    WHERE i.run_id=? AND i.kind='CANDIDATE' ORDER BY CASE i.status WHEN 'DONE' THEN 0 ELSE 1 END,c.lead_score DESC,i.item_key LIMIT 100`).bind(run.id).all<Row>();
  const exceptions=await db.prepare(`SELECT i.kind,i.item_key,i.error,COALESCE(c.name,l.title,i.item_key) AS name
    FROM discovery_auto_items i LEFT JOIN discovery_candidates c ON i.kind='CANDIDATE' AND c.id=i.item_key
    LEFT JOIN discovery_clues l ON i.kind='CLUE' AND l.id=i.item_key
    WHERE i.run_id=? AND i.status='FAILED' ORDER BY i.kind,i.item_key LIMIT 100`).bind(run.id).all<Row>();
  const sources=await db.prepare(`SELECT item_key,status,error,result_json FROM discovery_auto_items WHERE run_id=? AND kind='SOURCE' ORDER BY item_key`).bind(run.id).all<Row>();
  const safeRun={id:run.id,status:run.status,phase:run.phase,message:run.message,scope:JSON.parse(String(run.scope_json)),created_at:run.created_at,completed_at:run.completed_at};
  return {run:safeRun,counts:counts.results,results:results.results,exceptions:exceptions.results,sources:sources.results};
}

export async function advanceAuto(env:AutoEnv,base:string,key:string,runId:string){
  const db=env.MINGEAGLE_DB,token=crypto.randomUUID();
  const run=await db.prepare(`UPDATE discovery_auto_runs SET lease_token=?,lease_until=datetime('now','+150 seconds'),updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND status='RUNNING' AND (lease_until IS NULL OR datetime(lease_until)<datetime('now')) RETURNING *`).bind(token,runId).first<Row>();
  if(!run)return autoSummary(db,runId);
  try{
    const scope=JSON.parse(String(run.scope_json)) as Scope;
    const kinds=['SOURCE','CANDIDATE','CLUE'];let selected:Item[]=[],kind='';
    for(const current of kinds){
      const records=await db.prepare(`SELECT run_id,kind,item_key,payload_json,attempts FROM discovery_auto_items WHERE run_id=? AND kind=? AND status='PENDING' ORDER BY item_key LIMIT ?`).bind(runId,current,current==='SOURCE'?3:2).all<Item>();
      if(records.results.length){selected=records.results;kind=current;break;}
    }
    if(!selected.length){
      const failed=await db.prepare(`SELECT COUNT(*) AS n FROM discovery_auto_items WHERE run_id=? AND status='FAILED'`).bind(runId).first<{n:number}>();
      await db.prepare(`UPDATE discovery_auto_runs SET status=?,phase='DONE',message=?,completed_at=CURRENT_TIMESTAMP WHERE id=? AND lease_token=? AND status='RUNNING'`)
        .bind(failed?.n?'PARTIAL':'COMPLETED',failed?.n?'已完成可核验客户入库；未能核验的信息保留在异常列表，可一键重试。':'搜索、核验、公开信息补全和待开发客户入库已完成。',runId,token).run();
      return autoSummary(db,runId);
    }
    await db.prepare(`UPDATE discovery_auto_runs SET phase=?,message=? WHERE id=? AND lease_token=?`).bind(kind,kind==='SOURCE'?'正在搜索推荐来源':kind==='CLUE'?'正在自动查找官网并核验机构':'正在补全公开信息并加入待开发客户',runId,token).run();
    await Promise.all(selected.map(async item=>{
      try{
        const result:Row=kind==='SOURCE'?await searchSource(env,base,key,runId,scope,item):kind==='CLUE'?await verifyClue(env,base,key,runId,item):await importCandidate(env,base,key,item);
        await db.prepare(`UPDATE discovery_auto_items SET status=?,attempts=attempts+1,error=NULL,result_json=?,updated_at=CURRENT_TIMESTAMP WHERE run_id=? AND kind=? AND item_key=?`).bind(result.skipped?'SKIPPED':'DONE',JSON.stringify(result),runId,kind,item.item_key).run();
      }catch(e){
        await db.prepare(`UPDATE discovery_auto_items SET status=?,attempts=attempts+1,error=?,updated_at=CURRENT_TIMESTAMP WHERE run_id=? AND kind=? AND item_key=?`)
          .bind(item.attempts>=1?'FAILED':'PENDING',clean(e instanceof Error?e.message:e),runId,kind,item.item_key).run();
      }
    }));
    return autoSummary(db,runId);
  }finally{
    await db.prepare(`UPDATE discovery_auto_runs SET lease_token=NULL,lease_until=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND lease_token=?`).bind(runId,token).run();
  }
}
