import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const temp=mkdtempSync(join(tmpdir(),'hubspot-recovery-'));
const oldFetch=globalThis.fetch;
try{
  await build({entryPoints:['functions/api/admin/hubspot-inquiry-recovery.ts'],
    outfile:join(temp,'recovery.mjs'),bundle:true,platform:'node',format:'esm',logLevel:'silent'});
  const api=await import(pathToFileURL(join(temp,'recovery.mjs')));
  const dbsql=new DatabaseSync(':memory:');
  dbsql.exec(readFileSync('migrations/0001_core.sql','utf8'));
  let reads=0;
  const db={prepare(sql){reads++;if(reads>50)throw Error('Cloudflare D1 50-query invocation limit');
    const fn=(args=[])=>({bind(...v){return fn(v)},
      async first(){return dbsql.prepare(sql).get(...args)||null},
      async all(){return {results:dbsql.prepare(sql).all(...args)}},
      async run(){return {meta:dbsql.prepare(sql).run(...args)}}
    });return fn();}};
  const count=table=>dbsql.prepare('SELECT COUNT(*) AS n FROM '+table).get().n;
  const mk=(ref,email,kind='Wholesale quote',privacy='true')=>({
    submittedAt:1781111111000,pageUrl:'https://www.mingeagle.com/inquiry.html',
    values:Object.entries({
      firstname:'Dana',email,company:'Northstar Sports Group',country:'US',message:'Request details',
      me_inquiry_reference:ref,me_request_type:kind,
      me_product_configuration:'Flocked Silent Basketball Set — No. 5 / Orange',
      me_estimated_quantity:'50',me_customer_type:'Coach / trainer',me_privacy_consent:privacy,
    }).map(([name,value])=>({name,value}))
  });
  const ref1='ME-20261010-AABBAA01',ref2='ME-20261010-AABBAA02';
  const pages={
    0:{results:[mk(ref1,'dana@example.test'),mk(ref2,'sample@example.test','Sample request')],hasMore:true},
    2:{results:[mk(ref1,'dana@example.test'),mk('ME-20261010-BAD00003','ignore@example.test','Wholesale quote','false')],hasMore:false},
  };
  let externalCalls=0,mailCalls=0;
  globalThis.fetch=async(url,options)=>{
    const u=new URL(String(url));
    if(u.hostname==='formsubmit.co'){mailCalls++;throw Error('Recovered forms must not trigger duplicate forwarding');}
    assert.equal(u.hostname,'api.hubapi.com');
    assert.equal(options.headers.Authorization,'Bearer fixture-only');
    externalCalls++;
    return Response.json(pages[Number(u.searchParams.get('offset'))]||{results:[],hasMore:false});
  };
  const doSync=async env=>{
    reads=0;
    const response=await api.onRequestPost({
      request:new Request('https://app.mingeagle.com/api/admin/hubspot-inquiry-recovery',{
        method:'POST',body:JSON.stringify({action:'SYNC'})}),
      env,
    });
    const payload=await response.json();
    return {status:response.status,payload,reads};
  };
  const disabled=await doSync({MINGEAGLE_DB:db});
  assert.equal(disabled.payload.disabled,true);
  assert.equal(externalCalls,0);
  const env={MINGEAGLE_DB:db,HUBSPOT_PRIVATE_APP_TOKEN:'fixture-only'};
  const first=await doSync(env);
  assert.equal(first.status,200,JSON.stringify(first));
  assert.equal(first.payload.imported,2);
  assert.equal(first.payload.nextOffset,2);
  assert.equal(count('inquiries'),2);
  assert.equal(count('samples'),1);
  assert.equal(count('tasks'),2);
  assert(first.reads<=50);
  const second=await doSync(env);
  assert.equal(second.status,200,JSON.stringify(second));
  assert.equal(second.payload.reused,1);
  assert.equal(second.payload.skipped,1);
  assert.equal(second.payload.nextOffset,0);
  assert.equal(count('inquiries'),2,'no duplicate CRM leads or inquiries');
  const third=await doSync(env);
  assert.equal(third.payload.imported,0);
  assert.equal(third.payload.reused,2);
  assert.equal(count('leads'),2);
  assert.equal(mailCalls,0);
  assert.equal(externalCalls,3);
  assert.equal(dbsql.prepare("SELECT request_type FROM inquiries WHERE reference=?").get(ref2).request_type,'SAMPLE');
  assert.equal(count('messages'),0,'recovered enquiries do not send cold sales emails');
  console.log('PASS: HubSpot exact form fields, privacy, hourly bounded 2-item replay, D1 cursor, one customer per reference, sample workflow, 50-query limit and no duplicate notifications.');
}finally{globalThis.fetch=oldFetch;rmSync(temp,{recursive:true,force:true})}
