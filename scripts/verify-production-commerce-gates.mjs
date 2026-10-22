// Public production cart → gateway preflight, WITHOUT creating any order or payment.
const origin='https://app.mingeagle.com',from='https://www.mingeagle.com';
const readiness=await fetch(origin+'/api/retail/checkout-status',{headers:{'cache-control':'no-store'},signal:AbortSignal.timeout(15000)});
const r=await readiness.json();
console.log('LIVE_RETAIL_GATE http='+readiness.status+
 ' ready='+String(r.retailCheckoutReady)+' maxUnits='+String(r.maxDirectCheckoutUnits)+
 ' enabledStates='+JSON.stringify(r.supportedStates||[])+
 ' eligibleSkus='+JSON.stringify(r.eligibleSkus||[])+
 ' cors='+String(readiness.headers.get('access-control-allow-origin')||'none'));
const options=await fetch(origin+'/api/shipping/cart',{method:'OPTIONS',headers:{
 'origin':from,'access-control-request-method':'POST','access-control-request-headers':'content-type'
},signal:AbortSignal.timeout(15000)});
console.log('LIVE_CART_PREFLIGHT http='+options.status+
 ' cors='+String(options.headers.get('access-control-allow-origin')||'none')+
 ' methods='+String(options.headers.get('access-control-allow-methods')||'none')+
 ' allowedHeaders='+String(options.headers.get('access-control-allow-headers')||'none'));
const carts=[
 {name:'one_set',lines:[{sku:'P1-S7',quantity:1}],expected:28.9},
 {name:'two_same',lines:[{sku:'P1-S7',quantity:2}],expected:57.8},
 {name:'two_mixed',lines:[{sku:'P1-S3',quantity:1},{sku:'P1-S7',quantity:1}],expected:50.3},
 {name:'nine_same',lines:[{sku:'P1-S7',quantity:9}],expected:260.1},
 {name:'nine_mixed',lines:[{sku:'P1-S3',quantity:4},{sku:'P1-S7',quantity:5}],expected:230.1}
];
let failures=0;
for(const c of carts){
 const res=await fetch(origin+'/api/shipping/cart',{method:'POST',headers:{
  'origin':from,'content-type':'application/json'
 },body:JSON.stringify({country:'US',method:'air',lines:c.lines}),signal:AbortSignal.timeout(15000)});
 const data=await res.json();
 const cors=res.headers.get('access-control-allow-origin');
 const ok=res.status===200&&data.ok===true&&data.ddpConfirmed===true&&
  Math.round(Number(data.totalBeforeTaxesUSD)*100)===Math.round(c.expected*100)&&cors==='*';
 console.log((ok?'PASS':'BLOCK')+' LIVE_CART '+c.name+' http='+res.status+
 ' ddp='+data.ddpConfirmed+' total='+data.totalBeforeTaxesUSD+' cors='+String(cors||'none'));
 if(!ok)failures++;
}
// Do not confuse nine individually shipped retail units with the 10+ wholesale RFQ.
const quantityBoundary=[
 {name:'ten_air_must_reject',method:'air',accepted:false},
 {name:'ten_sea_accepted_as_rfq_only',method:'sea',accepted:true}
];
for(const scenario of quantityBoundary){
 try{
  const res=await fetch(origin+'/api/shipping/cart',{method:'POST',headers:{
   origin:from,'content-type':'application/json'
  },body:JSON.stringify({country:'US',method:scenario.method,
    ...(scenario.accepted?{seaFreightAccepted:true}:{}),
    lines:[{sku:'P1-S7',quantity:10}]}),signal:AbortSignal.timeout(15000)});
  const body=await res.json();
  const valid=scenario.accepted?
    res.status===200&&body.ok===true&&body.wholesale===true&&body.quoteRequired===true&&
      body.paymentEnabled===false&&body.totalBeforeTaxesUSD==null&&body.ddpConfirmed===false:
    res.status===409&&body.ok===false&&body.wholesale===true&&body.shippingConsentRequired===true;
  console.log((valid?'PASS':'BLOCK')+' LIVE_CART_BOUNDARY '+scenario.name+' http='+res.status+
   ' wholesale='+String(body.wholesale)+' quoteRequired='+String(body.quoteRequired)+
   ' paymentEnabled='+String(body.paymentEnabled));
  if(!valid)failures++;
 }catch(e){
  console.error('BLOCK LIVE_CART_BOUNDARY '+scenario.name+' '+(e instanceof Error?e.name:'unknown'));failures++;
 }
}
if(readiness.status!==200||r.ok!==true||r.retailCheckoutReady!==true)failures++;
if(!Number.isInteger(r.maxDirectCheckoutUnits)||r.maxDirectCheckoutUnits<2||
 !Array.isArray(r.eligibleSkus)||!r.eligibleSkus.includes('P1-S3')||!r.eligibleSkus.includes('P1-S7'))failures++;
if(options.status!==204||options.headers.get('access-control-allow-origin')!=='*')failures++;
console.log('READ ONLY: checked public readiness and non-mutating shipping pricing; no customer, quote, Stripe session or charge created.');
if(failures){console.error('BLOCK production retail cart readiness/preflight: '+failures+' checks failed');process.exitCode=1;}
else console.log('PASS production 1-unit, 2-unit, 9-unit retail, 10-unit wholesale boundary, retail activation and WWW → app CORS.');
