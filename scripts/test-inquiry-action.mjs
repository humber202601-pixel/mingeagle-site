import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const dir=mkdtempSync(join(tmpdir(),'mingeagle-inquiry-action-'));
try{
  await build({entryPoints:['functions/api/admin/inquiry-action.ts'],bundle:true,platform:'node',format:'esm',outfile:join(dir,'inquiry-action.mjs'),logLevel:'silent'});
  const api=await import(pathToFileURL(join(dir,'inquiry-action.mjs')));
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(readFileSync('migrations/0001_core.sql','utf8'));
  const db={prepare(sql){return {
    bind(...params){return {
      async first(){return sqlite.prepare(sql).get(...params)||null},
      async run(){const result=sqlite.prepare(sql).run(...params);return {meta:{changes:Number(result.changes||0)}}}
    }}
  }}};
  const env={MINGEAGLE_DB:db};
  const endpoint='https://app.mingeagle.com/api/admin/inquiry-action';
  const request=async(body)=>api.onRequestPost({request:new Request(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),env});
  sqlite.exec(`
    INSERT INTO contacts(id,full_name,email) VALUES
      ('contact-1','Test Buyer','buyer@example.test'),
      ('contact-2','Quote Buyer','quote@example.test'),
      ('contact-3','Order Buyer','order@example.test');
    INSERT INTO leads(id,primary_contact_id,source,status) VALUES
      ('lead-1','contact-1','WEBSITE','ANALYZED'),
      ('lead-2','contact-2','WEBSITE','ANALYZED'),
      ('lead-3','contact-3','WEBSITE','ANALYZED');
    INSERT INTO inquiries(id,reference,lead_id,contact_id,message) VALUES
      ('inq-1','ME-TEST-CLOSE-001','lead-1','contact-1','Synthetic QA inquiry'),
      ('inq-2','ME-TEST-CLOSE-002','lead-2','contact-2','Inquiry with active quote'),
      ('inq-3','ME-TEST-CLOSE-003','lead-3','contact-3','Inquiry with historical order');
    INSERT INTO tasks(id,lead_id,title,status) VALUES
      ('task-1','lead-1','Review wholesale inquiry ME-TEST-CLOSE-001','OPEN'),
      ('task-2','lead-1','Follow up customer email','OPEN');
    INSERT INTO messages(id,lead_id,contact_id,channel,direction,subject,body,intent)
      VALUES ('msg-1','lead-1','contact-1','EMAIL','OUTBOUND','Prior history','Retain this history','OUTREACH');
    INSERT INTO quotes(id,reference,inquiry_id,lead_id,status) VALUES
      ('quote-2','Q-TEST-002','inq-2','lead-2','SENT'),
      ('quote-3','Q-TEST-003','inq-3','lead-3','DECLINED');
    INSERT INTO orders(id,reference,quote_id,status,total) VALUES
      ('order-3','O-TEST-003','quote-3','CANCELLED',0);
  `);
  const tooShort=await request({inquiryId:'inq-1',action:'CLOSE',reason:'test'});
  assert.equal(tooShort.status,400,'reason is required for an audit trail');
  assert.equal(sqlite.prepare("SELECT status FROM inquiries WHERE id='inq-1'").get().status,'NEW');
  const activeQuote=await request({inquiryId:'inq-2',action:'CLOSE',reason:'Internal test cleanup; quote is still active.'});
  assert.equal(activeQuote.status,409,'active quote must block inquiry closure');
  assert.equal(sqlite.prepare("SELECT status FROM inquiries WHERE id='inq-2'").get().status,'NEW');
  const linkedOrder=await request({inquiryId:'inq-3',action:'CLOSE',reason:'Internal test cleanup; linked order must be preserved.'});
  assert.equal(linkedOrder.status,409,'any linked order must block inquiry closure, including cancelled orders');
  assert.equal(sqlite.prepare("SELECT status FROM inquiries WHERE id='inq-3'").get().status,'NEW');
  const closed=await request({inquiryId:'inq-1',action:'CLOSE',reason:'Confirmed internal QA inquiry; not a real customer request.'});
  const body=await closed.json();
  assert.equal(closed.status,200,JSON.stringify(body));
  assert.equal(body.status,'CLOSED');
  assert.equal(body.cancelledTasks,1,'only the matching inquiry review task is cancelled');
  assert.deepEqual(body.preserved,['contact','lead','messages','quotes','orders','existing activities']);
  assert.equal(sqlite.prepare("SELECT status FROM inquiries WHERE id='inq-1'").get().status,'CLOSED');
  assert.equal(sqlite.prepare("SELECT status FROM tasks WHERE id='task-1'").get().status,'CANCELLED');
  assert.equal(sqlite.prepare("SELECT status FROM tasks WHERE id='task-2'").get().status,'OPEN','unrelated follow-up task is preserved');
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM contacts WHERE id='contact-1'").get().n,1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM leads WHERE id='lead-1'").get().n,1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM messages WHERE id='msg-1'").get().n,1);
  const audit=sqlite.prepare("SELECT activity_type,description,metadata_json FROM activities WHERE entity_type='INQUIRY' AND entity_id='inq-1'").get();
  assert.equal(audit.activity_type,'INQUIRY_CLOSED');
  assert.match(audit.description,/not a real customer request/);
  assert.equal(JSON.parse(audit.metadata_json).outboundEmailSent,false);
  const again=await request({inquiryId:'inq-1',action:'CLOSE',reason:'Repeated request; should be idempotent.'});
  assert.equal((await again.json()).alreadyClosed,true);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM activities WHERE entity_type='INQUIRY' AND entity_id='inq-1'").get().n,1,'repeat closure does not duplicate audit activity');
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM messages").get().n,1,'no email or message is sent');
  console.log('PASS: inquiry closure requires an audit reason, blocks quotes/orders, preserves customer history, cancels only the matching review task, and is idempotent.');
}finally{rmSync(dir,{recursive:true,force:true})}
