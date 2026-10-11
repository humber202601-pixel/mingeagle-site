/* MING EAGLE instant sales assistant. Deterministic answers only; never claims to be a human or LLM. */
(()=>{'use strict';
if(document.getElementById('me-chat-root'))return;
const root=document.createElement('div');root.id='me-chat-root';
root.innerHTML='<button type="button" class="me-chat-launch" aria-label="Open instant sales assistant" aria-expanded="false">✦ <span>Ask MING EAGLE</span></button><section class="me-chat-panel" role="dialog" aria-label="MING EAGLE automated sales assistant" hidden><header class="me-chat-head"><div><strong>MING EAGLE Assistant</strong><small>Instant answers · 24/7 · Automated</small></div><button type="button" class="me-chat-close" aria-label="Close assistant">×</button></header><div class="me-chat-log" role="log" aria-live="polite"></div><div class="me-chat-quick"></div><form class="me-chat-form"><label for="me-chat-input" class="me-chat-sr">Your question</label><input id="me-chat-input" maxlength="600" placeholder="Ask about products, sizes, wholesale…" autocomplete="off" required><button type="submit">Send</button></form><p class="me-chat-foot">Automated FAQ, not a live human. Prices exclude shipping unless confirmed. <a href="inquiry.html?type=quote">Contact sales</a></p></section>';
document.body.appendChild(root);
const launch=root.querySelector('.me-chat-launch'),panel=root.querySelector('.me-chat-panel'),close=root.querySelector('.me-chat-close'),log=root.querySelector('.me-chat-log'),quick=root.querySelector('.me-chat-quick'),form=root.querySelector('form'),field=root.querySelector('input');
const askUrl='inquiry.html?type=quote',sampleUrl='inquiry.html?type=sample';
const entries=[
 ['Basketball sizes','Our flocked and fabric-cover silent basketball sets come in sizes No. 3, 5 and 7. The weighted flocked silent basketball is available in No. 3, 4, 6 and 7.','products.html'],
 ['Silent soccer','Our flocked silent soccer ball is available in size No. 5 with several color options.','silent-soccer.html'],
 ['Wholesale quote','We can prepare quantity-based wholesale pricing. Please share the product model, ball size, quantity, and destination ZIP code using our quote form.',askUrl],
 ['Samples','Sample options and costs depend on the model, quantity and delivery location. Please submit a sample inquiry so our team can confirm.',sampleUrl],
 ['Shipping & MOQ','Freight, minimum order quantity, stock and lead time depend on the exact configuration and destination. We will confirm them in a personalized quote.',askUrl]
];
function add(who,message,url,label){const block=document.createElement('div');block.className='me-chat-msg '+who;const p=document.createElement('p');p.textContent=message;block.appendChild(p);if(url){const a=document.createElement('a');a.href=url;a.textContent=label||'Continue →';block.appendChild(a)}log.appendChild(block);log.scrollTop=log.scrollHeight}
function reply(query){const q=query.toLowerCase();if(/(human|agent|representative|person|email|contact|whatsapp|talk to)/.test(q))return ['Our sales team can help with individual quotes and special requests. You can send an inquiry or contact mingeaglecommerce@gmail.com.',askUrl,'Contact our team →'];
if(/(soccer|football)/.test(q))return [entries[1][1],entries[1][2],'Explore soccer →'];
if(/(wholesale|bulk|quotation|quote|pricing for|discount|buy [0-9]|[0-9]+ (units|pcs|sets))/i.test(q))return [entries[2][1],askUrl,'Request a quote →'];
if(/(shipping|freight|delivery|zip|lead time|moq|minimum order|inventory|stock)/.test(q))return [entries[4][1],askUrl,'Ask for confirmed terms →'];
if(/(sample|trial|test one)/.test(q))return [entries[3][1],sampleUrl,'Request a sample →'];
if(/(soccer|basketball|size|color|model|product|weighted|flocked|fabric)/.test(q))return [entries[0][1],entries[0][2],'Browse products →'];
if(/(retail|price|cost|how much)/.test(q))return ['Our current reference retail prices depend on the ball model and size. Please check the published catalog; wholesale pricing is quoted separately.', 'wholesale-product-catalog.html','View product prices →'];
return ['I can help with product models, sizes, samples, retail references, bulk quotes and shipping questions. For anything else, please send an inquiry so our team can provide a verified answer.',askUrl,'Ask our team →']}
// Multi-turn, client-side quote qualification: no visitor text is transmitted or stored.
const quoteState={active:false,model:'',size:'',quantity:'',zip:''};
function captureDetails(text){
 const m=text.match(/(?:^|\\s)([1-9]\\d{0,4})\\s*(?:sets?|pcs?|pieces?|balls?|units?)\\b/i);
 if(m)quoteState.quantity=m[1];
 else if(quoteState.model&&quoteState.size&&!quoteState.quantity&&/^[1-9]\\d{0,4}$/.test(text.trim()))quoteState.quantity=text.trim();
 const z=text.match(/\\b(?:zip(?:\\s*code)?\\s*[:#-]?\\s*|ship(?:ping)?\\s+to\\s+)(\\d{5})(?:-\\d{4})?\\b/i);
 if(z)quoteState.zip=z[1];
 else if(quoteState.quantity&&!quoteState.zip&&/^\\d{5}$/.test(text.trim()))quoteState.zip=text.trim();
 const n=text.match(/\\b(?:size\\s*|no\\.?\\s*)([34567])\\b/i);
 if(n)quoteState.size=n[1];
 if(/soccer|football/i.test(text))quoteState.model='Flocked Silent Soccer Ball';
 else if(/weighted/i.test(text))quoteState.model='Weighted Flocked Silent Basketball';
 else if(/fabric|cloth/i.test(text))quoteState.model='Fabric-Cover Silent Basketball Set';
 else if(/flocked/i.test(text))quoteState.model='Flocked Silent Basketball Set';
}
function quoteLink(){const u=new URL('inquiry.html',location.href);u.searchParams.set('type','quote');const summary=[quoteState.model&&'Product: '+quoteState.model,quoteState.size&&'Size: No. '+quoteState.size,quoteState.quantity&&'Quantity: '+quoteState.quantity+' units',quoteState.zip&&'Destination ZIP: '+quoteState.zip].filter(Boolean).join('; ');if(summary)u.searchParams.set('assistant_summary',summary);return u.href}
function salesReply(input){
 const q=input.trim();
 if(/\\b(quote|wholesale|bulk|pricing for|request price)\\b/i.test(q))quoteState.active=true;
 if(quoteState.active){
  captureDetails(q);
  if(!quoteState.model)return ['Happy to help with a wholesale quote. Which model do you need: flocked basketball, fabric-cover basketball, weighted basketball or silent soccer ball?'];
  if(!quoteState.size)return ['Thanks! Which ball size would you prefer? Please enter a number such as size 3, 5 or 7.'];
  if(!quoteState.quantity)return ['Got it. Approximately how many sets or balls do you need? For example: 100 units.'];
  if(!quoteState.zip)return ['What is the U.S. delivery ZIP code? Example: ZIP 75201. We will confirm freight separately.'];
  const summary='Thanks! I have '+quoteState.quantity+' units of '+quoteState.model+', No. '+quoteState.size+', shipping to ZIP '+quoteState.zip+'. Please review the prefilled inquiry form and add your contact details. Our team will verify stock, shipping, MOQ and wholesale pricing.';
  quoteState.active=false;return [summary,quoteLink(),'Continue with quote request →'];
 }
 return reply(q);
}
entries.forEach(([label,answer,url])=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=()=>{add('visitor',label);add('assistant',answer,url,'Learn more →')};quick.appendChild(b)});
function open(){panel.hidden=false;launch.setAttribute('aria-expanded','true');if(!log.children.length)add('assistant','Welcome! I am MING EAGLE’s automated sales assistant. Ask me about silent basketballs, soccer balls, wholesale quotes, samples or delivery.');field.focus()}
launch.addEventListener('click',()=>panel.hidden?open():close.click());close.addEventListener('click',()=>{panel.hidden=true;launch.setAttribute('aria-expanded','false');launch.focus()});
form.addEventListener('submit',e=>{e.preventDefault();const q=field.value.trim();if(!q)return;add('visitor',q);field.value='';const [message,url,label]=salesReply(q);add('assistant',message,url,label)});
})();
