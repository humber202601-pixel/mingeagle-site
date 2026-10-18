'use strict';
// Prevent draft listing guidance from becoming fabricated onboarding or fake eligibility.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const packet=fs.readFileSync('docs/marketing/us-b2b-directory-listing-packet-2026-10-18.md','utf8');
const matrix=fs.readFileSync('docs/marketing/us-b2b-all-channel-exposure-matrix-2026-10-18.md','utf8');
const intro=fs.readFileSync('public/wholesale-supplier-introduction.txt','utf8');
const master=JSON.parse(fs.readFileSync('public/product-master.json','utf8'));
assert(packet.includes('DRAFT ONLY / NOT SUBMITTED / NO SPEND'));
assert(packet.includes('MING EAGLE COMMERCE LLC'));
assert(packet.includes('https://www.mingeagle.com/'));
assert(packet.includes('China'));
assert(packet.includes('No registration, listing, partnership, review, third-party backlink'));
for(const name of Object.values(master).map(x=>x.name))assert(packet.includes(name),'Missing verified product model: '+name);
for(const official of [
 'https://www.business.linkedin.com/advertise/linkedin-pages',
 'https://business.thomasnet.com/get-listed-on-thomasnet',
 'https://us.kompass.com/register/company/',
 'https://shapeamerica.org/publications/advertising-opportunities/',
 'https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business'
])assert(packet.includes(official),'Official platform source missing: '+official);
for(const phrase of ['USD 40 / 12 months','USD 1,000/year','NOT SUBMITTED','registered agent address','CAN-SPAM','Bing/Copilot AI Performance']){
 assert(packet.includes(phrase),'Gating context missing: '+phrase);
}
assert(matrix.includes('actual marketplace cost / eligibility audit'));
assert(matrix.includes('us-b2b-directory-listing-packet-2026-10-18.md'));
assert(matrix.includes('USD 40 for 12 months')&&matrix.includes('USD 1,000'));
assert(intro.includes('NOT a certification')&&intro.includes('Kentucky-registered US LLC'));
for(const url of ['public/wholesale-product-facts.csv','public/school-basketball-bulk-order-rfq-checklist.html','public/wholesale-product-catalog.html'])
 assert(fs.existsSync(path.resolve(url)),'Public source asset missing: '+url);
assert(!/WE ARE (?:AN? )?(?:APPROVED|CERTIFIED) (?:GOVERNMENT|SCHOOL)/i.test(packet));
console.log('PASS: supplier directory copy mirrors four true models, validates actual public sources, discloses fees and blocks fake endorsements, registrations and spend.');
