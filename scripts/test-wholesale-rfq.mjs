import assert from 'node:assert/strict';
import fs from 'node:fs';
import {transformSync,build} from 'esbuild';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const load=async path=>{
 const src=fs.readFileSync(path,'utf8');
 const js=transformSync(src,{loader:'ts',format:'esm',target:'es2022'}).code;
 return import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
};
const {parseWholesaleRfq}=await load('src/rfqParser.ts');
const {reviewRfqQuantityConstraints}=await load('lib/rfq-commercial-check.ts');
const tmp=mkdtempSync(join(tmpdir(),'me-wholesale-'));
const outfile=join(tmp,'draft.mjs');
await build({entryPoints:['functions/api/admin/wholesale-quote-draft.ts'],outfile,bundle:true,platform:'node',format:'esm',logLevel:'silent'});
const {onRequestPost}=await import(pathToFileURL(outfile));
const reference='ME-TEST-12345';
const marker='Combined wholesale RFQ (customer-selected; not a final price):';
const sample='Please supply bulk ball sets.\n'+marker+'\nFlocked Silent Basketball Set | No. 3 | Orange | 50 units\nFlocked Silent Basketball Set | No. 5 | Blue | 100 units\nFabric-Cover Silent Basketball Set | No. 7 | Green | 200 units\nShipping method: Recommend best option';
const parsed=parseWholesaleRfq(sample);
assert.equal(parsed.length,3,'Real inquiry newline must not hide RFQ lines');
assert.equal(parsed.reduce((sum,r)=>sum+r.quantity,0),350);
assert.deepEqual(reviewRfqQuantityConstraints(parsed,undefined).pending,[1,2,3],
  'Unknown supplier MOQ/packing must remain unresolved, never assumed to be zero');
const validReview=reviewRfqQuantityConstraints(parsed,[
  {moq:50,casePack:10},{moq:100,casePack:20},{moq:200,casePack:25}
]);
assert.equal(validReview.ok,true);assert.equal(validReview.verified.length,3);
for(const [constraints,error]of [
 [[{moq:51,casePack:10},{moq:100,casePack:20},{moq:200,casePack:25}],'LINE_1_BELOW_MOQ'],
 [[{moq:50,casePack:24},{moq:100,casePack:20},{moq:200,casePack:25}],'LINE_1_NOT_CASE_MULTIPLE'],
 [[{moq:1.5,casePack:10},{moq:100,casePack:20},{moq:200,casePack:25}],'LINE_1_INVALID_MOQ'],
 [[{moq:0,casePack:10},{moq:100,casePack:20},{moq:200,casePack:25}],'LINE_1_INVALID_MOQ'],
 [[{moq:50,casePack:'',},{moq:100,casePack:20},{moq:200,casePack:25}],null],
]){const r=reviewRfqQuantityConstraints(parsed,constraints);
  if(error){assert.equal(r.ok,false);assert(r.errors.includes(error));}
  else{assert.equal(r.ok,true);assert.deepEqual(r.pending,[1]);}
}
assert.equal(reviewRfqQuantityConstraints(parsed,[{moq:20}]).ok,false,'Reject mismatched line counts');
const saved=[];
const inquiry={id:'inq1',reference,lead_id:'lead1',company_id:'company1',contact_id:'contact1',status:'NEW',message:sample};
const env={MINGEAGLE_DB:{
 prepare(sql){return {run:async()=>({success:true}),bind(...params){return {
  first:async()=>sql.startsWith('SELECT id,reference,lead_id')?inquiry:null,
  sql,params
 }}}},async batch(stmts){saved.push(...stmts);return stmts.map(()=>({success:true}))}
}};
const call=async payload=>{const resp=await onRequestPost({request:new Request('https://app.mingeagle.com/api/admin/wholesale-quote-draft',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({inquiryReference:reference,...payload})}),env});return {status:resp.status,result:await resp.json()}};
let x=await call({unitPrices:[2,3,4],shippingUSD:20,paymentTerms:'Payment after confirmation',shippingTerms:'FOB by agreement'});
assert.equal(x.status,200,JSON.stringify(x));assert.equal(x.result.items,3);
assert.equal(x.result.subtotalUSD,1200);assert.equal(x.result.totalUSD,1220);
assert.deepEqual(x.result.quantityReview,{fullySpecified:0,pending:3},
  'Unverified supplier quantity conditions must be explicit on draft confirmation');
assert.equal(saved.filter(s=>s.sql.startsWith('INSERT INTO quote_items')).length,3);
assert.equal(saved.filter(s=>s.sql.includes('INSERT INTO quote_retail_approvals')).length,3,'Three discounted lines must persist matching approved catalog retail values');
for(const [quantityConstraints,expected] of [
 [[{moq:51,casePack:10},{moq:100,casePack:20},{moq:200,casePack:25}],'LINE_1_BELOW_MOQ'],
 [[{moq:50,casePack:24},{moq:100,casePack:20},{moq:200,casePack:25}],'LINE_1_NOT_CASE_MULTIPLE'],
 [[{moq:50,casePack:10}],'CONSTRAINT_LINE_COUNT_MISMATCH'],
 [[{moq:0,casePack:10},{moq:100,casePack:20},{moq:200,casePack:25}],'LINE_1_INVALID_MOQ'],
 ]){
  saved.length=0;
  const fail=await call({unitPrices:[2,3,4],shippingUSD:20,paymentTerms:'Terms',
    shippingTerms:'Terms',quantityConstraints});
  assert.equal(fail.status,400);
  assert.match(fail.result.error,new RegExp(expected));
  assert.equal(saved.length,0,'Invalid MOQ or whole-case rule must not insert a quote');
}
saved.length=0;
const reviewed=await call({unitPrices:[2,3,4],shippingUSD:20,paymentTerms:'Terms',
 shippingTerms:'Terms',quantityConstraints:[{moq:50,casePack:10},{moq:100,casePack:20},{moq:200,casePack:25}]});
assert.equal(reviewed.status,200,JSON.stringify(reviewed));
assert.deepEqual(reviewed.result.quantityReview,{fullySpecified:3,pending:0});
assert(saved.some(s=>s.sql.startsWith('INSERT INTO quotes')&&s.args?.some?.(v=>typeof v==='string'&&v.includes('3 fully specified'))),
 'Quote draft notes must preserve aggregate review status for human follow-up');
for(const prices of [[8.03,1.1,0.29],['8.03','1.10','0.29']]){
 saved.length=0;
 const good=await call({unitPrices:prices,shippingUSD:'19.90',paymentTerms:'Terms',shippingTerms:'Terms'});
 assert.equal(good.status,200,JSON.stringify(good));
 assert.equal(good.result.subtotalUSD,569.5);
 assert.equal(good.result.totalUSD,589.4);
 assert.equal(saved.filter(s=>s.sql.startsWith('INSERT INTO quote_items')).length,3);
}
for(const badPrices of [[1.001,3,4],[-1,3,4],['',3,4],[true,3,4],[100001,3,4]]){
 saved.length=0;
 const bad=await call({unitPrices:badPrices,shippingUSD:20,paymentTerms:'Terms',shippingTerms:'Terms'});
 assert.equal(bad.status,400);assert.equal(saved.length,0,'Invalid amount must not create any quote');
}
for(const shipping of ['',null,-1,'19.901',1000001]){
 saved.length=0;
 const bad=await call({unitPrices:[2,3,4],shippingUSD:shipping,paymentTerms:'Terms',shippingTerms:'Terms'});
 assert.equal(bad.status,400);assert.equal(saved.length,0);
}
saved.length=0;
x=await call({unitPrices:[0,3,4],shippingUSD:20,paymentTerms:'Terms',shippingTerms:'Terms'});
assert.equal(x.status,400);assert.equal(saved.length,0,'Bad prices must never create draft');
rmSync(tmp,{recursive:true,force:true});
console.log('PASS: real multiline RFQ parsed, retail savings approvals persisted with quote, arithmetic accurate, bad price rejected.');
