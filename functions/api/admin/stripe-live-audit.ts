// Owner-authenticated, strictly read-only live Stripe provider reconciliation.
// /api/admin/_middleware.ts enforces ADMIN_ACCESS_KEY for this route.
// Never reveal customer data, event/session IDs, secrets or unverified tax opinions.
import {stripeApi,stripeCheckoutReadiness,type StripeEnv} from '../../_shared/stripe';
interface Env extends StripeEnv {MINGEAGLE_DB?:D1Database}
type ProviderEvent={type?:string;pending_webhooks?:number};
type StripeList<T>={data?:T[];has_more?:boolean};
type TaxRegistration={country?:string;status?:string;livemode?:boolean;
 country_options?:{us?:{state?:string;type?:string}}};
const reply=(body:Record<string,unknown>,status=200)=>Response.json(body,{status,headers:{
 'cache-control':'private, no-store','x-content-type-options':'nosniff',
 'referrer-policy':'no-referrer',
}});
const safeCount=(x:unknown):number|null=>Number.isSafeInteger(x)&&Number(x)>=0?Number(x):null;
export const onRequestGet:PagesFunction<Env>=async({env})=>{
 const configured=stripeCheckoutReadiness(env);
 if(configured.mode!=='live'||!configured.keyConfigured||!configured.webhookConfigured||!configured.checkoutRequested)
  return reply({ok:false,code:'LIVE_STRIPE_AUDIT_UNAVAILABLE',
   configuration:{mode:configured.mode,keyConfigured:configured.keyConfigured,
    webhookConfigured:configured.webhookConfigured,checkoutRequested:configured.checkoutRequested},
   note:'Read-only provider inspection needs an enabled, correctly configured live Stripe integration.'},503);
 const at=new Date().toISOString();
 let ledger:Record<string,number|null|string>={status:'UNKNOWN',total:null,processed:null,unprocessed:null};
 if(env.MINGEAGLE_DB){
  try{
   const row=await env.MINGEAGLE_DB.prepare(
    "SELECT COUNT(*) AS total, "+
    "COALESCE(SUM(CASE WHEN processed_at IS NOT NULL THEN 1 ELSE 0 END),0) AS processed, "+
    "COALESCE(SUM(CASE WHEN processed_at IS NULL THEN 1 ELSE 0 END),0) AS unprocessed "+
    "FROM payment_webhook_events WHERE provider='STRIPE'").first<{total:number;processed:number;unprocessed:number}>();
   if(row)ledger={status:'VERIFIED_LOCAL_SNAPSHOT',total:safeCount(row.total),
    processed:safeCount(row.processed),unprocessed:safeCount(row.unprocessed)};
  }catch{/* Database or old schema unavailable: unknown, not healthy. */}
 }
 const [eventsResponse,taxResponse]=await Promise.allSettled([
  stripeApi(env,'events?delivery_success=false&limit=100'),
  stripeApi(env,'tax/registrations?status=active&limit=100')
 ]);
 let deliveries:Record<string,unknown>={status:'UNKNOWN',pendingAtLeast:null,pendingExpiredAtLeast:null,
  hasMore:null,notice:'Only events visible to this Stripe account and endpoint selection are included.'};
 if(eventsResponse.status==='fulfilled'&&eventsResponse.value.ok){
  try{
   const page=await eventsResponse.value.json() as StripeList<ProviderEvent>;
   if(Array.isArray(page.data)&&typeof page.has_more==='boolean'&&page.data.length<=100){
    const pending=page.data.filter(e=>Number.isSafeInteger(e?.pending_webhooks)&&Number(e.pending_webhooks)>0);
    deliveries={status:'VERIFIED_STRIPE_SNAPSHOT',pendingAtLeast:pending.length,
     pendingExpiredAtLeast:pending.filter(e=>e.type==='checkout.session.expired').length,
     hasMore:page.has_more,notice:page.has_more
      ?'Partial list: at least these pending event deliveries are shown; more pages exist.'
      :'Snapshot of events with delivery_success=false. Pending does not prove a customer order was affected.'};
   }
  }catch{/* Malformed provider response is unknown, never a clean bill of health. */}
 }
 let registrations:Record<string,unknown>={status:'UNKNOWN',activeUsStates:null,activeUsCount:null,hasMore:null};
 if(taxResponse.status==='fulfilled'&&taxResponse.value.ok){
  try{
   const page=await taxResponse.value.json() as StripeList<TaxRegistration>;
   if(Array.isArray(page.data)&&typeof page.has_more==='boolean'&&page.data.length<=100){
    const states=[...new Set(page.data.filter(x=>x?.country==='US'&&x.status==='active'&&x.livemode===true&&
      x.country_options?.us?.type==='state_sales_tax'&&/^[A-Z]{2}$/.test(x.country_options.us.state||''))
      .map(x=>String(x.country_options!.us!.state)))].sort();
    registrations={status:'VERIFIED_STRIPE_SNAPSHOT',activeUsStates:states,activeUsCount:states.length,
     hasMore:page.has_more};
   }
  }catch{/* Return unknown when provider tax details cannot be verified. */}
 }
 const resultsVerified=deliveries.status==='VERIFIED_STRIPE_SNAPSHOT'&&registrations.status==='VERIFIED_STRIPE_SNAPSHOT';
 return reply({ok:true,checkedAtUTC:at,scope:'ADMIN_ONLY_LIVE_READ_ONLY',
  provider:{liveMode:true,events:deliveries,activeTaxRegistrations:registrations},
  localWebhookLedger:ledger,
  providerDataVerified:resultsVerified,
  warnings:[
   'Stripe webhook ledger and undelivered provider events are different evidence sources.',
   'An already deployed webhook fix does not by itself clear pending Stripe deliveries.',
   'Stripe Tax registration data is a merchant registration inventory, NOT a legal determination of which states require collection.',
   'Nationwide Stripe charge capability is not proof of an approved order-specific tax basis or a reconciled wholesale payment.'
  ]});
};
