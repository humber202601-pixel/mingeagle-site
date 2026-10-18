// Shared, idempotent metadata hygiene for the self-contained public website.
// Runs after all page builders. Uses only already-published brand artwork.
// No addresses, ratings, prices or availability are inferred.
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(process.argv[2]||'public');
const checkOnly=process.argv.includes('--check');
const icon='assets/mingeagle-social-wordmark.svg';
const logo='assets/mingeagle-social-wordmark.png';
const logoUrl='https://www.mingeagle.com/'+logo;
const faviconTag='<link rel="icon" type="image/svg+xml" href="/'+icon+'">';
for(const asset of [icon,logo]){
 if(!fs.existsSync(path.join(root,asset)))throw new Error('Missing verified brand artwork: '+asset);
}
const files=fs.readdirSync(root).filter(name=>name.endsWith('.html')).sort();
let changes=0,organizations=0;
for(const name of files){
 const filepath=path.join(root,name);
 const original=fs.readFileSync(filepath,'utf8');
 if(!/<\/head>/i.test(original))throw new Error('Missing head: '+name);
 let html=original;
 const head=html.split(/<\/head>/i)[0];
 if(!/<link\b(?=[^>]*\brel=["'](?:shortcut )?icon["'])[^>]*>/i.test(head)){
  html=html.replace(/<\/head>/i,faviconTag+'</head>');
 }
 html=html.replace(/(<script\b[^>]*type=["']application\/ld\+json["'][^>]*>)([\s\S]*?)(<\/script>)/gi,(match,open,raw,close)=>{
  let data;
  try{data=JSON.parse(raw)}catch(e){throw new Error('Invalid JSON-LD on '+name+': '+e.message)}
  let changed=false;
  const visit=(node)=>{
   if(!node||typeof node!=='object')return;
   if(Array.isArray(node)){node.forEach(visit);return;}
   const types=Array.isArray(node['@type'])?node['@type']:[node['@type']];
   if(types.includes('Organization')&&/\bMING EAGLE\b/i.test(String(node.name||''))){
    organizations++;
    if(!node.logo){
     node.logo={'@type':'ImageObject','url':logoUrl,'contentUrl':logoUrl};
     changed=true;
    }
   }
   Object.values(node).forEach(visit);
  };
  visit(data);
  return changed?open+JSON.stringify(data).replace(/</g,'\\u003c')+close:match;
 });
 if(html!==original){
  changes++;
  if(checkOnly)throw new Error('Non-idempotent or not yet built: '+name);
  fs.writeFileSync(filepath,html);
 }
}
console.log((checkOnly?'PASS:':'UPDATED:')+' brand favicon on '+files.length+' pages; '+organizations+' existing Organization nodes examined; '+changes+' changed pages.');
