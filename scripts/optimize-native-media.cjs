// Native browser image loading: keep first image on each page eager, defer later images.
// No CDN, tracking, third-party scripts, or image modifications.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(process.argv[2]||'public');
const pages=['index.html','products.html','silent-basketball.html','fabric-silent-basketball.html',
 'weighted-flocked-basketball.html','silent-soccer.html','stories.html'];
let changed=0;
for(const filename of pages){
 const file=path.join(root,filename);
 if(!fs.existsSync(file))throw Error('Missing verified media page '+filename);
 let html=fs.readFileSync(file,'utf8'),index=0;
 html=html.replace(/<img\b[^>]*>/gi,tag=>{
  const first=index++===0;
  if(!/\balt\s*=/.test(tag)||!/\bsrc\s*=/.test(tag))throw Error('Image missing alt or src '+filename);
  const attrs=(/\bloading\s*=/.test(tag)?'':first?' loading="eager"':' loading="lazy"')+
    (/\bdecoding\s*=/.test(tag)?'':' decoding="async"');
  if(!attrs)return tag;
  changed++;
  return tag.replace(/(\s*\/?>)$/,attrs+'$1');
 });
 fs.writeFileSync(file,html);
}
console.log('PASS: native image hints across '+pages.length+' verified media pages; modified tags '+changed);
