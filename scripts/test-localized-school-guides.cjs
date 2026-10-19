const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'me-localized-'));
const pages=['indoor-school-sports-equipment-guide.html','school-sports-equipment-de.html','school-sports-equipment-fr.html','school-sports-equipment-es.html','school-sports-equipment-pt.html'];
try{
 for(const filename of ['sitemap.xml','sitemap-localized.xml','robots.txt',...pages])
  fs.copyFileSync(path.join('public',filename),path.join(dir,filename));
 const run=()=>cp.spawnSync(process.execPath,['scripts/check-localized-school-guides.cjs',dir],{encoding:'utf8'});
 const pass=()=>{const r=run();assert.equal(r.status,0,r.stderr||r.stdout)};
 const fail=(message)=>{const r=run();assert.notEqual(r.status,0,message)};
 pass();
 const german=path.join(dir,'school-sports-equipment-de.html'),g=fs.readFileSync(german,'utf8');
 fs.writeFileSync(german,g.replace('<title>Leise Sportbälle für Schulen | MING EAGLE</title>','<title>Leise Sportbälle für Schulen und Basketball-Akademien | MING EAGLE</title>'));
 fail('Overlong search titles must be rejected');fs.writeFileSync(german,g);
 fs.writeFileSync(german,g.replace('"image":"https://www.mingeagle.com/assets/hero-flocked-silent-basketball-set.webp?v=20261007-1","inLanguage":"de"','"inLanguage":"de"'));
 fail('Article structured data must declare the image shown on the page');fs.writeFileSync(german,g);
 fs.writeFileSync(german,g.replace('alt="Beflocktes Basketball-Set mit Mini-Korb für beaufsichtigte Hallenübungen"','alt=""'));
 fail('Visible product image must have meaningful alternative text');fs.writeFileSync(german,g);
 fs.writeFileSync(german,g.replace('hreflang="fr" href="https://www.mingeagle.com/school-sports-equipment-fr.html"','hreflang="fr" href="https://unrelated.example/school-sports-equipment-fr.html"'));
 fail('Hreflang must be reciprocal and must not point off-domain');fs.writeFileSync(german,g);
 fs.writeFileSync(german,g.replace('<html lang="de">','<html lang="en">'));
 fail('Native document language mismatch must block deploy');fs.writeFileSync(german,g);
 fs.writeFileSync(german,g.replace('href="https://www.mingeagle.com/school-sports-equipment-de.html"','href="https://www.mingeagle.com/indoor-school-sports-equipment-guide.html"'));
 fail('Translated pages must not canonicalize to the English URL');fs.writeFileSync(german,g);
 const fr=path.join(dir,'school-sports-equipment-fr.html'),f=fs.readFileSync(fr,'utf8');
 fs.writeFileSync(fr,f.replace(/<section class="card">[\s\S]*?<\/section>/g,''));
 fail('A thin translated shell must be rejected');fs.writeFileSync(fr,f);
 const sitemap=path.join(dir,'sitemap-localized.xml'),xml=fs.readFileSync(sitemap,'utf8');
 fs.writeFileSync(sitemap,xml.replace('<loc>https://www.mingeagle.com/school-sports-equipment-pt.html</loc>','<loc>https://www.mingeagle.com/other-page.html</loc>'));
 fail('Not all language pages included in sitemap');fs.writeFileSync(sitemap,xml);
 pass();
 console.log('PASS: reciprocal hreflang, source-language mismatch, bad canonical, thin content, and omitted multilingual sitemap entry all fail closed.');
}finally{fs.rmSync(dir,{recursive:true,force:true})}
