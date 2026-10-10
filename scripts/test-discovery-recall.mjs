import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const tmp=mkdtempSync(join(tmpdir(),'me-recall-')),fetchBefore=globalThis.fetch;
try{
  await build({entryPoints:['functions/api/admin/discovery-web-v6.ts'],
    outfile:join(tmp,'web.mjs'),format:'esm',bundle:true,platform:'node',logLevel:'silent'});
  const web=await import(pathToFileURL(join(tmp,'web.mjs')));
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(readFileSync('migrations/0001_core.sql','utf8'));
  let writes=0;
  const db={prepare(sql){
    if(/^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)/i.test(sql))writes++;
    const fn=(values=[])=>({bind(...v){return fn(v);},
      async first(){return sqlite.prepare(sql).get(...values)||null},
      async all(){return {results:sqlite.prepare(sql).all(...values)}},
      async run(){const r=sqlite.prepare(sql).run(...values);return {meta:{changes:Number(r.changes)}}}});
    return fn();
  }};
  const current={title:'Northstar Basketball Training Academy',snippet:'Indoor basketball skills, youth camps and coach-led lessons.',url:'https://northstar.example/',query:'basketball academy Dallas Texas',city:'Dallas'};
  const elsewhere={...current,title:'Austin Basketball Training Academy',url:'https://austin.example/'};
  const irrelevant={...current,title:'Dictionary Definition of Basketball',snippet:'English meaning of basketball',url:'https://lexicon.example/'};
  assert(web.eligibleSearchHit(current,'BASKETBALL_TRAINING','TX'),
    'B2B buyer candidate must survive when search snippet fails to mention city');
  assert.equal(web.searchSnippetLocality(current,'BASKETBALL_TRAINING','TX'),false,
    'cannot treat searched city name in query parameters as geographic evidence');
  assert.equal(web.eligibleSearchHit(irrelevant,'BASKETBALL_TRAINING','TX'),false,
    'dictionary results still never enter the official-site review step');
  const site=(name,city)=>`<!doctype html><html><head><title>${name} Basketball Academy</title>
    <meta property="og:site_name" content="${name} Basketball Academy">
    <script type="application/ld+json">{"@type":"Organization","name":"${name} Basketball Academy"}</script>
    </head><body><h1>${name} Basketball Academy</h1>
    <p>Basketball academy training skills coaching sessions and private lessons in ${city}, Texas.
    Register for sessions. Contact us about training and basketball youth camps.</p>
    <a href="mailto:hello@${name.toLowerCase()}.example">Email us</a></body></html>`;
  const rss=`<rss><channel><item><title>${current.title}</title><link>${current.url}</link><description>${current.snippet}</description></item>
    <item><title>${elsewhere.title}</title><link>${elsewhere.url}</link><description>${elsewhere.snippet}</description></item>
    <item><title>${irrelevant.title}</title><link>${irrelevant.url}</link><description>${irrelevant.snippet}</description></item></channel></rss>`;
  const calls=[];
  globalThis.fetch=async value=>{
    const u=new URL(String(value));calls.push(u.hostname);
    if(u.hostname==='www.bing.com')return new Response(rss,{headers:{'content-type':'application/rss+xml'}});
    if(u.hostname==='northstar.example')return new Response(site('Northstar','Dallas'),{headers:{'content-type':'text/html'}});
    if(u.hostname==='austin.example')return new Response(site('Austin','Austin'),{headers:{'content-type':'text/html'}});
    throw new Error('Unexpected external request: '+u.href);
  };
  const matched={reason:''};
  assert(await web.verifyHit(current,'BASKETBALL_TRAINING','TX',matched),'official-site Dallas evidence should save the previously missing-snippet buyer');
  const mismatched={reason:''};
  assert.equal(await web.verifyHit(elsewhere,'BASKETBALL_TRAINING','TX',mismatched),null);
  assert.equal(mismatched.reason,'location-unconfirmed',
    'website showing a different town must not gain a CRM record');
  const input={stateCode:'TX',customerType:'BASKETBALL_TRAINING',city:'Dallas',targetCount:20,round:0};
  const res=await web.onRequestPost({request:new Request('https://app.mingeagle.com/api/admin/discovery-web-v6',
    {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)}),env:{MINGEAGLE_DB:db}});
  const body=await res.json();
  assert.equal(res.status,200,JSON.stringify(body));
  assert.equal(body.found,1,'only the business with verified website locality is a candidate');
  assert.equal(body.checked,2,'two buyer-related sites retained for official-site checks');
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM discovery_candidates").get().n,1);
  assert.equal(sqlite.prepare("SELECT city FROM discovery_candidates").get().city,'Dallas');
  assert.equal(sqlite.prepare("SELECT source_provider FROM discovery_candidates").get().source_provider,'WEB_SEARCH_VERIFIED_V6');
  assert(!calls.includes('lexicon.example'),'never crawl dictionary and other non-business results');
  assert(!calls.includes('html.duckduckgo.com'),'no secondary provider request when primary results are available');
  assert(calls.filter(x=>x==='www.bing.com').length<=8,'respect bounded 8-query source round');
  const noLocation={...current,url:'https://austin.example'};
  assert.equal((await web.verifyHit(noLocation,'BASKETBALL_TRAINING','TX',{reason:''})),null,
    'absence of target region can never become a verified buyer');
  console.log('PASS: missing-city search snippets recover valid Dallas basketball buyer, reject Austin buyer and irrelevant sites, preserve truthful reason, cap source requests, and save exactly one real-verified CRM candidate.');
}finally{globalThis.fetch=fetchBefore;rmSync(tmp,{recursive:true,force:true})}
