import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const dir=mkdtempSync(join(tmpdir(),'mingeagle-public-inquiries-'));
const previousFetch=globalThis.fetch;
try{
  await build({entryPoints:['functions/api/inquiries.ts'],bundle:true,platform:'node',format:'esm',outfile:join(dir,'inquiries.mjs'),logLevel:'silent'});
  const api=await import(pathToFileURL(join(dir,'inquiries.mjs')));
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(readFileSync('migrations/0001_core.sql','utf8'));
  const db={prepare(sql){const stmt=(params=[])=>({
    bind(...args){return stmt(args)},
    async first(){return sqlite.prepare(sql).get(...params)||null},
    async all(){return {results:sqlite.prepare(sql).all(...params)}},
    async run(){return {meta:sqlite.prepare(sql).run(...params)}}
  });return stmt();}};
  const env={MINGEAGLE_DB:db};
  let forwards=0,providerAccept=true;
  globalThis.fetch=async url=>{
    if(String(url).includes('formsubmit.co/ajax/')){
      forwards++;
      // A transport-level 200 can still be a rejected notification.
      return Response.json({success:providerAccept?'true':false});
    }
    throw Error('Unexpected external URL '+url);
  };
  const base='https://app.mingeagle.com/api/inquiries';
  const origin='https://www.mingeagle.com';
  const options=async o=>api.onRequestOptions({request:new Request(base,{method:'OPTIONS',headers:{origin:o,'Access-Control-Request-Method':'POST'}}),env});
  const request=async(body,headers={origin})=>api.onRequestPost({request:new Request(base,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(body)}),env});
  const count=table=>sqlite.prepare('SELECT COUNT(*) AS n FROM '+table).get().n;
  assert.equal((await options(origin)).status,204);
  assert.equal((await options(origin)).headers.get('access-control-allow-origin'),origin);
  assert.equal((await options('https://evil.example')).status,403);
  const denied=await request({firstName:'Wrong'}, {origin:'https://evil.example'});
  assert.equal(denied.status,403);
  const general={originalReference:'ME-20261010-A1B2C3D4',firstName:'Taylor',email:'taylor@example.test',requestType:'GENERAL',requestLabel:'General product question',message:'Are the silent balls washable?',privacyAck:true,leadSource:'MING EAGLE official website',products:['Flocked Silent Basketball Set'],creatorVideoCode:'V005'};
  const absentPrivacy=await request({...general,privacyAck:false});assert.equal(absentPrivacy.status,400);
  const generalRes=await request(general);
  const generalBody=await generalRes.json();
  assert.equal(generalRes.status,200,JSON.stringify(generalBody));
  assert.equal(generalRes.headers.get('access-control-allow-origin'),origin);
  assert.equal(generalBody.reference,general.originalReference);
  assert.ok(generalBody.inquiryId&&generalBody.leadId);
  assert.equal(count('leads'),1);
  assert.equal(count('inquiries'),1);
  assert.equal(count('tasks'),1);
  const videoActivity=sqlite.prepare("SELECT metadata_json FROM activities WHERE activity_type='INQUIRY_CREATED' LIMIT 1").get();
  assert.equal(JSON.parse(videoActivity.metadata_json).creatorVideoCode,'V005','Persist only buyer-submitted valid p1 creator navigation hint');
  assert.equal(sqlite.prepare('SELECT request_type FROM inquiries LIMIT 1').get().request_type,'GENERAL');
  assert.equal(sqlite.prepare('SELECT full_name FROM contacts LIMIT 1').get().full_name,'Taylor','no fabricated last name');
  const duplicate=await request(general),duplicateBody=await duplicate.json();
  assert.equal(duplicateBody.idempotent,true,'retries reuse existing inquiry');
  assert.equal(count('leads'),1);
  assert.equal(count('tasks'),1);
  const wrongContact=await request({...general,email:'different@example.test'});
  assert.equal(wrongContact.status,409,'the same ME reference cannot return another contact private CRM identifiers');
  assert.equal(count('leads'),1);
  const sample={...general,originalReference:'ME-20261010-B1B2C3D4',email:'sample@example.test',requestType:'SAMPLE',requestLabel:'Sample request',country:'US',estimatedQuantity:'1–2 samples',creatorVideoCode:'V099'};
  const invalid=await request({...sample,country:''});
  assert.equal(invalid.status,400,'sample shipping country is mandatory');
  const sampleRes=await request(sample);
  assert.equal(sampleRes.status,200,await sampleRes.text?.());
  assert.equal(count('leads'),2);
  assert.equal(count('samples'),1);
  const savedSample=sqlite.prepare("SELECT a.metadata_json FROM activities a JOIN inquiries i ON i.lead_id=a.entity_id WHERE i.reference=? AND a.activity_type='INQUIRY_CREATED'").get(sample.originalReference);
  assert.equal(JSON.parse(savedSample.metadata_json).creatorVideoCode,null,'Reject nonexistent creator IDs');
  assert.equal(sqlite.prepare("SELECT request_type FROM inquiries WHERE reference=?").get(sample.originalReference).request_type,'SAMPLE');
  providerAccept=false;
  const support=await request({...general,originalReference:'ME-20261010-C1B2C3D4',email:'support@example.test',requestType:'ORDER_SUPPORT',message:'My order has a shipping question',products:['Flocked Silent Soccer Ball']});
  assert.equal(support.status,200,'Persist CRM inquiry when email provider responds HTTP 200 but success=false');
  const supportReceipt=await support.json();
  assert.equal(supportReceipt.emailForwarded,false,'Do not claim a rejected email notification was accepted');
  providerAccept=true;
  const noticeEvents=sqlite.prepare(`SELECT a.activity_type,a.metadata_json
    FROM activities a JOIN inquiries i ON i.lead_id=a.entity_id
    WHERE i.reference=? AND a.activity_type LIKE 'INQUIRY_NOTIFICATION_%'`).all('ME-20261010-C1B2C3D4');
  assert.equal(noticeEvents.length,1,'Record one provider audit event for a saved inquiry');
  assert.equal(noticeEvents[0].activity_type,'INQUIRY_NOTIFICATION_FAILED');
  assert.deepEqual(JSON.parse(noticeEvents[0].metadata_json),{reference:'ME-20261010-C1B2C3D4'},'Audit metadata must not contain buyer PII');
  const forwardedBeforeReplay=forwards;
  const retrySupport=await request({...general,originalReference:'ME-20261010-C1B2C3D4',email:'support@example.test',requestType:'ORDER_SUPPORT',message:'My order has a shipping question',products:['Flocked Silent Soccer Ball']});
  assert.equal((await retrySupport.json()).idempotent,true,'Avoid creating another customer request on network retry');
  assert.equal(forwards,forwardedBeforeReplay,'Idempotent retry cannot send a second provider notification');
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM activities WHERE activity_type='INQUIRY_NOTIFICATION_FAILED'`).get().n,1);
  const savedSupport=sqlite.prepare("SELECT a.metadata_json FROM activities a JOIN inquiries i ON i.lead_id=a.entity_id WHERE i.reference=? AND a.activity_type='INQUIRY_CREATED'").get('ME-20261010-C1B2C3D4');
  assert.equal(JSON.parse(savedSupport.metadata_json).creatorVideoCode,null,'Do not attach a flocked-ball video to another product');
  assert.equal(sqlite.prepare("SELECT request_type FROM inquiries WHERE reference=?").get('ME-20261010-C1B2C3D4').request_type,'ORDER_SUPPORT');
  const spam=await request({...general,originalReference:'ME-20261010-D1B2C3D4',_honey:'robot'});
  assert.equal(spam.status,400,'honeypot excludes bots from D1 writes');
  assert.equal(count('inquiries'),3);
  assert.equal(count('messages'),0,'web inquiry never starts outreach');
  // Website buyer-type selections must remain first-class B2B opportunities.
  // In-memory fixtures only; never insert these buyers into production CRM.
  const institutionalTypes=[
    'Government / public agency',
    'School district / education authority',
    'Business / corporate procurement',
    'Nonprofit / community organization',
  ];
  for(const [index,customerType] of institutionalTypes.entries()){
    const originalReference='ME-20261015-B2B00'+String(index+1).padStart(3,'0');
    const institutional={
      ...general,originalReference,firstName:'Fixture',
      email:'institution'+(index+1)+'@example.test',country:'US',
      company:'Fixture Purchasing Office '+(index+1),
      customerType,estimatedQuantity:'25',requestType:'WHOLESALE',
      requestLabel:'Wholesale quote',message:'Requesting product details and written bulk quote.',
      products:['Flocked Silent Basketball Set']
    };
    const result=await request(institutional);
    assert.equal(result.status,200,'Accept institutional buyer '+customerType);
    const saved=sqlite.prepare(`SELECT i.customer_type AS customer_type,
      l.status AS lead_status,l.lead_score AS lead_score,t.priority AS priority,
      t.description AS task_description
      FROM inquiries i JOIN leads l ON l.id=i.lead_id
      JOIN tasks t ON t.lead_id=l.id WHERE i.reference=?`).get(originalReference);
    assert.equal(saved.customer_type,customerType,'Preserve original buyer type');
    assert.equal(saved.lead_status,'QUALIFIED','Institutional RFQ should not be misrouted to low-intent pool');
    assert(saved.lead_score>=80,'Named institutional 25-unit RFQ merits purchasing priority');
    assert.equal(saved.priority,'HIGH','Route institutional RFQ to high-priority follow-up');
    assert(saved.task_description.includes('confirm buyer organization'),'Follow-up must verify requirements before quoting');
  }
  assert.equal(count('inquiries'),7,'Four commercial sectors are accepted and tracked');

  // A failed D1 write must not leak raw driver/SQL diagnostics in the public response.
  const brokenDb={prepare(){throw Error('PRIVATE_D1_SQL_ERROR customer_secret_table')}};
  const failed=await api.receiveRecoveredInquiry({MINGEAGLE_DB:brokenDb},{
    originalReference:'ME-20261010-FA1L00FF',firstName:'Fixture',
    email:'fixture@example.test',country:'US',requestType:'WHOLESALE'
  });
  assert.equal(failed.status,500);
  const failedBody=await failed.json();
  assert.equal(failedBody.ok,false);
  assert.equal(failedBody.code,'INQUIRY_SAVE_FAILED');
  assert(!JSON.stringify(failedBody).includes('PRIVATE_D1_SQL_ERROR'),'Raw SQL errors cannot reach buyers');
  assert(!JSON.stringify(failedBody).includes('customer_secret_table'),'Internal table names cannot reach buyers');
  assert.equal(failed.headers.get('cache-control'),'no-store');

  assert.equal(forwards,7,'inquiry emails only forward for accepted new records, not retries');
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM activities WHERE activity_type='INQUIRY_NOTIFICATION_ACCEPTED'").get().n,6,'Provider-accepted requests are audited but not treated as inbox delivery');
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM activities WHERE activity_type='INQUIRY_NOTIFICATION_FAILED'").get().n,1);
  // Run the actual production read-side expression against the same
  // in-memory D1-compatible SQLite fixture (not a duplicated SQL example).
  const adminRead=readFileSync('functions/api/admin/data.ts','utf8');
  const statusExpr=adminRead.match(/COALESCE\(\(\s*SELECT CASE a\.activity_type[\s\S]*?\), 'UNKNOWN'\) AS notification_status/)?.[0];
  assert(statusExpr,'Admin inquiry list must expose a provider audit status');
  const statusRows=sqlite.prepare(`SELECT i.reference, ${statusExpr} FROM inquiries i`).all();
  assert.equal(statusRows.find(row=>row.reference==='ME-20261010-C1B2C3D4')?.notification_status,'FAILED');
  assert.equal(statusRows.find(row=>row.reference===general.originalReference)?.notification_status,'ACCEPTED');
  const adminUi=readFileSync('src/AdminApp.tsx','utf8');
  assert(adminUi.includes('邮件通知未确认')&&adminUi.includes('非送达确认'),'Never mistake provider acceptance for inbox delivery in the admin');
  // The same Cloudflare-facing IP may submit up to 12 requests within a
  // 15-minute window; the 13th is rejected without creating a new record.
  for(let i=0;i<13;i++){
    const reply=await request(general,{origin,'CF-Connecting-IP':'203.0.113.7'});
    assert.equal(reply.status,i===12?429:200,'IP cap must stop excessive public form requests');
    if(i===12)assert(Number(reply.headers.get('retry-after'))>0);
  }
  assert.equal(count('inquiries'),7,'rate limited requests cannot create leads');
  console.log('PASS: public form CORS, privacy, minimal legitimate inputs, inquiry types, sample validation, idempotent references, no outreach and safe mail notification.');
}finally{globalThis.fetch=previousFetch;rmSync(dir,{recursive:true,force:true})}
