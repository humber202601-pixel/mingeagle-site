/* MING EAGLE instant sales assistant. Deterministic answers only; never claims to be a human or LLM. */
(()=>{'use strict';
if(document.getElementById('me-chat-root'))return;
const root=document.createElement('div');root.id='me-chat-root';
root.innerHTML='<button type="button" class="me-chat-launch" aria-label="Open instant sales assistant" aria-expanded="false">✦ <span>Ask MING EAGLE</span></button><section class="me-chat-panel" role="dialog" aria-label="MING EAGLE automated sales assistant" hidden><header class="me-chat-head"><div><strong>MING EAGLE Assistant</strong><small>24/7 automated support · AI when available</small></div><button type="button" class="me-chat-close" aria-label="Close assistant">×</button></header><div class="me-chat-log" role="log" aria-live="polite"></div><div class="me-chat-quick"></div><form class="me-chat-form"><label for="me-chat-input" class="me-chat-sr">Your question</label><input id="me-chat-input" maxlength="600" placeholder="Ask about products, sizes, wholesale…" autocomplete="off" required><button type="submit">Send</button></form><p class="me-chat-foot">Automated assistant. Questions may be processed by an AI provider when enabled. Do not enter sensitive details. Prices exclude shipping unless confirmed. <a href="inquiry.html?type=quote">Contact sales</a></p></section>';
document.body.appendChild(root);
const launch=root.querySelector('.me-chat-launch'),panel=root.querySelector('.me-chat-panel'),close=root.querySelector('.me-chat-close'),log=root.querySelector('.me-chat-log'),quick=root.querySelector('.me-chat-quick'),form=root.querySelector('form'),field=root.querySelector('input');
const askUrl='inquiry.html?type=quote',sampleUrl='inquiry.html?type=sample';
const languageCodes=['en','es','pt','fr','de','it','ja'];
const languageIndex={button:0,subtitle:1,placeholder:2,send:3,contact:4};
let activeLanguage='en';
function currentLanguage(){const selected=document.querySelector('#langSelect')?.value||document.documentElement.lang||'en';return languageCodes.includes(selected)?selected:'en'}
function tr(index){const table=window.MINGEAGLE_CHAT_LANG||{};return (table[activeLanguage]||table.en||[])[index]||(table.en||[])[index]||''}
function faq(index){const table=window.MINGEAGLE_CHAT_ANSWERS||{};return (table[activeLanguage]||table.en||[])[index]||(table.en||[])[index]||''}
function translateUi(){activeLanguage=currentLanguage();launch.querySelector('span').textContent=tr(0);root.querySelector('.me-chat-head small').textContent=tr(1);field.placeholder=tr(2);form.querySelector('button').textContent=tr(3);root.querySelector('.me-chat-foot a').textContent=tr(4);root.querySelector('.me-chat-foot').firstChild.textContent=tr(18)+' ';const names=[5,6,7,8,9];quick.querySelectorAll('button').forEach((b,i)=>{b.textContent=tr(names[i])});root.querySelector('.me-chat-launch').setAttribute('aria-label',tr(0));}
window.addEventListener('mingeagle:language',translateUi);

const entries=[
 ['Basketball sizes','Our flocked and fabric-cover silent basketball sets come in sizes No. 3, 5 and 7. The weighted flocked silent basketball is available in No. 3, 4, 6 and 7.','products.html'],
 ['Silent soccer','Our flocked silent soccer ball is available in size No. 5 with several color options.','silent-soccer.html'],
 ['Wholesale quote','We can prepare quantity-based wholesale pricing. Please share the product model, ball size, quantity, and destination ZIP code using our quote form.',askUrl],
 ['Samples','Sample options and costs depend on the model, quantity and delivery location. Please submit a sample inquiry so our team can confirm.',sampleUrl],
 ['Shipping & MOQ','Freight, minimum order quantity, stock and lead time depend on the exact configuration and destination. We will confirm them in a personalized quote.',askUrl]
];
function add(who,message,url,label){const block=document.createElement('div');block.className='me-chat-msg '+who;const p=document.createElement('p');p.textContent=message;block.appendChild(p);if(url){const a=document.createElement('a');a.href=url;a.textContent=label||'Continue →';block.appendChild(a)}log.appendChild(block);log.scrollTop=log.scrollHeight}
function reply(query){const q=query.toLowerCase();if(/(human|agent|representative|person|email|contact|whatsapp|talk to)/.test(q))return [faq(6),askUrl,tr(17)];
if(/(soccer|football)/.test(q))return [faq(1),entries[1][2],faq(8)];
if(/(wholesale|bulk|quotation|quote|pricing for|discount|buy [0-9]|[0-9]+ (units|pcs|sets))/i.test(q))return [faq(2),askUrl,tr(16)];
if(/(shipping|freight|delivery|zip|lead time|moq|minimum order|inventory|stock)/.test(q))return [faq(4),askUrl,tr(17)];
if(/(sample|trial|test one)/.test(q))return [faq(3),sampleUrl,faq(8)];
if(/(soccer|basketball|size|color|model|product|weighted|flocked|fabric)/.test(q))return [faq(0),entries[0][2],faq(8)];
if(/(retail|price|cost|how much)/.test(q))return [faq(5),'wholesale-product-catalog.html',faq(8)];
return [faq(6),askUrl,tr(17)]}
// Multi-turn, client-side quote qualification: no visitor text is transmitted or stored.
const quoteState={active:false,model:'',size:'',quantity:'',zip:''};
function captureDetails(text){
 const m=text.match(/(?:^|\s)([1-9]\d{0,4})\s*(?:sets?|pcs?|pieces?|balls?|units?)\b/i);
 if(m)quoteState.quantity=m[1];
 else if(quoteState.model&&quoteState.size&&!quoteState.quantity&&/^[1-9]\d{0,4}$/.test(text.trim()))quoteState.quantity=text.trim();
 const z=text.match(/\b(?:zip(?:\s*code)?|postal(?:\s*code)?|postcode|code\s*postal|c[oó]digo\s*postal|cep|plz|cap|郵便番号)\s*[:#-]?\s*([a-z0-9][a-z0-9 -]{1,10})/i);
 if(z)quoteState.zip=z[1].trim().toUpperCase();
 else if(quoteState.quantity&&!quoteState.zip&&/^(?=.{3,10}$)(?=.*[a-z0-9])[a-z0-9 -]+$/i.test(text.trim()))quoteState.zip=text.trim().toUpperCase();
 const n=text.match(/\b(?:size\s*|no\.?\s*)([34567])\b/i);
 if(n)quoteState.size=n[1];
 if(/soccer|football/i.test(text))quoteState.model='Flocked Silent Soccer Ball';
 else if(/weighted/i.test(text))quoteState.model='Weighted Flocked Silent Basketball';
 else if(/fabric|cloth/i.test(text))quoteState.model='Fabric-Cover Silent Basketball Set';
 else if(/flocked/i.test(text))quoteState.model='Flocked Silent Basketball Set';
}
function quoteLink(){const u=new URL('inquiry.html',location.href);u.searchParams.set('type','quote');const summary=[quoteState.model&&'Product: '+quoteState.model,quoteState.size&&'Size: No. '+quoteState.size,quoteState.quantity&&'Quantity: '+quoteState.quantity+' units',quoteState.zip&&'Destination postal code: '+quoteState.zip].filter(Boolean).join('; ');if(summary)u.searchParams.set('assistant_summary',summary);return u.href}
// Keep an optional, local-only commercial question summary for explicit form handoff.
let handoffQuestion='';
function handoffUrl(type='quote'){
 const u=new URL('inquiry.html',location.href);u.searchParams.set('type',type);
 if(handoffQuestion)u.searchParams.set('assistant_question',handoffQuestion.slice(0,300));
 return u.href;
}
function needsStaff(input){return /\b(custom(?:ize|ization)?|private label|own logo|certificat(?:e|ion)|compliance|payment terms|credit|invoice|refund|return policy|lead time|freight quotation|tracking issue|complaint|human|representative)\b/i.test(input)}
function isQuoteIntent(text){
 return /(?:quote|quotation|wholesale|bulk|pricing for|request price|cotizaci[oó]n|mayorista|por mayor|presupuesto|or[cç]amento|atacado|devis|vente en gros|gro[ßs]handel|angebot|preventivo|ingrosso|卸売|見積)/i.test(text);
}
function salesReply(input){
 const q=input.trim();
 if(isQuoteIntent(q))quoteState.active=true;
 if(quoteState.active){
  captureDetails(q);
  if(!quoteState.model)return [tr(11)];
  if(!quoteState.size)return [tr(12)];
  if(!quoteState.quantity)return [tr(13)];
  if(!quoteState.zip)return [tr(14)];
  const summary=tr(16)+' '+quoteState.quantity+' '+quoteState.model+' — '+quoteState.size+' — '+quoteState.zip+'.';
  quoteState.active=false;return [faq(7)+' '+summary,quoteLink(),tr(16)];
 }
 return reply(q);
}
entries.forEach(([label,answer,url],i)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=()=>{add('visitor',tr(5+i));if(i===2){quoteState.active=true;quoteState.model='';quoteState.size='';quoteState.quantity='';quoteState.zip='';add('assistant',tr(11));}else add('assistant',faq(i),url,faq(8))};quick.appendChild(b)});
function open(){panel.hidden=false;launch.setAttribute('aria-expanded','true');if(!log.children.length)add('assistant',tr(10));field.focus()}
launch.addEventListener('click',()=>panel.hidden?open():close.click());close.addEventListener('click',()=>{panel.hidden=true;launch.setAttribute('aria-expanded','false');launch.focus()});
const context=[];
async function answerQuestion(question){
  if(needsStaff(question)){
    handoffQuestion=question;
    return [tr(15),handoffUrl('question'),tr(17)];
  }
  // Keep high-stakes commercial quotes deterministic and human-reviewed.
  if(quoteState.active||isQuoteIntent(question))return salesReply(question);
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),7000);
  try{
    const history=[...context.slice(-10),{role:'user',content:question}];
    const response=await fetch('https://app.mingeagle.com/api/sales-chat',{method:'POST',mode:'cors',signal:controller.signal,headers:{'content-type':'application/json'},body:JSON.stringify({messages:history,language:activeLanguage})});
    if(!response.ok)throw Error('AI unavailable');
    const data=await response.json();
    if(!data.ok||typeof data.answer!=='string')throw Error('Invalid AI answer');
    context.push({role:'user',content:question},{role:'assistant',content:data.answer});
    return [data.answer];
  }catch{return salesReply(question)}finally{clearTimeout(timeout)}
}
form.addEventListener('submit',async e=>{e.preventDefault();const q=field.value.trim();if(!q)return;add('visitor',q);field.value='';field.disabled=true;
  try{const [message,url,label]=await answerQuestion(q);add('assistant',message,url,label)}finally{field.disabled=false;field.focus()}
});
translateUi();
})();
