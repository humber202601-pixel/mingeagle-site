const assert=require('node:assert/strict');
const fs=require('node:fs');
const home=fs.readFileSync('public/index.html','utf8');
const product=fs.readFileSync('public/silent-basketball.html','utf8');
const css=fs.readFileSync('public/customer-feedback.css','utf8');
const excerpts=[
 'great quality super quiet barely makes any noise at all',
 'The ball is really amazing it really does not make a lot of noise',
 'Really well and soft and bouncy',
 'Its amazing! Performance: Very good',
 'this is amazing u hear no sound when dribbling the ball'
];
for(const [name,html] of [['homepage',home],['product page',product]]){
 assert(html.includes('id="customer-feedback"'),name+' missing customer feedback section');
 assert(html.includes('customer-feedback.css?v=20261023-feedback1'),name+' missing feedback styles');
 assert(html.includes('Selected positive excerpts from written feedback on our TikTok Shop listing'),name+' missing transparent review-source disclosure');
 assert(html.includes('shop.tiktok.com/view/product/1729440144327807079'),name+' missing source listing link');
 for(const excerpt of excerpts.filter(x=>name==='homepage'?x.startsWith('great quality')||x.startsWith('The ball')||x.startsWith('Really well'):true)){
  assert(html.includes(excerpt),name+' missing review excerpt: '+excerpt);
 }
 assert(!html.includes('★★★★★')&&!html.includes('5.0 out of 5'),name+' must not imply an unverified aggregate rating');
}
for(const token of ['.reviewGrid','.reviewCard','.reviewDisclosure','@media(max-width:600px)'])assert(css.includes(token),'Missing responsive review style '+token);
for(const [name,html] of [['homepage',home],['product page',product]]){
 const section=html.match(/<section\b(?=[^>]*\bid="customer-feedback")[^>]*>[\s\S]*?<\/section>/i)?.[0];
 assert(section,name+' feedback section could not be isolated for badge audit');
 assert(!/Verified purchase|Verified buyer|independently verified rating/i.test(section),'Do not claim an unverified verification badge in '+name+' feedback');
}
const positiveQuoteAllowlist=new Set([
 'great quality super quiet barely makes any noise at all, even a chip bag louder than this. almost as heavy as a real basketball and just overall very good',
 'The ball is really amazing it really does not make a lot of noise and the hoop is really good and fun to use with the ball',
 'Its amazing! Performance: Very good. Grip &amp; Handling: The ball is very nice and i can dribble with it really well',
 'Really well and soft and bouncy. The hoop is nice and sturdy',
 'this is amazing u hear no sound when dribbling the ball it is super easy to set up the net and comes with double strings for the hoop works amazing',
 'Absolutely great. The silent ball is an 5 out of 5 and it bounces back up to you so well. We drilled the hoop in and it was great. You get two different color options for the net on the hoop. Overall really good 👍.'
]);
for(const [name,html,expectedCount] of [['homepage',home,3],['product page',product,6]]){
 const section=html.match(/<section\b(?=[^>]*\bid="customer-feedback")[^>]*>[\s\S]*?<\/section>/i)?.[0];
 assert(section,name+' feedback section could not be isolated for positive-only allowlist');
 const quotes=[...section.matchAll(/<blockquote>([\s\S]*?)<\/blockquote>/g)].map(m=>m[1].replace(/\s+/g,' ').trim());
 assert.equal(quotes.length,expectedCount,name+' must show exactly '+expectedCount+' selected positive excerpts');
 for(const quote of quotes)assert(positiveQuoteAllowlist.has(quote),name+' contains an unapproved/non-curated customer quote: '+quote);
}
console.log('PASS selected customer feedback: exact source excerpts, source links, transparency disclosure, no fabricated aggregate star rating, responsive styles.');

async function verifyLivePage(name, baseUrl, requiredQuotes) {
 let lastError;
 for (let attempt = 1; attempt <= 5; attempt++) {
  try {
   const url = baseUrl + (baseUrl.includes('?') ? '&' : '?') + 'feedback_release_check=' + Date.now() + '_' + attempt;
   const response = await fetch(url, { cache: 'no-store', redirect: 'follow' });
   assert(response.ok, name + ' live page HTTP ' + response.status);
   const html = await response.text();
   assert(html.includes('id="customer-feedback"'), name + ' live page is missing the customer-feedback section');
   assert(html.includes('Selected positive excerpts from written feedback on our TikTok Shop listing'), name + ' live page is missing the source disclosure');
   for (const quote of requiredQuotes) assert(html.includes(quote), name + ' live page is missing approved positive excerpt: ' + quote);
   const section = html.match(/<section\b(?=[^>]*\bid="customer-feedback")[^>]*>[\s\S]*?<\/section>/i)?.[0];
   assert(section, name + ' live feedback section could not be isolated');
   const displayedQuotes = [...section.matchAll(/<blockquote>([\s\S]*?)<\/blockquote>/g)].map(m => m[1].replace(/\s+/g, ' ').trim());
   assert.equal(displayedQuotes.length, name === 'homepage' ? 3 : 6, name + ' live page has an unexpected number of feedback quotes');
   for (const quote of displayedQuotes) assert(positiveQuoteAllowlist.has(quote), name + ' live page contains an unapproved quote: ' + quote);
   console.log('PASS live customer feedback:', name, response.url, 'approved quotes:', displayedQuotes.length);
   return;
  } catch (error) {
   lastError = error;
   if (attempt < 5) await new Promise(resolve => setTimeout(resolve, 1500));
  }
 }
 throw lastError;
}

(async () => {
 await verifyLivePage('homepage', 'https://www.mingeagle.com/', [
  'great quality super quiet barely makes any noise at all',
  'The ball is really amazing it really does not make a lot of noise',
  'Really well and soft and bouncy'
 ]);
 await verifyLivePage('product page', 'https://www.mingeagle.com/silent-basketball.html', [
  'great quality super quiet barely makes any noise at all',
  'The ball is really amazing it really does not make a lot of noise',
  'Its amazing! Performance: Very good',
  'Really well and soft and bouncy',
  'this is amazing u hear no sound when dribbling the ball',
  'Absolutely great. The silent ball is an 5 out of 5'
 ]);
})().catch(error => {
 console.error('FAIL live customer feedback verification:', error);
 process.exitCode = 1;
});
