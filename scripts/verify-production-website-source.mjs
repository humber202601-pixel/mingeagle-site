// Public read-only audit of the live WWW storefront against GitHub main/public.
// Detect a stale external ZIP deployment before claiming a frontend fix is live.
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
const base='https://www.mingeagle.com';
const files=['index.html','retail-cart.html','retail-cart.js','retail-buy.js'];
let mismatches=0;
for(const file of files){
 try{
  const r=await fetch(base+'/'+file+'?audit='+Date.now(),{
   headers:{'cache-control':'no-store','accept':'text/html,application/javascript,*/*'},
   signal:AbortSignal.timeout(15000),redirect:'error'});
  const remote=Buffer.from(await r.arrayBuffer());
  const local=readFileSync('website-source/public/'+file);
  const hash=x=>createHash('sha256').update(x).digest('hex').slice(0,16);
  const same=r.ok&&remote.equals(local);
  console.log((same?'MATCH':'MISMATCH')+' '+file+' live_http='+r.status+
   ' local_sha256='+hash(local)+' remote_sha256='+hash(remote)+
   ' remote_bytes='+remote.length+' local_bytes='+local.length);
  if(!same)mismatches++;
  if(file==='index.html'||file==='retail-cart.html'){
   const str=remote.toString('utf8');
   console.log('LIVE_MARKER '+file+' retail-cart-js='+String(str.match(/retail-cart\.js\?v=([\w-]+)/)?.[1]||'none')+
    ' website_homefix2='+str.includes('20261020-homefix2'));
  }
 }catch(e){mismatches++;console.log('MISMATCH '+file+' fetch_error='+(e instanceof Error?e.name:'unknown'))}
}
console.log('READ ONLY: no checkout or customer records were created.');
if(mismatches){console.error('Live WWW file mismatch count='+mismatches+'. Updating GitHub source alone may not deploy current public files.');process.exitCode=1;}
else console.log('PASS: storefront source files are identical to main/public.');
