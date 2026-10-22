'use strict';
// Verify earned-editorial resources are fact-first, non-transactional and unsent.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const press=fs.readFileSync('public/editorial-review-facts.txt','utf8');
const research=fs.readFileSync('docs/marketing/earned-editorial-outreach-2026-10-22.md','utf8');
const readme=fs.readFileSync('README.md','utf8');
const models=[
 'Flocked Silent Basketball Set','Fabric-Cover Silent Basketball Set',
 'Weighted Flocked Silent Basketball','Flocked Silent Soccer Ball'
];
for(const model of models)assert(press.includes(model),'Missing actual model: '+model);
for(const url of [
 'https://www.mingeagle.com/wholesale-product-catalog.html',
 'https://www.mingeagle.com/wholesale-product-facts.csv',
 'https://www.mingeagle.com/indoor-ball-sample-comparison-protocol.txt',
 'https://www.mingeagle.com/indoor-ball-trial-blank.csv'
])assert(press.includes(url),'Source missing from fact sheet: '+url);
assert(readme.includes('https://www.mingeagle.com/editorial-review-facts.txt'),'README must expose the original fact sheet');
for(const phrase of ['not an independent endorsement','no test data','not certified','not require a review','sample does not require a review']){
 assert(press.toLowerCase().includes(phrase.toLowerCase())||press.toLowerCase().includes(phrase.toLowerCase().replace('not require','does not require')),
 'Editorial ethics/evidence limitation missing: '+phrase);
}
for(const url of [
 'https://recmanagement.com/faq',
 'https://recmanagement.com/contact-us',
 'https://www.sportsfeelgoodstories.com/contact-us/',
 'https://peuniverse.com/log-in/'
])assert(research.includes(url),'Missing editorial contact/source: '+url);
assert(research.includes('RESEARCHED AND DRAFTED, NOT SENT'),'Drafts must not be presented as sent');
assert(research.includes('NO signup')===false); // Avoid inventing an authorless sign-up claim.
assert(!/status:\s*(?:SENT|PUBLISHED|APPROVED|ENDORSED)/i.test(research),'Unverified publication claim');
assert(!/guaranteed (?:backlink|recommendation|publication|citation)/i.test(press));
console.log('PASS: media fact sheet has honest first-party links, ethical review disclosures and unsent source-backed editorial targets.');
