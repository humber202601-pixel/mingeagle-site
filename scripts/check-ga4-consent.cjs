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
  assert(!html.includes('googletagmanager.com/gtag/js'), 'Google tag must not be embedded before visitor consent: ' + name);
}
const js = fs.readFileSync(path.join(root, 'ga4-consent.js'), 'utf8');
assert(js.includes("var MEASUREMENT_ID = 'G-J0YYCB85PM'"), 'Correct GA4 measurement ID');
assert(js.includes("saveChoice('accepted')") && js.includes("saveChoice('rejected')"), 'Both consent choices must be supported');
assert(js.includes('loadGoogleAnalytics()'), 'GA4 loader must be present');
assert(js.includes('send_page_view: false'), 'Initial page view must be explicitly sanitized');
assert(js.includes('url.origin + url.pathname'), 'Query strings and fragments must be removed from measured URLs');
assert(js.includes('allow_google_signals: false') && js.includes('allow_ad_personalization_signals: false'), 'Advertising signals must be disabled');
const css = fs.readFileSync(path.join(root, 'ga4-consent.css'), 'utf8');
assert(css.includes('.mingeagle-ga4-panel') && css.includes(':focus-visible'), 'Accessible consent banner styles');
const policy = fs.readFileSync(path.join(root, 'policies.html'), 'utf8');
assert(policy.includes('Google Analytics 4') && policy.includes('query strings') && policy.includes('Privacy settings'), 'Privacy policy must disclose opt-in GA4 and controls');
console.log('PASS: GA4 is opt-in, query strings are excluded, advertising signals are disabled, privacy disclosure is present, and all public HTML pages load exactly one consent UI.');