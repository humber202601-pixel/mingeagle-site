import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
const tmp=mkdtempSync(join(tmpdir(),'mingeagle-v37-'));
try{
 await build({entryPoints:['functions/api/admin/inbound-growth.ts'],outfile:join(tmp,'growth.mjs'),
  bundle:true,platform:'node',format:'esm',logLevel:'silent'});
 const {onRequestGet}=await import(pathToFileURL(join(tmp,'growth.mjs')));
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync('migrations/0001_core.sql','utf8'));
 sqlite.exec(`
 INSERT INTO leads(id,source) VALUES ('l1','WEBSITE'),('l2','WEBSITE'),('l3','WEBSITE'),('l4','WEBSITE');
 INSERT INTO inquiries(id,reference,lead_id,request_type,customer_type)
 VALUES('i1','ME-V37-A','l1','WHOLESALE','Training academy'),
 ('i2','ME-V37-B','l2','GENERAL','Personal buyer'),
 ('i3','ME-V37-C','l3','SAMPLE',NULL),
 ('i4','ME-V37-D','l4','RETAIL_PARTNERSHIP','Retail store');
 INSERT INTO activities(id,entity_type,entity_id,activity_type,title,description,metadata_json)
 VALUES
 ('a1','LEAD','l1','INQUIRY_CREATED','Inbound','',
 '{"inquiryId":"i1","utmSource":"google","landingPage":"https://www.mingeagle.com/for-coaches.html"}'),
 ('a2','LEAD','l2','INQUIRY_CREATED','Inbound','',
 '{"inquiryId":"i2","utmSource":"tiktok","landingPage":"https://www.mingeagle.com/silent-basketball.html"}'),
 ('a4','LEAD','l4','INQUIRY_CREATED','Inbound','',
 '{"inquiryId":"i4","utmSource":"partner","landingPage":"https://www.mingeagle.com/wholesale.html"}');
 INSERT INTO quotes(id,reference,lead_id,status)
 VALUES('q1','Q-A','l1','SENT'),('q2','Q-B','l1','EXPIRED'),('qd','Q-D','l2','DRAFT');
 INSERT INTO orders(id,reference,lead_id,status,payment_status)
 VALUES('o1','O-A','l1','CONFIRMED','UNPAID'),('oc','O-C','l1','CANCELLED','UNPAID');
 `);
 let reads=0,writes=0;
 const db={prepare(sql){reads++;if(/^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)/i.test(sql))writes++;
  const bound=(args=[])=>({bind(...values){return bound(values)},async all(){return {results:sqlite.prepare(sql).all(...args)}}});return bound();
 }};
 const call=async(days=90)=>{
  reads=0;writes=0;const r=await onRequestGet({request:new Request('https://app.mingeagle.com/api/admin/inbound-growth?days='+days),env:{MINGEAGLE_DB:db}});
  return {status:r.status,data:await r.json(),reads,writes,cache:r.headers.get('cache-control')};
 };
 const r=await call();
 assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.reads,2,'two grouped read-only queries per admin report');
 assert.equal(r.writes,0);
 assert.equal(r.data.summary.inquiries,4);
 assert.equal(r.data.summary.b2b,2);
 assert.equal(r.data.summary.b2c,1);
 assert.equal(r.data.summary.unknown,1,'unclassified visitor is never guessed to be a retail buyer');
 assert.equal(r.data.summary.quoted,1,'duplicate legitimate quotes count once, drafts ignored');
 assert.equal(r.data.summary.ordered,1,'cancelled duplicate orders never inflate conversions');
 assert.equal(r.data.sources.find(x=>x.channel==='GOOGLE').inquiries,1);
 assert.equal(r.data.sources.find(x=>x.channel==='TIKTOK').audience,'B2C');
 assert.equal(r.data.sources.find(x=>x.channel==='PARTNER').audience,'B2B');
 assert.equal(r.data.sources.find(x=>x.channel==='DIRECT_UNKNOWN').audience,'UNKNOWN');
 assert.equal(r.data.entryPages.find(x=>x.entryPage==='FOR_COACHES').inquiries,1);
 assert.equal(r.data.entryPages.find(x=>x.entryPage==='NOT_RECORDED').inquiries,1);
 assert.match(r.cache,/no-store/);
 assert(!JSON.stringify(r.data).includes('l1')&&!JSON.stringify(r.data).includes('example.test'),
  'aggregates must not expose individual visitors or CRM IDs');
 const all=await call(0);assert.equal(all.data.summary.inquiries,4);
 const bad=await call(2);assert.equal(bad.status,400);assert.equal(bad.reads,0);
 const missing=await onRequestGet({request:new Request('https://app.mingeagle.com/api/admin/inbound-growth'),env:{}});
 assert.equal(missing.status,503);
 const ui=readFileSync('src/InboundGrowth.tsx','utf8');
 assert(ui.includes('网站访问量尚未接入')&&ui.includes('Google Search Console'));
 assert(ui.includes('data.summary.unknown'),'must visibly surface attribution uncertainty');
 console.log('PASS: 4 real grouped inquiry records, B2B/B2C/unknown split, source/landing attribution, deduped quote/order evidence, 2 D1 SELECTs, no invented visits or writes.');
}finally{rmSync(tmp,{recursive:true,force:true})}
