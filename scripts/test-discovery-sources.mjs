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
  let d1Queries=0,d1Cap=Infinity;
  const db={prepare(sql){d1Queries++;if(d1Queries>d1Cap)throw new Error('Mock Cloudflare D1: more than 50 queries per request');const statement=(args=[])=>({bind(...values){return statement(values)},async first(){return sqlite.prepare(sql).get(...args)||null},async all(){return {results:sqlite.prepare(sql).all(...args)}},async run(){return {meta:sqlite.prepare(sql).run(...args)}}});return statement()}};
  const input={stateCode:'TX',customerType:'BASKETBALL_TRAINING',city:'Dallas',targetCount:20,round:0};
  const html=(name='Northstar Basketball Academy')=>`<html><title>${name}</title><script type="application/ld+json">{"@type":"Organization","name":"${name}"}</script><h1>${name}</h1><p>Dallas Texas basketball training academy private lessons register youth programs. Contact us. Elementary school district purchasing procurement physical education department.</p><a href="mailto:hello@northstar.example">hello@northstar.example</a><a href="tel:2145550186">214-555-0186</a></html>`;
  let looseMap=false,mapRequests=[],failOverpass=false,missingMapSite=false;
  let failIndex=false,manySchoolResults=false,schoolTitle='Northstar Elementary School',websiteLinks='',websiteWrongRegion=false,websiteRequests=0;
  globalThis.fetch=async(value,init)=>{
    const u=new URL(String(value));
    if(u.hostname==='www.bing.com'){
      if(failIndex)return new Response('Failure',{status:503});
      const social=u.searchParams.get('q').includes('site:facebook')?'https://www.facebook.com/northstar/':u.searchParams.get('q').includes('site:tiktok')?'https://www.tiktok.com/@northstar/':u.searchParams.get('q').includes('site:instagram')?'https://www.instagram.com/northstar/':u.searchParams.get('q').includes('site:linkedin')?'https://www.linkedin.com/company/northstar/':u.searchParams.get('q').includes('site:.gov')?'https://parks.example.gov/northstar':'https://www.chamberofcommerce.com/business/northstar';
      return new Response(`<rss><channel><item><title>Northstar Basketball Academy</title><link>${social}</link><description>Dallas Texas basketball training programs.</description></item><item><title>Unrelated Austin Academy</title><link>https://www.facebook.com/austin/</link><description>Austin basketball academy.</description></item></channel></rss>`);
    }
    if((u.hostname==='nces.ed.gov'||u.hostname==='services1.arcgis.com')&&manySchoolResults)return Response.json({features:Array.from({length:13},(_,i)=>({attributes:{NCESSCH:'4899900'+String(i).padStart(5,'0'),NAME:'Dallas Pilot Elementary '+i,CITY:'DALLAS',STATE:'TX',STREET:(i+1)+' Pilot Road',SCHOOLYEAR:'2024-2025'}}))});
    if(u.hostname==='nces.ed.gov'||u.hostname==='services1.arcgis.com')return Response.json({features:[{attributes:{NCESSCH:'480000100001',PPIN:'00000001',LEAID:'4800001',NAME:schoolTitle,CITY:'DALLAS',STATE:'TX',STREET:'1 Public Street',SCHOOLYEAR:'2024-2025'}},{attributes:{NCESSCH:'480000100002',LEAID:'4800002',NAME:'Austin Elementary',CITY:'AUSTIN',STATE:'TX'}}]});
    if(u.hostname==='api.geoapify.com'){
      mapRequests.push(u);
      if(u.pathname==='/v2/places')return Response.json({features:[{properties:{name:'Northstar Sports Center',place_id:'sports-place-1',city:'Dallas',country_code:'us',state_code:'TX',categories:['sport.sports_centre'],website:missingMapSite?undefined:'https://northstar.example',datasource:{raw:{osm_type:'n',osm_id:123,sport:'basketball'}}}},{properties:{name:'Wrong City Center',place_id:'sports-place-2',city:'Austin',country_code:'us',state_code:'TX'}}]});
      return Response.json({results:[{place_id:'city-place-1',state_code:'TX',country_code:'us',bbox:{lat1:32.5,lon1:-97,lat2:33,lon2:-96}}]});
    }
    if((u.hostname==='overpass-api.de'||u.hostname==='overpass.private.coffee')&&failOverpass)return new Response('Public source temporary failure',{status:500});
    if(u.hostname==='overpass-api.de'||u.hostname==='overpass.private.coffee')return Response.json({elements:[{type:'node',id:123,tags:{name:'Northstar Basketball Academy','addr:city':'Dallas',website:'https://northstar.example'}},{type:'node',id:124,tags:{name:'Basketball Court','addr:city':'Dallas'}},{type:'node',id:125,tags:{name:'Wrong City Academy','addr:city':'Austin'}},...(looseMap?[{type:'node',id:126,tags:{name:'Within City Boundary Academy',sport:'basketball'}}]:[])]});
    if(u.hostname==='northstar.example'){
      websiteRequests++;
      const page=html(u.pathname.includes('elementary')?'Northstar Elementary School':u.pathname.includes('middle')?'Northstar Middle School':u.pathname.includes('wrong')?'Different Business Academy':'Northstar Basketball Academy');
      return new Response((websiteWrongRegion?page.replace('Dallas Texas','Austin Texas'):page)+websiteLinks,{headers:{'content-type':'text/html'}});
    }
    throw new Error('Unexpected endpoint '+u.hostname);
  };
  const post=async body=>{const r=await handler.onRequestPost({request:new Request('https://test.example/api/admin/discovery-sources-v1',{method:'POST',body:JSON.stringify(body)}),env:{MINGEAGLE_DB:db}});return {status:r.status,body:await r.json()};};
  const get=async query=>{const r=await handler.onRequestGet({request:new Request('https://test.example/api/admin/discovery-sources-v1?'+query),env:{MINGEAGLE_DB:db}});return {status:r.status,body:await r.json()};};
  assert.equal(sources.sourceUrl('http://127.0.0.1/','SOCIAL'),'');assert.equal(sources.sourceUrl('https://www.instagram.com/p/123/','SOCIAL'),'');assert.equal(sources.sourceUrl('https://www.linkedin.com/in/person/','SOCIAL'),'');assert.equal(sources.sourceUrl('https://www.instagram.com/northstar/?utm=123#x','SOCIAL'),'https://www.instagram.com/northstar/');
  const query=sources.ncesQuery({...input,customerType:'SCHOOL_DISTRICT',city:"O'Fallon"});assert.ok(new URL(query.url).searchParams.get('where').includes("O''FALLON"));assert.throws(()=>sources.osmQuery({...input,city:''}));assert.ok(sources.osmQuery(input).includes('US-TX'));
  assert.equal(handler.clueMatches('Northstar Basketball Academy','Northstar Basketball Academy | Facebook'),true);assert.equal(handler.clueMatches('Different Business Academy','Northstar Basketball Academy'),false);
  assert.ok(sources.osmQuery(input,[32.5,-97,33,-96]).includes('(32.5,-97,33,-96)'));
  assert(sources.osmQuery(input).includes('["name"~"basketball|hoops|hoopers|aau",i]["website"]'),'basketball academy map names with official sites must not require a missing sport tag');
  assert(!sources.osmQuery({...input,customerType:'SPORTS_STORE'}).includes('["name"~"basketball|hoops|hoopers|aau",i]'),'basketball academy fallback does not contaminate sports retail results');assert.throws(()=>sources.osmQuery(input,[33,-97,32.5,-96]));
  assert.equal((await sources.osmClues(input,'test-fixture-only')).clues.length,1,'city bounding boxes must preserve facility and city filtering');
  let result=await post({...input,action:'SEARCH',sources:['SOCIAL','DIRECTORY','OSM']});assert.equal(result.status,200);assert.equal(result.body.added,6);assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM discovery_candidates').get().n,0,'unverified clues must not become buyers');
  result=await post({...input,action:'SEARCH',sources:['SOCIAL','DIRECTORY','OSM']});assert.equal(result.body.added,0);assert.equal(result.body.updated,6);
  const clue=sqlite.prepare("SELECT * FROM discovery_clues WHERE source_provider='SOCIAL' LIMIT 1").get();
  assert.equal((await post({action:'VERIFY',clueId:clue.id,website:'http://10.0.0.1/'})).status,400);
  assert.equal((await post({action:'VERIFY',clueId:clue.id,website:'https://northstar.example/wrong'})).status,422);
  assert.equal((await post({action:'IGNORE',clueId:clue.id})).body.ok,true);
  assert.equal((await post({...input,action:'SEARCH',sources:['SOCIAL']})).body.updated,2,'ignored clue must stay ignored');
  assert.equal((await post({action:'VERIFY',clueId:clue.id,website:'https://northstar.example'})).status,400);
  await post({action:'RESTORE',clueId:clue.id});result=await post({action:'VERIFY',clueId:clue.id,website:'https://northstar.example'});assert.equal(result.body.ok,true);assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM discovery_candidates').get().n,1);
  assert.equal(result.body.intake.imported,1,'manually verified public clues automatically become prospects');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM leads').get().n,1);
  assert.equal((await post({action:'VERIFY',clueId:clue.id})).body.alreadyConverted,true);assert.equal((await post({action:'IGNORE',clueId:clue.id})).status,400);
  const next=sqlite.prepare("SELECT * FROM discovery_clues WHERE source_provider='SOCIAL' AND status='PENDING' LIMIT 1").get();result=await post({action:'VERIFY',clueId:next.id,website:'https://northstar.example'});assert.equal(result.body.existing,true);assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM discovery_candidates').get().n,1,'cross-source clues should associate the same business');
  const third=sqlite.prepare("SELECT * FROM discovery_clues WHERE source_provider='SOCIAL' AND status='PENDING' LIMIT 1").get();sqlite.exec("UPDATE discovery_candidates SET status='IGNORED'");assert.equal((await post({action:'VERIFY',clueId:third.id,website:'https://northstar.example'})).status,409);sqlite.exec("UPDATE discovery_candidates SET status='NEW'");
  result=await post({...input,customerType:'ELEMENTARY_SCHOOL',action:'SEARCH',sources:['NCES']});assert.equal(result.body.added,1);const school=sqlite.prepare("SELECT * FROM discovery_clues WHERE source_provider='NCES'").get();assert.ok(school.source_evidence.includes('2024-2025'));assert.equal((await post({action:'VERIFY',clueId:school.id,website:'https://northstar.example/elementary'})).body.ok,true);
  schoolTitle='Northstar Middle School';result=await post({...input,customerType:'MIDDLE_HIGH_SCHOOL',action:'SEARCH',sources:['NCES']});assert.equal(result.body.added,0,'converted official source ID must not be recycled into another school');
  sqlite.prepare("INSERT INTO discovery_clues(id,source_key,title,source_provider,source_url,customer_type,state_region,city) VALUES('middle','nces:school:middle','Northstar Middle School','NCES','https://nces.ed.gov/','MIDDLE_HIGH_SCHOOL','TX','Dallas')").run();assert.equal((await post({action:'VERIFY',clueId:'middle',website:'https://northstar.example/middle'})).body.ok,true);assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM discovery_candidates').get().n,3,'distinct school pages on one district domain must stay separate');
  assert.equal(sqlite.prepare('SELECT COUNT(DISTINCT company_id) AS n FROM leads').get().n,3,'distinct schools on a shared domain must remain distinct CRM prospects');
  assert.equal((await get('status=PENDING&page=Infinity')).status,400);assert.equal((await get('status=BAD')).status,400);assert.equal((await get('status=CONVERTED')).body.clues.length,4);
  failIndex=true;assert.equal((await post({...input,action:'SEARCH',sources:['SOCIAL','DIRECTORY']})).status,502);result=await post({...input,customerType:'SCHOOL_DISTRICT',action:'SEARCH',sources:['SOCIAL','NCES']});assert.equal(result.status,200);assert.equal(result.body.sources.SOCIAL.ok,false);assert.equal(result.body.sources.NCES.ok,true);
  assert.equal(sources.socialProvider('https://www.tiktok.com/@northstar'),'TIKTOK');
  assert.equal(sources.sourceUrl('https://www.tiktok.com/@Northstar?lang=en#bio','TIKTOK'),'https://www.tiktok.com/@northstar/');
  assert.equal(sources.sourceUrl('https://www.tiktok.com/@northstar/video/123','TIKTOK'),'');
  assert.equal(sources.sourceUrl('https://vm.tiktok.com/abc/','TIKTOK'),'');
  assert.equal(sources.sourceUrl('https://www.tiktok.com/tag/basketball','TIKTOK'),'');
  assert.equal(sources.sourceUrl('https://www.facebook.com/northstar/','TIKTOK'),'');
  assert.equal(sources.sourceUrl('https://m.facebook.com/profile.php?id=123456789&ref=search','FACEBOOK'),'https://www.facebook.com/profile.php?id=123456789');
  assert.equal(sources.sourceUrl('https://www.facebook.com/northstar/about/?ref=search','FACEBOOK'),'https://www.facebook.com/northstar/');
  assert.equal(sources.sourceUrl('https://www.facebook.com/groups/basketball','FACEBOOK'),'');
  assert.equal(sources.sourceUrl('https://www.instagram.com/northstar/reels/','INSTAGRAM'),'');
  assert.equal(sources.sourceUrl('https://www.linkedin.com/company/northstar/about/','LINKEDIN'),'https://www.linkedin.com/company/northstar/');
  assert.equal(sources.sourceUrl('https://www.linkedin.com/in/northstar/','LINKEDIN'),'');
  assert.equal((await get('source=BAD')).status,400);
  failIndex=false;
  result=await post({...input,action:'SEARCH',sources:['FACEBOOK','TIKTOK','INSTAGRAM','LINKEDIN']});assert.equal(result.status,200);assert.equal(result.body.added,1,'separate platforms must reuse existing profile clues and add the new TikTok profile only');
  assert.equal(result.body.sources.TIKTOK.found,1,'duplicate keyword results must collapse to one profile');
  const tiktok=sqlite.prepare("SELECT * FROM discovery_clues WHERE source_provider='TIKTOK'").get();
  assert.equal((await get('status=PENDING&source=TIKTOK')).body.pagination.total,1);
  assert.equal((await get('status=PENDING&source=FACEBOOK')).body.pagination.total,0,'legacy records remain identifiable without changing their source');
  const candidateCount=sqlite.prepare('SELECT COUNT(*) AS n FROM discovery_candidates').get().n;
  const manual={...input,action:'ADD_SOCIAL',source:'TIKTOK',title:'Northstar Basketball Academy',sourceUrl:'https://www.tiktok.com/@manualnorthstar',evidence:'Public profile says Dallas Texas basketball training academy.',website:'https://northstar.example'};
  result=await post({...manual,sourceUrl:'http://127.0.0.1/'});assert.equal(result.status,400);
  assert.equal((await post({...manual,source:'FACEBOOK'})).status,400);
  assert.equal((await post({...manual,sourceUrl:'https://www.tiktok.com/@manualnorthstar/video/123'})).status,400);
  assert.equal((await post({...manual,evidence:'short'})).status,400);
  assert.equal((await post({...manual,city:''})).status,400);
  assert.equal((await post({...manual,website:'https://www.facebook.com/northstar'})).status,400);
  result=await post(manual);assert.equal(result.body.existing,false);const manualId=result.body.clueId;
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM discovery_candidates').get().n,candidateCount,'manual public profiles remain clues until official verification');
  result=await post({...manual,sourceUrl:'https://www.tiktok.com/@ManualNorthstar/?utm_source=test'});assert.equal(result.body.existing,true);assert.equal(result.body.clueId,manualId);
  await post({action:'IGNORE',clueId:manualId});result=await post(manual);assert.equal(result.body.clueStatus,'IGNORED','manual import must not restore ignored profiles');
  await post({action:'RESTORE',clueId:manualId});result=await post({action:'VERIFY',clueId:manualId,website:'https://northstar.example'});assert.equal(result.body.existing,true);
  result=await post(manual);assert.equal(result.body.clueStatus,'CONVERTED','manual import must preserve converted profiles');
  assert.equal((await get('status=CONVERTED&source=TIKTOK')).body.pagination.total,1);
  assert.equal((await post({...manual,sourceUrl:tiktok.source_url})).body.existing,true);
  const websiteFixture=`<a href="https://www.facebook.com/northstar/?ref=site">Facebook</a><a href='//www.tiktok.com/@Northstar/?utm=site'>TikTok</a><a href="https://www.tiktok.com/@northstar/video/123">Video</a><a href="https://www.facebook.com/groups/northstar/">Group</a><a href="https://www.instagram.com/northstar/p/123">Post</a><a href="https://www.linkedin.com/in/coach/">Person</a><a data-href="https://www.instagram.com/fake/">Not a link</a><a href="http://127.0.0.1/">Private</a><!-- <a href="https://www.instagram.com/commented/">hidden</a> --><template><a href="https://www.instagram.com/template/">template</a></template><script>const hidden='<a href="https://www.instagram.com/scripted/">script</a>'</script><a href="https://m.facebook.com/profile.php?id=123456789&amp;ref=website">Numeric FB</a><script type="application/ld+json">{"@graph":[{"@type":"SportsOrganization","sameAs":["https://www.instagram.com/northstarsports/?ref=site","https://www.linkedin.com/company/northstarsports/"]},{"@type":"Person","sameAs":"https://www.instagram.com/privatecoach/"}]}</script>`;
  const parsedProfiles=sources.websiteSocialProfiles([{url:'https://northstar.example/contact',html:websiteFixture},{url:'https://northstar.example',html:'<a href="https://www.tiktok.com/@northstar/">Duplicate</a>'}]);
  assert.equal(parsedProfiles.length,5,'direct business profiles and institutional sameAs only');
  assert.ok(parsedProfiles.every(p=>p.pageUrl==='https://northstar.example/contact'));
  assert.equal(parsedProfiles.find(p=>p.url.includes('profile.php')).url,'https://www.facebook.com/profile.php?id=123456789');
  assert.ok(parsedProfiles.find(p=>p.source==='TIKTOK').originalUrl.includes('utm=site'),'keep original public link as evidence');
  assert.equal(sources.websiteSocialProfiles([{url:'http://10.0.0.1',html:websiteFixture}]).length,0);
  websiteLinks=websiteFixture;
  const discover={...input,action:'DISCOVER_SOCIAL',website:'https://northstar.example'};
  const countsBefore={candidates:sqlite.prepare('SELECT COUNT(*) AS n FROM discovery_candidates').get().n,leads:sqlite.prepare('SELECT COUNT(*) AS n FROM leads').get().n};
  assert.equal((await post({...discover,website:'http://10.0.0.1'})).status,400);
  assert.equal((await post({...discover,website:'https://www.facebook.com/northstar'})).status,400);
  assert.equal((await post({...discover,city:''})).status,400);
  websiteWrongRegion=true;assert.equal((await post(discover)).status,422,'reject website lacking selected city evidence');websiteWrongRegion=false;
  const existingFacebook=sqlite.prepare("SELECT * FROM discovery_clues WHERE source_key='https://www.facebook.com/northstar/'").get();
  websiteRequests=0;result=await post(discover);assert.equal(result.body.ok,true);assert.equal(result.body.found,5);assert.equal(result.body.added,3);assert.equal(result.body.existing,2);assert.equal(websiteRequests,1,'reuse verified HTML, do not refetch website for extraction');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM discovery_candidates').get().n,countsBefore.candidates);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM leads').get().n,countsBefore.leads,'website discovery does not import CRM leads');
  const auto=sqlite.prepare("SELECT * FROM discovery_clues WHERE source_provider='INSTAGRAM'").get();
  assert.ok(auto.source_evidence.includes('机构官网公开链接'));assert.ok(auto.source_evidence.includes('https://northstar.example'));assert.equal(auto.status,'PENDING');
  assert.equal(sqlite.prepare('SELECT status FROM discovery_clues WHERE id=?').get(existingFacebook.id).status,existingFacebook.status);
  await post({action:'IGNORE',clueId:auto.id});result=await post(discover);assert.equal(result.body.added,0);assert.equal(result.body.existing,5);assert.equal(sqlite.prepare('SELECT status FROM discovery_clues WHERE id=?').get(auto.id).status,'IGNORED');
  sqlite.prepare("UPDATE discovery_candidates SET status='IGNORED' WHERE website='https://northstar.example'").run();assert.equal((await post(discover)).status,409);sqlite.prepare("UPDATE discovery_candidates SET status='NEW' WHERE website='https://northstar.example'").run();
  result=await post({...discover,customerType:'ELEMENTARY_SCHOOL',website:'https://northstar.example/elementary'});assert.equal(result.body.name,'Northstar Elementary School');assert.equal(result.body.added,0,'school profile discovery preserves shared existing profiles');
  websiteLinks='';result=await post(discover);assert.equal(result.body.found,0);assert.equal(result.body.added,0);assert.ok(result.body.note.includes('未找到'));

  // New coverage must execute, preserve real classifications and expose honest counts.
  assert.equal(sources.sourceCity({...input,city:'',round:1}).city,'Houston');
  assert.equal(sources.sourceCity({...input,city:'',round:10}).page,1);
  const independent=sources.ncesQuery(input);assert.equal(independent.district,false);assert.ok(!new URL(independent.url).searchParams.get('where').includes('LIKE'),'commercial filters must not disable public school catalogs');
  schoolTitle='Northstar Learning School';result=await post({...input,round:9,action:'SEARCH',sources:['NCES']});assert.equal(result.body.sources.NCES.ok,true);
  assert.equal(result.body.sources.NCES.found,1,'found must include retained converted source records');assert.equal(result.body.sources.NCES.retained,1);assert.equal(result.body.sources.NCES.added,0);
  result=await post({...input,action:'SEARCH',sources:['NCES_PRIVATE','NCES_DISTRICTS']});assert.equal(result.status,200);assert.equal(result.body.added,1,'existing district is deduplicated and new private-school ID saved');
  const privateSchool=sqlite.prepare("SELECT * FROM discovery_clues WHERE source_provider='NCES_PRIVATE'").get();assert.equal(privateSchool.customer_type,'PRIVATE_CHARTER_SCHOOL');assert.ok(privateSchool.source_url.includes('PPIN'));
  const districtRecord=sqlite.prepare("SELECT * FROM discovery_clues WHERE source_key='nces:district:4800001'").get();assert.equal(districtRecord.customer_type,'SCHOOL_DISTRICT','catalog type must override commercial search intent');
  looseMap=true;const withBounds=await sources.osmClues({...input,city:''},'fixture-only');assert.equal(withBounds.clues.length,2);assert.ok(withBounds.clues.find(c=>c.key==='osm:node:126').snippet.includes('城市归属待核实'));
  assert.equal((await sources.osmClues({...input,city:''})).clues.length,1,'missing-city tags require a verified bounding box');
  mapRequests=[];const places=await sources.geoapifyClues({...input,city:'',round:10},'fixture-only');assert.equal(places.clues.length,1);assert.equal(places.clues[0].key,'osm:node:123','map providers share stable OSM keys');assert.equal(mapRequests.find(u=>u.pathname==='/v2/places').searchParams.get('offset'),'20');assert.ok(!places.clues[0].url.includes('fixture-only'),'never store API credentials in sources');
  missingMapSite=true;
  const missingSite=await sources.geoapifyClues(input,'fixture-only');
  assert.equal(missingSite.clues.length,1);
  assert.equal(missingSite.clues[0].website,'');
  assert.equal(missingSite.clues[0].placeId,'sports-place-1','retain official place ID when provider omitted the website');
  missingMapSite=false;
  
  assert.equal(sources.mapBuyerMatch('Emler Swim School','BASKETBALL_TRAINING'),false);assert.equal(sources.mapBuyerMatch('Climbing Club','BASKETBALL_GYM'),false);assert.equal(sources.mapBuyerMatch('Aquatic Sports Center','BASKETBALL_GYM','basketball'),true);
  failOverpass=true;mapRequests=[];const fallback=await sources.collectSource(input,'OSM','fixture-only',db);assert.equal(fallback.clues.length,1);assert.equal(fallback.clues[0].url,'https://www.openstreetmap.org/node/123');assert.ok(fallback.note.includes('备用接口'));assert.equal(fallback.clues[0].source,'OSM');
  const beforeCache=mapRequests.length;await sources.collectSource(input,'GEOAPIFY','fixture-only',db);assert.equal(mapRequests.length,beforeCache,'OSM fallback and Geoapify share successful public map cache');failOverpass=false;
  sqlite.prepare("INSERT INTO discovery_clues(id,source_key,title,source_provider,source_url,customer_type,state_region,city,status) VALUES('alias','geoapify:sports-place-1','Northstar','GEOAPIFY','https://www.openstreetmap.org/','BASKETBALL_TRAINING','TX','Dallas','IGNORED')").run();
  await post({action:'IGNORE',clueId:sqlite.prepare("SELECT id FROM discovery_clues WHERE source_key='osm:node:123'").get().id});sqlite.prepare("UPDATE discovery_clues SET source_key='old-osm-fixture' WHERE source_key='osm:node:123'").run();
  const aliasResponse=await handler.onRequestPost({request:new Request('https://test.example/api/admin/discovery-sources-v1',{method:'POST',body:JSON.stringify({...input,action:'SEARCH',sources:['GEOAPIFY']})}),env:{MINGEAGLE_DB:db,GEOAPIFY_API_KEY:'fixture-only'}});const aliasResult=await aliasResponse.json();assert.equal(aliasResult.sources.GEOAPIFY.retained,1);assert.equal((await get('status=IGNORED&source=GEOAPIFY')).body.clues.some(c=>c.id==='alias'),true);assert.equal(sqlite.prepare("SELECT status FROM discovery_clues WHERE source_key='osm:node:123'").get().status,'IGNORED','OSM shorthand aliases preserve old ignored records');
  const mappedResponse=await handler.onRequestPost({request:new Request('https://test.example/api/admin/discovery-sources-v1',{method:'POST',body:JSON.stringify({...input,action:'SEARCH',sources:['OSM']})}),env:{MINGEAGLE_DB:db,GEOAPIFY_API_KEY:'fixture-only'}});assert.equal(mappedResponse.status,200);assert.equal((await get('status=IGNORED&source=OSM')).body.clues.some(c=>c.id==='alias'),true,'same mapped entity remains visible in both observed source filters');
  assert.equal((await post({...input,action:'SEARCH',sources:['GEOAPIFY']})).status,502,'missing API configuration is reported, not shown as zero results');
  assert.equal((await get('status=ALL&state=TX&type=PRIVATE_CHARTER_SCHOOL')).body.pagination.total,1);assert.equal((await get('state=XX')).status,400);assert.equal((await get('status=ALL&q=100%25')).body.pagination.total,0,'keyword SQL wildcards are literal');
  assert.ok((await get('status=ALL&state=TX&city=Dallas&q=Northstar')).body.clues.length>0);assert.equal((await get('status=ALL&city=Austin')).body.pagination.total,0);
  websiteLinks='<a href="https://www.instagram.com/batchonly/">Instagram</a>';websiteRequests=0;
  result=await post({...input,action:'SEARCH',sources:['WEBSITE_SOCIAL']});assert.equal(result.status,200);assert.equal(result.body.sources.WEBSITE_SOCIAL.found,1);assert.equal(result.body.added,1);assert.equal(websiteRequests,1,'batch socials reads each eligible candidate website once');
  assert.equal((await get('status=PENDING&source=WEBSITE_SOCIAL')).body.pagination.total,1);assert.equal((await get('status=PENDING&source=INSTAGRAM')).body.clues.some(c=>c.source_url.includes('batchonly')),true);
  result=await post({...input,round:1,action:'SEARCH',sources:['WEBSITE_SOCIAL']});assert.equal(result.body.sources.WEBSITE_SOCIAL.found,0);assert.ok(result.body.sources.WEBSITE_SOCIAL.note.includes('暂无下一批'));

  // Free Workers permit at most 50 D1 queries per invocation. A returned
  // source page with 13 records must persist in a sequence of four small
  // writes, without losing the remainder or a previously ignored clue.
  sqlite.exec("CREATE TABLE IF NOT EXISTS discovery_auto_runs(id TEXT PRIMARY KEY,status TEXT,lease_token TEXT,lease_until TEXT)");
  sqlite.prepare("INSERT INTO discovery_auto_runs(id,status,lease_token,lease_until) VALUES('quota-fixture','RUNNING','lease-fixture',datetime('now','+10 minutes'))").run();
  manySchoolResults=true;d1Cap=50;let totalImported=0;
  for(const offset of [0,4,8,12]){
    d1Queries=0;
    const response=await handler.onRequestPost({request:new Request('https://test.example/api/admin/discovery-sources-v1',{method:'POST',body:JSON.stringify({...input,customerType:'ELEMENTARY_SCHOOL',action:'SEARCH',sources:['NCES'],autoRunId:'quota-fixture',autoToken:'lease-fixture',sourceOffset:offset})}),env:{MINGEAGLE_DB:db}});
    const page=await response.json();
    assert.equal(response.status,200,JSON.stringify(page));
    assert(d1Queries<=50,'D1 reads/writes per invocation must respect Workers Free 50-query budget');
    assert.equal(page.sources.NCES.available,13);
    assert.equal(page.sources.NCES.found,Math.min(4,13-offset));
    assert.equal(page.sources.NCES.hasMore,offset+4<13);
    if(offset+4<13)assert.equal(page.sources.NCES.nextOffset,offset+4);
    totalImported+=page.sources.NCES.found;
  }
  assert.equal(totalImported,13,'all discovered records survive chunked automatic writes');
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM discovery_clues WHERE title LIKE 'Dallas Pilot Elementary %'").get().n,13);
  d1Cap=Infinity;manySchoolResults=false;
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM messages').get().n,0);sqlite.close();
  console.log('PASS: V15 independent public/private/district catalogs, city rotation and map pagination, bounding-box POIs, cross-map deduplication, true found/retained counts, literal region/type/name filters, batch website social discovery, credential-free source links, no outreach/messages; verified website social discovery, page/raw-link evidence, institutional sameAs, excluded content/private/person links, no-refetch extraction, duplicate/ignored/converted preservation, school support, zero-result reporting, unverified clue-only storage, verified automatic CRM intake, separate school identities and no outreach; existing public-source searches and verification.');
}finally{globalThis.fetch=original;rmSync(dir,{recursive:true,force:true});}
