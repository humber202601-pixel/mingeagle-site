export type DiscoverySnapshot={run?:{id:string;status:string;revision?:number}|null;workerBusy?:boolean};
export function mergeDiscovery<T extends DiscoverySnapshot>(previous:T,next:T):T{
  return previous.run?.id===next.run?.id&&Number(previous.run?.revision||0)>Number(next.run?.revision||0)?previous:next;
}
export async function discoveryRequest<T>(accessKey:string,body?:Record<string,unknown>,externalSignal?:AbortSignal,runId?:string,timeoutMs=15000,path='/api/admin/discovery-auto-v1'):Promise<T>{
  const controller=new AbortController(),abort=()=>controller.abort();externalSignal?.addEventListener('abort',abort,{once:true});if(externalSignal?.aborted)controller.abort();let timer:ReturnType<typeof setTimeout>;
  const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('进度请求超时，后台任务会保留，系统将重新读取进度。'));},timeoutMs);});
  try{return await Promise.race([(async()=>{
    const r=await fetch(path+(!body&&runId?'?runId='+encodeURIComponent(runId):''),{method:body?'POST':'GET',headers:{'content-type':'application/json','x-admin-key':accessKey},...(body?{body:JSON.stringify(body)}:{}),signal:controller.signal});
    const raw=await r.text();let result:{ok?:boolean;error?:string};try{result=JSON.parse(raw);}catch{throw new Error(`进度服务暂时不可用（HTTP ${r.status}，非 JSON 响应），任务已保留。`);}
    if(!r.ok||!result?.ok)throw new Error(result?.error||'任务读取失败。');return result as T;
  })(),deadline]);}finally{clearTimeout(timer!);externalSignal?.removeEventListener('abort',abort);}
}
type Clock={set:(fn:()=>void,ms:number)=>unknown;clear:(id:unknown)=>void};
export function startDiscoveryLoop<T extends DiscoverySnapshot>(options:{runId:string;initial:T;request:(body?:Record<string,unknown>,signal?:AbortSignal)=>Promise<T>;onData:(value:T)=>void;onError:(message:string)=>void;clock?:Clock;intervalMs?:number}){
  const clock=options.clock||{set:(fn:()=>void,ms:number)=>setTimeout(fn,ms),clear:(id:unknown)=>clearTimeout(id as ReturnType<typeof setTimeout>)};
  const interval=options.intervalMs||3000,controllers=new Set<AbortController>();let stopped=false,latest=options.initial,pollTimer:unknown,kickTimer:unknown;
  const stop=()=>{stopped=true;clock.clear(pollTimer);clock.clear(kickTimer);for(const controller of controllers)controller.abort();};
  const accept=(next:T)=>{if(stopped||next.run&&next.run.id!==options.runId)return;latest=mergeDiscovery(latest,next);options.onData(latest);options.onError('');if(latest.run?.status!=='RUNNING')stop();};
  const request=async(body?:Record<string,unknown>)=>{const controller=new AbortController();controllers.add(controller);try{accept(await options.request(body,controller.signal));}catch(e){if(!stopped)options.onError(e instanceof Error?e.message:'暂时无法更新进度，将自动重新读取。');}finally{controllers.delete(controller);}};
  // The Cloudflare scheduler continues durable runs every minute. Browser tabs
  // left in the background must not burn D1's daily read allowance polling.
  const hidden=()=>typeof document!=='undefined'&&document.visibilityState==='hidden';
  const poll=async()=>{if(!hidden())await request();if(!stopped)pollTimer=clock.set(()=>void poll(),hidden()?Math.max(interval,15000):interval);};
  const kick=async()=>{if(!hidden()&&!latest.workerBusy)await request({action:'KICK',runId:options.runId});if(!stopped)kickTimer=clock.set(()=>void kick(),hidden()?Math.max(interval,15000):interval);};
  pollTimer=clock.set(()=>void poll(),0);kickTimer=clock.set(()=>void kick(),100);
  return stop;
}
