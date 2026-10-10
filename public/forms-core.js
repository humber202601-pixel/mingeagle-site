(function(root){
'use strict';
function reference(){return 'ME-'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'-'+crypto.randomUUID().slice(0,8).toUpperCase()}
function context(pageName){const q=new URLSearchParams(location.search),cookie=document.cookie.split('; ').find(x=>x.startsWith('hubspotutk='));let saved={};try{saved=JSON.parse(sessionStorage.getItem('mingeagle_source_v1')||'{}')||{}}catch(e){}const safe=v=>String(v||'').replace(/[\u0000-\u001f]/g,'').slice(0,500);return {pageUri:location.origin+location.pathname,pageName,landingPage:safe(saved.landingPage)||location.origin+location.pathname,campaignLanding:safe(saved.campaignLanding),referrer:safe(saved.referrer)||'Direct / unknown',campaign:['utm_source','utm_medium','utm_campaign','utm_content'].map(k=>k+'='+safe(q.has(k)?q.get(k):saved[k]).slice(0,200)).join(' | '),hutk:cookie?cookie.slice(11):''}}
function sourceLines(ctx){return ['Source: MING EAGLE website','Landing page: '+(ctx.landingPage||ctx.pageUri),'Campaign landing: '+(ctx.campaignLanding||ctx.pageUri),'Inquiry page: '+ctx.pageUri,'Referrer: '+(ctx.referrer||'Direct / unknown'),'Campaign: '+(ctx.campaign||'Direct / unknown')].join('\n')}
function buildPayload(d,c,context){const f=c.fields;const details=[d.metadata||'',d.orderReference?'Order / quote reference: '+d.orderReference:'',d.customization&&d.customization!=='Not specified'?'Customization: '+d.customization:'',d.timing&&d.timing!=='Not specified'?'Timing: '+d.timing:'',sourceLines(context)].filter(Boolean).join('\n');const values={firstname:d.firstname,email:d.email,company:d.company,phone:d.phone,country:d.country,zip:d.zip,message:d.message||'No additional message for this request',[f.reference]:d.reference,[f.requestType]:d.requestType,[f.products]:d.products||'No product selected',[f.customerType]:d.customerType||'Not specified for this request',[f.quantity]:d.quantity||'Not applicable to this request',[f.details]:details,[f.privacy]:'true'};const ctx={pageUri:context.pageUri,pageName:context.pageName||'MING EAGLE product / wholesale inquiry'};if(context.hutk)ctx.hutk=context.hutk;return {fields:Object.entries(values).filter(([,v])=>v).map(([name,value])=>({objectTypeId:'0-1',name,value})),context:ctx,submittedAt:String(Date.now())}}
async function sendPayload(c,payload,fetcher=fetch,timeoutMs=20000){if(!c.enabled||!/^\d+$/.test(c.portalId)||!/^[-a-f0-9]{36}$/i.test(c.formId||''))throw new Error('NOT_CONFIGURED');const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),timeoutMs);try{const res=await fetcher('https://api.hsforms.com/submissions/v3/integration/submit/'+c.portalId+'/'+c.formId,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:ctrl.signal});if(res.status===200)return {accepted:true};throw new Error(res.status===429?'RATE_LIMIT':res.status>=500?'UNCERTAIN':'REJECTED')}catch(e){if(e.name==='AbortError'||e instanceof TypeError)throw new Error('UNCERTAIN');throw e}finally{clearTimeout(timer)}}
// CRM is the primary inbox. Never transmit admin keys to the public website.
// HubSpot remains a backup source if the CRM is temporarily unavailable.
function crmPayload(d,ctx){
 const names={'Sample request':'SAMPLE','Wholesale quote':'WHOLESALE','Retail partnership':'RETAIL_PARTNERSHIP','Order support':'ORDER_SUPPORT','General product question':'GENERAL'};
 const requestType=names[d.requestType]||'GENERAL';
 const campaign=new URLSearchParams((ctx.campaign||'').replace(/ \| /g,'&'));
 return {
  originalReference:d.reference,requestType,requestLabel:d.requestType,
  firstName:d.firstname,lastName:'',email:d.email,phone:d.phone||'',whatsapp:d.phone||'',
  company:d.company||'',customerType:d.customerType||'',country:d.country||'',
  postalCode:d.zip||'',estimatedQuantity:d.quantity||'',
  products:d.products?d.products.split('\n').filter(Boolean):[],
  customization:d.customization||'',orderTiming:d.timing||'',
  message:[d.message||'',d.orderReference?'Order / quote reference: '+d.orderReference:''].filter(Boolean).join('\n'),
  leadSource:'MING EAGLE official website',landingPage:ctx.landingPage||ctx.pageUri,
  referrer:ctx.referrer||'',utmSource:campaign.get('utm_source')||'',
  utmMedium:campaign.get('utm_medium')||'',utmCampaign:campaign.get('utm_campaign')||'',
  utmContent:campaign.get('utm_content')||'',privacyAck:true,marketingConsent:false,_honey:''
 };
}
async function sendCrmInquiry(c,d,ctx,fetcher=fetch){
 const endpoint=c.crmEndpoint||'https://app.mingeagle.com/api/inquiries';
 if(!/^https:\/\/app\.mingeagle\.com\/api\/inquiries$/.test(endpoint))throw new Error('CRM_NOT_CONFIGURED');
 const payload=crmPayload(d,ctx),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);
 try{
  const res=await fetcher(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});
  let answer;try{answer=await res.json()}catch{throw new Error('CRM_UNCERTAIN')}
  if(!res.ok||!answer||answer.ok!==true||answer.reference!==d.reference||!answer.inquiryId||!answer.leadId)throw new Error(res.status>=500?'CRM_UNAVAILABLE':'CRM_REJECTED');
  return {accepted:true,reference:answer.reference,inquiryId:answer.inquiryId,idempotent:!!answer.idempotent};
 }catch(error){if(error.name==='AbortError'||error instanceof TypeError)throw new Error('CRM_UNCERTAIN');throw error}
 finally{clearTimeout(timer)}
}
function saveReceipt(d,kind){try{sessionStorage.setItem('mingeagle_receipt',JSON.stringify({reference:d.reference,acceptedAt:Date.now(),kind:kind||'inquiry',requestType:d.requestType}));return true}catch(e){return false}}
function validReceipt(r,ref,now=Date.now()){return !!(r&&/^ME-\d{8}-[A-F0-9]{8}$/.test(r.reference||'')&&ref===r.reference&&Number.isFinite(r.acceptedAt)&&now>=r.acceptedAt&&now-r.acceptedAt<=86400000)}
const api={reference,context,sourceLines,buildPayload,sendPayload,crmPayload,sendCrmInquiry,saveReceipt,validReceipt};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MingEagleForms=Object.freeze(api);
})(typeof window==='undefined'?globalThis:window);
