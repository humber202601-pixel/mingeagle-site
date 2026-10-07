import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync,mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const folder=mkdtempSync(join(tmpdir(),'mingeagle-discovery-'));
const originalFetch=globalThis.fetch;
try{
  await build({entryPoints:['shared/discovery.ts'],outfile:join(folder,'catalog.mjs'),bundle:true,platform:'node',format:'esm',logLevel:'silent'});
  await build({entryPoints:['discovery','discovery-search-v2','discovery-web-v6','discovery-geoapify-v1','discovery-school-v1','discovery-enrich-v2','discovery-website-v1'].map(x=>'functions/api/admin/'+x+'.ts'),outdir:folder,bundle:true,platform:'node',format:'esm',outExtension:{'.js':'.mjs'},entryNames:'[name]',logLevel:'silent'});
  const catalog=await import(pathToFileURL(join(folder,'catalog.mjs')));
  const handlers={};
  for(const name of ['discovery','discovery-search-v2','discovery-web-v6','discovery-geoapify-v1','discovery-school-v1','discovery-enrich-v2','discovery-website-v1'])handlers[name]=await import(pathToFileURL(join(folder,name+'.mjs')));
  class D1{
    constructor(){this.sqlite=new DatabaseSync(':memory:');this.sqlite.exec(readFileSync('migrations/0001_core.sql','utf8'))}
    prepare(sql){const db=this.sqlite;const statement=(values=[])=>({
      bind(...args){return statement(args)},
      async run(){const result=db.prepare(sql).run(...values);return {success:true,meta:{changes:Number(result.changes)}}},
      async first(){return db.prepare(sql).get(...values)||null},
      async all(){return {success:true,results:db.prepare(sql).all(...values)}},
    });return statement()}
  }
  const db=new D1(),env={MINGEAGLE_DB:db,GEOAPIFY_API_KEY:'test-fixture-only'};
  let failedGeo=false,failedWeb=false,schoolMode=false,badGeoMode=false;
  const orgHtml=(school=false)=>`<html><head><title>${school?'Northstar Elementary School':'Northstar Basketball Academy'}</title><script type="application/ld+json">{"@type":"Organization","name":"${school?'Northstar Elementary School':'Northstar Basketball Academy'}"}</script></head><body><h1>${school?'Northstar Elementary School':'Northstar Basketball Academy'}</h1><p>Dallas, Texas. Basketball training academy, private basketball coach lessons, youth basketball club, AAU tryouts, indoor basketball gym, recreation community YMCA programs, basketball summer camp, sporting goods wholesale distributor and physical education school equipment supplier. Register for training classes. Contact us.</p><p>Alex Morgan - Head Coach. School athletics and purchasing procurement department.</p><a href="/contact">Contact</a><a href="mailto:hello@${school?'school':'academy'}.example">hello@${school?'school':'academy'}.example</a><a href="tel:2145550186">214-555-0186</a></body></html>`;
  async function mockFetch(input,init={}){
    const url=new URL(String(input));
    if(url.pathname.startsWith('/api/admin/')){
      const name=url.pathname.split('/').pop();
      return handlers[name].onRequestPost({request:new Request(url,{...init}),env});
    }
    if(url.hostname==='api.geoapify.com'){
      if(failedGeo)return new Response('Unavailable',{status:503});
      if(url.pathname.includes('geocode')){
        if(url.searchParams.get('type')==='city')return Response.json({results:[{name:'Dallas',place_id:'city1',state_code:'TX',country_code:'us'}]});
        if(badGeoMode)return Response.json({results:[{name:'Basketball Court Drinking Fountain',place_id:'badfountain',city:'Dallas',state_code:'TX',country_code:'us'},{name:'Austin Basketball Academy',place_id:'wrongcity',city:'Austin',state_code:'TX',country_code:'us'},{name:'Unverified Basketball Academy',place_id:'noweb',city:'Dallas',state_code:'TX',country_code:'us'}]});
        return Response.json({results:[{name:schoolMode?'Northstar Elementary School':'Northstar Basketball Academy',place_id:schoolMode?'school1':'academy1',city:'Dallas',state_code:'TX',country_code:'us',formatted:'Dallas Texas'}]});
      }
      if(url.pathname.endsWith('/places')&&badGeoMode)return Response.json({features:[]});
      if(url.pathname.includes('place-details')&&badGeoMode)return Response.json({features:[{properties:{name:'Unverified Basketball Academy',city:'Dallas',state_code:'TX',country_code:'us'}}]});
      if(url.pathname.endsWith('/places'))return Response.json({features:[{properties:{name:'Northstar Sports Center',place_id:'center1',city:'Dallas',state_code:'TX',country_code:'us'}}]});
      if(url.pathname.includes('place-details'))return Response.json({features:[{properties:{feature_type:'details',name:schoolMode?'Northstar Elementary School':url.searchParams.get('id')==='center1'?'Northstar Sports Center':'Northstar Basketball Academy',city:'Dallas',state_code:'TX',country_code:'us',formatted:'Dallas Texas',website:`https://${schoolMode?'school':url.searchParams.get('id')==='center1'?'center':'academy'}.example`,contact:{email:schoolMode?'hello@school.example':'hello@academy.example',phone:'214-555-0186'}}}]});
    }
    if(url.hostname==='www.bing.com'){
      if(failedWeb)return new Response('Unavailable',{status:503});
      return new Response('<rss><channel><item><title>Northstar Basketball Academy</title><link>https://academy.example</link><description>Basketball training academy in Dallas Texas</description></item><item><title>Live scores</title><link>https://espn.com</link><description>Basketball news stats</description></item></channel></rss>');
    }
    if(url.hostname==='austin.example')return new Response(orgHtml().replaceAll('Dallas','Austin'),{headers:{'content-type':'text/html'}});
    if(url.hostname==='redirect.example')return new Response('',{status:302,headers:{location:'http://169.254.169.254/latest/meta-data'}});
    if(['academy.example','center.example','school.example'].includes(url.hostname))return new Response(orgHtml(url.hostname==='school.example'),{headers:{'content-type':'text/html'}});
    throw new Error('Unexpected network request: '+url.hostname+url.pathname);
  }
  globalThis.fetch=mockFetch;
  const post=async(name,input,customEnv=env)=>{
    const r=await handlers[name].onRequestPost({request:new Request('https://test.example/api/admin/'+name,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)}),env:customEnv});
    return {status:r.status,body:await r.json()};
  };
  const get=async(params='')=>{const r=await handlers.discovery.onRequestGet({request:new Request('https://test.example/api/admin/discovery?'+params),env});return {status:r.status,body:await r.json()}};
  assert.equal(catalog.TYPE_OPTIONS.length,16);
  for(const state of Object.keys(catalog.STATE_NAMES))for(const type of catalog.COMMERCIAL_TYPES)assert.ok(catalog.queryPlan(state,type).length>0);
  assert.notDeepEqual(catalog.queryPlan('TX','BASKETBALL_TRAINING','',0,8),catalog.queryPlan('TX','BASKETBALL_TRAINING','',1,8));
  for(const input of [{stateCode:'ZZ',customerType:'SPORTS_STORE'},{stateCode:'TX',customerType:'UNKNOWN'},{stateCode:'TX',customerType:'SPORTS_STORE',targetCount:'NaN'},{stateCode:'TX',customerType:'SPORTS_STORE',round:-1}]){
    assert.equal((await post('discovery-search-v2',input)).status,400);
  }
  assert.equal(catalog.csvCell(' =SUM(1)'),'"\' =SUM(1)"');
  const search={stateCode:'TX',customerType:'BASKETBALL_TRAINING',targetCount:20,city:'Dallas'};
  let result=await post('discovery-search-v2',search);
  assert.equal(result.status,200);assert.equal(result.body.added,2);assert.equal(result.body.found,2);assert.equal(result.body.updated,0);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM discovery_candidates').get().n,2);
  assert.equal(result.body.geoFound+result.body.webFound,3,'source totals overlap, run totals must deduplicate');
  result=await post('discovery-search-v2',{...search,round:1});
  assert.equal(result.body.added,0);assert.equal(result.body.updated,2);assert.equal(result.body.nextRound,2);
  db.sqlite.exec("UPDATE discovery_candidates SET status='IGNORED' WHERE source_key='web:academy.example'");
  result=await post('discovery-search-v2',{...search,round:2});
  assert.equal(result.body.found,1);assert.equal(db.sqlite.prepare("SELECT status FROM discovery_candidates WHERE source_key='web:academy.example'").get().status,'IGNORED');
  const ignoredId=db.sqlite.prepare("SELECT id FROM discovery_candidates WHERE status='IGNORED'").get().id;
  assert.equal((await post('discovery',{action:'ADD_TO_CRM',candidateId:ignoredId})).body.ok,false);
  db.sqlite.exec("UPDATE discovery_candidates SET status='NEW',email='' WHERE source_key='web:academy.example'");
  await post('discovery-geoapify-v1',search);
  assert.equal(db.sqlite.prepare("SELECT email FROM discovery_candidates WHERE source_key='web:academy.example'").get().email,'hello@academy.example');
  badGeoMode=true;
  assert.equal((await post('discovery-geoapify-v1',search)).body.found,0,'fountains, courts, wrong-city results and unverified POIs must not become buyer leads');
  badGeoMode=false;
  const webInput={...search,websiteUrls:['https://academy.example','https://academy.example/contact','https://austin.example','https://britannica.com/sports/basketball','https://redirect.example','http://10.0.0.1/']};
  result=await post('discovery-website-v1',webInput);
  assert.equal(result.status,200);assert.equal(result.body.found,1);assert.equal(result.body.added,0);assert.equal(result.body.updated,1);
  assert.equal(result.body.results.filter(x=>x.status==='REJECTED').length,4);
  assert.equal(result.body.results.filter(x=>x.status==='DUPLICATE').length,1);
  assert.equal(db.sqlite.prepare("SELECT source_provider FROM discovery_candidates WHERE source_key='web:academy.example'").get().source_provider,'OFFICIAL_WEBSITE_IMPORT_V1');
  assert.equal((await post('discovery-website-v1',{...search,websiteUrls:Array(11).fill('https://academy.example')})).status,400);
  const academyId=db.sqlite.prepare("SELECT id FROM discovery_candidates WHERE source_key='web:academy.example'").get().id;
  assert.equal((await post('discovery',{action:'IGNORE',candidateId:academyId})).body.ok,true);
  assert.equal((await post('discovery-website-v1',{...search,websiteUrls:['https://academy.example']})).body.found,0,'manual intake must also preserve ignored candidates');
  assert.equal((await post('discovery',{action:'RESTORE',candidateId:academyId})).body.ok,true);
  assert.equal(db.sqlite.prepare('SELECT status FROM discovery_candidates WHERE id=?').get(academyId).status,'NEW');
  for(const type of ['INDEPENDENT_COACH','MULTISPORT_ACADEMY','RECREATION_CENTER','SPORTS_DISTRIBUTOR','SUMMER_CAMP']){
    assert.equal((await post('discovery-web-v6',{...search,customerType:type})).body.found,1,'new customer type should pass its relevant service evidence');
  }
  schoolMode=true;result=await post('discovery-search-v2',{...search,customerType:'ELEMENTARY_SCHOOL'});
  assert.equal(result.status,200);assert.equal(result.body.added,1,'school SQL insert must bind correctly');schoolMode=false;
  assert.equal((await post('discovery',{...search,action:'SEARCH'})).body.release,'DISCOVERY_V13_1_QUALIFIED_BUYERS_2026-10-07','legacy search must use the verified orchestrator');
  failedGeo=true;result=await post('discovery-search-v2',search);
  assert.equal(result.status,200);assert.equal(result.body.partial,true);assert.ok(result.body.errors.geoapify);
  failedWeb=true;result=await post('discovery-search-v2',search);assert.equal(result.status,502);assert.equal(result.body.sources.web,false);
  failedGeo=failedWeb=false;
  for(let i=0;i<70;i++)db.sqlite.prepare("INSERT INTO discovery_candidates(id,source_key,name,customer_type,state_region,lead_score,grade,status,source_url,email) VALUES(?,?,?,?,?,85,'A','NEW',?,?)").run('p'+i,'test:'+i,'Page Prospect '+i,'INDEPENDENT_COACH','TX','https://fixture.example/'+i,'buyer'+i+'@fixture.example');
  let list=await get('status=NEW&type=INDEPENDENT_COACH&page=2&pageSize=50');
  assert.equal(list.body.pagination.total,70);assert.equal(list.body.candidates.length,20);
  assert.equal((await get('q=%25')).body.pagination.total,0,'search wildcard should be treated literally');
  assert.equal((await get('state=ZZ')).status,400);
  db.sqlite.exec("UPDATE discovery_candidates SET email=NULL,phone=NULL,whatsapp=NULL WHERE id='p0'");
  list=await get('type=INDEPENDENT_COACH&readiness=INCOMPLETE');assert.equal(list.body.pagination.total,1);
  list=await get('type=INDEPENDENT_COACH&readiness=PRIORITY');assert.equal(list.body.pagination.total,69);
  const added=await post('discovery',{action:'ADD_TO_CRM',candidateId:'p1'});assert.equal(added.body.ok,true);
  const again=await post('discovery',{action:'ADD_TO_CRM',candidateId:'p1'});assert.equal(again.body.alreadyAdded,true);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM messages').get().n,0,'discovery/import must not send or queue communications');
  const tables=db.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%email%'").all();
  assert.equal(tables.length,0);
  console.log('PASS: catalog/50 states, rotating city queries, five new buyer types, cross-source dedupe, fresh/update counts, ignored/restore protection, empty contact repair, rejected wrong-city and facility POIs, verified website intake, invalid/private/redirect URL rejection, school insert, partial/total source failures, literal search, pagination, readiness filters, CRM idempotence, CSV safety, no communications.');
  db.sqlite.close();
}finally{globalThis.fetch=originalFetch;rmSync(folder,{recursive:true,force:true})}

