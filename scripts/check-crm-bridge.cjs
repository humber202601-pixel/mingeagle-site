const assert=require('node:assert/strict');
const fs=require('node:fs');
const core=require('../public/forms-core.js');
const ctx={pageUri:'https://www.mingeagle.com/inquiry.html',landingPage:'https://www.mingeagle.com/for-coaches.html',referrer:'https://www.google.com',campaign:'utm_source=google | utm_medium=organic | utm_campaign=silent_ball | utm_content=training'};
const common={reference:'ME-20261010-A1B2C3D4',firstname:'Jordan',lastname:'',email:'jordan@example.test',company:'Local Hoops Academy',customerType:'Coach / trainer',quantity:'20',country:'US',products:'Flocked Silent Basketball Set — No. 5 / Orange',requestType:'Wholesale quote'};
for(const [label,expected]of [['Wholesale quote','WHOLESALE'],['Sample request','SAMPLE'],['Retail partnership','RETAIL_PARTNERSHIP'],['General product question','GENERAL'],['Order support','ORDER_SUPPORT']]){
 const payload=core.crmPayload({...common,requestType:label},ctx);
 assert.equal(payload.requestType,expected);
 assert.equal(payload.originalReference,common.reference);
 assert.equal(payload.firstName,'Jordan');
 assert.equal(payload.email,common.email);
 assert.equal(payload.lastName,'','website only collects a given name, never invent a surname');
 assert.equal(payload.utmCampaign,'silent_ball');
 assert.equal(payload.landingPage,ctx.landingPage);
 assert.equal(payload.privacyAck,true);
 assert.equal(payload.marketingConsent,false);
 assert.ok(!Object.keys(payload).some(key=>/admin|secret|password|apikey|accesskey/i.test(key)),'never expose admin credentials');
}
const submit=async(responseData,responseStatus=200)=>{
 let calls=0;let payload;
 const fetcher=async(url,options)=>{
  calls++;assert.equal(url,'https://app.mingeagle.com/api/inquiries');
  assert.equal(options.method,'POST');
  assert.equal(options.headers['Content-Type'],'application/json');
  assert.equal(options.headers['x-admin-key'],undefined);
  payload=JSON.parse(options.body);
  return Response.json(responseData,{status:responseStatus});
 };
 let result,error;
 try{result=await core.sendCrmInquiry({},common,ctx,fetcher)}catch(e){error=e}
 return {result,error,calls,payload};
};
(async()=>{
 const good=await submit({ok:true,reference:common.reference,inquiryId:'inquiry-fixture',leadId:'lead-fixture'});
 assert.equal(good.result?.accepted,true);assert.equal(good.calls,1);assert.equal(good.payload.products.length,1);
 const duplicate=await submit({ok:true,reference:common.reference,inquiryId:'inquiry-fixture',leadId:'lead-fixture',idempotent:true});
 assert.equal(duplicate.result?.idempotent,true);
 const wrong=await submit({ok:true,reference:'ME-OTHER',inquiryId:'inquiry-fixture',leadId:'lead-fixture'});
 assert.equal(wrong.error?.message,'CRM_REJECTED','different reference must never be accepted as this submission');
 const fail=await submit({error:'Daily quota exceeded'},503);
 assert.equal(fail.error?.message,'CRM_UNAVAILABLE');
 const rateLimit=await submit({ok:false,error:'Too many requests'},429);
 assert.equal(rateLimit.error?.message,'CRM_RATE_LIMIT');
 const unprocessable=await submit({ok:false,error:'Invalid purchase data'},422);
 assert.equal(unprocessable.error?.message,'CRM_REJECTED');
 assert.equal(core.shouldUseBackupForCrmError(rateLimit.error),false,'429 cannot bypass CRM rate limits via HubSpot');
 assert.equal(core.shouldUseBackupForCrmError(unprocessable.error),false,'4xx validation failures cannot be accepted by the backup');
 assert.equal(core.shouldUseBackupForCrmError(fail.error),true,'Only server outages may invoke a backup');
 assert.equal(core.shouldUseBackupForCrmError(new Error('CRM_UNCERTAIN')),true,'Unknown network outcome may invoke backup with uncertain status disclosure');
 assert.equal(core.shouldUseBackupForCrmError(new Error('CRM_CHALLENGE')),false);
 assert.equal(core.shouldUseBackupForCrmError(new Error('CRM_VERIFICATION_UNAVAILABLE')),false);
 assert.equal(core.shouldUseBackupForCrmError(new Error('CRM_NOT_CONFIGURED')),false);
 assert.equal(core.shouldUseBackupForCrmError(new Error('CRM_REJECTED')),false);
 const nonJson=async(status)=>{
  const result=await core.sendCrmInquiry({},common,ctx,async()=>new Response('<h1>Bad request</h1>',{status,headers:{'content-type':'text/html'}})).catch(err=>err);
  return result.message;
 };
 assert.equal(await nonJson(400),'CRM_REJECTED','HTML HTTP 400 is still a definite validation failure');
 assert.equal(await nonJson(429),'CRM_RATE_LIMIT','HTML HTTP 429 cannot circumvent the throttle');
 assert.equal(await nonJson(503),'CRM_UNAVAILABLE','HTML HTTP 503 permits fallback');
 assert.equal(await nonJson(200),'CRM_UNCERTAIN','Malformed successful response is uncertain, not accepted');
 const transport=await core.sendCrmInquiry({},common,ctx,async()=>{throw new TypeError('network unavailable')}).catch(e=>e);
 assert.equal(transport.message,'CRM_UNCERTAIN');

 const source=fs.readFileSync('public/inquiry.js','utf8');
 assert(source.includes("await sendCrmInquiry(c,d,context,undefined,challenge?challenge.token():'')"));
 assert(source.includes('await sendPayload(c,buildPayload(d,c,context))'),'HubSpot should remain available when D1 is down');
 assert(source.includes('if(!core.shouldUseBackupForCrmError(crmError))'),'Non-transient CRM rejection must bypass the automatic fallback');
 const preFallback=source.indexOf('if(!core.shouldUseBackupForCrmError(crmError))');
 const backupSubmit=source.indexOf('await sendPayload(c,buildPayload(d,c,context));');
 assert(preFallback>=0&&backupSubmit>preFallback,'Security guard must run before direct HubSpot fallback');
 assert(source.includes('review(d,hint+\' Press Send in your email or WhatsApp app to contact us.\')'),'Definitively rejected buyer keeps direct contact options');

 assert(source.includes('synchronization to the customer management system has not yet been confirmed'),'fallback never falsely asserts CRM success');
 assert(source.includes('Inquiry origin: Website AI sales assistant (customer-reviewed handoff).'),'assist-origin tag should be preserved in CRM inquiry message');
 assert(source.includes("AI-assisted RFQ details (customer-reviewed): '+assistantSummary"),'exact quote details must remain in CRM payload despite form textbox truncation');
 assert(source.indexOf('await sendCrmInquiry')<source.indexOf('await sendPayload(c,buildPayload(d,c,context),undefined,4500)'),'CRM is primary; HubSpot optional mirror');
 console.log('PASS: public form maps all five request types, passes source attribution, preserves exact references, rejects mismatched CRM confirmations, never sends admin keys and retains honest HubSpot fallback.');
})().catch(e=>{console.error(e);process.exitCode=1});
