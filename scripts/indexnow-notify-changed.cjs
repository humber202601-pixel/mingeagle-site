'use strict';
// Post-deployment discovery ping for newly added/modified public buyer pages only.
// HTTP 200 means the IndexNow network received the URL, NOT indexed or AI-recommended.
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const ORIGIN='https://www.mingeagle.com';
const HOST='www.mingeagle.com';
const KEY='0af31dfcb7167117e06b90fde1108066'; // Intentionally public IndexNow ownership token, never a login secret.
const SITEMAPS=['public/sitemap.xml','public/sitemap-localized.xml'];
const GENERATORS_ALL=new Set([
 'scripts/build-learning.py','scripts/build-conversion.py',
 'scripts/build-seo-v37.cjs','scripts/build-seo-discovery-links.cjs',
 'scripts/normalize-canonical-host.py'
]);
const PRODUCT_SOURCES=new Set([
 'public/product-master.json','public/ai-product-facts.json',
 'scripts/build-ai-product-facts.cjs','scripts/build-product-listing-discovery.cjs'
]);
const PRODUCT_ROUTES=[
 '/products.html','/silent-basketball.html','/fabric-silent-basketball.html',
 '/weighted-flocked-basketball.html','/silent-soccer.html','/wholesale-product-catalog.html'
];

function entries(xml){
 const out=new Map();
 for(const [,block] of xml.matchAll(/<url(?:\\s[^>]*)?>([\\s\\S]*?)<\\/url>/g)){
  const loc=block.match(/<loc>\\s*([^<]+)\\s*<\\/loc>/);
  if(!loc)throw Error('Missing sitemap <loc>');
  const link=loc[1].trim();
  let parsed;
  try{parsed=new URL(link)}catch{throw Error('Malformed sitemap URL')}
  if(parsed.origin!==ORIGIN||parsed.href!==link||parsed.username||parsed.password||
     parsed.search||parsed.hash||!(parsed.pathname==='/'||/^\\/[A-Za-z0-9-]+\\.html$/.test(parsed.pathname)))
   throw Error('Unsafe or off-host sitemap URL: '+link.slice(0,150));
  if(out.has(link))throw Error('Duplicate sitemap URL: '+link);
  const date=block.match(/<lastmod>\\s*([^<]+)\\s*<\\/lastmod>/)?.[1]?.trim()||'';
  if(date&&!/^20\\d\\d-\\d\\d-\\d\\d$/.test(date))throw Error('Invalid sitemap lastmod');
  out.set(link,date);
 }
 if(!out.size)throw Error('Sitemap contains no <url> entries');
 return out;
}
function manifestFromStrings(sitemaps){
 const combined=new Map();
 for(const xml of sitemaps){
  for(const [url,date] of entries(xml)){
   if(combined.has(url))throw Error('URL duplicated across sitemaps: '+url);
   combined.set(url,date);
  }
 }
 if(combined.size>100)throw Error('Unexpectedly large MING EAGLE sitemap; require manual review');
 return combined;
}
function pickChangedUrls(changedPaths,current,previous){
 const picked=new Set();
 const changed=new Set(changedPaths);
 const add=url=>{if(current.has(url))picked.add(url)};
 for(const file of changed){
  const match=/^public\\/([A-Za-z0-9-]+)\\.html$/.exec(file);
  if(match)add(ORIGIN+(match[1]==='index'?'/':'/'+match[1]+'.html'));
  if(PRODUCT_SOURCES.has(file))PRODUCT_ROUTES.forEach(p=>add(ORIGIN+p));
  if(GENERATORS_ALL.has(file))for(const url of current.keys())picked.add(url);
 }
 if(SITEMAPS.some(p=>changed.has(p))){
  for(const [url,date] of current)if(!previous.has(url)||previous.get(url)!==date)picked.add(url);
 }
 return [...picked].sort();
}
function buildPayload(urls){
 if(!Array.isArray(urls)||urls.length===0||urls.length>100)throw Error('Invalid IndexNow batch size');
 for(const url of urls){
  const u=new URL(url);
  if(u.origin!==ORIGIN||u.href!==url||u.search||u.hash)throw Error('Invalid IndexNow host URL');
 }
 return {host:HOST,key:KEY,keyLocation:ORIGIN+'/'+KEY+'.txt',urlList:urls};
}
function sourceFiles(before){
 if(!/^[0-9a-f]{40}$/i.test(before)||/^0+$/.test(before))throw Error('Missing valid preceding commit');
 return execFileSync('git',['diff','--name-only','--diff-filter=ACMRT',before,'HEAD','--'],{encoding:'utf8',timeout:15000})
  .trim().split('\\n').filter(Boolean);
}
function priorSitemap(before,name){
 try{return execFileSync('git',['show',before+':'+name],{encoding:'utf8',timeout:15000,stdio:['ignore','pipe','ignore']})}
 catch{return ''}
}
function record(result){
 fs.writeFileSync('indexnow-deployment-evidence.json',JSON.stringify({...result,checkedAt:new Date().toISOString()},null,2)+'\\n');
 const title='### IndexNow: changed-page-only publication notice\\n';
 const lines=[title,'- Status: **'+result.status+'**','- Changed canonical URLs: **'+(result.urls?.length??0)+'**'];
 if(result.httpStatus)lines.push('- IndexNow response: **HTTP '+result.httpStatus+'** (receipt only; not proof of indexing or AI recommendation)');
 if(result.reason)lines.push('- Reason: '+String(result.reason).replace(/[\\r\\n]/g,' '));
 if(result.urls?.length)lines.push('- URLs: '+result.urls.join(', '));
 const file=process.env.GITHUB_STEP_SUMMARY;
 if(file)fs.appendFileSync(file,lines.join('\\n')+'\\n');
 console.log(lines.join('\\n'));
}
async function main(){
 if(process.env.GITHUB_EVENT_NAME!=='push'){record({status:'SKIPPED',reason:'Only public main-branch push deployments may notify IndexNow',urls:[]});return}
 const before=process.env.INDEXNOW_BEFORE||'';
 if(!/^[0-9a-f]{40}$/i.test(before)||/^0+$/.test(before)){
  record({status:'SKIPPED',reason:'Missing commit baseline; never submit guessed/unmodified URLs',urls:[]});return;
 }
 const changedPaths=sourceFiles(before);
 const present=manifestFromStrings(SITEMAPS.map(p=>fs.readFileSync(p,'utf8')));
 const beforeXml=SITEMAPS.map(p=>priorSitemap(before,p)).filter(Boolean);
 const previous=beforeXml.length?manifestFromStrings(beforeXml):new Map();
 const urls=pickChangedUrls(changedPaths,present,previous);
 if(!urls.length){record({status:'SKIPPED',reason:'No sitemap-listed public page content changed',urls:[]});return}
 if(urls.some(u=>!fs.existsSync(path.join('public',new URL(u).pathname==='/'?'index.html':new URL(u).pathname.slice(1))))){
  record({status:'ERROR',reason:'Selected content file not packaged with the website',urls});process.exitCode=1;return;
 }
 if(fs.readFileSync(path.join('public',KEY+'.txt'),'utf8')!==KEY){
  record({status:'ERROR',reason:'Local IndexNow ownership proof does not match',urls});process.exitCode=1;return;
 }
 const proof=ORIGIN+'/'+KEY+'.txt';
 try{
  const check=await fetch(proof,{signal:AbortSignal.timeout(12000),redirect:'error',headers:{'Cache-Control':'no-cache','User-Agent':'MING-EAGLE-IndexNow-publish/1.0'}});
  if(check.status!==200||check.url!==proof||(await check.text())!==KEY)throw Error('Live IndexNow ownership proof missing/mismatched');
  const response=await fetch('https://api.indexnow.org/indexnow',{
   method:'POST',signal:AbortSignal.timeout(15000),
   headers:{'Content-Type':'application/json; charset=utf-8','User-Agent':'MING-EAGLE-IndexNow-publish/1.0'},
   body:JSON.stringify(buildPayload(urls))
  });
  record({status:response.status===200?'RECEIVED':response.status===202?'KEY_VALIDATION_PENDING':'ERROR',
   httpStatus:response.status,urls,...(response.status===200||response.status===202?{}:{reason:'IndexNow declined or throttled; inspect HTTP code and retry only after fixing cause'})});
  if(response.status!==200&&response.status!==202)process.exitCode=1;
 }catch(error){
  record({status:'ERROR',reason:error instanceof Error?error.message:'Network request failed',urls});
  process.exitCode=1;
 }
}
if(require.main===module)main().catch(error=>{record({status:'ERROR',reason:error instanceof Error?error.message:'Unexpected error',urls:[]});process.exitCode=1});
module.exports={entries,manifestFromStrings,pickChangedUrls,buildPayload,sourceFiles};
