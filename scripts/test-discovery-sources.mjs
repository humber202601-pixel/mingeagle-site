import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
const dir=mkdtempSync(join(tmpdir(),'mingeagle-sources-')),original=globalThis.fetch;
try{
  await build({entryPoints:['lib/discovery-sources.ts','functions/api/admin/discovery-sources-v1.ts'],outdir:dir,bundle:true,platform:'node',format:'esm',outExtension:{'.js':'.mjs'},entryNames:'[name]',logLevel:'silent'});
  const sources=await import(pathToFileURL(join(dir,'discovery-sources.mjs'))),handler=await import(pathToFileURL(join(dir,'discovery-sources-v1.mjs')));
  const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync('migrations/0001_core.sql','utf8'));
  const db={prepare(sql){const statement=(args=[])=>({bind(...values){return statement(values)},async first(){return sqlite.prepare(sql).get(...args)||null},async all(){return {results:sqlite.prepare(sql).all(...args)}},async run(){return {meta:sqlite.prepare(sql).run(...args)}}});return statement()}};
  const input={stateCode:'TX',customerType:'BASKETBALL_TRAINING',city:'Dallas',targetCount:20,round:0};
  const html=(name='Northstar Basketball Academy')=>`<html><title>${name}</title><script type="application/ld+json">{"@type":"Organization","name":"${name}"}</script><h1>${name}</h1><p>Dallas Texas basketball training academy private lessons register youth programs. Contact us. Elementary school district purchasing procurement physical education department.</p><a href="mailto:hello@northstar.example">hello@northstar.example</a><a href="tel:2145550186">214-555-0186</a></html>`;
  let failIndex=false,schoolTitle='Northstar Elementary School';
  globalThis.fetch=async(value,init)=>{
    const u=new URL(String(value));
    if(u.hostname==='www.bing.com'){
      if(failIndex)return new Response('Failure',{status:503});
      const social=u.searchParams.get('q').includes('site:facebook')?'https://www.facebook.com/northstar/':u.searchParams.get('q').includes('site:instagram')?'https://www.instagram.com/northstar/':u.searchParams.get('q').includes('site:linkedin')?'https://www.linkedin.com/company/northstar/':u.searchParams.get('q').includes('site:.gov')?'https://parks.example.gov/northstar':'https://www.chamberofcommerce.com/business/northstar';
      return new Response(`<rss><channel><item><title>Northstar Basketball Academy</title><link>${social}</link><description>Dallas Texas basketball training programs.</description></item><item><title>Unrelated Austin Academy</title><link>https://www.facebook.com/austin/</link><description>Austin basketball academy.</description></item></channel></rss>`);
    }
    if(u.hostname==='nces.ed.gov'||u.hostname==='services1.arcgis.com')return Response.json({features:[{attributes:{NCESSCH:'480000100001',LEAID:'4800001',NAME:schoolTitle,CITY:'DALLAS',STATE:'TX',STREET:'1 Public Street',SCHOOLYEAR:'2024-2025'}},{attributes:{NCESSCH:'480000100002',LEAID:'4800002',NAME:'Austin Elementary',CITY:'AUSTIN',STATE:'TX'}}]});
    if(u.hostname==='overpass-api.de')return Response.json({elements:[{type:'node',id:123,tags:{name:'Northstar Basketball Academy','addr:city':'Dallas',website:'https://northstar.example'}},{type:'node',id:124,tags:{name:'Basketball Court','addr:city':'Dallas'}},{type:'node',id:125,tags:{name:'Wrong City Academy','addr:city':'Austin'}}]});
    if(u.hostname==='northstar.example')return new Response(html(u.pathname.includes('elementary')?'Northstar Elementary School':u.pathname.includes('middle')?'Northstar Middle School':u.pathname.includes('wrong')?'Different Business Academy':'Northstar Basketball Academy'),{headers:{'content-type':'text/html'}});
    throw new Error('Unexpected endpoint '+u.hostname);
  };
  const post=async body=>{const r=await handler.onRequestPost({request:new Request('https://test.example/api/admin/discovery-sources-v1',{method:'POST',body:JSON.stringify(body)}),env:{MINGEAGLE_DB:db}});return {status:r.status,body:await r.json()};};
  const get=async query=>{const r=await handler.onRequestGet({request:new Request('https://test.example/api/admin/discovery-sources-v1?'+query),env:{MINGEAGLE_DB:db}});return {status:r.status,body:await r.json()};};
  assert.equal(sources.sourceUrl('http://127.0.0.1/','SOCIAL'),'');assert.equal(sources.sourceUrl('https://www.instagram.com/p/123/','SOCIAL'),'');assert.equal(sources.sourceUrl('https://www.linkedin.com/in/person/','SOCIAL'),'');assert.equal(sources.sourceUrl('https://www.instagram.com/northstar/?utm=123#x','SOCIAL'),'https://www.instagram.com/northstar/');
  const query=sources.ncesQuery({...input,customerType:'SCHOOL_DISTRICT',city:"O'Fallon"});assert.ok(new URL(query.url).searchParams.get('where').includes("O''FALLON"));assert.throws(()=>sources.osmQuery({...input,city:''}));assert.ok(sources.osmQuery(input).includes('US-TX'));
  assert.equal(handler.clueMatches('Northstar Basketball Academy','Northstar Basketball Academy | Facebook'),true);assert.equal(handler.clueMatches('Different Business Academy','Northstar Basketball Academy'),false);
  let result=await post({...input,action:'SEARCH',sources:['SOCIAL','DIRECTORY','OSM']});assert.equal(result.status,200);assert.equal(result.body.added,6);assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM discovery_candidates').get().n,0,'unverified clues must not become buyers');
  result=await post({...input,action:'SEARCH',sources:['SOCIAL','DIRECTORY','OSM']});assert.equal(result.body.added,0);assert.equal(result.body.updated,6);
  const clue=sqlite.prepare("SELECT * FROM discovery_clues WHERE source_provider='SOCIAL' LIMIT 1").get();
  assert.equal((await post({action:'VERIFY',clueId:clue.id,website:'http://10.0.0.1/'})).status,400);
  assert.equal((await post({action:'VERIFY',clueId:clue.id,website:'https://northstar.example/wrong'})).status,422);
  assert.equal((await post({action:'IGNORE',clueId:clue.id})).body.ok,true);
  assert.equal((await post({...input,action:'SEARCH',sources:['SOCIAL']})).body.updated,2,'ignored clue must stay ignored');
  assert.equal((await post({action:'VERIFY',clueId:clue.id,website:'https://northstar.example'})).status,400);
  await post({action:'RESTORE',clueId:clue.id});result=await post({action:'VERIFY',clueId:clue.id,website:'https://northstar.example'});assert.equal(result.body.ok,true);assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM discovery_candidates').get().n,1);
  assert.equal((await post({action:'VERIFY',clueId:clue.id})).body.alreadyConverted,true);assert.equal((await post({action:'IGNORE',clueId:clue.id})).status,400);
  const next=sqlite.prepare("SELECT * FROM discovery_clues WHERE source_provider='SOCIAL' AND status='PENDING' LIMIT 1").get();result=await post({action:'VERIFY',clueId:next.id,website:'https://northstar.example'});assert.equal(result.body.existing,true);assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM discovery_candidates').get().n,1,'cross-source clues should associate the same business');
  const third=sqlite.prepare("SELECT * FROM discovery_clues WHERE source_provider='SOCIAL' AND status='PENDING' LIMIT 1").get();sqlite.exec("UPDATE discovery_candidates SET status='IGNORED'");assert.equal((await post({action:'VERIFY',clueId:third.id,website:'https://northstar.example'})).status,409);sqlite.exec("UPDATE discovery_candidates SET status='NEW'");
  result=await post({...input,customerType:'ELEMENTARY_SCHOOL',action:'SEARCH',sources:['NCES']});assert.equal(result.body.added,1);const school=sqlite.prepare("SELECT * FROM discovery_clues WHERE source_provider='NCES'").get();assert.ok(school.source_evidence.includes('2024-2025'));assert.equal((await post({action:'VERIFY',clueId:school.id,website:'https://northstar.example/elementary'})).body.ok,true);
  schoolTitle='Northstar Middle School';result=await post({...input,customerType:'MIDDLE_HIGH_SCHOOL',action:'SEARCH',sources:['NCES']});assert.equal(result.body.added,0,'converted official source ID must not be recycled into another school');
  sqlite.prepare("INSERT INTO discovery_clues(id,source_key,title,source_provider,source_url,customer_type,state_region,city) VALUES('middle','nces:school:middle','Northstar Middle School','NCES','https://nces.ed.gov/','MIDDLE_HIGH_SCHOOL','TX','Dallas')").run();assert.equal((await post({action:'VERIFY',clueId:'middle',website:'https://northstar.example/middle'})).body.ok,true);assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM discovery_candidates').get().n,3,'distinct school pages on one district domain must stay separate');
  assert.equal((await get('status=PENDING&page=Infinity')).status,400);assert.equal((await get('status=BAD')).status,400);assert.equal((await get('status=CONVERTED')).body.clues.length,4);
  failIndex=true;assert.equal((await post({...input,action:'SEARCH',sources:['SOCIAL','DIRECTORY']})).status,502);result=await post({...input,customerType:'SCHOOL_DISTRICT',action:'SEARCH',sources:['SOCIAL','NCES']});assert.equal(result.status,200);assert.equal(result.body.sources.SOCIAL.ok,false);assert.equal(result.body.sources.NCES.ok,true);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM messages').get().n,0);sqlite.close();
  console.log('PASS: public social and directory filtering, wrong-city rejection, NCES escaping and original years, OSM facility exclusion, source failures, clue-only storage, ignore/restore, verified promotion, identity/private-URL rejection, domain and school-page deduplication, CRM safeguards, pagination and no communications.');
}finally{globalThis.fetch=original;rmSync(dir,{recursive:true,force:true});}
