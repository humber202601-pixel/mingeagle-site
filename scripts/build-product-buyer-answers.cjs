// First-party, audience-useful buyer answers and reliable social image previews.
// These do not imply independent lab testing, merchant checkout, Google indexing
// or preferential recommendation by an AI service.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||'public');
const base='https://www.mingeagle.com/';
const master=JSON.parse(fs.readFileSync(path.join(root,'product-master.json'),'utf8'));
const retail=JSON.parse(fs.readFileSync(path.join(root,'retail-prices.json'),'utf8'));
const shipping=JSON.parse(fs.readFileSync(path.join(root,'us-single-parcel-shipping.json'),'utf8'));
const models=[
 ['p1','silent-basketball.html','Soft Flocked Basketball & Mini Hoop',
  'A soft non-inflatable basketball set for controlled indoor handling and shooting games.',
  [
   ['Does this set include a basketball hoop?','Yes. The standard flocked set contains one soft-touch foam basketball and one compact adhesive mini hoop. Check the mounting surface and instructions before use.'],
   ['Can an apartment family use this instead of a noisy regular basketball?','The compressible foam design is intended for quieter indoor handling, but it is not completely silent. Footsteps, repeated bouncing and floor vibration can still disturb neighbors. Start with controlled games and an appropriate floor surface.'],
   ['Is it a regulation basketball for court practice?','No. The non-inflatable indoor foam ball behaves differently from an inflated competition ball. Choose based on the intended activity, grip and user ability.']
  ],'silent-basketball-for-apartments.html'],
 ['p2','fabric-silent-basketball.html','Fabric-Cover Basketball & Mini Hoop Set',
  'A soft fabric-covered foam basketball with a compact hoop in orange or green.',
  [
   ['How is the fabric-cover set different from the flocked set?','Both are soft non-inflatable indoor ball sets with mini hoops. This model adds a fabric-like cover that changes the surface feel; we do not claim measured acoustic superiority over the flocked model.'],
   ['What sizes and colors can I choose?','Sizes 3, 5 and 7 are available in orange or green. The set is described as one ball plus one adhesive mini hoop.'],
   ['Is it silent on apartment floors?','No ball can eliminate footsteps or structural floor vibration. A covered foam ball may reduce sharp impact sounds compared with a conventional inflated ball, but results vary with play style and flooring.']
  ],'quiet-indoor-sports-for-kids.html'],
 ['p3','weighted-flocked-basketball.html','Weighted Flocked Basketball for Controlled Drills',
  'A weighted-feel soft indoor ball intended for supervised handling and practice-style activities.',
  [
   ['Is the weighted flocked ball the same as a regulation basketball?','No. A weighted-feel soft foam ball is different from a regulation inflated basketball in bounce, grip and handling. Do not assume an identical training experience.'],
   ['Which sizes and colors are listed?','Sizes 3, 4, 6 and 7 come in orange, brown, black and aqua blue. Exact size-dependent physical weight should be requested and checked before a program order.'],
   ['Should a school or academy order a sample first?','Yes, evaluating a sample against participants, planned drills, floor type and supervision requirements is a sensible step before agreeing on bulk quantities.']
  ],'for-coaches.html'],
 ['p4','silent-soccer.html','Soft Flocked Indoor Soccer Ball',
  'A size-5 soft indoor soccer ball intended for controlled footwork and family activities.',
  [
   ['Does this soccer product include a basketball hoop?','No. This is the flocked indoor soccer ball listing, not a basketball-and-hoop set. Confirm product contents when ordering.'],
   ['What size and color combinations are offered?','The confirmed soccer model is size 5, with five black/white, black/green, black/red, yellow/green and black/gold color combinations.'],
   ['Will it eliminate indoor football noise?','No. Soft-touch construction is intended for quieter controlled play, but hard kicks, footsteps, impacts with furniture and floor vibration still create noise.']
  ],'quiet-indoor-sports-for-kids.html']
];
assert.equal(retail.currency,'USD');assert.equal(shipping.destinationCountry,'US');
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const money=n=>'$'+Number(n).toFixed(2);
const begin='<!-- MING EAGLE VERIFIED BUYER ANSWERS BEGIN -->';
const end='<!-- MING EAGLE VERIFIED BUYER ANSWERS END -->';
const socialBegin='<!-- MING EAGLE SOCIAL PRODUCT PREVIEW BEGIN -->';
const socialEnd='<!-- MING EAGLE SOCIAL PRODUCT PREVIEW END -->';
const css='<style>.buyerAnswers{background:#f6f9fc;border-block:1px solid #e4e9ef;padding:32px 0;color:#1c2e45}.buyerAnswers .buyerAnswersInner{max-width:1080px;padding:0 23px;margin:auto}.buyerAnswers h2{font-size:clamp(23px,3vw,34px);line-height:1.22;margin:0 0 12px}.buyerAnswers .buyerAnswerCards{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin:17px 0}.buyerAnswers article{background:#fff;padding:16px 17px;border:1px solid #dfe7ef;border-radius:10px}.buyerAnswers article h3{font-size:16px;line-height:1.35;margin:0 0 8px;color:#172d45}.buyerAnswers article p{font-size:13px;line-height:1.7;color:#475569;margin:0}.buyerAnswers .buyerAnswersNote{font-size:13px;line-height:1.65;color:#536176}.buyerAnswers a{color:#1b668d;text-decoration:underline;text-underline-offset:2px}.buyerAnswers .buyerSizeLinks{display:flex;flex-wrap:wrap;gap:11px;margin-top:15px}.buyerAnswers .buyerSizeLinks a{display:inline-block;padding:10px 13px;background:#fff;border:1px solid #cedbe5;border-radius:9px;font-size:13px;font-weight:700}@media(max-width:650px){.buyerAnswers{padding:26px 0}.buyerAnswers .buyerAnswersInner{padding:0 16px}}</style>';
function replaceBlock(html,start,finish){
 if(html.includes(start)!==html.includes(finish))throw Error('Unbalanced old block '+start);
 return html.replace(new RegExp(start+'[\\s\\S]*?'+finish,'g'),'');
}
function write(filename,title,description,image,answerSection,type){
 const file=path.join(root,filename);
 let html=fs.readFileSync(file,'utf8');
 html=replaceBlock(replaceBlock(html,begin,end),socialBegin,socialEnd);
 assert(/<\/head>/i.test(html)&&/<main\b/i.test(html),'Missing HTML landmarks '+filename);
 const canonical=base+filename;
 const oldCanonical=html.match(/<link\b[^>]*rel="canonical"[^>]*>/i)?.[0]||'';
 assert(oldCanonical.includes(canonical),'Canonical must match public URL '+filename);
 assert(fs.existsSync(path.join(root,image)),'Missing real product image '+filename);
 const socials=socialBegin+
  '<meta property="og:type" content="'+type+'">'+
  '<meta property="og:site_name" content="MING EAGLE">'+
  '<meta property="og:title" content="'+esc(title)+'">'+
  '<meta property="og:description" content="'+esc(description)+'">'+
  '<meta property="og:url" content="'+canonical+'">'+
  '<meta property="og:image" content="'+base+image+'">'+
  '<meta property="og:image:alt" content="'+esc(title)+'">'+
  '<meta name="twitter:card" content="summary_large_image">'+
  '<meta name="twitter:title" content="'+esc(title)+'">'+
  '<meta name="twitter:description" content="'+esc(description)+'">'+
  '<meta name="twitter:image" content="'+base+image+'">'+css+socialEnd;
 html=html.replace(/<\/head>/i,socials+'</head>');
 const main=html.indexOf('<main'),firstClose=html.indexOf('</section>',main);
 assert(main>=0&&firstClose>main,'Missing lead product section '+filename);
 html=html.slice(0,firstClose+'</section>'.length)+begin+answerSection+end+html.slice(firstClose+'</section>'.length);
 fs.writeFileSync(file,html);
}
for(const [id,page,title,description,answers,guide] of models){
 const product=master[id],amounts=retail.products[id],fees=shipping.productSizeShippingUSD[id];
 assert(product.name&&product.hero);
 assert.deepEqual(Object.keys(amounts).sort(),Object.keys(fees).sort(),'Shipping size must match product '+id);
 assert(fs.existsSync(path.join(root,guide)),'Guide unavailable '+guide);
 const cards=answers.map(([question,answer])=>
  '<article><h3>'+esc(question)+'</h3><p>'+esc(answer)+'</p></article>').join('');
 const sizeLinks=Object.entries(amounts).map(([size,price])=>{
  const shippingFee=fees[size];
  assert(Number.isFinite(price)&&Number.isFinite(shippingFee)&&price>0&&shippingFee>0);
  return '<a href="'+page+'?size='+size+'#buy-now">Size '+size+': '+
   money(price+shippingFee)+' US one-item estimate →</a>';
 }).join('');
 const block='<section class="buyerAnswers" id="buyer-product-answers" lang="en" aria-labelledby="buyer-answers-'+id+'">'+
  '<div class="buyerAnswersInner"><h2 id="buyer-answers-'+id+'">What buyers should know about '+esc(product.name)+'</h2>'+
  '<p class="buyerAnswersNote">First-party supplier information about choosing and using this exact model. No independent sound measurements, certification or customer ratings are claimed.</p>'+
  '<div class="buyerAnswerCards">'+cards+'</div>'+
  '<p class="buyerAnswersNote"><strong>US single-item shipping:</strong> estimated air small parcel from China, 12–15 days after dispatch (not guaranteed). Below are a product plus one listed shipping fee, before applicable taxes and duties. Two-to-nine-item shipping is calculated separately; quantities of 10 or more use a written sea-freight wholesale quote.</p>'+
  '<div class="buyerSizeLinks">'+sizeLinks+'</div>'+
  '<p class="buyerAnswersNote">For intended-use guidance, read the <a href="'+guide+'">relevant buying guide</a> or <a href="inquiry.html?type=sample">ask about a sample</a>. Online payment is not active; order terms and the final amount must be confirmed before payment.</p>'+
  '</div></section>';
 write(page,title,description,product.hero,block,'product');
}
const catalog={
 title:'Compare Silent Basketball Sets, Weighted Balls & Quiet Indoor Soccer | MING EAGLE',
 description:'Compare flocked and fabric-cover hoop sets, weighted training balls and indoor soccer. See verified sizes, colors and US shipping estimates.'
};
const collection=[
 ['Which set comes with a mini hoop?','The flocked and fabric-cover basketball sets each include one soft indoor ball and a compact adhesive mini hoop. The weighted basketball and indoor soccer ball are separate models.',models[0][1]],
 ['How do I choose between a softer ball and a training-feel ball?','Choose a flocked or fabric-covered set for controlled home or activity-room play. Assess the weighted-feel model for supervised handling drills; it does not replicate a regulation ball.',models[2][1]],
 ['Are silent basketballs suitable for apartments?','They are designed for quieter indoor play, not zero noise. Repeated bouncing, forceful impacts, footsteps and structural floor vibration may still disturb neighbors.',models[1][1]],
 ['Can a school, retailer or academy request 10+ units?','Yes. Choose a product and quantity, review the sea-freight estimate and submit a written bulk inquiry. Discounts depend on the final quote, not an assumed percentage.','wholesale.html']
];
const cards=collection.map(([q,a,url])=>'<article><h3>'+esc(q)+'</h3><p>'+esc(a)+' <a href="'+url+'">View related product or buying process →</a></p></article>').join('');
const categoryBlock='<section class="buyerAnswers" id="buyer-product-answers" lang="en" aria-labelledby="buyer-answers-collection">'+
 '<div class="buyerAnswersInner"><h2 id="buyer-answers-collection">Which quiet indoor sports ball should you choose?</h2>'+
 '<p class="buyerAnswersNote">Compare confirmed first-party options rather than assuming every foam basketball has the same feel, size or hoop contents.</p>'+
 '<div class="buyerAnswerCards">'+cards+'</div>'+
 '<p class="buyerAnswersNote">For US single-item air parcels, estimated delivery is 12–15 days after dispatch, not guaranteed and subject to actual shipping arrangements. All published USD prices exclude taxes and import duties. <a href="retail-cart.html">View the retail cart</a> or <a href="for-schools.html">request school equipment guidance</a>. Payment processing is not yet active.</p>'+
 '</div></section>';
write('products.html',catalog.title,catalog.description,master.p1.hero,categoryBlock,'website');
console.log('PASS: five verified buyer answer and social preview sections from published MING EAGLE products, no invented ratings, acoustic metrics or stock.');
