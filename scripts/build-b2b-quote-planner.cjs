// Deterministic, SEO-crawlable buyer-initiated bulk inquiry UI; no fake discounts.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||'public');
const configs={
 'for-schools.html':{mode:'school',sku:'p1',origin:'school-buying-page',
  eyebrow:'SCHOOL / DISTRICT PURCHASING',heading:'Prepare a school volume quote in 30 seconds',
  lead:'Specify the ball model, size, color, quantity and shipping country. Our team reviews specifications and ocean-freight terms before sending a written quote.',
  bullets:['Classroom and PE equipment orders','After-school and community programs','Samples can be evaluated before bulk purchasing']},
 'for-coaches.html':{mode:'academy',sku:'p3',origin:'coach-academy-buying-page',
  eyebrow:'BASKETBALL ACADEMY / TRAINING PROGRAM',heading:'Build a basketball academy bulk inquiry',
  lead:'Choose a product and volume for supervised activities, team sessions or training programs. Samples help verify handling, bounce and suitability before wholesale orders.',
  bullets:['Select training or family-style basketball models','Compare size options and confirmed colors','Ask for quantities and sample evaluation']},
 'wholesale.html':{mode:'retailer',sku:'p1',origin:'wholesale-buying-page',
  eyebrow:'RETAILER / DISTRIBUTOR WHOLESALE',heading:'Request a quantity-based wholesale offer',
  lead:'Tell us the product configuration and order quantity. Discount levels depend on the verified order, not a publicly invented percentage.',
  bullets:['For stores, distributors and program buyers','10+ total items, sea freight required','Written quotation before any payment']}
};
const begin='<!-- MING EAGLE QUALIFIED B2B PLANNER BEGIN -->';
const end='<!-- MING EAGLE QUALIFIED B2B PLANNER END -->';
const link='<link rel="stylesheet" href="b2b-quote-planner.css?v=20261013-1">';
const script='<script defer src="b2b-quote-planner.js?v=20261013-1"></script>';
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
for(const [filename,config] of Object.entries(configs)){
 const file=path.join(root,filename);let html=fs.readFileSync(file,'utf8');
 html=html.replace(/<!-- MING EAGLE QUALIFIED B2B PLANNER BEGIN -->[\s\S]*?<!-- MING EAGLE QUALIFIED B2B PLANNER END -->/g,'');
 html=html.replaceAll(link,'').replaceAll(script,'');
 if(!html.includes('</head>')||!html.includes('</body>')||!html.includes('</main>'))throw Error('Invalid site document '+filename);
 const block=[
 begin,
 '<section class="b2bQuickSection" id="volume-quote-planner" lang="en" aria-labelledby="b2b-quote-heading-',esc(config.mode),
 '" data-b2b-quote-planner data-default-product="',esc(config.sku),
 '" data-default-role="',esc(config.mode),'" data-planner-origin="',esc(config.origin),'">',
 '<div class="b2bQuickWrap"><div class="b2bQuickCopy">',
 '<p class="b2bQuickEyebrow">',esc(config.eyebrow),'</p>',
 '<h2 id="b2b-quote-heading-',esc(config.mode),'">',esc(config.heading),'</h2>',
 '<p>',esc(config.lead),'</p><ul>',
 ...config.bullets.map(b=>'<li>'+esc(b)+'</li>'),'</ul>',
 '<p><strong>Important:</strong> These are soft indoor-play products, not independently certified noise-reduction or regulation-ball substitutes. Actual weight, bounce, surface suitability and stock must be checked for the chosen product and application.</p></div>',
 '<div class="b2bQuickBox"><h3>Your purchase requirements</h3>',
 '<form data-buyer-form action="inquiry.html" method="get"><div class="b2bQuickGrid">',
 '<label>Product family <select name="buyerModel" required aria-label="Product family"></select></label>',
 '<label>Ball size <select name="buyerSize" required aria-label="Ball size"></select></label>',
 '<label>Color <select name="buyerColor" required aria-label="Ball color"></select></label>',
 '<label>Total units <input name="buyerQuantity" type="number" min="10" max="10000" value="25" step="1" inputmode="numeric" required></label>',
 '<label>Buyer type <select name="buyerRole" required>',
 '<option value="school">School / district / club</option>',
 '<option value="academy">Basketball academy</option>',
 '<option value="coach">Coach / trainer</option>',
 '<option value="retailer">Retail store</option>',
 '<option value="distributor">Distributor / wholesaler</option>',
 '</select></label>',
 '<label>Country (2 letters) <input name="buyerCountry" value="US" maxlength="2" minlength="2" pattern="[A-Za-z]{2}" aria-label="Two-letter destination country" required></label>',
 '<label>Delivery ZIP / postal code <input name="buyerPostal" autocomplete="postal-code" maxlength="19" placeholder="Optional"></label>',
 '</div><p class="b2bQuickHint" data-buyer-estimate aria-live="polite"></p>',
 '<label class="b2bQuickConsent"><input name="buyerSeaConsent" type="checkbox" required>',
 '<span>I agree to sea freight for this 10+ item wholesale inquiry. For US destinations, 25–30 days after dispatch is an estimate, not a guaranteed arrival date; other countries and final commercial terms are confirmed by the supplier.</span></label>',
 '<button type="submit" class="b2bQuickSubmit">Continue to secure quote request →</button>',
 '<p class="b2bQuickStatus" role="status" aria-live="polite"></p>',
 '<p class="b2bQuickFallback">Next: review or edit your selections, add your work email and send through our official protected inquiry form. <strong>No payment and no unsolicited marketing signup.</strong> Need fewer than 10 items? <a href="products.html">View retail products</a>.</p>',
 '</form></div></div></section>',
 end
 ].join('');
 const main=html.indexOf('<main'),close=html.indexOf('</section>',main);
 assert(main>=0&&close>=0,'First page section required '+filename);
 html=html.slice(0,close+10)+block+html.slice(close+10);
 html=html.replace('</head>',link+'</head>').replace('</body>',script+'</body>');
 fs.writeFileSync(file,html);
}
console.log('PASS: three B2B acquisition pages now show crawlable buying criteria, buyer-configurable variant and consented sea RFQ.');
