'use strict';
// Idempotently preserve Bing Webmaster ownership proof through all site-build steps.
// Only the public homepage receives the tag. No DNS, redirects, checkout or API keys.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const args=process.argv.slice(2);
const root=path.resolve(args.find(s=>!s.startsWith('--'))||'public');
const checkOnly=args.includes('--check');
const filename=path.join(root,'index.html');
const tag='<meta name="msvalidate.01" content="B90BA0E0B26B927BA506ED085EE0C32F" />';
const html=fs.readFileSync(filename,'utf8');
const end=html.search(/<\/head>/i);
if(end<0)throw new Error('Missing homepage head');
const beforeHead=html.slice(0,end);
const tags=[...beforeHead.matchAll(/<meta\b[^>]*name=["']msvalidate\.01["'][^>]*>/gi)];
if(tags.length>1)throw new Error('Duplicate Bing verification tags');
if(tags.length===1 && tags[0][0]!==tag)throw new Error('Conflicting Bing verification token');
if(tags.length===0){
 if(checkOnly)throw new Error('Missing Bing verification token on homepage');
 const out=html.slice(0,end)+tag+'\n'+html.slice(end);
 fs.writeFileSync(filename,out);
}else{
 assert(beforeHead.includes(tag),'Bing verification token must be exact');
}
const final=fs.readFileSync(filename,'utf8');
assert.equal((final.match(/name=["']msvalidate\.01["']/gi)||[]).length,1,'Exactly one Bing site proof');
const finalHead=final.split(/<\/head>/i)[0];
assert(finalHead.includes(tag),'Correct Bing token in homepage head');
assert(finalHead.includes('https://www.mingeagle.com/'),'Canonical www homepage must be present');
console.log('PASS: Bing Webmaster Tools homepage tag exact and idempotent; '+(checkOnly?'verified':'preserved')+'.');
