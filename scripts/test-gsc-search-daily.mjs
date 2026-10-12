import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
const dir=mkdtempSync(join(tmpdir(),'gsc-daily-'));
try{
 const outfile=join(dir,'api.mjs');
 await build({entryPoints:['functions/api/admin/gsc-search-daily.ts'],outfile,bundle:true,platform:'node',format:'esm',logLevel:'silent'});
 const {onRequestGet}=await import(pathToFileURL(outfile));
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync('migrations/0007_gsc_search_daily.sql','utf8'));
 let writes=0;
 const db={prepare(sql){let args=[];return {bind(...values){args=values;return this},async all(){return {results:sqlite.prepare(sql).all(...args)}},async run(){writes++;throw Error('read endpoint must never write')}}}};
 const request=(query='')=>new Request('https://app.mingeagle.com/api/admin/gsc-search-daily'+query);
 const call=async(q='')=>{const resp=await onRequestGet({request:request(q),env:{MINGEAGLE_DB:db}});return {status:resp.status,data:await resp.json(),headers:resp.headers}};
 let r=await call();assert.equal(r.status,200);assert.equal(r.data.connected,false);assert.deepEqual(r.data.rows,[]);
 assert.equal(r.data.timezone,'America/Los_Angeles');assert.match(r.headers.get('cache-control'),/no-store/);
 assert.equal((await call('?days=3')).status,400);
 const day=sqlite.prepare("SELECT date('now','-1 day') AS day").get().day;
 sqlite.prepare('INSERT INTO gsc_search_daily(date_pacific,property,clicks,impressions,ctr,average_position,source) VALUES (?,?,?,?,?,?,?)')
  .run(day,'sc-domain:mingeagle.com',2,33,2/33,7.3,'GOOGLE_SEARCH_CONSOLE_API');
 r=await call('?days=30');assert.equal(r.data.connected,true);assert.equal(r.data.rows.length,1);
 assert.equal(r.data.rows[0].clicks,2);assert.equal(r.data.rows[0].impressions,33);
 assert.equal(r.data.coverage.to,day);assert.equal(r.data.source,'Google Search Console API');
 assert(!JSON.stringify(r.data).includes('queryText'));assert.equal(writes,0);
 sqlite.close();console.log('PASS: sitewide read-only GSC daily snapshots, time-zone and missing-data safety.');
}finally{rmSync(dir,{recursive:true,force:true})}
