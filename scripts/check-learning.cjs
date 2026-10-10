const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {COPY,dictionary}=require('../public/learning.js');
const pages={'learn.html':'hub','silent-basketball-vs-regular.html':'compare','custom-basketball-for-teams.html':'team'};
const expected=Object.keys(COPY.en).sort();for(const [lang,d]of Object.entries(COPY)){assert.deepEqual(Object.keys(d).sort(),expected,lang+' missing translation');assert.ok(Object.values(d).every(v=>typeof v==='string'&&v.trim()),lang+' blank translation')}
assert.equal(Object.keys(COPY).length,9);assert.equal(dictionary('unknown'),COPY.en);
for(const [name,kind]of Object.entries(pages)){
 const html=fs.readFileSync('public/'+name,'utf8');assert.equal((html.match(/<h1\b/g)||[]).length,1);assert.equal((html.match(/src="learning.js/g)||[]).length,1,'no duplicate localization script');
 assert.ok(html.includes('https://mingeagle.com/'+name));assert.ok(fs.readFileSync('public/sitemap.xml','utf8').includes('https://mingeagle.com/'+name));
 const keys=[...html.matchAll(/data-learn="([^"]+)"/g)].map(x=>x[1]);for(const key of keys)for(const lang of Object.keys(COPY))assert.ok(COPY[lang][key],name+': '+lang+' missing '+key);
 for(const m of html.matchAll(/(?:href|src)="([^"?#]+)(?:\?[^"#]*)?(?:#[^"]*)?"/g)){if(!/^[a-z]+:/.test(m[1])&&!m[1].startsWith('#'))assert.ok(fs.existsSync('public/'+m[1]),name+' broken local link '+m[1]);}
 const schema=JSON.parse(html.match(/id="learning-schema">([\s\S]*?)<\/script>/)[1]);assert.equal(kind==='hub'?schema.inLanguage:schema['@graph'][0].inLanguage,'en');
 const nodes=keys.map(key=>({dataset:{learn:key},textContent:''})),meta={description:{content:''},title:{content:''},ogdesc:{content:''}},schemaNode={textContent:JSON.stringify(schema)},events={};
 const document={readyState:'complete',documentElement:{lang:'en'},title:'',querySelectorAll:selector=>selector==='[data-learn]'?nodes:[],querySelector:selector=>selector==='[data-learning-page]'?{dataset:{learningPage:kind}}:selector==='meta[name="description"]'?meta.description:selector==='meta[property="og:title"]'?meta.title:selector==='meta[property="og:description"]'?meta.ogdesc:null,getElementById:()=>schemaNode};const sandbox={document,addEventListener:(name,cb)=>events[name]=cb};sandbox.window=sandbox;vm.createContext(sandbox);vm.runInContext(fs.readFileSync('public/learning.js','utf8'),sandbox);
 for(const lang of Object.keys(COPY)){
  events['mingeagle:language']({detail:{lang}});for(const node of nodes)assert.equal(node.textContent,COPY[lang][node.dataset.learn]);const next=JSON.parse(schemaNode.textContent);assert.equal(kind==='hub'?next.inLanguage:next['@graph'][0].inLanguage,lang);assert.ok(document.title.endsWith(' | MING EAGLE'));assert.equal(meta.description.content,COPY[lang][kind==='hub'?'common.2':kind+'.1']);
 }
}
const master=JSON.parse(fs.readFileSync('public/product-master.json','utf8'));const team=fs.readFileSync('public/custom-basketball-for-teams.html','utf8');for(const p of Object.values(master)){assert.ok(team.includes(p.name));assert.ok(team.includes(p.sizes));assert.ok(team.includes(p.colors));}
const strips=['index.html','silent-basketball-guide.html','for-coaches.html','wholesale.html','for-schools.html'];for(const name of strips){const html=fs.readFileSync('public/'+name,'utf8');assert.equal((html.match(/MING LEARNING START/g)||[]).length,1);assert.equal((html.match(/src="learning-links.js/g)||[]).length,1);assert.equal((html.match(/src="learning.js/g)||[]).length,0);}
console.log('PASS: three crawlable pages, valid article/collection metadata, local link integrity, exact product specifications, all nine language events update content and schema, and no duplicate modules or related sections.');

const light=require('../public/learning-links.js').COPY;for(const [lang,d]of Object.entries(light))for(const [key,value]of Object.entries(d))assert.equal(value,COPY[lang][key]);assert.ok(fs.statSync('public/learning-links.js').size<16000,'existing pages use the smaller related-links module');
