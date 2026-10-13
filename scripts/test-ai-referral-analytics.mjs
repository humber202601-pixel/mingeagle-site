import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {aiReferrerPlatform,aiReferralRows,aiLandingRows,aiLandingCategory,dailyRows,synchronize,utcWindow}
 from '../workers/web-analytics-sync.mjs';

const now=new Date('2026-10-13T02:07:12Z'),w=utcWindow(now);
const group=(date,requestHost,refererHost,count,visits)=>({
 dimensions:{date,requestHost,refererHost},count,sum:{visits}
});
const entries=[
 group('2026-10-12','www.mingeagle.com','chatgpt.com',2,1),
 group('2026-10-12','www.mingeagle.com','www.perplexity.ai',1,1),
 group('2026-10-12','www.mingeagle.com','',1,0),
 group('2026-10-12','other.example','claude.ai',99,99),
 group('2026-10-11','www.mingeagle.com','',0,0)
];
for(const [host,expected] of [
 ['ChatGPT.com','CHATGPT'],['chat.openai.com','CHATGPT'],
 ['www.perplexity.ai','PERPLEXITY'],['perplexity.com','PERPLEXITY'],['claude.ai','CLAUDE'],
 ['gemini.google.com','GEMINI'],['copilot.microsoft.com','COPILOT'],['copilot.microsoft365.com','COPILOT'],
 ['fakechatgpt.com',null],['chatgpt.com.evil.example',null],
 ['bing.com',null],['google.com',null],['',null]
])assert.equal(aiReferrerPlatform(host),expected,host);
const baseline=dailyRows(entries,w);
assert.deepEqual(baseline,[
 {date:'2026-10-11',visits:0,sampledPageviews:0},
 {date:'2026-10-12',visits:2,sampledPageviews:4}
]);
const attribution=aiReferralRows(entries,baseline,w);
assert.deepEqual(attribution,[
 {date:'2026-10-11',platform:'ALL_AI',visits:0,sampledPageviews:0},
 {date:'2026-10-12',platform:'ALL_AI',visits:2,sampledPageviews:3},
 {date:'2026-10-12',platform:'CHATGPT',visits:1,sampledPageviews:2},
 {date:'2026-10-12',platform:'PERPLEXITY',visits:1,sampledPageviews:1}
]);
const pageGroups=[
 {count:1,dimensions:{date:'2026-10-12',requestHost:'www.mingeagle.com',
  refererHost:'chatgpt.com',requestPath:'/quiet-indoor-sports-for-kids.html'}},
 {count:1,dimensions:{date:'2026-10-12',requestHost:'www.mingeagle.com',
  refererHost:'chatgpt.com',requestPath:'/products.html'}},
 {count:1,dimensions:{date:'2026-10-12',requestHost:'www.mingeagle.com',
  refererHost:'www.perplexity.ai',requestPath:'/school-sports-equipment-es.html'}},
 {count:1,dimensions:{date:'2026-10-12',requestHost:'www.mingeagle.com',
  refererHost:'',requestPath:'/'}},
 {count:99,dimensions:{date:'2026-10-12',requestHost:'other.example',
  refererHost:'claude.ai',requestPath:'/private/customer/abc'}},
 {count:0,dimensions:{date:'2026-10-11',requestHost:'www.mingeagle.com',
  refererHost:'',requestPath:'/'}}
];
assert.equal(aiLandingCategory('/school-sports-equipment-es.html'),'SCHOOL_EQUIPMENT_GUIDE');
assert.equal(aiLandingCategory('/silent-basketball-for-apartments.html'),'APARTMENT_GUIDE');
assert.equal(aiLandingCategory('/private/user-unique-secret'),'OTHER_PAGE');
assert.throws(()=>aiLandingCategory('https://example.com/inquiry'));
assert.deepEqual(aiLandingRows(pageGroups,baseline,attribution,w),[
 {date:'2026-10-12',platform:'CHATGPT',pageBucket:'KIDS_QUIET_GUIDE',sampledPageviews:1},
 {date:'2026-10-12',platform:'CHATGPT',pageBucket:'PRODUCTS',sampledPageviews:1},
 {date:'2026-10-12',platform:'PERPLEXITY',pageBucket:'SCHOOL_EQUIPMENT_GUIDE',sampledPageviews:1}
]);
assert.throws(()=>aiLandingRows(pageGroups.slice(1),baseline,attribution,w),/mismatch/,
 'No partial AI landing breakdown when provider page groups are missing');
assert.throws(()=>aiLandingRows(Array(1000).fill(pageGroups[0]),baseline,attribution,w),/truncated/);
for(const bad of [null,Array(1000).fill(entries[0]),
 [group('2026-10-13','www.mingeagle.com','chatgpt.com',1,1)],
 [group('2026-10-12','www.mingeagle.com',null,1,1)],
 [group('2026-10-12','www.mingeagle.com','chatgpt.com',-1,1)]])
 assert.throws(()=>aiReferralRows(bad,baseline,w),'invalid or truncated data');

const sqlite=new DatabaseSync(':memory:');
sqlite.exec(readFileSync('migrations/0006_web_analytics_daily.sql','utf8'));
sqlite.exec(readFileSync('migrations/0011_ai_referrals_daily.sql','utf8'));
sqlite.exec(readFileSync('migrations/0012_ai_referral_pages_daily.sql','utf8'));
let writes=0,fail=false;
const db={
 prepare(sql){
  assert.match(sql,/(INSERT INTO (web_analytics_daily|ai_referrals_daily|ai_referral_pages_daily)|DELETE FROM ai_referral_pages_daily)/);
  assert(!/(inquiries|leads|contacts|quotes|orders|activities)/i.test(sql));
  return {bind(...params){return {sql,params}}};
 },
 async batch(statements){
  if(fail)throw Error('simulated transactional D1 failure');
  sqlite.exec('BEGIN');
  try{
   for(const s of statements){
    sqlite.prepare(s.sql).run(...s.params);
    writes++;
   }
   sqlite.exec('COMMIT');
  }catch(e){sqlite.exec('ROLLBACK');throw e}
  return statements.map(()=>({success:true}));
 }
};
const env={MINGEAGLE_DB:db,CF_ANALYTICS_GRAPHQL_TOKEN:'only-test-token'};
const mock=(groups,errors=null,status=200,paths=pageGroups)=>async(url,req)=>{
 assert.equal(url,'https://api.cloudflare.com/client/v4/graphql');
 assert.equal(req.headers.authorization,'Bearer only-test-token');
 const body=JSON.parse(req.body);
 assert.match(body.query,/dimensions \{date requestHost refererHost\}/);
 assert.match(body.query,/datetime_lt:"2026-10-13T00:00:00.000Z"/);
 return {ok:status===200,status,json:async()=>({
  data:{viewer:{accounts:[{daily:groups,paths}]}},errors
 })};
};
const run=(groups,errors=null,status=200,paths=pageGroups)=>synchronize(env,{now,fetchImpl:mock(groups,errors,status,paths)});
await assert.rejects(synchronize({...env,CF_ANALYTICS_GRAPHQL_TOKEN:''},{now,fetchImpl:mock(entries)}),/secret/);
await assert.rejects(run(entries,[{message:'permission denied'}]),/GraphQL errors/);
await assert.rejects(run(entries,null,403),/HTTP 403/);
await assert.rejects(run([group('2026-10-13','www.mingeagle.com','chatgpt.com',1,1)]),/UTC day/);
assert.equal(writes,0,'No writes on invalid provider data');
fail=true;
await assert.rejects(run(entries),/simulated transactional/);
assert.equal(writes,0,'Failed batch has no partial CRM analytics writes');
fail=false;
const result=await run(entries);
assert.deepEqual(result,{providerDates:2,written:2,aiReferralRows:4,aiLandingRows:3,checkedCompleteDays:7});
assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM web_analytics_daily').get().n,2);
assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM ai_referrals_daily').get().n,4);
assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM ai_referral_pages_daily').get().n,3);
assert.equal(sqlite.prepare("SELECT SUM(sampled_pageviews) AS n FROM ai_referral_pages_daily WHERE platform='CHATGPT'").get().n,2);
assert.equal(sqlite.prepare("SELECT sampled_pageviews AS n FROM ai_referrals_daily WHERE date_utc='2026-10-12' AND platform='ALL_AI'").get().n,3);
await run(entries);
assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM ai_referrals_daily').get().n,4,'Idempotent upsert');
assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM ai_referral_pages_daily').get().n,3,'Path categories upsert rather than duplicate');
assert.throws(()=>sqlite.prepare("INSERT INTO ai_referrals_daily(date_utc,platform,site_tag,host,provider_visits,sampled_pageviews,source) VALUES ('2026-10-12','BING_SEARCH','c229a4f21594480eb5a1381a1b1e67f0','mingeagle.com',1,1,'CLOUDFLARE_RUM_GRAPHQL')").run());
assert(!JSON.stringify(result).includes('only-test-token'));
sqlite.close();

// API contract: an absent day must never be reported as zero; the admin route
// is private/read-only and exposes no underlying referrer host or user identity.
const dir=mkdtempSync(join(tmpdir(),'ai-referrals-'));
try{
 const outfile=join(dir,'handler.mjs');
 await build({entryPoints:['functions/api/admin/ai-referrals-daily.ts'],
  outfile,bundle:true,platform:'node',format:'esm',logLevel:'silent'});
 const {onRequestGet}=await import(pathToFileURL(outfile));
 const dataDb=new DatabaseSync(':memory:');
 dataDb.exec(readFileSync('migrations/0011_ai_referrals_daily.sql','utf8'));
 dataDb.exec(readFileSync('migrations/0012_ai_referral_pages_daily.sql','utf8'));
 let reads=0;
 const dbRead={prepare(sql){reads++;
  return {bind(...params){return {all:async()=>({results:dataDb.prepare(sql).all(...params)})}}};
 }};
 const request=new Request('https://app.mingeagle.com/api/admin/ai-referrals-daily?days=30');
 const requestApi=(r=request)=>onRequestGet({request:r,env:{MINGEAGLE_DB:dbRead}});
 let response=await requestApi(),json=await response.json();
 assert.equal(response.status,200);
 assert.equal(json.connected,false);
 assert.equal(json.summary.sampledPageviews,0);
 assert.equal(json.coverage.observedDays,0);
 assert(response.headers.get('cache-control').includes('no-store'));
 const date=dataDb.prepare("SELECT date('now','-1 day') AS d").get().d;
 const site='c229a4f21594480eb5a1381a1b1e67f0';
 const insert=dataDb.prepare("INSERT INTO ai_referrals_daily(date_utc,platform,site_tag,host,provider_visits,sampled_pageviews,source) VALUES (?,?,?,'mingeagle.com',?,?,'CLOUDFLARE_RUM_GRAPHQL')");
 insert.run(date,'ALL_AI',site,0,0);
 response=await requestApi();json=await response.json();
 assert.equal(json.connected,true);
 assert.equal(json.coverage.observedDays,1);
 assert.equal(json.summary.sampledPageviews,0,'Verified 0 AI referrals');
 assert.equal(json.landingCoverage.complete,true,'Verified zero AI sources also verifies zero landing events');
 insert.run(date,'CHATGPT',site,1,2);
 response=await requestApi();json=await response.json();
 assert.equal(response.status,503,'Inconsistent totals fail closed');
 dataDb.prepare('UPDATE ai_referrals_daily SET provider_visits=1,sampled_pageviews=2 WHERE platform=\'ALL_AI\'').run();
 response=await requestApi();json=await response.json();
 assert.equal(response.status,200);
 assert.equal(json.landingCoverage.complete,false,'Old positive AI dates without path snapshot remain unknown');
 const insertPage=dataDb.prepare("INSERT INTO ai_referral_pages_daily(date_utc,platform,page_bucket,site_tag,host,sampled_pageviews,source) VALUES (?,?,?,?,'mingeagle.com',?,'CLOUDFLARE_RUM_GRAPHQL')");
 insertPage.run(date,'CHATGPT','KIDS_QUIET_GUIDE',site,2);
 response=await requestApi();json=await response.json();
 assert.equal(json.landingCoverage.complete,true);
 assert.equal(json.pageBreakdown[0].pageBucket,'KIDS_QUIET_GUIDE');
 assert.equal(json.platforms.CHATGPT.sampledPageviews,2);
 assert.equal(json.summary.providerVisits,1);
 assert(!JSON.stringify(json).includes('chatgpt.com'),'Raw referrer hosts not exposed');
 assert(!JSON.stringify(json).includes('only-test-token'));
 response=await requestApi(new Request('https://app.mingeagle.com/api/admin/ai-referrals-daily?days=7'));
 assert.equal(response.status,400);
 assert(reads>=3);
 dataDb.close();
}finally{rmSync(dir,{recursive:true,force:true})}
console.log('PASS: browser AI referrer matching, zero-vs-missing, D1 atomicity/upsert, private daily API and privacy.');
