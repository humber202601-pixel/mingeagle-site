// V37: deterministic, idempotent, SEO-safe additions to the existing static website.
// Running in GitHub Pages build after approved content builders; no external API.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(process.argv[2]||'public'),base='https://www.mingeagle.com/';
const retail=JSON.parse(fs.readFileSync(path.join(root,'retail-prices.json'),'utf8'));
const productKeys={'silent-basketball.html':'p1','fabric-silent-basketball.html':'p2','weighted-flocked-basketball.html':'p3','silent-soccer.html':'p4'};
const settings={
 'index.html':{
  title:'Silent Basketball & Quiet Indoor Sports Balls | MING EAGLE',
  description:'Explore MING EAGLE silent basketball sets and indoor soccer balls for families, coaches, schools and wholesale buyers. Compare models or request a bulk quote.',
  schema:{'@context':'https://schema.org','@type':'Organization',name:'MING EAGLE COMMERCE LLC',alternateName:'MING EAGLE',url:base,
   email:'mingeaglecommerce@gmail.com',
   sameAs:['https://www.facebook.com/profile.php?id=61594156866139','https://de.pinterest.com/mingeaglecommerce/','https://www.youtube.com/channel/UCMyIMO2mCzAGcJ9GqRF4dNQ'],
   contactPoint:[{'@type':'ContactPoint',contactType:'sales inquiries',email:'mingeaglecommerce@gmail.com',availableLanguage:'English'}]}
 },
 'products.html':{
  title:'Quiet Basketball Sets & Indoor Soccer Balls | MING EAGLE',
  description:'Compare flocked and fabric-cover basketball sets with mini hoops, weighted practice balls and indoor soccer. Review sizes, colors and US shipping.'
 },
 'wholesale.html':{
  title:'Wholesale Basketballs & Quiet Indoor Sports Balls | MING EAGLE',
  description:'Wholesale basketballs and quiet indoor sports balls for schools, coaches, public agencies and distributors. Request samples and a written bulk quote.'
 },
 'for-coaches.html':{
  title:'Silent Basketballs for Coaches & Academies | MING EAGLE',
  description:'Explore indoor basketballs for youth training, academies and coaches. Compare sizes and weighted options, request a sample or ask for a bulk quote.',
  schema:{'@context':'https://schema.org','@type':'WebPage',name:'Silent Basketballs for Coaches & Academies | MING EAGLE',url:base+'for-coaches.html',description:'Explore indoor basketballs for youth training, academies and coaches. Compare sizes and weighted options, request a sample or ask for a bulk quote.',isPartOf:{'@type':'WebSite',name:'MING EAGLE',url:base},about:{'@type':'Organization',name:'MING EAGLE COMMERCE LLC',url:base}}
 },
 'for-schools.html':{
  title:'Basketballs for Schools | Indoor PE & Bulk Orders | MING EAGLE',
  description:'Compare soft silent-style basketballs for schools and supervised PE. See sizes, a free RFQ checklist, sample options, and reviewed bulk orders for 10+ units.'
 },
 'silent-basketball.html':{
  title:'Flocked Silent Basketball Set with Mini Hoop | MING EAGLE',
  description:"Explore MING EAGLE's flocked basketball set for quieter indoor practice, sizes 3, 5 and 7. Compare colors, mini-hoop details, sample shipping and bulk quotes.",
  product:{name:'Flocked Silent Basketball Set',image:'assets/hero-flocked-silent-basketball-set.webp',
   description:'Flocked non-inflatable basketball and adhesive mini hoop set for quieter indoor family play. Sizes 3, 5 and 7.'}
 },
 'fabric-silent-basketball.html':{
  title:'Fabric-Cover Silent Basketball Set & Mini Hoop | MING EAGLE',
  description:'Explore a fabric-cover silent basketball set with adhesive mini hoop. Sizes 3, 5 and 7 in orange or green; compare the surface and request a quote.',
  product:{name:'Fabric-Cover Silent Basketball Set',image:'assets/hero-fabric-cover-silent-basketball-set.webp',
   description:'Fabric-covered quiet indoor basketball set with matching adhesive mini hoop. Sizes 3, 5 and 7.'}
 },
 'weighted-flocked-basketball.html':{
  title:'Weighted Silent Basketball for Indoor Drills | MING EAGLE',
  description:"Explore the weighted flocked basketball for indoor practice in sizes 3, 4, 6 and 7. Compare colors, product details and wholesale quote options.",
  product:{name:'Weighted Flocked Silent Basketball',image:'assets/hero-weighted-flocked-silent-basketball.webp',
   description:'Training-oriented weighted flocked basketball for quieter indoor ball-handling drills. Sizes 3, 4, 6 and 7.'}
 },
 'silent-soccer.html':{
  title:'Flocked Silent Soccer Ball for Indoor Play | MING EAGLE',
  description:"Size 5 flocked indoor soccer ball for quieter small-space footwork. Explore five colorways, product details, sample shipping and institutional quotes.",
  product:{name:'Flocked Silent Soccer Ball',image:'assets/hero-flocked-silent-soccer-ball.webp',
   description:'Size 5 flocked quiet-touch soccer ball for indoor kids and teens, home footwork and family play.'}
 },
 'videos.html':{
  title:'16 Silent Basketball Creator Videos | MING EAGLE',
  description:'See 16 attributed TikTok creator clips featuring the flocked silent basketball + mini hoop set. Find the same product and choose your size and color.',
  schema:{'@context':'https://schema.org','@type':'CollectionPage',name:'16 Silent Basketball Creator Videos | MING EAGLE',url:base+'videos.html',description:'See 16 attributed TikTok creator clips featuring the flocked silent basketball + mini hoop set. Find the same product and choose your size and color.',isPartOf:{'@type':'WebSite',name:'MING EAGLE',url:base},about:{'@type':'Thing',name:'Flocked Silent Basketball Set',url:base+'silent-basketball.html'}}
 }
};
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
const begin='<!-- MING EAGLE V37 SEO BEGIN -->',end='<!-- MING EAGLE V37 SEO END -->';
// Reuse the reviewed homepage navigation without replacing page-specific quote links.
const officialNav=fs.readFileSync(path.join(root,'index.html'),'utf8').match(/<nav\b[^>]*id="official-social-profiles"[^>]*>[\s\S]*?<\/nav>/)?.[0];
if(!officialNav)throw new Error('Missing reviewed official social navigation');
const brandFooter='<p class="small">Wholesale sporting goods · International orders</p>';

for(const [filename,config] of Object.entries(settings)){
 const file=path.join(root,filename);
 if(!fs.existsSync(file))throw new Error('Missing approved site page: '+filename);
 let html=fs.readFileSync(file,'utf8');
 if(html.split(brandFooter).length!==2)throw new Error('Missing or ambiguous brand footer: '+filename);
 html=html.replace(/<nav\b[^>]*id="official-social-profiles"[^>]*>[\s\S]*?<\/nav>/g,'');
 html=html.replace(brandFooter,brandFooter+officialNav);
 html=html.replace(/styles\.css\?v=[^"\s>]+/g,'styles.css?v=20261015-social2');

 html=html.replace(/<!-- MING EAGLE V37 SEO BEGIN -->[\s\S]*?<!-- MING EAGLE V37 SEO END -->\s*/g,'');
 if(!/<head(?:\s[^>]*)?>/i.test(html)||!/<\/head>/i.test(html))throw new Error('Malformed head: '+filename);
 html=html.replace(/<title(?:\s[^>]*)?>[\s\S]*?<\/title>/i,'<title>'+esc(config.title)+'</title>');
 // Existing pages use both attribute orders, so replace any complete description tag.
 html=html.replace(/<meta\b(?=[^>]*\bname=["']description["'])[^>]*>/i,
  '<meta name="description" content="'+esc(config.description)+'">');
 if(!html.includes('name="description"'))throw new Error('Missing description: '+filename);
 if(!/rel=["']canonical["']/i.test(html))throw new Error('Missing canonical: '+filename);
 const key=productKeys[filename];
 if(key){
  // Product-page share metadata follows the same reviewed title/description as search metadata.
  const replaceMeta=(attribute,value,content)=>{
   const pattern=new RegExp(`<meta\\b(?=[^>]*\\b${attribute}=["']${value}["'])[^>]*>`,'i');
   const tag='<meta '+attribute+'="'+value+'" content="'+esc(content)+'">';
   if(pattern.test(html))html=html.replace(pattern,tag);
    else html=html.replace(/<\/head>/i,tag+'</head>');
  };
  replaceMeta('property','og:title',config.title);
  replaceMeta('property','og:description',config.description);
  replaceMeta('name','twitter:title',config.title);
  replaceMeta('name','twitter:description',config.description);
   html=html.replace(/<meta\b(?=[^>]*\bname=["']robots["'])[^>]*>\s*/i,'');
   html=html.replace(/<\/head>/i,'<meta name="robots" content="index,follow,max-image-preview:large"></head>');
 }
 const variants=key?Object.entries(retail.products[key]).map(([size,price])=>({
  '@type':'Product',name:config.product.name+' - Size '+size,
  sku:key.toUpperCase()+'-S'+size,size:'Size '+size,
  image:base+config.product.image,
  url:base+filename,brand:{'@type':'Brand',name:'MING EAGLE'},
  offers:{'@type':'Offer',url:base+filename,priceCurrency:'USD',price:Number(price).toFixed(2)}
 })):[];
 const schema=config.product?{
  '@context':'https://schema.org','@type':'ProductGroup',name:config.product.name,
  description:config.product.description,url:base+filename,image:[base+config.product.image],
  brand:{'@type':'Brand',name:'MING EAGLE'},category:'Indoor sports balls',
  productGroupID:key.toUpperCase(),variesBy:['https://schema.org/size'],hasVariant:variants
 }:config.schema;
 // All metadata and structured data use the official www HTTPS URL. Do not
 // temporarily rewrite canonical tags to the legacy apex hostname.
 const priceBegin='<!-- MING EAGLE RETAIL PRICE BEGIN -->',priceEnd='<!-- MING EAGLE RETAIL PRICE END -->';
 html=html.replace(/<!-- MING EAGLE RETAIL PRICE BEGIN -->[\s\S]*?<!-- MING EAGLE RETAIL PRICE END -->\s*/g,'');
 html=html.replace(/<!-- MING EAGLE SHIPPING BEGIN -->[\s\S]*?<!-- MING EAGLE SHIPPING END -->\s*/g,'');
 if(key){
  const opts=Object.entries(retail.products[key]).map(([size,price])=>'<option value="'+size+'">Size '+size+' — $'+Number(price).toFixed(2)+'</option>').join('');
  const first=Object.values(retail.products[key])[0];
  const ui=priceBegin+'<section class="section" id="retail-pricing"><div class="wrap"><div class="eyebrow">RETAIL &amp; WHOLESALE</div><h2>Choose your size</h2><p>Retail prices in USD. All available colors have the same price for a given size. Retail prices are for products only, excluding international shipping and applicable taxes. Orders ship from China. Air shipping can be expensive for single-item orders. We confirm shipping cost, stock readiness, delivery timing and the full order total before payment.</p><label for="retailSize">Ball size</label> <select id="retailSize" aria-label="Choose ball size">'+opts+'</select> <strong id="retailPrice" aria-live="polite">$'+Number(first).toFixed(2)+'</strong><div class="actions"><a class="btn primary" id="retailContact" href="inquiry.html?type=quote">Request total price incl. shipping</a><a class="btn" href="inquiry.html?type=quote">Request wholesale quote</a></div></div></section><script>(function(){var s=document.getElementById("retailSize"),p=document.getElementById("retailPrice"),a=document.getElementById("retailContact");var prices='+JSON.stringify(retail.products[key])+';function change(){p.textContent="$"+Number(prices[s.value]).toFixed(2);a.href="inquiry.html?type=retail&product="+encodeURIComponent('+JSON.stringify(config.product.name)+')+"&size="+encodeURIComponent(s.value)+"&price="+encodeURIComponent(prices[s.value]);}s.addEventListener("change",change);change();})();</script>'+priceEnd;
  const shipping='<section class="section" id="retailShipping" data-product="'+key+'"><div class="wrap"><h2>Estimate international shipping</h2><p>Ship from China. Air shipping accepts 1+ ball; sea shipping accepts at least 10 balls. Quote availability depends on configured rates.</p><form id="retailShippingForm" class="actions"><label>Country (2-letter code)<input id="shippingCountry" value="US" maxlength="2" minlength="2" required aria-label="ISO country code"></label><label>Quantity<input id="shippingUnits" type="number" min="1" max="10000" step="1" value="1" required></label><label>Method<select id="shippingMode"><option value="air">Air parcel</option><option value="sea">Sea freight (10+ balls)</option></select></label><button class="btn orange" type="submit">Calculate shipping</button></form><p id="shippingEstimateStatus" role="status">Shipping rate is confirmed from our sales database.</p><div id="shippingEstimateDetails" hidden><p>Products: <strong id="shippingGoods"></strong></p><p>International shipping: <strong id="shippingFee"></strong></p><p>Subtotal before tax: <strong id="shippingTotal"></strong></p><p>Estimate only. Final freight, delivery date, duties and payment instructions require confirmation.</p></div></div></section><script defer src="retail-shipping.js?v=20261011-3"></script>';
  html=html.replace(/<\/main>/i,ui+'<!-- MING EAGLE SHIPPING BEGIN -->'+shipping+'<!-- MING EAGLE SHIPPING END -->'+'</main>');
 }
 const injected=schema?begin+'\n<script type="application/ld+json">'+JSON.stringify(schema).replace(/</g,'\\u003c')+'</script>\n'+end+'\n':'';
 html=html.replace(/<\/head>/i,injected+'</head>');
 fs.writeFileSync(file,html);
}
console.log('V37: updated SEO title and description on '+Object.keys(settings).length+' pages and factual structured data on 7 pages. No prices or ratings invented.');

// Canonical hostname normalization is intentionally managed by
// scripts/normalize-canonical-host.py in the deploy workflow. V37 must never
// silently convert canonical URLs or JSON-LD references back to the apex host.


// Surface actionable customer-intent guides in the learning hub on every deployment.
{
 const file=path.join(root,'learn.html');
 if(fs.existsSync(file)){
 let html=fs.readFileSync(file,'utf8');
 html=html.replace(/<!-- MING EAGLE INTENT GUIDES BEGIN -->[\s\S]*?<!-- MING EAGLE INTENT GUIDES END -->/g,'');
 const guides=[
 ['silent-basketball-for-apartments.html','Quieter basketball play in apartments','Choose sizes and understand realistic indoor sound expectations.'],
 ['basketball-camp-equipment-supplier.html','Silent basketballs for youth camps','Plan samples, size mix, logos and group orders for training programs.'],
 ['silent-basketball-bulk-buying-guide.html','How to buy silent basketballs wholesale','A practical checklist for retailers, schools and procurement teams.']
 ];
 const links='<section class="learnNext" style="margin:24px auto"><h2>More buying guides</h2><div style="display:grid;gap:12px">'+guides.map(([url,title,desc])=>'<article style="background:#fff;padding:18px;border:1px solid #e7ebf0;border-radius:12px"><h3><a href="'+url+'">'+title+'</a></h3><p>'+desc+'</p><a href="'+url+'">Read guide →</a></article>').join('')+'</div></section>';
 html=html.replace('</main>','<!-- MING EAGLE INTENT GUIDES BEGIN -->'+links+'<!-- MING EAGLE INTENT GUIDES END --></main>');
 fs.writeFileSync(file,html);
 }
}
