'use strict';
const assert=require('node:assert/strict');
const {checkProduction}=require('./check-production-endpoints.cjs');
const sha='ceb05bf42cf827e799153d2cf8230497f8a1ec99';
const base='https://www.mingeagle.com/';
const crm='https://app.mingeagle.com/';
const price={currency:'USD',products:{a:{price:1},b:{price:2},c:{price:3},d:{price:4}}};
const mapping={
 [base+'deployment-version.json']:{revision:sha,workflow:'github-pages'},
 [crm+'api/health']:{ok:true,service:'MING EAGLE V2 API',databaseBinding:true},
 [crm+'api/quote-reference']:{ok:true,testEnvironment:false,catalog:price},
 [base+'retail-reference-prices.json']:price,
};
const makeFetch=(override={},counter={})=>async(url,options)=>{
 assert.equal(options.method,'GET','Monitoring must only make read-only GET requests');
 assert.equal(options.headers['accept'],'application/json');
 assert(!('authorization' in options.headers),'Monitoring must not use credentials');
 counter[url]=(counter[url]||0)+1;
 const data=Object.prototype.hasOwnProperty.call(override,url)?override[url]:mapping[url];
 if (!data) throw Error('Unexpected URL: '+url);
 return {ok:true,status:200,json:async()=>data};
};
(async()=>{
 const result=await checkProduction({expectedRevision:sha,fetcher:makeFetch(),attempts:1});
 assert.equal(result.priceProducts,4);
 await assert.rejects(checkProduction({expectedRevision:sha,fetcher:makeFetch({[base+'deployment-version.json']:{revision:'old',workflow:'github-pages'}}),attempts:1}),/version does not match/);
 await assert.rejects(checkProduction({expectedRevision:sha,fetcher:makeFetch({[crm+'api/health']:{ok:true,service:'MING EAGLE V2 API',databaseBinding:false}}),attempts:1}),/binding is absent/);
 await assert.rejects(checkProduction({expectedRevision:sha,fetcher:makeFetch({[crm+'api/quote-reference']:{ok:true,testEnvironment:true,catalog:price}}),attempts:1}),/preview settings/);
 await assert.rejects(checkProduction({expectedRevision:sha,fetcher:makeFetch({[base+'retail-reference-prices.json']:{currency:'USD',products:{...price.products,d:{price:99}}}}),attempts:1}),/retail reference prices differ/);
 let reads=0;
 const transient=makeFetch();
 const fetcher=async(u,o)=>{
   if(u===base+'deployment-version.json' && ++reads===1)return {ok:true,status:200,json:async()=>({revision:'old',workflow:'github-pages'})};
   return transient(u,o);
 };
 let sleeps=0;
 await checkProduction({expectedRevision:sha,fetcher,attempts:2,delay:async()=>{sleeps++}});
 assert.equal(sleeps,1,'Transient rollout should retry once');
 await assert.rejects(checkProduction({expectedRevision:'wrong',fetcher:makeFetch(),attempts:1}),/Expected full main commit SHA/);
 console.log('PASS: production monitor offline tests (success, revision drift, missing D1 binding, preview mode, price drift, retry, SHA validation).');
})().catch(error=>{console.error(error);process.exitCode=1});
