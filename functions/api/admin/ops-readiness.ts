import {stripeCheckoutReadiness,type StripeEnv} from '../../_shared/stripe';
// Authenticated production readiness: booleans and aggregate counts only.
// Never returns API keys, supplier prices, customer data, or guessed business metrics.
interface Env extends StripeEnv {MINGEAGLE_DB?:D1Database;TURNSTILE_SITE_KEY?:string;TURNSTILE_SECRET_KEY?:string;TURNSTILE_ENABLED?:string;STRIPE_RETAIL_ONLY_ENABLED?:string;STRIPE_B2B_CHECKOUT_ENABLED?:string;STRIPE_B2B_TAX_POLICY_APPROVED?:string;STRIPE_B2B_APPROVED_US_STATES?:string;STRIPE_TAX_POLICY_APPROVED?:string}
const json=(value:Record<string,unknown>,status=200)=>Response.json(value,{status,headers:{'cache-control':'private, no-store'}});
type ObservedDateStatus='SCHEMA_MISSING'|'NO_VERIFIED_DATA'|'LATEST_COMPLETED_UTC_DAY'|'OLDER_OBSERVED_DATE'|'INVALID_OBSERVED_DATE';
function utcCoverage(date:string|null|undefined,hasSchema:boolean,days:number|null):{status:ObservedDateStatus;daysBehind:number|null}{
 if(!hasSchema)return {status:'SCHEMA_MISSING',daysBehind:null};
 if(days===0||!date)return {status:'NO_VERIFIED_DATA',daysBehind:null};
 if(!/^20\d\d-\d\d-\d\d$/.test(date))return {status:'INVALID_OBSERVED_DATE',daysBehind:null};
 const parsed=Date.parse(date+'T00:00:00Z');
 if(!Number.isFinite(parsed)||new Date(parsed).toISOString().slice(0,10)!==date)
  return {status:'INVALID_OBSERVED_DATE',daysBehind:null};
 const today=new Date(),startOfToday=Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate());
 const behind=Math.round((startOfToday-parsed)/86400000);
 if(behind<1)return {status:'INVALID_OBSERVED_DATE',daysBehind:behind};
 return {status:behind===1?'LATEST_COMPLETED_UTC_DAY':'OLDER_OBSERVED_DATE',daysBehind:behind};
}
export const onRequestGet:PagesFunction<Env>=async({env})=>{
 const db=env.MINGEAGLE_DB;if(!db)return json({ok:false,error:'Production database unavailable'},503);
 try{
  const found=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('web_analytics_daily','gsc_search_daily','supplier_purchase_terms','shipping_rates','shipping_packaging')").all<{name:string}>();
  const names=new Set((found.results||[]).map(x=>x.name));
  const get=async<T>(name:string,sql:string)=>names.has(name)?await db.prepare(sql).first<T>():null;
  const [rum,gsc,cost,freight,packages]=await Promise.all([
   get<{days:number;latest:string|null;lastFetchedAt:string|null;partialInitialDay:number}>('web_analytics_daily',"SELECT COUNT(*) AS days,MAX(date_utc) AS latest,MAX(fetched_at) AS lastFetchedAt,COALESCE(SUM(CASE WHEN date_utc='2026-10-12' THEN 1 ELSE 0 END),0) AS partialInitialDay FROM web_analytics_daily"),
   get<{days:number;latest:string|null;lastFetchedAt:string|null}>('gsc_search_daily','SELECT COUNT(*) AS days,MAX(date_pacific) AS latest,MAX(fetched_at) AS lastFetchedAt FROM gsc_search_daily'),
   get<{total:number;approved:number}>('supplier_purchase_terms',"SELECT COUNT(*) AS total,COALESCE(SUM(CASE WHEN status='APPROVED' THEN 1 ELSE 0 END),0) AS approved FROM supplier_purchase_terms"),
   get<{total:number;active:number}>('shipping_rates','SELECT COUNT(*) AS total,COALESCE(SUM(CASE WHEN active=1 THEN 1 ELSE 0 END),0) AS active FROM shipping_rates'),
   get<{total:number}>('shipping_packaging','SELECT COUNT(*) AS total FROM shipping_packaging'),
  ]);
  // Expose only destination/method/minimum, never negotiated freight prices.
  // A destination without an active route requires an individual shipping quote.
  const shippingRoutes=names.has('shipping_rates')
   ?await db.prepare("SELECT country,method,min_units FROM shipping_rates WHERE active=1 ORDER BY country,method LIMIT 30")
     .all<{country:string;method:string;min_units:number}>()
   :null;
  const turnstileCredentials=Boolean(env.TURNSTILE_SITE_KEY&&env.TURNSTILE_SECRET_KEY);
  const turnstileRequested=env.TURNSTILE_ENABLED==='1'||env.TURNSTILE_ENABLED==='true';
  const payment=stripeCheckoutReadiness(env);
  return json({ok:true,checkedAt:new Date().toISOString(),
   analytics:{cloudflare:{schemaPresent:names.has('web_analytics_daily'),observedDates:rum?.days??null,latestDateUTC:rum?.latest||null,lastFetchedAtUTC:rum?.lastFetchedAt||null,partialInitialDayObserved:Number(rum?.partialInitialDay||0)>0,observedDateCoverage:utcCoverage(rum?.latest,names.has('web_analytics_daily'),rum?.days??null)},google:{schemaPresent:names.has('gsc_search_daily'),observedDates:gsc?.days??null,latestDatePacific:gsc?.latest||null,lastFetchedAtUTC:gsc?.lastFetchedAt||null}},
   procurement:{catalogPresent:names.has('supplier_purchase_terms'),supplierSources:cost?.total??null,approvedSourceCount:cost?.approved??null,
    shippingRates:freight?.total??null,activeShippingRates:freight?.active??null,packagingSkus:packages?.total??null,
    activeShippingRoutes:shippingRoutes?.results?.map(r=>({country:String(r.country),method:String(r.method),minimumUnits:Number(r.min_units)}))??null},
   security:{turnstileConfigured:turnstileCredentials,turnstileEnabled:turnstileRequested&&turnstileCredentials,turnstileMisconfigured:turnstileRequested&&!turnstileCredentials},
   payments:{checkoutRequested:payment.checkoutRequested,providerCredentialsConfigured:payment.keyConfigured,
    webhookConfigured:payment.webhookConfigured,environment:payment.mode,
    checkoutConfigurationReady:payment.checkoutReady,
    retailOnlyRestriction:env.STRIPE_RETAIL_ONLY_ENABLED==='true',
    b2bCheckoutRequested:env.STRIPE_B2B_CHECKOUT_ENABLED==='true',
    b2bTaxReviewed:env.STRIPE_B2B_TAX_POLICY_APPROVED==='true',
    b2bApprovedDestinationStates:String(env.STRIPE_B2B_APPROVED_US_STATES||'').split(',').map(x=>x.trim().toUpperCase()).filter(x=>/^[A-Z]{2}$/.test(x)),
    b2bConfigurationReady:payment.checkoutReady&&env.STRIPE_TAX_POLICY_APPROVED==='true'
      &&env.STRIPE_RETAIL_ONLY_ENABLED!=='true'&&env.STRIPE_B2B_CHECKOUT_ENABLED==='true'
      &&env.STRIPE_B2B_TAX_POLICY_APPROVED==='true'
      &&Boolean(String(env.STRIPE_B2B_APPROVED_US_STATES||'').trim())},
   caveats:['GSC search metrics use Pacific reporting dates; Cloudflare RUM uses UTC. Do not compute a raw conversion ratio.',
    'An empty supplier catalog means purchase cost and profit are not validated; prices cannot be inferred from public retail.',
    'Stripe configuration readiness does not prove successful card capture, webhook delivery or bank settlement.',
    'Turnstile configuration does not by itself verify each individual inquiry submission.',
    'The latest observed source date is not proof the scheduled sync ran. No newer visitor data might exist; absent UTC dates remain unknown, not zero.']});
 }catch{return json({ok:false,error:'Readiness checks unavailable'},503)}
};
