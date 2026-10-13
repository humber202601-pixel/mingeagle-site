import {type AirwallexEnv} from '../../_shared/airwallex';
import {type StripeEnv} from '../../_shared/stripe';
import {verifyInquiryTurnstile,turnstileConfiguration,type TurnstileEnv} from '../../../lib/turnstile-inquiry';
import {SKU_USD} from '../../../lib/retail-reference';
import {noSalesTaxCollectionRequired,type RetailTaxEnv} from '../../../lib/retail-tax-policy';
import {onRequestPost as calculateShipping} from '../shipping/cart';
import {retailCheckoutReady} from './checkout-status';

interface Env extends AirwallexEnv,StripeEnv,TurnstileEnv,RetailTaxEnv {
 STRIPE_TAX_POLICY_APPROVED?:string;
 MINGEAGLE_DB:D1Database;
 RETAIL_CHECKOUT_ENABLED?:string;
 RETAIL_STOCK_FULFILLMENT_APPROVED?:string;
 RETAIL_TAX_POLICY_APPROVED?:string;
}
type Line={sku:string;quantity:number;color:string};
const COLORS:Record<string,string[]>={
 P1:['Orange','Blue','Green','Yellow'],P2:['Orange','Green'],
 P3:['Orange','Brown','Black','Aqua Blue'],
 P4:['Black/White','Black/Green','Black/Red','Yellow/Green','Black/Gold']
};
type Input={
 requestId?:string;country?:string;method?:string;lines?:Line[];
 name?:string;email?:string;phone?:string;
 street1?:string;street2?:string;city?:string;state?:string;postalCode?:string;
 privacyAck?:boolean;turnstileToken?:string
};
type R=Record<string,unknown>;
const bad=(error:string,status=400)=>Response.json({ok:false,error},{status,headers:{'cache-control':'no-store'}});
const clean=(x:unknown,max:number)=>typeof x==='string'&&x.length<=max?x.trim():'';
const allowedOrigin='https://app.mingeagle.com';
const emailRe=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const skuRe=/^(?:P1-S[357]|P2-S[357]|P3-S[3467]|P4-S5)$/;
async function sha256(s:string){
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));
 return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function token64(){return [...crypto.getRandomValues(new Uint8Array(32))]
 .map(x=>x.toString(16).padStart(2,'0')).join('')}
const amount=(x:unknown)=>Math.round(Number(x)*100);
export const onRequestPost:PagesFunction<Env>=async({request,env})=>{
 // Strict activation gate BEFORE any DB reads/writes, Turnstile or provider API calls.
 if(!retailCheckoutReady(env))return bad('Secure retail checkout is not yet activated. Request a retail order instead.',503);
 if(!env.MINGEAGLE_DB)return bad('Checkout database unavailable',503);
 const origin=request.headers.get('origin');
 if(origin&&origin!==allowedOrigin)return bad('Invalid checkout origin',403);
 if(request.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json')
  return bad('JSON checkout request required',415);
 let input:Input;try{input=await request.json()}catch{return bad('Invalid checkout request')}
 const lines=input.lines,country=clean(input.country,2).toUpperCase(),method=clean(input.method,6);
 if(!Array.isArray(lines)||!lines.length||lines.length>9||country!=='US'||method!=='air')
  return bad('Direct checkout supports US retail air orders of 1–9 units only');
 const seen=new Set<string>();let quantity=0;const freightGrouped=new Map<string,number>();
 for(const line of lines){
  if(!line||!skuRe.test(line.sku)||!Object.prototype.hasOwnProperty.call(SKU_USD,line.sku)||
     !COLORS[line.sku.slice(0,2)]?.includes(line.color)||
     seen.has(line.sku+'|'+line.color)||!Number.isSafeInteger(line.quantity)||line.quantity<1||line.quantity>9)
   return bad('Unsupported product, size or duplicate line');
  quantity+=line.quantity;seen.add(line.sku+'|'+line.color);
  freightGrouped.set(line.sku,(freightGrouped.get(line.sku)||0)+line.quantity);
 }
 if(quantity<1||quantity>9)return bad('10+ units require a separate consented sea-freight wholesale quote',409);
 const requestId=clean(input.requestId,36);
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId))
  return bad('Missing or invalid idempotency key');
 const name=clean(input.name,120),email=clean(input.email,180).toLowerCase(),phone=clean(input.phone,45);
 const street1=clean(input.street1,200),street2=clean(input.street2,200);
 const city=clean(input.city,100),state=clean(input.state,60).toUpperCase(),zip=clean(input.postalCode,20);
 if(!name||!emailRe.test(email)||!phone||!street1||!city||!state||!/^[0-9]{5}(?:-[0-9]{4})?$/.test(zip)||
    input.privacyAck!==true)
  return bad('Name, valid email, phone, US delivery address, ZIP and privacy consent required');
 if(!noSalesTaxCollectionRequired(env,state))
  return bad('Sales-tax collection obligations for this delivery state are not yet verified. Please request a retail quote instead.',409);
 if(!turnstileConfiguration(env).enabled)return bad('Checkout security verification not ready',503);
 const captcha=await verifyInquiryTurnstile(env,input.turnstileToken,request);
 if(!captcha.ok||captcha.code!=='OK')return bad('Security challenge must be completed again',403);
 const db=env.MINGEAGLE_DB;
 try{
  // Reject duplicated checkout actions before doing any CRM writes.
  const previous=await db.prepare('SELECT request_id FROM retail_checkout_requests WHERE request_id=?')
   .bind(requestId).first<R>();
  if(previous)return bad('This checkout request was already submitted. Check your previous order link.',409);
  // Server-side retail and freight repricing: ignore any client-provided totals.
  const q=await calculateShipping({
    env,request:new Request(allowedOrigin+'/api/shipping/cart',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({country:'US',method:'air',
       lines:[...freightGrouped].map(([sku,quantity])=>({sku,quantity}))})
    })
  } as Parameters<typeof calculateShipping>[0]);
  const price=await q.json() as {ok?:boolean;wholesale?:boolean;productsUSD?:number;productUSD?:number;
    shippingUSD?:number;totalBeforeTaxesUSD?:number;ddpConfirmed?:boolean};
  if(!q.ok||!price.ok||price.wholesale)return bad('Unable to confirm current retail shipping price',409);
  const goods=amount(price.productsUSD??price.productUSD),freight=amount(price.shippingUSD),
    total=amount(price.totalBeforeTaxesUSD);
  if(![goods,freight,total].every(x=>Number.isSafeInteger(x)&&x>=0)||
     goods<100||total!==goods+freight||total>100000)return bad('Checkout total failed validation',409);
  const expected=lines.reduce((n,line)=>n+Math.round(SKU_USD[line.sku]*100)*line.quantity,0);
  if(expected!==goods)return bad('Product prices changed; refresh your basket',409);
  const found=await db.prepare('SELECT id FROM contacts WHERE lower(email)=? LIMIT 1')
   .bind(email).first<{id:string}>();
  const contact=found?.id||crypto.randomUUID();
  const lead=crypto.randomUUID(),inquiry=crypto.randomUUID(),quote=crypto.randomUUID(),
    order=crypto.randomUUID(),rawToken=token64();
  const tokenHash=await sha256(rawToken);
  const uid=crypto.randomUUID().replace(/-/g,'').slice(0,12).toUpperCase();
  const ref='ME-R-'+uid,quoteRef='ME-RQ-'+uid,orderRef='ME-RO-'+uid;
  const address=JSON.stringify({name,email,phone,street1,street2,city,state,postalCode:zip,country:'US'});
  const descriptions=lines.map(l=>l.sku+' / '+l.color+' x '+l.quantity);
  const statements:D1PreparedStatement[]=[];
  if(!found)statements.push(db.prepare(
   "INSERT INTO contacts(id,full_name,email,phone,email_type,email_verified,source_evidence) VALUES (?,?,?,?, 'PERSONAL',0,'Retail checkout submitted by customer')"
  ).bind(contact,name,email,phone));
  statements.push(
   db.prepare("INSERT INTO leads(id,primary_contact_id,source,source_detail,status,product_interest) VALUES (?,?,'WEBSITE','DIRECT_RETAIL_CHECKOUT','INTERESTED','SILENT_BALL')").bind(lead,contact),
   db.prepare("INSERT INTO inquiries(id,reference,lead_id,contact_id,request_type,customer_type,estimated_quantity,shipping_country,shipping_city,shipping_postal_code,message,status) VALUES (?,?,?,?, 'RETAIL','Family / consumer',?,'US',?,?,?,'QUOTED')").bind(inquiry,ref,lead,contact,String(quantity),city,zip,'Self-service retail checkout: '+descriptions.join(', ')),
   db.prepare("INSERT INTO quotes(id,reference,lead_id,inquiry_id,contact_id,status,currency,subtotal,discount,shipping,tax,total,payment_terms,shipping_terms,notes,valid_until,sent_at,public_token_hash) VALUES (?,?,?,?,?,'SENT','USD',?,0,?,0,?,'Online payment through verified secure checkout','Single-item China-to-US air parcel, merchant-paid import clearance and duties; state sales tax reviewed separately; delivery timing not guaranteed','DDP confirmed for eligible one-unit shipping only; tax zero only after state-specific reviewed no-collection decision',datetime('now','+7 days'),CURRENT_TIMESTAMP,?)")
    .bind(quote,quoteRef,lead,inquiry,contact,goods/100,freight/100,total/100,tokenHash),
   db.prepare("INSERT INTO orders(id,reference,quote_id,lead_id,contact_id,status,currency,subtotal,discount,shipping,tax,total,payment_status,shipping_address,customer_notes) VALUES (?,?,?,?,?,'PAYMENT_PENDING','USD',?,0,?,0,?,'UNPAID',?,?)")
    .bind(order,orderRef,quote,lead,contact,goods/100,freight/100,total/100,address,'Retail self-service checkout awaiting provider-confirmed payment')
  );
  for(let i=0;i<lines.length;i++){
   const line=lines[i],unit=SKU_USD[line.sku],sum=Math.round(unit*100)*line.quantity/100;
   statements.push(
    db.prepare("INSERT INTO quote_items(id,quote_id,description,quantity,unit_price,line_total,sort_order) VALUES (?,?,?,?,?,?,?)")
      .bind(crypto.randomUUID(),quote,line.sku+' / '+line.color+' Retail silent ball',line.quantity,unit,sum,i),
    db.prepare("INSERT INTO order_items(id,order_id,description,quantity,unit_price,line_total) VALUES (?,?,?,?,?,?)")
      .bind(crypto.randomUUID(),order,line.sku+' / '+line.color+' Retail silent ball',line.quantity,unit,sum)
   );
  }
  statements.push(db.prepare("INSERT INTO retail_checkout_requests(request_id,order_id,quote_id) VALUES (?,?,?)")
   .bind(requestId,order,quote));
  const result=await db.batch(statements);
  if(!Array.isArray(result)||result.length!==statements.length||result.some(x=>!x.success))
   throw Error('Checkout write unconfirmed');
  return Response.json({ok:true,orderReference:orderRef,quantity,totalBeforeTaxesUSD:total/100,
    paymentStatus:'UNPAID',paymentPage:allowedOrigin+'/quote/'+rawToken},
    {headers:{'cache-control':'no-store'}});
 }catch(e){
  console.error('retail_checkout_creation_failed',{type:e instanceof Error?e.name:'error'});
  return bad('Retail checkout could not be prepared safely. Please contact support.',503);
 }
};
