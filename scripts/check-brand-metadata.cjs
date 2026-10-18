// Regression: no fabricated Organization claims, and one real public brand asset per page.
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||'public');
const pages=fs.readdirSync(root).filter(p=>p.endsWith('.html'));
const favicon='/assets/mingeagle-social-wordmark.svg';
const logo='https://www.mingeagle.com/assets/mingeagle-social-wordmark.png';
assert(fs.statSync(path.join(root,favicon.slice(1))).size>100);
assert(fs.statSync(path.join(root,'assets/mingeagle-social-wordmark.png')).size>1000);
let count=0;
for(const name of pages){
 const html=fs.readFileSync(path.join(root,name),'utf8');
 const head=html.split(/<\/head>/i)[0];
 const icons=[...head.matchAll(/<link\b(?=[^>]*\brel=["'](?:shortcut )?icon["'])[^>]*>/gi)];
 assert.equal(icons.length,1,name+' must have exactly one favicon link');
 assert(icons[0][0].includes('href="'+favicon+'"'),name+' must use the existing official square wordmark SVG');
 assert(icons[0][0].includes('type="image/svg+xml"'),name+' favicon must have a type');
 for(const [,raw] of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
  const data=JSON.parse(raw);
  const walk=(node)=>{
   if(!node||typeof node!=='object')return;
   if(Array.isArray(node)){node.forEach(walk);return;}
   const types=Array.isArray(node['@type'])?node['@type']:[node['@type']];
   if(types.includes('Organization')&&/\bMING EAGLE\b/i.test(String(node.name||''))){
    count++;
    const url=typeof node.logo==='string'?node.logo:node.logo?.url;
    assert.equal(url,logo,name+' Organization logo must use published brand artwork');
    assert(!node.address,'Site must not present a registered-agent office as customer-facing premises');
   }
   Object.values(node).forEach(walk);
  };
  walk(data);
 }
}
assert(count>=10,'Expected brand identities on the existing B2B and learning pages');
console.log('PASS: '+pages.length+' public page favicons and '+count+' verified Organization logo references.');
