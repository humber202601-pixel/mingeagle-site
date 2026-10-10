(function(root){
'use strict';
// Optional client-side Cloudflare Turnstile. No secret/API credentials here.
// Only enabled when the app server reports a valid active configuration.
let status='loading',responseToken='',widgetId=null,widgetApi=null,starting=null;
const endpoint='https://app.mingeagle.com/api/turnstile-config';
function setMessage(id,message){const el=typeof document==='undefined'?null:document.getElementById(id);if(el)el.textContent=message}
function loadWidgetScript(){
 return new Promise((resolve,reject)=>{
  if(root.turnstile){resolve(root.turnstile);return}
  const script=document.createElement('script');
  script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  script.async=true;script.defer=true;
  script.onload=()=>root.turnstile?resolve(root.turnstile):reject(new Error('Turnstile widget failed to load.'));
  script.onerror=()=>reject(new Error('Turnstile widget could not load.'));
  document.head.appendChild(script);
 });
}
async function start(containerId='turnstileChallenge',hintId='turnstileHint',fetcher=fetch){
 if(starting)return starting;
 starting=(async()=>{
  try{
   const res=await fetcher(endpoint,{method:'GET',cache:'no-store'});
   if(!res.ok)throw new Error('Verification configuration unavailable.');
   const cfg=await res.json();
   if(!cfg||!cfg.ok||cfg.misconfigured)throw new Error('Verification configuration unavailable.');
   if(!cfg.enabled){status='disabled';return {enabled:false,unavailable:false}}
   if(!cfg.siteKey||cfg.action!=='mingeagle_inquiry')throw new Error('Verification is not configured correctly.');
   const container=document.getElementById(containerId);
   if(!container)throw new Error('Security verification container missing.');
   const api=await loadWidgetScript();
   widgetApi=api;
   widgetId=api.render(container,{sitekey:cfg.siteKey,action:cfg.action,appearance:'interaction-only',
    callback:token=>{responseToken=typeof token==='string'?token:'';setMessage(hintId,responseToken?'Verification complete.':'Complete verification before sending.');},
    'expired-callback':()=>{responseToken='';setMessage(hintId,'Verification expired. Please complete it again.');},
    'error-callback':()=>{responseToken='';setMessage(hintId,'Verification failed. Please try again.');}
   });
   status='required';
   setMessage(hintId,'Please complete the security verification before sending your inquiry.');
   return {enabled:true,unavailable:false};
  }catch(error){
   status='unavailable';
   setMessage(hintId,'Verification is temporarily unavailable. You can contact us directly by email or WhatsApp below.');
   return {enabled:true,unavailable:true,error:String(error&&error.message||error)};
  }
 })();
 return starting;
}
function token(){return status==='required'?responseToken:''}
function reset(){responseToken='';if(widgetApi&&widgetId!==null){try{widgetApi.reset(widgetId)}catch(e){}}}
const api={start,token,reset,getStatus:()=>status};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MingEagleTurnstile=Object.freeze(api);
})(typeof window==='undefined'?globalThis:window);
