// Add direct context-preserving quote CTAs to four verified catalog cards.
// Customer must still confirm identity, variant, terms and Turnstile in the inquiry form.
const fs=require('node:fs'),path=require('node:path');
const base=path.resolve(process.argv[2]||'public');
const file=path.join(base,'products.html');
let html=fs.readFileSync(file,'utf8');
const begin='<!-- MING EAGLE DIRECT RFQ BEGIN -->',end='<!-- MING EAGLE DIRECT RFQ END -->';
const products=[
 ['p1','Flocked Silent Basketball Set'],
 ['p2','Fabric-Cover Silent Basketball Set'],
 ['p3','Weighted Flocked Silent Basketball'],
 ['p4','Flocked Silent Soccer Ball'],
];
if(!fs.existsSync(path.join(base,'inquiry.html')))throw Error('Inquiry destination unavailable');
let added=0;
html=html.replace(/<article class="pcard">[\s\S]*?<\/article>/gi,card=>{
 const found=products.filter(([id])=>card.includes('data-i18n="'+id+'.title"'));
 if(found.length!==1)return card;
 const [id,label]=found[0];
 const clean=card.replace(/<!-- MING EAGLE DIRECT RFQ BEGIN -->[\s\S]*?<!-- MING EAGLE DIRECT RFQ END -->/g,'');
 const href='inquiry.html?type=quote&amp;product='+encodeURIComponent(label);
 const button=begin+'<a class="more" data-i18n="nav.quote" href="'+href+'" aria-label="Request a quote for '+label+'">Get a quote</a>'+end;
 if(!clean.includes('</div></article>'))throw Error('Catalog card structure unexpected '+id);
 added++;return clean.replace('</div></article>',button+'</div></article>');
});
if(added!==products.length)throw Error('Catalog cards mismatch: '+added+' expected '+products.length);
fs.writeFileSync(file,html);
console.log('PASS: direct RFQ CTA for '+added+' catalog products');
