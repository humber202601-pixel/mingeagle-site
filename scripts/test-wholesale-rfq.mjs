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
const detailUI=fs.readFileSync('src/AdminDetail.tsx','utf8');
assert.match(detailUI,/taxUSD:tax,taxBasis/,
  'B2B inquiry detail must send the reviewed sales-tax amount and tax basis to the quote API');
assert.match(detailUI,/tax\.trim\(\)===''\|\|!taxBasis/,
  'The UI must stop draft creation when the sales-tax amount or documented basis is missing');
assert.match(detailUI,/quoteTotals\([^\n]*shipping,0,tax\)/,
  'The displayed wholesale quote total must include the reviewed sales-tax amount');
const {parseWholesaleRfq}=await load('src/rfqParser.ts');
const {reviewRfqQuantityConstraints}=await load('lib/rfq-commercial-check.ts');
const tmp=mkdtempSync(join(tmpdir(),'me-wholesale-'));
assert.match(detailUI,/buildReviewedWholesaleDeliveryTerms\(wholesaleDestinationState,wholesaleDutyBasis,wholesaleDeliveryTerms\)/,
  'The quote draft must derive exact buyer-approved delivery terms from reviewed inputs');
assert.match(detailUI,/shippingTerms,quantityConstraints/,
  'Draft API must receive reviewed shipping terms, not unresolved UI placeholder');
const deliveryFile=join(tmp,'delivery.mjs');
await build({entryPoints:['lib/b2b-draft-delivery.ts'],outfile:deliveryFile,bundle:true,platform:'node',format:'esm',logLevel:'silent'});
const {buildReviewedWholesaleDeliveryTerms}=await import(pathToFileURL(deliveryFile));
const agreedDelivery=buildReviewedWholesaleDeliveryTerms('ca','SELLER_INCLUDED','Sea freight from China; estimated delivery 25-30 days after dispatch.');
assert.match(agreedDelivery,/^Ship-to state: CA\./);
assert.match(agreedDelivery,/Seller covers customs clearance and US import duties/);
assert.match(agreedDelivery,/sales tax is separately stated/);
const buyerDuties=buildReviewedWholesaleDeliveryTerms('NY','BUYER_RESPONSIBLE','Sea freight from China; estimated delivery 25-30 days after dispatch.');
assert.match(buyerDuties,/Buyer is responsible for customs clearance and US import duties/);
for(const [state,basis,notes] of [
  ['','SELLER_INCLUDED','Sea freight from China; estimated delivery 25-30 days after dispatch.'],
  ['XX','SELLER_INCLUDED','Sea freight from China; estimated delivery 25-30 days after dispatch.'],
  ['CA','','Sea freight from China; estimated delivery 25-30 days after dispatch.'],
  ['CA','SELLER_INCLUDED','Duties and shipment to be confirmed'],
])assert.throws(()=>buildReviewedWholesaleDeliveryTerms(state,basis,notes),
  'Missing destination, duty review or final shipping terms must not produce payable quote terms');
const outfile=join(tmp,'draft.mjs');
await build({entryPoints:['functions/api/admin/wholesale-quote-draft.ts'],outfile,bundle:true,platform:'node',format:'esm',logLevel:'silent'});
const {onRequestPost}=await import(pathToFileURL(outfile));
const outfileGuard=join(tmp,'guard.mjs');
await build({entryPoints:['lib/rfq-cost-review.ts'],outfile:outfileGuard,bundle:true,platform:'node',format:'esm',logLevel:'silent'});
const {assessRfqPurchaseCosts,internalSkuForRfq}=await import(pathToFileURL(outfileGuard));

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
let supplierRows=[];
let supplierReadFails=false;
const supplierRow=(sku,{moq=50,casePack=10,cost=150,status='APPROVED',expires='2099-12-31',
  tiers}={})=>({sku,status,currency:'USD',moq,case_pack:casePack,
  tiers_json:JSON.stringify(tiers||[{minimumQuantity:moq,purchaseCents:cost}]),
  effective_on:'2020-01-01',expires_on:expires,version:1});
assert.equal(internalSkuForRfq(parsed[0]),'P1-S3');
assert.equal(internalSkuForRfq(parsed[1]),'P1-S5');
assert.equal(internalSkuForRfq(parsed[2]),'P2-S7');
const fullCosts=[supplierRow('P1-S3'),supplierRow('P1-S5',{moq:100,casePack:20,cost:250}),
 supplierRow('P2-S7',{moq:200,casePack:25,cost:350})];
let cost=assessRfqPurchaseCosts(parsed,[200,300,400],[],new Date().toISOString().slice(0,10));
assert.equal(cost.ok,true);assert.equal(cost.unverifiedLines,3);
cost=assessRfqPurchaseCosts(parsed,[200,300,400],fullCosts,new Date().toISOString().slice(0,10));
assert.equal(cost.ok,true);assert.equal(cost.approvedLines,3);
assert.equal(cost.rows[0].unitContributionCents,50);
assert.equal(cost.rows[2].unitCostCents,350);
assert(cost.rows.every(r=>r.reason.includes('color')));
assert(assessRfqPurchaseCosts(parsed,[150,300,400],fullCosts,'2026-10-13').issues.includes('LINE_1_AT_OR_BELOW_APPROVED_COST'));
assert(assessRfqPurchaseCosts(parsed,[200,300,400],[supplierRow('P1-S3',{moq:51}),...fullCosts.slice(1)],'2026-10-13').issues.includes('LINE_1_BELOW_APPROVED_MOQ'));
assert(assessRfqPurchaseCosts(parsed,[200,300,400],[supplierRow('P1-S3',{casePack:24}),...fullCosts.slice(1)],'2026-10-13').issues.includes('LINE_1_NOT_APPROVED_CASE_MULTIPLE'));
assert.equal(assessRfqPurchaseCosts(parsed,[200,300,400],[supplierRow('P1-S3',{status:'DRAFT'}),...fullCosts.slice(1)],'2026-10-13').unverifiedLines,1);
assert.equal(assessRfqPurchaseCosts(parsed,[200,300,400],[supplierRow('P1-S3',{expires:'2022-01-01'}),...fullCosts.slice(1)],'2026-10-13').unverifiedLines,1);
assert(assessRfqPurchaseCosts(parsed,[200,300,400],[supplierRow('P1-S3',{tiers:[{minimumQuantity:50,purchaseCents:1.2}]}),...fullCosts.slice(1)],'2026-10-13').issues.includes('LINE_1_INVALID_COST_TIERS'));
const inquiry={id:'inq1',reference,lead_id:'lead1',company_id:'company1',contact_id:'contact1',status:'NEW',message:sample};
const env={MINGEAGLE_DB:{
 prepare(sql){return {run:async()=>({success:true}),bind(...params){return {
  first:async()=>sql.startsWith('SELECT id,reference,lead_id')?inquiry:null,
  all:async()=>{
    if(sql.includes('supplier_purchase_terms')){
      if(supplierReadFails)throw Error('SIMULATED_DB_OUTAGE');
      return {results:supplierRows.filter(row=>params.includes(row.sku))};
    }
    return {results:[]};
  },
  sql,params
 }}}},async batch(stmts){saved.push(...stmts);return stmts.map(()=>({success:true}))}
}};
const call=async payload=>{const resp=await onRequestPost({request:new Request('https://app.mingeagle.com/api/admin/wholesale-quote-draft',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({inquiryReference:reference,taxUSD:0,taxBasis:'SYNTHETIC_TEST: documented simulated tax review for isolated unit tests only',...payload})}),env});return {status:resp.status,result:await resp.json()}};
const missingBasis=await call({unitPrices:[2,3,4],shippingUSD:20,paymentTerms:'Payment after confirmation',shippingTerms:'FOB by agreement',taxBasis:''});
assert.equal(missingBasis.status,400,'No quotation can be created without an explicit tax review basis');
assert.equal(saved.length,0,'Missing tax review must not mutate quotes');
const missingTax=await call({unitPrices:[2,3,4],shippingUSD:20,paymentTerms:'Payment after confirmation',shippingTerms:'FOB by agreement',taxUSD:undefined});
assert.equal(missingTax.status,400,'No quotation can be created without an explicit reviewed tax amount');
assert.equal(saved.length,0,'Missing tax amount must not mutate quotes');
let x=await call({unitPrices:[2,3,4],shippingUSD:20,taxUSD:12.34,paymentTerms:'Payment after confirmation',shippingTerms:'FOB by agreement'});
assert.equal(x.status,200,JSON.stringify(x));assert.equal(x.result.items,3);
assert.equal(x.result.purchaseCostReview.approvedSkuBaselines,0);
assert.equal(x.result.purchaseCostReview.unverifiedSkuBaselines,3);
assert(x.result.purchaseCostReview.estimates.every(x=>x.purchaseUnitUSD===null),
 'No configured purchasing source must not create fictitious supplier costs');
assert.equal(x.result.subtotalUSD,1200);assert.equal(x.result.taxUSD,12.34);assert.equal(x.result.totalUSD,1232.34);
assert(saved.some(s=>s.sql.startsWith('INSERT INTO quotes')&&s.params?.includes?.(12.34)),
 'Reviewed nonzero tax must be persisted in the quote snapshot');
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
assert(saved.some(s=>s.sql.startsWith('INSERT INTO quotes')&&s.params?.some?.(v=>typeof v==='string'&&v.includes('3 fully specified'))),
 'Quote draft notes must preserve aggregate review status for human follow-up');
supplierRows=fullCosts;
saved.length=0;
let protectedResult=await call({unitPrices:[2,3,4],shippingUSD:20,paymentTerms:'Terms',shippingTerms:'Terms'});
assert.equal(protectedResult.status,200,JSON.stringify(protectedResult));
assert.equal(protectedResult.result.purchaseCostReview.approvedSkuBaselines,3);
assert.equal(protectedResult.result.purchaseCostReview.unverifiedSkuBaselines,0);
assert.equal(protectedResult.result.purchaseCostReview.estimates[0].purchaseUnitUSD,1.5);
assert.equal(protectedResult.result.purchaseCostReview.estimates[0].supplierVersion,1);
assert(saved.some(v=>v.sql.startsWith('INSERT INTO quotes')&&v.params.some(p=>typeof p==='string'&&p.includes('3 lines matched an approved SKU-size baseline'))));
for(const [altered,block] of [
  [[1.5,3,4],'LINE_1_AT_OR_BELOW_APPROVED_COST'],
  [[2,2.4,4],'LINE_2_AT_OR_BELOW_APPROVED_COST'],
  [[2,3,3.5],'LINE_3_AT_OR_BELOW_APPROVED_COST'],
]){
 saved.length=0;
 const v=await call({unitPrices:altered,shippingUSD:20,paymentTerms:'Terms',shippingTerms:'Terms'});
 assert.equal(v.status,400,JSON.stringify(v));
 assert.match(v.result.error,new RegExp(block));assert.equal(saved.length,0,'At/below-cost quote cannot be drafted');
}
supplierRows=[supplierRow('P1-S3',{moq:51}),...fullCosts.slice(1)];
saved.length=0;
let fail=await call({unitPrices:[2,3,4],shippingUSD:20,paymentTerms:'Terms',shippingTerms:'Terms'});
assert.equal(fail.status,400);assert.match(fail.result.error,/LINE_1_BELOW_APPROVED_MOQ/);
assert.equal(saved.length,0);
supplierRows=[supplierRow('P1-S3',{casePack:24}),...fullCosts.slice(1)];
saved.length=0;
fail=await call({unitPrices:[2,3,4],shippingUSD:20,paymentTerms:'Terms',shippingTerms:'Terms'});
assert.equal(fail.status,400);assert.match(fail.result.error,/LINE_1_NOT_APPROVED_CASE_MULTIPLE/);
assert.equal(saved.length,0);
supplierRows=[supplierRow('P1-S3',{status:'DRAFT'}),...fullCosts.slice(1)];
saved.length=0;
const pending=await call({unitPrices:[2,3,4],shippingUSD:20,paymentTerms:'Terms',shippingTerms:'Terms'});
assert.equal(pending.status,200);
assert.equal(pending.result.purchaseCostReview.unverifiedSkuBaselines,1);
supplierReadFails=true;saved.length=0;
const offline=await call({unitPrices:[2,3,4],shippingUSD:20,paymentTerms:'Terms',shippingTerms:'Terms'});
assert.equal(offline.status,503,'Missing or inaccessible catalog must not bypass server checks');
assert.equal(saved.length,0);
supplierReadFails=false;supplierRows=[];
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
