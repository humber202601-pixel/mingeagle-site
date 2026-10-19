'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '../public/ga4-consent.js'), 'utf8');

function createHarness(choice, disabled = false) {
  const collected = [];
  const localStorage = { getItem: key => key === 'mingeagle_analytics_consent_v1' ? choice : null };
  const browser = {
    localStorage,
    sessionStorage: { getItem: () => null },
    __mingeagleGa4Loaded: true,
    location: { href: 'https://www.mingeagle.com/inquiry.html?email=private%40example.com', hostname: 'www.mingeagle.com' },
    gtag: (...args) => collected.push(args),
    'ga-disable-G-J0YYCB85PM': disabled
  };
  const document = {
    documentElement: { lang: 'en' },
    readyState: 'loading',
    addEventListener: () => {}
  };
  vm.runInNewContext(src, { window: browser, document, URL, Object, Date }, { filename: 'ga4-consent.js' });
  assert.equal(typeof browser.MingEagleGA4?.trackConfirmedLead, 'function');
  return { browser, collected };
}

const accepted = createHarness('accepted');
assert.equal(accepted.browser.MingEagleGA4.trackConfirmedLead('Wholesale quote', 'primary_crm'), true);
assert.equal(accepted.collected.length, 1);
assert.equal(accepted.collected[0][0], 'event');
assert.equal(accepted.collected[0][1], 'generate_lead');
const primaryParams = accepted.collected[0][2];
assert.equal(primaryParams.send_to, 'G-J0YYCB85PM');
assert.equal(primaryParams.lead_type, 'wholesale');
assert.equal(primaryParams.lead_delivery, 'primary_crm');
assert.equal(primaryParams.page_location, 'https://www.mingeagle.com/inquiry.html');
assert.equal(Object.keys(primaryParams).sort().join(','), 'lead_delivery,lead_type,page_location,send_to');
assert(!JSON.stringify(primaryParams).includes('private%40example.com'));

accepted.browser.MingEagleGA4.trackConfirmedLead('Customer name: Bob; email: bob@example.com', 'unknown payload');
assert.equal(accepted.collected[1][2].lead_type, 'other');
assert.equal(accepted.collected[1][2].lead_delivery, 'other');
assert(!JSON.stringify(accepted.collected).includes('bob@example.com'));

const rejected = createHarness('rejected');
assert.equal(rejected.browser.MingEagleGA4.trackConfirmedLead('Wholesale quote', 'primary_crm'), false);
assert.equal(rejected.collected.length, 0);

const disabled = createHarness('accepted', true);
assert.equal(disabled.browser.MingEagleGA4.trackConfirmedLead('Wholesale quote', 'primary_crm'), false);
assert.equal(disabled.collected.length, 0);
console.log('PASS: accepted confirmed leads emit only sanitized enum parameters; rejected/disabled analytics emit nothing.');
