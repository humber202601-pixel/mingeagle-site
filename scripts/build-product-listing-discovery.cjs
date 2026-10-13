// Source-aligned, non-promotional product collection navigation.
// This is a first-party ItemList, not a Google Merchant feed, a rating, or a
// guarantee of search carousel / AI recommendations.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||'public'),base='https://www.mingeagle.com/';
const file=path.join(root,'products.html'),master=JSON.parse(fs.readFileSync(path.join(root,'product-master.json'),'utf8'));
const sitemap=fs.readFileSync(path.join(root,'sitemap.xml'),'utf8');
const models=[
 ['p1','silent-basketball.html'],
 ['p2','fabric-silent-basketball.html'],
 ['p3','weighted-flocked-basketball.html'],
 ['p4','silent-soccer.html']
];
assert.deepEqual(Object.keys(master).sort(),models.map(v=>v[0]).sort(),'Catalog entry count differs from product master');
const items=models.map(([id,page],i)=>{
 const product=master[id],url=base+page;
 assert(typeof product.name==='string'&&product.name.length>10);
 assert(/^assets\/[a-z0-9-]+\.webp$/.test(product.hero));
 assert(fs.existsSync(path.join(root,product.hero)));
 assert(fs.existsSync(path.join(root,page)),'Missing catalog destination '+page);
 assert(sitemap.includes('<loc>'+url+'</loc>'),'Product destination missing from sitemap '+url);
 return {'@type':'ListItem',position:i+1,item:{
  '@type':'Product',name:product.name,url,image:base+product.hero,
  brand:{'@type':'Brand',name:'MING EAGLE'}
 }};
});
let html=fs.readFileSync(file,'utf8');
const begin='<!-- MING EAGLE PRODUCT COLLECTION SCHEMA START -->';
const end='<!-- MING EAGLE PRODUCT COLLECTION SCHEMA END -->';
if(html.includes(begin)!==html.includes(end))throw Error('Unbalanced ItemList marker');
html=html.replace(/<!-- MING EAGLE PRODUCT COLLECTION SCHEMA START -->[\s\S]*?<!-- MING EAGLE PRODUCT COLLECTION SCHEMA END -->\s*/g,'');
const list={
 '@context':'https://schema.org','@type':'ItemList',
 '@id':base+'products.html#catalog',url:base+'products.html',
 name:'MING EAGLE indoor sports ball product collection',
 numberOfItems:items.length,
 itemListOrder:'https://schema.org/ItemListOrderAscending',
 itemListElement:items
};
const injected=begin+'<script type="application/ld+json">'+JSON.stringify(list)+'</script>'+end;
assert(html.includes('</head>'),'Missing HTML head close');
html=html.replace('</head>',injected+'</head>');
const sectionStart='<section class="section comparisonSection" id="compare">';
assert(html.includes(sectionStart),'Visible product comparison table missing');
const i=html.indexOf(sectionStart),j=html.indexOf('</section>',i);
assert(j>i,'Visible product comparison section incomplete');
const section=html.slice(i,j);
const match=section.match(/(<tbody>)([\s\S]*?)(<\/tbody>)/i);
if(!match)throw Error('Comparison tbody not found');
const rows=[...match[2].matchAll(/<tr>([\s\S]*?)<\/tr>/g)];
assert.equal(rows.length,items.length,'Comparison table must contain one row per published product');
let previous=match[2];
for(let n=0;n<rows.length;n++){
 const name=master[models[n][0]].name,page=models[n][1];
 const row=rows[n][0];
 assert(/<td>[^<]*(?:<a[^>]*>[^<]*<\/a>)?<\/td>/.test(row),'Unexpected product comparison first cell');
 const updated=row.replace(/<td>[^<]*(?:<a[^>]*>[^<]*<\/a>)?<\/td>/,
  '<td><a href="'+page+'">'+name+'</a></td>');
 assert(updated!==row||row.includes('href="'+page+'"'),'Wrong product identity or link '+page);
 previous=previous.replace(row,updated);
}
const replacement=section.replace(match[0],match[1]+previous+match[3]);
html=html.slice(0,i)+replacement+html.slice(j);
fs.writeFileSync(file,html);
console.log('PASS: '+items.length+' visible SKU comparison links and public ItemList generated from first-party master.');
