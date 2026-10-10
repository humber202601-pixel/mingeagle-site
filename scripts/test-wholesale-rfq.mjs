import assert from 'node:assert/strict';
import fs from 'node:fs';
import {transformSync} from 'esbuild';
const load=async path=>{
 const src=fs.readFileSync(path,'utf8');
 const js=transformSync(src,{loader:'ts',format:'esm',target:'es2022'}).code;
 return import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
};
const {parseWholesaleRfq}=await load('src/rfqParser.ts');
const {onRequestPost}=await load('functions/api/admin/wholesale-quote-draft.ts');
const reference='ME-TEST-12345';
const marker='Combined wholesale RFQ (customer-selected; not a final price):';
const sample='Please supply bulk ball sets.\n'+marker+'\nFlocked Silent Basketball Set | No. 3 | Orange | 50 units\nFlocked Silent Basketball Set | No. 5 | Blue | 100 units\nFabric-Cover Silent Basketball Set | No. 7 | Green | 200 units\nShipping method: Recommend best option';
const parsed=parseWholesaleRfq(sample);
assert.equal(parsed.length,3,'Real inquiry newline must not hide RFQ lines');
assert.equal(parsed.reduce((sum,r)=>sum+r.quantity,0),350);
const saved=[];
const inquiry={id:'inq1',reference,lead_id:'lead1',company_id:'company1',contact_id:'contact1',status:'NEW',message:sample};
const env={MINGEAGLE_DB:{
 prepare(sql){return {bind(...params){return {
  first:async()=>sql.startsWith('SELECT id,reference,lead_id')?inquiry:null,
  sql,params
 }}}},async batch(stmts){saved.push(...stmts);return stmts.map(()=>({success:true}))}
}};
const call=async payload=>{const resp=await onRequestPost({request:new Request('https://app.mingeagle.com/api/admin/wholesale-quote-draft',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({inquiryReference:reference,...payload})}),env});return {status:resp.status,result:await resp.json()}};
let x=await call({unitPrices:[2,3,4],shippingUSD:20,paymentTerms:'Payment after confirmation',shippingTerms:'FOB by agreement'});
assert.equal(x.status,200,JSON.stringify(x));assert.equal(x.result.items,3);
assert.equal(x.result.subtotalUSD,1200);assert.equal(x.result.totalUSD,1220);
assert.equal(saved.filter(s=>s.sql.startsWith('INSERT INTO quote_items')).length,3);
saved.length=0;
x=await call({unitPrices:[0,3,4],shippingUSD:20,paymentTerms:'Terms',shippingTerms:'Terms'});
assert.equal(x.status,400);assert.equal(saved.length,0,'Bad prices must never create draft');
console.log('PASS: real multiline RFQ parsed, three items persisted atomically, arithmetic accurate, bad price rejected.');
