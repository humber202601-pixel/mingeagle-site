// Validate both checked-in source and generated public page, without claiming AI citation.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const source=fs.readFileSync('data/custom-team-b2b-buyer-answers.html','utf8');
const builder=fs.readFileSync('scripts/build-learning.py','utf8');
const file=fs.readFileSync('public/custom-basketball-for-teams.html','utf8');
const school=fs.readFileSync('public/for-schools.html','utf8');
const sitemap=fs.readFileSync('public/sitemap.xml','utf8');
const filename='custom-basketball-for-teams.html';
const marker='MING EAGLE CUSTOM TEAM B2B BUYER ANSWERS 20261018 BEGIN';
const start=file.indexOf('<!-- '+marker+' -->');
assert(start>0,'Buyer answers must exist in the real HTML, not just the generator');
assert(file.indexOf(source)===start,'Published buyer answers must match the reviewed first-party source exactly');
assert.equal(file.split(marker).length,2,'No duplicate generated content blocks');
assert(file.indexOf(source)<file.lastIndexOf('</main>'),'Buyer answers must render inside the main document');
assert(builder.includes("Path('data')/'custom-team-b2b-buyer-answers.html'"),'Build must re-insert revised buyer facts');
assert(builder.includes("seo_title='Custom Logo Basketballs for Schools & Teams'"),'Builder must not revert search snippet');
assert(file.includes('<title>Custom Logo Basketballs for Schools & Teams | MING EAGLE</title>'));
assert(file.includes('<meta name="description" content="Compare custom-logo silent basketballs for school teams and clubs.'));
assert(file.includes('<link rel="canonical" href="https://www.mingeagle.com/'+filename+'">'));
assert(file.includes('"dateModified": "2026-10-18"')||
 file.includes('"dateModified":"2026-10-18"'),'Article metadata should reflect the actual edited content');
assert(sitemap.includes('<loc>https://www.mingeagle.com/'+filename+'</loc><lastmod>2026-10-18</lastmod>'));
const answers=source.match(/<details(?: open)?>[\s\S]*?<\/details>/g)||[];
assert.equal(answers.length,6,'Answer six unique school/club procurement questions');
for(const term of [
 'Which silent basketballs can carry our school or team logo?',
 'Can a school request 10, 25, 100 or more customized basketballs?',
 'What school logo artwork can we submit?',
 'Is the logo preview an approved printing proof?',
 'Can a school order one sample before approving a bulk purchase?',
 'What should a delivered custom basketball quote include?',
 '10 or more units','not a finished printed sample','not a committed delivery date',
 'import duties and state sales tax are different charges','have permission to reproduce'
])assert(source.toLowerCase().includes(term.toLowerCase()),'Missing responsible RFQ advice: '+term);
const links=[...source.matchAll(/href="([^"]+)"/g)].map(x=>x[1]);
for(const target of ['silent-basketball.html','weighted-flocked-basketball.html','custom-logo.html',
 'school-basketball-bulk-order-rfq-checklist.html','for-schools.html','wholesale.html']){
 assert(links.includes(target),'Missing crawlable link to '+target);
 assert(fs.existsSync(path.join('public',target)),'Broken target '+target);
}
assert(links.some(x=>x.includes('inquiry.html?type=quote&amp;customer=school')),'School RFQ must remain actionable');
assert(school.includes('href="custom-basketball-for-teams.html"'),'Related school page must link to team-logo buyer guide');
assert(!/(?:government certified|approved vendor for all|guaranteed noise reduction|guaranteed delivery|99% quieter|certified safety tested)/i.test(source),'No invented supplier approval or test data');
const main=file.split('<main id="main-content"')[1]?.split('</main>')[0]||'';
assert.equal((main.match(/<h1\b/g)||[]).length,1,'Do not replace the buyer guide with multiple H1s');
console.log('PASS: exact source-backed school/club team-logo purchasing guide, 6 truthful questions, 6 verified static product/sourcing links, factual metadata and dated canonical sitemap.');
