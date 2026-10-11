const fs=require('node:fs');const vm=require('node:vm');const assert=require('node:assert/strict');
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync('public/sales-assistant-i18n.js','utf8'),sandbox);
const langs=['en','es','pt','fr','de','it','nl','pl','ja'];
for(const lang of langs){const a=sandbox.window.MINGEAGLE_CHAT_LANG[lang],b=sandbox.window.MINGEAGLE_CHAT_ANSWERS[lang];assert.equal(a.length,19,lang+' UI entries');assert.equal(b.length,9,lang+' FAQ entries');assert(a.every(x=>typeof x==='string'&&x.trim()),lang+' missing UI translation');assert(b.every(x=>typeof x==='string'&&x.trim()),lang+' missing FAQ translation')}
for(const file of ['index.html','products.html','wholesale.html','wholesale-product-catalog.html','inquiry.html']){const page=fs.readFileSync('public/'+file,'utf8');assert(page.includes('sales-assistant-i18n.js'),file+' missing translations');assert(page.indexOf('sales-assistant-i18n.js')<page.indexOf('sales-assistant.js'),file+' wrong script order')}
console.log('PASS: nine-language chat UI and FAQ dictionaries, correct script inclusion/order on five pages.');

// Guard against accidentally double-escaped regex tokens in the quote qualification flow.
const assistant=fs.readFileSync('public/sales-assistant.js','utf8');
assert(!/\\\\[bsd]/.test(assistant),'Chat assistant contains double-escaped regex tokens');
assert(assistant.includes('quoteState.active=true'),'Quote qualification flow missing');
assert(assistant.includes('quoteState.zip=z[1]'),'ZIP capture flow missing');

// multilingual quote intent regression: test extracted matcher against common buyer phrases.
const quoteFunction=assistant.match(/function isQuoteIntent\(text\)\{[\s\S]*?\n\}/);
assert(quoteFunction,'multilingual quote intent regression: matcher missing');
const quoteSandbox={};vm.runInNewContext(quoteFunction[0]+';this.quoteIntent=isQuoteIntent;',quoteSandbox);
for(const phrase of ['wholesale quote','cotización mayorista','orçamento atacado','devis vente en gros','Großhandel Angebot','preventivo ingrosso','卸売 見積','groothandel offerte','wycena hurtowa'])assert(quoteSandbox.quoteIntent(phrase),'Missing quote intent: '+phrase);
assert(assistant.includes('if(i===2){quoteState.active=true'),'Wholesale quick action must activate qualification');
console.log('PASS: nine-language wholesale quote intent and quick action flow.');

const inquiry=fs.readFileSync('public/inquiry.js','utf8');
assert(inquiry.includes('Destination postal code|Destination ZIP'),'Inquiry must accept chat postal code keys');
assert(inquiry.includes("assistantSummary.match(/Size: No\\."),'Inquiry must carry ball size');
assert(inquiry.includes("if(units&&$('estimated_quantity'))"),'Inquiry must prefill quantity tier');
console.log('PASS: sales assistant to inquiry form prefill contract.');

