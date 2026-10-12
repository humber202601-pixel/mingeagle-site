// All nine public website languages must remain complete and preserve dynamic placeholders.
// Does not try to auto-translate facts or add misleading alternate-language canonicals.
const fs=require('node:fs'),assert=require('node:assert/strict');
const languages=['en','es','pt','fr','de','it','nl','pl','ja'];
const doc=JSON.parse(fs.readFileSync('public/i18n.json','utf8'));
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
console.log('PASS: all '+languages.length+' locales, '+reference.length+' keys, placeholder integrity, no empty UI messages.');
