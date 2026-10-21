'use strict';
// Install the existing privacy-minimized first-visit attribution script only on
// public canonical / localized pages listed in the published sitemaps.
// No network beacons, cookies, or personal identifiers are introduced here.
const fs=require('node:fs'),path=require('node:path');
const dirArg=process.argv.slice(2).find(x=>!x.startsWith('--'));
const root=path.resolve(dirArg||'public');
const checkOnly=process.argv.includes('--check');
const tag='<script defer src="geo-source-capture.js"></script>';
const base='https://www.mingeagle.com/';
const docs=['sitemap.xml','sitemap-localized.xml'];
const paths=new Set();
for(const doc of docs){
 const xml=fs.readFileSync(path.join(root,doc),'utf8');
 for(const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)){
  const url=new URL(m[1]);
  if(url.origin!==base.slice(0,-1))throw new Error('Unexpected sitemap host: '+m[1]);
  if(url.search||url.hash)throw new Error('Sitemap URL with query or hash: '+m[1]);
  const filename=url.pathname==='/'?'index.html':url.pathname.slice(1);
  if(!/^[a-z0-9-]+\.html$/.test(filename))throw new Error('Unsupported public page: '+m[1]);
  paths.add(filename);
 }
}
if(paths.size<25||paths.size>80)throw new Error('Unexpected public target count: '+paths.size);
let updated=0;
for(const filename of paths){
 const full=path.join(root,filename);
 let html=fs.readFileSync(full,'utf8');
 const count=html.split(tag).length-1;
 if(count>1)throw new Error('Duplicate first-touch script on '+filename);
 if(!/<\/head>/i.test(html))throw new Error('Missing HTML head on '+filename);
 if(count===0){
  if(checkOnly)throw new Error('No first-touch script on '+filename);
  html=html.replace(/<\/head>/i,tag+'\n</head>');
  fs.writeFileSync(full,html);
  updated++;
 }
 if(html.includes('<script defer src="forms-core.js"></script>')){
  if(html.indexOf(tag)>html.indexOf('<script defer src="forms-core.js"></script>'))
   throw new Error('First-touch capture must load before forms core on '+filename);
 }
}
console.log('PASS: '+paths.size+' public sitemap pages '+(checkOnly?'verified':'prepared')+' for first-visit inquiry attribution; '+updated+' modified.');
