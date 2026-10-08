import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
const temp=mkdtempSync(join(tmpdir(),'mingeagle-auto-')),originalFetch=globalThis.fetch;
class D1{
  constructor(){this.sqlite=new DatabaseSync(':memory:');this.sqlite.exec(readFileSync('migrations/0001_core.sql','utf8'));this.failBatch=false;}
  prepare(sql){const db=this.sqlite;const statement=(values=[])=>({sql,values,bind(...v){return statement(v);},async run(){const r=db.prepare(sql).run(...values);return {success:true,meta:{changes:Number(r.changes)}};},async first(){return db.prepare(sql).get(...values)||null;},async all(){return {success:true,results:db.prepare(sql).all(...values)};}});return statement();}
  async batch(statements){this.sqlite.exec('BEGIN');try{const out=[];for(let i=0;i<statements.length;i++){if(this.failBatch&&i===3)throw new Error('fixture atomic failure');out.push(await statements[i].run());}this.sqlite.exec('COMMIT');return out;}catch(e){this.sqlite.exec('ROLLBACK');throw e;}}
}
try{
  const names=['discovery-auto-v1','discovery-history-v1','discovery-web-v6','discovery-school-v1','discovery-sources-v1','discovery-enrich-v2','discovery-enrich'];
  await build({entryPoints:names.map(n=>'functions/api/admin/'+n+'.ts'),outdir:temp,bundle:true,platform:'node',format:'esm',outExtension:{'.js':'.mjs'},logLevel:'silent'});
  await build({entryPoints:['lib/discovery-auto.ts'],outfile:join(temp,'auto.mjs'),bundle:true,platform:'node',format:'esm',logLevel:'silent'});
  const auto=await import(pathToFileURL(join(temp,'auto.mjs'))),handlers={};
  for(const name of names)handlers[name]=await import(pathToFileURL(join(temp,name+'.mjs')));
  const db=new D1(),env={MINGEAGLE_DB:db,GEOAPIFY_API_KEY:'fixture'},headers={'content-type':'application/json','x-admin-key':'fixture'};
  const base='https://app.example/api/admin/';
  const post=async(name,body)=>{const r=await handlers[name].onRequestPost({request:new Request(base+name,{method:'POST',headers,body:JSON.stringify(body)}),env});return {status:r.status,body:await r.json()};};
  const get=async(name)=>{const r=await handlers[name].onRequestGet({request:new Request(base+name,{headers}),env});return await r.json();};
  const scalar=(sql)=>db.sqlite.prepare(sql).get().n;
  let failContact=false,missingContacts=false,failSources=false,websiteCalls=[];
  const html=()=>`<html><head><title>Northstar Basketball Academy — Dallas Texas Basketball Training</title><meta property="og:site_name" content="Northstar Basketball Academy"/><script type="application/ld+json">{"@type":"Organization","name":"Northstar Basketball Academy"}</script></head><body><h1>Northstar Basketball Academy</h1><p>Dallas Texas basketball academy private lessons youth club AAU training basketball summer camp and recreation programs. Register for training classes. Membership. Contact us.</p><a href="/contact">Contact</a><a href="/staff">Staff</a><a href="/coaches">Coaches</a><a href="/procurement">Procurement</a><p>Alex Morgan - Head Coach.</p>${missingContacts?'':'<a href="mailto:hello@academy.example">hello@academy.example</a><a href="tel:2145550186">214-555-0186</a>'}<a href="https://www.facebook.com/northstaracademy/">Facebook</a><a href="https://www.instagram.com/northstaracademy/">Instagram</a><a href="https://www.tiktok.com/@northstaracademy">TikTok</a><a href="https://www.linkedin.com/company/northstaracademy/">LinkedIn</a></body></html>`;
  globalThis.fetch=async(input,init={})=>{
    const url=new URL(String(input));
    if(url.pathname.startsWith('/api/admin/'))return handlers[url.pathname.split('/').pop()].onRequestPost({request:new Request(url,init),env});
    if(url.hostname==='www.bing.com'){
      if(failSources)return new Response('Unavailable',{status:503});
      const query=url.searchParams.get('q')||'';let link='https://academy.example';
      if(/site:facebook/.test(query))link='https://www.facebook.com/northstaracademy/';
      else if(/site:tiktok/.test(query))link='https://www.tiktok.com/@northstaracademy';
      else if(/site:instagram/.test(query))link='https://www.instagram.com/northstaracademy/';
      else if(/site:linkedin/.test(query))link='https://www.linkedin.com/company/northstaracademy/';
      return new Response(`<rss><channel><item><title>Northstar Basketball Academy Dallas Texas</title><link>${link}</link><description>Basketball training academy, private coach lessons and registration in Dallas Texas.</description></item></channel></rss>`);
    }
    if(url.hostname==='academy.example'){
      websiteCalls.push(url.pathname);
      if(failContact&&url.pathname==='/')return new Response('Temporary error',{status:503});
      return new Response(html(),{headers:{'content-type':'text/html'}});
    }
    if(url.hostname==='api.geoapify.com')return Response.json({features:[{properties:{name:'Northstar Basketball Academy',place_id:'fixture-academy',country_code:'us',state_code:'TX',city:'Dallas',website:'https://academy.example',formatted:'100 Hoops Street, Dallas, TX',categories:['sport.sports_centre'],datasource:{raw:{osm_type:'way',osm_id:42}}}}],results:[{place_id:'fixture-city',state_code:'TX',country_code:'us',bbox:{lat1:32,lon1:-97,lat2:33,lon2:-96}}]});
    if(url.hostname.startsWith('overpass'))return Response.json({elements:[]});
    if(url.hostname==='nces.ed.gov')return Response.json({features:[]});
    throw new Error('Unexpected external request '+url.hostname);
  };
  assert(auto.autoSources('PRIVATE_CHARTER_SCHOOL').includes('NCES_PRIVATE'));
  assert(!auto.autoSources('PRIVATE_CHARTER_SCHOOL').includes('NCES'));
  assert(auto.autoSources('SCHOOL_DISTRICT').includes('NCES_DISTRICTS'));
  assert(auto.autoSources('BASKETBALL_TRAINING').includes('GEOAPIFY'));
  const search={stateCode:'TX',customerType:'BASKETBALL_TRAINING',city:'Dallas',targetCount:20,batches:1};
  assert.equal((await post('discovery-auto-v1',{action:'START',...search,stateCode:'ZZ'})).status,500);
  let result=await post('discovery-auto-v1',{action:'START',...search});assert.equal(result.body.run.status,'RUNNING');const runId=result.body.run.id;
  assert.equal((await post('discovery-auto-v1',{action:'START',...search})).body.run.id,runId,'repeated click resumes existing run');
  await post('discovery-auto-v1',{action:'PAUSE',runId});
  await post('discovery-auto-v1',{action:'ADVANCE',runId});assert.equal(scalar('SELECT SUM(attempts) AS n FROM discovery_auto_items'),0,'paused run cannot advance');
  await post('discovery-auto-v1',{action:'RESUME',runId});
  for(let tick=0;tick<40;tick++){result=await post('discovery-auto-v1',{action:'ADVANCE',runId});if(result.body.run.status!=='RUNNING')break;}
  assert.equal(result.body.run.status,'COMPLETED',JSON.stringify(result.body.exceptions));
  assert.equal(scalar('SELECT COUNT(*) AS n FROM leads'),1,'all social clues and core search merge to one CRM lead');
  assert.equal(scalar("SELECT COUNT(*) AS n FROM discovery_candidates WHERE status='CRM'"),1);
  const contact=db.sqlite.prepare('SELECT * FROM contacts').get();assert.equal(contact.email,'hello@academy.example');assert.equal(contact.phone,'2145550186');assert.equal(contact.full_name,'Alex Morgan');
  assert.equal(db.sqlite.prepare("SELECT address FROM companies WHERE domain='academy.example'").get().address,'100 Hoops Street, Dallas, TX','late map verification preserves address in existing CRM');
  assert(contact.facebook_url.includes('facebook.com'));assert(contact.tiktok_url.includes('tiktok.com'));
  assert(websiteCalls.includes('/staff')&&websiteCalls.includes('/coaches')&&websiteCalls.includes('/procurement'),'enrichment covers relevant public pages, beyond contact and home');
  assert.equal(scalar('SELECT COUNT(*) AS n FROM messages'),0,'one-click intake never sends messages');
  assert.equal(scalar('SELECT COUNT(*) AS n FROM tasks'),0,'one-click intake does not schedule outreach');
  assert.equal(scalar("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='email_queue'"),0,'no outbound queue created');
  const oldLead=db.sqlite.prepare('SELECT * FROM leads').get();
  db.sqlite.exec(`INSERT INTO companies(id,name) VALUES('protected-company','Actual buyer');INSERT INTO contacts(id,company_id,email) VALUES('protected-contact','protected-company','buyer@real.example');INSERT INTO leads(id,company_id,primary_contact_id,source) VALUES('protected-lead','protected-company','protected-contact','DISCOVERY');INSERT INTO quotes(id,reference,company_id,lead_id,contact_id) VALUES('protected-quote','Q-ACTUAL','protected-company','protected-lead','protected-contact');INSERT INTO tasks(id,lead_id,title) VALUES('old-followup','${oldLead.id}','Old follow-up');INSERT INTO messages(id,lead_id,channel,direction,body) VALUES('old-message','${oldLead.id}','EMAIL','OUTBOUND','Historical development');`);
  const before=await get('discovery-history-v1');assert.equal(before.protectedLeads,1);assert.equal(before.counts.leads,1);
  db.failBatch=true;assert.equal((await post('discovery-history-v1',{action:'CLEAR'})).status,409);db.failBatch=false;
  assert.equal(scalar('SELECT COUNT(*) AS n FROM leads'),2,'archive/delete rollback preserves all records on failure');assert.equal(scalar('SELECT COUNT(*) AS n FROM discovery_history_archives'),0);
  const cleared=await post('discovery-history-v1',{action:'CLEAR'});assert.equal(cleared.body.ok,true);assert(cleared.body.archiveId);
  for(const table of ['discovery_candidates','discovery_clues','discovery_jobs','discovery_auto_runs','messages','tasks'])assert.equal(scalar('SELECT COUNT(*) AS n FROM '+table),0,table+' cleared');
  assert.equal(scalar('SELECT COUNT(*) AS n FROM leads'),1);assert.equal(scalar('SELECT COUNT(*) AS n FROM quotes'),1);assert.equal(scalar('SELECT COUNT(*) AS n FROM companies'),1,'business-linked company remains intact');
  db.sqlite.exec("INSERT INTO companies(id,name,domain) VALUES('new-conflict','New profile','academy.example')");
  assert.equal((await post('discovery-history-v1',{action:'RESTORE',archiveId:cleared.body.archiveId})).status,409,'restore conflict must rollback, without overwriting new profiles');
  assert.equal(scalar('SELECT COUNT(*) AS n FROM leads'),1);assert.equal(scalar('SELECT COUNT(*) AS n FROM companies'),2);
  db.sqlite.exec("DELETE FROM companies WHERE id='new-conflict'");
  assert.equal((await post('discovery-history-v1',{action:'RESTORE',archiveId:cleared.body.archiveId})).body.ok,true);
  assert.equal(scalar('SELECT COUNT(*) AS n FROM leads'),2);assert.equal(scalar('SELECT COUNT(*) AS n FROM messages'),1);assert.equal(scalar('SELECT COUNT(*) AS n FROM tasks'),1);
  assert.equal((await post('discovery-history-v1',{action:'RESTORE',archiveId:cleared.body.archiveId})).body.alreadyRestored,true,'restore is idempotent');
  // A repeated search processes every candidate while preserving a single customer archive.
  result=await post('discovery-auto-v1',{action:'START',...search});const repeatId=result.body.run.id;
  for(let tick=0;tick<40;tick++){result=await post('discovery-auto-v1',{action:'ADVANCE',runId:repeatId});if(result.body.run.status!=='RUNNING')break;}
  assert.equal(result.body.run.status,'COMPLETED');assert.equal(scalar('SELECT COUNT(*) AS n FROM leads'),2);
  // Missing public fields are explicit, not invented, and still enter the customer workspace.
  await post('discovery-history-v1',{action:'CLEAR'});missingContacts=true;
  result=await post('discovery-auto-v1',{action:'START',...search});const missingId=result.body.run.id;
  for(let tick=0;tick<40;tick++){result=await post('discovery-auto-v1',{action:'ADVANCE',runId:missingId});if(result.body.run.status!=='RUNNING')break;}
  assert.equal(result.body.run.status,'COMPLETED');const missing=result.body.results[0];assert.equal(missing.email,null);assert.equal(missing.phone,null);assert(missing.crm_lead_id,'verified institution with no public direct contact still enters CRM');assert(JSON.parse(missing.result_json).missing.includes('邮箱'));
  await post('discovery-history-v1',{action:'CLEAR'});missingContacts=false;
  result=await post('discovery-auto-v1',{action:'START',...search});const retryId=result.body.run.id;
  // A real persistent failure is reported; retry recovers only failed records.
  for(let tick=0;tick<3;tick++)await post('discovery-auto-v1',{action:'ADVANCE',runId:retryId});
  failContact=true;
  for(let tick=0;tick<40;tick++){result=await post('discovery-auto-v1',{action:'ADVANCE',runId:retryId});if(result.body.run.status!=='RUNNING')break;}
  assert.equal(result.body.run.status,'PARTIAL');assert.equal(scalar("SELECT COUNT(*) AS n FROM discovery_auto_items WHERE status='FAILED' AND attempts=2")>0,true);
  failContact=false;await post('discovery-auto-v1',{action:'RETRY',runId:retryId});
  for(let tick=0;tick<40;tick++){result=await post('discovery-auto-v1',{action:'ADVANCE',runId:retryId});if(result.body.run.status!=='RUNNING')break;}
  assert.equal(result.body.run.status,'COMPLETED');assert.equal(scalar('SELECT COUNT(*) AS n FROM leads'),2,'retry imports once');
  // A lease prevents browser and scheduler from executing the same step simultaneously.
  result=await post('discovery-auto-v1',{action:'START',...search});const lockId=result.body.run.id;
  db.sqlite.prepare("UPDATE discovery_auto_runs SET lease_token='other',lease_until=datetime('now','+60 seconds') WHERE id=?").run(lockId);
  await post('discovery-auto-v1',{action:'ADVANCE',runId:lockId});assert.equal(scalar(`SELECT SUM(attempts) AS n FROM discovery_auto_items WHERE run_id='${lockId}'`),0);
  assert.equal((await post('discovery-history-v1',{action:'CLEAR'})).status,409,'live step cannot be cleared');
  db.sqlite.prepare("UPDATE discovery_auto_runs SET lease_until=NULL,lease_token=NULL WHERE id=?").run(lockId);
  const pausedArchive=await post('discovery-history-v1',{action:'CLEAR'});
  await post('discovery-history-v1',{action:'RESTORE',archiveId:pausedArchive.body.archiveId});
  assert.equal(db.sqlite.prepare('SELECT status FROM discovery_auto_runs WHERE id=?').get(lockId).status,'PAUSED','restored unfinished jobs require explicit resume');
  for(let n=0;n<205;n++){db.sqlite.prepare("INSERT INTO companies(id,name) VALUES(?,?)").run('mass-company-'+n,'Historical '+n);db.sqlite.prepare("INSERT INTO leads(id,company_id,source) VALUES(?,?,'DISCOVERY')").run('mass-lead-'+n,'mass-company-'+n);}
  const mass=await post('discovery-history-v1',{action:'CLEAR'});assert.equal(mass.body.ok,true);assert.equal(scalar('SELECT COUNT(*) AS n FROM leads'),1,'large cleanup exceeds 100 IDs without exceeding D1 binding limits');
  const restoredMass=await post('discovery-history-v1',{action:'RESTORE',archiveId:mass.body.archiveId});assert.equal(restoredMass.body.ok,true);assert(scalar('SELECT COUNT(*) AS n FROM leads')>=206);
  console.log('PASS: one-click source search → automatic official-site matching → verification → deeper enrichment → CRM; social/contact evidence; dedupe and repeated-click protection; pause/resume; explicit unavailable fields; automatic retry and exception recovery; lease lock; atomic recoverable cleanup/restore; protected commercial records; no outreach or queue.');
}finally{globalThis.fetch=originalFetch;rmSync(temp,{recursive:true,force:true});}
