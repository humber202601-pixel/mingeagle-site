// Verify the coach answer hub contains useful product-selection content, not
// unsupported noise-reduction metrics or fabricated safety certifications.
const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(process.argv[2]||'public');
const html=fs.readFileSync(path.join(root,'for-coaches.html'),'utf8');
const start='<!-- MING EAGLE COACH ANSWER GUIDE BEGIN -->';
const end='<!-- MING EAGLE COACH ANSWER GUIDE END -->';
assert.equal(html.split(start).length,2,'Exactly one human-readable coach buying answer block');
assert.equal(html.split(end).length,2,'Exactly one coach answer closing marker');
assert(html.indexOf(start)<html.indexOf(end),'Coach Q&A wrapper must be balanced');
const answers=html.split(start)[1].split(end)[0];
assert(answers.includes('id="coach-equipment-questions"'),'Provide a linkable HTML section');
assert(answers.includes('lang="en"'),'Mark untranslated guide English rather than invent locale translations');
assert(answers.includes('aria-labelledby="coach-equipment-heading"'),'Keep reading context accessible');
const headings=[...answers.matchAll(/<h3>\s*([^<]+?)\s*<\/h3>/g)].map(x=>x[1]);
assert.equal(headings.length,5,'Five distinct practical questions for coaches, camps and academies');
for(const snippet of ['quieter indoor ball-handling','regulation basketball','indoor drills','evaluate a sample','bulk quotation request']){
 assert(headings.some(x=>x.toLowerCase().includes(snippet.toLowerCase())),'Missing genuine high-intent question: '+snippet);
}
const links=[...answers.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(x=>x[1]);
for(const name of ['silent-basketball.html','fabric-silent-basketball.html','weighted-flocked-basketball.html','indoor-school-sports-equipment-guide.html','basketball-camp-equipment-supplier.html']){
 assert(links.includes(name),'Coach answer must cite verified relevant product/page '+name);
 assert(fs.existsSync(path.join(root,name)));
}
assert(links.includes('inquiry.html?type=quote&amp;customer=academy'),'Genuine relevant academy lead CTA required');
for(const href of links){
 assert(!href.startsWith('http'),'Avoid third-party paid placements and outbound references');
 assert(!/javascript:|#/.test(href),'Do not use invisible script links or fragments');
}
assert(/not automatically a substitute for a regulation basketball/i.test(answers));
assert(/not a measured decibel guarantee/i.test(answers));
assert(/not independent performance testing/i.test(answers));
assert(!/\b(?:\d+\s*(?:dB|decibels)|\d+%\s*(?:quieter|noise reduction)|guaranteed silent|certified safe for|independently verified)\b/i.test(answers),'No invented tests or certifications');
assert((html.match(/<h1\b/gi)||[]).length===1);
assert(html.includes('<link rel="canonical" href="https://www.mingeagle.com/for-coaches.html"')||html.includes('<link rel="canonical" href="https://mingeagle.com/for-coaches.html"'));
const schemaScripts=[...answers.matchAll(/<script\b[^>]*type="application\/ld\+json"/gi)];
assert.equal(schemaScripts.length,0,'FAQ snippets are human content; do not imply Google FAQ rich-result eligibility');
console.log('PASS: five unique coach buyer answers, live product specs and CTA links, accessible HTML, and no fake performance or safety claims.');
