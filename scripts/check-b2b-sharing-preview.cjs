// First-party social previews for the three primary B2B landing pages.
// Verifies published source assets; does not assert LinkedIn/X or any AI engine
// actually fetched, rendered, endorsed or shared these links.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(process.argv[2] || 'public');
const pages = [
  ['for-schools.html','hero-flocked-silent-basketball-set.webp','MING EAGLE flocked silent basketball set, one of the soft indoor equipment options for schools'],
  ['wholesale.html','mingeagle-social-wordmark.png','MING EAGLE company wordmark'],
  ['procurement.html','mingeagle-social-wordmark.png','MING EAGLE company wordmark']
];
for (const [file,asset,alt] of pages) {
  const source = fs.readFileSync(path.join(root,file),'utf8');
  const head = source.split(/<\/head>/i)[0];
  const canonical = 'https://www.mingeagle.com/'+file;
  const image = 'https://www.mingeagle.com/assets/'+asset;
  assert(head.includes('rel="canonical" href="'+canonical+'"'),file+' canonical mismatch');
  assert(head.includes('property="og:url" content="'+canonical+'"'),file+' Open Graph URL mismatch');
  assert(head.includes('property="og:description"'),file+' Open Graph description missing');
  assert.equal((head.match(/property="og:image"/g)||[]).length,1,file+' needs one OG image');
  assert.equal((head.match(/property="og:image:alt"/g)||[]).length,1,file+' needs image alt');
  assert.equal((head.match(/name="twitter:image"/g)||[]).length,1,file+' needs one Twitter image');
  assert.equal((head.match(/name="twitter:card"/g)||[]).length,1,file+' needs one Twitter card');
  assert(head.includes('property="og:image" content="'+image+'"'),file+' has wrong OG image');
  assert(head.includes('name="twitter:image" content="'+image+'"'),file+' has wrong Twitter image');
  assert(head.includes('property="og:image:alt" content="'+alt+'"'),file+' has false/missing image alt');
  assert(head.includes('name="twitter:card" content="summary_large_image"'),file+' wrong share preview card');
  const imageFile = path.join(root,'assets',asset);
  assert(fs.statSync(imageFile).size > 1000,file+' share image must be real nonempty verified asset');
  assert(!/aggregateRating|ratingValue|reviewCount/.test(head),file+' must not invent ratings');
  assert(source.includes('href="inquiry.html?type=quote'),file+' lost the B2B RFQ path');
  assert(source.includes('</main>'),file+' main content missing');
}
console.log('PASS: 3 genuine B2B first-party share images, exact www canonicals, source files, one social card per page and preserved RFQ links.');
