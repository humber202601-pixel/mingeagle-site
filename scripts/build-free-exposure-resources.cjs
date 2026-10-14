// Useful first-party resources that can be shared without a signup or payment.
// This publishes on our own site; it never submits a social post or invents a review.
'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(process.argv[2]||'public');
const origin='https://www.mingeagle.com/';
const start='<!-- MING EAGLE FREE RESOURCES BEGIN -->',end='<!-- MING EAGLE FREE RESOURCES END -->';
const resources=[
 {page:'for-schools.html',id:'free-school-session',title:'A no-bounce ball session for a small PE group',intro:'A simple 10-minute activity to adapt to your space, pupils and supervision. Use an appropriate soft ball; a MING EAGLE purchase is not required.',cards:[
  ['2 minutes · Set the space','Clear a small activity zone and agree on a stop signal. Keep the ball in hand: no floor bouncing or wall shots.'],
  ['2 minutes · Mirror the leader','In pairs, one pupil slowly moves a held ball from waist to shoulder height. The partner mirrors the movement with empty hands. Switch roles.'],
  ['2 minutes · Careful handovers','Pass hand to hand around a small circle without throwing. Count controlled handovers, then change direction.'],
  ['2 minutes · Step and freeze','Carry the ball for three small steps, then freeze on the agreed signal. Leave room between pupils and adapt the movement to their abilities.'],
  ['2 minutes · Review','Ask which movement was easiest to control and which created noise. Reset the area and collect the equipment.']
 ],related:'indoor-school-sports-equipment-guide.html',relatedLabel:'School equipment checklist'},
 {page:'silent-basketball-for-apartments.html',id:'free-apartment-games',title:'Five ball games that skip repeated floor bouncing',intro:'Try short, controlled activities during agreed play hours. Soft balls and mats do not remove footsteps or building vibration; pause if the activity still disturbs other people.',cards:[
  ['Seated handovers','Sit facing a partner and hand the ball across slowly. Aim for ten careful exchanges without throwing.'],
  ['Around the waist','Stand in a clear space and pass a held ball around the waist. Change direction after five controlled circles.'],
  ['Mirror moves','One player makes slow movements with a held ball while the other copies. Switch leader after 30 seconds.'],
  ['Step and freeze','Carry the ball for three small steps and stop on a signal. Keep the path clear and keep the ball off the floor.'],
  ['Low target rolls','If the floor surface and household rules allow, sit down and gently roll toward a broad floor target. Skip this game if rolling still carries noise.']
 ],related:'quiet-indoor-sports-for-kids.html',relatedLabel:'More quiet indoor activity ideas'},
 {page:'custom-basketball-for-teams.html',id:'free-logo-brief',title:'Copy this checklist before requesting logo basketballs',intro:'Use this brief to reduce back-and-forth with a supplier. A visual logo preview is a planning aid, not proof of a finished printed sample.',cards:[
  ['Product and use','Name the exact model and size, intended activity and preferred color. Confirm that the chosen surface supports the proposed customization.'],
  ['Artwork','Provide your own authorized logo, requested colors, placement and approximate print dimensions. Ask which file format is needed.'],
  ['Quantity and destination','State the number of units and the actual destination country and postal code. Ask for the applicable minimum order quantity.'],
  ['Sample and approval','Confirm sample costs, artwork approval and whether a physical print sample is needed before a larger run.'],
  ['Delivered quote','Request item price, customization, freight, import-duty handling, applicable taxes and dispatch/transit estimates in writing. Do not assume a fixed bulk discount.']
 ],related:'custom-logo.html',relatedLabel:'Open the logo planning tool'}
];
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const style='<style>.meFree{padding:36px 0;background:#f2f7f8;color:#183341}.meFree .wrap{max-width:1100px}.meFree h2{font-size:clamp(23px,3vw,34px);line-height:1.2}.meFreeIntro{max-width:780px;line-height:1.7}.meFreeGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px;margin:20px 0}.meFreeGrid article{background:#fff;border:1px solid #d4e3e7;border-radius:12px;padding:18px}.meFreeGrid h3{font-size:17px;margin:0 0 10px}.meFreeGrid p{font-size:14px;line-height:1.65;margin:0}.meFreeLinks{display:flex;flex-wrap:wrap;gap:12px;margin:18px 0}.meFreeLinks a{padding:10px 14px;border:1px solid #b5cbd3;border-radius:8px;background:#fff;color:#164e63;text-decoration:underline}.meFree small{display:block;line-height:1.6;color:#506875}</style>';
for(const r of resources){
 const file=path.join(root,r.page);let html=fs.readFileSync(file,'utf8');
 if(!html.includes('</main>')||!html.includes('https://www.mingeagle.com/'+r.page))throw Error('Missing canonical page '+r.page);
 if(!fs.existsSync(path.join(root,r.related)))throw Error('Missing related resource '+r.related);
 if(html.includes(start)!==html.includes(end))throw Error('Unbalanced resource block');
 html=html.replace(new RegExp(start+'[\\s\\S]*?'+end,'g'),'');
 const url=origin+r.page+'#'+r.id;
 const text=r.title+'\n\n'+r.intro+'\n\n'+r.cards.map(([h,p])=>h+'\n'+p).join('\n\n')+'\n\nFirst-party activity/planning suggestions by MING EAGLE.\nSource: '+url+'\n';
 const filename=r.id+'.txt';fs.writeFileSync(path.join(root,filename),text);
 const share='https://www.facebook.com/sharer/sharer.php?u='+encodeURIComponent(url);
 const block=start+style+'<section class="meFree" id="'+r.id+'" lang="en" aria-labelledby="'+r.id+'-title"><div class="wrap"><p class="eyebrow">FREE TO READ &amp; SHARE</p><h2 id="'+r.id+'-title">'+esc(r.title)+'</h2><p class="meFreeIntro">'+esc(r.intro)+'</p><div class="meFreeGrid">'+r.cards.map(([h,p])=>'<article><h3>'+esc(h)+'</h3><p>'+esc(p)+'</p></article>').join('')+'</div><div class="meFreeLinks"><a href="'+filename+'" download>Download the text checklist</a><a href="'+r.related+'">'+esc(r.relatedLabel)+' →</a><a href="'+esc(share)+'" target="_blank" rel="noopener noreferrer">Share this resource</a></div><small>First-party suggestions by MING EAGLE. No signup or purchase required. These are activity/planning ideas, not independently tested noise results.</small></div></section>'+end;
 html=html.replace('</main>',block+'</main>');
 // Only these meaningfully updated pages get this editorial modification date.
 html=html.replace(/("dateModified"\s*:\s*")[^"]+(")/g,(_,a,b)=>a+'2026-10-14'+b);
 fs.writeFileSync(file,html);
}
console.log('PASS: 3 original, signup-free resources and matching downloadable checklists; sharing is a visitor action.');
