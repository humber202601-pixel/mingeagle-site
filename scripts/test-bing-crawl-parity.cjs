'use strict';
const assert=require('node:assert/strict');
const {checkLive,BASE,PAGES}=require('./check-bing-crawl-parity.cjs');
function response(status,text,headers={}){
 const map=new Map(Object.entries(headers).map(([k,v])=>[k.toLowerCase(),v]));
 return {status,headers:{get:k=>map.get(k.toLowerCase())||null},text:async()=>text};
}
const html=url=>'<!doctype html><html lang="en"><head><title>Supplier details</title><link rel="canonical" href="'+url+'"><meta name="robots" content="index,follow"></head><body><h1>Public buyer guide</h1></body></html>';
const robots='User-agent: Bingbot\nAllow: /\n\nSitemap: '+BASE+'sitemap.xml\n';
function mockFetch({blockedUrl=null,blockedAgent=null,redirectUrl=null,noindexUrl=null}={}){
 return async (url,options)=>{
  if(url.endsWith('robots.txt'))return response(200,robots,{'content-type':'text/plain'});
  const bing=/bingbot/i.test(options.headers['user-agent']);
  if(url===blockedUrl&&(blockedAgent===null||blockedAgent==='bingbot'&&bing))return response(403,'blocked',{'content-type':'text/html'});
  if(url===redirectUrl)return response(301,'',{'content-type':'text/html','location':BASE+'index.html'});
  if(url===noindexUrl)return response(200,html(url).replace('index,follow','noindex,follow'),{'content-type':'text/html'});
  return response(200,html(url),{'content-type':'text/html; charset=utf-8'});
 };
}
(async()=>{
 const clean=await checkLive({fetcher:mockFetch()});
 assert.equal(clean.status,'PASS');assert.equal(clean.probes,PAGES.length*2);assert.equal(clean.errors.length,0);
 const blocked=await checkLive({fetcher:mockFetch({blockedUrl:BASE+'wholesale.html',blockedAgent:'bingbot'})});
 assert.equal(blocked.status,'FAIL');assert(blocked.errors.some(e=>e.includes('synthetic_bingbot')&&e.includes('403')));
 assert(!blocked.errors.some(e=>e.includes('ordinary')&&e.includes('403')));
 const redirected=await checkLive({fetcher:mockFetch({redirectUrl:BASE})});
 assert.equal(redirected.status,'FAIL');assert(redirected.errors.some(e=>e.includes('301')));
 const noindex=await checkLive({fetcher:mockFetch({noindexUrl:BASE+'for-schools.html'})});
 assert.equal(noindex.status,'FAIL');assert(noindex.errors.some(e=>e.includes('has noindex')));
 console.log('PASS: simulated ordinary/Bingbot parity identifies HTTP blocks, redirect and noindex; no writes or Bing submissions.');
})().catch(e=>{console.error(e);process.exitCode=1;});
