import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const dir=mkdtempSync(join(tmpdir(),'mingeagle-chat-'));
try{
 await build({entryPoints:['functions/api/sales-chat.ts'],outfile:join(dir,'api.mjs'),bundle:true,platform:'node',format:'esm',logLevel:'silent'});
 const {onRequestPost,onRequestOptions}=await import(pathToFileURL(join(dir,'api.mjs')));
 const make=(messages,origin='https://www.mingeagle.com')=>new Request('https://app.mingeagle.com/api/sales-chat',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({messages})});
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
}finally{rmSync(dir,{recursive:true,force:true})}
