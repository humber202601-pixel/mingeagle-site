// Verify that the published, first-party wholesale supplier introduction
// can actually be downloaded after the successful production-site deployment.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setTimeout as sleep} from 'node:timers/promises';
import {createHash} from 'node:crypto';
const expected=readFileSync('public/wholesale-supplier-introduction.txt');
const url='https://www.mingeagle.com/wholesale-supplier-introduction.txt';
const hash=b=>createHash('sha256').update(b).digest('hex');
assert(expected.length>2000 && expected.toString('utf8').includes('MING EAGLE COMMERCE LLC'));
function matches(body){return expected.equals(Buffer.isBuffer(body)?body:Buffer.from(body));}
if(process.argv.includes('--self-test')){
 assert(matches(expected));
 assert(!matches(Buffer.from('<!doctype html><title>Fallback</title>')));
 assert(!matches(Buffer.concat([expected,Buffer.from('changed')])));
 for(const page of ['wholesale.html','wholesale-product-catalog.html']){
  assert(readFileSync('public/'+page,'utf8').includes('href="wholesale-supplier-introduction.txt" download'),
   'Supplier introduction must remain linked from public buyer page '+page);
 }
 console.log('PASS: supplier intro live download test uses source byte equality, linked buyer paths and no credentials.');
 process.exit(0);
}
const sha=process.env.DEPLOYED_SHA||'unknown';
let detail='not fetched';
for(let attempt=1;attempt<=9;attempt++){
 try{
  const res=await fetch(url,{method:'GET',redirect:'error',headers:{
   accept:'text/plain','cache-control':'no-cache','user-agent':'MINGEAGLE-PUBLIC-SUPPLIER-BRIEF-ACCEPTANCE/1.0'
  },signal:AbortSignal.timeout(15000)});
  const type=res.headers.get('content-type')||'';
  const body=Buffer.from(await res.arrayBuffer());
  if(res.status===200&&(type.includes('text/plain')||type.includes('octet-stream'))&&matches(body)){
   console.log('PASS: live supplier introduction HTTP 200, exact source bytes, sha256='+hash(body)+', deployed_sha='+sha.slice(0,12));
   process.exit(0);
  }
  detail='HTTP '+res.status+'; content-type='+type+'; bytes='+body.length+'; match='+matches(body);
 }catch(e){detail=e instanceof Error?e.name+': '+e.message:'Unknown fetch error';}
 console.log('Supplier introduction attempt '+attempt+'/9: '+detail);
 if(attempt<9)await sleep(5000);
}
console.error('FAIL: the actual public supplier introduction was not verified. Last: '+detail);
process.exit(1);
