'use strict';
// Public GET-only diagnostic: a synthetic Bingbot User-Agent is NOT evidence of
// an authentic Bing crawler request, ranking, successful indexing, or citations.
const BASE='https://www.mingeagle.com/';
const PAGES=['','wholesale.html','for-schools.html'];
const AGENTS=[
 {name:'ordinary',value:'MING-EAGLE-site-reliability/1.0'},
 {name:'synthetic_bingbot',value:'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)'},
];
function extract(html,url,headers){
 const head=(html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)||[])[1]||'';
 const links=[...head.matchAll(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi)];
 const canonicals=links.map(m=>(m[0].match(/href=["']([^"']+)["']/i)||[])[1]||'');
 const directives=[...head.matchAll(/<meta\b[^>]*name=["'](?:robots|bingbot)["'][^>]*>/gi)]
  .map(m=>(m[0].match(/content=["']([^"']*)["']/i)||[])[1]||'');
 const xRobots=headers.get('x-robots-tag')||'';
 const isNoindex=[...directives,xRobots].some(x=>/(^|[,\s])(noindex|none)(?=$|[,\s])/i.test(x));
 return {canonical:canonicals.length===1?canonicals[0]:null,canonicalCount:canonicals.length,isNoindex,xRobots};
}
async function checkLive({fetcher=globalThis.fetch}={}){
 const results=[],errors=[];
 for(const path of PAGES){
  const url=BASE+path;
  for(const agent of AGENTS){
   const entry={url,agent:agent.name,status:null,location:null,canonical:null,xRobots:null,contentType:null};
   try {
    const response=await fetcher(url,{
     method:'GET',redirect:'manual',
     headers:{'user-agent':agent.value,'accept':'text/html','cache-control':'no-cache'},
     signal:AbortSignal.timeout(16000)
    });
    entry.status=response.status;
    entry.location=response.headers.get('location');
    entry.contentType=response.headers.get('content-type');
    if(response.status!==200)errors.push(agent.name+' '+url+' returned '+response.status+(entry.location?' -> '+entry.location:''));
    if(!/^text\/html\b/i.test(entry.contentType||''))errors.push(agent.name+' '+url+' has non-HTML content type '+entry.contentType);
    if(response.status===200&&/^text\/html\b/i.test(entry.contentType||'')){
     const data=extract(await response.text(),url,response.headers);
     entry.canonical=data.canonical;entry.xRobots=data.xRobots;
     if(data.canonicalCount!==1||data.canonical!==url)errors.push(agent.name+' '+url+' canonical mismatch: '+data.canonical);
     if(data.isNoindex)errors.push(agent.name+' '+url+' has noindex');
    }
   }catch(e){errors.push(agent.name+' '+url+' fetch error: '+String(e).slice(0,180));}
   results.push(entry);
  }
 }
 try{
  const response=await fetcher(BASE+'robots.txt',{
   method:'GET',redirect:'manual',headers:{'user-agent':AGENTS[0].value,'accept':'text/plain'},signal:AbortSignal.timeout(16000)
  });
  if(response.status!==200)errors.push('robots.txt HTTP '+response.status);
  else{
   const body=await response.text();
   if(!/User-agent:\s*Bingbot\s*\r?\nAllow:\s*\//i.test(body))errors.push('Bingbot not explicitly allowed by robots.txt');
   if(!body.includes('Sitemap: '+BASE+'sitemap.xml'))errors.push('Main sitemap missing from robots.txt');
  }
 }catch(e){errors.push('robots.txt fetch error: '+String(e).slice(0,180));}
 return {checkedAtUtc:new Date().toISOString(),status:errors.length?'FAIL':'PASS',pages:PAGES.length,probes:results.length,results,errors};
}
if(require.main===module){
 checkLive().then(result=>{
  console.log('MING EAGLE Bing crawl parity evidence (synthetic User-Agent; not real Bingbot traffic):');
  console.log(JSON.stringify(result,null,2));
  if(result.errors.length)process.exitCode=1;
 }).catch(e=>{console.error(String(e));process.exitCode=1;});
}
module.exports={checkLive,extract,BASE,PAGES,AGENTS};
