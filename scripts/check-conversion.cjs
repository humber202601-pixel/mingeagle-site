const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const core=require('../public/forms-core.js'),{summary}=require('../public/inquiry.js'),{contactUrl}=require('../public/direct-contact.js');
for(const channel of ['facebook','instagram','youtube','tiktok']){
 const ctx={pageUri:'https://mingeagle.com/inquiry.html',landingPage:'https://mingeagle.com/learn.html',campaignLanding:'https://mingeagle.com/learn.html',referrer:'https://'+channel+'.com/',campaign:'utm_source='+channel+' | utm_campaign=quiet_play | utm_content=v01'};
 const details=core.sourceLines(ctx),fallback=summary({reference:'ME-TEST',requestType:'Sample request',firstname:'QA',email:'qa@example.test'},ctx);
 assert(fallback.includes(details));assert(!details.includes('qa@example.test'));
 for(const href of ['https://wa.me/8613851585237','mailto:mingeaglecommerce@gmail.com']){
  const next=contactUrl(href,ctx),url=new URL(next),text=url.searchParams.get(url.protocol==='mailto:'?'body':'text');
  assert(text.includes(details));assert.equal(contactUrl(next,ctx),null,'Must not duplicate attribution');
 }
 const policy=new URL(contactUrl('https://wa.me/8613851585237?text=I%20need%20help%20with%20shipping.',ctx));assert(policy.searchParams.get('text').startsWith('I need help with shipping.'));
 for(const href of ['https://wa.me/8613851585237?text='+encodeURIComponent('My reference is: ME-TEST'),'mailto:other@example.test','https://wa.me/123456789','https://example.test','https://wa.me.evil.test/8613851585237'])assert.equal(contactUrl(href,ctx),null);
}
// Exercise the real form initializer and events without submitting anything.
function node(id){return {id,value:'',hidden:false,disabled:false,required:false,textContent:'',events:{},addEventListener(type,fn){(this.events[type]??=[]).push(fn)},querySelectorAll(){return []},classList:{toggle(){}},focus(){},scrollIntoView(){}}}
function init(search){
 const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,node(id));return nodes.get(id)};get('request_type').value='Wholesale quote';
 const form=get('quoteForm');form.querySelectorAll=()=>[];form.querySelector=()=>null;
 const sandbox={window:{MingEagleForms:core,MINGEAGLE_INQUIRY_CONFIG:{enabled:true}},document:{getElementById:get,querySelector:()=>form},location:{search},URLSearchParams,console};
 vm.runInNewContext(fs.readFileSync('public/inquiry.js','utf8'),sandbox);
 const fire=(id,type)=>(get(id).events[type]||[]).forEach(fn=>fn());return {get,fire};
}
const sample=init('?type=sample');assert.equal(sample.get('estimated_quantity').value,'1–2 samples');sample.get('request_type').value='Wholesale quote';sample.fire('request_type','change');assert.equal(sample.get('estimated_quantity').value,'');
sample.get('estimated_quantity').value='100–499 units';sample.fire('estimated_quantity','change');sample.get('request_type').value='Sample request';sample.fire('request_type','change');assert.equal(sample.get('estimated_quantity').value,'100–499 units','Keep customer quantity');
const explicit=init('?type=sample');explicit.fire('estimated_quantity','change');explicit.get('request_type').value='Wholesale quote';explicit.fire('request_type','change');assert.equal(explicit.get('estimated_quantity').value,'1–2 samples','Keep explicit customer selection');
const robots=fs.readFileSync('public/robots.txt','utf8');assert(!robots.includes('Disallow: /thank-you.html'));assert(robots.includes('Sitemap: https://mingeagle.com/sitemap.xml'));
const sitemap=fs.readFileSync('public/sitemap.xml','utf8'),urls=[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]);assert.equal(new Set(urls).size,urls.length);
for(const name of fs.readdirSync('public').filter(x=>x.endsWith('.html')&&x!=='404.html')){
 const html=fs.readFileSync('public/'+name,'utf8');assert.equal((html.match(/<h1[ >]/g)||[]).length,1,name+' needs one principal heading');
 const canonical=[...html.matchAll(/<link[^>]*rel="canonical"[^>]*href="([^"]+)"/g)].map(m=>m[1]);assert.deepEqual(canonical,['https://mingeagle.com/'+(name==='index.html'?'':name)],name+' canonical');
 assert.equal((html.match(/src="forms-core\.js/g)||[]).length,1,name+' one forms core');assert.equal((html.match(/src="direct-contact\.js/g)||[]).length,1,name+' one contact helper');
 assert(html.indexOf('src="forms-core.js')<html.indexOf('src="direct-contact.js'),name+' dependency order');
 if(name==='thank-you.html'){assert(/name="robots" content="noindex/.test(html));assert(!urls.includes(canonical[0]))}else assert(urls.includes(canonical[0]),name+' listed in sitemap');
}
console.log('PASS: four-channel email/WhatsApp attribution, reference preservation, sample defaults, single headings, canonical sitemap and readable receipt noindex. No external messages or submissions sent.');
