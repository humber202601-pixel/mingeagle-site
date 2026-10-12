import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const args=process.argv.slice(2);
const option=name=>args[args.indexOf(name)+1];
if(!args.includes('--url')||!args.includes('--key-file'))throw Error('Provide --url and --key-file for the isolated preview');
const base=new URL(option('--url'));
if(base.protocol!=='https:'||!base.hostname.endsWith('.mingeagle-site.pages.dev')||base.username||base.password)throw Error('Only the dedicated Cloudflare preview hostname is allowed');
const key=readFileSync(option('--key-file'),'utf8').trim();
if(key.length<32)throw Error('A dedicated preview admin key is required');
const request=async(path,input)=>{
 const response=await fetch(new URL(path,base),{method:input===undefined?'GET':'POST',headers:{'content-type':'application/json','x-admin-key':key,origin:'https://www.mingeagle.com'},...(input===undefined?{}:{body:JSON.stringify(input)}),signal:AbortSignal.timeout(25000)});
 const raw=await response.text();let body;try{body=JSON.parse(raw);}catch{throw Error('Non-JSON response '+response.status+' at '+path);}
 return {status:response.status,body};
};
// Fail closed before any write if this is not the isolated, no-send environment.
const health=await request('/api/quote-reference');
assert.equal(health.status,200);assert.equal(health.body.testEnvironment,true);assert.equal(health.body.outboundDisabled,true);
assert.deepEqual(health.body.catalog,JSON.parse(readFileSync('public/retail-reference-prices.json','utf8')));
const reference='ME-TEST-'+randomUUID().slice(0,8).toUpperCase();
const description='Flocked Silent Basketball Set | No. 5 | Blue';
let r=await request('/api/inquiries',{originalReference:reference,firstName:'Synthetic',lastName:'Preview Test',email:'quote-preview@example.invalid',country:'US',postalCode:'75201',estimatedQuantity:'50–100',products:['Flocked Silent Basketball Set'],privacyAck:true,message:'Synthetic isolated acceptance test.\nCombined wholesale RFQ (customer-selected; not a final price):\n'+description+' | 100 units'});
assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.body.reference,reference);assert.equal(r.body.emailForwarded,false);
r=await request('/api/admin/wholesale-quote-draft',{inquiryReference:reference,unitPrices:['8.03'],shippingUSD:'19.90',paymentTerms:'Synthetic test; no payment',shippingTerms:'Synthetic test; no shipment'});
assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.body.totalUSD,822.9);assert.equal(r.body.sent,false);
const quoteReference=r.body.quoteReference;
r=await request('/api/admin/data');assert.equal(r.status,200,JSON.stringify(r));
const quote=r.body.quotes.find(q=>q.reference===quoteReference);assert(quote);assert.equal(quote.status,'DRAFT');
r=await request('/api/admin/quote-send',{quoteId:quote.id,sendEmail:false});assert.equal(r.status,409);
r=await request('/api/admin/quote-send',{quoteId:quote.id,sendEmail:true,approved:true});assert.equal(r.status,403);assert.equal(r.body.code,'OUTBOUND_DISABLED');
r=await request('/api/admin/quote-send',{quoteId:quote.id,sendEmail:false,approved:true});assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.body.emailed,false);
const response=await fetch(new URL(r.body.publicPath,base),{signal:AbortSignal.timeout(25000)});assert.equal(response.status,200);const html=await response.text();assert.match(html,/Save USD 3\.87/);assert.match(html,/Product savings USD 387\.00/);assert.match(html,/822\.90/);
console.log(JSON.stringify({result:'PASS',environment:'isolated Cloudflare preview',inquiryReference:reference,quoteReference,totalUSD:822.9,staffApprovalRequired:true,customerEmailBlocked:true,customerQuotePageVerified:true}));
