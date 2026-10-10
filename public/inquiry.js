(function(root){
'use strict';
const TYPE_MAP={retail:'Retail purchase inquiry',quote:'Wholesale quote',sample:'Sample request',question:'General product question','order-support':'Order support','retail-partnership':'Retail partnership'};
function rules(type){return {purchase:['Wholesale quote','Sample request','Retail partnership','Retail purchase inquiry'].includes(type),order:type==='Order support',message:['General product question','Order support'].includes(type)}}
function summary(d,ctx){const lines=['MING EAGLE inquiry','Reference: '+d.reference,'Request: '+d.requestType,'Name: '+d.firstname,'Email: '+d.email];[['Products',d.products],['Quantity',d.quantity],['Destination',d.country],['Order / quote reference',d.orderReference],['Company',d.company],['Phone / WhatsApp',d.phone],['Customer type',d.customerType],['Postal code',d.zip],['Customization',d.customization],['Timing',d.timing],['Message',d.message]].forEach(([k,v])=>{if(v&&v!=='Not specified')lines.push(k+': '+v)});lines.push('Privacy: agreed to use these details to respond to this request.');if(ctx)lines.push(core.sourceLines(ctx));return lines.join('\n')}
const core=typeof module!=='undefined'&&module.exports?require('./forms-core.js'):root.MingEagleForms;
const {buildPayload,sendPayload,sendCrmInquiry}=core||{};
if(typeof module!=='undefined'&&module.exports){module.exports={rules,summary,buildPayload,sendPayload};return}
if(!core)return;
const form=document.querySelector('#quoteForm');if(!form)return;
const challenge=root.MingEagleTurnstile;
const challengeReady=challenge?challenge.start():Promise.resolve({enabled:false,unavailable:false});
const $=id=>document.getElementById(id),c=root.MINGEAGLE_INQUIRY_CONFIG||{enabled:false},q=new URLSearchParams(location.search);
const type=TYPE_MAP[(q.get('type')||'').toLowerCase()];if(type)$('request_type').value=type;
form.querySelectorAll('[name="products[]"]').forEach(cb=>{if(cb.value===q.get('product'))cb.checked=true});
if(q.get('type')==='retail'&&q.get('cart')){
 const items=String(q.get('cart')||'').slice(0,450);
 const country=String(q.get('cart_country')||'').slice(0,2);
 const shipping=String(q.get('cart_shipping')||'').slice(0,20);
 const total=String(q.get('cart_total')||'').slice(0,20);
 const method=q.get('cart_method')==='sea'?'Sea freight':'Air parcel';
 const summary='Retail cart request (not paid): '+items+'\nDestination: '+country+'\nShipping method: '+method+'\nEstimated freight USD: '+shipping+'\nEstimated subtotal before taxes USD: '+total+'\nFinal amount, duties and availability require confirmation.';
 if($('message'))$('message').value=summary;
 if($('country'))$('country').value=country;
}


try{
 const raw=q.get('logo_design');
 if(raw&&raw.length<=3000){
  const d=JSON.parse(raw),options={p1:{sizes:['3','5','7'],colors:['Orange','Blue','Green','Yellow']},p3:{sizes:['3','4','6','7'],colors:['Orange','Brown','Black','Aqua Blue']}};
  if(options[d.product]&&/^ME-LOGO-[A-Z0-9-]{1,80}$/.test(d.id||'')&&options[d.product].sizes.includes(String(d.size))&&options[d.product].colors.includes(d.color)&&['text','image'].includes(d.kind)&&Number.isFinite(d.width)&&Number.isFinite(d.height)&&d.width>0&&d.width<=180&&d.height>0&&d.height<=160){
   const product=options[d.product],check=$('choose-'+d.product);if(check)check.checked=true;
   $('size-'+d.product).value='No. '+d.size;$('color-'+d.product).value=d.color;
   const detail=['Custom logo design: '+d.id,'Logo type: '+d.kind,d.kind==='text'?'Text: '+String(d.text||'').slice(0,40):'Image file: '+String(d.file||'').slice(0,200),d.font?'Font: '+String(d.font).slice(0,40):'',d.layout?'Layout: '+String(d.layout).slice(0,20):'','Preview logo size: '+d.width+' x '+d.height+' mm','Curve: '+Number(d.curve||0)+'%','Final print details: please confirm with the quote'].filter(Boolean).join('\n');
   $('customization').value='Logo';
   $('message').value='I would like a quote for this custom logo design.\n'+detail+'\nArtwork can be provided for review.';
  }
 }
}catch(e){}

const customers={coach:'Coach / trainer',academy:'Training academy',retailer:'Retail store',distributor:'Distributor / wholesaler',ecommerce:'E-commerce seller'};if(customers[q.get('customer')])$('customer_type').value=customers[q.get('customer')];
// Retail orders never offer logo printing. Customized logos are wholesale only.
const logoPolicyAvailable=typeof document.createElement==='function';
let customField,customPolicy,logoKind,logoCount;
if(logoPolicyAvailable){
const retailOption=document.createElement('option');retailOption.value='Retail purchase inquiry';retailOption.textContent='Retail purchase (shipping quote)';$('request_type').appendChild(retailOption);
if(type==='Retail purchase inquiry')$('request_type').value=type;
customField=$('customization').closest('.field');
customPolicy=document.createElement('div');customPolicy.id='customPolicy';customPolicy.style.cssText='margin:8px 0;font-size:13px;line-height:1.6';customField.appendChild(customPolicy);
logoKind=document.createElement('label');logoKind.id='logoKindBlock';logoKind.style.cssText='display:block;margin-top:10px';
logoKind.innerHTML='<span>Logo printing type (wholesale only)</span><select id="logoKind" style="display:block;width:100%;margin-top:5px"><option value="">Choose logo printing</option><option value="black">Single-color black logo — minimum 20 units</option><option value="color">Color logo — minimum 200 units</option></select>';
customField.appendChild(logoKind);
logoCount=document.createElement('label');logoCount.id='logoCountBlock';logoCount.style.cssText='display:block;margin-top:10px';
logoCount.innerHTML='<span>Exact quantity for logo customization</span><input id="logoQuantity" type="number" min="1" max="999999" step="1" inputmode="numeric" placeholder="Exact units" style="display:block;width:100%;margin-top:5px">';
customField.appendChild(logoCount);
const statusPolicy='Product prices exclude international freight and taxes. Orders dispatch from China. Shipping cost, available stock, delivery date and final total are confirmed before payment.';
const policyNote=document.createElement('p');policyNote.id='shippingPolicy';policyNote.textContent=statusPolicy;policyNote.style.cssText='font-size:13px;line-height:1.6;margin:10px 0';$('quoteFields').appendChild(policyNote);
const shippingRow=document.createElement('div');shippingRow.id='shippingQuoteFields';shippingRow.className='formgrid';
shippingRow.innerHTML='<div class="field"><label for="shippingMethod">Preferred shipping method</label><select id="shippingMethod"><option value="Recommend best option">Please recommend</option><option value="Air freight / express">Air freight / express</option><option value="Economy / sea freight">Economy / sea freight (if practical)</option></select></div><div class="field"><label for="quoteUnits">Exact quantity (units)</label><input id="quoteUnits" type="number" min="1" step="1" max="999999" placeholder="e.g. 2"></div>';
$('quoteFields').appendChild(shippingRow);
const incomingSize=q.get('size'),incomingProduct=q.get('product');
if(incomingProduct&&incomingSize){
 const matched=[...form.querySelectorAll('[name="products[]"]')].find(cb=>cb.value===incomingProduct);
 if(matched){matched.checked=true;const id=matched.closest('[data-product]').dataset.product;const sel=$('size-'+id);const option=[...sel.options].find(o=>o.value==='No. '+incomingSize);if(option)sel.value=option.value;}
}
if(type==='Retail purchase inquiry')$('estimated_quantity').value='1–2 samples';
}
function isLogo(){return ['Logo','Logo + packaging'].includes($('customization').value)}
function enforcePolicy(){
 if(!logoPolicyAvailable)return;
 const retail=$('request_type').value==='Retail purchase inquiry';
 $('shippingQuoteFields').hidden=!rules($('request_type').value).purchase;
 if(retail){$('customization').value='No customization';}
 customField.hidden=retail;
 customPolicy.textContent='Custom logo printing is offered on wholesale inquiries only. Black-only logos require 20+ units; color logos require 200+ units.';
 logoKind.hidden=retail||!isLogo();
 logoCount.hidden=retail||!isLogo();
 $('logoKind').required=!logoKind.hidden;
 $('logoQuantity').required=!logoCount.hidden;
}
let reference=null,busy=false,prepared='';
function sync(){enforcePolicy();const r=rules($('request_type').value);$('quoteFields').hidden=!r.purchase;$('quoteFields').querySelectorAll('input,select').forEach(el=>{el.disabled=!r.purchase;el.required=r.purchase});$('orderFields').hidden=!r.order;$('order_reference').disabled=!r.order;$('order_reference').required=r.order;$('message').required=r.message;$('messageRequired').hidden=!r.message;$('productHelp').textContent=r.purchase?'Select at least one product. Size and color choices appear below each selection.':'Select a product if relevant, or describe your question below.';form.querySelectorAll('.inquiryProduct').forEach(card=>{const selected=card.querySelector('[name="products[]"]').checked;card.classList.toggle('selected',selected);const opts=card.querySelector('.productOptions');opts.hidden=!selected;opts.querySelectorAll('select').forEach(el=>el.disabled=!selected)});$('productError').hidden=true}
function read(){const fd=new FormData(form),r=rules($('request_type').value),v=n=>String(fd.get(n)||'').trim();const products=[...form.querySelectorAll('[name="products[]"]:checked')].map(cb=>{const id=cb.closest('[data-product]').dataset.product;return cb.value+' — '+($('size-'+id).value||'size: please advise')+' / '+($('color-'+id).value||'color: please advise')}).join('\n');if(!reference)reference=core.reference();return {reference,requestType:v('request_type'),firstname:v('firstname'),email:v('email'),products,quantity:r.purchase?v('estimated_quantity'):'',country:r.purchase?v('country'):'',orderReference:r.order?v('order_reference'):'',company:v('company'),phone:v('phone'),customerType:v('customer_type'),zip:v('zip'),customization:v('customization')+(logoPolicyAvailable&&isLogo()?' | '+$('logoKind').value+' logo | exact units: '+$('logoQuantity').value:''),timing:v('order_timing'),message:v('message')+(logoPolicyAvailable&&rules($('request_type').value).purchase?'\nShipping method: '+$('shippingMethod').value+'\nExact requested units: '+($('quoteUnits').value||'Not specified')+'\nFreight, stock readiness, delivery timeline and final total subject to confirmation before payment.':'')}}
function review(d,hint){prepared=summary(d,core.context('MING EAGLE product / wholesale inquiry'));$('reviewContent').textContent=prepared;$('sendEmail').href='mailto:mingeaglecommerce@gmail.com?subject='+encodeURIComponent('MING EAGLE inquiry '+d.reference)+'&body='+encodeURIComponent(prepared);$('sendWhatsApp').href='https://wa.me/8613851585237?text='+encodeURIComponent(prepared);$('reviewHint').textContent=hint||'Choose email or WhatsApp and press Send in that app. Preparing this request does not submit it to MING EAGLE.';$('inquiryReview').hidden=false;$('inquiryReview').scrollIntoView({behavior:'smooth',block:'nearest'})}
form.addEventListener('change',()=>{sync();$('inquiryReview').hidden=true;$('formStatus').textContent=''});form.addEventListener('input',()=>{$('inquiryReview').hidden=true;$('formStatus').textContent=''});
let autoSampleQuantity=false;function syncSampleQuantity(){const el=$('estimated_quantity');if($('request_type').value==='Sample request'&&!el.value){el.value='1–2 samples';autoSampleQuantity=true}else if($('request_type').value!=='Sample request'&&autoSampleQuantity){if(el.value==='1–2 samples')el.value='';autoSampleQuantity=false}}$('estimated_quantity').addEventListener('change',()=>{autoSampleQuantity=false});$('request_type').addEventListener('change',syncSampleQuantity);syncSampleQuantity();sync();
$('submitInquiry').disabled=false;
if(c.enabled){$('submitInquiry').textContent='Send request';$('deliveryNote').textContent='Your request is submitted directly. Keep the confirmation reference for follow-up.'}
form.addEventListener('submit',async e=>{
 e.preventDefault();
 if(busy||!form.reportValidity())return;
 if(rules($('request_type').value).purchase&&!form.querySelector('[name="products[]"]:checked')){
  $('productError').hidden=false;$('choose-p1').focus();return
 }
 if(logoPolicyAvailable&&isLogo()){const minimum=$('logoKind').value==='color'?200:20,qty=Number($('logoQuantity').value);if(!Number.isInteger(qty)||qty<minimum){$('formStatus').textContent='Logo printing requires at least '+minimum+' units. Black logo: 20+; color logo: 200+.';$('logoQuantity').focus();return}}
 const d=read();
 if(!c.enabled){review(d);$('formStatus').textContent='Prepared. Please send it using email or WhatsApp below.';return}
 busy=true;$('submitInquiry').disabled=true;
 $('formStatus').textContent='Checking security verification…';
 const context=core.context('MING EAGLE product / wholesale inquiry');
 try{
  // First persist the lead, inquiry and follow-up task in our own CRM.
  // The browser must never hold an admin key.
  const challengeConfig=await challengeReady;
  if(challengeConfig.unavailable||(challengeConfig.enabled&&!challenge?.token())){
   throw new Error('CRM_CHALLENGE');
  }
  $('formStatus').textContent='Saving your request to MING EAGLE…';
  await sendCrmInquiry(c,d,context,undefined,challenge?challenge.token():'');
  // Preserve the existing HubSpot lead source on a best-effort basis.
  // A HubSpot outage cannot undo a successfully persisted CRM inquiry.
  try{await sendPayload(c,buildPayload(d,c,context),undefined,4500)}
  catch(mirrorError){console.warn('Optional HubSpot mirror did not complete',mirrorError)}
  const stored=core.saveReceipt(d,'inquiry');
  $('formStatus').textContent='Your request is saved. Reference: '+d.reference;
  if(stored)location.assign('thank-you.html?ref='+encodeURIComponent(d.reference));
  else{$('inquiryReview').hidden=true}
 }catch(crmError){
  // CAPTCHA rejected/missing/unavailable: never bypass it by automatically
  // posting to HubSpot. Show the existing manual email/WhatsApp alternatives.
  if(['CRM_CHALLENGE','CRM_VERIFICATION_UNAVAILABLE'].includes(crmError?.message)){
   challenge?.reset();
   const hint='Security verification is required or temporarily unavailable. Please complete the check or send your request directly by email or WhatsApp.';
   $('formStatus').textContent=hint;
   review(d,hint+' Remember to press Send in the email or WhatsApp app.');
   busy=false;$('submitInquiry').disabled=false;return;
  }
  challenge?.reset();
  // Cloudflare/D1 may be temporarily unavailable or over its free quota.
  // Keep HubSpot as the known working fallback rather than lose a buyer inquiry.
  try{
   await sendPayload(c,buildPayload(d,c,context));
   core.saveReceipt(d,'inquiry');
   $('formStatus').textContent='Your request was received by our backup form. Reference: '+d.reference+'. Our sales team will review it; synchronization to the customer management system has not yet been confirmed.';
   $('inquiryReview').hidden=true;
   $('submitInquiry').disabled=true; // Prevent another submission of the same request.
   return;
  }catch(backupError){
   const uncertain=crmError.message==='CRM_UNCERTAIN'||backupError.message==='UNCERTAIN';
   const hint=uncertain?'We could not confirm delivery to either service. Please contact us with this reference before resending.':'Your request could not be submitted automatically. Please send it using email or WhatsApp below.';
   $('formStatus').textContent=hint;
   review(d,hint+' You will need to press Send in the email or WhatsApp app.');
  }
 }finally{busy=false;if(!$('formStatus').textContent.includes('backup form'))$('submitInquiry').disabled=false}
});
$('copyInquiry').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(prepared);$('formStatus').textContent='Request copied. Paste it into your email or message.'}catch(e){$('formStatus').textContent='Select the request text above and copy it manually.'}});
})(typeof window==='undefined'?globalThis:window);
