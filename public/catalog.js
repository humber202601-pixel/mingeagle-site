(async function(){
  const grid=document.querySelector('.grid4');
  const tbody=document.querySelector('.compareTable tbody');
  if(!grid&&!tbody)return;
  try{
    const data=await fetch('data/site-content.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('content '+r.status);return r.json();});
    const products=(data.products||[]).filter(p=>p.status==='published').sort((a,b)=>(a.sort||0)-(b.sort||0));
    if(grid){
      grid.innerHTML=products.map(p=>`<article class="pcard"><img alt="${esc(p.name)}" src="${esc(p.heroImage)}"/><div class="pbody"><h3>${esc(p.name)}</h3><p>${esc(p.short)}</p><div class="meta"><span class="tag">${esc((p.sizes||[]).join(' / ').replaceAll('No. ',''))}</span><span class="tag">${esc((p.colors||[]).join(' / '))}</span>${(p.tags||[]).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div><a class="more" href="${esc(p.page)}">View product →</a></div></article>`).join('');
    }
    if(tbody){
      tbody.innerHTML=products.map(p=>`<tr><td>${esc(p.name)}</td><td>${esc(p.bestFor)}</td><td>${esc((p.sizes||[]).join(' / '))}</td><td>${esc((p.colors||[]).join(' · '))}</td></tr>`).join('');
    }
  }catch(err){console.error('MING EAGLE catalog master data failed to load',err);}
  function esc(v){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');}
})();
