import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {transform} from 'esbuild';

const ts=readFileSync('src/b2bTaskSort.ts','utf8');
const js=(await transform(ts,{loader:'ts',format:'esm',target:'es2022'})).code;
const {prioritizeB2BTasks,b2bTaskBucket}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const tasks=[
 {id:'discovery-outreach',lead_source:'DISCOVERY',type:'OUTREACH_FOLLOW_UP',priority:'HIGH',due_at:'2026-10-01 10:00:00'},
 {id:'website-followup',lead_source:'WEBSITE',type:'FOLLOW_UP',priority:'MEDIUM',due_at:'2026-10-10 10:00:00'},
 {id:'website-quote',lead_source:'WEBSITE',type:'QUOTE_FOLLOW_UP',priority:'HIGH',due_at:'2026-10-12 10:00:00'},
 {id:'other-reply',lead_source:'NONE',type:'REPLY_ACTION',priority:'HIGH',due_at:'2026-10-12 10:00:00'},
 {id:'website-outreach',lead_source:'WEBSITE',type:'OUTREACH_FOLLOW_UP',priority:'MEDIUM',due_at:'2026-10-11 10:00:00'},
 {id:'discovery-task',lead_source:'DISCOVERY',type:'FOLLOW_UP',priority:'LOW',due_at:'2026-10-10 10:00:00'},
];
const expected=['website-quote','website-followup','other-reply','website-outreach','discovery-task','discovery-outreach'];
assert.deepEqual(prioritizeB2BTasks(tasks).map(t=>t.id),expected,'Customer-initiated quote work must outrank cold outreach');
assert.equal(tasks[0].id,'discovery-outreach','Sorting must never mutate the incoming API task array');
assert.equal(b2bTaskBucket(tasks[1]),0);
assert.equal(b2bTaskBucket(tasks[0]),4);

// Execute the actual dashboard SQL, rather than only checking text patterns.
const api=readFileSync('functions/api/admin/data.ts','utf8');
const found=api.match(/db\.prepare\(`(SELECT t\.id, t\.lead_id, t\.type[\s\S]*?LIMIT 50)`\)\.all\(\)/);
assert(found,'Dashboard must fetch source and lead_id with active tasks');
const sql=found[1];
const db=new DatabaseSync(':memory:');
db.exec(`CREATE TABLE leads(id TEXT PRIMARY KEY,source TEXT);
CREATE TABLE tasks(id TEXT PRIMARY KEY,lead_id TEXT,type TEXT,title TEXT,description TEXT,priority TEXT,due_at TEXT,status TEXT,company_id TEXT,contact_id TEXT,created_at TEXT);
CREATE TABLE companies(id TEXT PRIMARY KEY,name TEXT);
CREATE TABLE contacts(id TEXT PRIMARY KEY,full_name TEXT);
INSERT INTO leads VALUES('L-website','WEBSITE'),('L-discovery','DISCOVERY');`);
for(const task of tasks){
 const source=task.lead_source;
 const leadId=source==='WEBSITE'?'L-website':source==='DISCOVERY'?'L-discovery':null;
 db.prepare('INSERT INTO tasks(id,lead_id,type,title,description,priority,due_at,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
  .run(task.id,leadId,task.type,task.type,'fixture',task.priority,task.due_at,'OPEN','2026-10-12 10:00:00');
}
const received=db.prepare(sql).all();
assert.deepEqual(received.map(r=>r.id),expected,'SQL dashboard order matches CRM task manager order');
assert.equal(received[0].lead_id,'L-website','Quote-task deep links require a lead id');
assert.equal(received[0].lead_source,'WEBSITE','Website source is exposed without buyer PII');
db.close();

const manager=readFileSync('src/TaskManager.tsx','utf8');
const admin=readFileSync('src/AdminApp.tsx','utf8');
assert(manager.includes('prioritizeB2BTasks(tasks)'));
assert(admin.includes('prioritizeB2BTasks(data.tasks).slice(0,8)'));
assert(manager.includes('const relevantInquiry = isQuoteTask && task.lead_id'),'Quote followups link to associated inquiries');
assert(manager.includes('查看关联询盘'),'Quoted or finalized inquiries remain discoverable from task list');
assert(!manager.includes('autoSendFollowups('),'Task sorting must never send mail');
console.log('PASS: inbound wholesale quotes and buyer follow-ups precede discovery; dashboard SQL, task UI, inquiry deep link and read-only behavior match.');
