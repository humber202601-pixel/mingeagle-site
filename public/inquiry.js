(function(root){
'use strict';
const TYPE_MAP={retail:'Retail purchase inquiry',quote:'Wholesale quote',sample:'Sample request',question:'General product question','order-support':'Order support','retail-partnership':'Retail partnership'};
function rules(type){return {purchase:['Wholesale quote','Sample request','Retail partnership','Retail purchase inquiry'].includes(type),order:type==='Order support',message:['General product question','Order support'].includes(type)}}
function procurementDetails(formData,requestType){
 if(requestType!=='Wholesale quote')return '';
 const value=name=>String(formData.get(name)||'').trim();
 const parts=[
  ['RFQ / purchasing reference',value('buyer_rfq_reference').slice(0,100)],
  ['Purchasing process',value('procurement_process').slice(0,100)],
  ['Documents / vendor onboarding requirements',value('procurement_documents').slice(0,400)],
 ].filter(([,entry])=>entry);
 const newline=String.fromCharCode(10);
 return parts.length?newline+'Institutional procurement requirements (buyer supplied; subject to confirmation):'+newline+parts.map(([label,entry])=>label+': '+entry).join(newline):'';
}
function summary(d,ctx){const lines=['MING EAGLE inquiry','Reference: '+d.reference,'Request: '+d.requestType,'Name: '+d.firstname,'Email: '+d.email];[['Products',d.products],['Quantity',d.quantity],['Destination',d.country],['US state',d.state],['Order / quote reference',d.orderReference],['Company',d.company],['Phone / WhatsApp',d.phone],['Customer type',d.customerType],['Postal code',d.zip],['Customization',d.customization],['Timing',d.timing],['Message',d.message]].forEach(([k,v])=>{if(v&&v!=='Not specified')lines.push(k+': '+v)});lines.push('Privacy: agreed to use these details to respond to this request.');if(ctx)lines.push(core.sourceLines(ctx));return lines.join('\n')}
const core=typeof module!=='undefined'&&module.exports?require('./forms-core.js'):root.MingEagleForms;
const {buildPayload,sendPayload,sendCrmInquiry}=core||{};
if(typeof module!=='undefined'&&module.exports){module.exports={rules,summary,procurementDetails,buildPayload,sendPayload};return}
if(!core)return;
const form=document.querySelector('#quoteForm');if(!form)return;
const challenge=root.MingEagleTurnstile;
const challengeReady=challenge?challenge.start():Promise.resolve({enabled:false,unavailable:false});
const $=id=>document.getElementById(id),c=root.MINGEAGLE_INQUIRY_CONFIG||{enabled:false},q=new URLSearchParams(location.search);
const type=TYPE_MAP[(q.get('type')||'').toLowerCase()];if(type)$('request_type').value=type;
// Prefill only non-sensitive product/quantity/ZIP details explicitly reviewed by the visitor.
const assistantQuestion=(q.get('assistant_question')||'').slice(0,300);
if(assistantQuestion&&$('message')&&!$('message').value){$('message').value='Question from automated website assistant (please review before submitting): '+assistantQuestion;}
const assistantSummary=(q.get('assistant_summary')||'').slice(0,350);
// Mark assisted inquiries only after a visitor explicitly submits the completed form.
const assistedInquiry=!!(assistantQuestion||assistantSummary);

if(assistantSummary&&/^((Product|Size|Quantity|Destination postal code|Destination ZIP): [A-Za-z0-9 .-]+)(; (Product|Size|Quantity|Destination postal code|Destination ZIP): [A-Za-z0-9 .-]+)*$/.test(assistantSummary)){
 const message=$('message');if(message&&!message.value.includes(assistantSummary))message.value=[message.value,'Information collected by the automated website assistant (please confirm): '+assistantSummary].filter(Boolean).join('\n\n').slice(0,message.maxLength>0?message.maxLength:4000);
 const postal=assistantSummary.match(/Destination (?:postal code|ZIP): ([A-Za-z0-9 -]{3,12})/i);if(postal&&$('zip'))$('zip').value=postal[1].trim();
 const units=assistantSummary.match(/Quantity: (\d{1,5}) units/);const qty=document.querySelector('[name="quantity"]');if(units&&qty&&!qty.value)qty.value=units[1];
 if(units&&$('estimated_quantity')){const count=Number(units[1]);const tier=count<=2?'1–2 samples':count<=49?'3–49 units':count<=99?'50–99 units':count<=499?'100–499 units':count<=999?'500–999 units':'1,000+ units';$('estimated_quantity').value=tier;}
 const product=assistantSummary.match(/Product: ([A-Za-z -]+)/);if(product)form.querySelectorAll('[name="products[]"]').forEach(cb=>{if(cb.value===product[1].trim())cb.checked=true});
 const size=assistantSummary.match(/Size: No\. ([34567])/);if(size&&product){form.querySelectorAll('[name="products[]"]').forEach(cb=>{if(cb.value===product[1].trim()){const pid=cb.closest('[data-product]')?.dataset.product;const sel=pid&&$('size-'+pid);if(sel&&[...sel.options].some(o=>o.value==='No. '+size[1]))sel.value='No. '+size[1];}});}
}

form.querySelectorAll('[name="products[]"]').forEach(cb=>{if(cb.value===q.get('product'))cb.checked=true});
if((q.get('type')==='retail'||q.get('type')==='quote')&&q.get('cart')){
 const raw=String(q.get('cart')||'');
 const matches=raw.length<=800?raw.split(', ').slice(0,11)
  .map(item=>/^(P1-S[357]|P2-S[357]|P3-S[3467]|P4-S5) [x×] (\d{1,5})$/.exec(item))
  .filter(Boolean):[];
 const chosen=new Map();
 for(const match of matches){
  const qty=Number(match[2]);
  if(Number.isSafeInteger(qty)&&qty>=1&&qty<=10000)
   chosen.set(match[1],(chosen.get(match[1])||0)+qty);
 }
 const totalUnits=[...chosen.values()].reduce((sum,n)=>sum+n,0);
 const iso=String(q.get('cart_country')||'').toUpperCase();
 const country=/^[A-Z]{2}$/.test(iso)?iso:'';
 const mode=q.get('cart_method')==='sea'?'Sea freight':'Air parcel';
 const lines=[...chosen].map(([sku,units])=>sku+' x '+units);
 const colors={
  P1:['Orange','Blue','Green','Yellow'],P2:['Orange','Green'],
  P3:['Orange','Brown','Black','Aqua Blue'],
  P4:['Black/White','Black/Green','Black/Red','Yellow/Green','Black/Gold']
 };
 const optionsText=String(q.get('cart_options')||'');
 const details=[];const optionCounts=new Map();
 if(optionsText.length<=2200){
  for(const part of optionsText.split('; ').filter(Boolean).slice(0,55)){
   const match=/^(P1-S[357]|P2-S[357]|P3-S[3467]|P4-S5) \| (.{1,25}) \| (\d{1,5})$/.exec(part);
   if(!match||!colors[match[1].slice(0,2)]?.includes(match[2]))continue;
   const n=Number(match[3]);if(!Number.isSafeInteger(n)||n<1||n>10000)continue;
   optionCounts.set(match[1],(optionCounts.get(match[1])||0)+n);
   details.push(match[1]+' / '+match[2]+' x '+n);
  }
 }
 const optionsMatch=chosen.size>0&&chosen.size===optionCounts.size&&
  [...chosen].every(([sku,n])=>n===optionCounts.get(sku));
 // The customer-provided totals/variant details are descriptive only. The
 // server will verify SKU prices and freight before preparing any quote.
 const summary=[mode==='Sea freight'?'Wholesale quote request (NOT AN ORDER / NOT PAID)':'Retail cart order request (NOT PAID)',
  'Products: '+lines.join(', '),
  optionsMatch?'Selected variants (customer supplied): '+details.join('; '):
   'Selected colors: confirmation required',
  'Total items: '+totalUnits,
  'Destination country: '+country,
  'Preferred shipping: '+mode,
  ...(mode==='Sea freight'
   ? ['Wholesale price, supplier cartons and ocean DDP freight: written quotation required (not calculated).']
   : ['Retail air-shipping estimate: refer to the actual carrier and tax review before payment.']),
  'Final item prices, colors, freight, taxes and availability must be confirmed before payment.'
 ].join('\n');
 if(totalUnits>0&&totalUnits<=10000&&country&&lines.length&&
    ((totalUnits<10&&mode==='Air parcel')||(totalUnits>=10&&mode==='Sea freight'))){
  if($('message'))$('message').value=summary.slice(0,3900);
  if($('country'))$('country').value=country;
  for(const sku of chosen.keys()){
   const id='p'+sku[1],check=$('choose-'+id),size=$('size-'+id);
   if(check)check.checked=true;
   const number=sku.slice(-1);
   if(size&&[...size.options].some(o=>o.value==='No. '+number))size.value='No. '+number;
  }
  const selector=$('estimated_quantity');
  const tier=totalUnits<=2?'1–2 samples':totalUnits<=49?'3–49 units':
   totalUnits<=99?'50–99 units':totalUnits<=499?'100–499 units':
   totalUnits<=999?'500–999 units':'1,000+ units';
  if(selector)selector.value=tier;
  window.__mingEagleCartOrder={lines,country,mode,totalUnits};
 }
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

// Strictly validate combined wholesale RFQ lines against the existing official choices.
let wholesaleRfqLines=[],wholesalePrefillUnits=0;
try {
 const raw=q.get('rfq');
 if(raw&&raw.length<=7000&&q.get('type')==='quote'){
  const selected=JSON.parse(raw);
  const cards=[...form.querySelectorAll('[name="products[]"]')];
  if(Array.isArray(selected)&&selected.length>=1&&selected.length<=20){
   const prepared=[];
   for(const item of selected){
    if(!Number.isInteger(item.id)||item.id<0||item.id>=cards.length||!Number.isSafeInteger(item.quantity)||item.quantity<1||item.quantity>999999)throw Error('Invalid RFQ line');
    const cb=cards[item.id],pid=cb.closest('[data-product]').dataset.product;
    const size=$('size-'+pid),color=$('color-'+pid);
    if(![...size.options].some(o=>o.value==='No. '+item.size)||![...color.options].some(o=>o.value===item.color))throw Error('Invalid variant');
    prepared.push({cb,size,color,sizeValue:'No. '+item.size,colorValue:item.color,quantity:item.quantity});
   }
   for(const x of prepared){x.cb.checked=true;x.size.value=x.sizeValue;x.color.value=x.colorValue;}
   wholesaleRfqLines=prepared.map(x=>x.cb.value+' | '+x.sizeValue+' | '+x.colorValue+' | '+x.quantity+' units');
   const total=prepared.reduce((a,x)=>a+x.quantity,0);
   if(!Number.isSafeInteger(total)||total>9999999)throw Error('RFQ quantity limit exceeded');
   wholesalePrefillUnits=total;
   const tier=total<=2?'1–2 samples':total<=49?'3–49 units':total<=99?'50–99 units':total<=499?'100–499 units':total<=999?'500–999 units':'1,000+ units';
   if($('estimated_quantity'))$('estimated_quantity').value=tier;
   if($('quoteUnits'))$('quoteUnits').value=String(total);
  }
 }
}catch(e){wholesaleRfqLines=[];wholesalePrefillUnits=0}
const customers={school:'School / club',district:'School district / education authority',government:'Government / public agency',public:'Government / public agency',business:'Business / corporate procurement',nonprofit:'Nonprofit / community organization',coach:'Coach / trainer',academy:'Training academy',retailer:'Retail store',distributor:'Distributor / wholesaler',ecommerce:'E-commerce seller'};if(customers[q.get('customer')])$('customer_type').value=customers[q.get('customer')];
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
const statusPolicy='Product prices exclude freight and taxes. Orders dispatch from China. For US wholesale sea quotes, import customs clearance and duties are confirmed as part of the written DDP freight terms when applicable; US state/local sales tax, if applicable, is handled separately. Freight, stock readiness, delivery date and final total are confirmed before payment.';
const policyNote=document.createElement('p');policyNote.id='shippingPolicy';policyNote.textContent=statusPolicy;policyNote.style.cssText='font-size:13px;line-height:1.6;margin:10px 0';$('quoteFields').appendChild(policyNote);
const shippingRow=document.createElement('div');shippingRow.id='shippingQuoteFields';shippingRow.className='formgrid';
shippingRow.innerHTML='<div class="field"><label for="shippingMethod">Preferred shipping method</label><select id="shippingMethod"><option value="Recommend best option">Please recommend</option><option value="Air freight / express">Air freight / express</option><option value="Economy / sea freight">Economy / sea freight (if practical)</option></select></div><div class="field"><label for="quoteUnits">Exact quantity (units)</label><input id="quoteUnits" type="number" min="1" step="1" max="999999" placeholder="e.g. 2"></div>';
$('quoteFields').appendChild(shippingRow);
const wholesaleMinimumNotice=document.createElement('p');
wholesaleMinimumNotice.id='wholesaleMinimumNotice';
wholesaleMinimumNotice.className='fieldHelp';
wholesaleMinimumNotice.style.gridColumn='1 / -1';
wholesaleMinimumNotice.textContent='Wholesale pricing starts at 10 units. For 1–9 units, use Sample request or Retail purchase inquiry for an air-shipped evaluation order.';
$('quoteFields').appendChild(wholesaleMinimumNotice);
const plannerValid=q.get('buyer_plan')==='sea_accepted'&&q.get('type')==='quote'&&
 wholesalePrefillUnits>=10&&wholesalePrefillUnits<=10000;
if(plannerValid){
 const code=String(q.get('buyer_country')||'').toUpperCase();
 const postal=String(q.get('buyer_postal')||'');
 if(/^[A-Z]{2}$/.test(code)&&$('country'))$('country').value=code;
 if(/^[A-Za-z0-9][A-Za-z0-9 -]{0,18}$/.test(postal)&&$('zip'))$('zip').value=postal;
 if($('quoteUnits'))$('quoteUnits').value=String(wholesalePrefillUnits);
 if($('shippingMethod'))$('shippingMethod').value='Economy / sea freight';
 const note=document.createElement('p');note.id='buyerPlannerReview';
 note.textContent='Your wholesale configuration is preselected. Review the product, quantity and destination before submitting. Sea freight was acknowledged in the planner; US arrival 25–30 days after dispatch is only an estimate.';
 note.style.cssText='padding:13px;margin:12px 0;background:#f5f8fb;border-left:3px solid #bb5e2b;font-size:13px;line-height:1.55';
 $('quoteFields').appendChild(note);
}
const incomingSize=q.get('size'),incomingProduct=q.get('product');
if(incomingProduct&&incomingSize){
 const matched=[...form.querySelectorAll('[name="products[]"]')].find(cb=>cb.value===incomingProduct);
 if(matched){matched.checked=true;const id=matched.closest('[data-product]').dataset.product;const sel=$('size-'+id);const option=[...sel.options].find(o=>o.value==='No. '+incomingSize);if(option)sel.value=option.value;}
}
// Catalog links may provide a verified product choice, size, color and quantity.
if(incomingProduct){
 const selected=[...form.querySelectorAll('[name="products[]"]')].find(cb=>cb.value===incomingProduct);
 if(selected){
  const pid=selected.closest('[data-product]').dataset.product;
  const color=q.get('color'),units=q.get('units');
  if(color){const dropdown=$('color-'+pid);if(dropdown&&[...dropdown.options].some(o=>o.value===color))dropdown.value=color;}
  if(units&&/^[1-9]\\d{0,5}$/.test(units)){
   const qty=Number(units),tier=qty<=2?'1–2 samples':qty<=49?'3–49 units':qty<=99?'50–99 units':qty<=499?'100–499 units':qty<=999?'500–999 units':'1,000+ units';
   if($('estimated_quantity'))$('estimated_quantity').value=tier;
   if($('quoteUnits'))$('quoteUnits').value=String(qty);
  }
 }
}
if(type==='Retail purchase inquiry'&&!window.__mingEagleCartOrder)$('estimated_quantity').value='1–2 samples';
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
function sync(){enforcePolicy();const minimumNotice=$('wholesaleMinimumNotice');if(minimumNotice)minimumNotice.hidden=$('request_type').value!=='Wholesale quote';const r=rules($('request_type').value);const inst=$('institutionalFields');if(inst){const enabled=$('request_type').value==='Wholesale quote';inst.hidden=!enabled;inst.querySelectorAll('input,select,textarea').forEach(el=>{el.disabled=!enabled});}$('quoteFields').hidden=!r.purchase;$('quoteFields').querySelectorAll('input,select').forEach(el=>{el.disabled=!r.purchase;el.required=r.purchase});$('orderFields').hidden=!r.order;$('order_reference').disabled=!r.order;$('order_reference').required=r.order;$('message').required=r.message;$('messageRequired').hidden=!r.message;$('productHelp').textContent=r.purchase?'Select at least one product. Size and color choices appear below each selection.':'Select a product if relevant, or describe your question below.';form.querySelectorAll('.inquiryProduct').forEach(card=>{const selected=card.querySelector('[name="products[]"]').checked;card.classList.toggle('selected',selected);const opts=card.querySelector('.productOptions');opts.hidden=!selected;opts.querySelectorAll('select').forEach(el=>el.disabled=!selected)});$('productError').hidden=true;syncUSStateRequirement()}
const US_STATE_CODES=new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '));
function isUnitedStatesCountry(value){const normalized=String(value||'').toUpperCase().replace(/[.,]/g,'').replace(/\s+/g,' ').trim();return ['US','USA','UNITED STATES','UNITED STATES OF AMERICA'].includes(normalized)}
function syncUSStateRequirement(){const field=$('state'),country=$('country'),hint=$('stateHint');if(!field||!country)return;const required=$('request_type').value==='Wholesale quote'&&isUnitedStatesCountry(country.value);field.required=required;field.setCustomValidity?.('');if(required){const value=String(field.value||'').trim().toUpperCase();if(!value)field.setCustomValidity?.('Enter the two-letter US delivery state code.');else if(!US_STATE_CODES.has(value))field.setCustomValidity?.('Enter a valid two-letter US state or DC code.');if(hint)hint.textContent='Required for US wholesale quotes. Enter the destination state; the seller will still review freight and tax.'}else if(hint)hint.textContent='Optional for non-US requests and sample inquiries; required for US wholesale quotes.'}
// Navigation context comes from an explicit on-site video-to-product link.
// It is not evidence of playback, watch duration, creator attribution or purchase.
function creatorVideoContext(){
 try{
  const raw=sessionStorage.getItem('mingeagle_video_to_product_v1');
  if(!raw)return '';
  const item=JSON.parse(raw);
  const age=Date.now()-item.at;
  if(!Number.isFinite(age)||age<0||age>30*60*1000)return '';
  if(!/^V0(?:0[1-9]|1[0-6])$/.test(item.code||''))return '';
  const chosen=[...form.querySelectorAll('[name="products[]"]:checked')];
  if(!chosen.some(el=>el.closest('[data-product]')?.dataset.product==='p1'))return '';
  return item.code;
 }catch{return ''}
}
function clearCreatorContext(){try{sessionStorage.removeItem('mingeagle_video_to_product_v1')}catch{}}
function read(){const fd=new FormData(form),r=rules($('request_type').value),v=n=>String(fd.get(n)||'').trim();const products=[...form.querySelectorAll('[name="products[]"]:checked')].map(cb=>{const id=cb.closest('[data-product]').dataset.product;return cb.value+' — '+($('size-'+id).value||'size: please advise')+' / '+($('color-'+id).value||'color: please advise')}).join('\n');if(!reference)reference=core.reference();const creatorVideoCode=creatorVideoContext();return {reference,creatorVideoCode,requestType:v('request_type'),firstname:v('firstname'),email:v('email'),products,quantity:r.purchase?core.inquiryQuantity(v('estimated_quantity'),$('quoteUnits')?.value,v('request_type')):'',country:r.purchase?v('country'):'',state:r.purchase?v('state').toUpperCase():'',orderReference:r.order?v('order_reference'):'',company:v('company'),phone:v('phone'),customerType:v('customer_type'),zip:v('zip'),customization:v('customization')+(logoPolicyAvailable&&isLogo()?' | '+$('logoKind').value+' logo | exact units: '+$('logoQuantity').value:''),timing:v('order_timing'),message:v('message')+procurementDetails(fd,v('request_type'))+(assistantSummary&&!v('message').includes(assistantSummary)?'\nAI-assisted RFQ details (customer-reviewed): '+assistantSummary:'')+(assistedInquiry?'\nInquiry origin: Website AI sales assistant (customer-reviewed handoff).':'')+(wholesaleRfqLines.length?'\nCombined wholesale RFQ (customer-selected; not a final price):\n'+wholesaleRfqLines.join('\n'):'')+(q.get('buyer_plan')==='sea_accepted'&&wholesalePrefillUnits>=10?'\nSea-freight quote planner: visitor acknowledged sea transport estimates before this inquiry; US arrival is estimated 25–30 days after dispatch, not guaranteed. Written terms are required.':'')+(creatorVideoCode?'\nOn-site creator video-to-product link: '+creatorVideoCode+' (browser navigation hint, not proof of playback or sale).':'')+(logoPolicyAvailable&&rules($('request_type').value).purchase?'\nShipping method: '+$('shippingMethod').value+'\nSelected quantity range: '+(v('estimated_quantity')||'Not specified')+'\nExact requested units: '+($('quoteUnits').value||'Not specified')+'\nFreight, stock readiness, delivery timeline and final total subject to confirmation before payment.':'')}}
function review(d,hint){prepared=summary(d,core.context('MING EAGLE product / wholesale inquiry'));$('reviewContent').textContent=prepared;$('sendEmail').href='mailto:mingeaglecommerce@gmail.com?subject='+encodeURIComponent('MING EAGLE inquiry '+d.reference)+'&body='+encodeURIComponent(prepared);$('sendWhatsApp').href='https://wa.me/8613851585237?text='+encodeURIComponent(prepared);$('reviewHint').textContent=hint||'Choose email or WhatsApp and press Send in that app. Preparing this request does not submit it to MING EAGLE.';$('inquiryReview').hidden=false;$('inquiryReview').scrollIntoView({behavior:'smooth',block:'nearest'})}
form.addEventListener('change',()=>{sync();$('inquiryReview').hidden=true;$('formStatus').textContent=''});form.addEventListener('input',()=>{syncUSStateRequirement();$('inquiryReview').hidden=true;$('formStatus').textContent=''});
let autoSampleQuantity=false;function syncSampleQuantity(){const el=$('estimated_quantity');if($('request_type').value==='Sample request'&&!el.value){el.value='1–2 samples';autoSampleQuantity=true}else if($('request_type').value!=='Sample request'&&autoSampleQuantity){if(el.value==='1–2 samples')el.value='';autoSampleQuantity=false}}$('estimated_quantity').addEventListener('change',()=>{autoSampleQuantity=false});$('request_type').addEventListener('change',syncSampleQuantity);syncSampleQuantity();sync();
if(window.__mingEagleCartOrder){const order=window.__mingEagleCartOrder;if($('quoteUnits'))$('quoteUnits').value=String(order.totalUnits);if($('shippingMethod'))$('shippingMethod').value=order.mode==='Sea freight'?'Economy / sea freight':'Air freight / express';}
$('submitInquiry').disabled=false;
if(c.enabled){$('submitInquiry').textContent='Send request';$('deliveryNote').textContent='Your request is submitted directly. Keep the confirmation reference for follow-up.'}
form.addEventListener('submit',async e=>{
 e.preventDefault();
 syncUSStateRequirement();
 if(busy||!form.reportValidity())return;
 if(rules($('request_type').value).purchase&&!form.querySelector('[name="products[]"]:checked')){
  $('productError').hidden=false;$('choose-p1').focus();return
 }
 if($('request_type').value==='Wholesale quote'){
  const exactWholesaleUnits=Number($('quoteUnits')?.value);
  if(!Number.isSafeInteger(exactWholesaleUnits)||exactWholesaleUnits<10){
   $('formStatus').textContent='Wholesale quotes start at 10 units. For 1–9 units, select Sample request or Retail purchase inquiry.';
   $('quoteUnits')?.focus();
   return;
  }
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
  // Only count an explicitly accepted CRM inquiry, without personal fields.
  if(root.MingEagleGA4?.trackConfirmedLead)root.MingEagleGA4.trackConfirmedLead(d.requestType,'primary_crm');
  clearCreatorContext();
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
  // Do not bypass a definitive CRM rejection (429/rate limit, validation or
  // authorization failure) by writing to HubSpot directly. Manual contact is
  // available even when automatic submission is declined.
  if(!core.shouldUseBackupForCrmError(crmError)){
   const rateLimited=crmError?.message==='CRM_RATE_LIMIT';
   const hint=rateLimited?'Our inquiry service is receiving too many requests. Please contact sales directly by email or WhatsApp with this reference.':'The request was not accepted by our inquiry system. Please review the details or contact sales by email or WhatsApp.';
   $('formStatus').textContent=hint;
   review(d,hint+' Press Send in your email or WhatsApp app to contact us.');
   return;
  }
  // Cloudflare/D1 may be unavailable. Only then keep HubSpot as a backup
  // channel. We cannot claim the primary CRM accepted this request.
  try{
   await sendPayload(c,buildPayload(d,c,context));
   // Backup provider accepted the request; primary CRM status remains unconfirmed.
   if(root.MingEagleGA4?.trackConfirmedLead)root.MingEagleGA4.trackConfirmedLead(d.requestType,'backup_form');
   clearCreatorContext();
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
