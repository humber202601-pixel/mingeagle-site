const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const catalog=JSON.parse(fs.readFileSync('public/customer-reviews.json','utf8')),reviews=catalog.reviews;
const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
assert.equal(reviews.length,80);assert.equal(new Set(reviews.map(r=>r.id)).size,80);assert.equal(new Set(reviews.map(r=>r.text.toLowerCase().trim())).size,80);
assert.equal(reviews.flatMap(r=>r.photos).length,19);assert.equal(reviews.flatMap(r=>r.videos).length,1);
for(const r of reviews){assert.equal(r.rating,5);assert.equal(r.region,'US');assert.equal(r.product,'flocked-silent-basketball-set');assert(/^[357]$/.test(r.size));assert(/^\d{4}-\d{2}-\d{2}$/.test(r.date));assert(r.text.trim());for(const item of [...r.photos,...r.videos]){assert(/^assets\/customer-reviews\/[A-Za-z0-9._-]+\.(webp|mp4)$/.test(item.src));assert(fs.statSync('public/'+item.src).size>100);if(item.poster)assert(fs.existsSync('public/'+item.poster));}}
const digest=require('node:crypto').createHash('sha256').update(JSON.stringify(reviews.map(r=>[r.id,r.rating,r.date,r.text,r.size,r.color]))).digest('hex');
const evidence=JSON.parse(fs.readFileSync('docs/verification/customer-reviews-80-evidence.json','utf8'));assert.equal(digest,evidence.reviewContentSha256,'Review text/metadata changed without source evidence update');
const videoCatalog=JSON.parse(fs.readFileSync('public/customer-videos.json','utf8'));
const videoEvidence=JSON.parse(fs.readFileSync('docs/verification/customer-videos-evidence.json','utf8'));
assert.equal(videoCatalog.videos.length,5);assert.equal(new Set(videoCatalog.videos.map(v=>v.src)).size,5);
for(const v of videoCatalog.videos){
 const e=videoEvidence.videos.find(x=>x.id===v.id);assert(e);
 for(const key of ['id','rating','region','product','spu','sourceRow','date','text','size','color','src','poster','duration'])assert.deepEqual(v[key],e[key]);
 assert.equal(v.rating,5);assert.equal(v.region,'US');assert.equal(v.spu,'S240106003386');assert.equal(v.product,'flocked-silent-basketball-set');
 assert(Math.abs(v.duration-e.originalDuration)<0.05,'Full clip duration must be retained');
 assert.equal(require('node:crypto').createHash('sha256').update(fs.readFileSync('public/'+v.src)).digest('hex'),e.publishedSha256);
 assert(fs.statSync('public/'+v.poster).size>100);
}
function checkHtml(name,html){
 assert(html.includes('customer-feedback.css?v=20261023-videos5'));assert(html.includes('customer-reviews.js?v=20261023-videos5'));
 const section=html.match(/<section class="section reviewProof"[^>]*>[\s\S]*?<\/section>/)?.[0];assert(section,name+' missing review section');
 assert(section.includes('data-review-collection="80"'));
 const gallery=section.match(/<div class="buyerVideos"[\s\S]*?<div class="reviewMediaWall">/)?.[0];assert(gallery,'Buyer video gallery missing');
 assert.equal((gallery.match(/<article class="buyerVideoCard" data-buyer-video-card/g)||[]).length,5);assert.equal((gallery.match(/data-buyer-video-card hidden/g)||[]).length,2);
 assert(!gallery.includes('<video'),'Gallery must not preload MP4s');assert(gallery.includes('View more videos (2)'));assert(gallery.includes('data-buyer-video-status'));assert(gallery.includes('aria-controls="buyer-video-grid"'));
 for(const v of videoCatalog.videos){assert(gallery.includes('data-review-video="'+v.src+'"'));assert(gallery.includes(esc(v.text)));}
 assert(section.includes(catalog.sourceUrl.replaceAll('&','&amp;')));assert(section.includes('Selected positive excerpts from written feedback on our TikTok Shop listing'));assert(section.includes('not a complete review feed or an overall store rating'));
 assert(!/Verified purchase|Verified buyer|aggregateRating|5\.0 out of 5/.test(section));
 const ids=[...section.matchAll(/data-review-id="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,name==='homepage'?3:80);assert.equal(new Set(ids).size,ids.length);
 for(const id of ids){const r=reviews.find(x=>x.id===id);assert(r);assert(section.includes('<blockquote>'+esc(r.text)+'</blockquote>'));}
 assert(section.includes('data-review-video='));assert(section.includes('loading="lazy"'));assert(section.includes('<dialog'));
 if(name!=='homepage'){assert(section.includes('data-review-filter="photos"'));assert(section.includes('data-review-filter="videos"'));assert(section.includes('data-review-more'));assert.equal((section.match(/ hidden/g)||[]).length>=68,true);}
}
for(const [n,f] of [['homepage','index.html'],['product','silent-basketball.html']])checkHtml(n,fs.readFileSync('public/'+f,'utf8'));
const code=fs.readFileSync('public/customer-reviews.js','utf8');new vm.Script(code);
const {selectReviews}=require('../public/customer-reviews.js');
const data=reviews.map((r,order)=>({id:r.id,date:r.date,photos:r.photos.length,videos:r.videos.length,order}));
for(const filter of ['all','photos','videos','text']){const expected=data.filter(r=>filter==='photos'?r.photos:filter==='videos'?r.videos:filter==='text'?!r.photos&&!r.videos:true);const first=selectReviews(data,{filter});assert.equal(first.total,expected.length);assert.equal(first.visible.length,Math.min(12,expected.length));assert.equal(first.more,expected.length>12);const all=selectReviews(data,{filter,limit:100});assert.deepEqual(new Set(all.visible.map(r=>r.id)),new Set(expected.map(r=>r.id)));assert.equal(all.more,false);}
assert.equal(selectReviews(data,{limit:24}).visible.length,24);assert.equal(selectReviews(data,{limit:100}).visible.length,80);
const newest=selectReviews(data,{sort:'newest',limit:80}).visible;assert(newest.every((r,i)=>!i||newest[i-1].date>=r.date));assert.deepEqual(selectReviews(data).visible,selectReviews(data).visible);
assert(code.includes("element.preload='none'"));
console.log('PASS five selected full customer videos and expandable poster gallery.');
console.log('PASS 80 unique original five-star US reviews; 19 mapped photos; one mapped customer video; filters/load-more/sort; source disclosure; media files.');
if(!process.argv.includes('--local'))(async()=>{for(const [name,path] of [['homepage',''],['product','silent-basketball.html']]){const response=await fetch('https://www.mingeagle.com/'+path+'?customer_proof_check='+Date.now(),{cache:'no-store'});assert(response.ok);checkHtml(name,await response.text());console.log('PASS live expanded customer reviews:',name);}const response=await fetch('https://www.mingeagle.com/customer-reviews.json?review_check='+Date.now());assert(response.ok);assert.deepEqual(await response.json(),catalog);console.log('PASS live review source data matches approved collection.');const videos=await fetch('https://www.mingeagle.com/customer-videos.json?video_check='+Date.now());assert(videos.ok);assert.deepEqual(await videos.json(),videoCatalog);console.log('PASS live selected video catalog.');})().catch(e=>{console.error(e);process.exitCode=1;});
