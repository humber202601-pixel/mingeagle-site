import assert from 'node:assert/strict';

const base = 'https://www.mingeagle.com/';
const files = ['', 'ga4-consent.js', 'ga4-consent.css', 'policies.html'];

async function get(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(20000),
    headers: { 'User-Agent': 'MING-EAGLE-live-GA4-check/1.0', 'Cache-Control': 'no-cache' }
  });
  assert.equal(response.status, 200, 'HTTP 200 required for ' + url);
  return response.text();
}

const results = await Promise.all(files.map(name => get(base + name)));
const [index, js, css, policies] = results;
const count = (str, token) => str.split(token).length - 1;
assert.equal(count(index, 'data-mingeagle-ga4-consent="script"'), 1, 'Homepage must load exactly one consent controller');
assert.equal(count(index, 'data-mingeagle-ga4-consent="styles"'), 1, 'Homepage must load exactly one consent stylesheet');
assert.equal(count(index, 'googletagmanager.com/gtag/js'), 0, 'Google tracking tag must not load directly from HTML before consent');
assert(js.includes('G-J0YYCB85PM'), 'Correct GA4 measurement ID must be live');
assert(js.includes('revokeGoogleAnalytics()') && js.includes("window['ga-disable-' + MEASUREMENT_ID] = true"), 'Consent withdrawal must be live');
assert(js.includes('url.origin + url.pathname'), 'Page locations must be sanitized');
assert(css.includes('.mingeagle-ga4-panel'), 'Consent control CSS must be available');
assert(policies.includes('Google Analytics 4') && policies.includes('Privacy settings'), 'GA4 privacy notice must be published');
console.log('PASS: live homepage has one opt-in GA4 consent controller; correct ID, revocation, query-string stripping, CSS and privacy disclosure are published.');
