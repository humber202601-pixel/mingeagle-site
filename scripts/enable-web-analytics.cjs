'use strict';
// Website analytics only. The site tag is a PUBLIC Cloudflare Web Analytics
// identifier, not an API token or secret. This build step is idempotent.
// No form values, CRM IDs, emails, personal identifiers, cookies or custom
// behavioral events are transmitted by MING EAGLE application code.
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'../public');
const token='0847cc9737e246bbb4a7224e27be273d';
const marker='data-cf-beacon';
const tag='<script type="module" defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon=\'{"token":"'+token+'"}\'></script>';
const check=process.argv.includes('--check');
const files=fs.readdirSync(root).filter(name=>/\.html$/i.test(name));
if(files.length<20)throw Error('Unexpectedly small public HTML catalog');
let written=0;
for(const name of files){
  const filename=path.join(root,name),html=fs.readFileSync(filename,'utf8');
  if(!/<\/body>/i.test(html))throw Error('HTML is missing body close: '+name);
  const count=(html.match(/data-cf-beacon/gi)||[]).length;
  if(count>1)throw Error('Duplicate Cloudflare Web Analytics beacons: '+name);
  if(count===1){
    if(!html.includes(token)||!html.includes('static.cloudflareinsights.com/beacon.min.js'))
      throw Error('Existing but unexpected Web Analytics tag: '+name);
    continue;
  }
  if(check)throw Error('Missing Web Analytics beacon in built HTML: '+name);
  fs.writeFileSync(filename,html.replace(/<\/body>/i,tag+'</body>'));
  written++;
}
const policy=fs.readFileSync(path.join(root,'policies.html'),'utf8');
if(!policy.includes('Cloudflare Web Analytics')||!policy.includes('aggregated website traffic and performance'))
  throw Error('Analytics privacy policy disclosure missing');
console.log('Cloudflare Web Analytics '+(check?'verified':'enabled')+' for '+files.length+
  ' HTML pages; '+written+' updated; no business or form payloads changed.');
