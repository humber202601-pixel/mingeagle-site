import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const dir=mkdtempSync(join(tmpdir(),'discovery-diagnostics-'));
try{
  await build({entryPoints:['src/discovery-diagnostics.ts'],bundle:true,platform:'node',format:'esm',outdir:dir,outExtension:{'.js':'.mjs'},logLevel:'silent'});
  const {diagnoseDiscovery}=await import(pathToFileURL(join(dir,'discovery-diagnostics.mjs')));
  const run=(status,found,clues,candidates,imported=0,failures=0)=>{
    const counts=[{kind:'CLUE',status:'DONE',count:clues},{kind:'CANDIDATE',status:'DONE',count:candidates}];
    const sources=[{item_key:'CORE:0',status:'DONE',result_json:JSON.stringify({found})},...Array.from({length:failures},(_,i)=>({item_key:'OSM:'+i,status:'FAILED',error:'Provider HTTP 503'}))];
    const results=Array.from({length:imported},(_,i)=>({status:'DONE',crm_lead_id:'lead-'+i}));
    return {run:{status},counts,sources,results};
  };
  assert.equal(diagnoseDiscovery({run:null}),null);
  assert.equal(diagnoseDiscovery(run('RUNNING',0,0,0)).code,'RUNNING','do not diagnose in-progress 0 as no buyers');
  assert.equal(diagnoseDiscovery(run('PAUSED',2,1,0)).code,'PAUSED');
  assert.equal(diagnoseDiscovery(run('PARTIAL',0,0,0,0,2)).code,'SOURCE_BLOCKED','unavailable source is not an empty marketplace');
  assert.equal(diagnoseDiscovery(run('COMPLETED',0,0,0)).code,'NO_PUBLIC_RESULTS','genuine empty public index');
  assert.equal(diagnoseDiscovery(run('COMPLETED',10,0,0)).code,'CLUE_PERSISTENCE','separate source retrieval from clue persistence');
  assert.equal(diagnoseDiscovery(run('PARTIAL',10,3,0)).code,'WEBSITE_VERIFICATION','do not import unverified public clues');
  assert.equal(diagnoseDiscovery(run('COMPLETED',10,3,2)).code,'CRM_INTAKE','distinguish verified candidate from CRM conversion');
  assert.equal(diagnoseDiscovery(run('PARTIAL',10,3,2,1,1)).code,'SUCCESS');
  assert.equal(diagnoseDiscovery({run:{status:'COMPLETED'},sources:[{status:'DONE',result_json:'not-json'}]}).funnel.returned,0,'malformed provider data cannot crash dashboard');
  console.log('PASS: D1-free discovery funnel diagnosis distinguishes source outage, genuine zero results, clue persistence, website verification, CRM intake, active/paused and successful runs.');
}finally{rmSync(dir,{recursive:true,force:true})}
