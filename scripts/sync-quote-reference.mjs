import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

// main/public is authoritative. Replicas are versioned and CI compares them to main.
const args = process.argv.slice(2);
const check = args.includes('--check');
const from = args.includes('--from') ? args[args.indexOf('--from') + 1] : 'public';
if (!from) throw new Error('Missing --from directory');
const priceText = readFileSync(join(from, 'retail-reference-prices.json'), 'utf8');
const mathText = readFileSync(join(from, 'quote-math.js'), 'utf8');
const catalog = JSON.parse(priceText);
if (catalog.currency !== 'USD' || Object.keys(catalog.products || {}).length !== 4) throw new Error('Invalid canonical catalog');
const hash = text => createHash('sha256').update(text).digest('hex');
const start = mathText.indexOf('function cents(value)');
const end = mathText.indexOf('const api=');
if (start < 0 || end <= start) throw new Error('Unexpected quote-math format; review the upstream change');
const core = '// Generated from public/quote-math.js; do not edit.\n' + mathText.slice(start, end) + '\nexport { cents, money, calculate, calculateFromCatalog, calculateOrder };\n';
const version = '// Generated from the canonical retail catalog; do not edit.\nexport const RETAIL_CATALOG_VERSION = ' + JSON.stringify(hash(priceText)) + ';\n';
const outputs = new Map([
  ['public/retail-reference-prices.json', priceText],
  ['public/quote-math.js', mathText],
  ['public/retail-prices.json', priceText], // Keep the existing public URL as an alias.
  ['lib/quote-math-core.mjs', core],
  ['lib/retail-catalog-version.ts', version],
]);
for (const [path, text] of outputs) {
  if (check) {
    if (readFileSync(path, 'utf8') !== text) throw new Error('Canonical quote reference mismatch: ' + path);
  } else writeFileSync(path, text);
}
console.log((check ? 'Verified' : 'Synced') + ' canonical retail catalog ' + hash(priceText) + ' and quote-math ' + hash(mathText));
