// One public result set per automated SOURCE + round. A resumable four-item
// save must not run a new Bing/NCES/Geoapify search at every offset:
// public results can change and quietly skip or duplicate buyer prospects.
// This uses the existing D1 short-lived source cache; it never stores API keys.
type AutoScope={autoRunId?:unknown;autoToken?:unknown};
const keyFor=(runId:string,source:string,round:number)=>
  ['discovery-snapshot-v24',runId,source,round].join('|');
export async function sourceSnapshot<T>(
  db:D1Database,input:AutoScope,source:string,round:number,
  load:()=>Promise<T>,
  cacheIf:(data:T)=>boolean=()=>true,
):Promise<T>{
  if(!input.autoRunId||!input.autoToken)return load();
  const key=keyFor(String(input.autoRunId),source,round);
  const saved=await db.prepare(`SELECT payload FROM discovery_public_source_cache
    WHERE cache_key=? AND expires_at>CURRENT_TIMESTAMP`).bind(key).first<{payload:string}>();
  if(saved){
    try{
      const value=JSON.parse(saved.payload) as T;
      if(value&&typeof value==='object')return value;
    }catch{/* invalid payload is replaced by an independently verified request */}
  }
  const fresh=await load();
  // A partial/blocked source must remain retryable. Freezing an incomplete
  // snapshot would turn transient provider outages into two-hour failures.
  if(!cacheIf(fresh))return fresh;
  await db.prepare(`INSERT INTO discovery_public_source_cache(cache_key,payload,expires_at)
    VALUES(?,?,datetime('now','+2 hours'))
    ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,expires_at=excluded.expires_at`)
    .bind(key,JSON.stringify(fresh)).run();
  return fresh;
}
