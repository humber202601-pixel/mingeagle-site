const assert=require('node:assert/strict'),fs=require('node:fs'),
 path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),vm=require('node:vm');
const BASE='https://www.mingeagle.com/';
for(const file of ['public/b2b-quote-planner.js','public/inquiry.js','scripts/build-b2b-quote-planner.cjs'])
 cp.execFileSync(process.execPath,['--check',file],{stdio:'pipe'});
const config=JSON.parse(fs.readFileSync('public/product-master.json','utf8'));
const source=fs.readFileSync('public/b2b-quote-planner.js','utf8');
const testRoot=fs.mkdtempSync(path.join(os.tmpdir(),'b2b-rfq-gate-'));
try{
 const names=['for-schools.html','for-coaches.html','wholesale.html'];
 for(const name of names)fs.copyFileSync(path.join('public',name),path.join(testRoot,name));
 function run(){cp.execFileSync(process.execPath,['scripts/build-b2b-quote-planner.cjs',testRoot],{stdio:'pipe'})}
 run();
 const before={};
 for(const name of names){
  const html=fs.readFileSync(path.join(testRoot,name),'utf8');before[name]=html;
  assert.equal((html.match(/MING EAGLE QUALIFIED B2B PLANNER BEGIN/g)||[]).length,1,name);
  assert.equal((html.match(/MING EAGLE QUALIFIED B2B PLANNER END/g)||[]).length,1,name);
  assert(html.includes('data-b2b-quote-planner')&&html.includes('name="buyerSeaConsent"'));
  assert(html.includes('name="buyerQuantity"')&&html.includes('name="buyerCountry"'));
  assert(html.includes('25–30 days after dispatch')&&html.includes('not a guaranteed arrival date'));
  assert(html.includes('No payment and no unsolicited marketing signup.'));
  assert(html.includes('b2b-quote-planner.css?v=20261013-1'));
  assert(html.includes('b2b-quote-planner.js?v=20261013-1'));
  assert(html.indexOf('volume-quote-planner')<html.indexOf('</main>'),'Conversion CTA must be in real main');
  assert(!/measured \d+\s*dB|(?:we are|our products are) independently certified|guaranteed quiet|% off for all/i.test(html));
 }
 run();
 for(const [name,html] of Object.entries(before))
  assert.equal(fs.readFileSync(path.join(testRoot,name),'utf8'),html,name+' builder idempotent');

 const prices=JSON.parse(fs.readFileSync('public/retail-prices.json','utf8')).products;
 for(let i=1;i<=4;i++){
  const id='p'+i;
  const family=source.match(new RegExp(id+':\\{name:[^\\n]+'))?.[0];
  assert(family,id+' missing planner configuration');
  const wanted=Object.keys(prices[id]).sort();
  for(const size of wanted)assert(family.includes("'"+size+"'"),id+' missing approved size '+size);
  for(const color of config[id].colors.split(' / ')){
   assert(family.includes("'"+color+"'"),id+' missing official color '+color);
  }
 }
 class Node{
  constructor(name='node'){this.name=name;this.value='';this.checked=false;this.handlers={};
   this.children=[];this.textContent='';this.attributes={};}
  replaceChildren(){this.children=[];this.value=''}
  appendChild(child){if(this.children.length===0)this.value=child.value;this.children.push(child);return child}
  addEventListener(type,fn){this.handlers[type]=fn}
  focus(){}
 }
 function scenario(page,opts={}){
  const fields={};for(const name of ['buyerModel','buyerSize','buyerColor','buyerQuantity','buyerRole','buyerCountry','buyerPostal','buyerSeaConsent'])
   fields[name]=new Node(name);
  fields.buyerQuantity.value=String(opts.quantity??25);
  fields.buyerCountry.value=opts.country??'US';
  fields.buyerPostal.value=opts.postal??'10001';
  fields.buyerSeaConsent.checked=opts.consent??true;
  const status=new Node(),summary=new Node(),form=new Node('form');
  const defaults={
   'for-schools.html':{product:'p1',role:'school'},
   'for-coaches.html':{product:'p3',role:'academy'},
   'wholesale.html':{product:'p1',role:'retailer'}
  };
  const d=defaults[page];
  fields.buyerRole.value=d.role;
  const root={
   querySelector(q){
    if(q==='form')return form;
    if(q==='[role="status"]')return status;
    if(q==='[data-buyer-estimate]')return summary;
    const m=/^\[name="([^"]+)"\]$/.exec(q);
    return m?fields[m[1]]:null;
   },
   getAttribute(k){return ({
    'data-default-product':d.product,'data-default-role':d.role,
    'data-planner-origin':page.replace('.html','')
   })[k]||null}
  };
  let navigate='';
  const context={document:{querySelectorAll:q=>q==='[data-b2b-quote-planner]'?[root]:[],
    createElement:()=>new Node('option')},
   window:{location:{assign:to=>{navigate=to}}},
   URLSearchParams,console,Number,Object};
  vm.runInNewContext(source,context);
  fields.buyerQuantity.value=String(opts.quantity??25);
  fields.buyerCountry.value=opts.country??'US';
  fields.buyerPostal.value=opts.postal??'10001';
  fields.buyerSeaConsent.checked=opts.consent??true;
  const invalid=opts.color??fields.buyerColor.value;
  if(opts.color)fields.buyerColor.value=invalid;
  form.handlers.submit({preventDefault(){}});
  return {navigate,status:status.textContent,fields,summary:summary.textContent};
 }
 for(const page of names){
  const out=scenario(page);
  assert(out.navigate.startsWith('inquiry.html?'),page+' has a working conversion CTA');
  const url=new URL(out.navigate,BASE);
  assert.equal(url.searchParams.get('type'),'quote');
  assert.equal(url.searchParams.get('buyer_plan'),'sea_accepted');
  assert.equal(url.searchParams.get('buyer_country'),'US');
  assert.equal(url.searchParams.get('buyer_postal'),'10001');
  const lines=JSON.parse(url.searchParams.get('rfq'));
  assert.equal(lines.length,1);
  assert.equal(lines[0].quantity,25);
  assert(/^[0-3]$/.test(String(lines[0].id)));
  assert(!/email=|phone=|password=|apiKey=|marketingConsent/i.test(url.search));
 }
 assert(!scenario('for-schools.html',{quantity:9}).navigate,'9-item request must use retail route');
 assert(!scenario('wholesale.html',{consent:false}).navigate,'No sea quote without checked buyer consent');
 assert(!scenario('for-coaches.html',{quantity:10001}).navigate,'Oversize request blocked');
 assert(!scenario('for-coaches.html',{country:'@@'}).navigate,'Invalid destination blocked');
 assert(!scenario('wholesale.html',{color:'Unlisted Color'}).navigate,'Unlisted color blocked');
 const inquiry=fs.readFileSync('public/inquiry.js','utf8');
 assert(inquiry.includes("school:'School / club'"));
 assert(inquiry.includes("wholesalePrefillUnits=total"));
 assert(inquiry.includes("q.get('buyer_plan')==='sea_accepted'"));
 assert(inquiry.includes("q.get('buyer_country')"));
 assert(inquiry.includes("if($('quoteUnits'))$('quoteUnits').value=String(wholesalePrefillUnits)"));
 assert(inquiry.includes('Sea-freight quote planner: visitor acknowledged'));
 console.log('PASS: 3 real B2B buyer acquisition pages, catalog-verified sizes/colors, 25–30-day non-guaranteed sea, explicit consent, rejected invalid inputs, privacy-safe inquiry handoff and stable source build.');
}finally{fs.rmSync(testRoot,{force:true,recursive:true})}
