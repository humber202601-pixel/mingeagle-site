// V37: deterministic, idempotent, SEO-safe additions to the existing static website.
// Running in GitHub Pages build after approved content builders; no external API.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(process.argv[2]||'public'),base='https://mingeagle.com/';
const retail=JSON.parse(fs.readFileSync(path.join(root,'retail-prices.json'),'utf8'));
const productKeys={'silent-basketball.html':'p1','fabric-silent-basketball.html':'p2','weighted-flocked-basketball.html':'p3','silent-soccer.html':'p4'};
const settings={
 'index.html':{
  title:'Silent Basketball & Quiet Indoor Sports Balls | MING EAGLE',
  description:'Explore MING EAGLE silent basketball sets and indoor soccer balls for families, coaches, schools and wholesale buyers. Compare models or request a bulk quote.',
  schema:{'@context':'https://schema.org','@type':'Organization',name:'MING EAGLE COMMERCE LLC',alternateName:'MING EAGLE',url:base,
   email:'mingeaglecommerce@gmail.com',contactPoint:[{'@type':'ContactPoint',contactType:'sales inquiries',email:'mingeaglecommerce@gmail.com',availableLanguage:'English'}]}
 },
 'products.html':{
  title:'Silent Basketball Sets & Indoor Soccer Balls | MING EAGLE',
  description:'Compare four MING EAGLE silent indoor sports products: flocked basketball set, fabric-cover basketball set, weighted flocked basketball and indoor soccer ball.'
 },
 'wholesale.html':{
  title:'Silent Basketball Wholesale & Bulk Orders | MING EAGLE',
  description:'Silent basketball wholesale supply for coaches, training academies, schools and retailers. Compare models, request samples and ask for a bulk shipping quote.'
 },
 'for-coaches.html':{
  title:'Silent Basketballs for Coaches & Training Academies | MING EAGLE',
  description:'Explore indoor basketballs for youth training, academies and coaches. Compare sizes and weighted options, request a sample or ask for a bulk quote.'
 },
 'for-schools.html':{
  title:'Silent Basketballs & Indoor Sports Balls for Schools | MING EAGLE',
  description:'Quiet-touch indoor sports balls for school PE, after-school activities and recreation. Compare sizes, request samples and ask about volume orders.'
 },
 'silent-basketball.html':{
  title:'Flocked Silent Basketball Set with Mini Hoop | MING EAGLE',
  description:'Soft flocked silent basketball set with adhesive mini hoop. Available sizes 3, 5 and 7 in four colors for quieter family indoor play.',
  product:{name:'Flocked Silent Basketball Set',image:'assets/hero-flocked-silent-basketball-set.webp',
   description:'Flocked non-inflatable basketball and adhesive mini hoop set for quieter indoor family play. Sizes 3, 5 and 7.'}
 },
 'fabric-silent-basketball.html':{
  title:'Fabric-Cover Silent Basketball Set with Hoop | MING EAGLE',
  description:'Fabric-cover quiet indoor basketball set with adhesive mini hoop. Sizes 3, 5 and 7; available in orange and green.',
  product:{name:'Fabric-Cover Silent Basketball Set',image:'assets/hero-fabric-cover-silent-basketball-set.webp',
   description:'Fabric-covered quiet indoor basketball set with matching adhesive mini hoop. Sizes 3, 5 and 7.'}
 },
 'weighted-flocked-basketball.html':{
  title:'Weighted Flocked Silent Basketball for Indoor Drills | MING EAGLE',
  description:'Training-oriented weighted flocked silent basketball. Sizes 3, 4, 6 and 7 with orange, brown, black and aqua blue options.',
  product:{name:'Weighted Flocked Silent Basketball',image:'assets/hero-weighted-flocked-silent-basketball.webp',
   description:'Training-oriented weighted flocked basketball for quieter indoor ball-handling drills. Sizes 3, 4, 6 and 7.'}
 },
 'silent-soccer.html':{
  title:'Flocked Silent Soccer Ball for Indoor Play | MING EAGLE',
  description:'Size 5 flocked quiet-touch indoor soccer ball for kids and teen home footwork, family play and indoor recreation. Five colorways.',
  product:{name:'Flocked Silent Soccer Ball',image:'assets/hero-flocked-silent-soccer-ball.webp',
   description:'Size 5 flocked quiet-touch soccer ball for indoor kids and teens, home footwork and family play.'}
 }
};
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
const begin='<!-- MING EAGLE V37 SEO BEGIN -->',end='<!-- MING EAGLE V37 SEO END -->';
for(const [filename,config] of Object.entries(settings)){
 const file=path.join(root,filename);
 if(!fs.existsSync(file))throw new Error('Missing approved site page: '+filename);
 let html=fs.readFileSync(file,'utf8');
 html=html.replace(/<!-- MING EAGLE V37 SEO BEGIN -->[\s\S]*?<!-- MING EAGLE V37 SEO END -->\s*/g,'');
 if(!/<head(?:\s[^>]*)?>/i.test(html)||!/<\/head>/i.test(html))throw new Error('Malformed head: '+filename);
 html=html.replace(/<title(?:\s[^>]*)?>[\s\S]*?<\/title>/i,'<title>'+esc(config.title)+'</title>');
 // Existing pages use both attribute orders, so replace any complete description tag.
 html=html.replace(/<meta\b(?=[^>]*\bname=["']description["'])[^>]*>/i,
  '<meta name="description" content="'+esc(config.description)+'">');
 if(!html.includes('name="description"'))throw new Error('Missing description: '+filename);
 if(!/rel=["']canonical["']/i.test(html))throw new Error('Missing canonical: '+filename);
 const key=productKeys[filename];
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
 // Normalize canonical URL and keep repeated builds idempotent.
 html=html.replace(/(<link\b(?=[^>]*rel=["']canonical["'])[^>]*href=["'])https:\/\/www\.mingeagle\.com/g,'$1https://mingeagle.com');
 const priceBegin='<!-- MING EAGLE RETAIL PRICE BEGIN -->',priceEnd='<!-- MING EAGLE RETAIL PRICE END -->';
 html=html.replace(/<!-- MING EAGLE RETAIL PRICE BEGIN -->[\s\S]*?<!-- MING EAGLE RETAIL PRICE END -->\s*/g,'');
 if(key){
  const opts=Object.entries(retail.products[key]).map(([size,price])=>'<option value="'+size+'">Size '+size+' — $'+Number(price).toFixed(2)+'</option>').join('');
  const first=Object.values(retail.products[key])[0];
  const ui=priceBegin+'<section class="section" id="retail-pricing"><div class="wrap"><div class="eyebrow">RETAIL &amp; WHOLESALE</div><h2>Choose your size</h2><p>Retail prices in USD. All available colors have the same price for a given size. Shipping and applicable taxes are confirmed before payment.</p><label for="retailSize">Ball size</label> <select id="retailSize" aria-label="Choose ball size">'+opts+'</select> <strong id="retailPrice" aria-live="polite">$'+Number(first).toFixed(2)+'</strong><div class="actions"><a class="btn primary" id="retailContact" href="inquiry.html?type=quote">Ask to buy this size</a><a class="btn" href="inquiry.html?type=quote">Request wholesale quote</a></div></div></section><script>(function(){var s=document.getElementById("retailSize"),p=document.getElementById("retailPrice"),a=document.getElementById("retailContact");var prices='+JSON.stringify(retail.products[key])+';function change(){p.textContent="$"+Number(prices[s.value]).toFixed(2);a.href="inquiry.html?type=quote&product="+encodeURIComponent('+JSON.stringify(config.product.name)+')+"&size="+encodeURIComponent(s.value)+"&price="+encodeURIComponent(prices[s.value]);}s.addEventListener("change",change);change();})();</script>'+priceEnd;
  html=html.replace(/<\/main>/i,ui+'</main>');
 }
 const injected=schema?begin+'\n<script type="application/ld+json">'+JSON.stringify(schema).replace(/</g,'\\u003c')+'</script>\n'+end+'\n':'';
 html=html.replace(/<\/head>/i,injected+'</head>');
 fs.writeFileSync(file,html);
}
console.log('V37: updated SEO title and description on '+Object.keys(settings).length+' pages and factual structured data on 5 pages. No prices or ratings invented.');
