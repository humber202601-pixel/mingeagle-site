/* A buyer-initiated planner: no email is sent and no data leaves the
   browser until the customer submits the existing secured inquiry form. */
(function(){
 'use strict';
 const models={
  p1:{name:'Flocked Silent Basketball + Mini Hoop Set',sizes:['3','5','7'],colors:['Orange','Blue','Green','Yellow']},
  p2:{name:'Fabric-Cover Silent Basketball + Mini Hoop Set',sizes:['3','5','7'],colors:['Orange','Green']},
  p3:{name:'Weighted Flocked Silent Basketball',sizes:['3','4','6','7'],colors:['Orange','Brown','Black','Aqua Blue']},
  p4:{name:'Flocked Silent Soccer Ball',sizes:['5'],colors:['Black/White','Black/Green','Black/Red','Yellow/Green','Black/Gold']}
 };
 const $=id=>document.getElementById(id);
 const select=(target,values,display)=>{
  target.replaceChildren();
  for(const value of values){
   const option=document.createElement('option');
   option.value=value;
   option.textContent=display?display(value):value;
   target.appendChild(option);
  }
 };
 const roots=[...document.querySelectorAll('[data-b2b-quote-planner]')];
 for(const root of roots){
  const form=root.querySelector('form'),model=root.querySelector('[name="buyerModel"]'),
   size=root.querySelector('[name="buyerSize"]'),color=root.querySelector('[name="buyerColor"]'),
   quantity=root.querySelector('[name="buyerQuantity"]'),role=root.querySelector('[name="buyerRole"]'),
   country=root.querySelector('[name="buyerCountry"]'),zip=root.querySelector('[name="buyerPostal"]'),
   consent=root.querySelector('[name="buyerSeaConsent"]'),status=root.querySelector('[role="status"]'),
   summary=root.querySelector('[data-buyer-estimate]');
  if(!form||!model||!size||!color||!quantity||!role||!country||!zip||!consent||!status||!summary)continue;
  const allowed=Object.keys(models);
  const roleNames={school:'School / club',academy:'Training academy',coach:'Coach / trainer',
   retailer:'Retail store',distributor:'Distributor / wholesaler'};
  select(model,allowed,v=>models[v].name);
  const preferred=root.getAttribute('data-default-product');
  if(allowed.includes(preferred))model.value=preferred;
  const preferredRole=root.getAttribute('data-default-role');
  if(Object.hasOwn(roleNames,preferredRole))role.value=preferredRole;
  function sync(){
   const info=models[model.value];if(!info)return;
   const previousSize=size.value,previousColor=color.value;
   select(size,info.sizes,v=>'Size '+v);
   select(color,info.colors);
   if(info.sizes.includes(previousSize))size.value=previousSize;
   if(info.colors.includes(previousColor))color.value=previousColor;
   describe();
  }
  function describe(){
   const n=Number(quantity.value);
   if(Number.isSafeInteger(n)&&n>=10&&n<=10000){
    summary.textContent='Wholesale inquiry: '+n+' total units. Price depends on exact quantity and model. Sea freight required. For US destinations, estimated arrival 25–30 days after dispatch; no guaranteed delivery date. No payment is collected.';
   }else{
    summary.textContent='Wholesale starts at 10 units. For 1–9 items, select retail products and use the air-parcel shopping cart.';
   }
  }
  model.addEventListener('change',sync);
  quantity.addEventListener('input',describe);
  country.addEventListener('input',describe);
  sync();
  form.addEventListener('submit',event=>{
   event.preventDefault();
   status.textContent='';
   const n=Number(quantity.value);
   const code=country.value.trim().toUpperCase();
   const postal=zip.value.trim();
   const info=models[model.value];
   if(!info||!info.sizes.includes(size.value)||!info.colors.includes(color.value)){
    status.textContent='Choose a valid product, size and color.';return;
   }
   if(!Number.isSafeInteger(n)||n<10||n>10000){
    status.textContent='Wholesale quantity must be a whole number from 10 to 10,000.';quantity.focus();return;
   }
   if(!/^[A-Z]{2}$/.test(code)){
    status.textContent='Enter a valid two-letter delivery country code.';country.focus();return;
   }
   if(postal&&!/^[A-Za-z0-9][A-Za-z0-9 -]{0,18}$/.test(postal)){
    status.textContent='Use a postal code with letters, numbers, spaces or hyphens.';zip.focus();return;
   }
   if(!Object.hasOwn(roleNames,role.value)){
    status.textContent='Please select your organization type.';return;
   }
   if(!consent.checked){
    status.textContent='Please agree to ocean freight and the estimated, non-guaranteed delivery terms.';consent.focus();return;
   }
   const params=new URLSearchParams();
   params.set('type','quote');
   params.set('customer',role.value);
   params.set('rfq',JSON.stringify([{id:Number(model.value.slice(1))-1,size:size.value,color:color.value,quantity:n}]));
   params.set('buyer_plan','sea_accepted');
   params.set('buyer_country',code);
   if(postal)params.set('buyer_postal',postal);
   params.set('buyer_origin',root.getAttribute('data-planner-origin')||'b2b-page');
   // The next page is the real inquiry form, with Turnstile and privacy consent.
   // No visitor identity or automatic marketing opt-in is collected here.
   window.location.assign('inquiry.html?'+params.toString());
  });
 }
})();