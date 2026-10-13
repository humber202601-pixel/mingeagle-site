// Crawlable, idempotent internal navigation for verified MING EAGLE pages.
// Runs after existing SEO builders and never creates new landing pages or claims.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(process.argv[2]||'public');
const START='<!-- MING EAGLE SEO DISCOVERY LINKS BEGIN -->',END='<!-- MING EAGLE SEO DISCOVERY LINKS END -->';
const titles={
 'products.html':'Compare all four silent ball products',
 'inquiry.html':'Request a quote or sample',
 'fabric-silent-basketball.html':'Fabric-cover silent basketball set',
 'weighted-flocked-basketball.html':'Weighted flocked silent basketball',
 'silent-soccer.html':'Flocked indoor soccer ball',
 'silent-basketball-bulk-buying-guide.html':'Bulk silent basketball buying guide',
 'silent-basketball-for-apartments.html':'Silent basketballs for apartments',
 'silent-basketball-vs-regular.html':'Silent vs regular basketball guide',
 'wholesale.html':'Wholesale and bulk purchasing',
 'learn.html':'Buying and practice guides',
 'videos.html':'Product videos and demonstrations',
 'stories.html':'Customer stories and community',
 'silent-basketball.html':'Flocked silent basketball set',
 'wholesale-product-catalog.html':'Wholesale product catalog',
 'for-schools.html':'Silent sports balls for schools',
 'for-coaches.html':'Indoor basketballs for coaches',
 'quiet-indoor-sports-for-kids.html':'How to keep kids active indoors with less ball noise',
 'indoor-school-sports-equipment-guide.html':'Indoor PE and academy equipment buyer checklist'
};
const groups={
 'index.html':['products.html','videos.html','wholesale.html','inquiry.html','fabric-silent-basketball.html','weighted-flocked-basketball.html','silent-soccer.html','learn.html','quiet-indoor-sports-for-kids.html','indoor-school-sports-equipment-guide.html'],
 'products.html':['fabric-silent-basketball.html','videos.html','weighted-flocked-basketball.html','silent-soccer.html','silent-basketball.html','inquiry.html','quiet-indoor-sports-for-kids.html'],
 'silent-basketball.html':['quiet-indoor-sports-for-kids.html','silent-basketball-for-apartments.html','fabric-silent-basketball.html','videos.html','products.html','inquiry.html'],
 'wholesale.html':['wholesale-product-catalog.html','silent-basketball-bulk-buying-guide.html','inquiry.html','for-schools.html','for-coaches.html','indoor-school-sports-equipment-guide.html'],
 'learn.html':['silent-basketball-for-apartments.html','silent-basketball-vs-regular.html','silent-basketball-bulk-buying-guide.html','quiet-indoor-sports-for-kids.html','indoor-school-sports-equipment-guide.html','products.html'],
 'silent-basketball-guide.html':['silent-basketball-vs-regular.html','silent-basketball-for-apartments.html','quiet-indoor-sports-for-kids.html','products.html'],
 'inquiry.html':['products.html','wholesale.html','wholesale-product-catalog.html'],
 'fabric-silent-basketball.html':['products.html','silent-basketball.html','videos.html','inquiry.html','weighted-flocked-basketball.html'],
 'weighted-flocked-basketball.html':['products.html','inquiry.html','fabric-silent-basketball.html'],
 'silent-soccer.html':['products.html','inquiry.html','fabric-silent-basketball.html'],
 'silent-basketball-bulk-buying-guide.html':['wholesale.html','inquiry.html','products.html'],
 'for-schools.html':['indoor-school-sports-equipment-guide.html','products.html','inquiry.html'],
 'for-coaches.html':['indoor-school-sports-equipment-guide.html','weighted-flocked-basketball.html','inquiry.html'],
 'silent-basketball-for-apartments.html':['quiet-indoor-sports-for-kids.html','products.html','inquiry.html'],
 'videos.html':['silent-basketball.html','fabric-silent-basketball.html','products.html','silent-basketball-for-apartments.html']
};
for(const [filename,links] of Object.entries(groups)){
 const file=path.join(root,filename);
 if(!fs.existsSync(file))throw Error('Missing approved source '+filename);
 let html=fs.readFileSync(file,'utf8');
 const begin=html.indexOf(START),end=html.indexOf(END);
 if((begin===-1)!==(end===-1))throw Error('Unbalanced SEO discovery links '+filename);
 if(begin>=0)html=html.slice(0,begin)+html.slice(end+END.length);
 if(!/<\/main>/i.test(html))throw Error('Missing main landmark '+filename);
 for(const href of links){if(!titles[href]||!fs.existsSync(path.join(root,href)))throw Error('Unknown crawlable destination '+href)}
 const list=links.map(href=>'<li><a href="'+href+'">'+titles[href]+'</a></li>').join('');
 const block=START+'<section class="section" aria-label="Explore more MING EAGLE products and buying information"><div class="wrap"><h2>Explore related products and buying information</h2><nav aria-label="Related product and buying pages"><ul>'+list+'</ul></nav></div></section>'+END;
 html=html.replace(/<\/main>/i,block+'</main>');
 fs.writeFileSync(file,html);
}
console.log('PASS: deterministic crawlable internal links on '+Object.keys(groups).length+' pages');
