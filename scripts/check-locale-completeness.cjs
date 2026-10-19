// All nine public website languages must remain complete and preserve dynamic placeholders.
// Does not try to auto-translate facts or add misleading alternate-language canonicals.
const fs=require('node:fs'),assert=require('node:assert/strict');
const languages=['en','es','pt','fr','de','it','nl','pl','ja'];
const doc=JSON.parse(fs.readFileSync('public/i18n.json','utf8'));
const siteSource=fs.readFileSync('public/site.js','utf8');
const sitePrefix='const I18N=';
const siteEnd=siteSource.indexOf(';\n',sitePrefix.length);
assert(siteSource.startsWith(sitePrefix)&&siteEnd>sitePrefix.length,'site.js embedded I18N bundle missing');
const runtimeDoc=JSON.parse(siteSource.slice(sitePrefix.length,siteEnd));
assert.deepEqual(runtimeDoc,doc,'site.js runtime translations must exactly match public/i18n.json');
const deployGenerator=fs.readFileSync('scripts/apply-product-specs.py','utf8');
assert(deployGenerator.includes('site.js?v=20261020-i18n-sync1'),'deployment generator must preserve the current site.js cache key');
assert(!deployGenerator.includes('site.js?v=20261010-growth1'),'deployment generator must not restore the stale site.js cache key');
assert(deployGenerator.includes('locale.setdefault(key, value)'),'deployment generator must only fill missing shared-copy keys');
assert(!/locale\.update\(json\.loads\(Path\('admin\/inquiry-copy\.json'\)/.test(deployGenerator),'English admin copy must not overwrite every locale');
assert.deepEqual(Object.keys(doc).sort(),languages.slice().sort(),'Approved language set changed');
const reference=Object.keys(doc.en).sort();
assert(reference.length>=150,'Unexpected truncation of English locale');
const holders=value=>[...value.matchAll(/\{[a-zA-Z0-9_]+\}/g)].map(x=>x[0]).sort();
for(const lang of languages){
 const obj=doc[lang];assert.equal(Object.keys(obj).length,reference.length,lang+' locale keys drift');
 assert.deepEqual(Object.keys(obj).sort(),reference,lang+' missing or unexpected keys');
 for(const key of reference){
  assert(typeof obj[key]==='string'&&obj[key].trim(),lang+': missing visible text for '+key);
  assert.deepEqual(holders(obj[key]),holders(doc.en[key]),lang+': dynamic placeholder mismatch for '+key);
  assert(!/<script\b|javascript:/i.test(obj[key]),lang+': unexpected executable markup in locale value');
 }
}
const b2bHome={
 en:{title:'QUIET INDOOR SPORTS BALLS FOR ORGANIZATIONS.',quote:'Request a bulk quote',sample:'Request a sample'},
 es:{title:'BALONES DEPORTIVOS PARA ORGANIZACIONES Y COMPRAS AL POR MAYOR.',quote:'Solicitar cotización por volumen',sample:'Solicitar una muestra'},
 pt:{title:'BOLAS ESPORTIVAS PARA ORGANIZAÇÕES E COMPRAS EM ATACADO.',quote:'Solicitar cotação para atacado',sample:'Solicitar uma amostra'},
 fr:{title:'BALLONS D’INTÉRIEUR POUR LES ACHATS DES ORGANISATIONS.',quote:'Demander un devis en volume',sample:'Demander un échantillon'},
 de:{title:'LEISE INDOOR-BÄLLE FÜR ORGANISATIONEN UND GROẞEINKÄUFE.',quote:'Großhandelsangebot anfragen',sample:'Muster anfragen'},
 it:{title:'PALLONI INDOOR PER ORGANIZZAZIONI E ACQUISTI ALL’INGROSSO.',quote:'Richiedi un preventivo all’ingrosso',sample:'Richiedi un campione'},
 nl:{title:'INDOORSPORTBALLEN VOOR ORGANISATIES EN GROOTINKOOP.',quote:'Offerte voor bulkbestelling aanvragen',sample:'Proefexemplaar aanvragen'},
 pl:{title:'PIŁKI DO HALI DLA ORGANIZACJI I ZAKUPÓW HURTOWYCH.',quote:'Poproś o wycenę hurtową',sample:'Poproś o próbkę'},
 ja:{title:'学校・団体向けの静音インドアスポーツボール。',quote:'卸売見積もりを依頼',sample:'サンプルを依頼'}
};
for(const lang of languages){
 assert.equal(doc[lang]['hero.title'],b2bHome[lang].title,lang+': homepage hero must retain B2B positioning');
 assert.equal(doc[lang]['hero.shop'],b2bHome[lang].quote,lang+': primary hero CTA must request a bulk quote');
 assert.equal(doc[lang]['hero.story'],b2bHome[lang].sample,lang+': secondary hero CTA must request a sample');
 assert(/bulk|wholesale|quantity|quote|volumen|mayorista|atacado|devis|gros|Großhandel|ingrosso|groothandel|hurt|卸売|見積もり/i.test(doc[lang]['home.products.lead']),lang+': product section must support a wholesale / quote journey');
}
console.log('PASS: all '+languages.length+' locales, '+reference.length+' keys, placeholder integrity, no empty UI messages.');
