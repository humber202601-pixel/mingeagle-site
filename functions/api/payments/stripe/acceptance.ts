import {ACCEPTANCE_ORIGIN,acceptanceRuntime,acceptanceAuthorized,isolatedAcceptanceDB,testCheckoutEnv,reject,type AcceptanceEnv} from '../../../_shared/stripe-acceptance';
import {STRIPE_API_VERSION,stripeApi,stripeSessionMatchesMode} from '../../../_shared/stripe';
import {oneItemUsAirParcel} from '../../../../lib/us-small-parcel';
import {onRequestPost as createCheckout} from './create';

export const onRequestPost:PagesFunction<AcceptanceEnv>=async({request,env})=>{
 if(!acceptanceRuntime(request,env))return reject('Test-order acceptance unavailable.',404);
 if(!acceptanceAuthorized(request,env))return reject('Test-order access denied.');
 if(request.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json')return reject('JSON required.',415);
 const raw=await request.text();if(raw.length>1200)return reject('Payload too large.',413);
 let body:{action?:string;sku?:string;runId?:string};try{body=JSON.parse(raw)}catch{return reject('Invalid JSON.',400)}
 if(!await isolatedAcceptanceDB(env))return reject('Isolated test database marker is missing.',503);
 const db=env.MINGEAGLE_DB;
 try{
  if(body.action==='setup-webhook'){
   const form=new URLSearchParams({url:ACCEPTANCE_ORIGIN+'/api/payments/stripe/acceptance-webhook',
    api_version:STRIPE_API_VERSION,description:'MING EAGLE isolated test-order acceptance only',
    'metadata[source]':'MING_EAGLE_ISOLATED_TEST_ACCEPTANCE'});
   ['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired']
    .forEach((type,i)=>form.set('enabled_events['+i+']',type));
   const response=await fetch('https://api.stripe.com/v1/webhook_endpoints',{method:'POST',redirect:'manual',
    headers:{authorization:'Bearer '+String(env.STRIPE_SECRET_KEY).trim(),'stripe-version':STRIPE_API_VERSION,
     'content-type':'application/x-www-form-urlencoded','idempotency-key':'mingeagle-acceptance-hook-20261014'},body:form.toString()});
   if(!response.ok)return reject('Stripe test webhook configuration failed (HTTP '+response.status+').',502);
   const hook=await response.json() as {id?:string;secret?:string;livemode?:boolean;url?:string};
   if(hook.livemode!==false||hook.url!==ACCEPTANCE_ORIGIN+'/api/payments/stripe/acceptance-webhook'||
    !hook.id?.startsWith('we_')||!hook.secret?.startsWith('whsec_'))return reject('Invalid test webhook response.',502);
   await db.prepare("INSERT INTO stripe_acceptance_environment(id,marker) VALUES ('stripe-webhook-id',?) ON CONFLICT(id) DO UPDATE SET marker=excluded.marker").bind(hook.id).run();
   // This newly created test-only secret is returned once to the authenticated
   // configuration client for encrypted Preview storage. Never log it or an API key.
   return Response.json({ok:true,endpointId:hook.id,signingSecret:hook.secret},{headers:{'cache-control':'no-store','referrer-policy':'no-referrer'}});
  }
  if(body.action==='disable-webhook'){
   const stored=await db.prepare("SELECT marker FROM stripe_acceptance_environment WHERE id='stripe-webhook-id'").first<{marker:string}>();
   if(!/^we_[A-Za-z0-9]+$/.test(stored?.marker||''))return reject('No configured test webhook.',409);
   const response=await fetch('https://api.stripe.com/v1/webhook_endpoints/'+stored!.marker,{method:'POST',redirect:'manual',
    headers:{authorization:'Bearer '+String(env.STRIPE_SECRET_KEY).trim(),'stripe-version':STRIPE_API_VERSION,
     'content-type':'application/x-www-form-urlencoded'},body:'disabled=true'});
   if(!response.ok)return reject('Could not disable the test webhook.',502);
   const result=await response.json() as {id?:string;livemode?:boolean;status?:string};
   if(result.id!==stored!.marker||result.livemode!==false||result.status!=='disabled')return reject('Invalid test webhook disable result.',502);
   return Response.json({ok:true,mode:'test',webhookStatus:'disabled'},{headers:{'cache-control':'no-store'}});
  }
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.runId||''))return reject('A UUID test run is required.',400);
  const runId=body.runId!;
  if(body.action==='create'){
   if(body.sku!=='P1-S3'&&body.sku!=='P1-S7')return reject('Only approved one-item test prices are available.',400);
   if(!String(env.STRIPE_WEBHOOK_SECRET||'').startsWith('whsec_'))return reject('Configure the test signing secret first.',503);
   const existing=await db.prepare('SELECT run_id FROM stripe_acceptance_runs WHERE run_id=?').bind(runId).first();
   if(existing)return reject('This test run already exists.',409);
   const count=await db.prepare('SELECT COUNT(*) AS count FROM stripe_acceptance_runs').first<{count:number}>();
   if(Number(count?.count)>=4)return reject('The bounded test-order limit has been reached.',409);
   const rate=oneItemUsAirParcel(body.sku,'US','air',1)!;
   const id=crypto.randomUUID(),quote=crypto.randomUUID(),token=[...crypto.getRandomValues(new Uint8Array(32))].map(x=>x.toString(16).padStart(2,'0')).join('');
   const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))].map(x=>x.toString(16).padStart(2,'0')).join('');
   const suffix=id.replaceAll('-','').slice(0,12).toUpperCase();
   const total=Math.round((rate.productUSD+rate.shippingUSD)*100)/100;
   const quoteRef='ME-RQ-TEST-'+suffix,orderRef='ME-RO-TEST-'+suffix,description=body.sku+' / Orange Retail silent ball';
   await db.batch([
    db.prepare("INSERT INTO quotes(id,reference,status,currency,subtotal,shipping,total,public_token_hash,valid_until,notes) VALUES (?,?,'SENT','USD',?,?,?,?,datetime('now','+1 day'),'TEST ONLY: synthetic order, no real sale, shipping, inventory approval or tax review')")
     .bind(quote,quoteRef,rate.productUSD,rate.shippingUSD,total,hash),
    db.prepare("INSERT INTO orders(id,reference,quote_id,status,currency,subtotal,shipping,total,payment_status,shipping_address,internal_notes) VALUES (?,?,?,'PAYMENT_PENDING','USD',?,?,?,'UNPAID',?,'TEST ONLY: isolated Stripe acceptance')")
     .bind(id,orderRef,quote,rate.productUSD,rate.shippingUSD,total,JSON.stringify({country:'US',state:'NY'})),
    db.prepare('INSERT INTO quote_items(id,quote_id,description,quantity,unit_price,line_total) VALUES (?,?,?,1,?,?)')
     .bind(crypto.randomUUID(),quote,description,rate.productUSD,rate.productUSD),
    db.prepare('INSERT INTO order_items(id,order_id,description,quantity,unit_price,line_total) VALUES (?,?,?,1,?,?)')
     .bind(crypto.randomUUID(),id,description,rate.productUSD,rate.productUSD),
    db.prepare('INSERT INTO stripe_acceptance_runs(run_id,sku,order_id,quote_id) VALUES (?,?,?,?)').bind(runId,body.sku,id,quote)
   ]);
   const checkout=await createCheckout({env:testCheckoutEnv(env),request:new Request(ACCEPTANCE_ORIGIN+'/api/payments/stripe/create',
    {method:'POST',headers:{origin:ACCEPTANCE_ORIGIN,'content-type':'application/json'},body:JSON.stringify({token})})} as Parameters<typeof createCheckout>[0]);
   const result=await checkout.json() as {ok?:boolean;url?:string;error?:string};
   if(!checkout.ok||!result.ok)return reject(result.error||'Test checkout creation failed.',checkout.status);
   return Response.json({ok:true,runId,orderReference:orderRef,totalUSD:total,mode:'test',url:result.url,
    orderPage:ACCEPTANCE_ORIGIN+'/quote/'+token,notice:'Isolated synthetic test order only.'},{headers:{'cache-control':'no-store'}});
  }
  const run=await db.prepare(`SELECT r.sku,r.order_id,o.reference,o.status,o.payment_status,o.total,
   (SELECT COUNT(*) FROM payments p WHERE p.order_id=o.id AND p.provider='STRIPE' AND p.status='RECEIVED') AS payment_count,
   (SELECT COALESCE(SUM(amount),0) FROM payments p WHERE p.order_id=o.id AND p.status='RECEIVED') AS received,
   (SELECT COUNT(*) FROM tasks t WHERE t.order_id=o.id AND t.type='FULFILLMENT') AS fulfillment_count,
   (SELECT provider_intent_id FROM payment_provider_sessions s WHERE s.order_id=o.id AND s.provider='STRIPE' ORDER BY s.created_at DESC LIMIT 1) AS session_id,
   (SELECT json_extract(a.metadata_json,'$.eventId') FROM activities a WHERE a.entity_type='ORDER' AND a.entity_id=o.id AND a.activity_type='PAYMENT_RECEIVED' ORDER BY a.created_at DESC LIMIT 1) AS receipt_event
   FROM stripe_acceptance_runs r JOIN orders o ON o.id=r.order_id WHERE r.run_id=?`).bind(runId).first<Record<string,unknown>>();
  if(!run||!String(run.reference).startsWith('ME-RO-TEST-'))return reject('Unknown test run.',404);
  if(body.action==='status')return Response.json({ok:true,mode:'test',...run},{headers:{'cache-control':'no-store'}});
  if(body.action==='session'){
   if(!stripeSessionMatchesMode(run.session_id,'test'))return reject('Invalid test session.',409);
   const provider=await stripeApi(testCheckoutEnv(env),'checkout/sessions/'+encodeURIComponent(String(run.session_id)));
   if(!provider.ok)return reject('Test session status unavailable.',502);
   const session=await provider.json() as {id?:string;livemode?:boolean;status?:string;payment_status?:string;amount_total?:number;currency?:string;client_reference_id?:string;metadata?:{order_id?:string;order_reference?:string}};
   if(session.livemode!==false||session.id!==run.session_id||session.client_reference_id!==run.reference||
    session.metadata?.order_id!==run.order_id||session.currency!=='usd'||session.amount_total!==Math.round(Number(run.total)*100))return reject('Test session reconciliation failed.',409);
   return Response.json({ok:true,mode:'test',status:session.status,paymentStatus:session.payment_status,
    totalUSD:Number(session.amount_total)/100,orderReference:run.reference},{headers:{'cache-control':'no-store'}});
  }
  return reject('Unsupported test action.',400);
 }catch{return reject('Test-order acceptance temporarily unavailable.',503)}
};
