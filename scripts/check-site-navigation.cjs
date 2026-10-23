'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.join(__dirname,'..','public');
const pages=[
 'index.html','wholesale.html','for-schools.html','procurement.html','products.html',
 'custom-logo.html','inquiry.html','order-status.html','stories.html','videos.html',
 'policies.html','for-coaches.html','silent-basketball-guide.html',
 'custom-basketball-for-teams.html','learn.html','silent-basketball-vs-regular.html',
 'thank-you.html','fabric-silent-basketball.html','silent-basketball.html',
 'silent-soccer.html','weighted-flocked-basketball.html'
];
const extract=(html,mobile)=>{
 const re=mobile?/<nav\b[^>]*aria-label="Mobile navigation"[^>]*>([\s\S]*?)<\/nav>/i:
  /<nav\b[^>]*class="navlinks"[^>]*>([\s\S]*?)<\/nav>/i;
 const match=html.match(re);
 assert(match,'Missing '+(mobile?'mobile':'desktop')+' navigation');
 // Only per-page accessibility current-page marker may differ; ordering,
 // destinations and visible labels must all remain identical.
 return match[1].replace(/ aria-current="page"/g,'').replace(/\s+/g,' ').trim();
};
const home=fs.readFileSync(path.join(root,'index.html'),'utf8');
for(const mobile of [false,true]){
 const homeNav=extract(home,mobile);
 assert(homeNav.includes('href="silent-basketball-guide.html"'),
  'The setup and care guide must remain discoverable in the '+(mobile?'mobile':'desktop')+' main navigation');
 assert(/href="silent-basketball-guide\.html"[^>]*>Guide<\/a>/.test(homeNav),
  'The main navigation must show a clear Guide label linking to installation and care instructions');
 const canonical=extract(home,mobile);
 for(const page of pages){
  const html=fs.readFileSync(path.join(root,page),'utf8');
  assert.equal(extract(html,mobile),canonical,
   page+' has drifted from the homepage B2B '+(mobile?'mobile':'desktop')+' navigation');
 }
}
console.log('PASS: 21 public pages share exact B2B desktop and mobile main navigation');
