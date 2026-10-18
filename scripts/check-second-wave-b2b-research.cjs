// Audit that public outreach research remains research: never treat it as sent or purchased.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(process.argv[2]||'.');
const json=JSON.parse(fs.readFileSync(path.join(root,'docs/marketing/us-b2b-second-wave-research-2026-10-18.json'),'utf8'));
const guide=fs.readFileSync(path.join(root,'docs/marketing/us-b2b-second-wave-actions-2026-10-18.md'),'utf8');
const mainSitemap=fs.readFileSync(path.join(root,'public/sitemap.xml'),'utf8');
assert.equal(json.version,1);
assert.equal(json.createdOn,'2026-10-18');
assert.equal(json.status,'RESEARCHED_NOT_CONTACTED');
assert.equal(json.sourcesCount,12);
assert.equal(json.records.length,12);
const ids=new Set(),urls=new Set(),companies=new Set(),routes=new Set();
for(let i=0;i<12;i++){
 const p=json.records[i],expected='ME-US-B2B-'+String(i+9).padStart(3,'0');
 assert.equal(p.id,expected,'Use 12 contiguous unique second-wave references');
 assert(!ids.has(p.id)&&!urls.has(p.officialUrl)&&!companies.has(p.organization),'Duplicate partner record');
 ids.add(p.id);urls.add(p.officialUrl);companies.add(p.organization);routes.add(p.contactRouteType);
 for(const key of ['organization','segment','priority','officialUrl','contactRouteType','contactRouteUrl','observedEvidence','fitHypothesis','nextAction','confidence','lastSourceCheckOn'])assert(typeof p[key]==='string'&&p[key].trim(),'Blank source field '+p.id+' '+key);
 for(const key of ['officialUrl','contactRouteUrl']){const u=new URL(p[key]);assert.equal(u.protocol,'https:');assert(u.hostname.includes('.'));assert(!u.username&&!u.password);}
 if(p.publicOrganizationContact!==null)assert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.publicOrganizationContact),'Only public organizational contact, if verified');
 assert.equal(p.stage,'RESEARCHED');
 for(const k of ['contacted','replyReceived','qualifiedBuyer','quoteIssued','paidOrder'])assert.equal(p[k],false,'No fabricated business outcome '+p.id+' '+k);
 assert.equal(p.buyerIntent,'UNKNOWN');
 assert.equal(p.supplierInquiryAllowed,'UNCONFIRMED');
 assert.equal(p.lastSourceCheckOn,'2026-10-18');
 assert(guide.includes(p.officialUrl),'Research must link to source in summary '+p.id);
}
assert(routes.has('supplier_information_application')&&routes.has('become_a_supplier')&&routes.has('vendor_qualification_portal'),'Document distinct actual retailer supplier intake routes');
for(const path of ['wholesale-product-catalog.html','school-basketball-bulk-order-rfq-checklist.html']){
 assert(mainSitemap.includes('https://www.mingeagle.com/'+path),'Shared content must be canonical and real');
 assert(guide.includes('https://www.mingeagle.com/'+path),'Preserve truthful live material links');
}
for(const keyword of ['0 contacted','0 replies','0 commercial applications submitted','UNSENT','CAN-SPAM','PENDING VERIFIED COMMERCIAL REVIEW'])assert(guide.includes(keyword),'Status or compliance gate missing: '+keyword);
assert(!/^\s*CONTACTED\s*:/m.test(guide),'Do not recast drafts as sent');
console.log('PASS: 12 new official-source candidates with unique evidence, no invented buyer intent, actual sends, sales, prices, or supplier approvals; first-party collateral and compliance gates checked.');
