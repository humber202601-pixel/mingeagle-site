// Internet-origin read-only production smoke test, designed for GitHub Actions.
// Do not send admin credentials, create orders, initiate Stripe checkout, or log response bodies.
const impossibleToken='0'.repeat(64); // syntactically valid but never issued to a buyer
const probes=[
 {name:'Public B2B storefront',url:'https://www.mingeagle.com/',kind:'site'},
 {name:'Admin site public shell',url:'https://app.mingeagle.com/',kind:'site'},
 {name:'Stripe public configuration status',url:'https://app.mingeagle.com/api/payments/status',kind:'publicJson'},
 {name:'Admin recovery readiness denies anonymous access',url:'https://app.mingeagle.com/api/admin/unpaid-wholesale-requote-readiness?orderReference=ME-PROBE-NOT-REAL',kind:'protected'},
 {name:'Admin catalog reconciliation denies anonymous access',url:'https://app.mingeagle.com/api/admin/catalog-reconciliation',kind:'protected'},
 // Exercise real production D1 quote lookup and Checkout's authenticated
 // order-lookup prerequisite with a guaranteed nonexistent buyer token.
 // HTTP 404 means the application reached its no-order branch; no Stripe POST.
 {name:'Unknown buyer quote lookup rejects missing order',url:'https://app.mingeagle.com/api/quote/'+impossibleToken,kind:'missingQuote'},
 {name:'Stripe Checkout rejects nonexistent accepted order before provider call',url:'https://app.mingeagle.com/api/payments/stripe/create',kind:'missingCheckout',method:'POST'}
];
let errors=0;
for(const p of probes){
 try{
  const isPost=p.kind==='missingCheckout';
  const response=await fetch(p.url,{method:p.method||'GET',headers:{accept:p.kind==='site'?'text/html':'application/json',
    ...(isPost?{'content-type':'application/json','origin':'https://app.mingeagle.com'}:{}),
    'cache-control':'no-store','user-agent':'MingEagle-ReadOnly-Production-Acceptance/1.0'},
    ...(isPost?{body:JSON.stringify({token:impossibleToken})}:{}),
    redirect:p.kind==='site'?'follow':'manual',signal:AbortSignal.timeout(12000)});
  const type=response.headers.get('content-type')||'';
  let pass=false;
  if(p.kind==='site')pass=response.ok&&type.includes('text/html')&&new URL(response.url).protocol==='https:';
  else if(p.kind==='publicJson'){
   if(response.status===200&&type.includes('json')){
    const body=await response.json().catch(()=>null);
    pass=body?.ok===true&&body.stripe&&typeof body.stripe==='object';
   }
  }else if(p.kind==='missingQuote'||p.kind==='missingCheckout'){
   if(response.status===404&&type.includes('json')){
    const result=await response.json().catch(()=>null);
    pass=result?.ok===false&&typeof result.error==='string';
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
// Read-only business-state probes: only the shipping price calculator uses
// POST; it is stateless and does not create customer/order/payment records.
try{
 const [readyResponse,priceResponse]=await Promise.all([
  fetch('https://app.mingeagle.com/api/retail/checkout-status',{
   headers:{accept:'application/json','cache-control':'no-store'},signal:AbortSignal.timeout(12000)}),
  fetch('https://app.mingeagle.com/api/shipping/cart',{
   method:'POST',headers:{'content-type':'application/json','cache-control':'no-store'},
   body:JSON.stringify({country:'US',method:'air',lines:[{sku:'P1-S3',quantity:1},{sku:'P1-S7',quantity:1}]}),
   signal:AbortSignal.timeout(12000)
  })
 ]);
 const ready=await readyResponse.json().catch(()=>null);
 const price=await priceResponse.json().catch(()=>null);
 const readyValid=readyResponse.status===200&&ready?.ok===true&&Number.isInteger(ready.maxDirectCheckoutUnits)&&
  Array.isArray(ready.supportedStates)&&Array.isArray(ready.eligibleSkus);
 const goods=Math.round(Number(price?.productsUSD)*100),freight=Math.round(Number(price?.shippingUSD)*100);
 const total=Math.round(Number(price?.totalBeforeTaxesUSD)*100);
 const priceValid=priceResponse.status===200&&price?.ok===true&&
  price.quantity===2&&price.parcelCount===2&&price.ddpConfirmed===true&&
  goods===2480&&freight===2550&&total===5030&&total===goods+freight;
 console.log((readyValid?'PASS':'FAIL')+' Production retail eligibility | HTTP '+readyResponse.status+
  ' | enabled '+Boolean(ready?.retailCheckoutReady)+' | maxUnits '+String(ready?.maxDirectCheckoutUnits)+
  ' | states '+JSON.stringify(ready?.supportedStates||[])+' | SKUs '+JSON.stringify(ready?.eligibleSkus||[]));
 console.log((priceValid?'PASS':'FAIL')+' Production two-SKU, two-unit DDP quote | HTTP '+priceResponse.status+
  ' | goods '+String(price?.productsUSD)+' | freight '+String(price?.shippingUSD)+
  ' | total '+String(price?.totalBeforeTaxesUSD));
 if(!readyValid||!priceValid)errors++;
 if(readyValid&&!ready.retailCheckoutReady)console.log('BLOCK: production retail checkout not ready despite stateless shipping quote.');
 if(readyValid&&ready.supportedStates.length<50)console.log('SCOPE: retail checkout restricts states, do not claim nationwide retail activation.');
}catch(error){
 console.log('FAIL Production retail probe | '+(error instanceof Error?error.name:'unknown'));
 errors++;
}

console.log('Only anonymous GETs, a synthetic-token checkout POST (404 before Stripe) and a stateless shipping-price POST were issued. No real order, payment, quote or customer data was written.');
if(errors){console.error('FAIL: '+errors+' production HTTP probe(s) did not pass. Public reachability is not equivalent to payment E2E.');process.exitCode=1;}
else console.log('PASS: public HTTP, production quote/Checkout no-order paths and anonymous admin guards; buyer payment E2E remains unverified.');
