'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '../public');
const cssTag = '<link rel="stylesheet" href="/ga4-consent.css?v=20261022-footerprivacy1" data-mingeagle-ga4-consent="styles">';
const jsTag = '<script defer src="/ga4-consent.js?v=20261022-footerprivacy1" data-mingeagle-ga4-consent="script"></script>';
const checkOnly = process.argv.includes('--check');
const files = fs.readdirSync(root).filter(function (name) { return /\.html$/i.test(name); });
if (files.length < 20) throw new Error('Unexpectedly small public HTML catalog');
let changed = 0;
for (const name of files) {
  const filename = path.join(root, name);
  let html = fs.readFileSync(filename, 'utf8');
  const cssCount = (html.match(/data-mingeagle-ga4-consent="styles"/g) || []).length;
  const jsCount = (html.match(/data-mingeagle-ga4-consent="script"/g) || []).length;
  if (cssCount > 1 || jsCount > 1) throw new Error('Duplicate GA4 consent assets in ' + name);
  if (!/<\/head>/i.test(html) || !/<\/body>/i.test(html)) throw new Error('HTML missing head/body close: ' + name);
  let next = html;
  if (cssCount === 0) {
    if (checkOnly) throw new Error('Missing GA4 consent stylesheet in ' + name);
    next = next.replace(/<\/head>/i, cssTag + '</head>');
  } else if (!html.includes(cssTag)) {
    if (checkOnly) throw new Error('Stale GA4 consent stylesheet version in ' + name);
    next = next.replace(/<link\b[^>]*data-mingeagle-ga4-consent="styles"[^>]*>/i, cssTag);
  }
  if (jsCount === 0) {
    if (checkOnly) throw new Error('Missing GA4 consent script in ' + name);
    next = next.replace(/<\/body>/i, jsTag + '</body>');
  } else if (!html.includes(jsTag)) {
    if (checkOnly) throw new Error('Stale GA4 consent script version in ' + name);
    next = next.replace(/<script\b[^>]*data-mingeagle-ga4-consent="script"[^>]*><\/script>/i, jsTag);
  }
  if (next !== html) {
    fs.writeFileSync(filename, next);
    changed++;
  }
}
console.log('GA4 consent assets ' + (checkOnly ? 'verified' : 'installed') + ' on ' + files.length + ' HTML pages; ' + changed + ' updated.');