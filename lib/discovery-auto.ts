import { parseSearch, COMMERCIAL_TYPES } from '../shared/discovery';
import { ensureTables } from '../functions/api/admin/discovery-web-v6';
import { ensureClues } from './discovery-sources';
import { autoApi,AutoStepError } from './discovery-auto-support';

export interface AutoEnv { MINGEAGLE_DB:D1Database; GEOAPIFY_API_KEY?:string }
type Row=Record<string,unknown>;
type Scope=ReturnType<typeof parseSearch> & {batches:number};
type Item={run_id:string;kind:string;item_key:string;payload_json:string;attempts:number};
export type AutoWork={runId:string;token:string;items:Item[]};
const schemas=new WeakMap<D1Database,Promise<void>>();
const clean=(v:unknown,max=1000)=>String(v??'').trim().slice(0,max);

async function initializeAuto(db:D1Database){
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
  for(const [table,fields] of [['discovery_auto_runs',[['revision','INTEGER NOT NULL DEFAULT 0'],['steps_completed','INTEGER NOT NULL DEFAULT 0']]],['discovery_auto_items',[['started_at','TEXT'],['claim_token','TEXT']]]] as const){
    const info=await db.prepare(`PRAGMA table_info(${table})`).all<{name:string}>();
    for(const [field,definition] of fields)if(!info.results.some(row=>row.name===field)){try{await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${field} ${definition}`).run();}catch(e){const now=await db.prepare(`PRAGMA table_info(${table})`).all<{name:string}>();if(!now.results.some(row=>row.name===field))throw e;}}
  }
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_discovery_auto_pending ON discovery_auto_items(run_id,kind,status)`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS discovery_auto_cursors (
    scope_key TEXT PRIMARY KEY, next_round INTEGER NOT NULL DEFAULT 0)`).run();
}

export function ensureAuto(db:D1Database){let ready=schemas.get(db);if(!ready){ready=initializeAuto(db).catch(e=>{schemas.delete(db);throw e;});schemas.set(db,ready);}return ready;}

export function autoSources(type:string){
  const base=['CORE','DIRECTORY','FACEBOOK','TIKTOK','INSTAGRAM','LINKEDIN'];
  if(COMMERCIAL_TYPES.has(type))return [...base,'GEOAPIFY','OSM'];
  return [...base,type==='SCHOOL_DISTRICT'?'NCES_DISTRICTS':type==='PRIVATE_CHARTER_SCHOOL'?'NCES_PRIVATE':'NCES'];
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
    WHERE i.run_id=? AND i.status IN ('FAILED','REVIEW') ORDER BY i.kind,i.item_key LIMIT 100`).bind(run.id).all<Row>();
  const sources=await db.prepare(`SELECT item_key,status,error,result_json FROM discovery_auto_items WHERE run_id=? AND kind='SOURCE' ORDER BY item_key`).bind(run.id).all<Row>();
  const safeRun={id:run.id,status:run.status,phase:run.phase,message:run.message,scope:JSON.parse(String(run.scope_json)),created_at:run.created_at,updated_at:run.updated_at,completed_at:run.completed_at,revision:Number(run.revision||0),steps_completed:Number(run.steps_completed||0)};
  const current=await db.prepare(`SELECT i.kind,i.item_key,i.payload_json,i.started_at,COALESCE(c.name,l.title,i.item_key) AS name FROM discovery_auto_items i LEFT JOIN discovery_candidates c ON i.kind='CANDIDATE' AND c.id=i.item_key LEFT JOIN discovery_clues l ON i.kind='CLUE' AND l.id=i.item_key WHERE i.run_id=? AND i.status='PROCESSING'`).bind(run.id).all<Row>();
  const total=counts.results.reduce((n,row)=>n+Number(row.count),0),processed=counts.results.filter(row=>['DONE','FAILED','REVIEW','SKIPPED'].includes(String(row.status))).reduce((n,row)=>n+Number(row.count),0);
  const workerBusy=Boolean(run.lease_token&&Date.parse(String(run.lease_until).replace(' ','T')+'Z')>Date.now());
  return {run:safeRun,counts:counts.results,results:results.results,exceptions:exceptions.results,sources:sources.results,workerBusy,leaseUntil:workerBusy?run.lease_until:null,progress:{total,processed},current:current.results.map(row=>({kind:row.kind,name:row.name,startedAt:row.started_at,stage:JSON.parse(String(row.payload_json)).stage||row.kind}))};
}
async function reconcile(db:D1Database,runId:string){
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO discovery_auto_items(run_id,kind,item_key) SELECT r.run_id,'CANDIDATE',r.candidate_id FROM discovery_run_candidates r JOIN discovery_candidates c ON c.id=r.candidate_id WHERE r.run_id=? AND c.status<>'IGNORED'`).bind(runId),
    db.prepare(`INSERT OR IGNORE INTO discovery_auto_items(run_id,kind,item_key) SELECT r.run_id,'CLUE',r.clue_id FROM discovery_run_clues r JOIN discovery_clues c ON c.id=r.clue_id WHERE r.run_id=? AND c.status<>'IGNORED'`).bind(runId),
  ]);
}
export async function claimAuto(db:D1Database,runId:string):Promise<AutoWork|null>{
  const token=crypto.randomUUID();
  const run=await db.prepare(`UPDATE discovery_auto_runs SET lease_token=?,lease_until=datetime('now','+60 seconds'),updated_at=CURRENT_TIMESTAMP,revision=revision+1 WHERE id=? AND status='RUNNING' AND (lease_until IS NULL OR datetime(lease_until)<=datetime('now')) RETURNING *`).bind(token,runId).first<Row>();
  if(!run)return null;
  try{
    await db.prepare(`UPDATE discovery_auto_items SET status=CASE WHEN attempts>=2 THEN 'FAILED' ELSE 'PENDING' END,error='上一个处理步骤意外中断，已自动恢复。',claim_token=NULL,started_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE run_id=? AND status='PROCESSING'`).bind(runId).run();
    await reconcile(db,runId);
    let items:Item[]=[];
    for(const kind of ['CANDIDATE','CLUE','SOURCE']){
      const records=await db.prepare(`SELECT run_id,kind,item_key,payload_json,attempts FROM discovery_auto_items WHERE run_id=? AND kind=? AND status='PENDING' ORDER BY attempts,CASE WHEN item_key LIKE 'CORE:%' OR item_key LIKE 'NCES%' OR item_key LIKE 'GEOAPIFY:%' THEN 0 ELSE 1 END,item_key LIMIT 3`).bind(runId,kind).all<Item>();
      if(records.results.length){items=records.results;break;}
    }
    if(!items.length){await finishAuto(db,runId,token);return null;}
    const kind=items[0].kind;
    await db.batch([db.prepare(`UPDATE discovery_auto_runs SET phase=?,message=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND lease_token=?`).bind(kind,kind==='SOURCE'?'正在搜索推荐来源':kind==='CLUE'?'正在分步查找官网并核验机构':'正在分步补全并加入待开发客户',runId,token),...items.map(item=>db.prepare(`UPDATE discovery_auto_items SET status='PROCESSING',attempts=attempts+1,claim_token=?,started_at=CURRENT_TIMESTAMP,error=NULL,updated_at=CURRENT_TIMESTAMP WHERE run_id=? AND kind=? AND item_key=? AND status='PENDING'`).bind(token,runId,item.kind,item.item_key))]);
    return {runId,token,items};
  }catch(e){await db.prepare(`UPDATE discovery_auto_runs SET lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?`).bind(runId,token).run();throw e;}
}
async function finishAuto(db:D1Database,runId:string,token:string){
  const unresolved=await db.prepare(`SELECT COUNT(*) AS n FROM discovery_auto_items WHERE run_id=? AND status IN ('FAILED','REVIEW')`).bind(runId).first<{n:number}>();
  await db.prepare(`UPDATE discovery_auto_runs SET status=?,phase='DONE',message=?,completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP,revision=revision+1,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=? AND status='RUNNING'`).bind(unresolved?.n?'PARTIAL':'COMPLETED',unresolved?.n?'本批已结束；已核实客户已入库，其余记录保留待核验。':'搜索、核验、公开信息补全和待开发客户入库已完成。',runId,token).run();
  await db.prepare(`UPDATE discovery_auto_runs SET lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?`).bind(runId,token).run();
}
export async function executeAuto(env:AutoEnv,base:string,key:string,work:AutoWork,timeoutMs=20000){
  const db=env.MINGEAGLE_DB,{runId,token}=work;
  try{
    await Promise.all(work.items.map(async item=>{
      let status='FAILED',error:string|null=null,result:Row|null=null,payload=item.payload_json,reset=false;
      try{
        result=await autoApi(base,key,'discovery-auto-step-v1',{autoRunId:runId,autoToken:token,kind:item.kind,itemKey:item.item_key},timeoutMs);
        if(result.continue){status='PENDING';payload=JSON.stringify(result.payload);reset=true;}
        else if(result.review){status='REVIEW';error=clean(result.reason);}
        else status=result.skipped?'SKIPPED':'DONE';
      }catch(e){error=clean(e instanceof Error?e.message:e);status=e instanceof AutoStepError&&e.retryable&&item.attempts<1?'PENDING':'FAILED';}
      await db.batch([
        db.prepare(`UPDATE discovery_auto_items SET status=?,error=?,result_json=?,payload_json=?,attempts=CASE WHEN ? THEN 0 ELSE attempts END,claim_token=NULL,started_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE run_id=? AND kind=? AND item_key=? AND status='PROCESSING' AND claim_token=? AND EXISTS(SELECT 1 FROM discovery_auto_runs WHERE id=? AND lease_token=? AND status IN ('RUNNING','PAUSED'))`).bind(status,error,result?JSON.stringify(result):null,payload,reset?1:0,runId,item.kind,item.item_key,token,runId,token),
        db.prepare(`UPDATE discovery_auto_runs SET steps_completed=steps_completed+1,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND lease_token=? AND status IN ('RUNNING','PAUSED')`).bind(runId,token),
      ]);
      if(status==='DONE'&&result?.candidateId){await db.prepare(`INSERT OR IGNORE INTO discovery_auto_items(run_id,kind,item_key) SELECT ?,'CANDIDATE',? WHERE EXISTS(SELECT 1 FROM discovery_auto_runs WHERE id=? AND lease_token=? AND status IN ('RUNNING','PAUSED'))`).bind(runId,String(result.candidateId),runId,token).run();}
    }));
    const active=await db.prepare(`SELECT id FROM discovery_auto_runs WHERE id=? AND lease_token=?`).bind(runId,token).first();
    if(active){await reconcile(db,runId);const remaining=await db.prepare(`SELECT COUNT(*) AS n FROM discovery_auto_items WHERE run_id=? AND status IN ('PENDING','PROCESSING')`).bind(runId).first<{n:number}>();if(!remaining?.n)await finishAuto(db,runId,token);}
  }finally{await db.prepare(`UPDATE discovery_auto_runs SET lease_token=NULL,lease_until=NULL,updated_at=CURRENT_TIMESTAMP,revision=revision+1 WHERE id=? AND lease_token=?`).bind(runId,token).run();}
}
export async function advanceAuto(env:AutoEnv,base:string,key:string,runId:string){
  const work=await claimAuto(env.MINGEAGLE_DB,runId);if(work)await executeAuto(env,base,key,work);return autoSummary(env.MINGEAGLE_DB,runId);
}
