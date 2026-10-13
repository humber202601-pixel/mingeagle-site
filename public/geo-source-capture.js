// Capture first-party inquiry attribution on standalone AI buyer guides.
// Does not send network requests, add cookies, or collect visitor identity.
(function(){
 'use strict';
 try{
  const key='mingeagle_source_v1';
  const q=new URLSearchParams(location.search);
  let saved;
  try{saved=JSON.parse(sessionStorage.getItem(key)||'null')}catch{saved=null}
  if(!saved||typeof saved!=='object'||Array.isArray(saved)||
     typeof saved.landingPage!=='string'||!/^https:\/\/(?:www\.)?mingeagle\.com\//.test(saved.landingPage)){
   let referrer='Direct / unknown';
   try{
    if(document.referrer){
     const u=new URL(document.referrer);
     if(u.protocol==='https:'&&u.username===''&&u.password==='')referrer=(u.origin+u.pathname).slice(0,500);
    }
   }catch{}
   saved={landingPage:location.origin+location.pathname,referrer,firstSeen:Date.now()};
  }
  const keys=['utm_source','utm_medium','utm_campaign','utm_content'];
  if(keys.some(k=>q.has(k))){
   for(const k of keys)saved[k]=String(q.get(k)||'').replace(/[\u0000-\u001f]/g,'').slice(0,200);
   saved.campaignLanding=location.origin+location.pathname;
  }
  sessionStorage.setItem(key,JSON.stringify(saved));
 }catch{}
})();
