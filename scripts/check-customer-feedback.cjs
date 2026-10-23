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
console.log('PASS selected customer feedback: exact source excerpts, source links, transparency disclosure, no fabricated aggregate star rating, responsive styles.');
