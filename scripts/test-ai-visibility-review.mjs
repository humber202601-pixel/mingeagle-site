import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
const tmp=mkdtempSync(join(tmpdir(),'me-ai-audit-'));
try{
 const outfile=join(tmp,'ai-review.mjs');
 await build({entryPoints:['functions/api/admin/ai-visibility-review.ts'],outfile,bundle:true,platform:'node',format:'esm',logLevel:'silent'});
 const {onRequestGet,onRequestPost}=await import(pathToFileURL(outfile));
 const sqlite=new DatabaseSync(':memory:');
 const benchmark=JSON.parse(readFileSync('data/ai-discovery-benchmark.json','utf8'));
 assert.equal(benchmark.prompts.length,24);
 sqlite.exec(readFileSync('migrations/0009_ai_visibility_observations.sql','utf8'));
 const db={prepare(sql){
  const make=(params=[])=>({
   bind(...args){return make(args)},
   async all(){return {results:sqlite.prepare(sql).all(...params)}},
   async run(){return {success:true,meta:sqlite.prepare(sql).run(...params)}}
  });
  return make();
 }};
 const env={MINGEAGLE_DB:db};
 const get=async(e=env)=>{const response=await onRequestGet({env:e});return {status:response.status,data:await response.json(),cache:response.headers.get('cache-control')}};
 const submit=async(value,origin='https://app.mingeagle.com')=>{
  const request=new Request('https://app.mingeagle.com/api/admin/ai-visibility-review',{
   method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify(value)
  });
  const response=await onRequestPost({env,request});
  return {status:response.status,data:await response.json()};
 };
 const fixture={promptId:'ME-AI-001',platform:'CHATGPT',testMode:'WEB_SEARCH',manualConfirmation:true,status:'NOT_MENTIONED'};
 const total=()=>sqlite.prepare('SELECT COUNT(*) AS n FROM ai_visibility_observations').get().n;
 let r=await get();assert.equal(r.status,200);assert.equal(r.data.prompts.length,24);
 assert.equal(r.data.summary.WEB_SEARCH.observedPairs,0);
 assert.equal(r.data.summary.WEB_SEARCH.unmeasuredPairs,120);
 assert.equal(r.data.summary.WEB_SEARCH.manualCitationRate,null);
 assert.equal(r.data.officialPlatformReport,false);
 assert.equal(r.cache,'private, no-store');
 for(const invalid of [
  {...fixture,manualConfirmation:false},
  {...fixture,promptId:'ME-AI-999'},
  {...fixture,platform:'GROK'},
  {...fixture,testMode:'INVALID'},
  {...fixture,status:'CITED'},
  {...fixture,status:'CITED',citedUrl:'https://www.mingeagle.com/quote/secret-token'},
  {...fixture,status:'CITED',citedUrl:'https://www.mingeagle.com/products.html?token=private'},
  {...fixture,status:'CITED',citedUrl:'https://mingeagle.com/products.html'},
  {...fixture,status:'CITED',citedUrl:'https://www.mingeagle.com.evil.test/products.html'},
  {...fixture,status:'CITED',citedUrl:'http://www.mingeagle.com/products.html'},
  {...fixture,status:'NOT_MENTIONED',citedUrl:'https://www.mingeagle.com/products.html'},
  {...fixture,status:'NOT_MENTIONED',manualConfirmation:'true'},
  null, []
 ]){
  const res=await submit(invalid);
  assert.equal(res.status,400,'Invalid/unverified claim must be rejected');
  assert.equal(total(),0,'Rejected record may not be written');
 }
 assert.equal((await submit(fixture,'https://evil.test')).status,403);
 assert.equal(total(),0);
 assert.equal((await submit(fixture)).status,200);
 assert.equal(total(),1);
 r=await get();
 assert.equal(r.data.summary.WEB_SEARCH.observedPairs,1);
 assert.equal(r.data.summary.WEB_SEARCH.eligible,1);
 assert.equal(r.data.summary.WEB_SEARCH.manualCitationRate,0);
 const citedUrl=benchmark.prompts[0].targetUrl;
 assert.equal((await submit({...fixture,platform:'GEMINI',status:'CITED',citedUrl})).status,200);
 r=await get();assert.equal(r.data.summary.WEB_SEARCH.observedPairs,2);
 assert.equal(r.data.summary.WEB_SEARCH.counts.CITED,1);
 assert.equal(r.data.summary.WEB_SEARCH.manualCitationRate,0.5);
 assert.equal((await submit({...fixture,status:'UNAVAILABLE'})).status,200);
 r=await get();
 assert.equal(total(),3,'Manual reviews must be append-only');
 assert.equal(r.data.summary.WEB_SEARCH.observedPairs,2,'Latest entry replaces status but not history');
 assert.equal(r.data.summary.WEB_SEARCH.eligible,1,'UNAVAILABLE excluded from rate denominator');
 assert.equal(r.data.summary.WEB_SEARCH.manualCitationRate,1);
 assert.equal((await submit({...fixture,testMode:'STANDARD',status:'MENTIONED_NO_LINK'})).status,200);
 r=await get();
 assert.equal(r.data.summary.WEB_SEARCH.eligible,1);
 assert.equal(r.data.summary.STANDARD.observedPairs,1);
 assert.equal(r.data.summary.STANDARD.counts.MENTIONED_NO_LINK,1);
 assert.equal(r.data.summary.STANDARD.manualCitationRate,0);
 assert.equal(r.data.snapshots.length,3);
 assert.equal((await get({})).status,503);
 sqlite.close();
 console.log('PASS: 24 neutral benchmark questions, missing=unknown, real manual attestation, private cited URLs rejected, append-only history, search/standard denominators isolated.');
}finally{rmSync(tmp,{recursive:true,force:true})}
