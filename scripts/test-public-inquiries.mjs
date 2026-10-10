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
  let forwards=0;
  globalThis.fetch=async url=>{if(String(url).includes('formsubmit.co/ajax/')){forwards++;return Response.json({success:true})}throw Error('Unexpected external URL '+url)};
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
  const general={originalReference:'ME-20261010-A1B2C3D4',firstName:'Taylor',email:'taylor@example.test',requestType:'GENERAL',requestLabel:'General product question',message:'Are the silent balls washable?',privacyAck:true,leadSource:'MING EAGLE official website'};
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
  assert.equal(sqlite.prepare('SELECT request_type FROM inquiries LIMIT 1').get().request_type,'GENERAL');
  assert.equal(sqlite.prepare('SELECT full_name FROM contacts LIMIT 1').get().full_name,'Taylor','no fabricated last name');
  const duplicate=await request(general),duplicateBody=await duplicate.json();
  assert.equal(duplicateBody.idempotent,true,'retries reuse existing inquiry');
  assert.equal(count('leads'),1);
  assert.equal(count('tasks'),1);
  const sample={...general,originalReference:'ME-20261010-B1B2C3D4',email:'sample@example.test',requestType:'SAMPLE',requestLabel:'Sample request',country:'US',estimatedQuantity:'1–2 samples'};
  const invalid=await request({...sample,country:''});
  assert.equal(invalid.status,400,'sample shipping country is mandatory');
  const sampleRes=await request(sample);
  assert.equal(sampleRes.status,200,await sampleRes.text?.());
  assert.equal(count('leads'),2);
  assert.equal(count('samples'),1);
  assert.equal(sqlite.prepare("SELECT request_type FROM inquiries WHERE reference=?").get(sample.originalReference).request_type,'SAMPLE');
  const support=await request({...general,originalReference:'ME-20261010-C1B2C3D4',email:'support@example.test',requestType:'ORDER_SUPPORT',message:'My order has a shipping question'});
  assert.equal(support.status,200);
  assert.equal(sqlite.prepare("SELECT request_type FROM inquiries WHERE reference=?").get('ME-20261010-C1B2C3D4').request_type,'ORDER_SUPPORT');
  const spam=await request({...general,originalReference:'ME-20261010-D1B2C3D4',_honey:'robot'});
  assert.equal(spam.status,400,'honeypot excludes bots from D1 writes');
  assert.equal(count('inquiries'),3);
  assert.equal(count('messages'),0,'web inquiry never starts outreach');
  assert.equal(forwards,3,'inquiry emails only forward for accepted new records, not retries');
  console.log('PASS: public form CORS, privacy, minimal legitimate inputs, inquiry types, sample validation, idempotent references, no outreach and safe mail notification.');
}finally{globalThis.fetch=previousFetch;rmSync(dir,{recursive:true,force:true})}
