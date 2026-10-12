'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'../public');
const filename=path.join(root,'index.html');
const before=fs.readFileSync(filename,'utf8');
const cp=require('node:child_process');
function run(...args){return cp.execFileSync(process.execPath,[path.join(__dirname,'enable-web-analytics.cjs'),...args],
 {cwd:path.join(__dirname,'..'),encoding:'utf8'})}
run();
const first=fs.readFileSync(filename,'utf8');
assert.equal((first.match(/data-cf-beacon/g)||[]).length,1);
assert(first.includes('0847cc9737e246bbb4a7224e27be273d'));
assert(first.includes('static.cloudflareinsights.com/beacon.min.js'));
run();
const second=fs.readFileSync(filename,'utf8');
assert.equal(second,first,'Tag installation must be idempotent');
run('--check');
for(const file of fs.readdirSync(root).filter(x=>x.endsWith('.html'))){
 const html=fs.readFileSync(path.join(root,file),'utf8');
 assert.equal((html.match(/data-cf-beacon/g)||[]).length,1,'Exactly one beacon on '+file);
 assert(html.includes('0847cc9737e246bbb4a7224e27be273d'),'Correct public site token on '+file);
}
const p=fs.readFileSync(path.join(root,'policies.html'),'utf8');
assert(p.includes('Cloudflare Web Analytics'));
assert(p.includes('aggregated website traffic and performance'));
assert(p.includes('not send website inquiry form contents'));
assert(p.includes('does not change your communication choices'));
assert.equal((first.match(/hs-script-loader/g)||[]).length,(before.match(/hs-script-loader/g)||[]).length,
 'Analytics injection must not alter HubSpot form tracker');
console.log('PASS: manual Cloudflare analytics beacon on all HTML pages, idempotent, and transparent privacy policy.');
