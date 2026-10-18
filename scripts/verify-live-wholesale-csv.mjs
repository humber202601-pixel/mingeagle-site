// Read-only live acceptance test: check the actual public CSV download after
// GitHub Pages deployment rather than equating merged code with a working URL.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setTimeout as sleep} from 'node:timers/promises';
import {createHash} from 'node:crypto';
const expected=readFileSync('public/wholesale-product-facts.csv');
const url='https://www.mingeagle.com/wholesale-product-facts.csv';
const hash=b=>createHash('sha256').update(b).digest('hex');
assert(expected.length>500&&expected.toString('utf8').includes('product_family_id'));
assert.equal(expected.toString('utf8').split('\r\n').filter(Boolean).length,5);
function matchesPublicCsv(body){
 const buffer=Buffer.isBuffer(body)?body:Buffer.from(body);
 return expected.equals(buffer);
}
if(process.argv.includes('--self-test')){
 assert(matchesPublicCsv(expected));
 assert(!matchesPublicCsv(Buffer.from('This is a 200 HTML fallback, not the public CSV')));
 assert(!matchesPublicCsv(Buffer.concat([expected,Buffer.from('tampered')])));
 for(const p of ['wholesale-product-catalog.html','for-schools.html','procurement.html','wholesale.html'])
  assert(readFileSync('public/'+p,'utf8').includes('href="wholesale-product-facts.csv"'));
 console.log('PASS: post-deployment CSV verification checks exact bytes, rejects fallbacks, covers four public buyer links, and uses no credentials.');
 process.exit(0);
}
const revision=process.env.DEPLOYED_SHA||'unknown';
let last='HTTP response not yet verified';
for(let n=1;n<=9;n++){
 try{
  const res=await fetch(url,{
   method:'GET',redirect:'error',
   headers:{accept:'text/csv','cache-control':'no-cache','user-agent':'MINGEAGLE-PUBLIC-CSV-ACCEPTANCE/1.0'},
   signal:AbortSignal.timeout(15000),
  });
  const type=res.headers.get('content-type')||'';
  const body=Buffer.from(await res.arrayBuffer());
  if(res.status===200 && (type.includes('csv')||type.includes('octet-stream')||type.includes('text/plain')||type.includes('vnd.ms-excel')) && matchesPublicCsv(body)){
   console.log('PASS: public website CSV is HTTP 200 with matching source bytes; sha256='+hash(body)+'; deployed_sha='+revision.slice(0,12));
   process.exit(0);
  }
  last='HTTP '+res.status+'; content-type='+type+'; bytes='+body.length+'; match='+matchesPublicCsv(body);
 }catch(e){last=e instanceof Error?e.name+': '+e.message:'Fetch failure';}
 console.log('Attempt '+n+'/9 not yet verified: '+last);
 if(n<9)await sleep(5000);
}
console.error('FAIL: cannot verify that the live public CSV equals the approved first-party supplier data. Last: '+last);
process.exit(1);
