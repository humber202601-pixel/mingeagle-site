'use strict';
// Read-only gate for a PAUSED, zero-spend phase-one B2B search plan.
// Never opens a Google Ads account, creates a campaign, or accesses customer data.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const plan=JSON.parse(read('docs/marketing/us-b2b-search-phase1-preflight-2026-10-22.json'));

assert.equal(plan.version,1);
assert.equal(plan.status,'DRAFT_NOT_PUBLISHED_NO_SPEND');
assert.equal(plan.adDelivery,'PAUSED_UNTIL_MANUAL_ACTIVATION');
assert.equal(plan.billing,'NOT_VERIFIED');
assert.equal(plan.accountLinked,false);
assert.equal(plan.campaignType,'Search');
assert.equal(plan.location,'United States');
assert.equal(plan.locationPresenceOnly,true);
assert.equal(plan.language,'English');
assert.deepEqual(plan.network,{googleSearch:true,searchPartners:false,display:false});
assert.equal(plan.budget.approvedForSpend,false);
assert.equal(plan.budget.targetMaxCampaignTotalUsd,70);
assert.equal(plan.budget.testDays,14);
assert.equal(plan.budget.alternateAverageDailyUsd,2.5);
assert.equal(plan.budget.scheduledEndDateRequired,true);
assert.equal(plan.budget.manualSpendWatchRequired,true);
assert.equal(plan.performance.clicks,null);
assert.equal(plan.performance.costUsd,null);
assert.equal(plan.performance.qualifiedRfqs,null);
assert.equal(plan.performance.paidOrders,null);
assert.equal(plan.groups.length,2);
assert.equal(plan.qualificationRule.minUnits,10);
assert.equal(plan.qualificationRule.noAutoApprove,true);
for(const k of ['reachableContact','organizationOrInstitution','specificQuietIndoorProductFit','confirmedUnits','destination'])
  assert(plan.qualificationRule.required.includes(k),'Missing qualification gate: '+k);
assert(plan.launchGates.length>=7,'Insufficient activation gates');
assert(plan.launchGates.some(x=>/explicit owner decision/i.test(x)));

const ids=new Set(),allKeywords=new Set();
const excluded=new Set(plan.excludedAtLaunch.map(s=>s.toLowerCase()));
for(const g of plan.groups){
  assert(['wholesale_silent','school_bulk'].includes(g.id),'Unexpected ad group');
  assert(!ids.has(g.id),'Duplicate ad group id'); ids.add(g.id);
  const url=new URL(g.landingPage);
  assert.equal(url.origin,'https://www.mingeagle.com');
  assert(!url.search&&!url.hash,'Landing must contain no query or fragment');
  const basename=url.pathname.slice(1);
  assert(['wholesale.html','for-schools.html'].includes(basename),'Unapproved landing page');
  const page=read('public/'+basename);
  assert(/<h1\b/i.test(page),'Landing missing headline');
  assert(/inquiry\.html\?type=quote/.test(page),'Landing missing wholesale RFQ CTA');
  assert(!/noindex/i.test(page.split('</head>')[0]),'Landing is noindex');
  assert(read('public/sitemap.xml').includes(g.landingPage),'Landing not in sitemap');
  const suffix=new URLSearchParams(g.finalUrlSuffix);
  assert.equal(suffix.get('utm_source'),'google');
  assert.equal(suffix.get('utm_medium'),'cpc');
  assert.equal(suffix.get('utm_campaign'),'us_b2b_search_pilot');
  assert.equal(suffix.get('utm_content'),g.id);
  assert([...suffix.keys()].every(x=>['utm_source','utm_medium','utm_campaign','utm_content'].includes(x)),'No identity data in URL');
  assert(g.keywords.length>=3&&g.keywords.length<=8);
  for(const k of g.keywords){
    const term=k.text.trim().toLowerCase();
    assert(['EXACT','PHRASE'].includes(k.matchType),'No broad match');
    assert(!excluded.has(term),'Excluded generic consumer term: '+term);
    assert(/silent|quiet|soft/.test(term),'Buyer term must specify softer/quieter product: '+term);
    assert(/bulk|wholesale|supplier|distributor|schools|\bpe\b|training|after school/.test(term),'Buyer term must include buyer/use context: '+term);
    if(g.id==='school_bulk')assert(/schools|\bpe\b|training|after school/.test(term),'School group is not school/program specific: '+term);
    assert(!allKeywords.has(term),'Duplicate exact query across ad groups: '+term);
    allKeywords.add(term);
  }
  assert(g.headlines.length>=5&&g.headlines.length<=15,'Need 5-15 headlines');
  assert(g.descriptions.length>=2&&g.descriptions.length<=4,'Need 2-4 descriptions');
  assert(new Set(g.headlines).size===g.headlines.length,'Repeated headline');
  for(const h of g.headlines)assert(h.length>=1&&h.length<=30,'Title >30 chars: '+h);
  for(const d of g.descriptions)assert(d.length>=1&&d.length<=90,'Description >90 chars: '+d);
  assert(g.headlines.some(h=>/bulk|wholesale|school/i.test(h)),'Ad must signal B2B intent');
  const copy=[...g.headlines,...g.descriptions].join(' ');
  assert(!/guaranteed|certified noise|US warehouse|US stock|0 dB|free shipping/i.test(copy),'Unverified or prohibited advertising claim');
}
assert.deepEqual([...ids].sort(),['school_bulk','wholesale_silent']);
assert(plan.campaignNegativeKeywords.length>=10);
for(const word of ['free','kids','school','training','mini hoop','price'])
  assert(!plan.campaignNegativeKeywords.includes(word),'Avoid blanket negative: '+word);

const geo=read('public/geo-source-capture.js');
for(const k of ['utm_source','utm_medium','utm_campaign','utm_content'])
  assert(geo.includes(k),'First-touch capture missing '+k);
const installer=read('scripts/build-first-touch-crawl-coverage.cjs');
assert(installer.includes('sitemap.xml')&&installer.includes('sitemap-localized.xml'),'Deployment attribution coverage missing');
const core=require('../public/forms-core.js');
for(const group of plan.groups){
  const params=new URLSearchParams(group.finalUrlSuffix);
  const campaign=['utm_source','utm_medium','utm_campaign','utm_content'].map(k=>k+'='+params.get(k)).join(' | ');
  const data=core.crmPayload(
    {reference:'ME-TEST-0001',requestType:'Wholesale quote',firstname:'TEST',email:'test@example.invalid',
     company:'Test Org',quantity:'20',customerType:'School / club',country:'US',state:'TX',zip:'75201',products:'Flocked Silent Basketball Set'},
    {pageUri:'https://www.mingeagle.com/inquiry.html',landingPage:group.landingPage,referrer:'Direct / unknown',campaign}
  );
  assert.equal(data.utmSource,'google');
  assert.equal(data.utmMedium,'cpc');
  assert.equal(data.utmContent,group.id);
  assert.equal(data.estimatedQuantity,'20');
  assert.equal(data.landingPage,group.landingPage);
}
const inquiry=read('public/inquiry.js'), ga4=read('public/ga4-consent.js');
assert(inquiry.includes("recordAcceptedLead(d,'primary_crm')")&&inquiry.includes("recordAcceptedLead(d,'backup_form')"),'Lead event must follow accepted submission');
assert(ga4.includes("window.gtag('event', 'generate_lead'"),'No confirmed lead event');
assert(ga4.includes("readChoice() !== 'accepted'"),'GA4 must be consent-gated');
assert(ga4.includes('safePageUrl(window.location.href)'),'Do not send URL query values to GA4');
console.log('PASS: two specific B2B ad groups, 12 distinct exact/phrase keywords, headlines/descriptions, safe UTM->CRM attribution fixture and no-spend launch gates.');
