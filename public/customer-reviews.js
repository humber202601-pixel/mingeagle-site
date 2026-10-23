(function(){
'use strict';
const PAGE_SIZE=12;
function selectReviews(reviews,{filter='all',sort='featured',limit=PAGE_SIZE}={}){
 const result=reviews.filter(r=>filter==='photos'?r.photos>0:filter==='videos'?r.videos>0:filter==='text'?r.photos===0&&r.videos===0:true);
 result.sort(sort==='newest'?(a,b)=>b.date.localeCompare(a.date)||a.order-b.order:(a,b)=>a.order-b.order);
 return {total:result.length,visible:result.slice(0,limit),more:result.length>limit};
}
if(typeof module!=='undefined'&&module.exports)module.exports={PAGE_SIZE,selectReviews};
if(typeof document==='undefined')return;
for(const root of document.querySelectorAll('[data-review-browser]')){
 const grid=root.querySelector('.reviewGrid');
 const cards=[...grid.querySelectorAll('[data-review-id]')].map(el=>({el,id:el.dataset.reviewId,date:el.dataset.reviewDate,photos:Number(el.dataset.reviewPhotos),videos:Number(el.dataset.reviewVideos),order:Number(el.dataset.reviewOrder)}));
 let filter='all',sort='featured',limit=PAGE_SIZE;
 const more=root.querySelector('[data-review-more]'),status=root.querySelector('[data-review-status]');
 function render(){const selected=selectReviews(cards,{filter,sort,limit});const visible=new Set(selected.visible.map(r=>r.id));for(const c of cards)c.el.hidden=!visible.has(c.id);for(const c of selected.visible)grid.append(c.el);more.hidden=!selected.more;more.textContent='Load '+Math.min(PAGE_SIZE,selected.total-selected.visible.length)+' more reviews';status.textContent='Showing '+selected.visible.length+' of '+selected.total+' selected five-star reviews';}
 root.querySelector('[data-review-controls]').hidden=false;
 root.querySelectorAll('[data-review-filter]').forEach(button=>button.addEventListener('click',()=>{filter=button.dataset.reviewFilter;limit=PAGE_SIZE;root.querySelectorAll('[data-review-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));render();}));
 root.querySelector('[data-review-sort]').addEventListener('change',e=>{sort=e.target.value;limit=PAGE_SIZE;render();});
 more.addEventListener('click',()=>{limit+=PAGE_SIZE;render();});render();
}
for(const root of document.querySelectorAll('.reviewProof')){
 const dialog=root.querySelector('dialog'),host=dialog?.querySelector('[data-review-media]'),caption=dialog?.querySelector('[data-review-caption]');let opener;
 if(!dialog||!host)continue;
 const clear=()=>{host.querySelectorAll('video').forEach(v=>v.pause());host.replaceChildren();if(opener?.isConnected)opener.focus();};
 dialog.addEventListener('close',clear);dialog.querySelector('[data-review-close]').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
 root.addEventListener('click',e=>{const button=e.target.closest('[data-review-image],[data-review-video]');if(!button)return;const url=button.dataset.reviewImage||button.dataset.reviewVideo;if(!/^assets\/customer-reviews\/[A-Za-z0-9._-]+\.(webp|mp4)$/.test(url))return;opener=button;host.replaceChildren();let element;if(button.dataset.reviewVideo){element=document.createElement('video');element.controls=true;element.playsInline=true;element.preload='none';element.poster=button.dataset.videoPoster||'';}else{element=document.createElement('img');element.alt=button.dataset.mediaCaption||'Customer photo';}element.src=url;host.append(element);caption.textContent=button.dataset.mediaCaption||'Customer upload';dialog.showModal();});
}
})();
