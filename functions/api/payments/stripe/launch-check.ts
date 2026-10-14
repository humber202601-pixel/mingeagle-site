import {STRIPE_API_VERSION} from '../../../_shared/stripe';
import {oneItemUsAirParcel} from '../../../../lib/us-small-parcel';

interface Env {
 STRIPE_SECRET_KEY?:string;STRIPE_MODE?:string;TEST_ENVIRONMENT?:string;
 STRIPE_LAUNCH_CHECK_ENABLED?:string;STRIPE_LAUNCH_CHECK_EXPIRES_AT?:string;
 STRIPE_LAUNCH_CHECK_TOKEN?:string;STRIPE_LAUNCH_WEBHOOK_ID?:string;
 STRIPE_LAUNCH_READ_ONLY?:string;
 STRIPE_LAUNCH_TAX_ONLY?:string;
 STRIPE_LAUNCH_AUTOMATIC_TAX_PROBE_ONLY?:string;
}
const origin='https://app.mingeagle.com',webhookUrl=origin+'/api/payments/stripe/webhook';
const events=['checkout.session.completed','checkout.session.async_payment_succeeded',
 'checkout.session.async_payment_failed','checkout.session.expired'];
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'cache-control':'no-store','referrer-policy':'no-referrer'}});
const authorized=(request:Request,env:Env)=>{
 const expiry=Date.parse(env.STRIPE_LAUNCH_CHECK_EXPIRES_AT||'');
 const key=String(env.STRIPE_SECRET_KEY||'').trim(),expected=String(env.STRIPE_LAUNCH_CHECK_TOKEN||'');
 if(new URL(request.url).origin!==origin||request.headers.get('origin')!==origin||env.TEST_ENVIRONMENT==='preview'
  ||env.STRIPE_MODE!=='live'||!/^([sr]k)_live_/.test(key)||env.STRIPE_LAUNCH_CHECK_ENABLED!=='true'
  ||!Number.isFinite(expiry)||expiry<=Date.now()||expiry-Date.now()>24*3600000||expected.length<32)return false;
 const supplied=request.headers.get('x-mingeagle-launch-token')||'';
 if(supplied.length!==expected.length||supplied.length>128)return false;
 let difference=0;for(let i=0;i<expected.length;i++)difference|=expected.charCodeAt(i)^supplied.charCodeAt(i);
 return difference===0;
};
export const onRequestPost:PagesFunction<Env>=async({request,env})=>{
 if(!authorized(request,env))return json({ok:false,error:'Launch checks unavailable.'},404);
 if(!request.headers.get('content-type')?.startsWith('application/json'))return json({ok:false,error:'JSON required.'},415);
 const raw=await request.text();if(raw.length>1000)return json({ok:false,error:'Payload too large.'},413);
 let body:{action?:string;endpointId?:string};try{body=JSON.parse(raw)}catch{return json({ok:false,error:'Invalid JSON.'},400)}
 if(env.STRIPE_LAUNCH_AUTOMATIC_TAX_PROBE_ONLY==='true'&&!['inspect-tax','probe-automatic-tax'].includes(body.action||''))
  return json({ok:false,error:'Only automatic tax verification is permitted.'},405);
 if(env.STRIPE_LAUNCH_TAX_ONLY==='true'&&!['inspect-tax','configure-tax-defaults'].includes(body.action||''))
  return json({ok:false,error:'Only tax configuration actions are permitted.'},405);
 if(env.STRIPE_LAUNCH_READ_ONLY==='true'&&!['inspect','inspect-tax'].includes(body.action||''))
  return json({ok:false,error:'Only configuration inspection is permitted.'},405);
 async function api(path:string,method='GET',form?:URLSearchParams,idempotency?:string){
  const headers=new Headers({'authorization':'Bearer '+String(env.STRIPE_SECRET_KEY).trim(),'stripe-version':STRIPE_API_VERSION});
  if(form)headers.set('content-type','application/x-www-form-urlencoded');
  if(idempotency)headers.set('idempotency-key',idempotency);
  const response=await fetch('https://api.stripe.com/v1/'+path,{method,headers,redirect:'manual',...(form?{body:form.toString()}:{})});
  if(response.status>=300&&response.status<400)throw Error('Provider redirect rejected');
  const data=await response.json() as Record<string,any>;
  return {ok:response.ok,status:response.status,data};
 }
 const permission=(r:{ok:boolean;status:number;data:Record<string,any>})=>({ok:r.ok,httpStatus:r.status,
  errorType:r.ok?undefined:r.data.error?.type,errorCode:r.ok?undefined:r.data.error?.code});
 try{
  if(body.action==='probe-automatic-tax'){
   if(env.STRIPE_LAUNCH_AUTOMATIC_TAX_PROBE_ONLY!=='true')
    return json({ok:false,error:'Automatic tax probe scope required.'},405);
   const settings=await api('tax/settings');
   const address=settings.data.head_office?.address;
   if(!settings.ok||settings.data.livemode!==true||settings.data.status!=='active'||
    settings.data.defaults?.tax_code!=='txcd_99999999'||!address?.line1||!address?.city||
    address?.country!=='US'||!address?.state||!address?.postal_code)
    return json({ok:false,error:'A validated business tax configuration is required.'},409);
   const nonce=crypto.randomUUID(),purpose='MING_EAGLE_AUTOMATIC_TAX_DIAGNOSTIC_NO_PAYMENT';
   const customerForm=new URLSearchParams({name:'MING EAGLE checkout diagnostic',
    'tax[validate_location]':'immediately','tax_exempt':'none','expand[0]':'tax',
    'shipping[name]':'MING EAGLE checkout diagnostic','metadata[purpose]':purpose,'metadata[diagnostic_nonce]':nonce});
   for(const key of ['line1','line2','city','state','postal_code','country'])if(address[key]){
    customerForm.set('address['+key+']',address[key]);customerForm.set('shipping[address]['+key+']',address[key]);
   }
   const customer=await api('customers','POST',customerForm,'mingeagle-tax-diagnostic-customer-'+nonce);
   if(!customer.ok)return json({...permission(customer),stage:'customer_create'},502);
   const c=customer.data;
   if(!/^cus_[A-Za-z0-9]+$/.test(c.id)||c.metadata?.purpose!==purpose||c.metadata?.diagnostic_nonce!==nonce)
    return json({ok:false,error:'Diagnostic customer ownership mismatch.'},502);
   let sessionId:string|undefined,ended=false;
   let failure:Record<string,unknown>|undefined;
   try{
    if(c.livemode!==true||c.tax?.location?.country!=='US'||c.tax.location.state!==address.state)
     failure={stage:'tax_location',error:'Business diagnostic location mismatch.'};
    else{
     const form=new URLSearchParams({mode:'payment',customer:c.id,'automatic_tax[enabled]':'true',
      success_url:origin+'/?technical_check=complete',cancel_url:origin+'/?technical_check=cancel',
      client_reference_id:'ME-LAUNCH-CHECK-NOT-AN-ORDER','metadata[purpose]':'MING_EAGLE_LAUNCH_PROBE_NO_PAYMENT',
      'line_items[0][price_data][currency]':'usd','line_items[0][price_data][unit_amount]':'990',
      'line_items[0][price_data][tax_behavior]':'exclusive','line_items[0][price_data][product_data][tax_code]':'txcd_99999999',
      'line_items[0][price_data][product_data][name]':'MING EAGLE technical verification — do not pay','line_items[0][quantity]':'1',
      'line_items[1][price_data][currency]':'usd','line_items[1][price_data][unit_amount]':'1150',
      'line_items[1][price_data][tax_behavior]':'exclusive','line_items[1][price_data][product_data][tax_code]':'txcd_92010001',
      'line_items[1][price_data][product_data][name]':'Delivery technical verification — do not pay','line_items[1][quantity]':'1'});
     const created=await api('checkout/sessions','POST',form,'mingeagle-tax-diagnostic-session-'+nonce);
     const s=created.data;
     if(/^cs_live_[A-Za-z0-9]+$/.test(s.id))sessionId=s.id;
     const tax=s.total_details?.amount_tax;
     if(!created.ok||s.livemode!==true||!sessionId||s.customer!==c.id||s.currency!=='usd'||
      s.automatic_tax?.enabled!==true||s.automatic_tax.status!=='complete'||!Number.isSafeInteger(tax)||tax<0||s.amount_total!==2140+tax)
      failure={...permission(created),stage:'automatic_tax_session',error:'Automatic tax session reconciliation failed.'};
    }
   }finally{
    // The diagnostic never returns a payable URL, creates a CRM order or charges.
    if(sessionId){const expired=await api('checkout/sessions/'+sessionId+'/expire','POST',new URLSearchParams());ended=expired.ok&&expired.data.status==='expired';}
    const removed=await api('customers/'+c.id,'DELETE');
    if(!removed.ok||removed.data.deleted!==true)failure={stage:'customer_cleanup',error:'Diagnostic customer cleanup requires attention.'};
   }
   if(!ended&&!failure)failure={stage:'session_cleanup',error:'Diagnostic session expiration requires attention.'};
   return json({ok:!failure,mode:'live',sessionExpired:ended,customerDeleted:failure?.stage!=='customer_cleanup',
    ...(failure||{}),sessionId},failure?502:200);
  }
  if(body.action==='configure-tax-defaults'){
   if(env.STRIPE_LAUNCH_TAX_ONLY!=='true')return json({ok:false,error:'Tax configuration scope required.'},405);
   const before=await api('tax/settings');
   if(!before.ok)return json({...permission(before),stage:'read_tax_defaults'},502);
   if(before.data.livemode!==true||before.data.status!=='active'||
    !['txcd_10000000','txcd_99999999'].includes(before.data.defaults?.tax_code))
    return json({ok:false,error:'Existing tax configuration requires review.'},409);
   const already=before.data.defaults.tax_code==='txcd_99999999'&&before.data.defaults.tax_behavior==='exclusive';
   if(!already){
    // Fixed physical-goods defaults only. Do not alter head office, register a
    // jurisdiction, enable automatic collection or submit a financial order.
    const updated=await api('tax/settings','POST',new URLSearchParams({
     'defaults[tax_code]':'txcd_99999999','defaults[tax_behavior]':'exclusive'
    }),'mingeagle-physical-tax-defaults-20261014');
    if(!updated.ok)return json({...permission(updated),stage:'update_tax_defaults'},502);
   }
   const verified=await api('tax/settings');
   const correct=verified.ok&&verified.data.livemode===true&&verified.data.status==='active'&&
    verified.data.defaults?.tax_code==='txcd_99999999'&&verified.data.defaults?.tax_behavior==='exclusive';
   return json({ok:correct,mode:'live',changed:!already,verified:permission(verified),
    taxCode:verified.data.defaults?.tax_code,taxBehavior:verified.data.defaults?.tax_behavior},correct?200:502);
  }
  if(body.action==='inspect-tax'){
   const [settings,registrations]=await Promise.all([api('tax/settings'),api('tax/registrations?status=active&limit=100')]);
   const s=settings.data;
   const entries=Array.isArray(registrations.data.data)?registrations.data.data:[];
   return json({ok:settings.ok&&registrations.ok,mode:'live',
    settings:{...permission(settings),status:s.status,livemode:s.livemode,
     headOfficeCountry:s.head_office?.address?.country,headOfficeState:s.head_office?.address?.state,
     defaultTaxCode:s.defaults?.tax_code,defaultTaxBehavior:s.defaults?.tax_behavior,
     missingFields:Array.isArray(s.status_details?.pending?.missing_fields)?s.status_details.pending.missing_fields:[]},
    registrations:{...permission(registrations),complete:registrations.ok&&registrations.data.has_more===false,
     active:entries.map((r:any)=>({country:r.country,status:r.status,livemode:r.livemode,
      state:r.country==='US'?r.country_options?.us?.state:undefined,
      type:r.country==='US'?r.country_options?.us?.type:undefined,activeFrom:r.active_from,expiresAt:r.expires_at}))}},
    settings.ok&&registrations.ok?200:502);
  }
  if(body.action==='inspect'){
   const [account,hooks,sessions]=await Promise.all([api('account'),api('webhook_endpoints?limit=100'),api('checkout/sessions?limit=1')]);
   return json({ok:true,mode:'live',account:{...permission(account),chargesEnabled:account.data.charges_enabled,
    payoutsEnabled:account.data.payouts_enabled,country:account.data.country,
    currentlyDueCount:Array.isArray(account.data.requirements?.currently_due)?account.data.requirements.currently_due.length:undefined},
    checkoutRead:permission(sessions),webhookRead:permission(hooks),
    matchingWebhooks:(Array.isArray(hooks.data.data)?hooks.data.data:[]).filter((h:any)=>h.url===webhookUrl)
     .map((h:any)=>({id:h.id,status:h.status,livemode:h.livemode,apiVersion:h.api_version,enabledEvents:h.enabled_events}))});
  }
  if(body.action==='probe-checkout'){
   const rate=oneItemUsAirParcel('P1-S3','US','air',1)!;
   const form=new URLSearchParams({mode:'payment',success_url:origin+'/?technical_check=complete',cancel_url:origin+'/?technical_check=cancel',
    client_reference_id:'ME-LAUNCH-CHECK-NOT-AN-ORDER','metadata[purpose]':'MING_EAGLE_LAUNCH_PROBE_NO_PAYMENT',
    'line_items[0][price_data][currency]':'usd','line_items[0][price_data][unit_amount]':String(Math.round(rate.totalBeforeTaxesUSD*100)),
    'line_items[0][price_data][product_data][name]':'Technical checkout verification — do not pay','line_items[0][quantity]':'1'});
   const created=await api('checkout/sessions','POST',form,'mingeagle-live-launch-probe-20261014');
   if(!created.ok)return json({...permission(created),stage:'create'},502);
   const s=created.data;
   if(s.livemode!==true||!/^cs_live_[A-Za-z0-9]+$/.test(s.id)||s.amount_total!==2140||s.currency!=='usd')
    return json({ok:false,error:'Live session reconciliation failed.'},502);
   let ended=s.status==='expired'?created:await api('checkout/sessions/'+s.id+'/expire','POST',new URLSearchParams());
   if(!ended.ok)ended=await api('checkout/sessions/'+s.id);
   // Never expose the payable URL. A probe is complete only after expiration.
   const eventList=await api('events?type=checkout.session.expired&limit=20');
   const observed=(eventList.data.data||[]).find((e:any)=>e.livemode===true&&e.data?.object?.id===s.id);
   return json({ok:ended.ok&&ended.data.status==='expired',mode:'live',checkoutWrite:permission(created),
    providerEventId:observed?.id,eventRead:permission(eventList),
    sessionId:s.id,sessionStatus:ended.data.status,expiration:permission(ended),totalUSD:21.4},ended.ok?200:502);
  }
  if(body.action==='setup-webhook'){
   const form=new URLSearchParams({url:webhookUrl,api_version:STRIPE_API_VERSION,
    description:'MING EAGLE verified live order reconciliation','metadata[source]':'MING_EAGLE_LAUNCH_20261014'});
   events.forEach((e,i)=>form.set('enabled_events['+i+']',e));
   const r=await api('webhook_endpoints','POST',form,'mingeagle-live-webhook-20261014');
   if(!r.ok)return json(permission(r),502);
   const h=r.data;
   if(h.livemode!==true||h.url!==webhookUrl||h.status!=='enabled'||!/^we_[A-Za-z0-9]+$/.test(h.id)||!h.secret?.startsWith('whsec_'))
    return json({ok:false,error:'Live webhook reconciliation failed.'},502);
   // Newly created signing secret goes only to this authenticated configuration
   // client for encrypted storage. Never log it, an API key, or account details.
   return json({ok:true,mode:'live',endpointId:h.id,signingSecret:h.secret,enabledEvents:h.enabled_events});
  }
  if(body.action==='disable-previous-webhook'){
   if(!/^we_[A-Za-z0-9]+$/.test(body.endpointId||'')||!env.STRIPE_LAUNCH_WEBHOOK_ID||body.endpointId===env.STRIPE_LAUNCH_WEBHOOK_ID)
    return json({ok:false,error:'A previous endpoint is required.'},409);
   const [previous,current]=await Promise.all([api('webhook_endpoints/'+body.endpointId),api('webhook_endpoints/'+env.STRIPE_LAUNCH_WEBHOOK_ID)]);
   if(!previous.ok||!current.ok||previous.data.livemode!==true||current.data.livemode!==true||
    previous.data.url!==webhookUrl||current.data.url!==webhookUrl||current.data.status!=='enabled')
    return json({ok:false,error:'Endpoint ownership check failed.'},409);
   const disabled=await api('webhook_endpoints/'+body.endpointId,'POST',new URLSearchParams({disabled:'true'}));
   return json({ok:disabled.ok&&disabled.data.status==='disabled',mode:'live',endpointId:body.endpointId,status:disabled.data.status},disabled.ok?200:502);
  }
  return json({ok:false,error:'Unsupported action.'},400);
 }catch{return json({ok:false,error:'Launch check temporarily unavailable.'},503)}
};
