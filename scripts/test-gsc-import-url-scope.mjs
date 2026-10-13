import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const tmp=mkdtempSync(join(tmpdir(),'me-gsc-import-'));
try {
 const output=join(tmp,'gsc-import.mjs');
 await build({entryPoints:['functions/api/admin/search-console-import.ts'],outfile:output,bundle:true,platform:'node',format:'esm',logLevel:'silent'});
 const {onRequestPost,onRequestGet}=await import(pathToFileURL(output));
 const parserOutput=join(tmp,'csv.mjs');
 await build({entryPoints:['src/gscCsv.ts'],outfile:parserOutput,bundle:true,platform:'node',format:'esm',logLevel:'silent'});
 const {parseGscCsv}=await import(pathToFileURL(parserOutput));
 const english='Top pages,Clicks,Impressions,CTR,Position\nhttps://www.mingeagle.com/products.html,1,8,12.5%,9';
 assert.deepEqual(parseGscCsv(english,'pages'),[{dimension:'https://www.mingeagle.com/products.html',clicks:1,impressions:8,ctr:0.125,position:9}]);
 const chinese='热门网页,点击次数,展示次数,点击率,平均排名\nhttps://www.mingeagle.com/silent-soccer.html,0,6,0%,12';
 assert.equal(parseGscCsv(chinese,'pages')[0].impressions,6);
 assert.equal(parseGscCsv('Top queries,Clicks,Impressions,CTR,Position\n"silent basketball, indoor",2,20,10%,8','queries')[0].dimension,'silent basketball, indoor');
 for(const csv of [
  'Top pages,Clicks,Impressions,CTR,Position\nhttps://www.mingeagle.com/products.html,,8,0%,9',
  'Top pages,Clicks,Impressions,CTR,Position\nhttps://www.mingeagle.com/products.html,0,,0%,9',
  'Top pages,Clicks,Impressions,CTR,Position\nhttps://www.mingeagle.com/products.html,0,8,,9',
  'Top pages,Clicks,Impressions,CTR,Position\nhttps://www.mingeagle.com/products.html,9,8,50%,9',
  'Top pages,Clicks,Impressions,CTR,Position\nhttps://www.mingeagle.com/products.html,0,8,0%,NaN'
 ])assert.throws(()=>parseGscCsv(csv,'pages'),'Malformed CSV must never silently turn into valid zeros');

 const state={creates:0,batches:0,statements:[]};
 const db={
  prepare(sql) {
   const stmt={sql,args:[],bind(...args){return {...stmt,args}},async run(){state.creates++;return {success:true}}};
   return stmt;
  },
  async batch(stmts){state.batches++;state.statements=stmts.map(x=>({sql:x.sql,args:x.args}));return stmts.map(()=>({success:true}));}
 };
 const row=(dimension)=>({dimension,clicks:1,impressions:8,ctr:0.125,position:9});
 const published=JSON.parse(readFileSync('data/ai-discovery-public-urls.json','utf8'));
 assert.equal(published.urls.length,25,'CRM GSC whitelist must use the same 25 indexed-eligible source URLs as AI visibility dashboard');
 assert(published.urls.includes('https://www.mingeagle.com/quiet-indoor-sports-for-kids.html'));
 assert(published.urls.includes('https://www.mingeagle.com/indoor-school-sports-equipment-guide.html'));

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
 result=await run({...base,rows:[
  row('https://www.mingeagle.com/quiet-indoor-sports-for-kids.html'),
  row('https://www.mingeagle.com/indoor-school-sports-equipment-guide.html')
 ]});
 assert.equal(result.status,200,'Both new GEO intent guides must be accepted by the real GSC importer');
 assert.equal(state.batches,3);

 const invalid=[
  'https://notmingeagle.com/products.html',
  'https://www.mingeagle.com/nonexistent-ai-guide.html',
  'https://www.mingeagle.com/quiet-indoor-sports-for-kids.html?private=1',
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
  assert.equal(state.batches,3,'rejected data never persisted');
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
  assert.equal(state.batches,3);
 }
 const queries=await run({...base,kind:'queries',rows:[row('silent basketball wholesale')]});
 assert.equal(queries.status,200,'normal keyword CSV remains supported');
 assert.equal(state.batches,3);
 const badDb={prepare(){return {async all(){throw Error('Simulated D1 quota exceeded')}}}};
 const readFail=await onRequestGet({env:{MINGEAGLE_DB:badDb}});
 assert.equal(readFail.status,503,'D1 failure must be visible, never a successful empty report');
 assert.equal((await readFail.json()).ok,false);
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(readFileSync('migrations/0008_gsc_manual_imports.sql','utf8'));
 const localDB={
  prepare(sql){
   const bound=(args=[])=>({
    bind(...params){return bound(params)},
    async all(){return {results:sqlite.prepare(sql).all(...args)}},
    async run(){return {success:true,meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}}}
   });
   return bound();
  },
  async batch(stmts){
   sqlite.exec('BEGIN');try{
    const results=[];for(const stmt of stmts)results.push(await stmt.run());
    sqlite.exec('COMMIT');return results;
   }catch(e){sqlite.exec('ROLLBACK');throw e}
  }
 };
 let blank=await onRequestGet({env:{MINGEAGLE_DB:localDB}});
 assert.equal(blank.status,200,'Migrated empty table is a real empty history, not a D1 failure');
 assert.deepEqual((await blank.json()).imports,[]);
 const realRequest=new Request('https://app.mingeagle.com/api/admin/search-console-import',{
  method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({...base,rows:[row('https://www.mingeagle.com/products.html')]})
 });
 const saved=await onRequestPost({request:realRequest,env:{MINGEAGLE_DB:localDB}});
 assert.equal(saved.status,200,JSON.stringify(await saved.json()));
 const liveHistory=await onRequestGet({env:{MINGEAGLE_DB:localDB}});
 assert.equal(liveHistory.status,200);
 const stored=(await liveHistory.json()).imports;
 assert.equal(stored.length,1);
 assert.equal(stored[0].row_count,1);
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS c FROM search_console_rows').get().c,1);
 sqlite.close();
 console.log('PASS: GSC canonical www/apex imports, site-owned public paths, no private URL leakage, numeric validation, and safe rejection.');
} finally {rmSync(tmp,{recursive:true,force:true});}
