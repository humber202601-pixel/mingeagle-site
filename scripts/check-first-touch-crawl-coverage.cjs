'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(process.argv[2]||'public');
const tag='<script defer src="geo-source-capture.js"></script>';
const files=new Set();
for(const name of ['sitemap.xml','sitemap-localized.xml']){
 const xml=fs.readFileSync(path.join(root,name),'utf8');
 for(const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)){
  const u=new URL(m[1]);assert.equal(u.origin,'https://www.mingeagle.com');
  files.add(u.pathname==='/'?'index.html':u.pathname.slice(1));
 }
}
assert(files.size>=25,'At least 25 buyer-facing pages should be covered');
for(const file of files){
 const html=fs.readFileSync(path.join(root,file),'utf8');
 assert.equal(html.split(tag).length-1,1,'Exactly one first-touch script on '+file);
 if(html.includes('<script defer src="forms-core.js"></script>'))
  assert(html.indexOf(tag)<html.indexOf('<script defer src="forms-core.js"></script>'),'Capture must run before inquiry processing');
}
const source=fs.readFileSync(path.join(root,'geo-source-capture.js'),'utf8');
assert(!/\bfetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|document\.cookie/.test(source),'No network/cookies or persistent analytics storage in source capture');
const store=new Map(),state={
 location:{origin:'https://www.mingeagle.com',pathname:'/wholesale.html',search:''},
 document:{referrer:'https://chatgpt.com/c/fictional-thread?private=no-collect',cookie:''},
 sessionStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},
 URL,URLSearchParams,Date
};
vm.createContext(state);
vm.runInContext(source,state);
const first=JSON.parse(store.get('mingeagle_source_v1'));
assert.equal(first.landingPage,'https://www.mingeagle.com/wholesale.html');
assert.equal(first.referrer,'https://chatgpt.com');
assert(!JSON.stringify(first).includes('private=no-collect'),'No referrer query string');
state.location.pathname='/inquiry.html';
state.document.referrer='https://www.mingeagle.com/wholesale.html';
vm.runInContext(source,state);
const second=JSON.parse(store.get('mingeagle_source_v1'));
assert.equal(second.landingPage,first.landingPage,'Wholesale first touch survives inquiry navigation');
assert.equal(second.referrer,first.referrer);
store.clear();
state.location.pathname='/silent-basketball.html';
state.location.search='?utm_source=perplexity&utm_medium=referral';
state.document.referrer='https://www.perplexity.ai/search?q=buyer-secret';
vm.runInContext(source,state);
const third=JSON.parse(store.get('mingeagle_source_v1'));
assert.equal(third.utm_source,'perplexity');
assert.equal(third.referrer,'https://www.perplexity.ai');
assert.equal(third.landingPage,'https://www.mingeagle.com/silent-basketball.html');
console.log('PASS: '+files.size+' public pages covered, non-identifying AI referral survives wholesale-to-inquiry, no query leakage.');
