import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
const temp=mkdtempSync(join(tmpdir(),'discovery-runner-')),originalFetch=globalThis.fetch;
try{
  await build({entryPoints:['src/discovery-runner.ts','workers/followup-scheduler.ts'],outdir:temp,bundle:true,platform:'node',format:'esm',outExtension:{'.js':'.mjs'},logLevel:'silent'});
  const {discoveryRequest,startDiscoveryLoop,mergeDiscovery}=await import(pathToFileURL(join(temp,'src/discovery-runner.mjs')));
  const paused={run:{id:'fixture',status:'PAUSED',revision:20}};
  assert.equal(mergeDiscovery(paused,{run:{id:'fixture',status:'RUNNING',revision:19}}),paused,'late progress cannot overwrite a pause or completed state');
  globalThis.fetch=async()=>new Response('<!DOCTYPE html><title>Service unavailable</title>',{status:502,headers:{'content-type':'text/html'}});
  await assert.rejects(discoveryRequest('fixture'),error=>error.message.includes('HTTP 502')&&error.message.includes('非 JSON')&&!error.message.includes('<!DOCTYPE'),'HTML server errors become readable progress errors');
  globalThis.fetch=async(url,init)=>{assert.equal(url,'/api/admin/discovery-history-v1');assert.equal(JSON.parse(init.body).action,'CLEAR');return Response.json({ok:true,protectedLeads:1});};
  assert.equal((await discoveryRequest('fixture',{action:'CLEAR'},undefined,undefined,15,'/api/admin/discovery-history-v1')).protectedLeads,1,'history operations use the same bounded transport');
  globalThis.fetch=async()=>new Promise(()=>{});
  const started=performance.now();await assert.rejects(discoveryRequest('fixture',undefined,undefined,undefined,15),/进度请求超时/);assert(performance.now()-started<300,'even a fetch ignoring abort cannot leave the UI submitting indefinitely');
  let time=0,next=0,jobs=new Map();const clock={set(fn,ms){const id=++next;jobs.set(id,{fn,due:time+ms});return id;},clear(id){jobs.delete(id);}};
  const flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
  const advance=async(ms)=>{time+=ms;for(const [id,job]of [...jobs])if(job.due<=time){jobs.delete(id);job.fn();}await flush();};
  let polls=0,kicks=0,resolveKick,kickSignal,states=[];
  const stop=startDiscoveryLoop({runId:'fixture',initial:{run:{id:'fixture',status:'RUNNING',revision:0},workerBusy:false},clock,intervalMs:10,
    request:async(body,signal)=>{if(body){kicks++;kickSignal=signal;return new Promise(resolve=>{resolveKick=resolve;});}polls++;return {run:{id:'fixture',status:polls>=3?'COMPLETED':'RUNNING',revision:polls},workerBusy:polls>=2};},onData:value=>states.push(value),onError:()=>{}});
  await advance(0);await advance(100);assert.equal(kicks,1);await advance(10);assert(polls>=3,'progress reads continue while a kickoff request hangs');assert.equal(states.at(-1).run.status,'COMPLETED');assert(kickSignal.aborted,'terminal state cancels outstanding browser requests');
  resolveKick({run:{id:'fixture',status:'RUNNING',revision:1}});await flush();assert.equal(states.at(-1).run.status,'COMPLETED');stop();assert.equal(jobs.size,0);
  time=0;jobs=new Map();let busyKicks=0;
  const stopBusy=startDiscoveryLoop({runId:'fixture',initial:{run:{id:'fixture',status:'RUNNING',revision:1},workerBusy:true},clock,request:async(body)=>{if(body)busyKicks++;return {run:{id:'fixture',status:'RUNNING',revision:1},workerBusy:true};},onData:()=>{},onError:()=>{}});
  await advance(10000);await advance(10000);assert.equal(busyKicks,0,'an active worker is polled without redundant processing requests');stopBusy();
  // Foreground default must not hammer D1; a busy run still displays
  // progress without dispatching duplicate work on every UI tick.
  time=0;jobs=new Map();
  const stopDefault=startDiscoveryLoop({runId:'fixture',initial:{run:{id:'fixture',status:'RUNNING',revision:1},workerBusy:true},clock,request:async()=>({run:{id:'fixture',status:'RUNNING',revision:1},workerBusy:true}),onData:()=>{},onError:()=>{}});
  await advance(0);
  assert([...jobs.values()].some(j=>j.due>=9000),'foreground default progress reads must not run every 3 seconds');
  stopDefault();
  // A hidden admin tab must not poll or dispatch work; the server scheduler
  // owns continuation until the operator returns.
  time=0;jobs=new Map();let hiddenPolls=0,hiddenKicks=0;
  const priorDocument=globalThis.document;
  globalThis.document={visibilityState:'hidden'};
  const stopHidden=startDiscoveryLoop({runId:'fixture',initial:{run:{id:'fixture',status:'RUNNING',revision:1},workerBusy:false},clock,intervalMs:10,
    request:async(body)=>{if(body)hiddenKicks++;else hiddenPolls++;return {run:{id:'fixture',status:'RUNNING',revision:1},workerBusy:false};},onData:()=>{},onError:()=>{}});
  await advance(10000);await advance(20000);
  assert.equal(hiddenPolls,0,'hidden browser does not poll D1 progress');
  assert.equal(hiddenKicks,0,'hidden browser does not kick D1 work');
  globalThis.document={visibilityState:'visible'};
  await advance(60000);
  assert(hiddenPolls>0&&hiddenKicks>0,'visible browser resumes progress and work after the low-cost hidden-tab interval');
  stopHidden();
  if(priorDocument===undefined)delete globalThis.document;else globalThis.document=priorDocument;
  const scheduler=(await import(pathToFileURL(join(temp,'workers/followup-scheduler.mjs')))).default;
  let tickCalls=0;globalThis.fetch=async(_url,init)=>{tickCalls++;assert.equal(JSON.parse(init.body).action,'TICK');return Response.json({ok:true,workerBusy:true,run:{status:'RUNNING'}});};
  const activeDb={prepare(sql){return{bind(){return this},async first(){return sql.includes('SELECT status')?{status:'RUNNING'}:{id:'fixture'}}}}};
  let background;const ctx={waitUntil(p){background=p;}};await scheduler.scheduled({cron:'* * * * *'},{ADMIN_ACCESS_KEY:'fixture',MINGEAGLE_DB:activeDb},ctx);await background;assert.equal(tickCalls,1,'background scheduler yields to an active browser worker');
  globalThis.fetch=async()=>new Response('<html>Temporary error</html>',{status:503});await scheduler.scheduled({cron:'* * * * *'},{ADMIN_ACCESS_KEY:'fixture',MINGEAGLE_DB:activeDb},ctx);await background;
  globalThis.fetch=async()=>{throw new Error('network disconnected');};await scheduler.scheduled({cron:'* * * * *'},{ADMIN_ACCESS_KEY:'fixture',MINGEAGLE_DB:activeDb},ctx);await background;
  const beforeIdle=tickCalls;await scheduler.scheduled({cron:'* * * * *'},{ADMIN_ACCESS_KEY:'fixture',MINGEAGLE_DB:{prepare(){return{async first(){return null}}}}},ctx);await background;assert.equal(tickCalls,beforeIdle,'idle scheduler makes no API requests');
  console.log('PASS: HTML/502 responses; non-responsive fetch deadline; independent progress polling during hung kickoff; out-of-order state fencing; request cancellation; no duplicate kickoff while worker busy; scheduler HTML/network failure and active-worker handling.');
}finally{globalThis.fetch=originalFetch;rmSync(temp,{recursive:true,force:true});}
