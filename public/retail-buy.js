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
  price.textContent='Product price: '+(unit===null?'Unavailable':format(unit))+' USD / item';
  const n=Number(quantity.value);
  note.textContent=n===1?'US one-item air parcel price shown in the comparison below; shipping and taxes are checked in the cart.':
   n>=10?'10+ total units: sea-freight wholesale quote required; discounts are confirmed by sales.':
   '2–9 units: combined air shipping will be calculated in the cart.';
 }
 for(const el of [size.field,color.field,quantity])el.addEventListener('change',update);
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
if(cards.length||productId){
 const float=document.createElement('a');float.href='retail-cart.html';float.className='retailCartFloating';
 float.setAttribute('aria-label','Go to shopping cart');
 const label=document.createElement('span');label.textContent='🛒 View cart · ';
 const count=document.createElement('strong');count.textContent='0';
 float.append(label,count);document.body.appendChild(float);links.push(count);refreshCount();
 window.addEventListener('storage',refreshCount);
}
})();
