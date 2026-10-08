export type AutoRow=Record<string,unknown>;
export class AutoStepError extends Error{constructor(message:string,public retryable=false){super(message);this.name='AutoStepError';}}
export async function assertAutoLease(db:D1Database,input:AutoRow){
  if(!input.autoRunId&&!input.autoToken)return;
  const active=await db.prepare(`SELECT id FROM discovery_auto_runs WHERE id=? AND lease_token=? AND status IN ('RUNNING','PAUSED') AND lease_until>datetime('now')`).bind(String(input.autoRunId||''),String(input.autoToken||'')).first();
  if(!active)throw new AutoStepError('此步骤已结束或被新的处理步骤接替。');
}
export async function autoApi(base:string,key:string,path:string,input:AutoRow,timeoutMs=17000):Promise<AutoRow>{
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
  const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new AutoStepError('当前步骤请求超时，系统会有限次数重试。',true));},timeoutMs);});
  try{return await Promise.race([(async()=>{
    const r=await fetch(new URL('/api/admin/'+path,base),{method:'POST',headers:{'content-type':'application/json','x-admin-key':key},body:JSON.stringify(input),signal:controller.signal});
    const raw=await r.text();let data:AutoRow;
    try{data=JSON.parse(raw);}catch{throw new AutoStepError(`步骤服务返回非 JSON 响应（HTTP ${r.status}），已保留任务进度。`,true);}
    if(!data||typeof data!=='object'||!r.ok||!data.ok){const sources=data?.sources as Record<string,AutoRow>|undefined;throw new AutoStepError(Object.values(sources||{}).map(s=>String(s.error||'')).filter(Boolean).join(' · ')||String(data?.error||'当前步骤暂未完成。'),data?.retryable===true||r.status>=500||[408,429].includes(r.status));}
    return data;
  })(),timeout]);}finally{clearTimeout(timer!);}
}
export type AutoClueSeed={key:string;title:string;source:string;url:string;evidence:string;city:string;website?:string;address?:string;raw?:AutoRow};
export async function saveAutoClues(db:D1Database,input:AutoRow,seeds:AutoClueSeed[]){
  await assertAutoLease(db,input);
  const ids:string[]=[];
  for(let start=0;start<seeds.length;start+=5){
    await assertAutoLease(db,input);
    const records=await Promise.all(seeds.slice(start,start+5).map(async clue=>{
      const newId=crypto.randomUUID();
      const row=await db.prepare(`INSERT INTO discovery_clues(id,source_key,title,source_provider,source_url,source_evidence,customer_type,state_region,city,website,address,raw_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(source_key) DO UPDATE SET title=excluded.title,source_evidence=excluded.source_evidence,website=COALESCE(NULLIF(excluded.website,''),discovery_clues.website),address=COALESCE(NULLIF(excluded.address,''),discovery_clues.address),raw_json=COALESCE(excluded.raw_json,discovery_clues.raw_json),updated_at=CURRENT_TIMESTAMP WHERE discovery_clues.status='PENDING' RETURNING id`).bind(newId,clue.key,clue.title,clue.source,clue.url,clue.evidence,String(input.customerType),String(input.stateCode),clue.city,clue.website||null,clue.address||null,clue.raw?JSON.stringify(clue.raw):null).first<{id:string}>();
      const id=row?.id||(await db.prepare(`SELECT id FROM discovery_clues WHERE source_key=?`).bind(clue.key).first<{id:string}>())?.id;
      if(id&&input.runId)await db.prepare(`INSERT OR IGNORE INTO discovery_run_clues(run_id,clue_id) VALUES(?,?)`).bind(String(input.runId),id).run();
      return id;
    }));ids.push(...records.filter((id):id is string=>Boolean(id)));
  }
  return [...new Set(ids)];
}
