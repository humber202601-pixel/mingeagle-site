import assert from 'node:assert/strict';

const base = 'https://www.mingeagle.com/';
const files = ['', 'ga4-consent.js?v=20261022-footerprivacy1', 'ga4-consent.css?v=20261022-footerprivacy1', 'policies.html', 'inquiry.html', 'inquiry.js?v=20261020-ga4lead1'];

async function get(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(20000),
    headers: { 'User-Agent': 'MING-EAGLE-live-GA4-check/1.0', 'Cache-Control': 'no-cache' }
  });
  assert.equal(response.status, 200, 'HTTP 200 required for ' + url);
  return response.text();
}

const results = await Promise.all(files.map(name => get(base + name)));
const [index, js, css, policies, inquiryHtml, inquiry] = results;
const count = (str, token) => str.split(token).length - 1;
assert.equal(count(index, 'data-mingeagle-ga4-consent="script"'), 1, 'Homepage must load exactly one consent controller');
assert.equal(count(index, 'data-mingeagle-ga4-consent="styles"'), 1, 'Homepage must load exactly one consent stylesheet');
assert.equal(count(index, 'googletagmanager.com/gtag/js'), 0, 'Google tracking tag must not load directly from HTML before consent');
assert(index.includes('/ga4-consent.js?v=20261022-footerprivacy1') && index.includes('/ga4-consent.css?v=20261022-footerprivacy1'), 'Homepage must reference the exact current GA4 cache-busted assets');
assert(js.includes('G-J0YYCB85PM'), 'Correct GA4 measurement ID must be live');
assert(js.includes('revokeGoogleAnalytics()') && js.includes("window['ga-disable-' + MEASUREMENT_ID] = true"), 'Consent withdrawal must be live');
assert(js.includes('url.origin + url.pathname'), 'Page locations must be sanitized');
assert(css.includes('.mingeagle-ga4-panel'), 'Consent control CSS must be available');
assert(css.includes('.footer .mingeagle-ga4-settings'), 'Privacy settings must use normal footer styling');
assert(!css.includes('.mingeagle-ga4-settings {\\n  position: fixed'), 'Privacy settings must not float over the cart');
assert(js.includes("document.createElement('a')") && js.includes("settings.href = '/policies.html#privacy'"), 'Privacy settings must be a footer link with a useful fallback');
assert(js.includes("document.querySelector('.footer .footgrid > div:last-child')"), 'Privacy settings must be appended to the existing footer');
assert(policies.includes('Google Analytics 4') && policies.includes('Privacy settings link in the website footer'), 'GA4 privacy notice must disclose the footer settings link');
assert(js.includes("window.gtag('event', 'generate_lead'") && js.includes('trackConfirmedLead'), 'Live GA4 must expose the confirmed-lead event');
assert(inquiryHtml.includes('inquiry.js?v=20261020-ga4lead1') && inquiryHtml.includes('forms-core.js?v=20261019-usstate1'), 'Inquiry HTML must reference the exact cache-busted inquiry and forms assets');
assert(inquiry.includes('function recordAcceptedLead(data,delivery)'), 'Live inquiry must guard optional analytics independently of CRM success');
assert(inquiry.includes('root.MingEagleGA4.trackConfirmedLead(data.requestType,delivery)'), 'Live inquiry must call the consent-gated GA4 tracker through its safe wrapper');
const crmConfirmed = inquiry.indexOf('await sendCrmInquiry(c,d,context');
const crmLead = inquiry.indexOf("recordAcceptedLead(d,'primary_crm')");
const backupConfirmed = inquiry.indexOf('await sendPayload(c,buildPayload(d,c,context));');
const backupLead = inquiry.indexOf("recordAcceptedLead(d,'backup_form')");
assert(crmConfirmed >= 0 && crmLead > crmConfirmed && crmLead < inquiry.indexOf('}catch(crmError)'), 'Live primary lead event must follow confirmed CRM acceptance');
assert(backupConfirmed >= 0 && backupLead > backupConfirmed && backupLead < inquiry.indexOf('}catch(backupError)'), 'Live backup lead event must follow accepted backup submission');
assert(policies.includes('generic completed-lead event') && policies.includes('without sending the reference or form contents'), 'Privacy policy must disclose generic lead conversion tracking');
console.log('PASS: exact versioned GA4 and inquiry assets, consent/revocation, confirmed-lead success gates, privacy disclosure and sanitized URLs are published.');
