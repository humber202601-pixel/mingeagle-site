// Honest, unique buyer questions on existing school and custom team pages.
// Must run after build-learning.py (which regenerates the custom team page).
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]&&!process.argv[2].startsWith('--')?process.argv[2]:'public');
const check=process.argv.includes('--check');
const data=[
 {name:'custom-basketball-for-teams.html',marker:'TEAM LOGO BUYER ANSWERS',kind:'Article',body:[
 '<section class="section" id="team-logo-bulk-buyer-questions"><div class="wrap">',
 '<div class="eyebrow">TEAM LOGO BASKETBALLS · BULK RFQ</div>',
 '<h2>Where can schools and basketball clubs request custom-logo silent basketballs?</h2>',
 '<p class="lead">MING EAGLE accepts written RFQs for logo-eligible soft basketballs. A digital design preview is not a manufactured sample, printing guarantee or accepted purchase order.</p>',
 '<div class="trustGrid">',
 '<article><h3>Which ball models are eligible for a logo preview?</h3><p>The <a href="silent-basketball.html">flocked silent basketball set</a> and <a href="weighted-flocked-basketball.html">weighted flocked basketball</a> have logo preview support. The <a href="fabric-silent-basketball.html">fabric-covered set</a> is not currently customization-ready. Confirm actual print feasibility, placement and colors before ordering.</p></article>',
 '<article><h3>Can we buy 10 or more team-logo basketballs?</h3><p>Yes, 10 or more units can enter the wholesale quotation process. Final manufacturer minimums, approved variants, artwork, supplier terms and quantity discounts require individual review. No universal logo-printing minimum is promised.</p></article>',
 '<article><h3>How do we send artwork for approval?</h3><p>Use the <a href="custom-logo.html">interactive logo preview</a> to explore text or uploaded artwork. This is a visual mockup only: final artwork, production proof, size and print method are confirmed in a reviewed quotation.</p></article>',
 '<article><h3>What must the team purchase quote include?</h3><p>Specify product, size and variant quantities, destination ZIP, branding requirements and desired delivery date. Request an itemized unit price, artwork review, packaging, freight, customs responsibility, sales-tax treatment and estimated lead times. Sea shipping estimates are not guaranteed production dates.</p></article>',
 '<article><h3>Are these regulation competition basketballs?</h3><p>No. These soft, non-inflatable products are for controlled indoor activities and supervised handling; they are not certified regulation-match balls. There are no independent decibel-reduction results claimed.</p></article>',
 '</div><div class="actions"><a class="btn primary" href="inquiry.html?type=quote&amp;customer=business">Request a written team-logo quotation</a><a class="btn" href="school-basketball-bulk-order-rfq-checklist.html">School purchase checklist</a></div></div></section>'
 ].join('')},
 {name:'for-schools.html',marker:'SCHOOL BULK BUYER ANSWERS',kind:'WebPage',body:[
 '<section class="schoolSection alt" id="school-basketball-bulk-buyer-questions"><div class="wrap">',
 '<div class="eyebrow">BASKETBALLS FOR SCHOOLS · BUYER QUESTIONS</div>',
 '<h2>How should schools choose and order indoor basketballs for PE in bulk?</h2>',
 '<p class="lead">Compare ball sizes, planned supervised activities and written purchasing terms instead of assuming soft balls are interchangeable with regulation basketballs.</p>',
 '<div class="schoolProcureGrid">',
 '<article class="schoolProcureCard"><h3>How many basketballs qualify for wholesale?</h3><p>For 10 or more units, submit a <a href="inquiry.html?type=quote&amp;customer=school">school bulk RFQ</a> with quantity by model, size and color. Discounts, supplier MOQ, stock and freight are reviewed in the written quote.</p></article>',
 '<article class="schoolProcureCard"><h3>What should the school sample pilot evaluate?</h3><p>Assess size, texture, handling, surfaces, cleaning and supervised indoor suitability. Soft construction does not remove footstep noise or floor vibration. No measured acoustic rating is claimed.</p></article>',
 '<article class="schoolProcureCard"><h3>Can a school order a custom team logo?</h3><p>The <a href="custom-basketball-for-teams.html">logo basketball team guide</a> describes two eligible flocked models and an artwork preview. Confirm design proof, factory feasibility, quantities and final pricing before approval.</p></article>',
 '<article class="schoolProcureCard"><h3>What documents should purchasing officers request?</h3><p>List intended uses, delivery ZIP and deadlines. Check product specifications, available safety documentation, customs and freight terms, sales tax, any exemption requirements and supplier onboarding. Use the <a href="school-basketball-bulk-order-rfq-checklist.html">school RFQ checklist</a> and <a href="procurement.html">institutional buyer guide</a>. No government vendor approval is assumed.</p></article>',
 '</div><div class="actions"><a class="btn primary" href="inquiry.html?type=quote&amp;customer=school">Request school wholesale quotation</a><a class="btn" href="inquiry.html?type=sample&amp;customer=school">Ask about samples</a></div></div></section>'
 ].join('')}
];
for(const item of data){
 const file=path.join(root,item.name),original=fs.readFileSync(file,'utf8');
 const start='<!-- MING EAGLE '+item.marker+' 20261018 BEGIN -->';
 const end='<!-- MING EAGLE '+item.marker+' 20261018 END -->';
 let html=original;
 if(html.includes(start)){
  const a=html.indexOf(start),b=html.indexOf(end,a);
  assert(b>a,item.name+' missing marker end');
  html=html.slice(0,a)+html.slice(b+end.length);
 }
 assert(html.includes('</main>'),item.name+' no accessible main');
 html=html.replace('</main>',start+item.body+end+'</main>');
 const match=html.match(/<script type="application\/ld\+json" id="(?:learning-schema|school-page-schema)">([\s\S]*?)<\/script>/);
 assert(match,item.name+' requires original JSON-LD schema');
 const schema=JSON.parse(match[1]),target=(schema['@graph']||[]).find(x=>x['@type']===item.kind);
 assert(target,item.name+' needs its original page/article type');
 target.dateModified='2026-10-18';
 html=html.replace(match[1],JSON.stringify(schema));
 if(check)assert.equal(original,html,item.name+' latest built content mismatch');
 else if(html!==original)fs.writeFileSync(file,html);
}
console.log('PASS: B2B school and custom logo buyer answers built once and schema content dates verified.');
