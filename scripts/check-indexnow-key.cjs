// Assert the deployed root key file matches the IndexNow key registered in GSC Wizard.
// A successful submission is NOT proof that Bing indexed or cited the page.
const fs=require('node:fs'),assert=require('node:assert/strict');
const path=require('node:path');
const root=path.resolve(process.argv[2]||'public');
const key='0af31dfcb7167117e06b90fde1108066';
assert(/^[a-zA-Z0-9-]{8,128}$/.test(key));
const p=path.join(root,key+'.txt');
assert(fs.existsSync(p),'IndexNow key ownership file missing');
assert.equal(fs.readFileSync(p,'utf8').trim(),key,'IndexNow key content mismatch');
assert.equal(fs.readFileSync(p,'utf8'),key,'IndexNow key file must contain only exact key');
const robots=fs.readFileSync(path.join(root,'robots.txt'),'utf8');
assert.match(robots,/Sitemap:\s+https:\/\/www\.mingeagle\.com\/sitemap\.xml/);
const sitemap=fs.readFileSync(path.join(root,'sitemap.xml'),'utf8');
for(const filename of ['quiet-indoor-sports-for-kids.html','indoor-school-sports-equipment-guide.html']){
 assert(sitemap.includes('<loc>https://www.mingeagle.com/'+filename+'</loc>'));
 assert(fs.existsSync(path.join(root,filename)),'IndexNow target not in deployed public files: '+filename);
}
console.log('PASS: IndexNow domain proof file exact, root-accessible artifact and 2 published content targets. Search engine acceptance requires live proof.');
