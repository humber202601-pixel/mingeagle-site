// Verify concrete school / team-logo intent answers in built static site.
// A ranking impression is not proof of sales, AI citations or buyer conversion.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=process.argv[2]||'public';
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const team=read('custom-basketball-for-teams.html'),school=read('for-schools.html'),map=read('sitemap.xml');
const pages=[
 {name:'custom-basketball-for-teams.html',html:team,marker:'MING EAGLE SCHOOL TEAM LOGO BUYER Q&A 20261018',
  title:'Custom Logo Basketballs for Teams &amp; Schools | MING EAGLE',num:4,
  phrases:['Custom team basketballs with logos: what can a school, club or distributor actually order?',
   'Which MING EAGLE basketballs support logo previews?',
   'Can a team upload artwork or start with a text logo?',
   'Can schools or sports clubs request 10 or more logo basketballs?',
   'What does a custom basketball quotation need to include?',
   'not regulation match basketballs','preview is not a production approval'],
  links:['silent-basketball.html','weighted-flocked-basketball.html','custom-logo.html','school-basketball-bulk-order-rfq-checklist.html','wholesale-product-catalog.html','for-schools.html']},
 {name:'for-schools.html',html:school,marker:'MING EAGLE SCHOOL BASKETBALL BUYER Q&A 20261018',
  title:'Basketballs for Schools: Indoor PE &amp; Bulk Orders | MING EAGLE',num:4,
  phrases:['Basketballs for schools: choosing indoor activity balls and ordering in bulk',
   'Which basketball size should a school consider?',
   'Do soft silent basketballs eliminate gym or classroom noise?',
   'Can a school order samples before buying 10+ balls?',
   'Can school teams buy branded indoor practice basketballs?',
   'not regulation basketball replacements','does not supply independent acoustic test results'],
  links:['wholesale-product-catalog.html','silent-basketball-vs-regular.html','school-basketball-bulk-order-rfq-checklist.html','custom-basketball-for-teams.html']}
];
for(const p of pages){
 const {html,name,marker}=p;
 const begin='<!-- '+marker+' BEGIN -->',end='<!-- '+marker+' END -->';
 assert.equal(html.split(begin).length-1,1,'One buyer answer section must exist: '+name);
 assert.equal(html.split(end).length-1,1,'Buyer section end missing: '+name);
 const section=html.split(begin)[1].split(end)[0];
 assert(html.indexOf(begin)<html.lastIndexOf('</main>'),'Q&A must remain inside main '+name);
 for(const phrase of p.phrases)assert(section.includes(phrase),'Buyer question or caveat missing '+name+': '+phrase);
 assert.equal((section.match(/<h3>/g)||[]).length,p.num,'Substantive buyer questions missing '+name);
 assert(html.includes('<title>'+p.title+'</title>'),'Unambiguous buyer intent page title missing '+name);
 assert(html.includes('https://www.mingeagle.com/'+name),'Canonical URL missing '+name);
 assert(html.includes('"dateModified": "2026-10-18"')||html.includes('"dateModified":"2026-10-18"'),
  'Editorial date metadata must be exact and source-backed '+name);
 assert(map.includes('<loc>https://www.mingeagle.com/'+name+'</loc><lastmod>2026-10-18</lastmod>'),
  'Only actually updated buyer pages receive fresh sitemap modified dates '+name);
 for(const dest of p.links){
  assert(section.includes('href="'+dest+'"'),'Direct buyer link missing '+name+': '+dest);
  assert(fs.existsSync(path.join(root,dest)),'Linked destination absent: '+dest);
 }
 assert(/inquiry.html\?type=quote&amp;customer=/.test(section),'No exact wholesale RFQ conversion route: '+name);
 assert(!/independently tested|guaranteed noise reduction|government[- ]certified|automatically tax[- ]exempt/i.test(section),
  'False safety, noise or tax claims in '+name);
 assert(section.length>1600,'Thin buyer page section '+name);
}
const generator=fs.readFileSync('scripts/build-learning.py','utf8');
assert(generator.includes("team_editorial=existing[a:b]"),'Static team Q&A must survive full site regeneration');
assert(generator.includes("title='Custom Logo Basketballs for Teams & Schools'"),
 'Generated team SEO metadata must remain synchronized');
console.log('PASS: two factual school/team-logo pages, eight buyer answers, canonical and sitemap revisions, direct RFQ links, and generated team content persisted.');
