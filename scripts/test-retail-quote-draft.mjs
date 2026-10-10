import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';
import {webcrypto} from 'node:crypto';

if(!globalThis.crypto)globalThis.crypto=webcrypto;
const source=await readFile(new URL('../functions/api/admin/retail-quote-draft.ts',import.meta.url),'utf8');
const compiled=await transform(source,{loader:'ts',format:'esm',target:'es2022'});
const {onRequestPost}=await import('data:text/javascript;base64,'+Buffer.from(compiled.code).toString('base64'));

function fakeDatabase(message,{inquiryStatus='NEW',existingQuote=false,minimum=1}={}){
 const writes=[];
 const rate={usd_per_unit:6.428571428571429,volume_divisor:1000000/167,min_charge_usd:0,handling_usd:0,min_units:minimum};
 const inquiry={id:'inq1',reference:'ME-20261011-TEST',lead_id:'lead1',company_id:null,contact_id:'ct1',status:inquiryStatus,message};
 const db={
  prepare(sql){let args=[];const statement={bind(...values){args=values;return statement},async first(){
    if(sql.includes('FROM inquiries WHERE reference'))return inquiry;
    if(sql.includes('FROM quotes WHERE inquiry_id'))return existingQuote?{reference:'ME-Q-EXISTING'}:null;
    if(sql.includes('FROM shipping_packaging'))return {length_cm:25,width_cm:25,height_cm:25,units_per_package:1};
    if(sql.includes('FROM shipping_rates'))return rate;
    throw Error('Unexpected SELECT '+sql);
   }};Object.defineProperty(statement,'sql',{get:()=>sql});Object.defineProperty(statement,'args',{get:()=>args});return statement},
  async batch(statements){writes.push(...statements);return statements.map(()=>({success:true}))}
 };
 return {db,writes};
}
async function run(message,opts={}){
 const {db,writes}=fakeDatabase(message,opts);
 const request=new Request('https://app.mingeagle.com/api/admin/retail-quote-draft',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({inquiryReference:'ME-20261011-TEST'})});
 const res=await onRequestPost({request,env:{MINGEAGLE_DB:db}});
 return {status:res.status,body:await res.json(),writes};
}
function message(products,method='Air parcel'){return ['Retail cart order request (NOT PAID)','Products: '+products,'Total items: 10','Destination country: US','Preferred shipping: '+method,'Estimated freight USD (unverified): 0.01','Estimated total before tax USD (unverified): 0.02'].join('\n')}
const good=await run(message('P1-S3 x 4, P4-S5 x 6'));
assert.equal(good.status,200,JSON.stringify(good.body));
assert.equal(good.body.status,'DRAFT');assert.equal(good.body.paymentEnabled,false);
assert.equal(good.body.quantity,10);assert.equal(good.body.items,2);
assert.equal(good.body.subtotalUSD,147);assert.equal(good.body.shippingUSD,167.75);assert.equal(good.body.totalBeforeTaxesUSD,314.75);
assert.equal(good.writes.length,4);
assert.match(good.writes[0].sql,/INSERT INTO quotes/);
assert.match(good.writes[0].sql,/'DRAFT'/);
assert.match(good.writes[3].sql,/UPDATE inquiries/);
const dup=await run(message('P1-S3 x 5, P1-S3 x 5'));assert.equal(dup.status,400);assert.equal(dup.writes.length,0);
const seaMin=await run(message('P1-S3 x 9','Sea freight'));assert.equal(seaMin.status,400);
const configuredMin=await run(message('P1-S3 x 10'),{minimum:11});assert.equal(configuredMin.status,409);
const existing=await run(message('P1-S3 x 10'),{existingQuote:true});assert.equal(existing.status,409);
const closed=await run(message('P1-S3 x 10'),{inquiryStatus:'CLOSED'});assert.equal(closed.status,409);
const invalid=await run(message('P4-S7 x 10'));assert.equal(invalid.status,400);
console.log('PASS: retail quote draft normal multi-SKU flow, server-priced totals, draft-only, duplicate protection, quantity minimums, existing quote, closed inquiry, invalid SKU.');
