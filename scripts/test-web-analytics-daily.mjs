import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
const temp=mkdtempSync(join(tmpdir(),'web-analytics-daily-'));
try{
 const compile=async(file,name)=>{
  const outfile=join(temp,name+'.mjs');
  await build({entryPoints:[file],outfile,bundle:true,platform:'node',format:'esm',logLevel:'silent'});
  return import(pathToFileURL(outfile));
 };
 const api=await compile('functions/api/admin/web-analytics-daily.ts','api');
 const auth=await compile('functions/api/admin/_middleware.ts','auth');
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(readFileSync('migrations/0006_web_analytics_daily.sql','utf8'));
 let businessWrites=0;
 const db={prepare(sql){
   const stmt={params:[],bind(...params){stmt.params=params;return stmt},
    async all(){return {results:sqlite.prepare(sql).all(...stmt.params)}},
    async first(){return sqlite.prepare(sql).get(...stmt.params)||null},
    async run(){
     if(/^(CREATE TABLE IF NOT EXISTS admin_auth_|CREATE INDEX IF NOT EXISTS idx_admin_auth_|INSERT INTO admin_auth_|DELETE FROM admin_auth_)/i.test(sql.trim()))
      return {success:true,meta:{changes:Number(sqlite.prepare(sql).run(...stmt.params).changes)}};
     businessWrites++;throw Error('READ_ONLY_DATA_ROUTE_MUST_NOT_WRITE');
    }
   };return stmt;
 }};
 const env={MINGEAGLE_DB:db,ADMIN_ACCESS_KEY:'only-for-test'};
 const call=async(query='',authenticated=true)=>{
  const request=new Request('https://app.mingeagle.com/api/admin/web-analytics-daily'+query,{
    headers:authenticated?{'x-admin-key':'only-for-test'}:{}});
  const res=await auth.onRequest({request,env,next:()=>api.onRequestGet({request,env})});
  return {status:res.status,json:await res.json(),cache:res.headers.get('cache-control')||''};
 };
 let r=await call('',false);assert.equal(r.status,401,'Cannot expose account analytics to anonymous users');
 r=await call();assert.equal(r.status,200);
 assert.equal(r.json.connected,false);
 assert.equal(r.json.rows.length,0);
 assert.equal(r.json.coverage.fromUTC,null);
 assert.equal(r.json.coverage.toUTC,null);
 assert.equal(r.json.coverage.latestFetchUTC,null);
 assert.equal(r.json.source,'Cloudflare Web Analytics GraphQL');
 assert(r.cache.includes('no-store'));
 assert.equal(businessWrites,0);
 r=await call('?days=7');assert.equal(r.status,400,'Unsupported range rejected');
 assert.equal(businessWrites,0);
 const date=sqlite.prepare("SELECT date('now','-1 days') AS d").get().d;
 const token='c229a4f21594480eb5a1381a1b1e67f0';
 sqlite.prepare(`INSERT INTO web_analytics_daily(date_utc,site_tag,host,provider_visits,sampled_pageviews,source)
 VALUES (?,?,?,?,?,?)`).run(date,token,'mingeagle.com',23,34,'CLOUDFLARE_RUM_GRAPHQL');
 r=await call('?days=30');assert.equal(r.status,200);
 assert.equal(r.json.connected,true);
 assert.equal(r.json.rows.length,1);
 assert.equal(r.json.rows[0].dateUTC,date);
 assert.equal(r.json.rows[0].providerVisits,23);
 assert.equal(r.json.rows[0].sampledPageviews,34);
 assert.equal(r.json.coverage.observedDays,1);
 assert(!JSON.stringify(r.json).includes('only-for-test'),'No auth secret in report');
 assert(!JSON.stringify(r.json).includes('visitorIp'),'No visitor PII');
 assert.equal(businessWrites,0);
 sqlite.prepare('INSERT INTO web_analytics_daily(date_utc,site_tag,host,provider_visits,sampled_pageviews,source) VALUES (?,?,?,?,?,?)')
   .run(sqlite.prepare("SELECT date('now') AS d").get().d,token,'mingeagle.com',0,0,'CLOUDFLARE_RUM_GRAPHQL');
 r=await call('?days=30');
 assert.equal(r.json.connected,true,'Explicit provider-reported 0 differs from absent day');
 assert.equal(r.json.rows.length,2);
 assert.equal(r.json.rows[0].providerVisits,0);
 r=await call('?days=0');assert.equal(r.json.rows.length,2);
 assert.equal(businessWrites,0);
 sqlite.close();
 console.log('PASS: admin-only read-only Cloudflare RUM daily aggregates, unknown vs zero, provenance/date, no visitor PII or CRM writes.');
}finally{rmSync(temp,{recursive:true,force:true})}
