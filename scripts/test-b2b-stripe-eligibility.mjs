import assert from 'node:assert/strict';
import {build} from 'esbuild';
const result=await build({entryPoints:['lib/b2b-stripe-eligibility.ts'],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
const {acceptedB2bQuotePayable}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
const valid={
 status:'CONVERTED',sent_at:'2026-10-15 12:00:00',accepted_at:'2026-10-15 12:10:00',
 payment_terms:'100% payment by Stripe upon quote acceptance',
 shipping_terms:'China to US sea delivery within approximately 25–30 days; duties and freight explicitly quoted',
 valid_until:'2026-12-31 23:59:59'
};
assert.equal(acceptedB2bQuotePayable(valid),true,'Buyer and seller acceptance unlocks a valid quote');
for(const change of [
 {status:'SENT'}, {status:'VIEWED'}, {sent_at:null}, {accepted_at:null},
 {sent_at:'2026-10-15 13:00:00'}, {payment_terms:'Payment terms to be confirmed before sending.'},
 {shipping_terms:'Shipping terms pending confirmation'}, {shipping_terms:''},
 {valid_until:'2026-10-15 12:05:00'}, {valid_until:null},
]){
 assert.equal(acceptedB2bQuotePayable({...valid,...change}),false,
  'Missing acceptance, commercial terms or expired-before-acceptance quote must not be payable: '+JSON.stringify(change));
}
assert.equal(acceptedB2bQuotePayable({...valid,status:'ACCEPTED'}),true);
console.log('PASS: B2B Stripe seller release, buyer acceptance, complete terms and validity gating.');
