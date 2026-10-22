'use strict';
// Post-deployment GET-only check. No cookies, forms, external submissions or writes.
const assert=require('node:assert/strict');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const base='https://www.mingeagle.com/';
const checks=[
 {path:'llms.txt',type:'text',required:[
  '](https://www.mingeagle.com/editorial-review-facts.txt)',
  '](https://www.mingeagle.com/indoor-ball-sample-comparison-protocol.txt)',
  '](https://www.mingeagle.com/indoor-ball-trial-blank.csv)',
  'Do not infer that any reviewer has tested or recommended MING EAGLE products.'
 ]},
 {path:'editorial-review-facts.txt',type:'text',required:[
  'MING EAGLE | EDITORIAL PRODUCT FACTS',
  'Flocked Silent Basketball Set',
  'Fabric-Cover Silent Basketball Set',
  'Weighted Flocked Silent Basketball',
  'Flocked Silent Soccer Ball',
  'not an independent endorsement'
 ]},
 {path:'indoor-ball-sample-comparison-protocol.txt',type:'text',required:[
  'CONTROLLED INDOOR BALL SAMPLE COMPARISON',
  'does not contain product test results',
  'NOT TESTS OF MING EAGLE PRODUCTS',
  'https://www.cdc.gov/niosh/topics/noise/app.html'
 ]},
 {path:'indoor-ball-trial-blank.csv',type:'csv',required:[
  '"trial_id","date_utc","sample_label"',
  '"observed_sound_value_if_valid"',
  '"limitations_and_disclosure"'
 ]}
];
async function fetchStable(path){
 let last;
 for(let attempt=1;attempt<=5;attempt++){
  try{
   const res=await fetch(base+path,{
    method:'GET',redirect:'manual',
    headers:{'user-agent':'MING-EAGLE-post-deploy-asset-check/1.0','cache-control':'no-cache'},
    signal:AbortSignal.timeout(12000)
   });
   if(res.status!==200)throw Error('HTTP '+res.status+(res.headers.get('location')?' Location='+res.headers.get('location'):''));
   const body=await res.text();
   if(!body.trim())throw Error('empty response');
   return {body,contentType:res.headers.get('content-type')||'',status:res.status};
  }catch(e){last=e;if(attempt<5)await sleep(attempt*2000);}
 }
 throw last;
}
(async()=>{
 const report=[];
 for(const item of checks){
  const result=await fetchStable(item.path);
  for(const needle of item.required)assert(result.body.includes(needle),item.path+' missing expected content: '+needle);
  if(item.type==='csv'){
   const rows=result.body.replace(/\r/g,'').trimEnd().split('\n');
   assert(rows.length>=7,item.path+' should retain header plus six blank observation rows');
   const count=rows[0].split(',').length;
   assert.equal(count,23,'blank CSV should keep the reviewed 23-column structure');
   for(const row of rows.slice(1)){
    const cells=row.split(',');
    assert.equal(cells.length,count,'CSV row has incorrect number of columns');
    assert(cells.every(cell=>cell==='""'),'public log must not prefill reviewer results or personal data');
   }
  }
  report.push({url:base+item.path,status:result.status,contentType:result.contentType,bytes:Buffer.byteLength(result.body)});
 }
 console.log('PASS: live AI directory links to the editorial fact sheet, controlled comparison protocol and genuinely blank CSV; all four documents are served over HTTP 200.');
 console.log(JSON.stringify(report,null,2));
})().catch(error=>{console.error('FAIL: live editorial asset verification:',error);process.exitCode=1;});
