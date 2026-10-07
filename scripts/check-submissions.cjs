const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const core=require('../public/forms-core.js'),{submission}=require('../public/community.js');
const configContext={window:{}};vm.runInNewContext(fs.readFileSync('public/inquiry-config.js','utf8'),configContext);const config=configContext.window.MINGEAGLE_INQUIRY_CONFIG;
const now=Date.now(),reference='ME-20261007-1234ABCD';
assert(core.validReceipt({reference,acceptedAt:now},reference,now));
for(const receipt of [null,{reference,acceptedAt:now+1},{reference,acceptedAt:now-86400001},{reference,acceptedAt:'today'},{reference:'ME-fake',acceptedAt:now}])assert(!core.validReceipt(receipt,reference,now));
assert(!core.validReceipt({reference,acceptedAt:now},'ME-20261007-1111AAAA',now));
const story=submission('story',{name:'QA',email:'test@example.com',story:'TEST ONLY',media_link:'https://example.com/qa',rating:'5'},reference);
const payload=core.buildPayload(story,config,{pageUri:'https://www.mingeagle.com/stories.html',pageName:'MING EAGLE Story submission'});
const field=name=>payload.fields.find(x=>x.name===name)?.value;
assert.equal(field('me_request_type'),'Story submission');assert(field('message').includes('Not granted; do not publish'));assert(field('me_inquiry_details').includes('Media link: https://example.com/qa'));assert(!field('me_inquiry_details').includes('Story: TEST ONLY'));assert.equal(field('me_estimated_quantity'),'Not applicable to this request');assert.equal(field('me_privacy_consent'),'true');assert.equal(payload.context.pageName,'MING EAGLE Story submission');
const video=submission('video',{creator:'QA',email:'test@example.com',video_link:'https://example.com/test.mp4',platform:'Other',caption:'Owned QA slate'},reference);
assert.equal(video.requestType,'Video submission');assert(video.message.includes('Media rights: confirmed by submitter'));assert(video.metadata.includes('Video link: https://example.com/test.mp4'));assert(video.message.includes('Owned QA slate'));
// Blocking browser storage must not stop later page initialization.
const callbacks=[],selector={value:'',addEventListener:(event,cb)=>selector.change=cb};const doc={documentElement:{},querySelector:s=>s==='#langSelect'?selector:null,querySelectorAll:()=>[],addEventListener:(event,cb)=>callbacks.push(cb)};
const sandbox={document:doc,localStorage:{getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}},window:{},URLSearchParams,location:{search:''},sessionStorage:{getItem(){throw Error('blocked')}}};
vm.runInNewContext(fs.readFileSync('public/site.js','utf8'),sandbox);callbacks.forEach(fn=>fn());assert.equal(doc.documentElement.lang,'en');selector.value='ja';selector.change();assert.equal(doc.documentElement.lang,'ja');
// Track form accepts keyboard submission, rejects bad numbers, and fits its container.
let handler,called=0,args;const input={value:'',focus(){}},status={},result={clientWidth:320,replaceChildren(){this.cleared=true}},link={removeAttribute(name){delete this[name]}};const trackingForm={addEventListener:(event,cb)=>handler=cb};const elements={'#trackingForm':trackingForm,'#YQNum':input,'#trackingStatus':status,'#trackingResult':result,'#trackingExternal':link};const tracking={document:{querySelector:s=>elements[s],documentElement:{lang:'en'}},window:{innerWidth:390,YQV5:{trackSingleF2(a){called++;args=a}}}};
vm.runInNewContext(fs.readFileSync('public/tracking.js','utf8'),tracking);handler({preventDefault(){}});assert.equal(called,0);input.value='bad number!';handler({preventDefault(){}});assert.equal(called,0);input.value='QA123456789';handler({preventDefault(){}});assert.equal(called,1);assert.equal(args.YQ_Width,320);delete tracking.window.YQV5;handler({preventDefault(){}});assert(status.textContent.includes('unavailable'));assert(link.href.includes('QA123456789'));input.value='';handler({preventDefault(){}});assert(link.hidden);assert.equal(link.href,undefined);assert(result.cleared);
console.log('Submission checks passed: consent metadata, separate receipt types, stale receipt rejection, blocked storage, tracking validation and width.');
