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
 '{"inquiryId":"i4","utmSource":"partner","landingPage":"https://www.mingeagle.com/wholesale.html"}'),
 ('a5','LEAD','l1','INQUIRY_CREATED','Duplicate webhook retry','',
 '{"inquiryId":"i1","utmSource":"spam-tag","landingPage":"https://www.mingeagle.com/products.html"}');
 INSERT INTO quotes(id,reference,lead_id,status)
 VALUES('q1','Q-A','l1','SENT'),('q2','Q-B','l1','EXPIRED'),('qd','Q-D','l2','DRAFT');
 UPDATE quotes SET inquiry_id='i1' WHERE id='q1';
 UPDATE quotes SET inquiry_id='i1' WHERE id='q2';
 -- Same lead has another inquiry, but no direct quote for it: do not credit it.
 INSERT INTO inquiries(id,reference,lead_id,request_type,customer_type)
 VALUES('i1-repeat','ME-V37-A2','l1','GENERAL','Training academy');
 INSERT INTO orders(id,reference,lead_id,status,payment_status)
 VALUES('o1','O-A','l1','CONFIRMED','UNPAID'),('oc','O-C','l1','CANCELLED','UNPAID');
 UPDATE orders SET quote_id='q1' WHERE id='o1';
 -- An unrelated same-lead order must not be credited to a specific inquiry.
 INSERT INTO orders(id,reference,lead_id,status,payment_status)
 VALUES('o2','O-UNRELATED','l2','CONFIRMED','UNPAID');
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
 assert.equal(r.data.summary.inquiries,5,'Original 4 + an additional distinct same-lead inquiry; retry activity not duplicated');
 assert.equal(r.data.summary.b2b,3);
 assert.equal(r.data.summary.b2c,1);
 assert.equal(r.data.summary.unknown,1,'unclassified visitor is never guessed to be a retail buyer');
 assert.equal(r.data.summary.quoted,2,'Lead-based counts can associate the same customer with two inquiries');
 assert.equal(r.data.summary.exactQuoted,1,'Two quotes for the same inquiry count as one directly attributed inquiry');
 assert.equal(r.data.summary.exactOrdered,1,'Confirmed order linked through quote.id; unrelated lead order is excluded');
 assert.equal(r.data.summary.ordered,3,'Lead-associated counts can include multiple inquiries from one lead and unrelated orders');
 assert.equal(r.data.sources.find(x=>x.channel==='GOOGLE').inquiries,1);
 assert.equal(r.data.sources.find(x=>x.channel==='OTHER_TAGGED'),undefined,
   'Retry webhook activity must not steal original Google attribution');
 assert.equal(r.data.summary.exactOrdered<=r.data.summary.exactQuoted,true);
 assert.equal(r.data.dataProvenance.websiteVisits.connected,false);
 assert.equal(r.data.dataProvenance.websiteVisits.count,null);
 assert.equal(r.data.dataProvenance.searchImpressions.count,null);
 assert.equal(r.data.sources.reduce((sum,x)=>sum+x.inquiries,0),5,
   'Duplicate activities cannot multiply inquiry cohorts');
 assert.equal(r.data.sources.find(x=>x.channel==='TIKTOK').audience,'B2C');
 assert.equal(r.data.sources.find(x=>x.channel==='PARTNER').audience,'B2B');
 assert(r.data.sources.some(x=>x.channel==='DIRECT_UNKNOWN'&&x.audience==='UNKNOWN'),
  'Original unclassified sample stays UNKNOWN even with an extra same-lead inquiry');
 assert.equal(r.data.entryPages.find(x=>x.entryPage==='FOR_COACHES').inquiries,1);
 assert.equal(r.data.entryPages.find(x=>x.entryPage==='FOR_COACHES').quoted,1);
 assert.equal(r.data.entryPages.find(x=>x.entryPage==='FOR_COACHES').ordered,1,
    'The documented landing only belongs to the original inquiry');
 assert.equal(r.data.entryPages.find(x=>x.entryPage==='FOR_COACHES').exactQuoted,1);
 assert.equal(r.data.entryPages.find(x=>x.entryPage==='FOR_COACHES').exactOrdered,1);
 assert.equal(r.data.entryPages.find(x=>x.entryPage==='NOT_RECORDED').inquiries,2);
 assert.match(r.cache,/no-store/);
 assert(!JSON.stringify(r.data).includes('l1')&&!JSON.stringify(r.data).includes('example.test'),
  'aggregates must not expose individual visitors or CRM IDs');
 const all=await call(0);assert.equal(all.data.summary.inquiries,5);
 const bad=await call(2);assert.equal(bad.status,400);assert.equal(bad.reads,0);
 const missing=await onRequestGet({request:new Request('https://app.mingeagle.com/api/admin/inbound-growth'),env:{}});
 assert.equal(missing.status,503);
 const ui=readFileSync('src/InboundGrowth.tsx','utf8');
 assert(ui.includes('网站访问统计与搜索曝光')&&ui.includes('Google Search Console'));
 assert(ui.includes('直接关联订单的询盘'));
 assert(ui.includes('同客户关联订单'));
 assert(ui.includes('未连接'),'Visits or search impressions must remain unavailable, not fabricated');
 assert(ui.includes('Cloudflare Web Analytics 真实访问报表'),'Must link to real provider dashboard');
 assert(ui.includes('CRM 不持有 Cloudflare 分析 API 密钥'),'Server has no provider API credential');
 assert(ui.includes('日统计快照'),'Analytics only shown from dated provider snapshots');
 assert(ui.includes('不能报告访问量'),'Unknown website visits must not be fabricated as zero');
 assert(ui.includes('data.summary.unknown'),'must visibly surface attribution uncertainty');
 console.log('PASS: 5 inquiry cohorts, replay activity dedup, strict quote.id/inquiry.id/order.quote_id linkage, lead association warning, 2 read-only D1 queries and no invented visits.');
}finally{rmSync(tmp,{recursive:true,force:true})}
