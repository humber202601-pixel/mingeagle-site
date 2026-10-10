import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
const dir=mkdtempSync(join(tmpdir(),'turnstile-inquiries-'));
const originalFetch=globalThis.fetch;
try{
  await build({entryPoints:['functions/api/inquiries.ts','functions/api/turnstile-config.ts'],
    outdir:dir,bundle:true,platform:'node',format:'esm',outExtension:{'.js':'.mjs'},entryNames:'[name]',logLevel:'silent'});
  const api=await import(pathToFileURL(join(dir,'inquiries.mjs')));
  const config=await import(pathToFileURL(join(dir,'turnstile-config.mjs')));
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(readFileSync('migrations/0001_core.sql','utf8'));
  const db={prepare(sql){const stmt=(params=[])=>({bind(...args){return stmt(args)},
    async first(){return sqlite.prepare(sql).get(...params)||null},
    async all(){return {results:sqlite.prepare(sql).all(...params)}},
    async run(){return {meta:sqlite.prepare(sql).run(...params)}}});return stmt()}};
  const count=table=>sqlite.prepare('SELECT COUNT(*) AS n FROM '+table).get().n;
  const origin='https://www.mingeagle.com',base='https://app.mingeagle.com';
  const env={MINGEAGLE_DB:db,TURNSTILE_ENABLED:'1',TURNSTILE_SITE_KEY:'public-site',TURNSTILE_SECRET_KEY:'secret-private'};
  const body={originalReference:'ME-20261010-DDEEFF01',firstName:'Casey',email:'casey@example.test',
    privacyAck:true,requestType:'GENERAL',message:'Product question'};
  let turnstileCalls=0,forwards=0,nextVerify={success:true,hostname:'www.mingeagle.com',action:'mingeagle_inquiry'};
  globalThis.fetch=async(url,init)=>{
    if(String(url).includes('turnstile/v0/siteverify')){
      turnstileCalls++;
      assert.equal(init.method,'POST');
      assert.equal(init.headers['content-type'],'application/x-www-form-urlencoded');
      const params=new URLSearchParams(init.body);
      assert.equal(params.get('secret'),'secret-private');
      assert.equal(params.get('response'),'fixture-token');
      return Response.json(nextVerify);
    }
    if(String(url).includes('formsubmit.co/ajax')){forwards++;return Response.json({success:true})}
    throw Error('Unexpected endpoint '+url)
  };
  const post=async(x={},e=env,hostOrigin=origin)=>{
    const result=await api.onRequestPost({env:e,request:new Request(base+'/api/inquiries',{
      method:'POST',headers:{'content-type':'application/json',origin:hostOrigin},
      body:JSON.stringify({...body,...x})})});
    return {status:result.status,body:await result.json(),cors:result.headers.get('access-control-allow-origin')};
  };
  const getConfig=async(e=env,hostOrigin=origin)=>{
    const r=await config.onRequestGet({request:new Request(base+'/api/turnstile-config',{headers:{origin:hostOrigin}}),env:e});
    return {status:r.status,body:await r.json(),origin:r.headers.get('access-control-allow-origin')};
  };
  assert.equal((await getConfig()).body.siteKey,'public-site');
  assert.equal((await getConfig()).origin,origin);
  assert.equal((await getConfig({TURNSTILE_ENABLED:'0',TURNSTILE_SECRET_KEY:'secret-private'})).body.enabled,false);
  assert.equal((await getConfig({...env,TURNSTILE_SITE_KEY:undefined})).body.misconfigured,true);
  const deniedConfig=await getConfig(env,'https://fake.example');assert.equal(deniedConfig.status,403);
  assert.equal((await post()).body.code,'TURNSTILE_MISSING_TOKEN','missing token must never create a customer');
  assert.equal((await post({turnstileToken:'fixture-token'},{...env,TURNSTILE_SITE_KEY:undefined})).body.code,'TURNSTILE_MISCONFIGURED','fail closed when enabled but incomplete');
  assert.equal(count('inquiries'),0);
  nextVerify={success:false,hostname:'www.mingeagle.com',action:'mingeagle_inquiry'};
  assert.equal((await post({turnstileToken:'fixture-token'})).body.code,'TURNSTILE_REJECTED');
  nextVerify={success:true,hostname:'evil.example',action:'mingeagle_inquiry'};
  assert.equal((await post({turnstileToken:'fixture-token'})).body.code,'TURNSTILE_REJECTED');
  nextVerify={success:true,hostname:'www.mingeagle.com',action:'unexpected'};
  assert.equal((await post({turnstileToken:'fixture-token'})).body.code,'TURNSTILE_REJECTED');
  assert.equal(count('inquiries'),0);
  nextVerify={success:true,hostname:'www.mingeagle.com',action:'mingeagle_inquiry'};
  const success=await post({turnstileToken:'fixture-token'});
  assert.equal(success.status,200,JSON.stringify(success.body));
  assert.equal(success.cors,origin);
  assert.equal(count('inquiries'),1);assert.equal(count('leads'),1);assert.equal(count('tasks'),1);
  assert.equal(forwards,1);
  const noConsent=await post({originalReference:'ME-20261010-DDEEFF02',privacyAck:false,turnstileToken:'fixture-token'});
  assert.equal(noConsent.status,400);assert.equal(count('inquiries'),1);
  const replay=await api.receiveRecoveredInquiry(env,{...body,originalReference:'ME-20261010-DDEEFF03'});
  assert.equal(replay.status,200,'private authenticated recovery bypasses public CAPTCHA verification');
  assert.equal(count('inquiries'),2);assert.equal(forwards,1,'internal replay does not re-forward email');
  const disabled=await post({originalReference:'ME-20261010-DDEEFF04'},{
    MINGEAGLE_DB:db,TURNSTILE_SITE_KEY:'public-site',TURNSTILE_SECRET_KEY:'secret-private',TURNSTILE_ENABLED:'0'});
  assert.equal(disabled.status,200,'new feature is safely opt-in; no lockout before configuration');
  assert.equal(count('inquiries'),3);
  assert.equal(turnstileCalls,5,'no network siteverify when feature off or missing token');
  console.log('PASS: turnstile activation config, public CORS, secret isolation, required single-use token checks, hostname/action binding, CRM no-write rejection, internal replay and safe opt-out.');
}finally{globalThis.fetch=originalFetch;rmSync(dir,{recursive:true,force:true})}
