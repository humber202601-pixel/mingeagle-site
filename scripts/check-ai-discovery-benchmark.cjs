// Strict release check: a question bank is a research fixture, not an AI ranking claim.
const fs=require('node:fs'),assert=require('node:assert/strict');
const data=JSON.parse(fs.readFileSync('data/ai-discovery-benchmark.json','utf8'));
const sitemap=fs.readFileSync('public/sitemap.xml','utf8')+'\n'+fs.readFileSync('public/sitemap-localized.xml','utf8'),robots=fs.readFileSync('public/robots.txt','utf8');
const validIntent=new Set(['HOME_NOISE','INDOOR_ACTIVITY','SCHOOLS','ACADEMIES','B2B']);
assert.equal(data.property,'https://www.mingeagle.com/');
assert(data.prompts.length>=20&&data.prompts.length<=80);
const ids=new Set(),prompts=new Set(),groups=new Set();
for(const p of data.prompts){
 assert.match(p.id,/^ME-AI-\d{3}$/);assert(!ids.has(p.id));ids.add(p.id);
 assert(validIntent.has(p.intent));groups.add(p.intent);
 assert.match(p.market,/^[A-Z]{2}$/);assert.match(p.language,/^[a-z]{2}$/);
 assert(p.prompt.length>=30&&p.prompt.length<=230);
 assert(!/ming\s*eagle|https?:\/\/|www\./i.test(p.prompt),'Prompts cannot bias observations with the brand');
 const key=p.language+'|'+p.prompt.toLowerCase().trim();assert(!prompts.has(key));prompts.add(key);
 const u=new URL(p.targetUrl);
 assert.equal(u.hostname,'www.mingeagle.com');assert.equal(u.protocol,'https:');
 assert(!u.search&&!u.hash&&!u.username&&!u.password);
 const filename=u.pathname.slice(1)||'index.html';
 assert.match(filename,/^[a-z0-9-]+\.html$/);
 assert(fs.existsSync('public/'+filename),'Missing target '+filename);
 assert(sitemap.includes('<loc>'+p.targetUrl+'</loc>'),'Target excluded from sitemap '+p.targetUrl);
 const target=fs.readFileSync('public/'+filename,'utf8');
 assert(new RegExp(`<html\\s+lang=["']${p.language}["']`,'i').test(target),'AI benchmark target language mismatch: '+p.id+' / '+filename);
}
assert.equal(groups.size,5);
for(const bot of ['Googlebot','Bingbot','OAI-SearchBot','PerplexityBot','Claude-SearchBot']){
 assert(robots.includes('User-agent: '+bot),'Explicit crawler rule missing for '+bot);
}
const guide=fs.readFileSync('docs/AI_DISCOVERY_MEASUREMENT.md','utf8');
for(const word of ['NOT MEASURED','CITED','MENTIONED_NO_LINK','NOT_MENTIONED','UNAVAILABLE','2026-10-13'])assert(guide.includes(word));
console.log('PASS: 24 neutral queries, five buyer intents, valid sitemap URLs, crawler access and no fabricated model observations.');
