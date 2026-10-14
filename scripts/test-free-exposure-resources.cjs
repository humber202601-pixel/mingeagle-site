'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'me-free-resources-'));
const pages=['for-schools.html','silent-basketball-for-apartments.html','custom-basketball-for-teams.html'];
try{
 for(const f of [...pages,'indoor-school-sports-equipment-guide.html','quiet-indoor-sports-for-kids.html','custom-logo.html'])fs.copyFileSync('public/'+f,path.join(temp,f));
 const run=()=>cp.execFileSync(process.execPath,['scripts/build-free-exposure-resources.cjs',temp],{stdio:'pipe'});
 run();const first=pages.map(p=>fs.readFileSync(path.join(temp,p),'utf8'));run();
 pages.forEach((p,i)=>{
  const html=fs.readFileSync(path.join(temp,p),'utf8');assert.equal(html,first[i]);
  assert.equal((html.match(/MING EAGLE FREE RESOURCES BEGIN/g)||[]).length,1);
  const block=html.split('<!-- MING EAGLE FREE RESOURCES BEGIN -->')[1].split('<!-- MING EAGLE FREE RESOURCES END -->')[0];
  const download=block.match(/href="([^"]+\.txt)" download/)[1],text=fs.readFileSync(path.join(temp,download),'utf8');
  assert(text.includes('Source: https://www.mingeagle.com/'+p+'#'));
  assert(block.includes('No signup or purchase required'));
  assert(block.includes('facebook.com/sharer/sharer.php?u='));
  assert(!/<form|<script|iframe|fetch\(/i.test(block),'A resource must not send a post or collect visitor details');
 });
 fs.unlinkSync(path.join(temp,'custom-logo.html'));assert.throws(run,'Missing destinations must fail before publishing broken links');
 console.log('PASS: matching page/download content, safe share intent, no signup/post submission and idempotent resource builds.');
}finally{fs.rmSync(temp,{recursive:true,force:true})}
