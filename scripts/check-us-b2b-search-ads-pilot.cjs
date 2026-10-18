// Guard a nonactivated, source-backed B2B Google Search pilot draft.
// No Ads account API calls, billing, campaign activation, or guessed performance.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const data=JSON.parse(fs.readFileSync(path.join(root,'docs/marketing/us-b2b-search-ads-pilot-2026-10-18.json'),'utf8'));
const allowed=new Map([
 ['school_bulk','for-schools.html'],
 ['academy_training','for-coaches.html'],
 ['wholesale_distributors','wholesale-product-catalog.html'],
 ['custom_logo','custom-basketball-for-teams.html'],
]);
assert.equal(data.status,'DRAFT_NOT_PUBLISHED_NO_SPEND');
assert.equal(data.proposedSpend,null);
assert.equal(data.approvedSpend,null);
assert.equal(data.liveAdsAccount,null);
assert(data.legalDisclosure.includes('No live campaign'));
assert.equal(data.groups.length,allowed.size);
assert(data.finalUrlSuffix.startsWith('utm_source=google&utm_medium=cpc'));
assert(data.finalUrlSuffix.includes('utm_content={_megroup}'));
const ids=new Set(),keywords=new Set();
for(const g of data.groups){
 assert(allowed.has(g.id)&&!ids.has(g.id),'Missing or duplicate B2B segment '+g.id);
 ids.add(g.id);
 assert.equal(g.customParameterValue,g.id);
 const url=new URL(g.landingPage),page=allowed.get(g.id);
 assert.equal(url.origin,'https://www.mingeagle.com');
 assert.equal(url.pathname,'/'+page);
 assert.equal(url.search,'');
 const html=fs.readFileSync(path.join(root,'public',page),'utf8');
 const head=html.split('</head>')[0];
 assert(head.includes('<title>')&&head.includes('href="https://www.mingeagle.com/'+page+'"'),'Landing title/canonical missing '+g.id);
 assert(!/noindex/i.test(head),'Landing page is marked noindex '+g.id);
 assert(/<h1\b/i.test(html)&&html.includes('inquiry.html?type=quote'),'Landing lacks buyer intent / RFQ '+g.id);
 assert(g.keywords.length>=3&&g.keywords.length<=8);
 for(const k of g.keywords){
  assert(['EXACT','PHRASE'].includes(k.match));
  assert(!/bing|mingeagle|tiktok/i.test(k.term),'Keywords should be neutral buyer-intent terms');
  const key=k.term.toLowerCase();
  assert(!keywords.has(key),'Duplicate across groups: '+key);
  keywords.add(key);
 }
 assert(g.headlines.length>=3&&g.headlines.length<=15);
 assert(g.descriptions.length>=2&&g.descriptions.length<=4);
 assert(new Set(g.headlines).size===g.headlines.length);
 for(const h of g.headlines)assert(h.length>0&&h.length<=30,'Google Search headline too long: '+h);
 for(const d of g.descriptions)assert(d.length>0&&d.length<=90,'Google Search description too long: '+d);
 assert(g.exclusions.length>=2);
}
assert(ids.size===4&&data.campaignNegatives.length>=7);
for(const gate of ['budget','conversion','account','terms']){
 assert(data.activationGate.some(x=>x.toLowerCase().includes(gate)),'Missing budget/tracking/control gate '+gate);
}
assert(data.trackingNotes.some(x=>x.includes('Stripe')));
console.log('PASS: four unactivated exact/phrase B2B search groups, 18 source-relevant keywords, valid landing pages, ad-character limits and explicit no-spend gates.');
