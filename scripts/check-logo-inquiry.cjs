const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('public/inquiry.html','utf8');
const source=fs.readFileSync('public/inquiry.js','utf8');
const prefill=source.slice(source.indexOf('const form=document.querySelector'),source.indexOf('const customers='));
function run(design){
 const elements={};
 for(const id of ['request_type','customization','size-p1','size-p3','color-p1','color-p3']){
  const match=html.match(new RegExp('<select\\b[^>]*id="'+id+'"[^>]*>([\\s\\S]*?)<\\/select>'));
  assert(match,'Missing real inquiry control '+id);
  const options=[...match[1].matchAll(/<option\b([^>]*)>([^<]*)<\/option>/g)].map(x=>{const v=x[1].match(/value="([^"]*)"/);return v?v[1]:x[2]});
  let value=options[0];elements[id]={get value(){return value},set value(v){value=options.includes(v)?v:''}};
 }
 for(const id of ['choose-p1','choose-p3','message','privacy_consent'])elements[id]={value:'',checked:false};
 const form={querySelectorAll(){return []}};
 const context={root:{MINGEAGLE_INQUIRY_CONFIG:{enabled:false}},document:{querySelector(){return form},getElementById(id){assert(elements[id],'Missing '+id);return elements[id]}},location:{search:'?type=quote&logo_design='+encodeURIComponent(JSON.stringify(design))},URLSearchParams,TYPE_MAP:{quote:'Wholesale quote'}};
 vm.runInNewContext('(function(){'+prefill+'})();',context);
 return elements;
}
const base={id:'ME-LOGO-QA-1',product:'p1',size:'5',color:'Blue',kind:'text',text:'EAGLE ACADEMY',font:'Noto Sans · Bold',layout:'stack',curve:20,width:100,height:50};
let e=run(base);
assert.equal(e.request_type.value,'Wholesale quote');assert.equal(e['choose-p1'].checked,true);
assert.equal(e['size-p1'].value,'No. 5');assert.equal(e['color-p1'].value,'Blue');
assert.equal(e.customization.value,'Logo');assert.match(e.message.value,/EAGLE ACADEMY/);assert.equal(e.privacy_consent.checked,false);
e=run({...base,product:'p3',size:'6',color:'Black',kind:'image',file:'academy.png'});
assert.equal(e['choose-p3'].checked,true);assert.equal(e['size-p3'].value,'No. 6');assert.equal(e['color-p3'].value,'Black');assert.match(e.message.value,/academy\.png/);
for(const d of [{...base,product:'p4'},{...base,size:'6'},{...base,color:'Black'},{...base,width:1000},{...base,id:'bad-reference'}]){
 e=run(d);assert.equal(e.message.value,'');assert.equal(e['choose-p1'].checked,false);assert.equal(e['choose-p3'].checked,false);
}
console.log('Logo quote handoff passed: real select options, both supported products, invalid details ignored and consent unchanged.');
