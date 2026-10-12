import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
const dir=mkdtempSync(join(tmpdir(),'mingeagle-chat-'));
try{
 await build({entryPoints:['functions/api/sales-chat.ts'],outfile:join(dir,'api.mjs'),bundle:true,platform:'node',format:'esm',logLevel:'silent'});
 const {onRequestPost,onRequestOptions}=await import(pathToFileURL(join(dir,'api.mjs')));
 const make=(messages,origin='https://www.mingeagle.com',language='en')=>new Request('https://app.mingeagle.com/api/sales-chat',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({messages,language})});
 const history=[{role:'user',content:'Do you have wholesale prices?'}];
 let r=await onRequestPost({request:make(history),env:{}});
 assert.equal(r.status,503);assert.equal((await r.json()).code,'AI_NOT_CONFIGURED');
 r=await onRequestPost({request:make(history,'https://evil.example'),env:{}});
 assert.equal(r.status,403,'unknown origins must not access endpoint');
 r=await onRequestOptions({request:new Request('https://app.mingeagle.com/api/sales-chat',{method:'OPTIONS',headers:{origin:'https://www.mingeagle.com'}})});
 assert.equal(r.status,204);
 r=await onRequestOptions({request:new Request('https://app.mingeagle.com/api/sales-chat',{method:'OPTIONS',headers:{origin:'https://evil.example'}})});
 assert.equal(r.status,403);
 r=await onRequestPost({request:make(history),env:{AI_SALES_ENABLED:'true',AI_SALES_API_KEY:'test-only'}});
 assert.equal(r.status,503,'missing database must fail closed, not consume paid AI');
 r=await onRequestPost({request:make([{role:'user',content:'x'.repeat(15000)}]),env:{AI_SALES_ENABLED:'true',AI_SALES_API_KEY:'test-only'}});
 assert.equal(r.status,400,'large request must be rejected before provider');
 console.log('PASS: public AI sales endpoint closed by default, origin allowlist, fail-closed rate protection, max payload validation.');
 const sqlite=new DatabaseSync(':memory:');
 const database={prepare(sql){const s={args:[],bind(...args){s.args=args;return s;},async run(){return {meta:{changes:sqlite.prepare(sql).run(...s.args).changes}};}};return s;}};
 const env={MINGEAGLE_DB:database,AI_SALES_ENABLED:'true',AI_SALES_API_KEY:'synthetic-provider-key'};
 const originalFetch=globalThis.fetch;let calls=0,providerInput;
 globalThis.fetch=async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/chat/completions');calls++;providerInput=JSON.parse(options.body);return Response.json({choices:[{message:{content:'Synthetic language response'}}]});};
 try{
  for(const [code,name] of Object.entries({en:'English',es:'Spanish',pt:'Portuguese',fr:'French',de:'German',it:'Italian',nl:'Dutch',pl:'Polish',ja:'Japanese'})){
   r=await onRequestPost({request:make(history,'https://www.mingeagle.com',code),env});
   assert.equal(r.status,200,code);assert(providerInput.messages[0].content.includes('Always respond in '+name),'Selected language missing: '+code);
  }
  r=await onRequestPost({request:make(history,'https://www.mingeagle.com','unknown'),env});assert.equal(r.status,200);assert(providerInput.messages[0].content.includes('Always respond in English'));
  for(let i=0;i<2;i++){r=await onRequestPost({request:make(history),env});assert.equal(r.status,200);}
  r=await onRequestPost({request:make(history),env});assert.equal(r.status,429,'Thirteenth request must be blocked before the provider');assert.equal(calls,12);
 }finally{globalThis.fetch=originalFetch;sqlite.close();}
 console.log('PASS: all nine provider-language mappings, safe unknown-language fallback and real SQLite hourly cap; provider mocked, no paid calls.');
}finally{rmSync(dir,{recursive:true,force:true})}
