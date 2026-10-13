import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const temp=mkdtempSync(join(tmpdir(),'me-bing-ai-'));
try {
 const [backend,csv]=[join(temp,'api.mjs'),join(temp,'parser.mjs')];
 await Promise.all([
  build({entryPoints:['functions/api/admin/bing-ai-report-import.ts'],outfile:backend,bundle:true,platform:'node',format:'esm',logLevel:'silent'}),
  build({entryPoints:['src/bingAiCsv.ts'],outfile:csv,bundle:true,platform:'node',format:'esm',logLevel:'silent'})
 ]);
 const {onRequestGet,onRequestPost}=await import(pathToFileURL(backend));
 const {parseBingAiCsv,mapBingAiCsv}=await import(pathToFileURL(csv));
 const raw='\uFEFFPage,Citations,Clicks\\n"https://www.mingeagle.com/quiet-indoor-sports-for-kids.html",2,1\\n"https://www.mingeagle.com/indoor-school-sports-equipment-guide.html",0,0';
 const parsed=parseBingAiCsv(raw);
 assert.deepEqual(parsed.headers,['Page','Citations','Clicks']);
 assert.equal(mapBingAiCsv(parsed,'Page','Citations').length,2);
 assert.equal(mapBingAiCsv(parsed,'Page','Citations')[1].citations,0);
 assert.throws(()=>mapBingAiCsv(parseBingAiCsv('Page,Citations\\nhttps://www.mingeagle.com/products.html,'),'Page','Citations'));
 assert.throws(()=>mapBingAiCsv(parseBingAiCsv('Page,Citations\\nhttps://www.mingeagle.com/products.html,1.5'),'Page','Citations'));
 assert.throws(()=>mapBingAiCsv(parseBingAiCsv('Page,Citations\\nhttps://www.mingeagle.com/products.html,1\\nhttps://www.mingeagle.com/products.html,2'),'Page','Citations'));
 assert.equal(mapBingAiCsv(parseBingAiCsv('Query,Citations\\n"indoor basketball, quiet",12'),'Query','Citations')[0].dimension,'indoor basketball, quiet');

 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(readFileSync('migrations/0010_bing_ai_manual_reports.sql','utf8'));
 let dbWrites=0;
 const db={prepare(sql){
  const stmt=(args=[])=>({
   bind(...params){return stmt(params)},
   async all(){return {results:sqlite.prepare(sql).all(...args)}},
   async first(){return sqlite.prepare(sql).get(...args)||null},
   async run(){dbWrites++;return sqlite.prepare(sql).run(...args)}
  });
  return stmt();
 },async batch(items){
  sqlite.exec('BEGIN');try{
   for(const item of items)await item.run();
   sqlite.exec('COMMIT');return items.map(()=>({success:true}))
  }catch(e){sqlite.exec('ROLLBACK');throw e}
 }};
 const env={MINGEAGLE_DB:db};
 const total=()=>sqlite.prepare('SELECT COUNT(*) AS n FROM bing_ai_manual_imports').get().n;
 const read=async()=>{const r=await onRequestGet({env});return {status:r.status,body:await r.json()}};
 const post=async(body,origin='https://app.mingeagle.com')=>{
  const request=new Request('https://app.mingeagle.com/api/admin/bing-ai-report-import',{method:'POST',
   headers:{'content-type':'application/json',origin},body:JSON.stringify(body)});
  const r=await onRequestPost({env,request});return {status:r.status,body:await r.json()};
 };
 let result=await read();
 assert.equal(result.status,200);
 assert.deepEqual(result.body.latest.PAGES.rows,[]);
 assert.equal(result.body.latest.PAGES.snapshot,null);
 assert.equal(result.body.bingApiAuthenticated,false);
 assert.equal(dbWrites,0,'empty GET must not mutate D1');
 const valid={kind:'PAGES',startDate:'2026-10-01',endDate:'2026-10-12',
  manualConfirmation:true,rows:[
   {dimension:'https://www.mingeagle.com/quiet-indoor-sports-for-kids.html',citations:2},
   {dimension:'https://www.mingeagle.com/indoor-school-sports-equipment-guide.html',citations:0}
  ]};
 for(const bad of [
  {...valid,manualConfirmation:false},
  {...valid,kind:'COUNTRIES'},
  {...valid,startDate:'2026-02-30'},
  {...valid,endDate:'2099-12-31'},
  {...valid,rows:[{dimension:'https://www.mingeagle.com/quote/private-token',citations:2}]},
  {...valid,rows:[{dimension:'https://www.mingeagle.com/products.html?email=private',citations:2}]},
  {...valid,rows:[{dimension:'https://www.mingeagle.com.evil.net/products.html',citations:2}]},
  {...valid,rows:[{dimension:'https://www.mingeagle.com/nonexistent-article.html',citations:2}]},
  {...valid,rows:[{dimension:'https://www.mingeagle.com/products.html',citations:null}]},
  {...valid,rows:[{dimension:'https://www.mingeagle.com/products.html',citations:'2'}]},
  {...valid,rows:[{dimension:'https://www.mingeagle.com/products.html',citations:1.2}]},
  {...valid,rows:[{dimension:'https://www.mingeagle.com/products.html',citations:-1}]},
  {...valid,rows:[valid.rows[0],valid.rows[0]]},
  {...valid,kind:'GROUNDING_QUERIES',rows:[{dimension:'myemail@example.com',citations:2}]},
  {...valid,kind:'GROUNDING_QUERIES',rows:[{dimension:'https://www.mingeagle.com/products.html',citations:2}]},
  null, []
 ]){
  result=await post(bad);assert.equal(result.status,400,JSON.stringify(bad));
  assert.equal(total(),0);
 }
 assert.equal((await post(valid,'https://evil.test')).status,403);
 assert.equal(total(),0);
 result=await post(valid);assert.equal(result.status,200,JSON.stringify(result.body));
 assert.equal(result.body.rowCount,2);assert.equal(total(),1);
 result=await read();assert.equal(result.status,200);
 assert.equal(result.body.latest.PAGES.snapshot.row_count,2);
 assert.equal(result.body.latest.PAGES.rows.length,2);
 assert.equal(result.body.latest.GROUNDING_QUERIES.snapshot,null);
 assert.equal(result.body.latest.PAGES.rows[0].citations,2);
 const query={...valid,kind:'GROUNDING_QUERIES',rows:[{dimension:'silent basketball for kids',citations:7}]};
 result=await post(query);assert.equal(result.status,200,JSON.stringify(result.body));
 result=await read();assert.equal(result.body.latest.GROUNDING_QUERIES.rows[0].citations,7);
 assert.equal(result.body.latest.PAGES.rows[0].citations,2,'different sampled view cannot rewrite page citations');
 assert.equal(result.body.imports.length,2);
 assert.equal(result.body.bingApiAuthenticated,false);
 assert.equal(total(),2);
 sqlite.close();
 const error=await onRequestGet({env:{MINGEAGLE_DB:{prepare(){throw Error('Quota exceeded')}}}});
 assert.equal(error.status,503,'unavailable data may never masquerade as zero citations');
 console.log('PASS: owner-attested Bing AI CSV snapshots, 25-page allowlist, non-PII grounding phrases, no fake zero, isolated sampled report kinds and transactional writes.');
}finally{rmSync(temp,{recursive:true,force:true})}
