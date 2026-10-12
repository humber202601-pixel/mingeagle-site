import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
const load=async path=>{const r=await build({entryPoints:[path],bundle:true,write:false,platform:'node',format:'esm',logLevel:'silent'});return import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'));};
const routes={
 inquiry:(await load('functions/api/inquiries.ts')).onRequestPost,
 create:(await load('functions/api/admin/quotes.ts')).onRequestPost,
 edit:(await load('functions/api/admin/quote-edit.ts')).onRequestPost,
 approve:(await load('functions/api/admin/quote-retail-approval.ts')).onRequestPost,
 release:(await load('functions/api/admin/quote-send.ts')).onRequestPost,
 view:(await load('functions/quote/[token].ts')).onRequestGet,
};
const auth=(await load('functions/api/admin/_middleware.ts')).onRequest;
const root=(await load('functions/_middleware.ts')).onRequest;
const sqlite=new DatabaseSync(':memory:');
for(const file of ['0001_core.sql','0002_quote_public_links.sql','0003_airwallex_payment_sessions.sql','0004_shipping_rates.sql'])sqlite.exec(readFileSync('migrations/'+file,'utf8'));
const database={
 prepare(sql){const statement={sql,args:[],bind(...args){statement.args=args;return statement;},async first(){return sqlite.prepare(sql).get(...statement.args)||null;},async all(){return {success:true,results:sqlite.prepare(sql).all(...statement.args)};},async run(){const result=sqlite.prepare(sql).run(...statement.args);return {success:true,meta:{changes:Number(result.changes)}};}};return statement;},
 async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}}
};
const env={MINGEAGLE_DB:database,ADMIN_ACCESS_KEY:'test-only-local-key',TEST_ENVIRONMENT:'preview',OUTBOUND_EMAIL_DISABLED:'true'};
const originalFetch=globalThis.fetch;let externalCalls=0;
globalThis.fetch=async()=>{externalCalls++;throw Error('No external email or customer calls are allowed in quote tests');};
const call=async(name,path,input,authorized=true)=>{
 const request=new Request('https://quote-test.example'+path,{method:'POST',headers:{'content-type':'application/json',origin:'https://www.mingeagle.com',...(authorized?{'x-admin-key':env.ADMIN_ACCESS_KEY}:{})},body:JSON.stringify(input)});
 const handler=()=>routes[name]({request,env,params:{}});
 const response=await root({request,env,next:()=>path.startsWith('/api/admin/')?auth({request,env,next:handler}):handler()});
 return {status:response.status,body:await response.json()};
};
const query=sql=>sqlite.prepare(sql).get();
try{
 const reference='ME-TEST-QUOTE-20261012';
 const inquiry=await call('inquiry','/api/inquiries',{originalReference:reference,firstName:'Synthetic',lastName:'Quote Test',email:'quote-test@example.invalid',country:'US',postalCode:'75201',estimatedQuantity:'100',products:['Flocked Silent Basketball Set'],privacyAck:true,message:'Synthetic isolated test inquiry. Exact requested units: 100'});
 assert.equal(inquiry.status,200,JSON.stringify(inquiry));assert.equal(inquiry.body.reference,reference);
 assert.equal(query('SELECT count(*) AS n FROM inquiries').n,1);assert.equal(externalCalls,0);
 const input={inquiryReference:reference,description:'Flocked Silent Basketball Set | No. 5 | Blue',quantity:'100',unitPrice:'8.03',shipping:'19.90',discount:'0',paymentTerms:'Test terms',shippingTerms:'Test freight'};
 let response=await call('create','/api/admin/quotes',input,false);assert.equal(response.status,401);
 for(const patch of [{unitPrice:'8.031'},{quantity:'50–100'},{shipping:''},{discount:'1000'},{unitPrice:true}]){response=await call('create','/api/admin/quotes',{...input,...patch});assert.equal(response.status,400);assert.equal(query('SELECT count(*) AS n FROM quotes').n,0);}
 response=await call('create','/api/admin/quotes',input);assert.equal(response.status,201,JSON.stringify(response));assert.equal(response.body.total,822.9);
 const quoteId=response.body.quoteId;
 let quote=query('SELECT * FROM quotes');let item=query('SELECT * FROM quote_items');
 assert.equal(quote.status,'DRAFT');assert.equal(item.line_total,803);assert.match(query('SELECT source_url FROM quote_retail_approvals').source_url,/www\.mingeagle\.com\/retail-reference-prices\.json\?v=[a-f0-9]{64}$/);
 response=await call('release','/api/admin/quote-send',{quoteId,sendEmail:false});assert.equal(response.status,409,'Draft release requires explicit staff approval');
 response=await call('release','/api/admin/quote-send',{quoteId,sendEmail:true,approved:true});assert.equal(response.status,403,'Preview cannot send customer email');
 assert.equal(query('SELECT count(*) AS n FROM quote_public_links').n,0);
 const edit={quoteId,items:[{id:item.id,description:item.description,quantity:3,unitPrice:'8.07'}],shipping:'19.90',discount:'0.29',validUntil:'2026-12-31',paymentTerms:'Test terms',shippingTerms:'Test freight'};
 response=await call('edit','/api/admin/quote-edit',{...edit,items:[{...edit.items[0],quantity:3.5}]});assert.equal(response.status,400);assert.equal(query('SELECT quantity FROM quote_items').quantity,100);
 sqlite.prepare('UPDATE quotes SET tax=1.1 WHERE id=?').run(quoteId);
 response=await call('edit','/api/admin/quote-edit',edit);assert.equal(response.status,200,JSON.stringify(response));assert.equal(response.body.quote.total,44.92,'Edit preserves existing tax and uses exact cents');
 assert.equal(query('SELECT count(*) AS n FROM quote_retail_approvals').n,0,'A change invalidates the old approval permanently');
 response=await call('approve','/api/admin/quote-retail-approval',{quoteId,itemId:item.id,retailUSD:11.9,sourceUrl:'https://www.mingeagle.com/retail-reference-prices.json',confirmed:true});assert.equal(response.status,200,JSON.stringify(response));
 response=await call('release','/api/admin/quote-send',{quoteId,sendEmail:false,approved:true});assert.equal(response.status,200,JSON.stringify(response));assert.equal(response.body.emailed,false);
 assert.equal(query("SELECT count(*) AS n FROM activities WHERE activity_type='QUOTE_APPROVED'").n,1);
 const token=response.body.publicPath.split('/').pop();
 const page=await routes.view({request:new Request('https://quote-test.example'+response.body.publicPath),env,params:{token}});
 assert.equal(page.status,200);const html=await page.text();assert.match(html,/Save USD 3\.83/);assert.match(html,/Product savings USD 11\.49/);assert.match(html,/44\.92/);
 response=await call('edit','/api/admin/quote-edit',edit);assert.equal(response.status,409,'Released quotations are locked');
 const blocked=await root({request:new Request('https://quote-test.example/api/admin/email-queue',{method:'POST'}),env,next:()=>{throw Error('Preview must block this mutation');}});assert.equal(blocked.status,403);
 assert.equal(externalCalls,0);assert.equal(query("SELECT count(*) AS n FROM messages WHERE direction='OUTBOUND'").n,0);
 console.log('PASS: real SQL inquiry → authenticated draft → decimal totals → edit/invalidation → staff approval → secure customer quote, no external sends.');
}finally{globalThis.fetch=originalFetch;sqlite.close();}
