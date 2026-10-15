import assert from 'node:assert/strict';
import {build} from 'esbuild';
const output=await build({entryPoints:['functions/_middleware.ts'],bundle:true,write:false,platform:'node',format:'esm',logLevel:'silent'});
const {onRequest}=await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));
const token='a'.repeat(64);
const confidentialPaths=[
 '/quote/'+token,
 '/api/quote/'+token,
 '/api/payments/stripe/create',
 '/api/payments/stripe/status',
 '/api/payments/airwallex/create',
 '/api/payments/airwallex/status'
];
let invoked=0;
for(const pathname of confidentialPaths){
 const method=pathname.endsWith('/create')?'POST':'GET';
 const request=new Request('https://app.mingeagle.com'+pathname,{method});
 const response=await onRequest({
  request,env:{},
  next:async()=>{
   invoked++;
   return new Response('SYNTHETIC',{status:200,headers:{'cache-control':'public,max-age=3600','referrer-policy':'unsafe-url'}});
  }
 });
 assert.equal(response.status,200,pathname);
 assert.equal(response.headers.get('cache-control'),'private, no-store, max-age=0',pathname);
 assert.equal(response.headers.get('referrer-policy'),'no-referrer',pathname);
 assert.equal(response.headers.get('pragma'),'no-cache',pathname);
 assert.equal(response.headers.get('x-robots-tag'),'noindex, nofollow, noarchive',pathname);
 assert.equal(response.headers.get('cross-origin-resource-policy'),'same-origin',pathname);
 assert.equal(await response.text(),'SYNTHETIC','Middleware must preserve response bodies');
}
assert.equal(invoked,confidentialPaths.length);
for(const pathname of ['/','/procurement.html','/for-schools.html','/wholesale.html','/products.html','/api/health']){
 const response=await onRequest({
  request:new Request('https://app.mingeagle.com'+pathname),env:{},
  next:async()=>new Response('PUBLIC',{headers:{'cache-control':'public,max-age=3600'}})
 });
 assert.equal(response.headers.get('cache-control'),'public,max-age=3600',pathname);
 assert.equal(response.headers.get('referrer-policy'),'strict-origin-when-cross-origin',pathname);
 assert.equal(response.headers.get('x-robots-tag'),null,pathname);
}
const previewRequest=new Request('https://app.mingeagle.com/api/payments/stripe/create',{method:'POST'});
const blocked=await onRequest({
 request:previewRequest,env:{TEST_ENVIRONMENT:'preview'},
 next:async()=>{throw Error('Preview must not run live payment creation')}
});
assert.equal(blocked.status,403,'Existing preview write blocking must remain enabled');
console.log('PASS: quote bearer URLs and checkout endpoints are private/no-store/no-referrer; public B2B SEO pages and preview guards unchanged.');
