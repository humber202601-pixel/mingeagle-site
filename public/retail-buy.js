(function(){'use strict';
// Shared retail selectors for the home catalog and four product pages.
// Prices are the already-approved USD item prices exposed by MingEagleCart.
// Product colors do not change SKU pricing; their selection is saved separately.
const store=window.MingEagleCart;
if(!store){console.error('Retail cart storage unavailable: retail-cart.js must load first');return}
const products={
 p1:{name:'Flocked Silent Basketball Set',sizes:['3','5','7'],colors:['Orange','Blue','Green','Yellow']},
 p2:{name:'Fabric-Cover Silent Basketball Set',sizes:['3','5','7'],colors:['Orange','Green']},
 p3:{name:'Weighted Flocked Silent Basketball',sizes:['3','4','6','7'],colors:['Orange','Brown','Black','Aqua Blue']},
 p4:{name:'Flocked Silent Soccer Ball',sizes:['5'],colors:['Black/White','Black/Green','Black/Red','Yellow/Green','Black/Gold']}
};
const DIRECT_CHECKOUT_SKUS=new Set(['P1-S3','P1-S7']);
const detailPages={
 'silent-basketball.html':'p1','fabric-silent-basketball.html':'p2',
 'weighted-flocked-basketball.html':'p3','silent-soccer.html':'p4'
};
const format=n=>'$'+Number(n).toFixed(2);
const qtyOf=()=>store.read().reduce((n,x)=>n+x.quantity,0);
const links=[];
function refreshCount(){
 const count=qtyOf();
 for(const countNode of links)countNode.textContent=String(count);
}
function select(label,options){
 const wrap=document.createElement('label');
 wrap.className='retailBuyField';
 const text=document.createElement('span');text.textContent=label;
 const field=document.createElement('select');
 field.setAttribute('aria-label',label);
 for(const value of options){
  const option=document.createElement('option');option.value=value;option.textContent=value;field.add(option);
 }
 wrap.append(text,field);
 return {wrap,field};
}
function picker(id,variant){
 const product=products[id],box=document.createElement('section');
 box.className='retailBuyPicker';
 box.dataset.product=id;box.id=variant==='detail'?'buy-now':'buy-'+id;
 const eyebrow=document.createElement('p');
 eyebrow.className='retailBuyEyebrow';eyebrow.textContent='SHOP RETAIL · MIX & MATCH';
 const title=document.createElement('h3');
 title.textContent='Choose your ball';title.className='retailBuyTitle';
 const size=select('Ball size',product.sizes.map(v=>'No. '+v));
 const color=select('Color',product.colors);
 const amount=document.createElement('label');amount.className='retailBuyField';
 const amountLabel=document.createElement('span');amountLabel.textContent='Quantity';
 const quantity=document.createElement('input');
 quantity.type='number';quantity.min='1';quantity.max='10000';quantity.step='1';
 quantity.value='1';quantity.inputMode='numeric';quantity.setAttribute('aria-label','Quantity');
 amount.append(amountLabel,quantity);
 const fields=document.createElement('div');fields.className='retailBuyFields';
 fields.append(size.wrap,color.wrap,amount);
 const price=document.createElement('p');price.className='retailBuyPrice';
 const note=document.createElement('p');note.className='retailBuyNote';
 const action=document.createElement('div');action.className='retailBuyActions';
 const add=document.createElement('button');add.type='button';
 add.className='retailBuyAdd';add.textContent='Add to cart';
 const cartLink=document.createElement('a');cartLink.href='retail-cart.html';
 cartLink.className='retailBuyView';cartLink.textContent='View cart →';
 action.append(add,cartLink);
 const status=document.createElement('p');status.className='retailBuyStatus';
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 function update(){
  const selected=size.field.value.replace('No. ','');
  const sku=id.toUpperCase()+'-S'+selected,unit=store.unitPrice(sku);
  const directSku=DIRECT_CHECKOUT_SKUS.has(sku);
  const n=Number(quantity.value);
  const validQuantity=Number.isSafeInteger(n)&&n>=1&&n<=10000;
  const projectedTotal=validQuantity?qtyOf()+n:NaN;
  const wholesaleQty=validQuantity&&projectedTotal>=10;
  const retailEligible=directSku&&validQuantity&&projectedTotal<=9;
  eyebrow.textContent=!validQuantity?'CHOOSE A VALID QUANTITY':
   wholesaleQty?'WHOLESALE · 10+ UNITS':
   retailEligible?'SHOP RETAIL · 1–9 ELIGIBLE UNITS':'QUOTE PATH · DELIVERY CONFIRMATION';
  add.textContent=wholesaleQty?'Add to quote cart':retailEligible?'Add to cart':'Add to quote cart';
  price.textContent='Product price: '+(unit===null?'Unavailable':format(unit))+' USD / item';
  note.textContent=!validQuantity?'Enter a whole number of items between 1 and 10,000.':
   wholesaleQty?'Your cart would contain '+projectedTotal+' units. 10+ items require a sea-freight wholesale quote; estimated delivery is 25–30 days after dispatch.':
   !directSku?'This size is not eligible for direct card checkout. Add it to the cart to request a confirmed delivered-price quote.':
   projectedTotal===1?'US one-item air parcel price is confirmed in the cart; final sales tax is shown before payment.':
   'Your cart would contain '+projectedTotal+' eligible units. Each set ships separately and confirmed per-unit freight is added in the cart.';
 }
 for(const el of [size.field,color.field])el.addEventListener('change',update);
 quantity.addEventListener('input',update);
 quantity.addEventListener('change',update);
 const requestedSize=new URL(window.location.href).searchParams.get('size');
 if(variant==='detail'&&product.sizes.includes(requestedSize)){
  size.field.value='No. '+requestedSize;
 }
 add.addEventListener('click',()=>{
  const n=Number(quantity.value);
  if(!Number.isSafeInteger(n)||n<1||n>10000){
   status.textContent='Enter a whole number of items between 1 and 10,000.';
   quantity.focus();return;
  }
  const sku=id.toUpperCase()+'-S'+size.field.value.replace('No. ','');
  const answer=store.add(sku,n,color.field.value);
  if(!answer?.ok){status.textContent=answer?.error||'Unable to save your selection.';return}
  status.textContent=n+' × '+product.name+' · '+size.field.value+' · '+color.field.value+
   ' added. Your cart now has '+answer.count+' item(s).';
  refreshCount();
 });
 box.append(eyebrow,title,fields,price,note,action,status);
 update();return box;
}
const cards=[...document.querySelectorAll('.pcard')];
for(const card of cards){
 const title=card.querySelector('[data-i18n$=".title"]');
 const match=title?.getAttribute('data-i18n')?.match(/^(p[1-4])\.title$/);
 if(!match)continue;
 const body=card.querySelector('.pbody'),more=body?.querySelector('a.more');
 if(body&&!body.querySelector('.retailBuyPicker')){
  const ui=picker(match[1],'card');
  if(more)body.insertBefore(ui,more);else body.appendChild(ui);
 }
}
const filename=window.location.pathname.split('/').pop()||'index.html';
const productId=detailPages[filename],hero=document.querySelector('.productHero .productHeroGrid');
if(productId&&hero&&!document.querySelector('.productHero .retailBuyPicker')){
 const area=hero.firstElementChild;
 if(area)area.appendChild(picker(productId,'detail'));
}
if(productId==='p1'){
 const demo=new URL(window.location.href).searchParams.get('demo');
 // A navigation hint from the first-party creator wall, not a video-view event.
 if(/^V0(?:0[1-9]|1[0-6])$/.test(demo||'')){
  try{window.sessionStorage.setItem('mingeagle_video_to_product_v1',
   JSON.stringify({code:demo,at:Date.now()}))}catch{}
  const pickerArea=document.querySelector('.productHero .retailBuyPicker');
  if(pickerArea){
   const hint=document.createElement('p');
   hint.className='retailBuyNote';
   hint.textContent='Arrived from on-site creator clip '+demo+'. The creator clip shows this flocked set only; playback and purchase are not recorded by this link.';
   pickerArea.appendChild(hint);
  }
 }
}
// Hash anchors from the USA delivered-price table target dynamically
// inserted selectors. Scroll only after the selector exists in the DOM.
const anchor=window.location.hash?.slice(1)||'';
if(/^buy-(?:now|p[1-4])$/.test(anchor)){
 const target=document.getElementById(anchor);
 if(target&&typeof window.requestAnimationFrame==='function'){
  window.requestAnimationFrame(()=>target.scrollIntoView({block:'center'}));
 }
}
if(cards.length||productId){
 const float=document.createElement('a');float.href='retail-cart.html';float.className='retailCartFloating';
 float.setAttribute('aria-label','Go to shopping cart');
 const label=document.createElement('span');label.textContent='🛒 View cart · ';
 const count=document.createElement('strong');count.textContent='0';
 float.append(label,count);document.body.appendChild(float);links.push(count);refreshCount();
 window.addEventListener('storage',refreshCount);
}
})();
