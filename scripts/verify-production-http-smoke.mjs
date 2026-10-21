// Internet-origin read-only production smoke test, designed for GitHub Actions.
// Do not send admin credentials, create orders, initiate Stripe checkout, or log response bodies.
const probes=[
 {name:'Public B2B storefront',url:'https://www.mingeagle.com/',kind:'site'},
 {name:'Admin site public shell',url:'https://app.mingeagle.com/',kind:'site'},
 {name:'Stripe public configuration status',url:'https://app.mingeagle.com/api/payments/status',kind:'publicJson'},
 {name:'Admin recovery readiness denies anonymous access',url:'https://app.mingeagle.com/api/admin/unpaid-wholesale-requote-readiness?orderReference=ME-PROBE-NOT-REAL',kind:'protected'},
 {name:'Admin catalog reconciliation denies anonymous access',url:'https://app.mingeagle.com/api/admin/catalog-reconciliation',kind:'protected'}
];
let errors=0;
for(const p of probes){
 try{
  const response=await fetch(p.url,{method:'GET',headers:{accept:p.kind==='site'?'text/html':'application/json',
    'cache-control':'no-store','user-agent':'MingEagle-ReadOnly-Production-Acceptance/1.0'},
    redirect:p.kind==='site'?'follow':'manual',signal:AbortSignal.timeout(12000)});
  const type=response.headers.get('content-type')||'';
  let pass=false;
  if(p.kind==='site')pass=response.ok&&type.includes('text/html')&&new URL(response.url).protocol==='https:';
  else if(p.kind==='publicJson'){
   if(response.status===200&&type.includes('json')){
    const body=await response.json().catch(()=>null);
    pass=body?.ok===true&&body.stripe&&typeof body.stripe==='object';
   }
  }else pass=response.status===401||response.status===403;
  console.log((pass?'PASS':'FAIL')+' '+p.name+
   ' | HTTP '+response.status+' | content-type '+type.slice(0,60)+
   ' | host '+new URL(response.url).host);
  if(!pass)errors++;
 }catch(error){
  console.log('FAIL '+p.name+' | network '+(error instanceof Error?error.name:'unknown'));
  errors++;
 }
}
console.log('Only unauthenticated GET requests were issued. No real order, payment, quote or customer data was written.');
if(errors){console.error('FAIL: '+errors+' production HTTP probe(s) did not pass. Public reachability is not equivalent to payment E2E.');process.exitCode=1;}
else console.log('PASS: basic public HTTP and anonymous admin access guards; buyer payment E2E remains unverified.');
