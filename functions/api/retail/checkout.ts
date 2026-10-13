import {onRequestPost as calculateCart} from '../shipping/cart';
import {getAirwallexAccessToken,airwallexApiBase,airwallexSdkEnv,type AirwallexEnv} from '../../_shared/airwallex';
import {retailCheckoutReady,retailCors,originAllowed,retailTaxCents,validateRetailTurnstile} from '../../_shared/retail-checkout';
type Env=AirwallexEnv&{MINGEAGLE_DB:D1Database;RETAIL_DIRECT_CHECKOUT_ENABLED?:string;
 RETAIL_FULFILLMENT_APPROVED?:string;RETAIL_TAX_COMPLIANCE_APPROVED?:string;
 RETAIL_US_TAX_RULES_JSON?:string;TURNSTILE_SECRET_KEY?:string};
type Line={sku:string;quantity:number};
type Customer={name:string;email:string;address1:string;address2?:string;city:string;
 region:string;postalCode:string;phone?:string};
type Input={requestId:string;lines:Line[];shippingCountry:string;shippingMethod:string;
 customer:Customer;acceptShippingTerms:boolean;acceptTaxes:boolean;turnstileToken:string};
type Attempt={fingerprint:string;state:string;order_id:string;order_reference:string;provider_request_id:string};
const answer=(origin:string|null,body:object,status=200)=>Response.json(body,{status,headers:retailCors(origin)});
const plain=(v:unknown,max=160)=>typeof v==='string'?v.trim().slice(0,max):'';
function validCustomer(v:Customer){
 return !!v&&/^[^\x00-\x1F<>]{2,120}$/.test(v.name)&&
 /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)&&v.email.length<=254&&
 /^[^\x00-\x1F<>]{5,160}$/.test(v.address1)&&
 (v.address2===undefined||/^[^\x00-\x1F<>]{0,160}$/.test(v.address2))&&
 /^[^\x00-\x1F<>]{2,120}$/.test(v.city)&&
 /^[A-Z]{2}$/.test(v.region)&&/^\d{5}(?:-\d{4})?$/.test(v.postalCode)&&
 (v.phone===undefined||/^[0-9+() .-]{0,32}$/.test(v.phone));
}
async function sha(value:string){
 const data=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
 return [...new Uint8Array(data)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
const idPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const onRequestOptions:PagesFunction<Env>=async({request})=>
 originAllowed(request.headers.get('origin'))?
 new Response(null,{status:204,headers:retailCors(request.headers.get('origin'))}):
 new Response(null,{status:403,headers:{'cache-control':'no-store'}});
export const onRequestPost:PagesFunction<Env>=async({request,env})=>{
 const origin=request.headers.get('origin');
 if(!originAllowed(origin))return answer(origin,{ok:false,error:'Unauthorized checkout origin'},403);
 if(!retailCheckoutReady(env)||!env.MINGEAGLE_DB)
  return answer(origin,{ok:false,error:'Secure retail payment is not yet activated. No charge has been made.'},503);
 let v:Input;
 try{v=await request.json() as Input}catch{return answer(origin,{ok:false,error:'Invalid order request'},400)}
 if(!v||!idPattern.test(String(v.requestId||''))||v.shippingCountry!=='US'||
  v.shippingMethod!=='air'||!v.acceptShippingTerms||!v.acceptTaxes||
  !Array.isArray(v.lines)||v.lines.length<1||v.lines.length>9||
  !validCustomer(v.customer))
  return answer(origin,{ok:false,error:'Valid US delivery details and consent are required'},400);
 const qty=v.lines.reduce((sum,l)=>sum+(Number.isSafeInteger(l?.quantity)?l.quantity:10000),0);
 const seen=new Set<string>();
 if(qty<1||qty>9||v.lines.some(l=>!/^P(?:1-S[357]|2-S[357]|3-S[3467]|4-S5)$/.test(l.sku)||
    !Number.isSafeInteger(l.quantity)||l.quantity<1||seen.has(l.sku)||(seen.add(l.sku),false)))
  return answer(origin,{ok:false,error:'Retail checkout only supports 1–9 valid units'},400);
 if(!await validateRetailTurnstile(String(env.TURNSTILE_SECRET_KEY||''),String(v.turnstileToken||''),
  String(request.headers.get('cf-connecting-ip')||'')))
  return answer(origin,{ok:false,error:'Security verification failed. Please refresh and retry.'},403);
 const db=env.MINGEAGLE_DB;
 const lines=v.lines.slice().sort((a,b)=>a.sku.localeCompare(b.sku));
 const customer={name:plain(v.customer.name,120),email:plain(v.customer.email,254).toLowerCase(),
  address1:plain(v.customer.address1),address2:plain(v.customer.address2),city:plain(v.customer.city,120),
  region:v.customer.region,postalCode:v.customer.postalCode,phone:plain(v.customer.phone,32)};
 const fingerprint=await sha(JSON.stringify({lines,customer,country:'US',method:'air',terms:true}));
 let exists=await db.prepare('SELECT fingerprint,state,order_id,order_reference,provider_request_id FROM retail_checkout_requests WHERE request_id=?')
  .bind(v.requestId).first<Attempt>();
 if(exists&&exists.fingerprint!==fingerprint)
  return answer(origin,{ok:false,error:'A checkout request ID cannot be reused for different order details'},409);
 // Verify each SKU is actively offered in CRM and inventory is approved before
 // any new charge. Inventory has no quantity ledger, so fulfillment approval is
 // a separate mandatory merchant gate.
 for(const l of lines){
  const available=await db.prepare("SELECT COUNT(*) AS n FROM product_variants WHERE variant_sku=? AND active=1 AND inventory_status='AVAILABLE'")
   .bind(l.sku).first<{n:number}>();
  if(!available||Number(available.n)<1)
   return answer(origin,{ok:false,error:'A requested item is not confirmed available for direct payment'},409);
 }
 const calcResponse=await calculateCart({request:new Request('https://app.mingeagle.com/api/shipping/cart',{
  method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({lines,country:'US',method:'air'})}),env} as Parameters<typeof calculateCart>[0]);
 const calc=await calcResponse.json() as Record<string,any>;
 if(!calcResponse.ok||!calc.ok||calc.mode==='WHOLESALE_RFQ'||calc.quantity!==qty||
  calc.country!=='US'||calc.method!=='air'||!Array.isArray(calc.lines)||
  calc.lines.length!==lines.length||!Number.isFinite(calc.productsUSD)||!Number.isFinite(calc.shippingUSD))
  return answer(origin,{ok:false,error:'Verified shipping calculation unavailable'},503);
 for(let i=0;i<lines.length;i++){
  const match=calc.lines.find((j:{sku:string;quantity:number})=>j.sku===lines[i].sku);
  if(!match||match.quantity!==lines[i].quantity)return answer(origin,{ok:false,error:'Cart changed during payment'},409);
 }
 const goodsCents=Math.round(calc.productsUSD*100),shippingCents=Math.round(calc.shippingUSD*100);
 if(goodsCents<=0||shippingCents<0||!Number.isSafeInteger(goodsCents)||!Number.isSafeInteger(shippingCents))
  return answer(origin,{ok:false,error:'Invalid server-calculated totals'},503);
 let taxCents:number;
 try{taxCents=retailTaxCents(env,customer.postalCode,goodsCents,shippingCents)}
 catch{return answer(origin,{ok:false,error:'Tax for this delivery ZIP is not yet validated. Contact sales.'},409)}
 const amount=(goodsCents+shippingCents+taxCents)/100;
 if(!Number.isSafeInteger(taxCents)||taxCents<0||amount<=0||amount>5000)
  return answer(origin,{ok:false,error:'Order total outside direct checkout limits'},409);
 const orderId=crypto.randomUUID(),orderRef='ME-R-'+v.requestId.replace(/-/g,'').slice(0,20).toUpperCase();
 if(!exists){
  const reserved=await db.prepare("INSERT OR IGNORE INTO retail_checkout_requests(request_id,fingerprint,order_id,order_reference,provider_request_id,state) VALUES (?,?,?,?,?,'RESERVING')")
   .bind(v.requestId,fingerprint,orderId,orderRef,v.requestId).run();
  exists=await db.prepare('SELECT fingerprint,state,order_id,order_reference,provider_request_id FROM retail_checkout_requests WHERE request_id=?')
   .bind(v.requestId).first<Attempt>();
  if(exists?.fingerprint!==fingerprint)return answer(origin,{ok:false,error:'Checkout idempotency conflict'},409);
  if(Number(reserved.meta?.changes||0)===1){
   const steps=[
    db.prepare("INSERT INTO orders(id,reference,status,payment_status,currency,subtotal,shipping,tax,total,shipping_address,customer_notes,confirmed_at) VALUES (?,?,'PAYMENT_PENDING','UNPAID','USD',?,?,?,?,?,?,CURRENT_TIMESTAMP)")
     .bind(orderId,orderRef,goodsCents/100,shippingCents/100,taxCents/100,amount,JSON.stringify(customer),
      'Website direct retail 1–9 units; tax and freight server-verified; payment pending signed Airwallex webhook'),
    ...lines.map(l=>db.prepare('INSERT INTO order_items(id,order_id,description,quantity,unit_price,line_total) VALUES (?,?,?,?,?,?)')
     .bind(v.requestId+':'+l.sku,orderId,'Retail '+l.sku,l.quantity,
      calc.lines.find((a:{sku:string})=>a.sku===l.sku).unitPriceUSD,
      calc.lines.find((a:{sku:string})=>a.sku===l.sku).lineTotalUSD)),
    db.prepare("UPDATE retail_checkout_requests SET state='NEW',updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND state='RESERVING'").bind(v.requestId)
   ];
   await db.batch(steps);
  }
 }
 if(!exists)return answer(origin,{ok:false,error:'Unable to reserve checkout order'},503);
 const current=await db.prepare('SELECT state,order_id,order_reference,provider_request_id FROM retail_checkout_requests WHERE request_id=?')
  .bind(v.requestId).first<Attempt>();
 if(!current||current.state==='RESERVING')return answer(origin,{ok:false,error:'Order is being reserved, please retry shortly'},409);
 const order=await db.prepare('SELECT total,payment_status FROM orders WHERE id=?').bind(current.order_id).first<{total:number;payment_status:string}>();
 if(!order||Math.abs(Number(order.total)-amount)>0.005)
  return answer(origin,{ok:false,error:'Order amount changed; contact support'},409);
 if(order.payment_status==='PAID')return answer(origin,{ok:false,error:'This order is already paid'},409);
 const existingSession=await db.prepare("SELECT provider_intent_id,client_secret,status FROM payment_provider_sessions WHERE provider='AIRWALLEX' AND order_id=? ORDER BY created_at DESC LIMIT 1")
  .bind(current.order_id).first<{provider_intent_id:string;client_secret:string;status:string}>();
 const successUrl='https://www.mingeagle.com/retail-checkout.html?payment_return=1&checkout_ref='+encodeURIComponent(v.requestId);
 const sessionResult=(intentId:string,clientSecret:string,reused:boolean)=>({
  ok:true,orderReference:current.order_reference,intentId,clientSecret,currency:'USD',
  amount,sdkEnv:airwallexSdkEnv(env),countryCode:'US',successUrl,reused});
 if(existingSession?.status==='SUCCEEDED')return answer(origin,{ok:false,error:'Provider payment already succeeded'},409);
 if(existingSession?.status==='PENDING'||existingSession?.status==='PENDING_REVIEW')
  return answer(origin,{ok:true,pending:true,orderReference:current.order_reference});
 if(existingSession?.provider_intent_id&&existingSession?.client_secret)
  return answer(origin,sessionResult(existingSession.provider_intent_id,existingSession.client_secret,true));
 const claim=await db.prepare("UPDATE retail_checkout_requests SET state='CREATING',updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND (state IN ('NEW','FAILED') OR (state='CREATING' AND updated_at<datetime('now','-3 minutes')))")
  .bind(v.requestId).run();
 if(Number(claim.meta?.changes||0)!==1)
  return answer(origin,{ok:false,error:'Secure payment is already being prepared. Retry using the same checkout request.'},409);
 try{
  const accessToken=await getAirwallexAccessToken(env);
  const names=customer.name.split(/\s+/);
  const provider=await fetch(airwallexApiBase(env)+'/api/v1/pa/payment_intents/create',{
   method:'POST',headers:{authorization:'Bearer '+accessToken,'content-type':'application/json'},
   body:JSON.stringify({request_id:v.requestId,amount,currency:'USD',merchant_order_id:current.order_reference,
    return_url:successUrl,merchant_website_url:'https://www.mingeagle.com/',descriptor:'MING EAGLE',
    customer:{email:customer.email,first_name:names[0],last_name:names.slice(1).join(' ')||undefined},
    metadata:{order_reference:current.order_reference,source:'MING_EAGLE_DIRECT_RETAIL'}})});
  const data=await provider.json().catch(()=>({})) as {id?:string;client_secret?:string;status?:string};
  if(!provider.ok||!data.id||!data.client_secret)throw Error('Provider did not issue a complete payment intent');
  await db.batch([
   db.prepare("INSERT OR IGNORE INTO payment_provider_sessions(id,order_id,provider,provider_intent_id,request_id,amount,currency,status,client_secret) VALUES (?,?,'AIRWALLEX',?,? ,?,'USD',?,?)")
    .bind(crypto.randomUUID(),current.order_id,data.id,v.requestId,amount,String(data.status||'REQUIRES_PAYMENT_METHOD').toUpperCase(),data.client_secret),
   db.prepare("UPDATE retail_checkout_requests SET state='READY',updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND state='CREATING'")
    .bind(v.requestId)
  ]);
  return answer(origin,sessionResult(data.id,data.client_secret,false));
 }catch(e){
  // Provider request_id remains unchanged for an idempotent retry even if
  // the provider succeeded but the network or database failed.
  await db.prepare("UPDATE retail_checkout_requests SET state='FAILED',updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND state='CREATING'")
   .bind(v.requestId).run().catch(()=>{});
  console.error('retail_checkout_create_failed',e instanceof Error?e.name:'UnknownError');
  return answer(origin,{ok:false,error:'Secure checkout could not start. Your card has not been charged by this page; contact support if unsure.'},503);
 }
};
