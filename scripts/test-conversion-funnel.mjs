import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const dir=mkdtempSync(join(tmpdir(),'mingeagle-funnel-'));
try{
  await build({entryPoints:['functions/api/admin/conversion-funnel.ts'],
    outfile:join(dir,'api.mjs'),bundle:true,format:'esm',platform:'node',logLevel:'silent'});
  const {onRequestGet}=await import(pathToFileURL(join(dir,'api.mjs')));
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(readFileSync('migrations/0001_core.sql','utf8'));
  let reads=0,writes=0;
  const db={prepare(sql){
    reads++;if(/^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)/i.test(sql))writes++;
    const statement=(args=[])=>({bind(...values){return statement(values)},
      async all(){return {results:sqlite.prepare(sql).all(...args)}},
      async first(){return sqlite.prepare(sql).get(...args)||null}});
    return statement();
  }};
  sqlite.exec(`
    INSERT INTO companies(id,name,customer_type,phone) VALUES
      ('academy','Northstar Academy','BASKETBALL_TRAINING',NULL),
      ('store','Hoops Retail','SPORTS_STORE',NULL),
      ('website','Website Buyer','SPORTS_STORE',NULL),
      ('gym','Westlake Gym','BASKETBALL_GYM','214-555-0131');
    INSERT INTO contacts(id,company_id,email,phone,do_not_contact) VALUES
      ('ct1','academy','academy@example.test',NULL,0),
      ('ct2','academy',NULL,'2145550123',0),
      ('ct3','store','do-not-contact@example.test',NULL,1),
      ('ct4','website','buyer@example.test',NULL,0);
    INSERT INTO leads(id,company_id,primary_contact_id,source,status,lead_score) VALUES
      ('l1','academy','ct1','DISCOVERY','CONTACTED',95),
      ('l2','academy','ct2','DISCOVERY','READY_TO_CONTACT',85),
      ('l3','store','ct3','DISCOVERY','NOT_INTERESTED',70),
      ('l4','website','ct4','WEBSITE','DISCOVERED',75),
      ('l5','website','ct4','WEBSITE','CONTACTED',77),
      ('l6','gym',NULL,'DISCOVERY','DISCOVERED',66);
    INSERT INTO leads(id,company_id,primary_contact_id,source,status,created_at) VALUES
      ('old','gym',NULL,'DISCOVERY','DISCOVERED',datetime('now','-400 days'));
    INSERT INTO messages(id,lead_id,channel,direction,body,sent_at) VALUES
      ('out1','l1','EMAIL','OUTBOUND','Hi',datetime('now','-6 days')),
      ('out2','l1','EMAIL','OUTBOUND','Following up',datetime('now','-5 days')),
      ('in1','l1','EMAIL','INBOUND','Pricing?',datetime('now','-4 days')),
      ('out3','l3','EMAIL','OUTBOUND','Old attempt',datetime('now','-7 days')),
      ('initial','l4','WEBSITE','INBOUND','Initial inquiry',datetime('now','-3 days')),
      ('out5','l5','EMAIL','OUTBOUND','Hello',datetime('now','-3 days')),
      ('incomingWeb','l5','WEBSITE','INBOUND','Website inquiry, not email response',datetime('now','-2 days'));
    INSERT INTO quotes(id,reference,lead_id,status) VALUES
      ('draft','Q-1','l2','DRAFT'),
      ('q2','Q-2','l1','SENT'),
      ('q3','Q-3','l1','EXPIRED');
    INSERT INTO orders(id,reference,lead_id,status,payment_status) VALUES
      ('o1','O-1','l1','CONFIRMED','PAID'),
      ('o2','O-2','l1','CANCELLED','UNPAID'),
      ('o3','O-3','l2','DRAFT','UNPAID');
  `);
  const load=async(days=90,source='DISCOVERY')=>{
    reads=0;writes=0;
    const request=new Request('https://app.mingeagle.com/api/admin/conversion-funnel?days='+days+'&source='+source);
    const response=await onRequestGet({request,env:{MINGEAGLE_DB:db}});
    return {status:response.status,data:await response.json(),reads,writes,headers:response.headers};
  };
  const r=await load();
  assert.equal(r.status,200,JSON.stringify(r.data));
  assert.equal(r.reads,2,'page fetch must use only 2 aggregated/read queries');
  assert.equal(r.writes,0,'dashboard is strictly read-only');
  assert.equal(r.data.summary.total,4,'90 day DISCOVERY cohort excludes older record and website leads');
  assert.equal(r.data.summary.withContact,4,'organization phone counts as actual reachable business contact');
  assert.equal(r.data.summary.contactable,3,'opted-out clients are excluded');
  assert.equal(r.data.summary.emailReady,1);
  assert.equal(r.data.summary.readyToReview,2);
  assert.equal(r.data.summary.contacted,2,'sent email count is per-lead despite multiple messages');
  assert.equal(r.data.summary.replied,1,'exclude unrelated initial website inquiries');
  assert.equal(r.data.summary.quoted,1,'exclude drafts, deduplicate sent/expired quotes');
  assert.equal(r.data.summary.ordered,1,'exclude draft/cancelled orders, count actual');
  assert.equal(r.data.summary.paid,1);
  assert.equal(r.data.prospects.length,2);
  assert.equal(r.data.prospects[0].id,'l2');
  assert.equal(r.data.prospects.find(p=>p.id==='l6')?.phone,'214-555-0131','organization phone is retained in review list');
  assert(!r.data.prospects.some(p=>p.id==='l3'),'opt-out must never surface in outreach shortlist');
  assert(!r.data.prospects.some(p=>p.id==='l1'),'previously contacted must not surface in cold contact list');
  assert(r.headers.get('cache-control').includes('no-store'));
  const web=await load(90,'WEBSITE');
  assert.equal(web.data.summary.total,2);
  assert.equal(web.data.summary.replied,0);
  assert.equal(web.data.summary.contacted,1);
  assert.equal(web.data.summary.quoted,0);
  const all=await load(0,'ALL');
  assert.equal(all.data.summary.total,7);
  const newer=await load(30,'DISCOVERY');
  assert.equal(newer.data.summary.total,4);
  const old=await load(0,'DISCOVERY');
  assert.equal(old.data.summary.total,5);
  const bad=await load(8,'DISCOVERY');
  assert.equal(bad.status,400);
  assert.equal(bad.reads,0,'invalid filtering must cost no D1 reads');
  const evil=await load(90,'DISCOVERY%27%3BDELETE%20FROM%20leads%3B--');
  assert.equal(evil.status,400);
  assert.equal(evil.reads,0);
  const noDb=await onRequestGet({request:new Request('https://app.mingeagle.com/api/admin/conversion-funnel'),env:{}});
  assert.equal(noDb.status,503);
  const serialized=JSON.stringify(r.data);
  assert(!serialized.includes('out1')&&!serialized.includes('Q-2'),'aggregate stats must not leak email bodies or quote identifiers');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM leads').get().n,7,'dashboard must never modify CRM records');
  console.log('PASS: real conversion cohort by date/source/category; distinct contact/outbound/reply/quote/order/paid facts; opt-out exclusion, no duplicate stage inflation, 2 read queries and no D1 writes.');
}finally{rmSync(dir,{recursive:true,force:true})}
