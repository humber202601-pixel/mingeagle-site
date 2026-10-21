// End-to-end static-guide -> inquiry attribution fixture, no network or user PII.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('public/geo-source-capture.js','utf8');
const forms=fs.readFileSync('public/forms-core.js','utf8');
const guides=['quiet-indoor-sports-for-kids.html','indoor-school-sports-equipment-guide.html'];
for(const f of guides){
 const html=fs.readFileSync('public/'+f,'utf8');
 const marker='<script defer src="geo-source-capture.js"></script>';
 assert(html.includes(marker),'Guide must capture the first external referrer: '+f);
 assert(html.indexOf(marker)<html.indexOf('<script defer src="forms-core.js"></script>'),'Capture before forms setup');
}
assert(!/\bfetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|document\.cookie/.test(source),'Guide capture must not send network data or set tracking cookies');
const store=new Map();
const state={
 location:{origin:'https://www.mingeagle.com',pathname:'/quiet-indoor-sports-for-kids.html',search:'?utm_source=chatgpt&utm_medium=referral&utm_campaign=quiet-home'},
 document:{referrer:'https://chatgpt.com/search?private=hidden',cookie:''},
 sessionStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},
 URL,URLSearchParams,Date,module:{exports:{}}
};
vm.createContext(state);
const capture=()=>vm.runInContext(source,state);
capture();
let x=JSON.parse(store.get('mingeagle_source_v1'));
assert.equal(x.landingPage,'https://www.mingeagle.com/quiet-indoor-sports-for-kids.html');
assert.equal(x.referrer,'https://chatgpt.com');
assert(!JSON.stringify(x).includes('private=hidden'),'External referrer query cannot contain personal data');
assert.equal(x.utm_source,'chatgpt');
state.location.pathname='/inquiry.html';state.location.search='?type=sample';
state.document.referrer='https://www.mingeagle.com/quiet-indoor-sports-for-kids.html';
vm.runInContext(forms,state);
let ctx=state.module.exports.context('Inquiry');
assert.equal(ctx.landingPage,'https://www.mingeagle.com/quiet-indoor-sports-for-kids.html');
assert.equal(ctx.referrer,'https://chatgpt.com');
const lead=state.module.exports.crmPayload({reference:'ME-20261013-AABBCCDD',requestType:'Sample request',firstname:'Private',email:'sample@example.test'},ctx);
assert.equal(lead.utmSource,'chatgpt');
assert.equal(lead.landingPage,'https://www.mingeagle.com/quiet-indoor-sports-for-kids.html');
assert.equal(lead.referrer,'https://chatgpt.com');
state.location.pathname='/indoor-school-sports-equipment-guide.html';
state.location.search='';state.document.referrer='https://www.mingeagle.com/inquiry.html';
capture();
x=JSON.parse(store.get('mingeagle_source_v1'));
assert.equal(x.landingPage,'https://www.mingeagle.com/quiet-indoor-sports-for-kids.html','Original first landing preserved');
assert.equal(x.referrer,'https://chatgpt.com','Later internal site browsing must not overwrite external discovery');
store.clear();
state.location.search='';
state.document.referrer='https://www.perplexity.ai/search?q=personal-question';
capture();
x=JSON.parse(store.get('mingeagle_source_v1'));
assert.equal(x.landingPage,'https://www.mingeagle.com/indoor-school-sports-equipment-guide.html');
assert.equal(x.referrer,'https://www.perplexity.ai');
store.clear();
state.document.referrer='https://claude.ai/new?token=private';
state.location.search='?utm_source=claude%00hidden&utm_content=school';
capture();
x=JSON.parse(store.get('mingeagle_source_v1'));
assert.equal(x.referrer,'https://claude.ai');
assert.equal(x.utm_source,'claudehidden','Sanitize source control characters');
state.sessionStorage.getItem=()=>{throw Error('blocked by user privacy controls')};
assert.doesNotThrow(capture,'Guide must remain usable with session storage disabled');
console.log('PASS: two real GEO guides capture one first landing and sanitized external referrer, survive quote navigation, preserve later visits, do not leak queries or send network data.');
