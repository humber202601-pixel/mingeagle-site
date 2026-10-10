const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const core=require('../public/forms-core.js');
const ref='ME-20261010-A1B2C3D4';
const ctx={pageUri:'https://www.mingeagle.com/inquiry.html',landingPage:'https://www.mingeagle.com/inquiry.html',campaign:'utm_source=organic'};
const customer={reference:ref,firstname:'Morgan',email:'morgan@example.test',requestType:'General product question'};
const mock=async(token,status=200)=>{
 let body=null;
 const fetcher=async(url,options)=>{
  assert.equal(url,'https://app.mingeagle.com/api/inquiries');
  body=JSON.parse(options.body);
  return Response.json(status===200?{ok:true,reference:ref,inquiryId:'inquiry-fixture',leadId:'lead-fixture'}:
    {ok:false,code:'TURNSTILE_REJECTED',error:'Security verification required'},{status});
 };
 let result,error;
 try{result=await core.sendCrmInquiry({},customer,ctx,fetcher,token)}catch(e){error=e}
 return {body,result,error};
};
(async()=>{
 const yes=await mock('test-verified-token');
 assert.equal(yes.body.turnstileToken,'test-verified-token');
 assert.equal(yes.result.accepted,true);
 const no=await mock('fake-token',403);
 assert.equal(no.error.message,'CRM_CHALLENGE','challenge denial cannot be mistaken for D1 outage');
 const html=fs.readFileSync('public/inquiry.html','utf8');
 const form=fs.readFileSync('public/inquiry.js','utf8');
 assert(html.includes('id="turnstileChallenge"'));
 assert(html.includes('src="turnstile-client.js'));
 assert(html.indexOf('src="turnstile-client.js')<html.indexOf('src="inquiry.js'),'widget module must load before inquiry handler');
 assert(form.includes("if(['CRM_CHALLENGE','CRM_VERIFICATION_UNAVAILABLE'].includes(crmError?.message))"),
   'CAPTCHA failures must not invoke automatic HubSpot backup');
 assert(form.includes("await sendCrmInquiry(c,d,context,undefined,challenge?challenge.token():'')"));
 const load=()=>{const feedback={textContent:''};const widget={};
  const sandbox={window:{turnstile:{render(_node,options){widget.options=options;return 5},
       reset(id){assert.equal(id,5);widget.resetCount=(widget.resetCount||0)+1}}},
    document:{getElementById(id){return id==='turnstileChallenge'?{}:feedback}},fetch(){throw Error('Use provided fetcher')},
    AbortSignal,setTimeout,clearTimeout,console,module:{exports:{}}};
  vm.runInNewContext(fs.readFileSync('public/turnstile-client.js','utf8'),sandbox);
  return {manager:sandbox.module.exports,widget,feedback};
 };
 const off=load(),noChallenge=await off.manager.start('turnstileChallenge','turnstileHint',async()=>Response.json({ok:true,enabled:false,siteKey:'',action:'mingeagle_inquiry'}));
 assert.equal(noChallenge.enabled,false);
 assert.equal(off.manager.getStatus(),'disabled');
 const on=load(),ready=await on.manager.start('turnstileChallenge','turnstileHint',async()=>Response.json({ok:true,enabled:true,siteKey:'fixture-public',action:'mingeagle_inquiry'}));
 assert.equal(ready.enabled,true);
 assert.equal(on.widget.options.sitekey,'fixture-public');
 assert.equal(on.widget.options.action,'mingeagle_inquiry');
 on.widget.options.callback('browser-challenge');
 assert.equal(on.manager.token(),'browser-challenge');
 on.manager.reset();assert.equal(on.manager.token(),'');assert.equal(on.widget.resetCount,1);
 const broken=load(),fail=await broken.manager.start('turnstileChallenge','turnstileHint',async()=>Response.json({ok:true,enabled:true,misconfigured:true}));
 assert.equal(fail.unavailable,true);
 assert.equal(broken.manager.getStatus(),'unavailable');
 assert(broken.feedback.textContent.includes('email or WhatsApp'));
 console.log('PASS: optional challenge setup, confirmed token POST, Siteverify rejection suppression of HubSpot fallback, cache-safe widget placement and manual contact on errors.');
})().catch(err=>{console.error(err);process.exitCode=1});
