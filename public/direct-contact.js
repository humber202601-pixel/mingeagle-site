(function(root){
'use strict';
const PHONE='8613851585237',EMAIL='mingeaglecommerce@gmail.com';
const core=typeof module!=='undefined'&&module.exports?require('./forms-core.js'):root.MingEagleForms;
function contactUrl(href,ctx){
 let url;try{url=new URL(href)}catch(e){return null}
 const whatsapp=url.origin==='https://wa.me'&&url.pathname==='/'+PHONE;
 const email=url.protocol==='mailto:'&&url.pathname===EMAIL;
 if(!whatsapp&&!email)return null;
 const key=whatsapp?'text':'body',old=url.searchParams.get(key)||'';
 // Receipt and prepared-inquiry links already carry their own reference and details.
 if(old.includes('Reference:')||old.includes('My reference is:')||old.includes('Source: MING EAGLE website'))return null;
 const lines=core.sourceLines(ctx),intro=old||'Hello MING EAGLE, I would like to learn more about your products.';
 url.searchParams.set(key,intro+'\n\n'+lines);
 if(email&&!url.searchParams.has('subject'))url.searchParams.set('subject','MING EAGLE website inquiry');
 return url.href;
}
function boot(){
 if(!core)return;
 const ctx=core.context(document.title);
 document.querySelectorAll('a[href]').forEach(link=>{const next=contactUrl(link.getAttribute('href'),ctx);if(next)link.setAttribute('href',next)});
}
if(typeof module!=='undefined'&&module.exports){module.exports={contactUrl};return}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})(typeof window==='undefined'?globalThis:window);
