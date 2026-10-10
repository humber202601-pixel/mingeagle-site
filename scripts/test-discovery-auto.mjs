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
  async batch(statements){this.sqlite.exec('BEGIN');try{const out=[];for(let i=0;i<statements.length;i++){if(this.failBatch&&i===3)throw new Error('fixture atomic failure');const changed=this.sqlite.prepare(statements[i].sql).run(...statements[i].values);out.push({success:true,meta:{changes:Number(changed.changes)}});}this.sqlite.exec('COMMIT');return out;}catch(e){this.sqlite.exec('ROLLBACK');throw e;}}
}
try{
  const names=['discovery-auto-v1','discovery-history-v1','discovery-web-v6','discovery-school-v1','discovery-sources-v1','discovery-enrich-v2','discovery-enrich','discovery-auto-step-v1'];
  await build({entryPoints:names.map(n=>'functions/api/admin/'+n+'.ts'),outdir:temp,bundle:true,platform:'node',format:'esm',outExtension:{'.js':'.mjs'},logLevel:'silent'});
  await build({entryPoints:['lib/discovery-auto.ts'],outfile:join(temp,'auto.mjs'),bundle:true,platform:'node',format:'esm',logLevel:'silent'});
  const auto=await import(pathToFileURL(join(temp,'auto.mjs'))),handlers={};
  for(const name of names)handlers[name]=await import(pathToFileURL(join(temp,name+'.mjs')));
  const db=new D1(),env={MINGEAGLE_DB:db,GEOAPIFY_API_KEY:'fixture'},headers={'content-type':'application/json','x-admin-key':'fixture'};
  const base='https://app.example/api/admin/';
  const post=async(name,body)=>{const r=await handlers[name].onRequestPost({request:new Request(base+name,{method:'POST',headers,body:JSON.stringify(body)}),env});const bodyResult=await r.json();return {status:r.status,body:bodyResult};};
  const get=async(name)=>{const r=await handlers[name].onRequestGet({request:new Request(base+name,{headers}),env});return await r.json();};
  const scalar=(sql)=>db.sqlite.prepare(sql).get().n;
  let failContact=false,failEnrich=false,missingContacts=false,failSources=false,emptyIndex=false,alternateHits=false,manyCoreHits=false,coreIndexRequests=0,websiteCalls=[],placeDetailCalls=0;
  const html=()=>`<html><head><title>Northstar Basketball Academy — Dallas Texas Basketball Training</title><meta property="og:site_name" content="Northstar Basketball Academy"/><script type="application/ld+json">{"@type":"Organization","name":"Northstar Basketball Academy"}</script></head><body><h1>Northstar Basketball Academy</h1><p>Dallas Texas basketball academy private lessons youth club AAU training basketball summer camp and recreation programs. Register for training classes. Membership. Contact us.</p><a href="/contact">Contact</a><a href="/staff">Staff</a><a href="/coaches">Coaches</a><a href="/procurement">Procurement</a><p>Alex Morgan - Head Coach.</p>${missingContacts?'':'<a href="mailto:hello@academy.example">hello@academy.example</a><a href="tel:2145550186">214-555-0186</a>'}<a href="https://www.facebook.com/northstaracademy/">Facebook</a><a href="https://www.instagram.com/northstaracademy/">Instagram</a><a href="https://www.tiktok.com/@northstaracademy">TikTok</a><a href="https://www.linkedin.com/company/northstaracademy/">LinkedIn</a></body></html>`;
  globalThis.fetch=async(input,init={})=>{
    const url=new URL(String(input));
    if(url.pathname.endsWith('/discovery-enrich-v2')&&failEnrich)return Response.json({ok:false,error:'Fixture temporary enrichment service failure'},{status:503});
    if(url.pathname.startsWith('/api/admin/'))return handlers[url.pathname.split('/').pop()].onRequestPost({request:new Request(url,init),env});
    if(url.hostname==='www.bing.com'){
      coreIndexRequests++;
      if(failSources)return new Response('Unavailable',{status:503});
      if(manyCoreHits)return new Response('<rss><channel>'+Array.from({length:13},(_,i)=>'<item><title>Northstar Basketball Academy Dallas Texas '+i+'</title><link>https://pilot'+i+'.example</link><description>Dallas Texas basketball training academy private lessons.</description></item>').join('')+'</channel></rss>');
      if(emptyIndex)return new Response('<rss><channel></channel></rss>');
      const query=url.searchParams.get('q')||'';let link='https://academy.example';
      if(query.includes('Northstar Independent School'))return new Response('<rss><channel><item><title>Northstar Independent School Dallas Texas</title><link>https://school.example</link><description>Private school education in Dallas Texas.</description></item></channel></rss>');
      if(/site:facebook/.test(query))link='https://www.facebook.com/northstaracademy/';
      else if(/site:tiktok/.test(query))link='https://www.tiktok.com/@northstaracademy';
      else if(/site:instagram/.test(query))link='https://www.instagram.com/northstaracademy/';
      else if(/site:linkedin/.test(query))link='https://www.linkedin.com/company/northstaracademy/';
      return new Response(`<rss><channel><item><title>Northstar Basketball Academy Dallas Texas</title><link>${link}</link><description>Basketball training academy, private coach lessons and registration in Dallas Texas.</description></item></channel></rss>`);
    }
    if(url.hostname==='html.duckduckgo.com'){
      if(failSources)return new Response('Unavailable',{status:503});
      if(!alternateHits)return new Response('<div class="no-results">No results</div>');
      return new Response('<h2><a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Facademy.example">Northstar Basketball Academy Dallas Texas</a></h2><a class="result__snippet">Dallas Texas youth basketball training academy private lessons.</a>');
    }
    if(url.hostname==='school.example')return new Response('<html><head><title>Northstar Independent School</title><meta property="og:site_name" content="Northstar Independent School"/><script type="application/ld+json">{"@type":"Organization","name":"Northstar Independent School"}</script></head><body><h1>Northstar Independent School</h1><p>Dallas Texas private school education, students, athletics and physical education. Contact our school office.</p><a href="mailto:office@school.example">office@school.example</a><a href="tel:2145550102">214-555-0102</a></body></html>',{headers:{'content-type':'text/html'}});
    if(url.hostname==='academy.example'){
      websiteCalls.push(url.pathname);
      if(failContact&&url.pathname==='/')return new Response('Temporary error',{status:503});
      return new Response(html(),{headers:{'content-type':'text/html'}});
    }
    if(url.hostname==='api.geoapify.com'){
      if(url.pathname==='/v2/place-details'){
        placeDetailCalls++;
        assert.equal(url.searchParams.get('id'),'fixture-academy','look up the returned place ID, not an invented entity');
        return Response.json({features:[{properties:{feature_type:'details',name:'Northstar Basketball Academy',city:'Dallas',state_code:'TX',contact:{website:'https://academy.example'}}}]});
      }
      return Response.json({features:[{properties:{name:'Northstar Basketball Academy',place_id:'fixture-academy',country_code:'us',state_code:'TX',city:'Dallas',formatted:'100 Hoops Street, Dallas, TX',categories:['sport.sports_centre'],datasource:{raw:{osm_type:'way',osm_id:42,sport:'basketball'}}}}],results:[{place_id:'fixture-city',state_code:'TX',country_code:'us',bbox:{lat1:32,lon1:-97,lat2:33,lon2:-96}}]});
    }
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
  assert(placeDetailCalls>0,'map clues lacking a website must use bounded place-details lookup before RSS');
  const enrichedMap=db.sqlite.prepare("SELECT raw_json,website FROM discovery_clues WHERE source_key='osm:way:42'").get();
  assert.equal(JSON.parse(enrichedMap.raw_json).placeId,'fixture-academy','store provider place ID through source ingestion');
  assert.equal(new URL(enrichedMap.website).hostname,'academy.example','accept verified provider website from matching place details');
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
  for(const table of ['discovery_candidates','discovery_clues','discovery_run_clues','discovery_jobs','discovery_auto_runs','messages','tasks'])assert.equal(scalar('SELECT COUNT(*) AS n FROM '+table),0,table+' cleared');
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
  failEnrich=true;
  for(let tick=0;tick<40;tick++){result=await post('discovery-auto-v1',{action:'ADVANCE',runId:retryId});if(result.body.run.status!=='RUNNING')break;}
  assert.equal(result.body.run.status,'PARTIAL');assert.equal(scalar("SELECT COUNT(*) AS n FROM discovery_auto_items WHERE status='FAILED' AND attempts=2")>0,true);
  failEnrich=false;await post('discovery-auto-v1',{action:'RETRY',runId:retryId});
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
  // Legacy school map candidates must find and verify an official site before automatic CRM intake.
  await post('discovery-history-v1',{action:'CLEAR'});
  result=await post('discovery-auto-v1',{action:'START',...search,customerType:'PRIVATE_CHARTER_SCHOOL'});const schoolId=result.body.run.id;
  db.sqlite.prepare('DELETE FROM discovery_auto_items WHERE run_id=?').run(schoolId);
  for(const [id,name,website] of [['school-good','Northstar Independent School',null],['school-wrong','Wrong School','https://academy.example'],['school-missing','Unindexed School',null]]){
    db.sqlite.prepare("INSERT INTO discovery_candidates(id,source_key,source_provider,name,customer_type,state_region,city,website,source_url) VALUES(?,?,'GEOAPIFY_SCHOOL_V1',?,'PRIVATE_CHARTER_SCHOOL','TX','Dallas',?,'https://map.example')").run(id,id,name,website);
    db.sqlite.prepare("INSERT INTO discovery_auto_items(run_id,kind,item_key) VALUES(?,'CANDIDATE',?)").run(schoolId,id);
  }
  for(let tick=0;tick<15;tick++){result=await post('discovery-auto-v1',{action:'ADVANCE',runId:schoolId});if(result.body.run.status!=='RUNNING')break;}
  assert.equal(result.body.run.status,'PARTIAL');
  const goodSchool=result.body.results.find(row=>row.item_key==='school-good');assert.equal(goodSchool.status,'DONE',JSON.stringify(goodSchool));assert(goodSchool.crm_lead_id);assert.equal(goodSchool.website,'https://school.example/');assert.equal(goodSchool.email,'office@school.example');
  for(const id of ['school-wrong','school-missing']){const row=result.body.results.find(row=>row.item_key===id);assert.equal(row.status,'REVIEW');assert.equal(row.crm_lead_id,null,'unverified schools cannot enter CRM');}
  assert.equal(scalar('SELECT COUNT(*) AS n FROM leads'),2,'only the verified school and protected business record remain');
  // An old enrichment failure cannot replace a newer completed customer status.
  result=await post('discovery-auto-v1',{action:'START',...search});const staleId=result.body.run.id;
  db.sqlite.prepare('DELETE FROM discovery_auto_items WHERE run_id=?').run(staleId);
  db.sqlite.prepare("INSERT INTO discovery_auto_items(run_id,kind,item_key,payload_json) VALUES(?,'CANDIDATE','school-good','{\"stage\":\"ENRICH\"}')").run(staleId);
  const staleWork=await auto.claimAuto(db,staleId),beforeStaleFetch=globalThis.fetch;let releaseOldEnrichment;
  globalThis.fetch=async(input,init)=>new URL(String(input)).hostname==='school.example'?new Promise(resolve=>{releaseOldEnrichment=resolve;}):beforeStaleFetch(input,init);
  const oldEnrichment=post('discovery-enrich-v2',{candidateId:'school-good',autoRunId:staleId,autoToken:staleWork.token,skipSync:true});
  for(let i=0;i<30&&!releaseOldEnrichment;i++)await Promise.resolve();assert(releaseOldEnrichment);
  await post('discovery-auto-v1',{action:'FINISH',runId:staleId});
  db.sqlite.prepare("UPDATE discovery_candidates SET enrichment_status='COMPLETED',enrichment_error=NULL WHERE id='school-good'").run();
  releaseOldEnrichment(new Response('Old website failure',{status:503}));assert.equal((await oldEnrichment).status,409);
  assert.equal(db.sqlite.prepare("SELECT enrichment_status FROM discovery_candidates WHERE id='school-good'").get().enrichment_status,'COMPLETED','late enrichment cannot overwrite a newer status');globalThis.fetch=beforeStaleFetch;
  // New job execution responds immediately, persists individual work, and recovers bounded failures.
  await post('discovery-history-v1',{action:'CLEAR'});
  result=await post('discovery-auto-v1',{action:'START',...search});let faultId=result.body.run.id;
  db.sqlite.prepare("DELETE FROM discovery_auto_items WHERE run_id=? AND item_key<>'CORE:0'").run(faultId);
  const realFixtureFetch=globalThis.fetch;let holds=[];
  globalThis.fetch=async(input,init)=>{if(new URL(String(input)).pathname.endsWith('/discovery-auto-step-v1'))return new Promise(resolve=>holds.push(resolve));return realFixtureFetch(input,init);};
  let background;const kicked=await handlers['discovery-auto-v1'].onRequestPost({request:new Request(base+'discovery-auto-v1',{method:'POST',headers,body:JSON.stringify({action:'KICK',runId:faultId})}),env,waitUntil(p){background=p;}});
  const accepted=await kicked.json();assert.equal(accepted.accepted,true);assert.equal(accepted.workerBusy,true);assert.equal(accepted.current.length,1);assert.equal(scalar("SELECT COUNT(*) AS n FROM discovery_auto_items WHERE status='PROCESSING'"),1,'kickoff returns before long work finishes');
  const stopped=await post('discovery-auto-v1',{action:'FINISH',runId:faultId});assert.equal(stopped.body.run.status,'PARTIAL');
  holds.shift()(Response.json({ok:true,continue:true,payload:{stage:'VERIFY'}}));await background;
  assert.equal(db.sqlite.prepare('SELECT status FROM discovery_auto_items WHERE run_id=?').get(faultId).status,'REVIEW','late worker cannot overwrite a manual finish');assert.equal((await get('discovery-auto-v1')).workerBusy,false);
  globalThis.fetch=realFixtureFetch;
  // Finished items become visible immediately even while another source still waits.
  await post('discovery-history-v1',{action:'CLEAR'});result=await post('discovery-auto-v1',{action:'START',...search});faultId=result.body.run.id;holds=[];
  globalThis.fetch=async(input,init)=>{if(new URL(String(input)).pathname.endsWith('/discovery-auto-step-v1')&&JSON.parse(init.body).itemKey==='CORE:0')return new Promise(resolve=>holds.push(resolve));return realFixtureFetch(input,init);};
  const concurrentKick=await handlers['discovery-auto-v1'].onRequestPost({request:new Request(base+'discovery-auto-v1',{method:'POST',headers,body:JSON.stringify({action:'KICK',runId:faultId})}),env,waitUntil(p){background=p;}});await concurrentKick.json();
  for(let wait=0;wait<25&&scalar("SELECT COUNT(*) AS n FROM discovery_auto_items WHERE status='DONE'")<2;wait++)await new Promise(resolve=>setTimeout(resolve,10));
  const duringWork=await auto.autoSummary(db,faultId);assert(duringWork.progress.processed>=2,'per-item progress is readable before the slowest source completes');assert.equal(duringWork.current.length,1);
  holds.shift()(Response.json({ok:true,found:0}));await background;globalThis.fetch=realFixtureFetch;
  // Interrupted work is recovered only after the lease expires; bounded attempts avoid infinite loops.
  await post('discovery-history-v1',{action:'CLEAR'});result=await post('discovery-auto-v1',{action:'START',...search});faultId=result.body.run.id;
  db.sqlite.prepare("DELETE FROM discovery_auto_items WHERE run_id=? AND item_key<>'CORE:0'").run(faultId);
  let work=await auto.claimAuto(db,faultId);assert(work);
  db.sqlite.prepare("UPDATE discovery_auto_runs SET lease_until=datetime('now','-1 second') WHERE id=?").run(faultId);
  work=await auto.claimAuto(db,faultId);assert(work);assert.equal(scalar('SELECT MAX(attempts) AS n FROM discovery_auto_items'),2,'interrupted execution consumes a bounded attempt');
  globalThis.fetch=async(input,init)=>{if(new URL(String(input)).pathname.endsWith('/discovery-auto-step-v1'))return new Promise(()=>{});return realFixtureFetch(input,init);};
  const begin=performance.now();await auto.executeAuto(env,base,'fixture',work,20);assert(performance.now()-begin<300,'hung step cannot exceed its hard deadline');
  let faultSummary=await auto.autoSummary(db,faultId);assert.equal(faultSummary.run.status,'PARTIAL');assert.equal(faultSummary.workerBusy,false);assert.equal(faultSummary.exceptions.length,1);
  // Non-JSON gateway responses are retried once, then finish with a useful exception.
  globalThis.fetch=realFixtureFetch;await post('discovery-history-v1',{action:'CLEAR'});result=await post('discovery-auto-v1',{action:'START',...search});faultId=result.body.run.id;
  db.sqlite.prepare("DELETE FROM discovery_auto_items WHERE run_id=? AND item_key<>'CORE:0'").run(faultId);
  let htmlCalls=0;globalThis.fetch=async(input,init)=>{if(new URL(String(input)).pathname.endsWith('/discovery-auto-step-v1')){htmlCalls++;return new Response('<!DOCTYPE html>Gateway failure',{status:502});}return realFixtureFetch(input,init);};
  await auto.advanceAuto(env,base,'fixture',faultId);faultSummary=await auto.advanceAuto(env,base,'fixture',faultId);
  assert.equal(htmlCalls,2);assert.equal(faultSummary.run.status,'PARTIAL');assert(faultSummary.exceptions[0].error.includes('非 JSON'));assert.equal(faultSummary.workerBusy,false);
  globalThis.fetch=realFixtureFetch;
  // A readable but empty primary index uses another public index and retains the full verification/import flow.
  await post('discovery-history-v1',{action:'CLEAR'});emptyIndex=true;alternateHits=true;
  result=await post('discovery-auto-v1',{action:'START',...search});const alternateId=result.body.run.id;
  db.sqlite.prepare("DELETE FROM discovery_auto_items WHERE run_id=? AND item_key<>'CORE:0'").run(alternateId);
  for(let tick=0;tick<20;tick++){result=await post('discovery-auto-v1',{action:'ADVANCE',runId:alternateId});if(result.body.run.status!=='RUNNING')break;}
  assert.equal(result.body.run.status,'COMPLETED',JSON.stringify(result.body.exceptions));
  assert.equal(result.body.results.filter(row=>row.crm_lead_id).length,1,'alternate index customer must pass verification, enrichment and CRM intake');
  assert(JSON.parse(result.body.sources[0].result_json).note.includes('备用公开索引返回可用官网 1'));
  assert.equal(scalar('SELECT COUNT(*) AS n FROM messages'),0);assert.equal(scalar('SELECT COUNT(*) AS n FROM tasks'),0);
  // Empty results and unavailable providers are different, with honest zero-customer messages.
  await post('discovery-history-v1',{action:'CLEAR'});alternateHits=false;
  result=await post('discovery-auto-v1',{action:'START',...search});const emptyId=result.body.run.id;
  db.sqlite.prepare("DELETE FROM discovery_auto_items WHERE run_id=? AND item_key<>'CORE:0'").run(emptyId);
  for(let tick=0;tick<5;tick++){result=await post('discovery-auto-v1',{action:'ADVANCE',runId:emptyId});if(result.body.run.status!=='RUNNING')break;}
  assert.equal(result.body.run.status,'COMPLETED');assert(result.body.run.message.includes('本批未找到'));assert.equal(result.body.results.length,0);assert.equal(JSON.parse(result.body.sources[0].result_json).found,0);
  await post('discovery-history-v1',{action:'CLEAR'});failSources=true;
  result=await post('discovery-auto-v1',{action:'START',...search});const unavailableId=result.body.run.id;
  db.sqlite.prepare("DELETE FROM discovery_auto_items WHERE run_id=? AND item_key<>'CORE:0'").run(unavailableId);
  for(let tick=0;tick<5;tick++){result=await post('discovery-auto-v1',{action:'ADVANCE',runId:unavailableId});if(result.body.run.status!=='RUNNING')break;}
  assert.equal(result.body.run.status,'PARTIAL');assert.equal(result.body.sources[0].status,'FAILED');assert(result.body.exceptions[0].error.includes('均不可读取'));assert(result.body.run.message.includes('本批未找到'));
  // All source providers must finish before clue verification. Otherwise OSM
  // clues can fail before Geoapify supplies the missing website/place ID.
  await post('discovery-history-v1',{action:'CLEAR'});
  result=await post('discovery-auto-v1',{action:'START',...search});
  const sourceFirstId=result.body.run.id;
  db.sqlite.prepare('DELETE FROM discovery_auto_items WHERE run_id=?').run(sourceFirstId);
  db.sqlite.prepare("INSERT INTO discovery_clues(id,source_key,title,source_provider,source_url,customer_type,state_region,city,status) VALUES('pending-geo-clue','osm:way:901','Northstar Basketball Academy','OSM','https://www.openstreetmap.org/way/901','BASKETBALL_TRAINING','TX','Dallas','PENDING')").run();
  db.sqlite.prepare("INSERT INTO discovery_auto_items(run_id,kind,item_key,payload_json) VALUES(?,'SOURCE','GEOAPIFY:0','{}')").run(sourceFirstId);
  db.sqlite.prepare("INSERT INTO discovery_auto_items(run_id,kind,item_key) VALUES(?,'CLUE','pending-geo-clue')").run(sourceFirstId);
  const sourceWork=await auto.claimAuto(db,sourceFirstId);
  assert.equal(sourceWork.items[0].kind,'SOURCE','gather and merge Geoapify evidence before processing existing OSM clues');
  await post('discovery-auto-v1',{action:'FINISH',runId:sourceFirstId});
  // The main web-index source also needs a bounded cursor: a search index
  // could return >4 distinct official-domain clues in one source round.
  await post('discovery-history-v1',{action:'CLEAR'});
  failSources=false;emptyIndex=false;manyCoreHits=true;
  result=await post('discovery-auto-v1',{action:'START',...search});
  const coreBatchId=result.body.run.id,claimed=await auto.claimAuto(db,coreBatchId);
  assert(claimed&&claimed.items.some(item=>item.item_key.startsWith('CORE:')));
  let coreSaved=0;
  const beforeIndex=coreIndexRequests;
  for(const offset of [0,4,8]){
    if(offset)failSources=true; // Cached pages must not refetch a now-failed index.
    const page=await post('discovery-web-v6',{...search,round:0,sourceOffset:offset,runId:coreBatchId,autoSourceOnly:true,autoRunId:coreBatchId,autoToken:claimed.token});
    assert.equal(page.status,200,JSON.stringify(page.body));
    assert.equal(page.body.available,12,'preserve all valid official website clues');
    assert.equal(page.body.found,Math.min(4,12-offset),'main index saves only four websites at a time');
    assert.equal(page.body.hasMore,offset+4<12);
    coreSaved+=page.body.found;
  }
  assert.equal(coreSaved,12,'all indexed sites eventually saved without exceeding per-request writes');
  assert.equal(coreIndexRequests-beforeIndex,8,'8 public index queries run only on the FIRST source page, not 24 times');
  failSources=false;
  const webJob=db.sqlite.prepare("SELECT status,result_count FROM discovery_jobs WHERE id=?").get('AUTO:'+coreBatchId+':WEB_SEARCH_VERIFIED_V6:0');
  assert.equal(webJob?.status,'COMPLETED','web source ends only after all source pages are saved');
  assert.equal(webJob?.result_count,12,'web index pages share one cumulative source job');
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM discovery_jobs WHERE id=?").get('AUTO:'+coreBatchId+':WEB_SEARCH_VERIFIED_V6:0').n,1,'one logical web-index job instead of three page jobs');
  assert.equal(scalar("SELECT COUNT(*) AS n FROM discovery_clues WHERE source_provider='WEB_INDEX'"),12);
  assert.equal(scalar('SELECT COUNT(*) AS n FROM messages'),0);
  await post('discovery-auto-v1',{action:'FINISH',runId:coreBatchId});manyCoreHits=false;
  console.log('PASS: one-click source search → automatic official-site matching → verification → deeper enrichment → CRM; social/contact evidence; dedupe and repeated-click protection; pause/resume; explicit unavailable fields; automatic retry and exception recovery; lease lock; atomic recoverable cleanup/restore; protected commercial records; no outreach or queue.');
}finally{globalThis.fetch=originalFetch;rmSync(temp,{recursive:true,force:true});}
