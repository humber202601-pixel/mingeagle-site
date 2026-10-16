const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const pages=['index.html','products.html','silent-basketball.html',
 'fabric-silent-basketball.html','weighted-flocked-basketball.html','silent-soccer.html'];
for(const file of ['retail-cart.js','retail-buy.js','inquiry.js']){
 execFileSync(process.execPath,['--check','public/'+file]);
}
for(const name of pages){
 const html=fs.readFileSync('public/'+name,'utf8');
 assert(html.includes('retail-buy.css?v=20261013-cartfix1'),name+' missing styles');
 const base=html.indexOf('retail-cart.js?v=20261013-cartfix1');
 const buyer=html.indexOf(name==='silent-basketball.html'?'retail-buy.js?v=20261014-creator1':'retail-buy.js?v=20261013-cartfix1');
 assert(base>0&&buyer>base,name+' cart store must load before selector');
}
const prices=JSON.parse(fs.readFileSync('public/retail-prices.json','utf8')).products;
let state='[]';
const memory={
 getItem(k){assert.equal(k,'mingeagle_retail_cart_v1');return state},
 setItem(k,value){assert.equal(k,'mingeagle_retail_cart_v1');state=value}
};
const window={};
const ctx={window,localStorage:memory,document:{getElementById(){return null}},
 URL,console};
vm.runInNewContext(fs.readFileSync('public/retail-cart.js','utf8'),ctx);
const store=window.MingEagleCart;
assert(store&&typeof store.add==='function');
for(const [product,sizes] of Object.entries(prices)){
 for(const [size,price] of Object.entries(sizes)){
  assert.equal(store.unitPrice(product.toUpperCase()+'-S'+size),price);
 }
}
assert.equal(store.add('P1-S3',1,'Orange').ok,true);
assert.equal(store.add('P1-S3',2,'Green').ok,true);
assert.equal(store.add('P1-S3',2,'Orange').ok,true);
assert.equal(store.add('P2-S5',1,'Orange').ok,true);
let entries=store.read();
assert.equal(entries.length,3,'Distinct colors must never merge');
assert.equal(entries.find(x=>x.color==='Green').quantity,2);
assert.equal(entries.find(x=>x.sku==='P1-S3'&&x.color==='Orange').quantity,3);
assert.equal(store.aggregate(entries).find(x=>x.sku==='P1-S3').quantity,5,
 'Freight groups same size across selected colors');
assert.equal(store.add('P4-S7',1,'Black/White').ok,false,'Unlisted SKU blocked');
assert.equal(store.add('P1-S3',1,'Nonexistent').ok,false,'Unlisted color blocked');
assert.equal(store.add('P1-S3',0,'Orange').ok,false);
state='[{"sku":"P3-S7","quantity":1}]';
assert.equal(store.read()[0].color,'','Legacy cart must require color selection; never assume');

// Exercise real browser-side buy controls without depending on external packages.
class Element{
 constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.handlers={};
  this.className='';this.dataset={};this.value='';this.attrs={};this.textContent='';}
 append(...children){this.children.push(...children)}
 appendChild(child){this.append(child);return child}
 insertBefore(child){this.appendChild(child)}
 add(opt){if(!this.children.length)this.value=opt.value;this.children.push(opt)}
 setAttribute(k,v){this.attrs[k]=v}
 getAttribute(k){return this.attrs[k]}
 addEventListener(kind,callback){this.handlers[kind]=callback}
 focus(){}
 scrollIntoView(){}
}
const bodies=[],cards=[];
for(let i=1;i<=4;i++){
 const body=new Element('div'),more=new Element('a');
 body.querySelector=x=>x==='a.more'?more:null;
 const card={querySelector:x=>{
  if(x==='[data-i18n$=".title"]')return {getAttribute:()=>`p${i}.title`};
  if(x==='.pbody')return body;return null;
 }};
 bodies.push(body);cards.push(card);
}
const nodes=[];
const buyerDocument={
 createElement(tag){const element=new Element(tag);nodes.push(element);return element},
 querySelectorAll(sel){return sel==='.pcard'?cards:[]},
 querySelector(){return null},
 getElementById(){return null},
 body:new Element('body')
};
window.location={href:'https://www.mingeagle.com/products.html',pathname:'/products.html',hash:''};
window.addEventListener=()=>{};
window.requestAnimationFrame=fn=>fn();
vm.runInNewContext(fs.readFileSync('public/retail-buy.js','utf8'),
 {window,document:buyerDocument,URL,console});
const widgets=bodies.flatMap(b=>b.children.filter(x=>x.className==='retailBuyPicker'));
assert.equal(widgets.length,4,'All four product listing cards must offer selections');
function find(element,fn){
 if(fn(element))return element;
 for(const child of element.children){
  const found=find(child,fn);if(found)return found;
 }
 return null;
}
const panel=widgets[0];
const size=find(panel,x=>x.attrs['aria-label']==='Ball size');
const color=find(panel,x=>x.attrs['aria-label']==='Color');
const quantity=find(panel,x=>x.attrs['aria-label']==='Quantity');
const add=find(panel,x=>x.className==='retailBuyAdd');
assert(size&&color&&quantity&&add,'Complete selector controls');
state='[]';
size.value='No. 5';color.value='Green';quantity.value='2';
add.handlers.click();
assert.equal(store.read().length,1);
assert.equal(store.read()[0].sku,'P1-S5');
assert.equal(store.read()[0].color,'Green');
assert.equal(store.read()[0].quantity,2);
assert(find(panel,x=>x.className==='retailBuyStatus').textContent.includes('added'));
assert(buyerDocument.body.children.some(x=>x.className==='retailCartFloating'),'Cart shortcut displayed');
assert(store.add('P1-S5',8,'Green').ok,true,'Quantity 10 becomes wholesale, not an arbitrary block');

// Ensure inquiry fallback parses actual cart x syntax and real newlines.
// The previous regex demanded "×" and double-escaped \d, silently losing all lines.
const inquiry=fs.readFileSync('public/inquiry.js','utf8');
const first=inquiry.indexOf("if((q.get('type')==='retail'||q.get('type')==='quote')&&q.get('cart')){");
const last=inquiry.indexOf("\ntry{\n const raw=q.get('logo_design');",first);
assert(first>0&&last>first,'Retail cart inquiry parser exists');
const parser=inquiry.slice(first,last);
function simulate(type,method,n,colors){
 const params=new URLSearchParams({
  type,cart:'P1-S3 x '+n,
  cart_country:'US',cart_method:method,cart_total:'25',
  cart_shipping:'11.5',cart_options:colors
 });
 const fields={message:{value:''},country:{value:''},
  estimated_quantity:{value:''}};
 const win={};
 vm.runInNewContext(parser,{q:{get:k=>params.get(k)},window:win,
  $:k=>fields[k]||null,console,URLSearchParams});
 return {fields,win};
}
let retail=simulate('retail','air',2,'P1-S3 | Green | 2');
assert(retail.fields.message.value.includes('\nProducts: P1-S3 x 2\n'));
assert(retail.fields.message.value.includes('P1-S3 / Green x 2'));
assert.equal(retail.win.__mingEagleCartOrder.totalUnits,2);
let bulk=simulate('quote','sea',10,'P1-S3 | Orange | 10');
assert(bulk.fields.message.value.includes('Total items: 10'));
assert.equal(bulk.win.__mingEagleCartOrder.mode,'Sea freight');
let wrong=simulate('retail','air',1,'P1-S3 | Counterfeit | 1');
assert(wrong.fields.message.value.includes('Selected colors: confirmation required'));
console.log('PASS: all six pages load cart selectors; 11 SKU prices; real size/color/quantity persistence, multi-color freight grouping; working add button; old carts; retail and wholesale inquiry handoff with correct newlines.');


// Regression: production wholesale RFQ APIs deliberately return null USD/CBM.
// The PUBLIC cart must never render Number(null)==0 or route wholesale to card
// checkout. Simulate the actual DOM event and handoff without network calls.
(async()=>{
 class Widget{
  constructor(tag='div'){this.tagName=tag;this.handlers={};this.children=[];this.value='';this.checked=false;this.hidden=false;this.disabled=false;this.textContent='';this.style={};this.attrs={};}
  addEventListener(k,fn){this.handlers[k]=fn}
  append(...parts){this.children.push(...parts)}
  add(item){this.children.push(item)}
  replaceChildren(...parts){this.children=[...parts]}
  setAttribute(k,v){this.attrs[k]=v}
 }
 const js=fs.readFileSync('public/retail-cart.js','utf8');
 const ids=['retailCart',...[...js.matchAll(/\$\('([^']+)'\)/g)].map(m=>m[1])];
 const elements=Object.fromEntries([...new Set(ids)].map(id=>[id,new Widget()]));
 elements.cartCountry.value='US';
 const local={getItem(){return JSON.stringify([{sku:'P1-S3',color:'Orange',quantity:10}])},setItem(){}};
 const fakeDocument={getElementById(id){return elements[id]||null},createElement(tag){return new Widget(tag)}};
 const navigation={href:''};
 let requests=0;
 const fakeFetch=async(url,init)=>{
  requests++;
  assert.equal(url,'https://app.mingeagle.com/api/shipping/cart','Wholesale must not launch Stripe');
  const input=JSON.parse(init.body);
  assert.equal(input.method,'sea');
  assert.equal(input.seaFreightAccepted,true);
  assert.equal(input.lines[0].quantity,10);
  return {ok:true,async json(){return {ok:true,wholesale:true,quoteRequired:true,
   paymentEnabled:false,method:'sea',country:'US',quantity:10,
   productsUSD:null,shippingUSD:null,totalBeforeTaxesUSD:null,volumeCBM:null,
   packagingVerified:false,ddpConfirmed:false}}};
 };
 vm.runInNewContext(js,{window:{},localStorage:local,document:fakeDocument,
  Option:function(label,value){this.textContent=label;this.value=value;},
  location:navigation,fetch:fakeFetch,URLSearchParams,console});
 assert.equal(elements.cartSubtotal.textContent,'Price on request');
 assert.equal(elements.cartSummaryGoods.textContent,'Price on request');
 assert(!elements.cartLines.children.some(row=>row.children.some(cell=>cell.textContent==='$99.00')),
  'Never mislabel retail reference prices as an approved wholesale line');
 elements.cartSeaConsent.checked=true;
 await elements.cartEstimateForm.handlers.submit({preventDefault(){}});
 assert.equal(requests,1);
 assert.equal(elements.cartSummaryShipping.textContent,'Written DDP quote required');
 assert.equal(elements.cartSummaryTotal.textContent,'To be confirmed');
 assert.equal(elements.cartCheckout.disabled,false,'Bulk RFQ submission must remain possible');
 assert.equal(elements.cartCheckout.textContent,'Submit wholesale RFQ →');
 assert.equal(elements.cartEstimate.hidden,true,'Do not show pricing from null API fields');
 assert(!JSON.stringify([elements.cartSummaryGoods.textContent,elements.cartSummaryShipping.textContent,
  elements.cartSummaryTotal.textContent]).includes('$0.00'));
 await elements.cartCheckout.handlers.click();
 assert(navigation.href.startsWith('inquiry.html?'),'No direct Stripe or checkout link on a bulk quote');
 const target=new URL(navigation.href,'https://www.mingeagle.com');
 assert.equal(target.searchParams.get('cart'),'P1-S3 x 10');
 assert.equal(target.searchParams.get('cart_method'),'sea');
 assert.equal(target.searchParams.get('cart_total'),null);
 assert.equal(target.searchParams.get('cart_shipping'),null);
 // Legacy or forged wholesale URI amounts must not be propagated as sourced
 // freight or published as a final amount in the lead description.
 const untrusted=new URLSearchParams(target.searchParams);
 untrusted.set('cart_total','0');untrusted.set('cart_shipping','0');
 const inputFields={message:{value:''},country:{value:''},estimated_quantity:{value:''}};
 const obj={};
 vm.runInNewContext(parser,{q:{get:k=>untrusted.get(k)},window:obj,
  $:k=>inputFields[k]||null,console,URLSearchParams});
 assert(inputFields.message.value.includes('written quotation required'));
 assert(!inputFields.message.value.includes('Estimated freight USD'));
 assert(!inputFields.message.value.includes('Estimated total before tax USD'));
 // A single-product detail must point bulk shoppers toward the quote cart.
 const productScript=fs.readFileSync('public/retail-shipping.js','utf8');
 assert(productScript.includes("if(qty>=10)"));
 assert(productScript.includes("typeof data.productUSD!=='number'"),
  'Quote-only response must never become $0.00 on detail view');
 console.log('PASS: buyer-facing wholesale price/CBM fields remain quote-only and checkout handoff preserves SKU/quantity without false $0.00.');
})().catch(err=>{console.error(err);process.exitCode=1});
