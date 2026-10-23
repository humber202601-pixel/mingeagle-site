// Fast, offline source-size regression gate. These are raw asset bytes, NOT
// Lighthouse scores, field LCP/INP/CLS or compressed transfer measurements.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(process.argv[2]||'public');
const LIMITS={
 totalPublic:5_700_000,
 imagesTotal:3_800_000,
 jsTotal:1_100_000,
 singleImage:330_000,
 heroImage:280_000,
 singleScript:550_000,
};
function gather(folder,prefix=''){
 let found=[];
 for(const entry of fs.readdirSync(folder,{withFileTypes:true})){
  const name=prefix?prefix+'/'+entry.name:entry.name;
  if(entry.isDirectory())found=found.concat(gather(path.join(folder,entry.name),name));
  else if(entry.isFile())found.push({name,bytes:fs.statSync(path.join(folder,entry.name)).size});
 }
 return found;
}
const all=gather(root),images=all.filter(x=>/^assets\/.*\.(?:webp|jpe?g|png)$/i.test(x.name));
const scripts=all.filter(x=>/\.js$/i.test(x.name));
const sum=arr=>arr.reduce((total,f)=>total+f.bytes,0);
// Customer proof is opt-in/lazy media, separately capped; existing storefront budgets remain unchanged.
const customerMedia=all.filter(x=>/^assets\/customer-reviews\//.test(x.name));
const customerImages=images.filter(x=>/^assets\/customer-reviews\//.test(x.name));
const totals={all:sum(all)-sum(customerMedia),images:sum(images)-sum(customerImages),js:sum(scripts)};
const violations=[];
const bound=(label,value,max)=>{if(value>max)violations.push(label+': '+value+' > '+max+' raw bytes')};
bound('customer review media collection',sum(customerMedia),5_000_000);
for(const file of customerMedia)bound(file.name,file.bytes,/\.mp4$/i.test(file.name)?1_750_000:80_000);
console.log('Lazy customer review media: '+sum(customerMedia)+' bytes; separate 5 MB cap; videos preload=none.');
bound('public artifact',totals.all,LIMITS.totalPublic);
bound('first-party images total',totals.images,LIMITS.imagesTotal);
bound('first-party scripts total',totals.js,LIMITS.jsTotal);
for(const file of images){
 bound(file.name,file.bytes,LIMITS.singleImage);
 if(/^assets\/hero-.*\.webp$/i.test(file.name))bound('hero '+file.name,file.bytes,LIMITS.heroImage);
}
for(const file of scripts)bound(file.name,file.bytes,LIMITS.singleScript);
for(const name of ['index.html','products.html','inquiry.html','custom-logo.html']){
 if(!all.some(x=>x.name===name))violations.push('Missing key site page: '+name);
}
if(!images.length||!scripts.length)violations.push('Asset inventory unexpectedly empty');
const mb=v=>(v/1024/1024).toFixed(2)+' MiB';
console.log('Static raw assets: public '+mb(totals.all)+', images '+mb(totals.images)+', JavaScript '+mb(totals.js));
console.log('Largest JS: '+scripts.slice().sort((a,b)=>b.bytes-a.bytes).slice(0,3).map(z=>z.name+' ('+mb(z.bytes)+')').join('; '));
if(violations.length){console.error('FAIL: asset size growth needs a documented optimization/review:\n'+violations.join('\n'));process.exitCode=1}
else console.log('PASS: static resource size regression gate; real-world Chrome UX metrics not measured');
