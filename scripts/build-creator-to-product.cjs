// Connect published creator posts to the exact product they demonstrate.
// Video metadata comes exclusively from public/creator-videos.json. This is
// navigation evidence, not proof that a user played a video or bought goods.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||'public');
const source=JSON.parse(fs.readFileSync(path.join(root,'creator-videos.json'),'utf8'));
const product=JSON.parse(fs.readFileSync(path.join(root,'product-master.json'),'utf8'));
assert.equal(source.product,product.p1.name);
assert.equal(source.video_count,source.videos.length);
assert.equal(new Set(source.videos.map(v=>v.code)).size,source.video_count);
const byCode=new Map(source.videos.map(v=>{
 assert(/^V0(?:0[1-9]|1[0-6])$/.test(v.code));
 assert(v.url==='https://www.tiktok.com/'+v.creator+'/video/'+v.video_id);
 return [v.code,v];
}));
const file=path.join(root,'videos.html');
let html=fs.readFileSync(file,'utf8');
const begin='<!-- MING EAGLE CREATOR BUY CTA BEGIN -->';
const end='<!-- MING EAGLE CREATOR BUY CTA END -->';
const styleBegin='<!-- MING EAGLE CREATOR BUY STYLE BEGIN -->';
const styleEnd='<!-- MING EAGLE CREATOR BUY STYLE END -->';
const style=styleBegin+'<style>.creatorBuyCta{margin:12px 0 0;padding:12px 13px;background:#f8fbff;border:1px solid #dce6f3;border-radius:10px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between}.creatorBuyCta p{margin:0;color:#475569;line-height:1.5;font-size:12px;flex:1 1 160px}.creatorBuyCta a{display:inline-block;padding:10px 13px;border-radius:9px;background:#e85b2d;color:#fff!important;font-size:13px;font-weight:750;text-decoration:none!important}.creatorBuyCta a:hover{background:#c74c26}.videoBuyerNext{background:#fff7ef;border-block:1px solid #f1dcc5;padding:27px 0}.videoBuyerNext .wrap{display:grid;grid-template-columns:1fr auto;align-items:center;gap:20px}.videoBuyerNext h2{margin:0 0 8px;font-size:clamp(23px,3vw,32px)}.videoBuyerNext p{margin:0;font-size:14px;line-height:1.7;color:#475569;max-width:720px}.videoBuyerNext a{display:inline-block;padding:13px 17px;border-radius:9px;background:#df582f;color:#fff!important;font-weight:750;text-decoration:none!important}@media(max-width:650px){.videoBuyerNext .wrap{grid-template-columns:1fr}}</style>'+styleEnd;
html=html.replace(new RegExp(styleBegin+'[\\s\\S]*?'+styleEnd,'g'),'');
html=html.replace(/<!-- MING EAGLE CREATOR BUY CTA BEGIN -->[\s\S]*?<!-- MING EAGLE CREATOR BUY CTA END -->/g,'');
let matched=0;const seen=new Set();
html=html.replace(/<article class="creatorVideoCard[^"]*"[\s\S]*?<\/article>/g,card=>{
 const code=card.match(/\bV0(?:0[1-9]|1[0-6])\b/)?.[0];
 if(!code)return card;
 const video=byCode.get(code);
 assert(video,'Unknown video on page '+code);
 assert(card.includes('/'+video.video_id),'Video ID mismatched '+code);
 matched++;seen.add(code);
 const box=begin+'<div class="creatorBuyCta"><p>Interested in the ball shown here? Choose the actual size and color of the Flocked Silent Basketball Set. This is a video-to-product link, not evidence of viewing or purchase.</p><a href="silent-basketball.html?demo='+code+'#buy-now" aria-label="Select the demonstrated Flocked Silent Basketball Set from '+code+'">Choose this ball &amp; hoop set →</a></div>'+end;
 return card.replace('</article>',box+'</article>');
});
assert.equal(seen.size,source.video_count,'All 16 curated videos need exact product links');
assert(matched>=source.video_count,'Missing creator cards');
const summaryBegin='<!-- MING EAGLE VIDEO PURCHASE SUMMARY BEGIN -->';
const summaryEnd='<!-- MING EAGLE VIDEO PURCHASE SUMMARY END -->';
html=html.replace(new RegExp(summaryBegin+'[\\s\\S]*?'+summaryEnd,'g'),'');
const summary=summaryBegin+'<section class="videoBuyerNext" id="creator-shopping-guide"><div class="wrap"><div><h2>Liked the demonstration? Choose the actual set.</h2><p>The creator gallery shows the flocked soft basketball set with an adhesive mini hoop, not the fabric-cover, weighted or soccer models. The size, color, price and air shipping are confirmed in the product selector; indoor sound varies by flooring and how the ball is used. Payment is not yet enabled.</p></div><a href="silent-basketball.html?demo=V005#buy-now">See colors, sizes and US price →</a></div></section>'+summaryEnd;
const mark='<section class="section creatorProfiles">';
assert(html.includes(mark),'No insertion anchor for static video buyer guide');
html=html.replace(mark,summary+mark);
assert(html.includes('</head>'));
html=html.replace('</head>',style+'</head>');
fs.writeFileSync(file,html);
console.log('PASS: '+seen.size+' actual creator clips, '+matched+' card appearances linked to the one verified flocked ball, no false video, view or payment claims.');
