import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const tmp=mkdtempSync(join(tmpdir(),'me-gsc-import-'));
try {
 const output=join(tmp,'gsc-import.mjs');
 await build({entryPoints:['functions/api/admin/search-console-import.ts'],outfile:output,bundle:true,platform:'node',format:'esm',logLevel:'silent'});
 const {onRequestPost}=await import(pathToFileURL(output));
 const state={creates:0,batches:0,statements:[]};
 const db={
  prepare(sql) {
   const stmt={sql,args:[],bind(...args){return {...stmt,args}},async run(){state.creates++;return {success:true}}};
   return stmt;
  },
  async batch(stmts){state.batches++;state.statements=stmts.map(x=>({sql:x.sql,args:x.args}));return stmts.map(()=>({success:true}));}
 };
 const row=(dimension)=>({dimension,clicks:1,impressions:8,ctr:0.125,position:9});
 const base={property:'sc-domain:mingeagle.com',kind:'pages',startDate:'2026-10-01',endDate:'2026-10-10'};
 const run=async(input)=>{
  const request=new Request('https://app.mingeagle.com/api/admin/search-console-import',{
   method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)
  });
  const response=await onRequestPost({request,env:{MINGEAGLE_DB:db}});
  return {status:response.status,data:await response.json()};
 };
 let result=await run({...base,rows:[row('https://www.mingeagle.com/products.html'),row('https://mingeagle.com/wholesale.html')]});
 assert.equal(result.status,200,JSON.stringify(result.data));
 assert.equal(result.data.rows,2);
 assert.equal(state.batches,1);
 assert(state.statements.some(s=>s.args.includes('https://www.mingeagle.com/products.html')));
 result=await run({...base,property:'https://www.mingeagle.com/',rows:[row('https://www.mingeagle.com/silent-soccer.html')]});
 assert.equal(result.status,200);
 assert.equal(state.batches,2);
 const invalid=[
  'https://notmingeagle.com/products.html',
  'https://mingeagle.com.evil.example/wholesale.html',
  'https://www.mingeagle.com.evil.example/products.html',
  'https://user:secret@www.mingeagle.com/products.html',
  'https://www.mingeagle.com/quote/secret-bearer-token',
  'https://www.mingeagle.com/app',
  'https://www.mingeagle.com/api/admin/data',
  'https://www.mingeagle.com/products.html?private=123',
  'https://www.mingeagle.com/inquiry.html?email=private@example.com',
  'https://www.mingeagle.com/gmail-test.html',
  'http://www.mingeagle.com/products.html',
  'javascript:alert(1)'
 ];
 for(const dimension of invalid){
  const attempt=await run({...base,rows:[row(dimension)]});
  assert.equal(attempt.status,400,'reject unsafe URL: '+dimension);
  assert.equal(state.batches,2,'rejected data never persisted');
 }
 for(const wrong of [
  {...base,rows:[{...row('https://www.mingeagle.com/products.html'),clicks:'1'}]},
  {...base,rows:[{...row('https://www.mingeagle.com/products.html'),impressions:null}]},
  {...base,rows:[{...row('https://www.mingeagle.com/products.html'),dimension:'x'.repeat(501)}]},
  {...base,property:'https://another.example/',rows:[row('https://www.mingeagle.com/products.html')]},
  null,
  []
 ]){
  const response=await run(wrong);
  assert.equal(response.status,400,'bad import rejected');
  assert.equal(state.batches,2);
 }
 const queries=await run({...base,kind:'queries',rows:[row('silent basketball wholesale')]});
 assert.equal(queries.status,200,'normal keyword CSV remains supported');
 assert.equal(state.batches,3);
 console.log('PASS: GSC canonical www/apex imports, site-owned public paths, no private URL leakage, numeric validation, and safe rejection.');
} finally {rmSync(tmp,{recursive:true,force:true});}
