import assert from 'node:assert/strict';
import {build} from 'esbuild';
const result=await build({entryPoints:['lib/b2b-stripe-eligibility.ts'],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
const {acceptedB2bQuotePayable}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
const termCode=await build({entryPoints:['lib/b2b-quote-terms.ts'],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
const {stripeCheckoutTermsSupported}=await import('data:text/javascript;base64,'+Buffer.from(termCode.outputFiles[0].text).toString('base64'));
const valid={
 status:'CONVERTED',sent_at:'2026-10-15 12:00:00',accepted_at:'2026-10-15 12:10:00',
 payment_terms:'100% payment by Stripe upon quote acceptance',
 shipping_terms:'China to US sea delivery within approximately 25–30 days; duties and freight explicitly quoted',
 valid_until:'2026-12-31 23:59:59'
};
assert.equal(acceptedB2bQuotePayable(valid),true,'Buyer and seller acceptance unlocks a valid quote');
for(const term of [
 'No Stripe payments; bank transfer before shipment.',
 'Stripe checkout is disabled; use wire transfer.',
 'Payment by Stripe not accepted for this order.',
 'Do not use Stripe card payment for this quotation.',
 'We cannot take Stripe card payments.',
 'Payment by Wise only; Stripe is mentioned for reference.',
 'Payment by Stripe and PayPal or bank transfer.',
 'Stripe unavailable, please contact us for bank details.',
 'Stripe checkout: not supported for this contract.',
 'Full payment by bank transfer before production'
 ]){
 assert.equal(stripeCheckoutTermsSupported(term),false,'Invalid rail wording should fail: '+term);
 assert.equal(acceptedB2bQuotePayable({...valid,payment_terms:term}),false,'No unpayable accepted quote: '+term);
}
for(const term of [
 '100% payment by Stripe upon quote acceptance',
 'Full amount payable by secure Stripe card checkout after both parties accept the quotation.',
 'Please pay online by Stripe card payment before production.'
 ])assert.equal(stripeCheckoutTermsSupported(term),true,'Valid card route: '+term);
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
