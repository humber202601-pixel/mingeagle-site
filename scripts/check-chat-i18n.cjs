const fs=require('node:fs');const vm=require('node:vm');const assert=require('node:assert/strict');
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync('public/sales-assistant-i18n.js','utf8'),sandbox);
const langs=['en','es','pt','fr','de','it','ja'];
for(const lang of langs){const a=sandbox.window.MINGEAGLE_CHAT_LANG[lang],b=sandbox.window.MINGEAGLE_CHAT_ANSWERS[lang];assert.equal(a.length,19,lang+' UI entries');assert.equal(b.length,9,lang+' FAQ entries');assert(a.every(x=>typeof x==='string'&&x.trim()),lang+' missing UI translation');assert(b.every(x=>typeof x==='string'&&x.trim()),lang+' missing FAQ translation')}
for(const file of ['index.html','products.html','wholesale.html','wholesale-product-catalog.html','inquiry.html']){const page=fs.readFileSync('public/'+file,'utf8');assert(page.includes('sales-assistant-i18n.js'),file+' missing translations');assert(page.indexOf('sales-assistant-i18n.js')<page.indexOf('sales-assistant.js'),file+' wrong script order')}
console.log('PASS: seven-language chat UI and FAQ dictionaries, correct script inclusion/order on five pages.');

// Guard against accidentally double-escaped regex tokens in the quote qualification flow.
const assistant=fs.readFileSync('public/sales-assistant.js','utf8');
assert(!/\\\\[bsd]/.test(assistant),'Chat assistant contains double-escaped regex tokens');
assert(assistant.includes('quoteState.active=true'),'Quote qualification flow missing');
assert(assistant.includes('quoteState.zip=z[1]'),'ZIP capture flow missing');
