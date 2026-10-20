'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '../public');
const files = fs.readdirSync(root).filter(function (name) { return /\.html$/i.test(name); });
assert(files.length >= 20, 'Unexpectedly small public HTML catalog');
for (const name of files) {
  const html = fs.readFileSync(path.join(root, name), 'utf8');
  assert.equal((html.match(/data-mingeagle-ga4-consent="styles"/g) || []).length, 1, 'Exactly one GA4 consent stylesheet in ' + name);
  assert.equal((html.match(/data-mingeagle-ga4-consent="script"/g) || []).length, 1, 'Exactly one GA4 consent script in ' + name);
  assert(html.includes('href="/ga4-consent.css?v=20261020-homefix1"'), 'Current cache-busted GA4 CSS URL in ' + name);
  assert(html.includes('src="/ga4-consent.js?v=20261020-homefix1"'), 'Current cache-busted GA4 JS URL in ' + name);
  assert(!html.includes('googletagmanager.com/gtag/js'), 'Google tag must not be embedded before visitor consent: ' + name);
}
const js = fs.readFileSync(path.join(root, 'ga4-consent.js'), 'utf8');
assert(js.includes("var MEASUREMENT_ID = 'G-J0YYCB85PM'"), 'Correct GA4 measurement ID');
assert(js.includes("saveChoice('accepted')") && js.includes("saveChoice('rejected')"), 'Both consent choices must be supported');
assert(js.includes('loadGoogleAnalytics()'), 'GA4 loader must be present');
assert(js.includes("window['ga-disable-' + MEASUREMENT_ID] = true"), 'Consent withdrawal must immediately disable the Google tag');
assert(js.includes("window.location.reload()"), 'Revoking an already loaded Google tag must reload without the tag');
assert(js.includes("revokeGoogleAnalytics()"), 'Reject must revoke already granted tracking');
assert(js.includes("document.cookie.split(';')"), 'Revocation must attempt to clear first-party GA cookies');
assert(js.includes('send_page_view: false'), 'Initial page view must be explicitly sanitized');
assert(js.includes('url.origin + url.pathname'), 'Query strings and fragments must be removed from measured URLs');
assert(js.includes('allow_google_signals: false') && js.includes('allow_ad_personalization_signals: false'), 'Advertising signals must be disabled');
assert(js.includes("window.gtag('event', 'generate_lead'"), 'Only explicit confirmed lead conversion events are counted');
assert(js.includes("readChoice() !== 'accepted'"), 'Lead events must remain consent-gated');
assert(js.includes("lead_type: leadType") && js.includes("lead_delivery: deliveryType"), 'Lead event only carries enum values');
assert(!js.includes("lead_email:") && !js.includes("lead_reference:"), 'Lead events must not send customer identifiers');
const inquirySource = fs.readFileSync(path.join(root, 'inquiry.js'), 'utf8');
const crmConfirmed = inquirySource.indexOf('await sendCrmInquiry(c,d,context');
const crmLead = inquirySource.indexOf("recordAcceptedLead(d,'primary_crm')");
const backupConfirmed = inquirySource.indexOf('await sendPayload(c,buildPayload(d,c,context));');
const backupLead = inquirySource.indexOf("recordAcceptedLead(d,'backup_form')");
assert(crmConfirmed >= 0 && crmLead > crmConfirmed && crmLead < inquirySource.indexOf('}catch(crmError)'), 'Primary lead conversion only after confirmed CRM save');
assert(backupConfirmed >= 0 && backupLead > backupConfirmed && backupLead < inquirySource.indexOf('}catch(backupError)'), 'Backup conversion only after accepted backup submit');

// GA4 errors must not affect CRM success, and repeated form submissions with
// one reference must be counted once in the current page session.
const {recordAcceptedLead} = require(path.join(root, 'inquiry.js'));
const d1={reference:'ME-20261019-ABCDEF12',requestType:'Wholesale quote'};
const previous=global.MingEagleGA4;
const oldWarn=console.warn;
try{
 console.warn=()=>{};
 global.MingEagleGA4={trackConfirmedLead(){throw Error('simulated Google Analytics failure')}};
 assert.doesNotThrow(()=>recordAcceptedLead(d1,'primary_crm'));
 assert.equal(recordAcceptedLead(d1,'primary_crm'),false);
 let sends=0;
 global.MingEagleGA4={trackConfirmedLead(){sends++;return true}};
 assert.equal(recordAcceptedLead(d1,'primary_crm'),true);
 assert.equal(recordAcceptedLead(d1,'backup_form'),false,'same reference must not double count');
 assert.equal(sends,1);
}finally{
 console.warn=oldWarn;
 if(previous===undefined)delete global.MingEagleGA4;else global.MingEagleGA4=previous;
}
const inquiryHtml = fs.readFileSync(path.join(root, 'inquiry.html'), 'utf8');
assert(inquiryHtml.includes('inquiry.js?v=20261020-homefix1'), 'Inquiry script URL must be cache-busted when conversion code changes');
const css = fs.readFileSync(path.join(root, 'ga4-consent.css'), 'utf8');
assert(css.includes('.mingeagle-ga4-panel') && css.includes(':focus-visible'), 'Accessible consent banner styles');
const policy = fs.readFileSync(path.join(root, 'policies.html'), 'utf8');
assert(policy.includes('Google Analytics 4') && policy.includes('query strings') && policy.includes('Privacy settings'), 'Privacy policy must disclose opt-in GA4 and controls');
console.log('PASS: GA4 is opt-in, query strings are excluded, advertising signals are disabled, privacy disclosure is present, and all public HTML pages load exactly one consent UI.');