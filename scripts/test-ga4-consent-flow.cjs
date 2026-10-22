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


// Exercise the real consent UI with a tiny DOM harness: the settings entry is
// always available in the footer, opens the panel, and never floats over cart UI.
function createConsentUiHarness(initialChoice) {
  const byId = Object.create(null);
  const footerColumn = makeElement('div');
  const body = makeElement('body');
  const head = makeElement('head');
  let choice = initialChoice;
  let reloads = 0;
  const localStorage = {
    getItem: key => key === 'mingeagle_analytics_consent_v1' ? choice : null,
    setItem: (key, value) => { if (key === 'mingeagle_analytics_consent_v1') choice = value; }
  };
  const document = {
    documentElement: { lang: 'en' },
    readyState: 'complete',
    body,
    head,
    cookie: '',
    createElement: tag => makeElement(tag),
    getElementById: id => byId[id] || null,
    querySelector: selector => selector === '.footer .footgrid > div:last-child' ? footerColumn : null
  };
  const browser = {
    localStorage,
    sessionStorage: { getItem: () => null, setItem: () => {} },
    location: {
      href: 'https://www.mingeagle.com/',
      hostname: 'www.mingeagle.com',
      reload: () => { reloads++; }
    },
    addEventListener: () => {}
  };
  function makeElement(tag) {
    const listeners = Object.create(null);
    return {
      tagName: String(tag).toUpperCase(),
      children: [],
      attributes: Object.create(null),
      hidden: false,
      textContent: '',
      className: '',
      id: '',
      href: '',
      type: '',
      addEventListener: (name, callback) => { listeners[name] = callback; },
      setAttribute: (name, value) => { this; },
      appendChild(child) {
        this.children.push(child);
        if (child.id) byId[child.id] = child;
        return child;
      },
      focus() { this.focused = true; },
      click() {
        const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
        if (listeners.click) listeners.click(event);
        return event;
      }
    };
  }
  // Give setAttribute a working implementation without relying on browser APIs.
  const originalCreateElement = document.createElement;
  document.createElement = tag => {
    const element = originalCreateElement(tag);
    element.setAttribute = (name, value) => { element.attributes[name] = String(value); };
    return element;
  };
  body.appendChild = function (child) {
    this.children.push(child);
    if (child.id) byId[child.id] = child;
    return child;
  };
  head.appendChild = function (child) { this.children.push(child); return child; };
  vm.runInNewContext(src, { window: browser, document, URL, Object, Date }, { filename: 'ga4-consent.js' });
  const panel = byId['mingeagle-analytics-consent'];
  const actions = panel.children.find(el => el.className === 'mingeagle-ga4-actions');
  const accept = actions.children.find(el => el.className.includes('mingeagle-ga4-accept'));
  const reject = actions.children.find(el => el.className.includes('mingeagle-ga4-reject'));
  const close = actions.children.find(el => el.className.includes('mingeagle-ga4-close'));
  const settings = footerColumn.children.find(el => el.className === 'mingeagle-ga4-settings');
  return { browser, document, panel, accept, reject, close, settings, footerColumn,
    get choice() { return choice; }, get reloads() { return reloads; } };
}

const firstVisit = createConsentUiHarness(null);
assert(firstVisit.panel && firstVisit.settings, 'First visit creates a consent panel and footer privacy link');
assert.equal(firstVisit.settings.tagName, 'A', 'Privacy settings entry is a normal text link');
assert.equal(firstVisit.settings.href, '/policies.html#privacy', 'Link retains a useful privacy-policy fallback');
assert.equal(firstVisit.settings.hidden, false, 'Footer settings remain visible before a choice is made');
assert.equal(firstVisit.panel.hidden, false, 'First-time visitor sees the consent choice');
const openedEvent = firstVisit.settings.click();
assert.equal(openedEvent.defaultPrevented, true, 'Footer link opens settings without navigating away');
assert.equal(firstVisit.panel.hidden, false);
assert.equal(firstVisit.close.hidden, false, 'Reopened settings can be dismissed');
firstVisit.close.click();
assert.equal(firstVisit.panel.hidden, true, 'Close hides the panel without making a consent choice');
firstVisit.settings.click();
firstVisit.reject.click();
assert.equal(firstVisit.choice, 'rejected', 'Reject saves the visitor choice');
assert.equal(firstVisit.panel.hidden, true);
assert.equal(firstVisit.browser.__mingeagleGa4Loaded, undefined, 'Reject does not load Google Analytics');
assert.equal(firstVisit.document.head.children.length, 0, 'Reject adds no Google Analytics script');

const rejectedReturn = createConsentUiHarness('rejected');
assert.equal(rejectedReturn.panel.hidden, true, 'Previously rejected visitor is not prompted again');
assert.equal(rejectedReturn.settings.hidden, false, 'Footer link remains available after rejection');
assert.equal(rejectedReturn.browser.__mingeagleGa4Loaded, undefined, 'Saved rejection does not load analytics');
rejectedReturn.settings.click();
rejectedReturn.accept.click();
assert.equal(rejectedReturn.choice, 'accepted', 'Visitor can revise rejection to acceptance');
assert.equal(rejectedReturn.panel.hidden, true);
assert.equal(rejectedReturn.browser.__mingeagleGa4Loaded, true, 'Acceptance loads analytics');
assert.equal(rejectedReturn.document.head.children.length, 1, 'Acceptance adds the GA4 script once');

const acceptedReturn = createConsentUiHarness('accepted');
assert.equal(acceptedReturn.panel.hidden, true, 'Previously accepted visitor is not prompted again');
assert.equal(acceptedReturn.settings.hidden, false, 'Footer link remains available after acceptance');
assert.equal(acceptedReturn.browser.__mingeagleGa4Loaded, true, 'Saved acceptance loads analytics');
console.log('PASS: footer privacy link, first-visit consent, reject/no-load, accept/load, close, and revising consent all work.');
