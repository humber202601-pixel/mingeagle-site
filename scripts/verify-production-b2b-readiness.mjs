// Read-only, production HTTP acceptance gate. NEVER create a Checkout Session.
// Production config readiness != successful charge/settlement/webhook reconciliation.
import assert from 'node:assert/strict';
const origin='https://app.mingeagle.com';
const url=origin+'/api/payments/status';
const result=await fetch(url,{method:'GET',headers:{accept:'application/json','cache-control':'no-cache'},redirect:'error',signal:AbortSignal.timeout(15000)});
if(!result.ok)throw Error('Live readiness HTTP '+result.status);
const j=await result.json();
assert.equal(j?.ok,true,'Payment-status endpoint did not return ok');
assert(j?.stripe && typeof j.stripe==='object','Stripe readiness information unavailable');
const s=j.stripe;
const checks={
 liveMode:s.mode==='live',
 matchingLiveKey:s.keyMode==='live'&&s.keyConfigured===true,
 globalCheckout:s.checkoutRequested===true && s.checkoutReady===true,
 signedWebhook:s.webhookConfigured===true,
 taxReviewToggle:s.taxPolicyApproved===true,
 b2bRequested:s.b2bCheckoutRequested===true,
 b2bTaxReviewConfigured:s.b2bTaxReviewConfigured===true,
 noRetailOnlyRestriction:s.retailOnlyRestriction===false,
 b2bConfigReady:s.b2bConfigurationReady===true,
 b2bLiveConfigReady:s.b2bLiveConfigurationReady===true,
 noConfigBlockers:Array.isArray(s.b2bActivationBlockers)&&s.b2bActivationBlockers.length===0,
 taxScopeWarningPresent:typeof s.b2bTaxScopeWarning==='string'&&s.b2bTaxScopeWarning.trim().length>0,
};
for(const [name,pass] of Object.entries(checks))
 console.log((pass?'PASS':'BLOCK')+' '+name);
if(Array.isArray(s.b2bActivationBlockers)&&s.b2bActivationBlockers.length)
 console.log('Blocker codes: '+s.b2bActivationBlockers.map(x=>String(x).slice(0,80)).join(', '));
console.log('Tax caveat: '+(s.b2bTaxScopeWarning?'Per-order legal tax review remains required.':'The legal tax scope remains unverified.'));
console.log('This check does NOT verify a real B2B payment, a webhook delivery, Stripe Tax registrations or settlement.');
if(Object.values(checks).some(pass=>!pass)){
 console.error('FAIL: production B2B Stripe configuration did not pass the read-only readiness gate.');
 process.exitCode=1;
}else{
 console.log('PASS: production B2B Stripe configuration gate; live payment reconciliation still requires separate proof.');
}
