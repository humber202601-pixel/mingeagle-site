from pathlib import Path
import json,re,html
r=Path('public');locales=json.loads(Path('admin/learning-copy.json').read_text());en=locales['en'];master=json.loads((r/'product-master.json').read_text())
base=(r/'index.html').read_text();header=base[base.index('<header class="top">'):base.index('<main id=')];footer=base[base.index('<a class="whatsapp"'):]
version='20261010-learn2'
footer=re.sub(r'<script src="learning(?:-links)?\.js[^"]*" defer></script>','',footer)
footer=footer.replace('</body>',f'<script src="learning.js?v={version}" defer></script></body>')
def text(k,tag='p',cls=''):
 return '<'+tag+(f' class="{cls}"' if cls else '')+f' data-learn="{k}">'+html.escape(en[k])+'</'+tag+'>'
def link(k,href,cls='btn'):
 return f'<a class="{cls}" data-learn="{k}" href="{html.escape(href,quote=True)}">{html.escape(en[k])}</a>'
def section(kind,i,j):return '<section class="learnSection">'+text(f'{kind}.{i}','h2')+text(f'{kind}.{j}')+'</section>'
paths={'compare':'silent-basketball-vs-regular.html','team':'custom-basketball-for-teams.html','hub':'learn.html'}
images={'compare':master['p1']['hero'],'team':master['p3']['hero'],'hub':master['p1']['hero']}
def related():
 return '<section class="learnRelated" id="related-guides"><div class="wrap">'+text('common.0','div','eyebrow')+text('common.1','h2')+text('common.2','p','lead')+'<div class="learnCards"><article>'+text('common.7','div','eyebrow')+text('compare.0','h3')+link('common.3',paths['compare'],'more')+'</article><article>'+text('common.8','div','eyebrow')+text('team.0','h3')+link('common.4',paths['team'],'more')+'</article><article>'+text('common.5','h3')+link('common.17','silent-basketball-guide.html','more')+link('common.13','learn.html','more')+'</article></div></div></section>'
def faq(kind):
 first=23 if kind=='compare' else 14
 pairs=[(i,i+1) for i in range(first,29,2)] if kind=='compare' else [(14,15),(16,17),(18,19),(20,21)]
 return '<section class="learnSection learnQuestions">'+''.join('<details>'+text(f'{kind}.{i}','summary')+text(f'{kind}.{j}')+'</details>' for i,j in pairs)+'</section>'
def table():
 rows=[]
 for id,p in master.items():
  eligible=id in ('p1','p3');route={'p1':'silent-basketball.html','p2':'fabric-silent-basketball.html','p3':'weighted-flocked-basketball.html','p4':'silent-soccer.html'}[id]
  rows.append('<tr><th scope="row"><a href="'+route+'">'+html.escape(p['name'])+'</a></th><td>'+html.escape(p['sizes'])+'</td><td>'+html.escape(p['colors'])+'</td><td>'+text('common.22' if eligible else 'common.23','span')+'</td></tr>')
 return '<div class="learnTableWrap" role="region" aria-label="Model sizes, colors and logo eligibility" tabindex="0"><table class="learnTable"><caption>'+text('common.9','span')+'</caption><thead><tr>'+''.join(text('common.'+str(i),'th') for i in [18,19,20,21])+'</tr></thead><tbody>'+''.join(rows)+'</tbody></table></div>'
def comparison_table():
 rows=[(7,8,9),(10,11,12),(13,14,15),(16,17,18)]
 return '<div class="learnTableWrap" role="region" aria-label="Basketball comparison" tabindex="0"><table class="learnTable"><caption>'+text('compare.6','span')+'</caption><thead><tr>'+text('common.26','th')+'<th>MING EAGLE</th>'+text('compare.9','th')+'</tr></thead><tbody>'+''.join('<tr>'+text(f'compare.{a}','th')+text(f'compare.{b}','td')+text(f'compare.{c}','td')+'</tr>' for a,b,c in rows)+'</tbody></table></div>'
for kind in ['compare','team','hub']:
 path=paths[kind];url='https://www.mingeagle.com/'+path;k='common' if kind=='hub' else kind;title=en['common.24'] if kind=='hub' else en[k+'.0'];desc=en[k+'.2'] if kind=='hub' else en[k+'.1'];image='https://www.mingeagle.com/'+images[kind]
 if kind=='hub':
  body='<section class="learnHub"><div class="wrap"><div class="learnCards learnHubCards">'+''.join('<article><img src="'+html.escape(img)+'" alt="'+html.escape(en[tk])+'" width="960" height="960" loading="lazy">'+text(tk,'h2')+text(pk)+link('common.17',href,'more')+'</article>' for tk,pk,img,href in [('compare.0','compare.1',images['compare'],paths['compare']),('team.0','team.1',images['team'],paths['team']),('common.5','common.25','assets/guide-set-studio-v3.webp','silent-basketball-guide.html')])+'</div><div class="learnNext">'+text('common.16','h2')+'<div class="actions">'+link('common.6','for-coaches.html')+link('common.10','inquiry.html?type=sample','btn orange')+'</div></div></div></section>'
  schema={'@context':'https://schema.org','@type':'CollectionPage','name':title,'description':desc,'url':url,'inLanguage':'en','mainEntity':{'@type':'ItemList','itemListElement':[{'@type':'ListItem','position':i+1,'url':'https://www.mingeagle.com/'+p} for i,p in enumerate([paths['compare'],paths['team'],'silent-basketball-guide.html'])]}}
 else:
  content=section(kind,2,3)+section(kind,4,5)
  if kind=='compare':content+=comparison_table()+section(kind,19,20)+section(kind,21,22)
  else:content+=table()+section(kind,6,7)+section(kind,8,9)+section(kind,10,11)+section(kind,12,13)
  content+=faq(kind)
  cta=link('common.10','inquiry.html?type=sample','btn orange') if kind=='compare' else link('common.12','custom-logo.html','btn orange')
  aside='<aside class="learnSidebar">'+text('common.16','div','eyebrow')+text('common.1','h2')+cta+link('common.9','products.html')+link('common.11','inquiry.html?type=quote')+link('common.5','silent-basketball-guide.html','more')+'</aside>'
  body='<div class="wrap learnArticleGrid"><article class="learnArticle">'+content+'</article>'+aside+'</div>'+related()
  schema={'@context':'https://schema.org','@graph':[{'@type':'Article','headline':title,'description':desc,'image':[image],'datePublished':'2026-10-10','dateModified':'2026-10-10','author':{'@type':'Organization','name':'MING EAGLE','url':'https://www.mingeagle.com/'},'publisher':{'@type':'Organization','name':'MING EAGLE','url':'https://www.mingeagle.com/'},'mainEntityOfPage':url,'inLanguage':'en'},{'@type':'BreadcrumbList','itemListElement':[{'@type':'ListItem','position':1,'name':'MING EAGLE','item':'https://www.mingeagle.com/'},{'@type':'ListItem','position':2,'name':en['common.0'],'item':'https://www.mingeagle.com/learn.html'},{'@type':'ListItem','position':3,'name':title,'item':url}]}]}
 hero='<header class="learnHero"><div class="wrap '+('learnHeroGrid' if kind!='hub' else '')+'"><div><div class="learnCrumbs"><a href="index.html">MING EAGLE</a><span>/</span>'+link('common.0','learn.html','')+'</div>'+text('common.0' if kind=='hub' else 'common.7' if kind=='compare' else 'common.8','div','eyebrow')+text('common.1' if kind=='hub' else kind+'.0','h1')+text('common.2' if kind=='hub' else kind+'.1','p','learnIntro')+('<div class="learnByline">'+text('common.14','span')+'<span aria-hidden="true"> · </span>'+text('common.15','time')+'</div>' if kind!='hub' else '')+'</div>'+('' if kind=='hub' else '<img src="'+images[kind]+'?v=20261007-1" alt="'+html.escape(master['p1' if kind=='compare' else 'p3']['name'])+'" width="960" height="960" fetchpriority="high">')+'</div></header>'
 head='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+html.escape(title)+' | MING EAGLE</title><meta name="description" content="'+html.escape(desc,quote=True)+'"><meta name="robots" content="index,follow,max-image-preview:large"><link rel="canonical" href="'+url+'"><meta property="og:type" content="'+('website' if kind=='hub' else 'article')+'"><meta property="og:title" content="'+html.escape(title,quote=True)+'"><meta property="og:description" content="'+html.escape(desc,quote=True)+'"><meta property="og:url" content="'+url+'"><meta property="og:image" content="'+image+'"><meta name="twitter:card" content="summary_large_image"><link rel="stylesheet" href="styles.css?v=20261007-6"><link rel="stylesheet" href="learning.css?v='+version+'"><script type="application/ld+json" id="learning-schema">'+json.dumps(schema,ensure_ascii=False).replace('</','<\\/')+'</script></head><body><a class="skipLink" href="#main-content">Skip to content</a>'
 (r/path).write_text(head+header+'<main id="main-content" tabindex="-1" data-learning-page="'+kind+'">'+hero+body+'</main>'+footer)
# Related reading is a distinct, idempotent addition; preserve approved product/model markup.
for name in ['index.html','silent-basketball-guide.html','for-coaches.html','wholesale.html','for-schools.html']:
 p=r/name;s=p.read_text();s=re.sub(r'<!-- MING LEARNING START -->.*?<!-- MING LEARNING END -->','',s,flags=re.S)
 s=s.replace('</main>','<!-- MING LEARNING START -->'+related()+'<!-- MING LEARNING END --></main>',1)
 s=re.sub(r'<link rel="stylesheet" href="learning\.css[^"]*">','',s)
 s=s.replace('</head>',f'<link rel="stylesheet" href="learning.css?v={version}"></head>',1)
 s=re.sub(r'<script src="learning(?:-links)?\.js[^"]*" defer></script>','',s)
 s=s.replace('</body>',f'<script src="learning-links.js?v={version}" defer></script></body>',1)
 p.write_text(s)
p=r/'sitemap.xml';s=p.read_text()
for path in paths.values():
 url='https://www.mingeagle.com/'+path
 if url not in s:s=s.replace('</urlset>','  <url><loc>'+url+'</loc><lastmod>2026-10-10</lastmod></url>\n</urlset>')
p.write_text(s)
js="""(function(root){
'use strict';
const COPY=__COPY__;
function dictionary(lang){return COPY[lang]||COPY.en}
function apply(lang){
 const d=dictionary(lang);document.querySelectorAll('[data-learn]').forEach(el=>{const value=d[el.dataset.learn];if(value!==undefined)el.textContent=value});
 const page=document.querySelector('[data-learning-page]')?.dataset.learningPage;if(!page)return;
 const title=page==='hub'?d['common.24']:d[page+'.0'],desc=page==='hub'?d['common.2']:d[page+'.1'];document.title=title+' | MING EAGLE';
 const description=document.querySelector('meta[name="description"]');if(description)description.content=desc;
 for(const [property,value]of [['og:title',title],['og:description',desc]]){const el=document.querySelector('meta[property="'+property+'"]');if(el)el.content=value}
 const node=document.getElementById('learning-schema');if(node){try{const schema=JSON.parse(node.textContent);if(page==='hub'){schema.name=title;schema.description=desc;schema.inLanguage=COPY[lang]?lang:'en'}else{const a=schema['@graph'].find(x=>x['@type']==='Article');a.headline=title;a.description=desc;a.inLanguage=COPY[lang]?lang:'en';const b=schema['@graph'].find(x=>x['@type']==='BreadcrumbList');b.itemListElement[1].name=d['common.0'];b.itemListElement[2].name=title}node.textContent=JSON.stringify(schema)}catch(e){}}
}
if(typeof module!=='undefined'&&module.exports){module.exports={COPY,dictionary};return}
root.addEventListener('mingeagle:language',e=>apply(e.detail?.lang||'en'));
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>apply(document.documentElement.lang||'en'));else apply(document.documentElement.lang||'en');
})(typeof window==='undefined'?globalThis:window);
""".replace('__COPY__',json.dumps(locales,ensure_ascii=False,separators=(',',':')))
(r/'learning.js').write_text(js)
print('Learning hub, two buying guides, nine languages, metadata and related reading generated.')

used=re.findall(r'data-learn="([^"]+)"',related())
subset={lang:{key:values[key] for key in set(used)} for lang,values in locales.items()}
links_js="""(function(root){'use strict';const COPY=__COPY__;
function apply(lang){const d=COPY[lang]||COPY.en;document.querySelectorAll('[data-learn]').forEach(el=>{if(d[el.dataset.learn]!==undefined)el.textContent=d[el.dataset.learn]})}
if(typeof module!=='undefined'&&module.exports){module.exports={COPY};return}
root.addEventListener('mingeagle:language',e=>apply(e.detail?.lang||'en'));
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>apply(document.documentElement.lang||'en'));else apply(document.documentElement.lang||'en');
})(typeof window==='undefined'?globalThis:window);""".replace('__COPY__',json.dumps(subset,ensure_ascii=False,separators=(',',':'),sort_keys=True))
(r/'learning-links.js').write_text(links_js)
