// Verify sourced acoustic context without asserting product-specific noise performance.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(process.argv[2]||'public');
const pages=['quiet-indoor-sports-for-kids.html','indoor-school-sports-equipment-guide.html'];
const sources=[
 'https://acousticstoday.org/wp-content/uploads/2019/10/THE-ACOUSTICS-OF-FLOORS-IN-CONDOMINIUMS-Marshall-Long.pdf',
 'https://acoustics.org/1aaaa2-flooring-impact-sound-a-potential-path-to-quieter-hospitals-mike-raley/'
];
for(const name of pages){
 const source=fs.readFileSync(path.join(root,name),'utf8');
 const canonical='https://www.mingeagle.com/'+name;
 assert.equal((source.match(/<h1/g)||[]).length,1,name+' must have exactly one H1');
 assert(source.includes('<link rel="canonical" href="'+canonical+'">'),name+' must retain its www canonical');
 for(const href of sources){
  assert(source.includes('href="'+href+'" target="_blank" rel="noopener noreferrer"'),name+' must link to an acoustics source safely');
 }
 assert(/they do not test MING EAGLE products/i.test(source),name+' must distinguish general acoustics sources from product testing');
 assert(!/([0-9]+[ ]*dB|[0-9]+% quieter)/i.test(source),'No unsupported numeric noise-performance claims');
}
console.log('PASS: external acoustics references are linked on both buyer guides, with product-testing limits and no invented decibel claims.');
